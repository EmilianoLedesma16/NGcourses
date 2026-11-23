# Catálogo de endpoints

Lista **completa** de los 137 endpoints de la API (136 en producción + 1 solo en local), generada a partir
de los decoradores `@router.<método>` de `backend/app/api/routes/`. Todas las rutas llevan el prefijo
**`/api/v1`** (por ejemplo `POST /api/v1/login/access-token`).

**Columna "Acceso"**

| Valor | Significado |
|---|---|
| Pública | No requiere sesión. |
| Sesión | Cualquier usuario autenticado y activo (`CurrentUser`). |
| Admin | Rol administrador o superusuario (`AdminOrSuperuser` / `require_admin_or_superuser`). |
| Superusuario | Solo `is_superuser` (`get_current_active_superuser`). |
| Supervisor o admin | `SupervisorOrAbove`. |
| Dueño o admin | Instructor dueño del curso, administrador o superusuario (validación dentro del endpoint). |
| Acceso al contenido | Admin, dueño, supervisor con licencia activa o alumno con inscripción activa/finalizada (`_tiene_acceso_contenido`). |
| `· N/min`, `· N/h` | Límite de peticiones por IP (slowapi). |

La descripción es la primera línea del *docstring* de la función, salvo donde se aclaró a mano. Si agregas
o cambias un endpoint, actualiza esta tabla. Para regenerar la lista base:

```bash
cd backend
grep -n "@router\.\(get\|post\|put\|patch\|delete\)" app/api/routes/*.py
```

