from rest_framework import serializers
from django.contrib.auth import get_user_model
from providers.models import ProviderProfile, Service
from bookings.models import Booking
from accounts.serializers import UserSerializer

User = get_user_model()


class ProviderMiniSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = ProviderProfile
        fields = ('id', 'business_name', 'user_email', 'user_name', 'address', 'phone')


class ServiceMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ('id', 'name', 'duration_minutes', 'price')


class BookingSerializer(serializers.ModelSerializer):
    customer = UserSerializer(read_only=True)
    provider = ProviderMiniSerializer(read_only=True)
    service = ServiceMiniSerializer(read_only=True)

    class Meta:
        model = Booking
        fields = (
            'id',
            'customer',
            'provider',
            'service',
            'start_at',
            'end_at',
            'status',
            'service_name',
            'service_duration',
            'service_price',
            'notes',
            'cancelled_by',
            'cancelled_at',
            'cancel_reason',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields


class CreateBookingSerializer(serializers.Serializer):
    service_id = serializers.IntegerField(required=True)
    start_at = serializers.DateTimeField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class CancelBookingSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class RescheduleBookingSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField(required=True)
