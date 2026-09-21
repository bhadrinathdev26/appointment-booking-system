from rest_framework import generics, permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from accounts.serializers import (
    UserSerializer,
    RegisterSerializer,
    CustomTokenObtainPairSerializer,
    AdminUserUpdateSerializer,
    AdminCreateProviderSerializer,
)
from accounts.permissions import IsAdminRole
from providers.models import ProviderProfile
from bookings.models import Booking

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    Public customer registration endpoint.
    Strictly forces role to 'customer', issues JWT tokens, and throttles abuse.
    """
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['email'] = user.email
        refresh['username'] = user.username

        access_token_str = str(refresh.access_token)
        refresh_token_str = str(refresh)
        user_data = UserSerializer(user).data

        return Response({
            'refresh': refresh_token_str,
            'access': access_token_str,
            'tokens': {
                'access': access_token_str,
                'refresh': refresh_token_str,
            },
            'user': user_data,
        }, status=status.HTTP_201_CREATED)


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    JWT login endpoint using normalized email and password.
    Returns access, refresh tokens, role, and profile details.
    """
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'


class CurrentUserView(generics.RetrieveUpdateAPIView):
    """Retrieve or update profile details of the current authenticated user."""
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    Admin-only user management endpoint.
    Supports listing, filtering by role/active, and toggling active status.
    Strictly prohibits deleting users.
    """
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = AdminUserUpdateSerializer
    permission_classes = [IsAdminRole]
    filterset_fields = ['role', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['date_joined', 'username', 'role', 'is_active']

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Users cannot be deleted from the database. Deactivate the account instead to maintain historical integrity."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        new_is_active = serializer.validated_data.get('is_active')
        with transaction.atomic():
            updated_user = serializer.save()

            # If deactivating a provider, also deactivate their business profile
            future_confirmed_count = 0
            if instance.role == User.ROLE_PROVIDER and new_is_active is False:
                if hasattr(instance, 'provider_profile'):
                    profile = instance.provider_profile
                    profile.is_active = False
                    profile.save(update_fields=['is_active'])

                    future_confirmed_count = Booking.objects.filter(
                        provider=profile,
                        status=Booking.STATUS_CONFIRMED,
                        start_at__gte=timezone.now()
                    ).count()

        resp_data = serializer.data
        if instance.role == User.ROLE_PROVIDER and new_is_active is False:
            resp_data['future_confirmed_bookings'] = future_confirmed_count
            resp_data['message'] = f"Provider deactivated. Note: {future_confirmed_count} future confirmed booking(s) exist."

        return Response(resp_data, status=status.HTTP_200_OK)


class AdminCreateProviderView(APIView):
    """
    Admin-only endpoint to create a provider user account and ProviderProfile in one atomic action.
    """
    permission_classes = [IsAdminRole]

    def post(self, request):
        serializer = AdminCreateProviderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            # 1. Create provider user
            provider_user = User.objects.create_user(
                email=data['email'],
                username=data['username'],
                password=data['password'],
                first_name=data.get('first_name', ''),
                last_name=data.get('last_name', ''),
                phone=data.get('phone', ''),
                role=User.ROLE_PROVIDER,
            )

            # 2. Create provider profile
            profile = ProviderProfile.objects.create(
                user=provider_user,
                business_name=data['business_name'],
                category=data.get('category', ProviderProfile.CATEGORY_OTHER),
                description=data.get('description', ''),
                address=data.get('address', ''),
                phone=data.get('phone', ''),
                slot_interval_minutes=data.get('slot_interval_minutes', 30),
                is_active=True,
            )

        return Response({
            'message': 'Provider user and profile created successfully.',
            'user': UserSerializer(provider_user).data,
            'provider_id': profile.id,
            'business_name': profile.business_name,
        }, status=status.HTTP_201_CREATED)