> Nota: algunos *docstrings* del código están desactualizados (por ejemplo `enviar_quiz` dice "aprobado =
> TODAS correctas", pero `crud.crear_intento_quiz` usa el umbral de 60 %). Esta tabla refleja el
> comportamiento real.

## Conteo por router

| Router | Endpoints | Router | Endpoints |
|---|---|---|---|
| cursos | 28 | inscripciones | 6 |
| users | 14 | etiquetas | 6 |
| organizaciones | 14 | invitaciones | 5 |
| supervisor | 12 | categorias | 5 |
| login | 8 | certificados | 5 |
| comentarios | 6 | items | 5 |
| calificaciones | 4 | quiz | 4 |
| pagos | 4 | progreso | 2 |
| solicitudes | 2 | feature_flags | 2 |
| utils | 2 | admin_stats | 1 |
| webhooks | 1 | private | 1 |

## Autenticación (`login.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/login/access-token` | Pública · 5/min | `login_access_token` | OAuth2 compatible token login. Emite cookie HttpOnly con el JWT (FND-003). |
| `POST` | `/logout` | Cookie refresh | `logout` | Cierra sesión revocando el refresh token y eliminando ambas cookies. |
| `POST` | `/login/refresh-token` | Cookie refresh · 20/min | `refresh_access_token` | Rota el refresh token y emite un nuevo access token sin re-login (FND-007). Respeta "Recordarme": sin `session_persist` las cookies siguen siendo de sesión. |
| `POST` | `/login/test-token` | Sesión | `test_token` | Test access token |
| `GET` | `/auth/session` | Sesión | `get_session` | Valida el JWT HttpOnly y devuelve rol e is_superuser para consumo server-to-server. |
| `POST` | `/password-recovery` | Pública · 3/h | `recover_password` | Password Recovery — email en body JSON (CWE-598). Respuesta uniforme para evitar user enumeration (FND-004). |
| `POST` | `/password-recovery/{email}` | Pública (deprecada) · 3/h | `recover_password_legacy` | Deprecated: migrar a POST /password-recovery con email en body JSON. |
| `POST` | `/reset-password/` | Pública (token) · 5/min | `reset_password` | Reset password — invalida el token al usarlo (uso único). |

## Usuarios (`users.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/users/` | Admin | `read_users` | Retrieve users. Soporta filtros: ?rol=&estado=&search= |
| `POST` | `/users/` | Admin | `create_user` | Create new user. |
| `PATCH` | `/users/me` | Sesión | `update_user_me` | Update own user. |
| `PATCH` | `/users/me/password` | Sesión | `update_password_me` | Update own password. |
| `GET` | `/users/me` | Sesión | `read_user_me` | Get current user with organization info. |
| `POST` | `/users/me/avatar` | Sesión | `upload_avatar_me` | Sube la foto de perfil del usuario actual al volumen de media. |
| `DELETE` | `/users/me/avatar` | Sesión | `delete_avatar_me` | Quita la foto de perfil del usuario actual. |
| `DELETE` | `/users/me` | Sesión | `delete_user_me` | Delete own user. |
| `GET` | `/users/{user_id}` | El mismo usuario o admin | `read_user_by_id` | Get a specific user by id. |
| `PATCH` | `/users/{user_id}` | Admin | `update_user` | Update a user. |
| `DELETE` | `/users/{user_id}` | Admin | `delete_user` | Delete a user. |
| `POST` | `/users/activar` | Pública (token) · 10/min | `activar_cuenta` | Ruta pública. El empleado establece su contraseña y activa su cuenta. El token se invalida al usarse (uso único). |
| `POST` | `/users/solicitar-reactivacion` | Pública · 5/h | `solicitar_reactivacion` | Ruta pública. El empleado solicita un nuevo enlace de activación ingresando su correo. Solo funciona si el usuario está en estado pendiente_activacion. |
| `POST` | `/users/{user_id}/reenviar-activacion` | Admin | `reenviar_activacion` | Regenera el token de activación y reenvía el correo. |

## Utilidades (`utils.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/utils/test-email/` | Superusuario | `test_email` | Envía un correo de prueba al destinatario indicado. |
| `GET` | `/utils/health-check/` | Pública | `health_check` | Devuelve `true`. Lo usan el healthcheck de Docker y la verificación del deploy. |

## Categorías (`categorias.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/categorias/` | Sesión | `list_categorias` | Lista todas las categorías. |
| `GET` | `/categorias/{categoria_id}` | Sesión | `get_categoria` | Detalle de una categoría. |
| `POST` | `/categorias/` | Admin | `create_categoria` | Crea una categoría. Admins y superusuarios. |
| `PATCH` | `/categorias/{categoria_id}` | Admin | `update_categoria` | Edita nombre/descripción de una categoría. |
| `DELETE` | `/categorias/{categoria_id}` | Admin | `delete_categoria` | Borra una categoría. |

## Etiquetas (`etiquetas.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/etiquetas/` | Sesión | `list_etiquetas` | Lista todas las etiquetas. |
| `POST` | `/etiquetas/` | Admin | `create_etiqueta` | Crea una etiqueta. Solo admins. |
| `PATCH` | `/etiquetas/{etiqueta_id}` | Admin | `update_etiqueta` | Edita una etiqueta. |
| `DELETE` | `/etiquetas/{etiqueta_id}` | Admin | `delete_etiqueta` | Borra una etiqueta. |
| `POST` | `/cursos/{curso_id}/etiquetas` | Dueño o admin | `asignar_etiqueta` | Asigna una etiqueta a un curso. |
| `DELETE` | `/cursos/{curso_id}/etiquetas/{etiqueta_id}` | Dueño o admin | `remover_etiqueta` | Remueve una etiqueta de un curso. |

## Cursos, módulos, lecciones, video y recursos (`cursos.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/cursos/destacados` | Pública | `list_cursos_destacados` | Endpoint público (sin auth): lista cursos destacados PUBLICADOS para el carrete. Usado en la pantalla de login (usuario sin sesión). |
| `GET` | `/cursos/` | Sesión (filtra por rol) | `list_cursos` | Lista cursos. Usuarios normales solo ven PUBLICADOS. Instructores ven sus propios cursos en cualquier estado. Admins/superusers ven todos. Soporta filtros:… |
| `GET` | `/cursos/{curso_id}` | Sesión (contenido según acceso) | `get_curso` | Obtiene un curso con sus módulos y lecciones. |
| `POST` | `/cursos/` | Instructor o admin | `create_curso` | Crea un nuevo curso. Solo instructores y admins. |
| `PATCH` | `/cursos/{curso_id}` | Dueño o admin | `update_curso` | Actualiza un curso. Solo el instructor propietario o admin. |
| `PUT` | `/cursos/{curso_id}/subcursos` | Dueño o admin | `set_subcursos` | Define qué cursos forman el curso global y en qué orden. Los cursos que salen de la lista quedan sueltos; nadie pierde su avance. |
| `DELETE` | `/cursos/{curso_id}` | Dueño o admin | `delete_curso` | Elimina un curso (cascade: módulos y lecciones). Solo admin o propietario. |
| `POST` | `/cursos/{curso_id}/cover` | Dueño o admin | `upload_cover` | Sube la imagen de portada del curso. Guarda en disco y actualiza portada_url. |
| `GET` | `/cursos/{curso_id}/modulos` | Sesión (contenido según acceso) | `list_modulos` | Lista los módulos de un curso. |
| `POST` | `/cursos/{curso_id}/modulos` | Dueño o admin | `create_modulo` | Crea un módulo en el curso. |
| `PATCH` | `/cursos/{curso_id}/modulos/{modulo_id}` | Dueño o admin | `update_modulo` | Actualiza un módulo. |
| `DELETE` | `/cursos/{curso_id}/modulos/{modulo_id}` | Dueño o admin | `delete_modulo` | Elimina un módulo (cascade: lecciones). |
| `GET` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones` | Sesión (contenido según acceso) | `list_lecciones` | Lista las lecciones de un módulo. |
| `POST` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones` | Dueño o admin | `create_leccion` | Crea una lección en el módulo. |
| `PATCH` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}` | Dueño o admin | `update_leccion` | Actualiza una lección. |
| `DELETE` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}` | Dueño o admin | `delete_leccion` | Elimina una lección. |
| `POST` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/video-init` | Dueño o admin | `init_video_upload` | Inicia el proceso de upload de video a Bunny.net para una lección. 1. Crea el video en Bunny Stream. 2. Guarda el bunny_video_id en la lección. 3. Retorna… |
| `GET` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/video-status` | Dueño o admin | `get_video_status` | Consulta el estado de encoding del video en Bunny.net. |
| `DELETE` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/video` | Dueño o admin | `delete_video` | Elimina el video de Bunny.net y limpia los campos de la lección. |
| `GET` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/recursos` | Acceso al contenido | `list_recursos` | Lista los recursos de una lección. |
| `POST` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/recursos` | Dueño o admin | `create_recurso` | Crea un recurso en una lección. |
| `POST` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/recursos/upload` | Dueño o admin | `upload_recurso` | Sube un archivo como recurso de una lección. Soporta PDF, DOCX, XLSX, PPTX. |
| `GET` | `/cursos/recursos/{recurso_id}/download` | Acceso al contenido | `download_recurso` | Descarga un recurso de lección con control de acceso. |
| `DELETE` | `/cursos/{curso_id}/modulos/{modulo_id}/lecciones/{leccion_id}/recursos/{recurso_id}` | Dueño o admin | `delete_recurso` | Elimina un recurso de una lección. |
| `POST` | `/cursos/{curso_id}/invitaciones` | Admin | `invitar_a_curso` | Envía invitaciones por email para un curso propio del instructor. |
| `GET` | `/cursos/{curso_id}/invitaciones` | Admin | `listar_invitaciones_curso_instructor` | Lista las invitaciones de un curso propio del instructor. |
| `POST` | `/cursos/{curso_id}/invitaciones/{invitacion_id}/reenviar` | Admin | `reenviar_invitacion_curso` | Reenvía una invitación de un curso propio del instructor. |
| `DELETE` | `/cursos/{curso_id}/invitaciones/{invitacion_id}` | Admin | `revocar_invitacion_curso` | Revoca una invitación pendiente de un curso propio del instructor. |

