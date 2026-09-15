"""Diretor Neural de Cena — NEXUS 3D.

MLP PyTorch 384→256→128→8 (GELU) que compõe parâmetros de cena 3D a partir
de um prompt em pt-BR. Totalmente determinístico:

- embedding: bag-of-chars com hashing FNV-1a (sem estado, sem vocabulário);
- pesos: inicializados com gerador fixo (seed 1337) — mesma saída em qualquer
  máquina para o mesmo prompt.

Vetor de saída (8 dims), contrato com o frontend `/ia`:

    [0] CAM_X        posição x da câmera        [-6, 6]
    [1] CAM_Y        posição y da câmera        [0.5, 6]
    [2] CAM_Z        posição z da câmera        [3, 14]
    [3] LUZ_INT      intensidade da luz         [0.5, 4.0]
    [4] LUZ_HUE      cor da luz 0=magenta→1=branco [0, 1]
    [5] NÉVOA        densidade da névoa exp2    [0, 0.08]
    [6] TURBULÊNCIA  amplitude curl noise       [0, 2]
    [7] TENSÃO       pulso do ator central      [0, 1]
"""

from __future__ import annotations

import math
from typing import List, Tuple

import torch
from torch import nn

SEED = 1337
EMBED_DIM = 384
OUTPUT_DIM = 8

_LABELS = [
    "CAM_X", "CAM_Y", "CAM_Z", "LUZ_INT",
    "LUZ_HUE", "NÉVOA", "TURBULÊNCIA", "TENSÃO",
]

# Faixas cinematográficas (min, max) — garantem que a cena nunca quebra.
_RANGES: List[Tuple[float, float]] = [
    (-6.0, 6.0),    # CAM_X
    (0.5, 6.0),     # CAM_Y
    (3.0, 14.0),    # CAM_Z
    (0.5, 4.0),     # LUZ_INT
    (0.0, 1.0),     # LUZ_HUE
    (0.0, 0.08),    # NÉVOA
    (0.0, 2.0),     # TURBULÊNCIA
    (0.0, 1.0),     # TENSÃO
]

# Cores do design system (design.md §2): acento magenta → núcleo branco.
_ACCENT = (0xF6, 0x28, 0x7D)
_CORE = (0xFF, 0xFF, 0xFF)


def _fnv1a(text: str) -> int:
    """FNV-1a 32-bit — determinístico e independente de plataforma."""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch) & 0xFF
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def embed(text: str, dim: int = EMBED_DIM) -> torch.Tensor:
    """Bag-of-chars (+bigramas) com hashing FNV-1a e truque do sinal.

    Mesmo texto → mesmo vetor, sempre. Normalizado em L2.
    """
    text = text.lower().strip()[:140]  # mesmo limite do input no frontend
    vec = torch.zeros(dim, dtype=torch.float32)
    tokens = [text[i:i + 1] for i in range(len(text))]
    tokens += [text[i:i + 2] for i in range(len(text) - 1)]
    for tok in tokens:
        h = _fnv1a(tok)
        idx = h % dim
        sign = 1.0 if (h >> 31) & 1 else -1.0
        vec[idx] += sign
    norm = torch.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    return vec


class DirectorMLP(nn.Module):
    """MLP 384→256→128→8 com GELU, pesos semeados deterministicamente."""

    def __init__(self, seed: int = SEED) -> None:
        super().__init__()
        gen = torch.Generator(device="cpu").manual_seed(seed)
        layers: List[nn.Module] = []
        dims = (EMBED_DIM, 256, 128, OUTPUT_DIM)
        for i in range(len(dims) - 1):
            lin = nn.Linear(dims[i], dims[i + 1])
            # Re-inicializa com o gerador fixo (não depende do RNG global).
            lin.weight = nn.Parameter(
                torch.randn(dims[i + 1], dims[i], generator=gen)
                * math.sqrt(2.0 / dims[i])
            )
            lin.bias = nn.Parameter(
                torch.empty(dims[i + 1]).uniform_(-0.05, 0.05, generator=gen)
            )
            layers.append(lin)
            if i < len(dims) - 2:
                layers.append(nn.GELU())
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


_MODEL: DirectorMLP | None = None


def get_model() -> DirectorMLP:
    """Singleton lazy do modelo (eval, CPU)."""
    global _MODEL
    if _MODEL is None:
        model = DirectorMLP()
        model.eval()
        _MODEL = model
    return _MODEL


def _clamp(value: float, lo: float, hi: float) -> float:
    return float(max(lo, min(hi, value)))


def _scale(raw: float, lo: float, hi: float) -> float:
    """sigmoid(raw) ∈ (0,1) → [lo, hi], com clamp final de segurança."""
    s = 1.0 / (1.0 + math.exp(-raw))
    return _clamp(lo + (hi - lo) * s, lo, hi)


def _lerp_color(a: Tuple[int, int, int], b: Tuple[int, int, int], t: float) -> str:
    """Interpola magenta→branco conforme LUZ_HUE e retorna #RRGGBB."""
    t = _clamp(t, 0.0, 1.0)
    r = round(a[0] + (b[0] - a[0]) * t)
    g = round(a[1] + (b[1] - a[1]) * t)
    bl = round(a[2] + (b[2] - a[2]) * t)
    return f"#{r:02X}{g:02X}{bl:02X}"


def direct(prompt: str) -> dict:
    """Executa a direção neural: prompt → vetor de 8 parâmetros + contrato de cena."""
    model = get_model()
    with torch.no_grad():
        raw = model(embed(prompt)).tolist()

    vector = [_scale(raw[i], *_RANGES[i]) for i in range(OUTPUT_DIM)]
    tensao = vector[7]

    return {
        "vector": [round(v, 6) for v in vector],
        "labels": list(_LABELS),
        "params": {
            "camera": {
                "x": round(vector[0], 4),
                "y": round(vector[1], 4),
                "z": round(vector[2], 4),
                # FOV derivado da tensão: tensão alta → enquadramento mais fechado.
                "fov": round(_clamp(75.0 - 40.0 * tensao, 35.0, 75.0), 2),
                "target": [0.0, 0.0, 0.0],
            },
            "light": {
                "intensity": round(vector[3], 4),
                "hue": round(vector[4], 4),
                "color": _lerp_color(_ACCENT, _CORE, vector[4]),
            },
            "fog": {
                "density": round(vector[5], 6),
            },
            "turbulence": round(vector[6], 4),
            "tension": round(tensao, 4),
        },
    }
