# 8. Roles, casos de uso y flujos de punta a punta

Este capítulo une las piezas de los capítulos anteriores desde el punto de vista de **quién usa el sistema**.
Para cada rol se listan sus casos de uso, las pantallas que usa y los endpoints que se disparan. Sirve para
seguir un flujo completo en el código: de la página (`frontend/src/app/...`) al cliente
(`lib/api/client.ts`), al router (`backend/app/api/routes/...`) y a `crud.py`.

## 8.1 Roles

El rol vive en `user.rol` (enum `rolusuario`). Además existe la bandera `user.is_superuser`, que no es un
rol sino un **permiso total** que se suma al rol.

| Rol | Valor | Panel | Cómo se crea | Qué puede hacer |
|---|---|---|---|---|
| Alumno | `estudiante` | `/cursos` | Alta por admin, alta por supervisor (invitación) o canje de invitación | Ver catálogo, inscribirse o pagar, tomar cursos, quiz, reseñas, comentarios, certificados. |
| Instructor | `instructor` | `/instructor` | Alta por admin (solo si el flag `instructores` está encendido) | Crear y editar **sus** cursos, mandarlos a revisión, ver alumnos y resultados de quiz. |
| Supervisor | `supervisor` | `/supervisor` | Se crea junto con la organización o con `POST /organizaciones/{id}/supervisor` | Ver su organización, cursos licenciados (lectura completa), avance de su gente, invitar, pedir cursos. |
| Administrador | `administrador` | `/admin` | Alta por admin o `FIRST_SUPERUSER` | Todo el catálogo, usuarios, organizaciones, licencias, revisión de cursos, solicitudes, flags, cortesías. |
| Superusuario | cualquier rol + `is_superuser` | `/admin` | `FIRST_SUPERUSER` en `initial_data.py`, o otro superusuario | Igual que admin; además es el único que puede crear otros superusuarios y usar `/utils/test-email/`. |
| *(legacy)* | `usuario_control` | — | — | **Deprecado**. Sigue en el enum de Postgres pero no otorga permisos ni es asignable. |

Dentro de una organización existe un segundo rol, `usuarios_organizacion.rol_org`: `admin_org` (el
supervisor de la empresa) o `miembro` (empleado). Una persona puede pertenecer a varias organizaciones y
sus licencias se suman.

### Flag `instructores`

Tabla `feature_flags`, sembrada en `false` por la migración 3. Mientras está apagado:

- `POST /users/` rechaza crear instructores (400).
- `POST /login/access-token` rechaza el login de instructores que no sean superusuario (403).
- El frontend oculta "Instructores" en el menú del admin (`AdminSidebar.tsx` consulta `useFeatureFlags`).

Se enciende desde `/admin/configuracion` (`PATCH /feature-flags/instructores`).

La otra bandera, `multiples_supervisores`, controla si una organización admite más de un supervisor
(`admin_org`); apagada, `POST /organizaciones/{id}/supervisor` y la asignación de un segundo `admin_org`
se rechazan.

## 8.2 Ciclo de vida de una cuenta

```
           alta por admin / supervisor / invitación
                         │  (sin contraseña; token de activación 72 h por correo)
                         ▼
             ┌──────────────────────┐   reenviar-activacion / solicitar-reactivacion
             │ pendiente_activacion │◀──────────────────────────────┐
             └──────────┬───────────┘                               │
                        │ POST /users/activar (token + contraseña)  │ token vencido
                        ▼                                           │
                  ┌──────────┐ ─────────────────────────────────────┘
                  │  activo  │
                  └────┬─────┘
                       │ admin cambia estado
                       ▼
                ┌────────────┐
                │ suspendido │  (no puede iniciar sesión)
                └────────────┘
```

- Nunca se envía ni se muestra una contraseña. El usuario la define al activar.
- Al primer ingreso, si un alumno no tiene nombre completo, `ProfileSetupGate` le pide capturarlo (el
  certificado lo necesita).

## 8.3 Alumno