## Inscripciones (`inscripciones.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/inscripciones/` | Sesión | `inscribirse` | Inscribe al usuario actual en un curso. |
| `GET` | `/inscripciones/me` | Sesión | `mis_inscripciones` | Lista las inscripciones del usuario actual (sin las dadas de baja). |
| `GET` | `/inscripciones/usuario/{usuario_id}` | Admin | `inscripciones_por_usuario` | Lista inscripciones de un alumno específico. Solo admin. |
| `GET` | `/inscripciones/{inscripcion_id}` | Propietario o admin | `get_inscripcion` | Detalle de una inscripción. |
| `PATCH` | `/inscripciones/{inscripcion_id}/cancelar` | Dueño del curso o admin | `cancelar_inscripcion` | Da de baja a un alumno de un curso. Solo admin o instructor propietario. |
| `GET` | `/inscripciones/curso/{curso_id}` | Dueño del curso o admin | `inscripciones_por_curso` | Lista inscripciones de un curso. Solo el instructor propietario o admin. |

## Invitaciones (`invitaciones.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/invitaciones/canjear` | Pública (token) · 10/min | `canjear_invitacion` | Endpoint público. Canjea un token de invitación, crea la cuenta si es nuevo usuario, y envía email con link para establecer contraseña. |
| `POST` | `/invitaciones/` | Admin | `crear_invitaciones` | Envía invitaciones por email. NO crea la cuenta del alumno aquí; la cuenta se crea cuando el alumno acepta el enlace. |
| `GET` | `/invitaciones/curso/{curso_id}` | Admin | `listar_invitaciones_curso` | Lista todas las invitaciones de un curso con su estado derivado. |
| `POST` | `/invitaciones/{invitacion_id}/reenviar` | Admin | `reenviar_invitacion` | Reenvía el email de invitación generando un nuevo token. Funciona para invitaciones pendientes o expiradas. No permite reenviar invitaciones ya usadas. |
| `DELETE` | `/invitaciones/{invitacion_id}` | Admin | `revocar_invitacion` | Revoca (elimina) una invitación pendiente. No se puede revocar si ya fue usada. |

