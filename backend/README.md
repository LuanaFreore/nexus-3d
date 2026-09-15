# NEXUS 3D — `backend/` (FastAPI + PyTorch)

Núcleo de direção neural de cena. Um MLP real em PyTorch (384→256→128→8, GELU)
compõe parâmetros cinematográficos — câmera, luz volumétrica, névoa e
turbulência — a partir de um prompt em pt-BR enviado pelo frontend (`/ia`).
Determinístico: mesmo prompt → mesma cena, em qualquer máquina.

## Como rodar

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000       # ou: python main.py
```

Sanity check do modelo (sem subir o servidor):

```bash
python test_model.py               # ou: pytest test_model.py -v
```

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `GITHUB_CLIENT_ID` | não | — | Client ID do GitHub OAuth App. Sem ela, `/auth/*` retorna `501 {"error":"oauth_not_configured"}` e o frontend cai em modo demo. |
| `GITHUB_CLIENT_SECRET` | não | — | Client Secret do OAuth App (necessário no callback real). |
| `JWT_SECRET` | não | segredo dev + warning | Segredo HS256 dos JWTs emitidos no callback. Defina em produção. |
| `FRONTEND_ORIGIN` | não | `http://localhost:5173` | Origem para onde o callback redireciona com `?token=`. |
| `OAUTH_REDIRECT_URI` | não | `http://localhost:8000/auth/github/callback` | Callback registrado no OAuth App. |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/v1/health` | status + versão do torch + device (`cpu`/`cuda`) |
| POST | `/v1/direct` | prompt → vetor de 8 parâmetros de cena |
| POST | `/v1/sim/step` | step N-body via kernel C++ (fallback NumPy) |
| GET | `/auth/github/login` | redirect para o GitHub OAuth |
| GET | `/auth/github/callback` | troca `code`→token, emite JWT, redireciona ao frontend |

## Exemplos (curl)

```bash
# health
curl -s http://localhost:8000/v1/health
# → {"status":"ok","torch":"2.8.0","device":"cpu","ts":1737500000.0}

# direção neural
curl -s -X POST http://localhost:8000/v1/direct \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"tensão crescente antes da colisão"}'
```

Resposta de `/v1/direct`:

```json
{
  "vector": [-0.32, 2.41, 8.05, 2.87, 0.18, 0.031, 1.42, 0.77],
  "labels": ["CAM_X","CAM_Y","CAM_Z","LUZ_INT","LUZ_HUE","NÉVOA","TURBULÊNCIA","TENSÃO"],
  "params": {
    "camera": {"x": -0.32, "y": 2.41, "z": 8.05, "fov": 44.2, "target": [0,0,0]},
    "light":  {"intensity": 2.87, "hue": 0.18, "color": "#F85098"},
    "fog":    {"density": 0.031},
    "turbulence": 1.42,
    "tension": 0.77
  },
  "mode": "pytorch",
  "latency_ms": 1.8
}
```

Os 8 valores são sempre clampados nas faixas cinematográficas (câmera nunca
sai do palco, névoa nunca satura o frame) — ver tabela no topo de `model.py`.

## Estrutura

```
backend/
├── main.py           # app FastAPI: /v1/* + /auth/github/*
├── model.py          # MLP + embedding hashing + seed determinístico
├── test_model.py     # sanity check (shape, finitude, ranges, determinismo)
└── requirements.txt
```
