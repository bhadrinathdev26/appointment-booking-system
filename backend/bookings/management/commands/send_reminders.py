from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from bookings.models import Booking
from bookings.notifications import send_reminder_email


class Command(BaseCommand):
    help = "Finds confirmed appointments starting in the next 24 hours without reminders sent, and emails customers."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate reminder check without sending emails or updating records.'
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        now = timezone.now()
        next_24h = now + timedelta(hours=24)

        upcoming_bookings = Booking.objects.filter(
            status=Booking.STATUS_CONFIRMED,
            reminder_sent_at__isnull=True,
            start_at__gte=now,
            start_at__lte=next_24h,
        ).select_related('customer', 'provider')

        count = upcoming_bookings.count()
        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY-RUN] Found {count} bookings needing reminders."))
            return

        sent_count = 0
        for booking in upcoming_bookings:
            send_reminder_email(booking.id)
            booking.reminder_sent_at = timezone.now()
            booking.save(update_fields=['reminder_sent_at'])
            sent_count += 1

        self.stdout.write(self.style.SUCCESS(f"Successfully sent {sent_count} appointment reminders."))
