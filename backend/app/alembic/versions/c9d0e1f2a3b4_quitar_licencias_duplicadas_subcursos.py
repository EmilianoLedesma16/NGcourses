"""quitar licencias duplicadas de cursos que ya cubre su programa

Cuando una organización tiene licencia de un programa (curso global), esa
licencia ya cubre todos sus cursos (crud.expandir_con_subcursos). Las licencias
sueltas de esos cursos sobran: se borran solo cuando la del programa está en la
misma organización, ACTIVA y con las mismas condiciones (fechas y cupos), así
nadie pierde acceso. Desde este cambio el endpoint de licencias ya no las crea.

No tiene vuelta atrás automática: las filas borradas eran redundantes.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-11-19 18:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'c9d0e1f2a3b4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM licencias_curso h
        USING cursos c, licencias_curso p
        WHERE c.id = h.curso_id
          AND c.curso_padre_id IS NOT NULL
          AND p.curso_id = c.curso_padre_id
          AND p.organizacion_id = h.organizacion_id
          AND p.estado::text = 'activa'
          AND p.inicia_en IS NOT DISTINCT FROM h.inicia_en
          AND p.termina_en IS NOT DISTINCT FROM h.termina_en
          AND p.cupos_total = h.cupos_total
        """
    )


def downgrade():
    # Las licencias borradas eran redundantes; no se recrean.
    pass