## Progreso (`progreso.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/progreso/` | Dueño de la inscripción | `registrar_progreso` | Registra o actualiza el progreso del usuario en una lección. Si el progreso supera el umbral de completado, marca la lección. Si todas las lecciones están… |
| `GET` | `/progreso/curso/{curso_id}` | Sesión | `progreso_curso` | Obtiene el progreso completo del usuario actual en un curso. Requiere que el usuario esté inscrito. |

## Quiz (`quiz.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/quiz/lecciones/{leccion_id}/enviar` | Inscrito activo | `enviar_quiz` | Califica en el servidor: aprobado con ≥ 60 % de aciertos, máximo 3 intentos. Aprobado = lección completada. |
| `GET` | `/quiz/lecciones/{leccion_id}/ultimo-intento` | Sesión | `ultimo_intento` | Devuelve el último intento del alumno en esta lección (o null si no hay). Requiere ?inscripcion_id=<uuid> como query param. |
| `POST` | `/quiz/lecciones/{leccion_id}/reiniciar-intentos` | Dueño del curso o admin | `reiniciar_intentos` | Admin/instructor dueño reinicia los intentos de un alumno en una lección de quiz, para desbloquearlo tras agotar el máximo de intentos. |
| `GET` | `/quiz/cursos/{curso_id}/resultados` | Dueño del curso o admin | `resultados_curso` | Instructor/admin: todos los intentos de quiz en un curso. Solo muestra el último intento por alumno+lección. |

## Calificaciones (reseñas) (`calificaciones.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/calificaciones/cursos/{curso_id}` | Inscrito con curso completado | `crear_calificacion` | Crea una reseña para un curso. El usuario debe estar inscrito y haber completado todas las lecciones. |
| `GET` | `/calificaciones/cursos/{curso_id}` | Sesión | `listar_calificaciones` | Lista las reseñas públicas de un curso. |
| `PATCH` | `/calificaciones/{calificacion_id}` | Autor | `actualizar_calificacion` | Actualiza la propia calificación. |
| `POST` | `/calificaciones/{calificacion_id}/votar` | Sesión | `votar_resena` | Vota si una reseña fue útil (1), no útil (-1) o neutral (0). |

## Comentarios de lección (`comentarios.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/lecciones/{leccion_id}/comentarios` | Acceso a la lección | `listar_comentarios` | Comentarios raíz paginados, cada uno con todas sus respuestas (más viejas primero). |
| `POST` | `/lecciones/{leccion_id}/comentarios` | Acceso a la lección | `crear_comentario` | Crea un comentario raíz o una respuesta (`padre_id`). Máx. 2000 caracteres y 10 por minuto por usuario. |
| `PATCH` | `/comentarios/{comentario_id}` | Autor | `editar_comentario` | Solo el autor puede editar su comentario. |
| `DELETE` | `/comentarios/{comentario_id}` | Autor, dueño del curso o admin | `borrar_comentario` | El autor borra el suyo; admin e instructor del curso, cualquiera. Borrar un comentario raíz borra también sus respuestas. |
| `PUT` | `/comentarios/{comentario_id}/like` | Sesión | `dar_like` | Idempotente: dar like dos veces deja un solo like. |
| `DELETE` | `/comentarios/{comentario_id}/like` | Sesión | `quitar_like` | Quita el like propio (idempotente). |

