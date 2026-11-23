# Pendientes técnicos y roadmap de mantenimiento

Une los antiguos `PENDIENTES-TECNICOS.md` (revisión de regresión del 19/11/2026) y
`PLAN-MANTENIMIENTO.md` (20/11/2026), revisados contra el código al 23/11/2026. Marca `[x]` al terminar
y mueve lo resuelto a la sección final.

## 1. Deuda técnica priorizada

### Alta

**1. La suite de pruebas del backend está rota (60 de 77 no pasan).** Resultado al 19/11/2026: 12
fallan, 15 pasan, 48 con error. No es un bug de la aplicación: las pruebas quedaron atrás del código.

| Causa | Pruebas afectadas | Arreglo sugerido |
|---|---|---|
| El login ya no devuelve `access_token` en el JSON (va en cookie HttpOnly). `tests/utils/utils.py::get_superuser_token_headers` y `tests/utils/user.py::authentication_token_from_email` hacen `r.json()["access_token"]` → `KeyError`. | 48 errores en `test_users`, `test_items`, `test_login`, `test_cursos::TestUploadCover`, `test_inscripciones` | Leer la cookie de `r.cookies` o dejar que el `TestClient` conserve cookies. |
| El *rate limit* sigue activo en pruebas (`429 == 200`). | `test_login::test_get_access_token`, `..._incorrect_password` | `limiter.enabled = False` en un fixture o cuando `ENVIRONMENT=test`. |
| Pruebas de cursos globales desactualizadas (esperan `201` en `PUT /subcursos`, que devuelve `200`). | 6 en `test_cursos_globales.py` | Actualizar expectativas. |
| `crud/test_user.py::test_update_user` usa `UserUpdate(is_superuser=True)`, que ya no se acepta (`extra="forbid"`, contra asignación masiva). | 1 | Quitar `is_superuser` del test. |
| Dependen del token: `test_reset_password`, `test_delete_user_me`, `test_get_existing_user_current_user`. | 3 | Se resuelven con el primer punto. |

**2. `tests/conftest.py` borra TODOS los usuarios al terminar** (`delete(User)` en el fixture `db`).
Correr las pruebas solo contra una base aparte (capítulo 9.2). Arreglo definitivo: que `conftest.py` se
niegue a correr si `POSTGRES_DB` no termina en `_test`.

**3. Cuentas pendientes con token de activación sin hash (producción).** Cuentas creadas antes del
17/11/2026 (invitación o alta de organización) responden "Token inválido". Acción: Admin → Usuarios →
**Reenviar activación** a los pendientes.

### Media

4. **Supervisor sin organización ve un 404 crudo.** `supervisor._get_user_org` lanza
   `404 "No perteneces a ninguna organización"`. Mostrar un mensaje amable en el frontend.
5. **Borrar un supervisor borra sus invitaciones** (`crud.py`, borrado de usuario:
   `delete(InvitacionCurso).where(creado_por == user_id)`). Como las invitaciones se comparten entre
   supervisores de la organización, decidir si reasignarlas.
6. **La URL HLS de Bunny es pública.** Tras dar de baja a un alumno, una pestaña abierta puede seguir
   reproduciendo hasta recargar. Solución: *token authentication* de Bunny (URLs firmadas y con
   expiración).
7. **Datos legales por confirmar.** `/terminos` y `/privacidad` usan la constante `LEGAL`: confirmar razón
   social y correo de contacto (`contacto@nextgenia.lat` es un supuesto).
8. **Empleados sin organización** creados antes de que la organización fuera obligatoria. Asignarlos en
   `/admin/organizaciones/[id]` → Miembros.

### Baja (limpieza)

9. **Imports sin uso** (ruff F401): `routes/inscripciones.py` (`Certificado`, `Inscripcion`),
   `routes/invitaciones.py` (`secrets`), `routes/progreso.py` (`ProgresoLeccion`), `routes/webhooks.py`
   (`uuid`), `services/certificado_pdf.py` (`white`). Arreglo: `uvx ruff check --select F401 --fix app`.
