"""Durable scheduled runs and operational state."""

from alembic import op
import sqlalchemy as sa

revision = "0004_operations"
down_revision = "0003_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operations_run",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("job", sa.String(32), nullable=False),
        sa.Column("due_at", sa.String(40), nullable=False),
        sa.Column("started_at", sa.String(40), nullable=False),
        sa.Column("finished_at", sa.String(40)),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
    )
    op.create_table(
        "operations_state",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("operations_state")
    op.drop_table("operations_run")
