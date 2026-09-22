"""Independent historical catalogue heads and resumable work."""

from alembic import op
import sqlalchemy as sa

revision = "0007_catalogue_archive"
down_revision = "0006_catalogue_read"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_archive_discovery",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("checked_at", sa.String(), nullable=False),
    )
    op.create_table(
        "catalogue_archive_term",
        sa.Column("term", sa.String(), primary_key=True),
        sa.Column("source_value", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("snapshot_id", sa.String(), sa.ForeignKey("catalogue_snapshot.id")),
        sa.Column("checked_at", sa.String()),
        sa.Column("next_attempt_at", sa.String()),
        sa.Column("failures", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text()),
        sa.Column("progress", sa.JSON(), nullable=False),
    )
    op.create_table(
        "catalogue_archive_checkpoint",
        sa.Column(
            "term", sa.String(), sa.ForeignKey("catalogue_archive_term.term"), primary_key=True
        ),
        sa.Column("kind", sa.String(), primary_key=True),
        sa.Column("ordinal", sa.Integer(), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("catalogue_archive_discovery")
    op.drop_table("catalogue_archive_checkpoint")
    op.drop_table("catalogue_archive_term")
