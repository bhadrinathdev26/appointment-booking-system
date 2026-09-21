from datetime import datetime, time, timedelta
import zoneinfo
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from bookings.models import Booking
from bookings.serializers import (
    BookingSerializer,
    CreateBookingSerializer,
    CancelBookingSerializer,
    RescheduleBookingSerializer,
)
from bookings.services import (
    create_booking,
    cancel_booking,
    reschedule_booking,
    complete_booking,
    no_show_booking,
)

IST = zoneinfo.ZoneInfo('Asia/Kolkata')


class BookingViewSet(viewsets.ModelViewSet):
    """
    CRUD and lifecycle viewset for appointments.
    Strictly scoped: Customers see their own bookings, Providers see bookings
    assigned to them, and Admins see everything. Direct PUT/PATCH/DELETE are blocked (405).
    """
    permission_classes = [IsAuthenticated]
    serializer_class = BookingSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return Booking.objects.none()

        if user.role == 'admin':
            qs = Booking.objects.all()
        elif user.role == 'provider':
            qs = Booking.objects.filter(provider__user=user)
        elif user.role == 'customer':
            qs = Booking.objects.filter(customer=user)
        else:
            return Booking.objects.none()

        qs = qs.select_related('customer', 'provider', 'provider__user', 'service')

        # Filters
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        start_date_str = self.request.query_params.get('start_date')
        if start_date_str:
            try:
                start_d = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                start_dt = datetime.combine(start_d, time.min).replace(tzinfo=IST)
                qs = qs.filter(start_at__gte=start_dt)
            except ValueError:
                pass

        end_date_str = self.request.query_params.get('end_date')
        if end_date_str:
            try:
                end_d = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                end_dt = datetime.combine(end_d + timedelta(days=1), time.min).replace(tzinfo=IST)
                qs = qs.filter(start_at__lt=end_dt)
            except ValueError:
                pass

        ordering = self.request.query_params.get('ordering', 'start_at')
        if ordering in ['start_at', '-start_at', 'created_at', '-created_at']:
            qs = qs.order_by(ordering)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = CreateBookingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service_id = serializer.validated_data['service_id']
        start_at = serializer.validated_data['start_at']
        notes = serializer.validated_data.get('notes', '')

        booking = create_booking(
            customer_user=request.user,
            service_id=service_id,
            start_at=start_at,
            notes=notes,
        )

        output_serializer = BookingSerializer(booking)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Direct modification not allowed. Use lifecycle actions."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Direct modification not allowed. Use lifecycle actions."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Bookings cannot be deleted. Cancel instead."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        booking = self.get_object()
        serializer = CancelBookingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get('reason', '')

        updated_booking = cancel_booking(
            booking_id=booking.id,
            user=request.user,
            cancel_reason=reason,
        )
        return Response(BookingSerializer(updated_booking).data)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        booking = self.get_object()
        serializer = RescheduleBookingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_start_at = serializer.validated_data['start_at']

        updated_booking = reschedule_booking(
            booking_id=booking.id,
            user=request.user,
            new_start_at=new_start_at,
        )
        return Response(BookingSerializer(updated_booking).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        booking = self.get_object()
        updated_booking = complete_booking(
            booking_id=booking.id,
            user=request.user,
        )
        return Response(BookingSerializer(updated_booking).data)

    @action(detail=True, methods=['post'], url_path='no-show')
    def no_show(self, request, pk=None):
        booking = self.get_object()
        updated_booking = no_show_booking(
            booking_id=booking.id,
            user=request.user,
        )
        return Response(BookingSerializer(updated_booking).data)
