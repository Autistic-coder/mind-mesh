"""Allow training runs for unassigned datasets.

Revision ID: d7848fe2a193
Revises: 9c2f61b7d4e0
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7848fe2a193"
down_revision: Union[str, Sequence[str], None] = "9c2f61b7d4e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    convention = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
    with op.batch_alter_table("training_configs", naming_convention=convention) as batch:
        batch.drop_constraint("fk_training_configs_project_id_projects", type_="foreignkey")
        batch.alter_column("project_id", existing_type=sa.String(length=36), nullable=True)
        batch.create_foreign_key(
            "fk_training_configs_project_id_projects",
            "projects",
            ["project_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("training_configs") as batch:
        batch.drop_constraint("fk_training_configs_project_id_projects", type_="foreignkey")
        batch.alter_column("project_id", existing_type=sa.String(length=36), nullable=False)
        batch.create_foreign_key(
            "fk_training_configs_project_id_projects",
            "projects",
            ["project_id"],
            ["id"],
            ondelete="CASCADE",
        )
