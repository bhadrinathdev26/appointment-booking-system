from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta, time, datetime
from rest_framework import status
from rest_framework.test import APIClient

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking

User = get_user_model()


class ProviderConfigurationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            username='admin_boss',
            password='Password123!'
        )
        self.provider_user = User.objects.create_user(
            email='provider1@example.com',
            username='dr_sharma',
            password='Password123!',
            role=User.ROLE_PROVIDER
        )
        self.provider = ProviderProfile.objects.create(
            user=self.provider_user,
            business_name='Sharma Health Clinic',
            category='clinic',
            slot_interval_minutes=30,
        )

        self.customer = User.objects.create_user(
            email='customer@example.com',
            username='patient_ajay',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )

    def test_public_directory_only_shows_active_providers_with_active_services(self):
        url = reverse('providers-list')

        # Initially provider has no active services -> should NOT appear in directory
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)

        # Add an active service
        Service.objects.create(
            provider=self.provider,
            name='General Consultation',
            duration_minutes=30,
            price=500.00,
            is_active=True
        )

        # Now provider should appear in directory
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['business_name'], 'Sharma Health Clinic')

        # Deactivate provider -> disappears from directory
        self.provider.is_active = False
        self.provider.save()
        response = self.client.get(url)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 0)

    def test_service_duration_validation(self):
        url = reverse('services-list')
        self.client.force_authenticate(user=self.provider_user)

        # 1. Non-multiple of 5 (e.g. 23 min) fails
        payload = {
            'name': 'Quick Checkup',
            'duration_minutes': 23,
            'price': '300.00'
        }
        res = self.client.post(url, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('duration_minutes', res.data)

        # 2. Out of bounds (e.g. 2 min) fails
        payload['duration_minutes'] = 2
        res = self.client.post(url, payload)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Valid multiple of 5 (e.g. 45 min) succeeds
        payload['duration_minutes'] = 45
        res = self.client.post(url, payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['duration_minutes'], 45)

    def test_service_soft_deactivation_when_bookings_exist(self):
        service = Service.objects.create(
            provider=self.provider,
            name='Dental Cleaning',
            duration_minutes=60,
            price=1200.00,
            is_active=True
        )
        now = timezone.now()
        Booking.objects.create(
            customer=self.customer,
            provider=self.provider,
            service=service,
            start_at=now + timedelta(days=2),
            end_at=now + timedelta(days=2, hours=1),
            service_name=service.name,
            service_duration=service.duration_minutes,
            service_price=service.price,
            status=Booking.STATUS_CONFIRMED
        )

        url = reverse('services-detail', args=[service.id])
        self.client.force_authenticate(user=self.provider_user)

        # DELETE should deactivate service rather than deleting it from DB
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('deactivated instead of deleted', response.data['detail'])

        service.refresh_from_db()
        self.assertFalse(service.is_active)
        self.assertTrue(Service.objects.filter(id=service.id).exists())

    def test_working_hours_interval_validation(self):
        url = reverse('working-hours-list')
        self.client.force_authenticate(user=self.provider_user)

        # 1. First block: Monday 09:00 - 13:00
        res1 = self.client.post(url, {
            'weekday': 0,
            'start_time': '09:00:00',
            'end_time': '13:00:00',
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # 2. Overlapping block: Monday 12:00 - 15:00 -> fails (HTTP 400)
        res_overlap = self.client.post(url, {
            'weekday': 0,
            'start_time': '12:00:00',
            'end_time': '15:00:00',
        })
        self.assertEqual(res_overlap.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Non-overlapping afternoon block: Monday 14:00 - 18:00 (Lunch 13:00-14:00) -> succeeds
        res_lunch = self.client.post(url, {
            'weekday': 0,
            'start_time': '14:00:00',
            'end_time': '18:00:00',
        })
        self.assertEqual(res_lunch.status_code, status.HTTP_201_CREATED)

    def test_time_off_conflicting_with_confirmed_booking_rejected(self):
        service = Service.objects.create(
            provider=self.provider,
            name='Checkup',
            duration_minutes=30,
            price=400.00
        )
        target_start = timezone.now() + timedelta(days=3, hours=10)
        target_end = target_start + timedelta(minutes=30)

        Booking.objects.create(
            customer=self.customer,
            provider=self.provider,
            service=service,
            start_at=target_start,
            end_at=target_end,
            service_name=service.name,
            service_duration=service.duration_minutes,
            service_price=service.price,
            status=Booking.STATUS_CONFIRMED
        )

        url = reverse('time-off-list')
        self.client.force_authenticate(user=self.provider_user)

        # Attempt to schedule time-off covering the confirmed booking
        time_off_start = target_start - timedelta(hours=1)
        time_off_end = target_end + timedelta(hours=1)
        response = self.client.post(url, {
            'start_at': time_off_start.isoformat(),
            'end_at': time_off_end.isoformat(),
            'reason': 'Attending medical conference',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('conflicting_bookings', response.data)
        self.assertEqual(len(response.data['conflicting_bookings']), 1)
