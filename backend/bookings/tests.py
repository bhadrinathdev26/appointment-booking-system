import zoneinfo
from datetime import datetime, date, time, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking
from bookings.services import generate_available_slots, generate_month_available_days

User = get_user_model()
IST = zoneinfo.ZoneInfo('Asia/Kolkata')


class SlotGenerationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.provider_user = User.objects.create_user(
            email='provider_slot@example.com',
            username='dr_slot',
            password='Password123!',
            role=User.ROLE_PROVIDER
        )
        self.provider = ProviderProfile.objects.create(
            user=self.provider_user,
            business_name='Slot Test Clinic',
            category='clinic',
            slot_interval_minutes=30,  # 30 min step
        )

        self.service_30 = Service.objects.create(
            provider=self.provider,
            name='Quick Consult',
            duration_minutes=30,
            price=300.00
        )
        self.service_60 = Service.objects.create(
            provider=self.provider,
            name='Full Procedure',
            duration_minutes=60,
            price=800.00
        )

        self.customer = User.objects.create_user(
            email='customer_slot@example.com',
            username='patient_slot',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )

        # Base schedule: Monday (weekday=0) with lunch break (09:00-13:00 and 14:00-18:00)
        WorkingHours.objects.create(
            provider=self.provider,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(13, 0)
        )
        WorkingHours.objects.create(
            provider=self.provider,
            weekday=0,
            start_time=time(14, 0),
            end_time=time(18, 0)
        )

        # Tuesday (weekday=1) open continuous (10:00-14:00)
        WorkingHours.objects.create(
            provider=self.provider,
            weekday=1,
            start_time=time(10, 0),
            end_time=time(14, 0)
        )

    def test_normal_day_with_lunch_break_slot_generation(self):
        # Pick a target Monday far enough in the future (e.g. 2026-10-12 is a Monday)
        target_monday = date(2026, 10, 12)
        # Freeze "now" to 2026-10-01 08:00 IST (well outside min notice)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=target_monday,
            now_override=frozen_now
        )

        # Morning block: 09:00-13:00 (8 slots of 30m: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30)
        # Afternoon block: 14:00-18:00 (8 slots of 30m: 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00, 17:30)
        # Total = 16 slots
        self.assertEqual(len(slots), 16)

        times = [s['start_at'].strftime('%H:%M') for s in slots]
        self.assertIn('09:00', times)
        self.assertIn('12:30', times)
        self.assertIn('14:00', times)
        self.assertIn('17:30', times)

        # Lunch break interval (13:00 to 14:00) MUST NOT have any slots
        self.assertNotIn('13:00', times)
        self.assertNotIn('13:30', times)

    def test_service_longer_than_gap_omitted(self):
        # Service of 60 minutes: in morning 09:00-13:00, last possible start is 12:00 (12:00-13:00).
        # A 60-min service starting at 12:30 would overrun into lunch break (end at 13:30 > 13:00) and must be omitted!
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=60,
            target_date=target_monday,
            now_override=frozen_now
        )

        times = [s['start_at'].strftime('%H:%M') for s in slots]
        # In 09:00-13:00 (step 30 min): 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00 (7 slots)
        # In 14:00-18:00 (step 30 min): 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00 (7 slots)
        self.assertEqual(len(slots), 14)
        self.assertIn('12:00', times)
        self.assertNotIn('12:30', times)
        self.assertNotIn('17:30', times)

    def test_existing_confirmed_booking_removes_slot(self):
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        # Create a confirmed booking at 10:00 - 10:30
        book_start = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        book_end = datetime(2026, 10, 12, 10, 30, tzinfo=IST)
        Booking.objects.create(
            customer=self.customer,
            provider=self.provider,
            service=self.service_30,
            start_at=book_start,
            end_at=book_end,
            service_name=self.service_30.name,
            service_duration=30,
            service_price=self.service_30.price,
            status=Booking.STATUS_CONFIRMED
        )

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=target_monday,
            now_override=frozen_now
        )
        times = [s['start_at'].strftime('%H:%M') for s in slots]

        # 10:00 is booked -> must be removed!
        self.assertNotIn('10:00', times)
        # 09:30 (ends at 10:00) and 10:30 (starts at 10:00) are back-to-back and MUST be available!
        self.assertIn('09:30', times)
        self.assertIn('10:30', times)
        self.assertEqual(len(slots), 15)

    def test_time_off_blocks_availability(self):
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        # Provider takes time off between 14:00 and 16:00
        TimeOff.objects.create(
            provider=self.provider,
            start_at=datetime(2026, 10, 12, 14, 0, tzinfo=IST),
            end_at=datetime(2026, 10, 12, 16, 0, tzinfo=IST),
            reason='Personal errand'
        )

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=target_monday,
            now_override=frozen_now
        )
        times = [s['start_at'].strftime('%H:%M') for s in slots]

        # Slots inside 14:00-16:00 (14:00, 14:30, 15:00, 15:30) must be absent
        self.assertNotIn('14:00', times)
        self.assertNotIn('14:30', times)
        self.assertNotIn('15:00', times)
        self.assertNotIn('15:30', times)
        # 16:00 must be available
        self.assertIn('16:00', times)

    def test_closed_weekday_returns_empty_slots(self):
        # Wednesday (weekday=2) has no WorkingHours rows
        target_wednesday = date(2026, 10, 14)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=target_wednesday,
            now_override=frozen_now
        )
        self.assertEqual(slots, [])

    def test_min_notice_boundary_exact_match(self):
        # Rule B.12: slot starting exactly MIN_NOTICE_HOURS (2 hours) from now is ALLOWED
        frozen_now = datetime(2026, 10, 12, 7, 0, tzinfo=IST)
        # Slot at 09:00 is exactly 2 hours after 07:00
        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=date(2026, 10, 12),
            now_override=frozen_now
        )
        times = [s['start_at'].strftime('%H:%M') for s in slots]
        self.assertIn('09:00', times)

        # If frozen_now is 07:01, 09:00 is under 2 hours notice -> must be excluded!
        frozen_now_late = datetime(2026, 10, 12, 7, 1, tzinfo=IST)
        slots_late = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=date(2026, 10, 12),
            now_override=frozen_now_late
        )
        times_late = [s['start_at'].strftime('%H:%M') for s in slots_late]
        self.assertNotIn('09:00', times_late)
        self.assertIn('09:30', times_late)

    def test_max_advance_boundary_check(self):
        # 60 days advance limit
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        far_date = frozen_now.date() + timedelta(days=61)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=far_date,
            now_override=frozen_now
        )
        self.assertEqual(slots, [])

    def test_availability_api_endpoint(self):
        url = reverse('providers-availability', args=[self.provider.id])
        # Query for 2026-10-12
        response = self.client.get(url, {
            'service': self.service_30.id,
            'date': '2026-10-12'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['service_id'], self.service_30.id)
        self.assertIn('slots', response.data)
        self.assertGreater(len(response.data['slots']), 0)

    def test_month_availability_days_api_endpoint(self):
        url = reverse('providers-availability-days', args=[self.provider.id])
        response = self.client.get(url, {
            'service': self.service_30.id,
            'month': '2026-10'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('available_days', response.data)
        # Should include Mondays and Tuesdays in October 2026
        self.assertIn('2026-10-12', response.data['available_days'])
        self.assertIn('2026-10-13', response.data['available_days'])
        # Wednesday (2026-10-14) is closed -> not present
        self.assertNotIn('2026-10-14', response.data['available_days'])
