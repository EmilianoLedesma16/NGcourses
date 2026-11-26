# Pendientes técnicos — NextGen Course

> Generado el 2026-11-19 durante la revisión de regresión de la rama `feat/mejoras-post-deploy`.
> Todo lo listado aquí **ya existía antes** de los cambios de esa rama (se comprobó corriendo la
> misma suite contra el último commit y contra el código nuevo: resultados idénticos).
> Ordenado por prioridad. Marca cada punto cuando se resuelva.

---

## 🔴 Alta

### 1. La suite de tests del backend está rota (60 de 77 no pasan)
Resultado actual: **12 failed, 15 passed, 48 errors**. No es por un bug de la app sino porque los
tests se quedaron atrás de cambios previos. Causas, agrupadas:

| Causa | Tests afectados | Arreglo sugerido |
|---|---|---|
| **El login ya no devuelve `access_token` en el JSON** (ahora va en cookie HttpOnly). Los helpers `tests/utils/utils.py::get_superuser_token_headers` y `tests/utils/user.py::authentication_token_from_email` hacen `r.json()["access_token"]` → `KeyError`. | 48 errores en `test_users`, `test_items`, `test_login`, `test_cursos::TestUploadCover`, `test_inscripciones` | Que los helpers lean la cookie `access_token` de la respuesta (`r.cookies`) o que el `TestClient` conserve las cookies, y armar los headers desde ahí. |
| **Rate limit en el login durante los tests** (`assert 429 == 200`). El `limiter` sigue activo en pruebas. | `test_login::test_get_access_token`, `test_get_access_token_incorrect_password` | Desactivar el limiter cuando `ENVIRONMENT=test` o en un fixture (`limiter.enabled = False`). |
| **Tests de cursos globales desactualizados** (esperan p. ej. `201` en `PUT /subcursos`, que devuelve `200`). | 6 en `test_cursos_globales.py` | Actualizar los códigos/expectativas al contrato actual. |
| **`crud/test_user.py::test_update_user`** falla con error de validación de pydantic: hace `UserUpdate(password=..., is_superuser=True)`, pero `UserUpdate` tiene `extra="forbid"` y ya no acepta `is_superuser` (se quitó a propósito contra asignación masiva). | 1 | Quitar `is_superuser=True` del `UserUpdate` del test. |
| Otros que dependen del token (`test_reset_password`, `test_delete_user_me`, `test_get_existing_user_current_user`). | 3 | Se resuelven con el primer punto. |

### 2. ⚠️ `tests/conftest.py` borra TODOS los usuarios al terminar
El fixture `db` ejecuta `delete(User)` al final de la sesión de pytest. Si alguien corre `pytest`
contra la base local (o peor, la de producción) **pierde todos los usuarios** (si no lo frena una
FK). Además los tests dejan usuarios aleatorios.

**Arreglo:** que los tests usen SIEMPRE una base propia. Mientras tanto, correrlos así:
```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ng_test;"'
docker compose exec -T -e POSTGRES_DB=ng_test backend sh -c "alembic upgrade head && pytest"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE ng_test;"'
```
Ideal: que `conftest.py` se niegue a correr si `POSTGRES_DB` no termina en `_test`.

### 3. Cuentas pendientes de activación creadas con token en claro (prod)
Viene del bug corregido el 2026-11-17: las cuentas creadas por invitación o al dar de alta una
organización antes de ese fix tienen el token guardado sin hash → "Token inválido" al activar.
**Acción operativa:** en `admin/usuarios`, usar **Reenviar activación** a los pendientes.

---

## 🟡 Media