| Caso de uso | Pantalla | Endpoints |
|---|---|---|
| Iniciar sesión | `/` | `POST /login/access-token` → `GET /users/me` |
| Activar cuenta | `/activar?token=...` | `POST /users/activar` |
| Recuperar contraseña | `/forgot-password`, `/reset-password` | `POST /password-recovery`, `POST /reset-password/` |
| Ver catálogo | `/cursos` | `GET /cursos/`, `GET /inscripciones/me`, `GET /categorias/` |
| Ver ficha de curso | `/curso/[id]` | `GET /cursos/{id}`, `GET /progreso/curso/{id}`, `GET /calificaciones/cursos/{id}` |
| Inscribirse (gratis, licencia de su org o NEXTGEN) | `/curso/[id]` | `POST /inscripciones/` |
| Comprar un curso | `/curso/[id]` (`PayPalCheckout`) | `POST /pagos/crear-orden` → PayPal → `POST /pagos/confirmar` |
| Canjear invitación | `/invitacion?token=...` | `POST /invitaciones/canjear` (crea cuenta si no existe e inscribe) |
| Tomar lecciones | `/curso/[id]/videos` | `POST /progreso/` cada 10 s, `GET /cursos/recursos/{id}/download` |
| Responder quiz | `/curso/[id]/videos` (`QuizPlayer`) | `GET /quiz/lecciones/{id}/ultimo-intento`, `POST /quiz/lecciones/{id}/enviar` |
| Comentar una lección | `LessonComments` | `GET/POST /lecciones/{id}/comentarios`, `PUT/DELETE /comentarios/{id}/like` |
| Reseñar el curso (al terminarlo) | `CourseReviews` | `POST /calificaciones/cursos/{id}`, `POST /calificaciones/{id}/votar` |
| Ver avance | `/mis-cursos` | `GET /inscripciones/me` |
| Descargar certificado | `/certificados` | `GET /certificados/me`, `GET /certificados/vista-previa/{folio}`, `GET /certificados/descargar/{folio}` |
| Editar perfil | `/perfil` | `PATCH /users/me`, `PATCH /users/me/password`, `POST/DELETE /users/me/avatar`, `GET /pagos/mis-compras` |

### Flujo completo: de la invitación al certificado

```
1. Supervisor/Admin   POST /supervisor/invitaciones  (o /invitaciones/)  → correo con token (7 días)
2. Alumno             /invitacion?token=…  → POST /invitaciones/canjear
                        ├─ cuenta nueva: estudiante pendiente + correo de activación
                        ├─ se agrega a la organización de quien invitó
                        └─ crea/reactiva inscripción ACTIVA
3. Alumno             /activar → POST /users/activar → inicia sesión
4. Alumno             /curso/[id]/videos
                        ├─ video: POST /progreso/ (≥ 90 % = completada)
                        ├─ lectura: POST /progreso/ con 100 %
                        └─ quiz: POST /quiz/.../enviar (≥ 60 %, máx. 3 intentos)
5. Backend            crud.check_and_emit_certificate: todas las lecciones visibles completas
                        → inscripción FINALIZADA + certificado (folio) + PDF en media/certificados
6. Alumno             /certificados → descarga PDF; cualquiera verifica con /certificados/verificar/{folio}
```

## 8.4 Instructor

| Caso de uso | Pantalla | Endpoints |
|---|---|---|
| Ver sus cursos | `/instructor/cursos` | `GET /cursos/` (filtrado a los suyos) |
| Crear curso (asistente de 5 pasos) | `/instructor/cursos/crear` | `POST /cursos/`, `POST /cursos/{id}/cover`, `POST .../modulos`, `POST .../lecciones` |
| Subir video | Paso "Estructura" (`VideoUploadButton`) | `POST .../video-init` → TUS a Bunny → `GET .../video-status` |
| Armar quiz | `QuizBuilder` | `PATCH .../lecciones/{id}` (campo `contenido` JSON) |
| Subir recursos | Paso "Estructura" | `POST .../recursos/upload` o `POST .../recursos` (enlace) |
| Mandar a revisión | `/instructor/cursos/[id]/editar` | `PATCH /cursos/{id}` con `estado = revision` |
| Ver alumnos y resultados | `/instructor/alumnos`, `/instructor/cursos/[id]/estadisticas` | `GET /inscripciones/curso/{id}`, `GET /quiz/cursos/{id}/resultados` |
| Reiniciar intentos de un alumno | Estadísticas | `POST /quiz/lecciones/{id}/reiniciar-intentos` |

El instructor **no publica**: manda a revisión y el admin, desde `/admin/solicitudes`, puede **publicar**
(`publicado`), **solicitar cambios** (regresa a `borrador` con `notas_revision` obligatorias) o
**rechazar** (`rechazado`, el curso se conserva con el motivo).

## 8.5 Supervisor (empresa)

| Caso de uso | Pantalla | Endpoints |
|---|---|---|
| Ver su organización | `/supervisor/mi-organizacion` | `GET /supervisor/mi-organizacion` |
| Ver indicadores | `/supervisor` | `GET /supervisor/stats`, `GET /supervisor/dashboard` |
| Ver cursos licenciados (contenido completo, sin inscribirse) | `/supervisor/cursos`, `/curso/[id]` | `GET /supervisor/cursos`, `GET /cursos/{id}` |
| Ver a su gente y su avance | `/supervisor/usuarios` | `GET /supervisor/usuarios` |
| Quitar a alguien de la empresa | `/supervisor/usuarios` | `DELETE /supervisor/usuarios/{id}` |
| Invitar a un curso | `/supervisor/invitaciones` | `POST /supervisor/invitaciones`, reenviar, revocar |
| Pedir un curso nuevo | `/supervisor/solicitudes` | `POST /supervisor/solicitudes`, `GET /supervisor/solicitudes` |

