"""Optional private accounts, sessions, bounded rate counters and revisioned plans."""

from alembic import op
import sqlalchemy as sa

revision = "0003_accounts"
down_revision = "0002_catalogue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_user",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("username", sa.String(32), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(256), nullable=False),
        sa.Column("recovery_hash", sa.String(64), nullable=False),
    )
    op.create_table(
        "account_session",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("account_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.Integer(), nullable=False),
    )
    op.create_index("ix_account_session_user_id", "account_session", ["user_id"])
    op.create_table(
        "account_plan",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("account_user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("conflict_of", sa.String(64)),
    )
    op.create_index("ix_account_plan_user_id", "account_plan", ["user_id"])
    op.create_table(
        "account_rate_limit",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("window", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    for name in ("account_rate_limit", "account_plan", "account_session", "account_user"):
        op.drop_table(name)
