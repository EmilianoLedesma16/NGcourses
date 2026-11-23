# Documentación técnica de NGCourse

Esta carpeta reúne la documentación técnica de **NGCourse** (repositorio `ngcourses`), la plataforma de
cursos en línea de NEXTGEN IA. Todo lo que aparece aquí se escribió leyendo el código del repositorio:
rutas, modelos, dependencias y archivos de despliegue. Cuando el código cambie, se actualiza el capítulo
correspondiente.

El resumen ejecutivo de todo el contenido está en
[`NGCourse_Documentacion_Tecnica.html`](NGCourse_Documentacion_Tecnica.html). Ábrelo en el navegador
(o imprímelo a PDF desde ahí); sigue el formato del documento institucional de documentación técnica de
NEXTGEN IA (folio `NG-DOC-TEC-NGCOURSE`).

## Índice

| Capítulo | Carpeta | Contenido |
|---|---|---|
| 1 | [01-arquitectura](01-arquitectura/README.md) | Resumen ejecutivo, visión del producto, stack y estructura del repositorio. |
| 2 | [02-nucleo-backend](02-nucleo-backend/README.md) | `app/core` (configuración, BD, seguridad, rate limit), `api/deps.py`, enums y validadores compartidos. |
| 3 | [03-base-de-datos](03-base-de-datos/README.md) | Las 30 tablas de PostgreSQL agrupadas en 5 dominios y las migraciones Alembic. |
| 4 | [04-seguridad](04-seguridad/README.md) | Autenticación por cookies HttpOnly, refresh tokens rotativos, roles, CSP, cabeceras y webhooks. |
| 5 | [05-reglas-de-negocio](05-reglas-de-negocio/README.md) | Ciclo de vida del curso y la inscripción, candados de acceso, progreso, quiz y certificados. |
| 6 | [06-backend-api](06-backend-api/README.md) | Los 22 routers de FastAPI, los 137 endpoints y los servicios externos (Bunny, PayPal, correo, PDF). |
| 7 | [07-frontend](07-frontend/README.md) | Next.js 16: proxy de rutas, BFF `/api/*`, cliente API, páginas por rol y componentes. |
| 8 | [08-roles-y-flujos](08-roles-y-flujos/README.md) | Casos de uso de Alumno, Instructor, Supervisor y Administrador. |
| 9 | [09-despliegue-y-operacion](09-despliegue-y-operacion/README.md) | Desarrollo local, Docker Compose, CI/CD a EC2, variables de entorno, troubleshooting y roadmap. |

Archivos complementarios:

- [`06-backend-api/endpoints.md`](06-backend-api/endpoints.md): referencia completa de endpoints.
- [`03-base-de-datos/migraciones.md`](03-base-de-datos/migraciones.md): historial de migraciones Alembic.
- [`09-despliegue-y-operacion/pendientes-y-roadmap.md`](09-despliegue-y-operacion/pendientes-y-roadmap.md): deuda técnica y plan de mantenimiento.
- [`09-despliegue-y-operacion/registro-operaciones.md`](09-despliegue-y-operacion/registro-operaciones.md): bitácora de cambios hechos a mano en datos de producción.

## Convenciones

- Rutas de archivo y endpoints van en `código`.
- Las rutas de la API se escriben sin el prefijo `/api/v1` salvo que se indique lo contrario.
- "Alumno" y "estudiante" son lo mismo (`RolUsuario.ESTUDIANTE`).
- "Curso global" y "proceso" son lo mismo: un curso `tipo=global` que agrupa cursos individuales.
