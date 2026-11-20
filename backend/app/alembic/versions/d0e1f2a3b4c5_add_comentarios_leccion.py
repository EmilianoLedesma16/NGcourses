"""add comentarios_leccion y likes_comentario

Comentarios estilo YouTube bajo cada lección: un nivel de respuestas
(parent_id apunta al comentario raíz), likes (uno por usuario) y edición.
Todo en cascada: borrar la lección, el usuario o el comentario raíz borra
sus comentarios, respuestas y likes. Fechas con zona horaria.

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-11-20 18:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd0e1f2a3b4c5'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'comentarios_leccion',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('leccion_id', sa.Uuid(), nullable=False),
        sa.Column('usuario_id', sa.Uuid(), nullable=False),
        sa.Column('parent_id', sa.Uuid(), nullable=True),
        sa.Column('contenido', sa.Text(), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('editado_en', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['leccion_id'], ['lecciones.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['user.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['comentarios_leccion.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_comentarios_leccion_leccion_creado',
        'comentarios_leccion',
        ['leccion_id', 'creado_en'],
    )
    op.create_index(
        op.f('ix_comentarios_leccion_parent_id'), 'comentarios_leccion', ['parent_id']
    )
    op.create_index(
        op.f('ix_comentarios_leccion_usuario_id'), 'comentarios_leccion', ['usuario_id']
    )

    op.create_table(
        'likes_comentario',
        sa.Column('comentario_id', sa.Uuid(), nullable=False),
        sa.Column('usuario_id', sa.Uuid(), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['comentario_id'], ['comentarios_leccion.id'], ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(['usuario_id'], ['user.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('comentario_id', 'usuario_id'),
    )


def downgrade():
    op.drop_table('likes_comentario')
    op.drop_index(op.f('ix_comentarios_leccion_usuario_id'), table_name='comentarios_leccion')
    op.drop_index(op.f('ix_comentarios_leccion_parent_id'), table_name='comentarios_leccion')
    op.drop_index('ix_comentarios_leccion_leccion_creado', table_name='comentarios_leccion')
    op.drop_table('comentarios_leccion')
