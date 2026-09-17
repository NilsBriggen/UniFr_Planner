"""Immutable catalogue snapshots, normalized staging, cache and plan-change outbox."""

from alembic import op
import sqlalchemy as sa

revision = "0002_catalogue"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_snapshot",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
    )
    op.create_table(
        "catalogue_head",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "snapshot_id", sa.String(), sa.ForeignKey("catalogue_snapshot.id"), nullable=False
        ),
    )
    op.create_table("catalogue_course", sa.Column("code", sa.String(), primary_key=True))
    op.create_table(
        "catalogue_offering",
        sa.Column(
            "snapshot_id", sa.String(), sa.ForeignKey("catalogue_snapshot.id"), primary_key=True
        ),
        sa.Column("source_id", sa.String(), primary_key=True),
        sa.Column(
            "course_code", sa.String(), sa.ForeignKey("catalogue_course.code"), nullable=False
        ),
        sa.Column("search_text", sa.Text(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    for name in ("catalogue_meeting", "catalogue_assignment"):
        op.create_table(
            name,
            sa.Column(
                "snapshot_id", sa.String(), sa.ForeignKey("catalogue_snapshot.id"), primary_key=True
            ),
            sa.Column("source_id", sa.String(), primary_key=True),
            sa.Column("ordinal", sa.Integer(), primary_key=True),
            sa.Column("data", sa.JSON(), nullable=False),
        )
    op.create_table(
        "catalogue_source_cache",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
    )
    op.create_table(
        "catalogue_plan_reference",
        sa.Column("plan_id", sa.String(), primary_key=True),
        sa.Column("source_id", sa.String(), primary_key=True),
    )
    op.create_table(
        "catalogue_plan_change",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("plan_id", sa.String(), nullable=False),
        sa.Column("source_id", sa.String(), nullable=False),
        sa.Column("snapshot_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("before", sa.JSON()),
        sa.Column("after", sa.JSON()),
    )


def downgrade() -> None:
    for name in (
        "catalogue_plan_change",
        "catalogue_plan_reference",
        "catalogue_source_cache",
        "catalogue_assignment",
        "catalogue_meeting",
        "catalogue_offering",
        "catalogue_course",
        "catalogue_head",
        "catalogue_snapshot",
    ):
        op.drop_table(name)
