import zoneinfo
import threading
from datetime import datetime, date, time, timedelta
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.db import connection
from rest_framework import status
from rest_framework.test import APIClient

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking
from bookings.services import (
    generate_available_slots,
    generate_month_available_days,
    create_booking,
    cancel_booking,
    reschedule_booking,
    complete_booking,
    no_show_booking,
    ConflictError,
)

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
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=target_monday,
            now_override=frozen_now
        )

        self.assertEqual(len(slots), 16)
        times = [s['start_at'].strftime('%H:%M') for s in slots]
        self.assertIn('09:00', times)
        self.assertIn('12:30', times)
        self.assertIn('14:00', times)
        self.assertIn('17:30', times)
        self.assertNotIn('13:00', times)
        self.assertNotIn('13:30', times)

    def test_service_longer_than_gap_omitted(self):
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=60,
            target_date=target_monday,
            now_override=frozen_now
        )

        times = [s['start_at'].strftime('%H:%M') for s in slots]
        self.assertEqual(len(slots), 14)
        self.assertIn('12:00', times)
        self.assertNotIn('12:30', times)
        self.assertNotIn('17:30', times)

    def test_existing_confirmed_booking_removes_slot(self):
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

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
        self.assertNotIn('10:00', times)
        self.assertIn('09:30', times)
        self.assertIn('10:30', times)
        self.assertEqual(len(slots), 15)

    def test_time_off_blocks_availability(self):
        target_monday = date(2026, 10, 12)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

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
        self.assertNotIn('14:00', times)
        self.assertNotIn('14:30', times)
        self.assertNotIn('15:00', times)
        self.assertNotIn('15:30', times)
        self.assertIn('16:00', times)

    def test_closed_weekday_returns_empty_slots(self):
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
        frozen_now = datetime(2026, 10, 12, 7, 0, tzinfo=IST)
        slots = generate_available_slots(
            provider=self.provider,
            duration_minutes=30,
            target_date=date(2026, 10, 12),
            now_override=frozen_now
        )
        times = [s['start_at'].strftime('%H:%M') for s in slots]
        self.assertIn('09:00', times)

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
        self.assertIn('2026-10-12', response.data['available_days'])
        self.assertIn('2026-10-13', response.data['available_days'])
        self.assertNotIn('2026-10-14', response.data['available_days'])


class BookingCreationAndLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.provider_user = User.objects.create_user(
            email='provider_life@example.com',
            username='provider_life',
            password='Password123!',
            role=User.ROLE_PROVIDER
        )
        self.provider = ProviderProfile.objects.create(
            user=self.provider_user,
            business_name='Lifecycle Clinic',
            category='clinic',
            slot_interval_minutes=30
        )
        self.service = Service.objects.create(
            provider=self.provider,
            name='Standard Consult',
            duration_minutes=30,
            price=500.00
        )
        WorkingHours.objects.create(
            provider=self.provider,
            weekday=0,  # Monday
            start_time=time(9, 0),
            end_time=time(17, 0)
        )

        self.customer1 = User.objects.create_user(
            email='customer1@example.com',
            username='cust1',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )
        self.customer2 = User.objects.create_user(
            email='customer2@example.com',
            username='cust2',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )

    def test_successful_booking_creation_with_snapshots(self):
        self.client.force_authenticate(user=self.customer1)
        # Choose a target Monday at 10:00 AM
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        # Call booking creation API
        response = self.client.post(reverse('booking-list'), {
            'service_id': self.service.id,
            'start_at': start_at.isoformat(),
            'notes': 'First visit'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertEqual(data['service_name'], 'Standard Consult')
        self.assertEqual(data['service_duration'], 30)
        self.assertEqual(float(data['service_price']), 500.00)
        self.assertEqual(data['status'], 'confirmed')
        self.assertEqual(data['notes'], 'First visit')

    def test_sequential_double_booking_rejected_with_409(self):
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        
        # Cust 1 books successfully
        self.client.force_authenticate(user=self.customer1)
        res1 = self.client.post(reverse('booking-list'), {
            'service_id': self.service.id,
            'start_at': start_at.isoformat()
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Cust 2 tries to book same slot -> 409 Conflict
        self.client.force_authenticate(user=self.customer2)
        res2 = self.client.post(reverse('booking-list'), {
            'service_id': self.service.id,
            'start_at': start_at.isoformat()
        })
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)

    def test_non_customer_cannot_create_booking(self):
        self.client.force_authenticate(user=self.provider_user)
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        response = self.client.post(reverse('booking-list'), {
            'service_id': self.service.id,
            'start_at': start_at.isoformat()
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_inactive_service_or_provider_rejected(self):
        self.service.is_active = False
        self.service.save()

        self.client.force_authenticate(user=self.customer1)
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        response = self.client.post(reverse('booking-list'), {
            'service_id': self.service.id,
            'start_at': start_at.isoformat()
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reschedule_to_valid_slot_succeeds(self):
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        booking = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        self.client.force_authenticate(user=self.customer1)
        new_start = datetime(2026, 10, 12, 11, 0, tzinfo=IST)
        url = reverse('booking-reschedule', args=[booking.id])
        res = self.client.post(url, {'start_at': new_start.isoformat()})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.start_at, new_start)

    def test_reschedule_uses_booking_snapshot_duration(self):
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        booking = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )
        # Service is subsequently updated to 60 minutes
        self.service.duration_minutes = 60
        self.service.save()

        # Rescheduling must still use 30 minutes (from snapshot)
        new_start = datetime(2026, 10, 12, 11, 0, tzinfo=IST)
        rescheduled = reschedule_booking(
            booking_id=booking.id,
            user=self.customer1,
            new_start_at=new_start,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )
        expected_end = new_start + timedelta(minutes=30)
        self.assertEqual(rescheduled.end_at, expected_end)

    def test_reschedule_to_taken_slot_rejected(self):
        # Booking 1 at 10:00
        b1 = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=datetime(2026, 10, 12, 10, 0, tzinfo=IST),
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )
        # Booking 2 at 11:00
        b2 = create_booking(
            customer_user=self.customer2,
            service_id=self.service.id,
            start_at=datetime(2026, 10, 12, 11, 0, tzinfo=IST),
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        # Customer 2 attempts to reschedule into Customer 1's slot (10:00)
        self.client.force_authenticate(user=self.customer2)
        url = reverse('booking-reschedule', args=[b2.id])
        res = self.client.post(url, {'start_at': datetime(2026, 10, 12, 10, 0, tzinfo=IST).isoformat()})
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)

    def test_customer_cancellation_cutoff_boundary(self):
        start_at = datetime(2026, 10, 12, 14, 0, tzinfo=IST)
        booking = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        # 4 hours before 14:00 is exactly 10:00
        # If now is 10:00 (<= 4 hours remaining), customer cancellation is rejected!
        with self.assertRaises(Exception):
            cancel_booking(
                booking_id=booking.id,
                user=self.customer1,
                now_override=datetime(2026, 10, 12, 10, 0, tzinfo=IST)
            )

        # If now is 09:59 (> 4 hours remaining), customer cancellation succeeds!
        cancelled = cancel_booking(
            booking_id=booking.id,
            user=self.customer1,
            now_override=datetime(2026, 10, 12, 9, 59, tzinfo=IST),
            cancel_reason="Emergency"
        )
        self.assertEqual(cancelled.status, Booking.STATUS_CANCELLED)
        self.assertEqual(cancelled.cancelled_by, Booking.CANCELLED_BY_CUSTOMER)

    def test_provider_cancellation_allowed_until_start(self):
        start_at = datetime(2026, 10, 12, 14, 0, tzinfo=IST)
        booking = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        # Provider cancels 30 minutes before appointment (13:30)
        cancelled = cancel_booking(
            booking_id=booking.id,
            user=self.provider_user,
            now_override=datetime(2026, 10, 12, 13, 30, tzinfo=IST),
            cancel_reason="Provider ill"
        )
        self.assertEqual(cancelled.status, Booking.STATUS_CANCELLED)
        self.assertEqual(cancelled.cancelled_by, Booking.CANCELLED_BY_PROVIDER)

    def test_complete_and_no_show_rules(self):
        start_at = datetime(2026, 10, 12, 14, 0, tzinfo=IST)
        booking = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        # Cannot complete before start time
        with self.assertRaises(Exception):
            complete_booking(
                booking_id=booking.id,
                user=self.provider_user,
                now_override=datetime(2026, 10, 12, 13, 59, tzinfo=IST)
            )

        # Can complete after start time
        completed = complete_booking(
            booking_id=booking.id,
            user=self.provider_user,
            now_override=datetime(2026, 10, 12, 14, 30, tzinfo=IST)
        )
        self.assertEqual(completed.status, Booking.STATUS_COMPLETED)

        # Completed booking cannot be cancelled or rescheduled
        with self.assertRaises(Exception):
            cancel_booking(booking_id=booking.id, user=self.provider_user)

    def test_scoped_queryset_and_immutability(self):
        start_at = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        b1 = create_booking(
            customer_user=self.customer1,
            service_id=self.service.id,
            start_at=start_at,
            now_override=datetime(2026, 10, 1, 8, 0, tzinfo=IST)
        )

        # Cust 2 tries to GET Cust 1's booking -> 404
        self.client.force_authenticate(user=self.customer2)
        res = self.client.get(reverse('booking-detail', args=[b1.id]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Direct PUT/PATCH/DELETE -> 405
        self.client.force_authenticate(user=self.customer1)
        res_put = self.client.put(reverse('booking-detail', args=[b1.id]), {'notes': 'hacked'})
        self.assertEqual(res_put.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        res_del = self.client.delete(reverse('booking-detail', args=[b1.id]))
        self.assertEqual(res_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class BookingConcurrencyTests(TransactionTestCase):
    """
    Tests atomic conflict prevention under concurrent requests on MySQL.
    Uses TransactionTestCase and threading.Barrier.
    Rule C.20: Every thread MUST call connection.close() when done.
    """
    def setUp(self):
        self.provider_user = User.objects.create_user(
            email='concurr_provider@example.com',
            username='concurr_dr',
            password='Password123!',
            role=User.ROLE_PROVIDER
        )
        self.provider = ProviderProfile.objects.create(
            user=self.provider_user,
            business_name='Concurrency Clinic',
            category='clinic',
            slot_interval_minutes=30
        )
        self.service = Service.objects.create(
            provider=self.provider,
            name='Speed Check',
            duration_minutes=30,
            price=200.00
        )
        WorkingHours.objects.create(
            provider=self.provider,
            weekday=0,
            start_time=time(9, 0),
            end_time=time(17, 0)
        )

        self.cust1 = User.objects.create_user(
            email='c1@example.com', username='c1', password='Password123!', role=User.ROLE_CUSTOMER
        )
        self.cust2 = User.objects.create_user(
            email='c2@example.com', username='c2', password='Password123!', role=User.ROLE_CUSTOMER
        )

    def test_concurrent_slot_booking_exactly_one_succeeds(self):
        target_slot = datetime(2026, 10, 12, 10, 0, tzinfo=IST)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        barrier = threading.Barrier(2)
        results = []

        def worker(customer_user):
            try:
                barrier.wait()
                b = create_booking(
                    customer_user=customer_user,
                    service_id=self.service.id,
                    start_at=target_slot,
                    now_override=frozen_now
                )
                results.append(('success', customer_user.id, b.id))
            except ConflictError:
                results.append(('conflict', customer_user.id, None))
            except Exception as e:
                results.append(('error', customer_user.id, str(e)))
            finally:
                # Rule C.20: Essential for MySQL test runner cleanup
                connection.close()

        t1 = threading.Thread(target=worker, args=(self.cust1,))
        t2 = threading.Thread(target=worker, args=(self.cust2,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        statuses = [r[0] for r in results]
        self.assertEqual(statuses.count('success'), 1, f"Expected exactly 1 success, got: {results}")
        self.assertEqual(statuses.count('conflict'), 1, f"Expected exactly 1 conflict, got: {results}")
        # Database must have exactly 1 booking
        self.assertEqual(Booking.objects.filter(start_at=target_slot).count(), 1)


class CustomerOverlapConcurrencyTests(TransactionTestCase):
    """
    Tests that a single customer attempting to double-book across 2 different providers
    at the exact same time window is prevented by the customer row pessimistic lock.
    """
    def setUp(self):
        # Customer
        self.customer = User.objects.create_user(
            email='overlap_cust@example.com',
            username='overlap_cust',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )

        # Provider A
        u_a = User.objects.create_user(
            email='provider_a@example.com', username='prov_a', password='Password123!', role=User.ROLE_PROVIDER
        )
        self.prov_a = ProviderProfile.objects.create(user=u_a, business_name='Clinic A', category='clinic', slot_interval_minutes=30)
        self.srv_a = Service.objects.create(provider=self.prov_a, name='A Check', duration_minutes=30, price=100.00)
        WorkingHours.objects.create(provider=self.prov_a, weekday=0, start_time=time(9, 0), end_time=time(17, 0))

        # Provider B
        u_b = User.objects.create_user(
            email='provider_b@example.com', username='prov_b', password='Password123!', role=User.ROLE_PROVIDER
        )
        self.prov_b = ProviderProfile.objects.create(user=u_b, business_name='Salon B', category='salon', slot_interval_minutes=30)
        self.srv_b = Service.objects.create(provider=self.prov_b, name='B Cut', duration_minutes=30, price=200.00)
        WorkingHours.objects.create(provider=self.prov_b, weekday=0, start_time=time(9, 0), end_time=time(17, 0))

    def test_customer_overlap_across_different_providers_race(self):
        target_slot = datetime(2026, 10, 12, 11, 0, tzinfo=IST)
        frozen_now = datetime(2026, 10, 1, 8, 0, tzinfo=IST)

        barrier = threading.Barrier(2)
        results = []

        def worker(service_id):
            try:
                barrier.wait()
                b = create_booking(
                    customer_user=self.customer,
                    service_id=service_id,
                    start_at=target_slot,
                    now_override=frozen_now
                )
                results.append(('success', service_id, b.id))
            except ConflictError:
                results.append(('conflict', service_id, None))
            except Exception as e:
                results.append(('error', service_id, str(e)))
            finally:
                connection.close()

        t1 = threading.Thread(target=worker, args=(self.srv_a.id,))
        t2 = threading.Thread(target=worker, args=(self.srv_b.id,))

        t1.start()
        t2.start()
        t1.join()
        t2.join()

        statuses = [r[0] for r in results]
        self.assertEqual(statuses.count('success'), 1, f"Expected 1 success, got: {results}")
        self.assertEqual(statuses.count('conflict'), 1, f"Expected 1 conflict, got: {results}")
        self.assertEqual(Booking.objects.filter(customer=self.customer, start_at=target_slot).count(), 1)
