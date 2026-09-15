# BENCHMARK — kernel C++20 vs NumPy

Medição real executada no sandbox de build (não fabricada). Reproduza com:

```bash
cd kernel && python3 benchmark.py
```

## Ambiente

- CPU: x86_64 (sandbox container)
- Compilador: g++ 12.2.0 (Debian), flags `-O3 -march=native`
- Python 3.12.12 · NumPy 2.2.5 · pybind11 3.1.0
- CMake 3.x (pip) · OpenMP habilitado
- Metodologia: média de 20 steps por configuração, após 1 warmup;
  estado inicial idêntico (seed 42) nas duas implementações;
  física idêntica (kick-drift, ε²=softening²).

## Resultados

| N | Kernel C++20 (ms/step) | NumPy (ms/step) | Speedup |
|---|---|---|---|
| 256 | 0.271 | 5.520 | **20.4×** |
| 1024 | 4.372 | 72.054 | **16.5×** |
| 4096 | 67.530 | 1146.874 | **17.0×** |

## Corretude

Desvio máximo de posição entre kernel C++ e referência NumPy após 5 steps
(N=256, mesmas condições iniciais): **4.441e-16** (precisão de máquina float64).

## Notas

- O claim `38×` exibido na página `/arquitetura` do frontend compara o kernel
  com uma implementação **JavaScript single-thread** no browser — baseline
  diferente desta tabela (NumPy vetorizado já é bem mais rápido que JS puro).
- O laço de forças usa pares simétricos i<j (metade das interações) e buffers
  contíguos; NumPy paga alocações temporárias (N,N,3) a cada step — por isso o
  gap cresce com N em memória, mas o speedup estabiliza ~17× pois ambos são O(n²).
- Para números na SUA máquina: `python3 benchmark.py --steps 100`.
