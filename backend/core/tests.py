from django.test import TestCase
from django.urls import reverse
from rest_framework import status


class HealthCheckTests(TestCase):
    def test_health_check_returns_healthy(self):
        url = reverse('health-check')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'healthy')
        self.assertEqual(response.data['database'], 'connected')
        self.assertEqual(response.data['service'], 'SlotSync Appointment Booking API')
