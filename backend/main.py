"""NEXUS 3D — Backend FastAPI + PyTorch.

Endpoints:
    GET  /v1/health            status + versão do torch + device
    POST /v1/direct            prompt pt-BR → vetor de 8 parâmetros de cena (MLP)
    POST /v1/sim/step          step N-body via kernel C++ (fallback NumPy)
    GET  /auth/github/login    inicia OAuth GitHub (redirect)
    GET  /auth/github/callback troca code→token, emite JWT

Sem `GITHUB_CLIENT_ID`, as rotas /auth/* retornam 501 e o frontend entra em
modo demo (design.md §7.6).
"""

from __future__ import annotations

import os
import time
import warnings
from typing import List, Optional

import httpx
import jwt
import numpy as np
import torch
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

from model import direct

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    JWT_SECRET = "nexus3d-dev-secret-nao-usar-em-producao"
    warnings.warn(
        "JWT_SECRET não definido — usando segredo de desenvolvimento. "
        "Defina a variável de ambiente JWT_SECRET em produção.",
        stacklevel=1,
    )

app = FastAPI(title="NEXUS 3D — Núcleo", version="1.4.0")

# CORS aberto para origens de desenvolvimento locais (Vite etc.).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:3000",
        FRONTEND_ORIGIN,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class DirectRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=140)


class SimStepRequest(BaseModel):
    positions: List[List[float]]
    velocities: List[List[float]]
    masses: List[float]
    dt: float = Field(0.01, gt=0)
    G: float = Field(1.0, gt=0)
    softening: float = Field(0.05, ge=0)


# ---------------------------------------------------------------------------
# /v1/*
# ---------------------------------------------------------------------------


@app.get("/v1/health")
def health() -> dict:
    return {
        "status": "ok",
        "torch": torch.__version__,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "ts": time.time(),
    }


@app.post("/v1/direct")
def v1_direct(req: DirectRequest) -> dict:
    t0 = time.perf_counter()
    result = direct(req.prompt)
    latency_ms = (time.perf_counter() - t0) * 1000.0
    return {
        "vector": result["vector"],
        "labels": result["labels"],
        "params": result["params"],
        "mode": "pytorch",
        "latency_ms": round(latency_ms, 2),
    }


@app.post("/v1/sim/step")
def v1_sim_step(req: SimStepRequest) -> dict:
    """Step N-body O(n²): usa o kernel C++ pybind11 quando compilado,
    senão cai num step NumPy vetorizado (mesma física, mais lento)."""
    pos = np.asarray(req.positions, dtype=np.float64)
    vel = np.asarray(req.velocities, dtype=np.float64)
    mass = np.asarray(req.masses, dtype=np.float64)

    if pos.ndim != 2 or pos.shape[1] != 3 or vel.shape != pos.shape:
        return JSONResponse(
            status_code=422,
            content={"error": "shape_invalido", "detail": "positions/velocities devem ser (N,3) iguais"},
        )
    if mass.shape != (pos.shape[0],):
        return JSONResponse(
            status_code=422,
            content={"error": "shape_invalido", "detail": "masses deve ser (N,)"},
        )

    t0 = time.perf_counter()
    mode = "numpy"
    try:
        import nbody_kernel  # type: ignore

        nbody_kernel.nbody_step(pos, vel, mass, req.dt, req.G, req.softening)
        mode = "kernel-cpp"
    except ImportError:
        _numpy_step(pos, vel, mass, req.dt, req.G, req.softening)
    ms = (time.perf_counter() - t0) * 1000.0

    return {
        "positions": pos.tolist(),
        "velocities": vel.tolist(),
        "mode": mode,
        "n": int(pos.shape[0]),
        "step_ms": round(ms, 3),
    }


def _numpy_step(
    pos: np.ndarray, vel: np.ndarray, mass: np.ndarray,
    dt: float, G: float, softening: float,
) -> None:
    """Referência NumPy do step O(n²) (espelha kernel/nbody.cpp)."""
    diff = pos[None, :, :] - pos[:, None, :]          # (N,N,3)
    dist2 = np.einsum("ijk,ijk->ij", diff, diff) + softening**2
    np.fill_diagonal(dist2, np.inf)
    inv_r3 = dist2 ** -1.5
    acc = G * (diff * (mass[None, :] * inv_r3)[:, :, None]).sum(axis=1)
    vel += acc * dt
    pos += vel * dt


# ---------------------------------------------------------------------------
# /auth/github/*  (OAuth → JWT)
# ---------------------------------------------------------------------------


@app.get("/auth/github/login")
def github_login() -> Response:
    if not GITHUB_CLIENT_ID:
        return JSONResponse(status_code=501, content={"error": "oauth_not_configured"})
    redirect_uri = os.getenv(
        "OAUTH_REDIRECT_URI",
        "http://localhost:8000/auth/github/callback",
    )
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        "&scope=read:user%20public_repo"
    )
    return RedirectResponse(url, status_code=302)


@app.get("/auth/github/callback")
async def github_callback(code: Optional[str] = Query(default=None)) -> Response:
    if not GITHUB_CLIENT_ID:
        return JSONResponse(status_code=501, content={"error": "oauth_not_configured"})
    if not code:
        return JSONResponse(status_code=400, content={"error": "missing_code"})

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
            },
        )
        token_data = token_resp.json()
        gh_token = token_data.get("access_token")
        if not gh_token:
            return JSONResponse(
                status_code=401,
                content={"error": "oauth_exchange_failed", "detail": token_data.get("error_description")},
            )
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {gh_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        login = user_resp.json().get("login", "github-user") if user_resp.status_code == 200 else "github-user"

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": login,
            "gh_token": gh_token,
            "scope": "read:user public_repo",
            "iat": now,
            "exp": now + 3600 * 24,
        },
        JWT_SECRET,
        algorithm="HS256",
    )
    # Devolve ao frontend via query param (o app guarda e usa no dashboard).
    return RedirectResponse(f"{FRONTEND_ORIGIN}/dashboard?token={token}", status_code=302)


# ---------------------------------------------------------------------------
# Dev entrypoint: `python main.py` ≡ uvicorn main:app --port 8000
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