## Certificados (`certificados.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/certificados/regenerar/{folio}` | Admin | `regenerar_pdf_certificado` | Regenera el PDF de un certificado existente. Solo admin. |
| `GET` | `/certificados/me` | Sesión | `mis_certificados` | Lista los certificados del usuario actual. |
| `GET` | `/certificados/descargar/{folio}` | Propietario o admin | `descargar_certificado` | Descarga el PDF del certificado. Solo el propietario o admin. |
| `GET` | `/certificados/vista-previa/{folio}` | Sesión | `vista_previa_certificado` | Miniatura (WebP) de la primera página del PDF REAL del certificado (la misma que se descarga). Solo el propietario o admin. Se guarda en caché junto al PDF… |
| `GET` | `/certificados/verificar/{folio}` | Sesión | `verificar_certificado` | Verifica un certificado por su folio único. Endpoint público (solo requiere autenticación mínima). |

## Organizaciones (empresas) (`organizaciones.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/organizaciones/` | Admin | `list_organizaciones` | Lista organizaciones con búsqueda opcional `search`. |
| `POST` | `/organizaciones/` | Admin | `create_organizacion` | Crea la organización y su supervisor (punto de contacto) en estado pendiente de activación, y envía el correo con el token. El correo del supervisor sirve… |
| `GET` | `/organizaciones/supervisores-sin-organizacion` | Admin | `supervisores_sin_organizacion` | Supervisores legacy sin organización (su panel falla con 404). El admin les asigna una con POST /{org_id}/miembros (rol_org=ADMIN_ORG). |
| `GET` | `/organizaciones/sin-supervisor` | Admin | `organizaciones_sin_supervisor` | Organizaciones sin supervisor (ADMIN_ORG) asignado. Sirve para asignarles un supervisor huérfano sin dejar la org con dos supervisores. |
| `GET` | `/organizaciones/{org_id}` | Admin | `get_organizacion` | Detalle de una organización. |
| `PATCH` | `/organizaciones/{org_id}` | Admin | `update_organizacion` | Edita datos de la organización. |
| `DELETE` | `/organizaciones/{org_id}` | Admin | `delete_organizacion` | Borra la organización. |
| `GET` | `/organizaciones/{org_id}/miembros` | Admin | `list_miembros` | Miembros de la organización con su rol de org. |
| `POST` | `/organizaciones/{org_id}/miembros` | Admin | `asignar_miembro` | Agrega un usuario existente a la organización. |
| `DELETE` | `/organizaciones/{org_id}/miembros/{user_id}` | Admin | `quitar_miembro` | Quita a un usuario de la organización. |
| `POST` | `/organizaciones/{org_id}/supervisor` | Admin | `crear_supervisor` | Crea un usuario SUPERVISOR (ADMIN_ORG) para la organización en estado pendiente de activación y envía el correo con el token. Sin contraseña: la fija el… |
| `GET` | `/organizaciones/{org_id}/licencias` | Admin | `list_licencias` | Licencias de curso de la organización. |
| `POST` | `/organizaciones/{org_id}/licencias` | Admin | `asignar_licencia` | Otorga a la organización una licencia sobre un curso (fechas, cupos, estado). |
| `DELETE` | `/organizaciones/{org_id}/licencias/{curso_id}` | Admin | `quitar_licencia` | Quita la licencia de un curso. |

