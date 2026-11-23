# Migraciones Alembic

Configuración: `backend/alembic.ini` y `backend/app/alembic/env.py`. `env.py` importa
`app.models.SQLModel` (lo que registra todas las tablas) y usa `settings.SQLALCHEMY_DATABASE_URI`.

Las migraciones corren solas en cada arranque del stack: el servicio `prestart` ejecuta
`scripts/prestart.sh` → `alembic upgrade head` antes de levantar el `backend`.

## Historial (cadena lineal)

| # | Revisión | Fecha | Cambio |
|---|---|---|---|
| 1 | `1a11599a9554` | 02/05/2026 | **Esquema inicial**: crea todas las tablas base y los tipos ENUM de Postgres. |
| 2 | `b2c3d4e5f6a7` | 18/06/2026 | Agrega el valor `rechazado` al enum `estadocurso`: el admin puede rechazar un curso sin borrarlo. |
| 3 | `c3d4e5f6a7b8` | 22/06/2026 | Crea `feature_flags` y siembra `instructores = false` (rol instructor apagado por defecto). |
| 4 | `d4e5f6a7b8c9` | 03/07/2026 | Agrega `lecciones.resumen` (texto que el alumno ve en la pestaña "Resumen"). |
| 5 | `e5f6a7b8c9d0` | 02/11/2026 | Agrega `lecciones.es_visible` (server default `true`): ocultar lecciones sin borrarlas. |
| 6 | `f6a7b8c9d0e1` | 04/11/2026 | Agrega `user.avatar_url` (foto de perfil en el volumen de media). |
| 7 | `b8c9d0e1f2a3` | 10/11/2026 | **Cursos globales**: `cursos.tipo` (default `individual`), `curso_padre_id` (FK a `cursos`, ON DELETE SET NULL) y `orden_en_padre`. Los cursos existentes no cambian de comportamiento. |
| 8 | `c9d0e1f2a3b4` | 11/2026 | Borra licencias sueltas de cursos que ya cubre la licencia de su curso global en la misma organización (mismas fechas y cupos, ACTIVA). **Sin vuelta atrás automática** (las filas eran redundantes). |
| 9 | `d0e1f2a3b4c5` | 20/11/2026 | Crea `comentarios_leccion` y `likes_comentario` con fechas con zona horaria y borrado en cascada. |

`head` actual: **`d0e1f2a3b4c5`**.

## Comandos

```bash
cd backend
alembic current                     # revisión aplicada en la BD
alembic history --verbose           # cadena completa
alembic upgrade head                # aplicar pendientes
alembic downgrade -1                # revertir la última (revisar que tenga downgrade)
alembic revision --autogenerate -m "agrega columna x a cursos"
```

En Docker:

```bash
docker compose exec backend alembic upgrade head
```

## Buenas prácticas en este repo

- Revisa siempre el archivo autogenerado. Alembic no detecta bien cambios de valores en tipos ENUM de
  Postgres: para agregar un valor se usa `op.execute("ALTER TYPE estadocurso ADD VALUE 'rechazado'")`
  como en la migración 2.
- Columnas nuevas en tablas con datos: dales `server_default` (como `es_visible` o `tipo`) para que las filas
  existentes queden válidas.
- Las migraciones de datos (como la 8) deben documentar en el *docstring* por qué es segura y si tiene
  vuelta atrás.
- Si la base se reinicia desde cero, `app/wipe_schema.py` vacía el esquema `public` y Alembic lo recrea.
  Es destructivo: solo para entornos sin datos que conservar.
