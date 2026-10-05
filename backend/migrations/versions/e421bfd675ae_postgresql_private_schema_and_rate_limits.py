"""Add shared rate limits and secure the private PostgreSQL schema.

Revision ID: e421bfd675ae
Revises: d7848fe2a193
"""

from alembic import op
import os
import re
import sqlalchemy as sa

revision = "e421bfd675ae"
down_revision = "d7848fe2a193"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limits",
        sa.Column("scope", sa.String(length=40), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("window_start", sa.Integer(), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("scope", "key_hash", "window_start"),
    )
    op.create_index("ix_rate_limits_expires_at", "rate_limits", ["expires_at"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("REVOKE ALL ON SCHEMA mindmesh FROM PUBLIC")
        op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA mindmesh FROM PUBLIC")
        op.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA mindmesh FROM PUBLIC")
        op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON TABLES FROM PUBLIC")
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON SEQUENCES FROM PUBLIC"
        )
        op.execute(
            """
            DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                REVOKE ALL ON SCHEMA mindmesh FROM anon;
                REVOKE ALL ON ALL TABLES IN SCHEMA mindmesh FROM anon;
                REVOKE ALL ON ALL SEQUENCES IN SCHEMA mindmesh FROM anon;
                EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON TABLES FROM anon';
                EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON SEQUENCES FROM anon';
              END IF;
              IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                REVOKE ALL ON SCHEMA mindmesh FROM authenticated;
                REVOKE ALL ON ALL TABLES IN SCHEMA mindmesh FROM authenticated;
                REVOKE ALL ON ALL SEQUENCES IN SCHEMA mindmesh FROM authenticated;
                EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON TABLES FROM authenticated';
                EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh REVOKE ALL ON SEQUENCES FROM authenticated';
              END IF;
            END $$;
            """
        )
        app_role = os.getenv("MINDMESH_APP_DATABASE_ROLE", "").strip()
        if app_role:
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", app_role):
                raise RuntimeError(
                    "MINDMESH_APP_DATABASE_ROLE is not a valid PostgreSQL role name."
                )
            exists = op.get_bind().scalar(
                sa.text("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :role)"),
                {"role": app_role},
            )
            if not exists:
                raise RuntimeError(
                    f"PostgreSQL role {app_role!r} does not exist. Create it before migrating."
                )
            quoted_role = f'"{app_role}"'
            op.execute(f"GRANT USAGE ON SCHEMA mindmesh TO {quoted_role}")
            op.execute(
                f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mindmesh TO {quoted_role}"
            )
            op.execute(f"GRANT USAGE ON ALL SEQUENCES IN SCHEMA mindmesh TO {quoted_role}")
            op.execute(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {quoted_role}"
            )
            op.execute(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA mindmesh GRANT USAGE ON SEQUENCES TO {quoted_role}"
            )


def downgrade() -> None:
    op.drop_index("ix_rate_limits_expires_at", table_name="rate_limits")
    op.drop_table("rate_limits")
