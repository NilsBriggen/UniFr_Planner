"""Owned, revisioned share links and separate write budgets."""

from alembic import op
import sqlalchemy as sa

revision = "0005_sharing"
down_revision = "0004_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sharing_plan",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("owner_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("account_user.id", ondelete="CASCADE")),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.String(40), nullable=False),
    )
    op.create_table(
        "sharing_rate_limit",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("sharing_rate_limit")
    op.drop_table("sharing_plan")