## Panel del supervisor (`supervisor.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/supervisor/mi-organizacion` | Supervisor o admin | `mi_organizacion` | Datos de la organización del supervisor (404 si no tiene). |
| `GET` | `/supervisor/cursos` | Supervisor o admin | `cursos_de_mi_org` | Cursos cubiertos por licencias activas de su organización. |
| `GET` | `/supervisor/usuarios` | Supervisor o admin | `usuarios_de_mi_org` | Usuarios de su organización con su avance. |
| `DELETE` | `/supervisor/usuarios/{user_id}` | Supervisor o admin | `quitar_usuario` | Quita a un usuario de su organización. |
| `POST` | `/supervisor/invitaciones` | Supervisor o admin | `invitar` | Envía invitaciones a un curso de la organización. El usuario que canjee quedará automáticamente vinculado a la organización del supervisor. |
| `GET` | `/supervisor/invitaciones` | Supervisor o admin | `listar_invitaciones` | Lista las invitaciones enviadas por los supervisores de su organización (todos ven las de todos), acotadas a los cursos actualmente licenciados a la… |
| `POST` | `/supervisor/invitaciones/{invitacion_id}/reenviar` | Supervisor o admin | `reenviar_invitacion_supervisor` | Reenvía el email de una invitación de su organización. Genera un nuevo token. No permite reenviar invitaciones ya usadas. |
| `DELETE` | `/supervisor/invitaciones/{invitacion_id}` | Supervisor o admin | `revocar_invitacion_supervisor` | Revoca una invitación pendiente de su organización. |
| `GET` | `/supervisor/stats` | Supervisor o admin | `stats` | Contadores del panel del supervisor. |
| `GET` | `/supervisor/dashboard` | Supervisor o admin | `dashboard` | Gráficas del panel del supervisor, con el mismo cálculo que el panel admin pero acotado a los alumnos de su org en los cursos que la org licencia. |
| `POST` | `/supervisor/solicitudes` | Supervisor o admin | `crear_solicitud` | Pide al admin un curso nuevo para la organización. |
| `GET` | `/supervisor/solicitudes` | Supervisor o admin | `listar_solicitudes` | Solicitudes enviadas por su organización. |

## Solicitudes de curso (admin) (`solicitudes.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/solicitudes` | Admin | `listar_solicitudes_admin` | Lista todas las solicitudes de curso (cualquier organización). |
| `PATCH` | `/solicitudes/{solicitud_id}` | Admin | `actualizar_solicitud_admin` | Cambia el estado de una solicitud (aprobar/rechazar/revisión) con comentario opcional dirigido al supervisor. |

## Pagos (PayPal) (`pagos.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/pagos/crear-orden` | Sesión | `crear_orden` | Crea una orden PayPal y un Pago(pendiente) asociado al usuario y curso. |
| `POST` | `/pagos/confirmar` | Sesión | `confirmar_pago` | Captura la orden en PayPal y, si exitoso, marca pago=completado y crea Inscripcion. |
| `GET` | `/pagos/mis-compras` | Sesión | `mis_compras` | Historial de pagos del usuario autenticado. Incluye titulo del curso. |
| `POST` | `/pagos/admin/cortesia` | Admin | `cortesia` | Desbloqueo manual sin pago. Registra Pago(status=cortesia, monto=0) y crea Inscripcion. |

## Webhooks (`webhooks.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/webhooks/bunny` | Firma HMAC de Bunny | `bunny_webhook` | Recibe notificaciones de Bunny.net cuando un video termina de codificarse. Bunny envía: VideoLibraryId, VideoGuid, Status, Bitrate, etc. |

## Feature flags (`feature_flags.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/feature-flags` | Sesión | `listar_feature_flags` | Lista los feature flags. Cualquier usuario autenticado puede leerlos: el frontend los usa para mostrar/ocultar funcionalidad. |
| `PATCH` | `/feature-flags/{nombre}` | Admin | `actualizar_feature_flag` | Prende/apaga un feature flag. Solo admin. |

## Estadísticas de administración (`admin_stats.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/admin/stats` | Admin | `admin_stats` | Cursos por estado, totales, embudo de avance, actividad de 12 semanas, top de cursos y resumen por organización. |

## Items (heredado de la plantilla) (`items.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `GET` | `/items/` | Sesión | `read_items` | Retrieve items. |
| `GET` | `/items/{id}` | Sesión | `read_item` | Get item by ID. |
| `POST` | `/items/` | Sesión | `create_item` | Create new item. |
| `PUT` | `/items/{id}` | Sesión | `update_item` | Update an item. |
| `DELETE` | `/items/{id}` | Sesión | `delete_item` | Delete an item. |

## Privado (solo local) (`private.py`)

| Método | Ruta | Acceso | Función | Descripción |
|---|---|---|---|---|
| `POST` | `/private/users/` | Local, sin auth | `create_user` | Create a new user. |