Si el supervisor no tiene organización, sus endpoints responden 404 (caso heredado; el admin lo repara
desde `/admin/organizaciones` con "supervisores sin organización").

## 8.6 Administrador

| Caso de uso | Pantalla | Endpoints |
|---|---|---|
| Ver tablero | `/admin` | `GET /admin/stats` |
| Gestionar usuarios | `/admin/usuarios`, `/admin/usuarios/[id]/editar` | `GET/POST /users/`, `PATCH/DELETE /users/{id}`, `POST /users/{id}/reenviar-activacion` |
| Alumnos e inscripciones | `/admin/alumnos` | `GET /inscripciones/usuario/{id}`, `PATCH /inscripciones/{id}/cancelar`, `POST /pagos/admin/cortesia` |
| Crear y editar cursos | `/admin/cursos/crear`, `/admin/cursos/[id]/editar` | Igual que el instructor, sobre cualquier curso; puede publicar directo. |
| Cursos globales | `/admin/cursos/global/[id]` | `PUT /cursos/{id}/subcursos` |
| Vista previa | `/admin/cursos/[id]/preview` | `GET /cursos/{id}` (con respuestas del quiz) |
| Revisar cursos de instructores | `/admin/solicitudes` | `GET /cursos/?estado=revision`, `PATCH /cursos/{id}` |
| Empresas | `/admin/organizaciones`, `/admin/organizaciones/[id]` | `/organizaciones/*` (alta con supervisor, miembros, licencias) |
| Solicitudes de empresas | `/admin/solicitudes-empresas` | `GET /solicitudes`, `PATCH /solicitudes/{id}` |
| Invitaciones por curso | `/admin/cursos/[id]/invitaciones` | `/cursos/{id}/invitaciones/*` |
| Categorías y etiquetas | Paso "Info básica" del asistente | `/categorias/*`, `/etiquetas/*` |
| Banderas | `/admin/configuracion` | `GET /feature-flags`, `PATCH /feature-flags/{nombre}` |
| Certificado dañado | — | `POST /certificados/regenerar/{folio}` |

### Flujo completo: alta de una empresa

```
1. Admin   POST /organizaciones/ {nombre, ..., supervisor_email, supervisor_nombre}
             → valida que el correo del supervisor no exista (antes de crear nada)
             → organización + usuario supervisor (pendiente) con rol_org admin_org
             → correo de activación al supervisor
2. Admin   POST /organizaciones/{id}/licencias {curso_id, fechas, cupos}  (una por curso o curso global)
3. Supervisor activa su cuenta y entra a /supervisor
4. Supervisor POST /supervisor/invitaciones {curso_id, emails[]}
5. Empleados canjean, activan y toman el curso (flujo 8.3)
6. Supervisor y admin ven el avance en /supervisor y /admin (misma función resumen_avance)
```

### Flujo completo: publicar un curso

```
Instructor  crear (borrador) → módulos/lecciones/video/quiz → PATCH estado=revision
               └─ 409 si hay lecciones de video sin video o quiz incompletos
Admin       /admin/solicitudes → PATCH estado=publicado
                                 (o borrador + notas_revision = "solicitar cambios",
                                  o rechazado + notas_revision)
Alumno      el curso aparece en /cursos según marca, licencia o precio (capítulo 5, candado 1)
```

## 8.7 Matriz de permisos resumida

| Acción | Alumno | Instructor | Supervisor | Admin |
|---|:-:|:-:|:-:|:-:|
| Ver catálogo publicado | ✔ | solo los suyos | ✔ (licenciados y NEXTGEN) | ✔ todo |
| Ver contenido de un curso | con inscripción | sus cursos | con licencia de su org | ✔ |
| Inscribirse / pagar | ✔ | — | — | — |
| Crear / editar cursos | — | los suyos | — | ✔ |
| Publicar cursos | — | manda a revisión | — | ✔ |
| Ver respuestas del quiz | — | sus cursos | licenciados | ✔ |
| Invitar alumnos | — | — | cursos de su org | ✔ |
| Gestionar usuarios | — | — | quitar de su org | ✔ |
| Organizaciones y licencias | — | — | ver la suya | ✔ |
| Feature flags | — | — | — | ✔ |
