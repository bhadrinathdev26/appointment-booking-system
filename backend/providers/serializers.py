from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from django.db import transaction
from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from accounts.serializers import UserSerializer
from bookings.models import Booking


from decimal import Decimal

class ServiceSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'))

    class Meta:
        model = Service
        fields = [
            'id',
            'provider',
            'name',
            'description',
            'duration_minutes',
            'price',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'provider', 'created_at']

    def validate_duration_minutes(self, value):
        if value < 5 or value > 480:
            raise ValidationError("Duration must be between 5 and 480 minutes.")
        if value % 5 != 0:
            raise ValidationError("Duration must be an exact multiple of 5 minutes.")
        return value


class WorkingHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkingHours
        fields = [
            'id',
            'provider',
            'weekday',
            'start_time',
            'end_time',
        ]
        read_only_fields = ['id', 'provider']

    def validate(self, attrs):
        start_time = attrs.get('start_time', self.instance.start_time if self.instance else None)
        end_time = attrs.get('end_time', self.instance.end_time if self.instance else None)
        weekday = attrs.get('weekday', self.instance.weekday if self.instance else None)

        if start_time and end_time and end_time <= start_time:
            raise ValidationError({"end_time": "Working interval end time must be after start time."})

        # Overlap check for the same provider on the same weekday
        provider = self.context.get('provider')
        if not provider and self.instance:
            provider = self.instance.provider

        if provider and weekday is not None and start_time and end_time:
            qs = WorkingHours.objects.filter(provider=provider, weekday=weekday)
            if self.instance:
                qs = qs.exclude(id=self.instance.id)

            # Two intervals overlap if: existing.start < new.end AND existing.end > new.start
            overlap = qs.filter(start_time__lt=end_time, end_time__gt=start_time).exists()
            if overlap:
                raise ValidationError("This interval overlaps with an existing working hours block on the same weekday.")

        return attrs


class TimeOffSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeOff
        fields = [
            'id',
            'provider',
            'start_at',
            'end_at',
            'reason',
            'created_at',
        ]
        read_only_fields = ['id', 'provider', 'created_at']

    def validate(self, attrs):
        start_at = attrs.get('start_at', self.instance.start_at if self.instance else None)
        end_at = attrs.get('end_at', self.instance.end_at if self.instance else None)

        if start_at and end_at and end_at <= start_at:
            raise ValidationError({"end_at": "Time off end datetime must be after start datetime."})

        provider = self.context.get('provider')
        if not provider and self.instance:
            provider = self.instance.provider

        if provider and start_at and end_at:
            # Rule B.8: Lock provider row and check conflicting confirmed bookings
            with transaction.atomic():
                locked_provider = ProviderProfile.objects.select_for_update().get(pk=provider.id)
                conflicting_bookings = Booking.objects.filter(
                    provider=locked_provider,
                    status=Booking.STATUS_CONFIRMED,
                    start_at__lt=end_at,
                    end_at__gt=start_at
                ).select_related('customer', 'service')

                if conflicting_bookings.exists():
                    conflicts_list = [
                        {
                            'booking_id': b.id,
                            'customer_email': b.customer.email,
                            'customer_name': b.customer.get_full_name() or b.customer.username,
                            'service': b.service_name,
                            'start_at': b.start_at,
                            'end_at': b.end_at,
                        }
                        for b in conflicting_bookings
                    ]
                    raise ValidationError({
                        "detail": "Cannot schedule time off because existing confirmed appointments conflict with this time range. Please cancel or reschedule them first.",
                        "conflicting_bookings": conflicts_list
                    })

        return attrs


class ProviderProfileListSerializer(serializers.ModelSerializer):
    """Public directory serializer for active providers."""
    active_services_count = serializers.SerializerMethodField()

    class Meta:
        model = ProviderProfile
        fields = [
            'id',
            'business_name',
            'category',
            'description',
            'phone',
            'address',
            'slot_interval_minutes',
            'is_active',
            'active_services_count',
        ]

    def get_active_services_count(self, obj):
        return obj.services.filter(is_active=True).count()


class ProviderProfileDetailSerializer(serializers.ModelSerializer):
    """Detailed provider serializer with services and working hours."""
    services = serializers.SerializerMethodField()
    working_hours = WorkingHoursSerializer(many=True, read_only=True)
    user = UserSerializer(read_only=True)

    class Meta:
        model = ProviderProfile
        fields = [
            'id',
            'user',
            'business_name',
            'category',
            'description',
            'phone',
            'address',
            'slot_interval_minutes',
            'is_active',
            'created_at',
            'services',
            'working_hours',
        ]

    def get_services(self, obj):
        active_services = obj.services.filter(is_active=True)
        return ServiceSerializer(active_services, many=True).data


class ProviderProfileUpdateSerializer(serializers.ModelSerializer):
    """Serializer for provider self-service profile updates."""

    class Meta:
        model = ProviderProfile
        fields = [
            'business_name',
            'category',
            'description',
            'phone',
            'address',
            'slot_interval_minutes',
        ]