10. **Métodos de `client.ts` sin pantalla que los use**: `asignar`, `remover` (etiquetas), `cortesia`,
    `createRecurso`, `deleteAvatar`, `detalleLeccion`, `getLeccion`, `listRecursos`, `preguntasLeccion`,
    `verificar`, `votar`. Algunos son de funciones planeadas; revisar uno por uno.
11. **Documentos viejos en la raíz** (`ROLES.md`, `PRE-DEPLOY.md`, `PRE-DEPLOY.html`,
    `NGcourse_Documentacion.pdf`, `README.md`) mencionan rutas que ya no existen (`POST /users/signup`,
    `POST /users/empresa`, "Alta empresa") y deuda ya resuelta (JWT en `localStorage`). La fuente vigente
    es esta carpeta `docs/`.
12. **Ruido de `passlib`** (`error reading bcrypt version`) en cada arranque. Inofensivo. Opciones: fijar
    `bcrypt<4.1` o migrar a `bcrypt` directo / `pwdlib`.
13. **`uv run` falla en local con Python 3.14** (`psycopg-binary==3.2.2` sin wheel cp314). Usar Python
    3.12/3.13 o subir `psycopg-binary`.
14. **Rol instructor congelado** (flag `instructores` apagado) por decisión de negocio.
15. **Docstrings desactualizados**: `quiz.enviar_quiz` dice "aprobado = TODAS correctas" pero el umbral
    real es 60 % (`crud.UMBRAL_APROBACION_QUIZ`).
16. **`logError` no envía a Sentry** en producción (`frontend/src/lib/logger.ts`, marcado `TECH DEBT`).
17. **Scripts obsoletos** en `scripts/`: `deploy.sh`, `build.sh`, `build-push.sh`, `deploy-frontend.sh`,
    `generate-client.sh`. Borrarlos o moverlos a `archive/`.
18. **`sqlmodel` fijo en `<0.0.25`**: la 0.0.25+ (SQLAlchemy 2.1) rechaza fechas sin zona horaria y el
    código usa `datetime.utcnow()` en ~20 lugares. Migrar a `datetime.now(timezone.utc)` para quitar el
    tope.

## 2. Plan de mantenimiento

### Fase 0. Urgente — hecho

- [x] `npm audit fix` desde la raíz: 0 vulnerabilidades de producción (20/11/2026).
- [x] Imagen de Node `node:20-alpine` → `node:24-alpine` y `engines.node >= 24`.
- [x] Dockerfile del frontend con `npm ci` en lugar de `npm install`.
- [ ] Revisión manual en UI tras la actualización (login, ficha, aula, reproductor, paneles).

### Fase 1. Cadena de dependencias

- [x] `.npmrc` en la raíz con `ignore-scripts=true` y `save-exact=true`.
- [x] Dependabot (npm, uv/pip, Docker, GitHub Actions) con espera de 7 días.
- [x] Backend: `python:3.12`, `uv 0.11`, `uv sync --frozen`; `pip-audit` de 16 paquetes vulnerables a 0
      (implicó `sentry-sdk` 1.x → 2.x).
- [ ] `npx depcheck` y borrar paquetes sin uso (p. ej. Tailwind si no se va a usar).
- [ ] Evaluar pnpm (opcional) en su propia rama.

### Fase 2. Versionado

Hoy hay tres versiones sin significado: `package.json` raíz `1.0.0`, `frontend/package.json` `0.1.0`,
`backend/pyproject.toml` `0.1.0`, y los sidebars muestran `v1.0.0` escrito a mano (`AdminSidebar.tsx:267`,
`InstructorSidebar.tsx:153`, `SupervisorSidebar.tsx:110`). No hay tags de release.

