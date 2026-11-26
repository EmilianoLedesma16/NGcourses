# Desarrollo local y pruebas

## Requisitos

- Docker con Docker Compose v2.
- Node.js 24 o superior y npm 10 (el repo es un workspace de npm: el `package-lock.json`
  canónico está en la raíz).
- Python **3.12** y [uv](https://docs.astral.sh/uv/) si vas a correr el backend fuera de Docker
  (es la versión del Dockerfile y de CI). Con Python 3.14 los modelos no cargan
  (`PydanticUserError: Field 'id' requires a type annotation`); fuerza la versión con
  `UV_PYTHON=3.12 uv sync`.

## Primera vez

```bash
cp .env.example .env                              # variables del backend y de compose
cp frontend/.env.local.example frontend/.env.local
```

Genera `SECRET_KEY` (y `BUNNY_WEBHOOK_SECRET` si configuras Bunny) con
`python -c "import secrets; print(secrets.token_urlsafe(64))"`: el backend no arranca con
valores por defecto o cortos.

## Backend y base de datos con Docker

```bash
docker compose up -d          # usa docker-compose.yml + docker-compose.override.yml
```

| Servicio | Puerto local | Notas |
|---|---|---|
| `backend` | 8000 | con `--reload`; Swagger en `http://localhost:8000/docs` |
| `db` | 5432 | PostgreSQL 17 |
| `mailcatcher` | 1080 (web), 1025 (SMTP) | atrapa los correos en local |
| `proxy` | 80, 8090 | Traefik local |

`prestart` corre migraciones y crea el superusuario de `FIRST_SUPERUSER` en cada arranque.

Adminer (cliente web de la BD) es opcional:

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml up -d adminer
# http://localhost:8080
```

## Frontend

```bash
npm install          # en la raíz (workspace)
npm run dev          # = next dev dentro de frontend/, en http://localhost:3000
```

`BACKEND_URL` en `frontend/.env.local` apunta al backend (por defecto `http://localhost:8000`).
Todas las llamadas del navegador pasan por `/api` del propio Next, así que no hace falta
configurar CORS para desarrollar.

Notas:
- Next no permite dos `next dev` en la misma carpeta. Para comparar dos versiones a la vez,
  usa `git worktree` o un `next build && next start -p <puerto>` en otra copia.
- En Chrome, el modo de dispositivo "iPhone" cambia el user agent y el reproductor de Bunny
  intenta HLS nativo, que Chrome no reproduce. Para probar en móvil usa el modo
  **Responsive** con el ancho del teléfono.
- Las miniaturas de Bunny responden 403 si `localhost` no está en los dominios permitidos de
  la biblioteca (Bunny → Stream → Security).

## Backend sin Docker

```bash
cd backend
UV_PYTHON=3.12 uv sync
source .venv/bin/activate      # Windows: .venv\Scripts\activate
alembic upgrade head
uvicorn app.main:app --reload
```

Necesitas un PostgreSQL accesible con los datos de `.env` (puedes levantar solo
`docker compose up -d db`).

## Copia de producción en local

```bash
bash scripts/restore-db.sh <archivo.dump>   # dump hecho con pg_dump -Fc
```

**Borra y reemplaza** la BD local. Úsalo para reproducir errores con datos reales o para
probar una migración antes de desplegarla.

## Migraciones

Ver [Backend › Migraciones](backend.md#migraciones-alembic).

## Pruebas

### Backend (pytest)

```bash
docker compose exec backend bash scripts/tests-start.sh      # o: bash scripts/test.sh (levanta y tira el stack)
```

> ⚠️ `tests/conftest.py` borra **todos** los usuarios al terminar. Córrelas siempre contra una
> base de datos propia, nunca contra tu base local con datos ni contra producción. Procedimiento
> en [pendientes técnicos #2](pendientes-tecnicos.md).

La suite está parcialmente rota (contratos desactualizados); en CI corre como
**informativa** y no bloquea. Detalle en [pendientes técnicos #1](pendientes-tecnicos.md).

### Calidad del backend

```bash
cd backend
bash scripts/lint.sh      # mypy + ruff check + ruff format --check
bash scripts/format.sh    # ruff --fix + ruff format
```

### Frontend

```bash
cd frontend
npx tsc --noEmit -p .     # tipos
npm run lint              # ESLint (eslint-config-next)
npm run build             # lo mismo que corre CI
```

### QA de integridad de datos

`scripts/qa/qa_integridad.py` crea un escenario de prueba (prefijo "QA ", dominio
`@qa-integridad.com`), compara lo que responden las APIs contra la BD y lo limpia. Solo local:

```bash
docker compose cp scripts/qa/qa_integridad.py backend:/tmp/qa.py
docker compose exec -w /app backend python /tmp/qa.py seed
docker compose exec -w /app backend python /tmp/qa.py check
docker compose exec -w /app backend python /tmp/qa.py clean
```

## CI

`.github/workflows/ci.yml` corre en cada PR y en cada push a `main`:

- **Frontend**: `npm ci`, `npm audit` (dependencias de producción, nivel alto), `tsc` y `next build`.
- **Backend**: `uv sync --frozen`, `pip-audit`, migraciones contra un PostgreSQL de servicio,
  arranque de la app (importa todas las rutas) y pytest en modo informativo.

## Scripts del repositorio

| Script | Para qué |
|---|---|
| `scripts/restore-db.sh` | Restaurar un dump de producción en la BD local |
| `scripts/test.sh` | Levantar el stack, correr pytest y tirarlo |
| `scripts/qa/qa_integridad.py` | QA de integridad de datos (solo local) |
| `scripts/generate_security_report.py` | Regenera `docs/historico/reporte_seguridad.pdf` |
| `backend/scripts/prestart.sh` | Migraciones y datos iniciales (lo corre el contenedor `prestart`) |
| `backend/scripts/lint.sh`, `format.sh` | Calidad del backend |
| `backend/app/wipe_schema.py` | **Destructivo**: borra y recrea el esquema `public`. Solo para reiniciar una base sin datos que conservar |