### 4. Panel del supervisor sin organización muestra un 404 crudo
`_get_user_org` (`routes/supervisor.py`) lanza `404 "No perteneces a ninguna organización"` y el
front lo muestra tal cual. Mostrar un mensaje amable ("Tu cuenta aún no está ligada a una
empresa, contacta al administrador").

### 5. Borrar a un supervisor borra las invitaciones que envió
`crud.py` (borrado de usuario): `delete(InvitacionCurso).where(creado_por == user_id)`. Ahora que
las invitaciones se **comparten entre supervisores de la org**, si se borra a uno, los demás pierden
esas invitaciones pendientes. Decidir si reasignarlas a otro supervisor de la org o dejarlo así.

### 6. Videos de Bunny: la URL HLS es pública
Ya documentado (bug #3 de 2026-06-10): al dar de baja a un alumno, una pestaña que ya tenía la URL
puede seguir reproduciendo hasta recargar. Para revocación total: URLs firmadas/expirables (token
authentication de Bunny).

### 7. Datos legales por confirmar
Páginas `/terminos` y `/privacidad` usan la constante `LEGAL`: confirmar **razón social** y el correo
de contacto (`contacto@nextgenia.lat` es supuesto) con el área legal.

### 8. Empleados huérfanos (sin organización)
Alumnos creados como "empleados" antes de que la organización fuera obligatoria pueden seguir sin
org en la base. Si molestan, asignarlos desde `admin/organizaciones/[id]` → pestaña Miembros.

---

## 🟢 Baja (limpieza)

### 9. Imports sin uso en el backend (ruff F401, autocorregibles)
- `app/api/routes/inscripciones.py:21` — `Certificado`, `Inscripcion`
- `app/api/routes/invitaciones.py:3` — `secrets`
- `app/api/routes/progreso.py:14` — `ProgresoLeccion`
- `app/api/routes/webhooks.py:6` — `uuid`
- `app/services/certificado_pdf.py:10` — `white`

Arreglo: `uvx ruff check --select F401 --fix app`.

### 10. Métodos del cliente API que ninguna pantalla usa (`frontend/src/lib/api/client.ts`)
`asignar`, `remover` (etiquetas), `cortesia` (pagos), `createRecurso`, `deleteAvatar`,
`detalleLeccion`, `getLeccion`, `listRecursos`, `preguntasLeccion`, `verificar`, `votar`.
Revisar uno por uno: algunos pueden ser de funciones planeadas (cortesía, votos de reseñas); el
resto se puede borrar.

### 11. Documentación desactualizada
Mencionan endpoints/pantallas que ya no existen (`POST /users/empresa`, `POST /users/signup`,
`/admin/usuarios/crear` "Alta empresa"):
- ~~`docs/roles-y-permisos.md`~~ corregido en la limpieza del 2026-11-25
- `DOCUMENTACION.html` línea ~470
- `docs/historico/pre-deploy.md` (diagrama con `/users/signup`)
- `scripts/generate_security_report.py` (texto del reporte)

### 12. Ruido en logs: `passlib` no lee la versión de `bcrypt`
`(trapped) error reading bcrypt version` en cada arranque/test. Es inofensivo (passlib 1.7 + bcrypt
≥4.1). Opciones: fijar `bcrypt<4.1` o migrar el hash a `bcrypt` directo / `pwdlib`.

### 13. `uv run` no funciona en local con Python 3.14
`psycopg-binary==3.2.2` no tiene wheel para cp314. Afecta solo a correr herramientas en el host
(en Docker, Python 3.10, funciona). Subir `psycopg-binary` a una versión con wheel cp314 o usar
Python 3.12/3.13 en local.

### 14. Rol instructor
Congelado por decisión (feature flag `instructores` apagado). Retomar cuando se reactive.

---

## Ya corregido en esta rama (referencia)
- `crud.reenviar_invitacion` estaba **definida dos veces**; la que se usaba hacía referencia a
  `HTTPException` sin importarlo. Se dejó una sola.
- `POST /password-recovery-html-content` (debug de la plantilla) **siempre daba 500**
  (`generate_password_reset_token` no existía). Se eliminó.
- `POST /users/signup` (registro público que creaba cuentas activas sin invitación): eliminado.
