"""Persist complete private datasets and fitted models in the database.

Revision ID: a72de0438c19
Revises: e421bfd675ae
"""

from alembic import op
import sqlalchemy as sa

revision = "a72de0438c19"
down_revision = "e421bfd675ae"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("content_bytes", sa.LargeBinary(), nullable=True))
    op.add_column("model_metadata", sa.Column("artifact_bytes", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("model_metadata", "artifact_bytes")
    op.drop_column("datasets", "content_bytes")
