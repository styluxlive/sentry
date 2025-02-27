# Generated by Django 3.2.23 on 2023-12-05 01:30

import django.db.models.expressions
from django.db import migrations, models

from sentry.new_migrations.migrations import CheckedMigration


class Migration(CheckedMigration):
    # This flag is used to mark that a migration shouldn't be automatically run in production. For
    # the most part, this should only be used for operations where it's safe to run the migration
    # after your code has deployed. So this should not be used for most operations that alter the
    # schema of a table.
    # Here are some things that make sense to mark as dangerous:
    # - Large data migrations. Typically we want these to be run manually by ops so that they can
    #   be monitored and not block the deploy for a long period of time while they run.
    # - Adding indexes to large tables. Since this can take a long time, we'd generally prefer to
    #   have ops run this and not block the deploy. Note that while adding an index is a schema
    #   change, it's completely safe to run the operation after the code has deployed.
    is_dangerous = False

    dependencies = [
        ("sentry", "0611_add_regression_group_model"),
    ]

    operations = [
        migrations.AddField(
            model_name="relocation",
            name="latest_unclaimed_emails_sent_at",
            field=models.DateTimeField(default=None, null=True),
        ),
        migrations.AddField(
            model_name="relocation",
            name="scheduled_cancel_at_step",
            field=models.SmallIntegerField(default=None, null=True),
        ),
        migrations.AddField(
            model_name="relocation",
            name="scheduled_pause_at_step",
            field=models.SmallIntegerField(default=None, null=True),
        ),
        migrations.AddConstraint(
            model_name="relocation",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("scheduled_pause_at_step__gt", django.db.models.expressions.F("step")),
                    ("scheduled_pause_at_step__isnull", True),
                    _connector="OR",
                ),
                name="scheduled_pause_at_step_greater_than_current_step",
            ),
        ),
        migrations.AddConstraint(
            model_name="relocation",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("scheduled_cancel_at_step__gt", django.db.models.expressions.F("step")),
                    ("scheduled_cancel_at_step__isnull", True),
                    _connector="OR",
                ),
                name="scheduled_cancel_at_step_greater_than_current_step",
            ),
        ),
    ]
