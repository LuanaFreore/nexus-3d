"""Sanity check do Diretor Neural — roda com `pytest` ou `python test_model.py`."""

import math

import torch

from model import DirectorMLP, direct, embed, get_model


def test_output_shape_and_finite() -> None:
    model = get_model()
    x = embed("tensão crescente antes da colisão")
    assert x.shape == (384,)
    with torch.no_grad():
        out = model(x)
    assert out.shape == (8,), f"shape inesperado: {out.shape}"
    assert torch.isfinite(out).all(), "saída contém NaN/Inf"


def test_determinism() -> None:
    a = direct("calma profunda")
    b = direct("calma profunda")
    assert a["vector"] == b["vector"], "mesmo prompt deve gerar o mesmo vetor"
    # Modelos recriados do zero também devem convergir para os mesmos pesos.
    m1, m2 = DirectorMLP(), DirectorMLP()
    for p1, p2 in zip(m1.parameters(), m2.parameters()):
        assert torch.equal(p1, p2)


def test_ranges() -> None:
    for prompt in ["euforia caótica", "melancolia espacial", "", "a" * 140]:
        r = direct(prompt)
        v = r["vector"]
        assert len(v) == 8
        assert all(math.isfinite(x) for x in v)
        assert -6.0 <= v[0] <= 6.0          # CAM_X
        assert 0.5 <= v[1] <= 6.0           # CAM_Y
        assert 3.0 <= v[2] <= 14.0          # CAM_Z
        assert 0.5 <= v[3] <= 4.0           # LUZ_INT
        assert 0.0 <= v[4] <= 1.0           # LUZ_HUE
        assert 0.0 <= v[5] <= 0.08          # NÉVOA
        assert 0.0 <= v[6] <= 2.0           # TURBULÊNCIA
        assert 0.0 <= v[7] <= 1.0           # TENSÃO
        cam, light, fog = r["params"]["camera"], r["params"]["light"], r["params"]["fog"]
        assert 35.0 <= cam["fov"] <= 75.0
        assert light["color"].startswith("#") and len(light["color"]) == 7
        assert 0.0 <= fog["density"] <= 0.08


if __name__ == "__main__":
    test_output_shape_and_finite()
    test_determinism()
    test_ranges()
    r = direct("tensão crescente antes da colisão")
    print("OK — vetor:", r["vector"])
    print("OK — params:", r["params"])
