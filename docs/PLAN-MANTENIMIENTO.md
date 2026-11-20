# Plan de mantenimiento — NextGen Course (post-producción)

> Creado el 2026-11-20. Junta lo que ya estaba identificado (`docs/PENDIENTES-TECNICOS.md`,
> auditoría del 2026-11-19 en `ncourses.md`) con lo nuevo: dependencias de npm y manejo de versiones.
> Cada bloque está pensado como una tarea de 0.5 a 2 días. Marca `[x]` al terminar.

---

## Fase 0 — Urgente (esta semana)

### 0.1 Vulnerabilidades en dependencias del frontend
`npm audit --omit=dev` (2026-11-20): **15 vulnerabilidades: 2 críticas, 8 altas, 5 moderadas**, todas con
arreglo disponible. Las que importan en producción:

| Paquete | Severidad | Nota |
|---|---|---|
| `next` (≤ 16.4.4) | crítica | Es el servidor del front en prod. Subir al último 16.x. |
| `@sentry/nextjs` (≤ 10.76.1) | crítica | Subir a la versión parcheada. |
| `sharp`, `postcss`, `zod`, `nanoid`, `browserslist`, `fast-uri`… | alta | Casi todas transitivas; se resuelven con `npm audit fix`. |

- [x] Rama `fix/deps-seguridad`: `npm audit fix` desde la **raíz** (nunca dentro de `frontend/`, para no recrear un segundo lockfile).
- [ ] (build ✅ local y en Docker; lint con los 10 errores preexistentes; falta revisión a mano en UI) `npm run build` + `npm run lint` + revisar a mano login, ficha, aula, reproductor, panel admin/supervisor.
- [x] Volver a correr `npm audit --omit=dev` → 0 críticas/altas. (2026-11-20: 0 vulnerabilidades)

### 0.2 Imagen de Node fuera de soporte
`frontend/Dockerfile` usa `node:20-alpine`. **Node 20 dejó de recibir parches en abril de 2026.**
- [x] Cambiar las 3 etapas a `node:24-alpine` (LTS; es la que ya usas en local, v24.14).
- [x] Ajustar `engines.node` en `package.json` a `>=24`.

### 0.3 El Dockerfile instala con `npm install` en vez de `npm ci`
`npm install` puede resolver versiones distintas a las del lockfile en cada deploy, así que producción
podría recibir una versión nueva (o comprometida) que nunca se probó.
- [x] `RUN npm ci` (respeta exactamente `package-lock.json` y falla si no cuadra con `package.json`).

---

## Fase 1 — Proteger la cadena de dependencias (npm)

**Contexto:** el problema de npm no es la herramienta en sí. En 2025 hubo ataques a la cadena de
suministro: robaron cuentas de mantenedores y publicaron versiones maliciosas de paquetes populares
(p. ej. `chalk`/`debug` en septiembre y el gusano *Shai-Hulud*, que se propagaba con scripts
`postinstall`). Afectan igual a npm, pnpm, yarn o bun, porque todos descargan del mismo registro. Lo que
protege es **cómo** instalas.

| Medida | Qué evita | Esfuerzo |
|---|---|---|
| `npm ci` + lockfile versionado (0.3) | Que entren versiones no probadas | Bajo |
| `.npmrc` con `ignore-scripts=true` | Que un paquete ejecute código al instalarse (la vía de Shai-Hulud) | Bajo. Revisar si `sharp` u otro necesita su script (`npm rebuild sharp`) |
| Dependabot (o Renovate) con espera de 7 días antes de proponer una versión nueva | Instalar versiones recién publicadas; casi todos los paquetes maliciosos se detectan y retiran en horas o días | Bajo |
| `npm audit --omit=dev --audit-level=high` en CI | Desplegar con vulnerabilidades altas conocidas | Bajo |
| Quitar dependencias sin uso (`npx depcheck`) | Menos paquetes = menos superficie | Medio |

- [x] `.npmrc` en la raíz con `ignore-scripts=true` y `save-exact=true`.
- [x] `.github/dependabot.yml`: ecosistemas `npm` (raíz), `pip`/`uv` (backend), `docker` y `github-actions`; agrupar actualizaciones menores; `cooldown` de 7 días.
- [ ] Revisar `depcheck` y borrar paquetes que nadie importa.

**¿Cambiar a pnpm?** Opcional, no urgente. Ventajas: no ejecuta scripts de instalación salvo los que
autorices (`onlyBuiltDependencies`), tiene `minimumReleaseAge` para no instalar versiones recién
publicadas y es más estricto con dependencias no declaradas. Costo: migrar lockfile, Dockerfile, CI y
la costumbre del equipo. Recomendación: aplicar primero las medidas de la tabla (te dan la mayor parte
de la protección con npm) y evaluar pnpm después, en su propia rama.

Backend (Python, mismo riesgo): ya usa `uv.lock`. Revisar que el `Dockerfile` instale con
`uv sync --frozen` y agregar `pip-audit` (o `uv` + `osv-scanner`) al CI.
- [x] Imagen `python:3.10` → `python:3.12` (se dejó la imagen completa, no `-slim`, para no arriesgar libs nativas de psycopg/reportlab/pillow). También `uv` 0.5 → 0.11 y `uv sync --frozen` en ambos pasos.
- [x] Backend `pip-audit` (2026-11-20): 16 paquetes vulnerables → 0. Para subir FastAPI (Starlette con CVEs) hubo que pasar `sentry-sdk` 1.x → 2.x. **`sqlmodel` queda fijo `<0.0.25`**: 0.0.25+ (con SQLAlchemy 2.1) rechaza datetimes sin zona horaria y la app usa `datetime.utcnow()` en ~20 lugares. Para quitar el tope: migrar a `datetime.now(timezone.utc)`.

