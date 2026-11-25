# NextGen Course

Plataforma de capacitación en línea para empresas: cursos en video, lectura y cuestionario,
organizados en procesos, con licencias por organización, avance del alumno, certificados y
paneles para administrador, supervisor e instructor.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, CSS Modules |
| Backend | FastAPI, SQLModel, Alembic, Python 3.12 |
| Base de datos | PostgreSQL 17 |
| Video | Bunny Stream |
| Pagos | PayPal |
| Infraestructura | Docker Compose, Traefik, AWS EC2, GitHub Actions |

## Estructura

```
NGcourses/
├── backend/        # API FastAPI (app/, tests/, scripts/)
├── frontend/       # Aplicación Next.js (src/app, src/components, src/lib)
├── docs/           # Documentación técnica
├── scripts/        # Utilidades: restaurar BD, QA de datos, pruebas
├── .github/        # CI, deploy y Dependabot
└── docker-compose*.yml
```

## Inicio rápido

```bash
cp .env.example .env
cp frontend/.env.local.example frontend/.env.local
docker compose up -d     # backend en :8000, PostgreSQL en :5432
npm install
npm run dev              # frontend en :3000
```

Detalle completo en [docs/desarrollo-local-y-pruebas.md](docs/desarrollo-local-y-pruebas.md).

## Documentación

Toda la documentación técnica está en [`docs/`](docs/README.md): arquitectura, backend,
frontend, modelo de datos, funcionalidades, seguridad, roles, deploy y deuda técnica.
