from rest_framework import viewsets, permissions, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from providers.serializers import (
    ProviderProfileListSerializer,
    ProviderProfileDetailSerializer,
    ProviderProfileUpdateSerializer,
    ServiceSerializer,
    WorkingHoursSerializer,
    TimeOffSerializer,
)
from accounts.permissions import IsProviderRole, IsProviderOrAdmin, IsAdminRole
from accounts.models import User


class ProviderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public directory of active service providers.
    Only shows providers with is_active=True and at least one active service.
    """
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category']
    search_fields = ['business_name', 'description', 'address']
    ordering_fields = ['business_name', 'created_at']

    def get_queryset(self):
        # Public directory: active providers with at least one active service
        return ProviderProfile.objects.filter(
            is_active=True,
            services__is_active=True
        ).distinct().order_by('business_name')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProviderProfileDetailSerializer
        return ProviderProfileListSerializer

    @action(detail=True, methods=['get'], permission_classes=[permissions.AllowAny])
    def availability(self, request, pk=None):
        """Free slots for a provider on a specific date."""
        from datetime import datetime
        from bookings.services import generate_available_slots
        provider = self.get_object()

        service_id = request.query_params.get('service')
        date_str = request.query_params.get('date')

        if not service_id or not date_str:
            raise ValidationError({"detail": "Both 'service' (ID) and 'date' (YYYY-MM-DD) query parameters are required."})

        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            raise ValidationError({"date": "Invalid date format. Expected YYYY-MM-DD."})

        try:
            service = provider.services.get(pk=service_id, is_active=True)
        except Service.DoesNotExist:
            raise ValidationError({"service": "Active service not found for this provider."})

        slots = generate_available_slots(
            provider=provider,
            duration_minutes=service.duration_minutes,
            target_date=target_date,
        )

        return Response({
            'provider_id': provider.id,
            'business_name': provider.business_name,
            'service_id': service.id,
            'service_name': service.name,
            'duration_minutes': service.duration_minutes,
            'date': date_str,
            'slots': [
                {
                    'start_at': slot['start_at'].isoformat(),
                    'end_at': slot['end_at'].isoformat(),
                    'time_display': slot['start_at'].strftime('%I:%M %p'),
                }
                for slot in slots
            ]
        })

    @action(detail=True, methods=['get'], url_path='availability/days', permission_classes=[permissions.AllowAny])
    def availability_days(self, request, pk=None):
        """Calendar days in a month that have at least one free slot."""
        from datetime import datetime
        from bookings.services import generate_month_available_days
        provider = self.get_object()

        service_id = request.query_params.get('service')
        month_str = request.query_params.get('month')  # YYYY-MM

        if not service_id or not month_str:
            raise ValidationError({"detail": "Both 'service' (ID) and 'month' (YYYY-MM) query parameters are required."})

        try:
            parsed_month = datetime.strptime(month_str, '%Y-%m')
            year, month = parsed_month.year, parsed_month.month
        except ValueError:
            raise ValidationError({"month": "Invalid month format. Expected YYYY-MM."})

        try:
            service = provider.services.get(pk=service_id, is_active=True)
        except Service.DoesNotExist:
            raise ValidationError({"service": "Active service not found for this provider."})

        available_days = generate_month_available_days(
            provider=provider,
            duration_minutes=service.duration_minutes,
            year=year,
            month=month,
        )

        return Response({
            'provider_id': provider.id,
            'service_id': service.id,
            'month': month_str,
            'available_days': available_days,
        })


class ProviderMeView(generics.RetrieveUpdateAPIView):
    """Provider endpoint to retrieve and update their own business profile."""
    permission_classes = [IsProviderRole]
    serializer_class = ProviderProfileUpdateSerializer

    def get_object(self):
        try:
            return self.request.user.provider_profile
        except ProviderProfile.DoesNotExist:
            raise ValidationError({"detail": "No provider profile found for this user account."})


class ServiceViewSet(viewsets.ModelViewSet):
    """
    CRUD for services.
    Providers manage their own services.
    Public users can read active services filtered by provider.
    Admins can manage any provider's services.
    """
    serializer_class = ServiceSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_fields = ['provider', 'is_active']
    search_fields = ['name', 'description']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [IsProviderOrAdmin()]

    def get_queryset(self):
        user = self.request.user
        provider_param = self.request.query_params.get('provider')

        if provider_param:
            qs = Service.objects.filter(provider_id=provider_param)
            # If not the provider themselves or admin, show only active
            if not user.is_authenticated or (user.role == User.ROLE_CUSTOMER):
                qs = qs.filter(is_active=True)
            return qs

        if user.is_authenticated:
            if user.role == User.ROLE_PROVIDER:
                return Service.objects.filter(provider__user=user)
            if user.role == User.ROLE_ADMIN:
                return Service.objects.all()

        return Service.objects.filter(is_active=True)

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.ROLE_PROVIDER:
            provider = user.provider_profile
            serializer.save(provider=provider)
        elif user.role == User.ROLE_ADMIN:
            provider_id = self.request.data.get('provider')
            if not provider_id:
                raise ValidationError({"provider": "Provider ID is required when creating as admin."})
            try:
                provider = ProviderProfile.objects.get(pk=provider_id)
            except ProviderProfile.DoesNotExist:
                raise ValidationError({"provider": "Specified provider profile does not exist."})
            serializer.save(provider=provider)
        else:
            raise PermissionDenied("Only providers or administrators can create services.")

    def destroy(self, request, *args, **kwargs):
        service = self.get_object()
        # Rule B.18: Always deactivate if the service has any bookings
        if service.bookings.exists():
            service.is_active = False
            service.save(update_fields=['is_active'])
            return Response(
                {"detail": f"Service '{service.name}' has existing booking records and has been deactivated instead of deleted."},
                status=status.HTTP_200_OK
            )
        return super().destroy(request, *args, **kwargs)


class WorkingHoursViewSet(viewsets.ModelViewSet):
    """
    Working hours schedule for providers.
    Public read access; write restricted to providers and admins.
    """
    serializer_class = WorkingHoursSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['provider', 'weekday']

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
        return [IsProviderOrAdmin()]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = self.request.user
        if user.is_authenticated and user.role == User.ROLE_PROVIDER and hasattr(user, 'provider_profile'):
            context['provider'] = user.provider_profile
        elif user.is_authenticated and user.role == User.ROLE_ADMIN:
            provider_id = self.request.data.get('provider') or self.request.query_params.get('provider')
            if provider_id:
                try:
                    context['provider'] = ProviderProfile.objects.get(pk=provider_id)
                except ProviderProfile.DoesNotExist:
                    pass
        return context

    def get_queryset(self):
        user = self.request.user
        provider_param = self.request.query_params.get('provider')

        if provider_param:
            return WorkingHours.objects.filter(provider_id=provider_param)

        if user.is_authenticated:
            if user.role == User.ROLE_PROVIDER and hasattr(user, 'provider_profile'):
                return WorkingHours.objects.filter(provider=user.provider_profile)
            if user.role == User.ROLE_ADMIN:
                return WorkingHours.objects.all()

        return WorkingHours.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.ROLE_PROVIDER:
            serializer.save(provider=user.provider_profile)
        elif user.role == User.ROLE_ADMIN:
            provider_id = self.request.data.get('provider')
            if not provider_id:
                raise ValidationError({"provider": "Provider ID is required."})
            provider = ProviderProfile.objects.get(pk=provider_id)
            serializer.save(provider=provider)


class TimeOffViewSet(viewsets.ModelViewSet):
    """
    Provider leaves and time-off periods.
    Validated to prevent overlapping confirmed bookings.
    """
    serializer_class = TimeOffSerializer
    permission_classes = [IsProviderOrAdmin]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        user = self.request.user
        if user.is_authenticated and user.role == User.ROLE_PROVIDER and hasattr(user, 'provider_profile'):
            context['provider'] = user.provider_profile
        elif user.is_authenticated and user.role == User.ROLE_ADMIN:
            provider_id = self.request.data.get('provider') or self.request.query_params.get('provider')
            if provider_id:
                try:
                    context['provider'] = ProviderProfile.objects.get(pk=provider_id)
                except ProviderProfile.DoesNotExist:
                    pass
        return context

    def get_queryset(self):
        user = self.request.user
        provider_param = self.request.query_params.get('provider')

        if provider_param and user.role == User.ROLE_ADMIN:
            return TimeOff.objects.filter(provider_id=provider_param)

        if user.role == User.ROLE_PROVIDER and hasattr(user, 'provider_profile'):
            return TimeOff.objects.filter(provider=user.provider_profile)
        if user.role == User.ROLE_ADMIN:
            return TimeOff.objects.all()

        return TimeOff.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.role == User.ROLE_PROVIDER:
            serializer.save(provider=user.provider_profile)
        elif user.role == User.ROLE_ADMIN:
            provider_id = self.request.data.get('provider')
            if not provider_id:
                raise ValidationError({"provider": "Provider ID is required."})
            provider = ProviderProfile.objects.get(pk=provider_id)
            serializer.save(provider=provider)