---

## Fase 2 — Manejo de versiones

**Situación actual:** tres versiones distintas y ninguna real.
- `package.json` raíz: `1.0.0` · `frontend/package.json`: `0.1.0` · `backend/pyproject.toml`: `0.1.0`
- Los sidebars tienen `v1.0.0` **escrito a mano** (`AdminSidebar.tsx:267`, `InstructorSidebar.tsx:153`, `SupervisorSidebar.tsx:110`).
- No hay tags de release en git (solo `archive/*`) ni CHANGELOG.

**Propuesta:**
1. **SemVer** (`MAYOR.MENOR.PARCHE`): `fix:` sube PARCHE, `feat:` sube MENOR, cambio incompatible sube MAYOR. Ya usas Conventional Commits, así que el número sale solo.
2. **Una sola fuente de verdad:** la versión del `package.json` raíz. Frontend y backend la leen de ahí (o de un archivo `VERSION`).
3. **Tags en git** `vX.Y.Z` sobre `main` en cada release.
4. **Automatizar con release-please** (GitHub Action): lee los commits convencionales, abre un PR "release vX.Y.Z" con el `CHANGELOG.md` generado; al hacer merge crea el tag y el release en GitHub. Tú decides cuándo liberar haciendo merge de ese PR.
5. **Mostrar la versión real:** en el build, `NEXT_PUBLIC_APP_VERSION` = versión + hash corto del commit (p. ej. `v1.2.0 · 52a1e4b`). Los sidebars lo leen de ahí. Backend: `GET /api/v1/utils/version` devuelve lo mismo, para saber qué está corriendo en prod.

**Numeración de arranque sugerida** (retroactiva, para que la historia tenga sentido):
| Tag | Commit | Qué fue |
|---|---|---|
| `v1.0.0` | primer deploy a prod (~2026-06-11, `9e4c3de`) | Lanzamiento |
| `v1.1.0` | `main` actual | Rondas post-deploy de noviembre |
| `v1.2.0` | merge de `fix/flujo-pagos-licencias` | Pagos/licencias, «procesos», aula en árbol |

- [ ] Confirmar la numeración y crear los tags retroactivos.
- [ ] Unificar las versiones de los 3 manifiestos.
- [ ] `release-please` + `CHANGELOG.md`.
- [ ] Inyectar versión + commit en el build (Dockerfile `ARG`, `deploy.yml` lo pasa) y quitar el `v1.0.0` escrito a mano.
- [ ] Endpoint de versión en el backend.

---

## Fase 3 — CI antes de desplegar

Hoy cualquier push a `main` despliega directo, sin pruebas.
- [x] Workflow `ci.yml` en cada PR (sin `lint` ni `ruff` todavía, y `pytest` informativo hasta arreglar la suite): `npm ci`, `lint`, `build`, `npm audit --audit-level=high`; backend: `ruff`, `pytest` (en BD aislada), `pip-audit`.
- [ ] Que `deploy.yml` solo corra si `ci.yml` pasó; protección de rama en `main` (requiere PR + CI verde).
- [ ] Arreglar la suite de pytest (PENDIENTES #1: 60 de 77 no pasan; causa principal: el login ya va por cookie).
- [ ] `conftest.py` se niega a correr si `POSTGRES_DB` no termina en `_test` (PENDIENTES #2: hoy borra **todos** los usuarios).
- [ ] Lint del frontend: 10 errores / 15 warnings preexistentes.

---

## Fase 4 — Infraestructura de producción

- [ ] **Elastic IP** para la EC2 (la IP cambia en cada reinicio y rompe DNS + `EC2_HOST`).
- [ ] **Respaldos automáticos de la BD** (cron con `pg_dump` → S3, retención 7/30 días) y una prueba de restauración.
- [ ] **Logs persistentes del backend** (se pierden en cada deploy): driver `awslogs` a CloudWatch o volumen con rotación.
- [ ] Revisar la t3.small (504 del 3-nov): métricas de CPU/memoria; considerar t3.medium o swap.
- [ ] Limpiar Secrets viejos de GitHub (PayPal/ECR/`AWS_DEPLOY_ROLE_ARN` del workflow anterior).
- [ ] Monitoreo de disponibilidad (UptimeRobot o similar) para `app.` y `api.nextgenia.lat`.

---

## Fase 5 — Pendientes funcionales ya identificados

Detalle en `docs/PENDIENTES-TECNICOS.md`.
- [ ] Reenviar activación a cuentas pendientes con token en claro (operativo, #3).
- [ ] Datos legales: razón social y correo de contacto reales (#7).
- [ ] Configurar PayPal en prod (`NEXT_PUBLIC_PAYPAL_CLIENT_ID`) o dejar documentado que el pago en línea queda apagado.
- [ ] Supervisor sin organización: mensaje amable en vez del 404 crudo (#4).
- [ ] Decidir qué pasa con las invitaciones al borrar un supervisor (#5).
- [ ] Bunny: URLs firmadas (#6) y revisar el webhook que probablemente siempre da 401.
- [ ] Cupos de licencia: todas en 0 (ilimitado) y sin pantalla para editarlos; decidir si se necesita.
- [ ] Limpieza: imports sin uso (#9), métodos del cliente sin uso (#10), docs desactualizadas (#11), passlib/bcrypt (#12).

---

## Orden sugerido

| Semana | Bloques |
|---|---|
| 1 | Fase 0 completa + Elastic IP + respaldos de BD |
| 2 | Fase 1 (npmrc, Dependabot) + Fase 2 (versionado, tags, release-please) |
| 3 | Fase 3 (CI, arreglar tests, conftest) |
| 4 | Resto de Fase 4 (logs, monitoreo) + Fase 5 según prioridad del negocio |
