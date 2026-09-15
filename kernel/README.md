# NEXUS 3D — `kernel/` (C++20 + pybind11)

Kernel de física N-body O(n²) em C++20 moderno (concepts, `std::span`), exposto
a Python via pybind11 com **zero-copy** sobre arrays NumPy (modificados
in-place). Integração kick-drift (Euler semi-implícita) com softening ε² e
**merge de colisão conservando momento linear**. O GIL é liberado durante o
laço de forças.

## Build

```bash
cd kernel
pip install pybind11 numpy cmake
cmake -B build
cmake --build build
```

Requisitos: CMake ≥ 3.20, compilador C++20 (g++ ≥ 10 ou clang ≥ 13), Python ≥ 3.9
com headers de desenvolvimento. OpenMP é detectado e habilitado automaticamente
quando disponível.

## Uso

```python
import sys; sys.path.insert(0, "build")
import numpy as np
import nbody_kernel

pos  = np.random.randn(4096, 3)          # float64 (N,3), contíguo
vel  = np.zeros((4096, 3))
mass = np.ones(4096)

merges = nbody_kernel.nbody_step(pos, vel, mass, dt=0.01, G=1.0, softening=0.05)
# pos/vel/mass atualizados IN-PLACE; `merges` = nº de colisões absorvidas
```

O backend FastAPI (`backend/main.py`, rota `POST /v1/sim/step`) importa este
módulo automaticamente quando compilado; sem ele, cai num step NumPy
equivalente (mesma física, ~17× mais lento).

## Benchmark

```bash
python3 benchmark.py            # compila + mede (20 steps/config)
```

Resultados **reais medidos neste sandbox** (x86_64, g++ 12.2, `-O3 -march=native`,
média de 20 steps — ver `BENCHMARK.md`):

| N | Kernel C++20 (ms/step) | NumPy (ms/step) | Speedup |
|---|---|---|---|
| 256 | 0.271 | 5.520 | **20.4×** |
| 1024 | 4.372 | 72.054 | **16.5×** |
| 4096 | 67.530 | 1146.874 | **17.0×** |

Corretude verificada: desvio máximo de posição vs NumPy após 5 steps = 4.4e-16.
O número `38×` citado na página Arquitetura do app refere-se à baseline
**JavaScript single-thread** no browser, não ao NumPy — contra NumPy vetorizado,
o speedup real fica em ~17–20×. Meça na sua máquina com `python3 benchmark.py`.

## Estrutura

```
kernel/
├── nbody.cpp        # step O(n²) C++20 + binding pybind11
├── CMakeLists.txt   # build (C++20, pybind11, NumPy, OpenMP opcional)
├── benchmark.py     # compila e mede vs NumPy (tabela markdown)
└── BENCHMARK.md     # últimos resultados medidos
```
