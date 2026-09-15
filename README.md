# NEXUS◆3D

Aplicação web cinematográfica em 3D (pt-BR) que combina quatro experiências num
único app: **landing imersiva** coreografada pelo scroll, **simulação N-body**
em tempo real, **direção de cena por IA** (backend PyTorch real) e **dashboard
de dados GitHub ao vivo** com login OAuth. Três módulos, um motor — tudo neste
repositório, tudo executável.

## Arquitetura

```
┌──────────────────────────┐   REST /v1/* · JSON   ┌──────────────────────────┐
│  FRONTEND                │ ────────────────────▶ │  BACKEND                 │
│  React 19 · Vite · R3F   │                       │  FastAPI · PyTorch       │
│  src/scenes (hero · sim ·│   POST /v1/sim/step   │  MLP 384→256→128→8       │
│  ia · dashboard)         │ ────────────────────▶ │  OAuth GitHub · JWT      │
└──────────────────────────┘                       └───────────┬──────────────┘
          │                                                    │ pybind11 · FFI
          │ OAuth (redirect)                          ┌────────▼──────────────┐
          ▼                                           │  KERNEL               │
┌──────────────────────────┐                          │  C++20 · O(n²) N-body │
│  GITHUB API              │                          │  zero-copy NumPy      │
│  OAuth · REST (repos,    │                          └───────────────────────┘
│  commits · 60 req/h demo)│
└──────────────────────────┘
```

Sem o backend, o frontend detecta e entra em **MODO LOCAL** automaticamente
(fallback determinístico client-side) — nada quebra.

## Módulos

| Módulo | Stack | O que faz |
|---|---|---|
| `src/` (frontend) | React 19 · Vite · Tailwind · R3F · GSAP | UI HUD de engine: 4 páginas 3D (`/`, `/simulacao`, `/ia`, `/dashboard`, `/arquitetura`) |
| `backend/` | FastAPI · PyTorch · httpx · PyJWT | `POST /v1/direct`: prompt pt-BR → vetor de 8 parâmetros de cena via MLP real; OAuth GitHub → JWT; `POST /v1/sim/step` |
| `kernel/` | C++20 · pybind11 · CMake | Step N-body O(n²) com softening e merge conservativo, zero-copy em NumPy; ~17× mais rápido que NumPy vetorizado (medido) |

## Quickstart

### Frontend

```bash
npm install
npm run dev        # → http://localhost:5173
```

Build de produção: `npm run build` · preview: `npm run preview`.

### Backend (FastAPI + PyTorch)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

Teste: `curl localhost:8000/v1/health` · sanity do modelo: `python test_model.py`.
Detalhes em [`backend/README.md`](backend/README.md).

### Kernel (C++20 + pybind11)

```bash
cd kernel
pip install pybind11 numpy cmake
cmake -B build && cmake --build build
python3 benchmark.py   # mede C++ vs NumPy e imprime tabela
```

Último resultado medido (N=4096): **67.5 ms → C++ vs 1146.9 ms → NumPy, 17.0×**.
Detalhes em [`kernel/README.md`](kernel/README.md) e [`kernel/BENCHMARK.md`](kernel/BENCHMARK.md).

## Login GitHub (OAuth)

O dashboard funciona sem login via API pública (60 req/h, modo demo). Para dados
autenticados:

1. Em GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - **Homepage URL:** `http://localhost:5173`
   - **Authorization callback URL:** `http://localhost:8000/auth/github/callback`
2. Exporte as credenciais antes de subir o backend:

```bash
export GITHUB_CLIENT_ID=<client-id>
export GITHUB_CLIENT_SECRET=<client-secret>
export JWT_SECRET=<segredo-aleatório>   # HS256; sem ele, usa segredo dev + warning
```

3. Fluxo: botão `ENTRAR COM GITHUB` → `/auth/github/login` (302 → GitHub) →
   callback troca `code`→token e emite JWT → redirect para
   `http://localhost:5173/dashboard?token=<jwt>`.
4. Sem `GITHUB_CLIENT_ID`, o backend responde `501 {"error":"oauth_not_configured"}`
   e o frontend oferece o **modo demo** automaticamente.

## Stack

`React 19` · `Vite` · `Tailwind` · `three/R3F` · `GSAP` · `Framer Motion` ·
`FastAPI` · `PyTorch` · `C++20` · `pybind11` · `WebGL2`

## Licença

MIT © 2025 — use, modifique e distribua livremente, mantendo o aviso de copyright.
