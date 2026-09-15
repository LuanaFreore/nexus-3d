#!/usr/bin/env python3
"""Benchmark NEXUS 3D — kernel C++20 (pybind11) vs NumPy.

Compila o kernel (cmake), roda o mesmo step N-body O(n²) nas duas
implementações para N = 256 / 1024 / 4096 e imprime uma tabela markdown
com os tempos REAIS medidos nesta máquina.

Uso:  python3 benchmark.py [--steps 20]
"""

from __future__ import annotations

import argparse
import platform
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"


def build() -> None:
    """Configura e compila via CMake (idempotente)."""
    print("== build ==")
    subprocess.run(["cmake", "-B", str(BUILD), "-S", str(HERE)], check=True)
    subprocess.run(["cmake", "--build", str(BUILD), "-j"], check=True)
    sys.path.insert(0, str(BUILD))
    import nbody_kernel  # noqa: F401

    print(f"kernel compilado: {next(BUILD.glob('nbody_kernel*.so')).name}")


def numpy_step(pos: np.ndarray, vel: np.ndarray, mass: np.ndarray,
               dt: float, G: float, softening: float) -> None:
    """Referência NumPy vetorizada (all-pairs) — mesma física do kernel."""
    diff = pos[None, :, :] - pos[:, None, :]              # (N,N,3)
    dist2 = np.einsum("ijk,ijk->ij", diff, diff) + softening ** 2
    np.fill_diagonal(dist2, np.inf)
    inv_r3 = dist2 ** -1.5
    acc = G * (diff * (mass[None, :] * inv_r3)[:, :, None]).sum(axis=1)
    vel += acc * dt
    pos += vel * dt


def make_state(n: int, seed: int = 42):
    rng = np.random.default_rng(seed)
    pos = rng.normal(0.0, 8.0, size=(n, 3))
    vel = rng.normal(0.0, 0.5, size=(n, 3))
    mass = rng.uniform(0.5, 2.0, size=n)
    return pos, vel, mass


def bench_one(fn, state, steps: int) -> float:
    pos, vel, mass = (a.copy() for a in state)
    fn(pos, vel, mass, 0.01, 1.0, 0.05)  # warmup
    t0 = time.perf_counter()
    for _ in range(steps):
        fn(pos, vel, mass, 0.01, 1.0, 0.05)
    return (time.perf_counter() - t0) / steps * 1000.0  # ms/step


def correctness(nbody_kernel) -> float:
    """Desvio máximo kernel vs NumPy após 5 steps no mesmo estado inicial."""
    state = make_state(256)
    p1, v1, m1 = (a.copy() for a in state)
    p2, v2, m2 = (a.copy() for a in state)
    for _ in range(5):
        numpy_step(p1, v1, m1, 0.01, 1.0, 0.05)
        nbody_kernel.nbody_step(p2, v2, m2, 0.01, 1.0, 0.05)
    return float(np.abs(p1 - p2).max())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", type=int, default=20, help="steps por medição")
    args = ap.parse_args()

    build()
    import nbody_kernel

    err = correctness(nbody_kernel)
    print(f"\ncorretude (N=256, 5 steps): desvio máx. posição = {err:.3e}")

    print(f"\nmáquina: {platform.processor() or platform.machine()} · "
          f"python {platform.python_version()} · g++ via cmake · -O3 -march=native")
    print(f"média de {args.steps} steps por configuração\n")

    rows = []
    for n in (256, 1024, 4096):
        state = make_state(n)
        t_cpp = bench_one(nbody_kernel.nbody_step, state, args.steps)
        t_np = bench_one(numpy_step, state, args.steps)
        rows.append((n, t_cpp, t_np, t_np / t_cpp))
        print(f"N={n:5d}  C++ {t_cpp:8.3f} ms   NumPy {t_np:8.3f} ms   speedup {t_np/t_cpp:6.2f}×")

    print("\n| N | Kernel C++20 (ms/step) | NumPy (ms/step) | Speedup |")
    print("|---|---|---|---|")
    for n, t_cpp, t_np, s in rows:
        print(f"| {n} | {t_cpp:.3f} | {t_np:.3f} | **{s:.1f}×** |")


if __name__ == "__main__":
    main()