Propuesta: SemVer con Conventional Commits, una sola fuente de verdad (versión del `package.json` raíz),
tags `vX.Y.Z` en `main`, **release-please** para el `CHANGELOG.md`, y mostrar versión + commit
(`NEXT_PUBLIC_APP_VERSION`, `GET /api/v1/utils/version`).

| Tag sugerido | Commit | Qué fue |
|---|---|---|
| `v1.0.0` | `9e4c3de` (~11/06/2026) | Primer deploy a producción. |
| `v1.1.0` | `main` de noviembre | Rondas post-deploy. |
| `v1.2.0` | merge de `fix/flujo-pagos-licencias` | Pagos y licencias, procesos, aula en árbol. |

- [ ] Confirmar numeración y crear tags retroactivos.
- [ ] Unificar las versiones de los tres manifiestos.
- [ ] release-please + `CHANGELOG.md`.
- [ ] Inyectar versión y commit en el build; quitar el `v1.0.0` fijo.
- [ ] Endpoint de versión en el backend.

### Fase 3. CI antes de desplegar

- [x] `ci.yml` (audit, typecheck y build del frontend; `uv sync --frozen`, `pip-audit`, migraciones,
      arranque y `pytest` informativo del backend).
- [ ] Que `deploy.yml` solo corra si el CI pasó y proteger `main` (PR + CI verde).
- [ ] Arreglar la suite de pytest (deuda 1) y quitar `continue-on-error`.
- [ ] Guardia en `conftest.py` (deuda 2).
- [ ] Agregar `npm run lint` y `ruff` al CI (hoy hay 10 errores y 15 avisos de lint preexistentes).

### Fase 4. Infraestructura de producción

- [ ] **Elastic IP** para la EC2 (la IP cambia al reiniciar y rompe DNS y `EC2_HOST`).
- [ ] **Respaldos automáticos** de la BD (`pg_dump` → S3, retención 7/30 días) y del volumen `media_data`,
      con prueba de restauración.
- [ ] **Logs persistentes** (driver `awslogs` a CloudWatch o volumen con rotación).
- [ ] Revisar la t3.small (504 del 03/11/2026): métricas, swap o t3.medium.
- [ ] Borrar *secrets* viejos de GitHub (PayPal, ECR, `AWS_DEPLOY_ROLE_ARN`).
- [ ] Monitoreo de disponibilidad para `app.` y `api.nextgenia.lat`.

### Fase 5. Pendientes funcionales

- [ ] Reenviar activación a cuentas con token sin hash (deuda 3).
- [ ] Datos legales reales (deuda 7).
- [ ] PayPal en producción: pasar `NEXT_PUBLIC_PAYPAL_CLIENT_ID` como argumento de build en
      `docker-compose.prod.yml` y configurar `PAYPAL_*`, o dejar documentado que el pago en línea está
      apagado.
- [ ] Mensaje amable para supervisor sin organización (deuda 4).
- [ ] Decidir el destino de las invitaciones al borrar un supervisor (deuda 5).
- [ ] Bunny: URLs firmadas (deuda 6) y revisar que el webhook no responda siempre 401.
- [ ] Cupos de licencia: hoy todas en 0 (ilimitado) y sin pantalla para editarlos.
- [ ] Limpieza (deudas 9 a 18).

### Orden sugerido

| Semana | Bloques |
|---|---|
| 1 | Cierre de Fase 0, Elastic IP y respaldos. |
| 2 | Resto de Fase 1 y Fase 2 (versionado). |
| 3 | Fase 3 (CI obligatorio, pruebas, guardia de `conftest`). |
| 4 | Resto de Fase 4 y Fase 5 según prioridad del negocio. |

## 3. Ya resuelto (referencia)

- `crud.reenviar_invitacion` estaba definida dos veces; quedó una.
- Se eliminó `POST /password-recovery-html-content` (siempre daba 500).
- Se eliminó `POST /users/signup` (registro público que creaba cuentas activas sin invitación).
- JWT movido de `localStorage` a cookies HttpOnly con refresh rotativo, y *rate limiting* en autenticación.
