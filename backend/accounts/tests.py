from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from providers.models import ProviderProfile

User = get_user_model()


class AccountsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            email='customer@example.com',
            username='customer_john',
            password='Password123!',
            role=User.ROLE_CUSTOMER
        )
        self.provider_user = User.objects.create_user(
            email='provider@example.com',
            username='provider_jane',
            password='Password123!',
            role=User.ROLE_PROVIDER
        )
        self.provider_profile = ProviderProfile.objects.create(
            user=self.provider_user,
            business_name='Jane Clinic',
            category='clinic',
        )
        self.admin = User.objects.create_superuser(
            email='admin@example.com',
            username='admin_boss',
            password='Password123!'
        )

    def test_registration_creates_customer(self):
        url = reverse('auth-register')
        payload = {
            'email': 'NewCustomer@Example.com',
            'username': 'newcustomer',
            'password': 'SecurePassword123!',
            'password_confirm': 'SecurePassword123!',
            'first_name': 'New',
            'last_name': 'Customer',
        }
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='newcustomer')
        self.assertEqual(user.role, User.ROLE_CUSTOMER)
        self.assertEqual(user.email, 'newcustomer@example.com')  # normalized to lowercase
        self.assertTrue(user.check_password('SecurePassword123!'))

    def test_registration_privilege_escalation_attempt_fails(self):
        url = reverse('auth-register')
        payload = {
            'email': 'attacker@example.com',
            'username': 'attacker',
            'password': 'SecurePassword123!',
            'password_confirm': 'SecurePassword123!',
            'role': 'admin',  # Attacker attempts to become admin
        }
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='attacker')
        self.assertEqual(user.role, User.ROLE_CUSTOMER)

    def test_login_by_email_case_insensitive(self):
        url = reverse('auth-login')
        payload = {
            'email': 'CUSTOMER@EXAMPLE.COM',  # Uppercase
            'password': 'Password123!',
        }
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertEqual(response.data['user']['role'], 'customer')
        self.assertEqual(response.data['user']['email'], 'customer@example.com')

    def test_superuser_automatically_gets_admin_role(self):
        superuser = User.objects.create_superuser(
            email='super@example.com',
            username='super_user',
            password='Password123!'
        )
        self.assertEqual(superuser.role, User.ROLE_ADMIN)
        self.assertTrue(superuser.is_staff)
        self.assertTrue(superuser.is_superuser)

    def test_current_user_profile_endpoint(self):
        url = reverse('auth-me')
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['email'], 'customer@example.com')
        self.assertEqual(response.data['role'], 'customer')

    def test_admin_cannot_deactivate_self(self):
        url = reverse('users-detail', args=[self.admin.id])
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(url, {'is_active': False})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('is_active', response.data)

    def test_admin_cannot_deactivate_or_demote_last_admin(self):
        # Create a second admin to act as the operator
        second_admin = User.objects.create_superuser(
            email='admin2@example.com',
            username='admin2',
            password='Password123!'
        )
        self.client.force_authenticate(user=second_admin)

        # Deactivate first admin -> 1 admin left
        url1 = reverse('users-detail', args=[self.admin.id])
        res1 = self.client.patch(url1, {'is_active': False})
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Attempt to deactivate the only remaining active admin (admin2)
        url2 = reverse('users-detail', args=[second_admin.id])
        res2 = self.client.patch(url2, {'is_active': False})
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_cannot_change_provider_role(self):
        url = reverse('users-detail', args=[self.provider_user.id])
        self.client.force_authenticate(user=self.admin)
        # Attempt to change provider to customer
        response = self.client.patch(url, {'role': 'customer'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)

    def test_admin_can_create_provider_with_profile(self):
        url = reverse('admin-create-provider')
        self.client.force_authenticate(user=self.admin)
        payload = {
            'email': 'salon_owner@example.com',
            'username': 'salon_owner',
            'password': 'Password123!',
            'business_name': 'Elite Salon & Spa',
            'category': 'salon',
            'slot_interval_minutes': 15,
        }
        response = self.client.post(url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_provider = User.objects.get(email='salon_owner@example.com')
        self.assertEqual(new_provider.role, User.ROLE_PROVIDER)
        profile = ProviderProfile.objects.get(user=new_provider)
        self.assertEqual(profile.business_name, 'Elite Salon & Spa')
        self.assertEqual(profile.slot_interval_minutes, 15)

    def test_users_cannot_be_deleted(self):
        url = reverse('users-detail', args=[self.customer.id])
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
