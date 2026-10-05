"""Persist the selected worksheet for uploaded workbooks.

Revision ID: 9c2f61b7d4e0
Revises: 61faf2ac264c
"""

from alembic import op
import sqlalchemy as sa

revision = "9c2f61b7d4e0"
down_revision = "61faf2ac264c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("datasets", sa.Column("sheet_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("datasets", "sheet_name")
