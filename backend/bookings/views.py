from datetime import datetime, time, timedelta
import zoneinfo
from django.db import models
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.views import APIView
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

    @action(detail=True, methods=['get'])
    def ics(self, request, pk=None):
        booking = self.get_object()

        # RFC 5545 requires CRLF line endings (\r\n)
        # Datetimes formatted in UTC with Z
        now_utc = timezone.now().astimezone(zoneinfo.ZoneInfo('UTC')).strftime('%Y%m%dT%H%M%SZ')
        start_utc = booking.start_at.astimezone(zoneinfo.ZoneInfo('UTC')).strftime('%Y%m%dT%H%M%SZ')
        end_utc = booking.end_at.astimezone(zoneinfo.ZoneInfo('UTC')).strftime('%Y%m%dT%H%M%SZ')

        domain = request.get_host()
        uid = f"booking-{booking.id}@{domain}"

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//SlotSync//SlotSync Calendar//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{now_utc}",
            f"DTSTART:{start_utc}",
            f"DTEND:{end_utc}",
            f"SUMMARY:{booking.service_name} with {booking.provider.business_name}",
            f"DESCRIPTION:Appointment for {booking.service_name} with {booking.provider.business_name}",
            f"LOCATION:{booking.provider.address or 'Online / At provider location'}",
            "STATUS:CONFIRMED",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
        ics_content = "\r\n".join(lines) + "\r\n"

        from django.http import HttpResponse
        response = HttpResponse(ics_content, content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="appointment-{booking.id}.ics"'
        return response


class DashboardStatsView(APIView):
    """
    Returns role-tailored dashboard metrics:
    - Customer: Next appointment, upcoming count, past count, cancelled count.
    - Provider: Today's schedule, 7-day volume, completed count, revenue, weekday distribution.
    - Admin: User breakdown, platform volume, revenue, and 14-day daily booking trends.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        now = timezone.now()
        now_ist = now.astimezone(IST)

        if user.role == 'customer':
            next_booking = (
                Booking.objects.filter(customer=user, status=Booking.STATUS_CONFIRMED, start_at__gte=now)
                .select_related('provider', 'service')
                .order_by('start_at')
                .first()
            )
            upcoming_count = Booking.objects.filter(customer=user, status=Booking.STATUS_CONFIRMED, start_at__gte=now).count()
            past_count = Booking.objects.filter(
                customer=user
            ).filter(
                models.Q(start_at__lt=now) | models.Q(status__in=[Booking.STATUS_COMPLETED, Booking.STATUS_NO_SHOW])
            ).count()
            cancelled_count = Booking.objects.filter(customer=user, status=Booking.STATUS_CANCELLED).count()

            return Response({
                'role': 'customer',
                'next_appointment': BookingSerializer(next_booking).data if next_booking else None,
                'upcoming_count': upcoming_count,
                'past_count': past_count,
                'cancelled_count': cancelled_count,
            })

        elif user.role == 'provider':
            provider = getattr(user, 'provider_profile', None)
            if not provider:
                return Response({'detail': 'Provider profile not found.'}, status=status.HTTP_404_NOT_FOUND)

            today_start = datetime.combine(now_ist.date(), time.min).replace(tzinfo=IST)
            today_end = today_start + timedelta(days=1)

            today_bookings = (
                Booking.objects.filter(
                    provider=provider,
                    status=Booking.STATUS_CONFIRMED,
                    start_at__gte=today_start,
                    start_at__lt=today_end
                )
                .select_related('customer', 'service')
                .order_by('start_at')
            )

            upcoming_7_days_count = Booking.objects.filter(
                provider=provider,
                status=Booking.STATUS_CONFIRMED,
                start_at__gte=now,
                start_at__lt=now + timedelta(days=7)
            ).count()

            completed_count = Booking.objects.filter(provider=provider, status=Booking.STATUS_COMPLETED).count()
            total_revenue = (
                Booking.objects.filter(provider=provider, status=Booking.STATUS_COMPLETED)
                .aggregate(models.Sum('service_price'))['service_price__sum'] or 0.00
            )

            weekday_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            weekday_counts = {i: 0 for i in range(7)}
            all_provider_bookings = Booking.objects.filter(provider=provider).exclude(status=Booking.STATUS_CANCELLED).values_list('start_at', flat=True)
            for dt in all_provider_bookings:
                weekday_counts[dt.astimezone(IST).weekday()] += 1

            weekday_distribution = [{'day': weekday_names[i], 'count': weekday_counts[i]} for i in range(7)]

            return Response({
                'role': 'provider',
                'business_name': provider.business_name,
                'today_appointments': BookingSerializer(today_bookings, many=True).data,
                'upcoming_7_days_count': upcoming_7_days_count,
                'completed_count': completed_count,
                'total_revenue': float(total_revenue),
                'weekday_distribution': weekday_distribution,
            })

        elif user.role == 'admin':
            from django.contrib.auth import get_user_model
            UserModel = get_user_model()

            customers_count = UserModel.objects.filter(role='customer').count()
            providers_count = UserModel.objects.filter(role='provider').count()
            admins_count = UserModel.objects.filter(role='admin').count()

            total_bookings = Booking.objects.count()
            confirmed_count = Booking.objects.filter(status=Booking.STATUS_CONFIRMED).count()
            completed_count = Booking.objects.filter(status=Booking.STATUS_COMPLETED).count()
            cancelled_count = Booking.objects.filter(status=Booking.STATUS_CANCELLED).count()
            no_show_count = Booking.objects.filter(status=Booking.STATUS_NO_SHOW).count()
            total_revenue = (
                Booking.objects.filter(status=Booking.STATUS_COMPLETED)
                .aggregate(models.Sum('service_price'))['service_price__sum'] or 0.00
            )

            # 14 days booking volume trend (Python aware range grouping to avoid MySQL TruncDate)
            fourteen_days_ago = now_ist.date() - timedelta(days=13)
            window_start = datetime.combine(fourteen_days_ago, time.min).replace(tzinfo=IST)
            window_end = datetime.combine(now_ist.date() + timedelta(days=1), time.min).replace(tzinfo=IST)

            bookings_in_window = list(
                Booking.objects.filter(created_at__gte=window_start, created_at__lt=window_end)
                .values_list('created_at', flat=True)
            )

            date_counts = {}
            for d in range(14):
                dt_str = (fourteen_days_ago + timedelta(days=d)).strftime('%Y-%m-%d')
                date_counts[dt_str] = 0

            for b_created in bookings_in_window:
                d_str = b_created.astimezone(IST).strftime('%Y-%m-%d')
                if d_str in date_counts:
                    date_counts[d_str] += 1

            last_14_days_volume = [{'date': k, 'count': v} for k, v in date_counts.items()]

            return Response({
                'role': 'admin',
                'total_users': {
                    'customers': customers_count,
                    'providers': providers_count,
                    'admins': admins_count,
                    'total': customers_count + providers_count + admins_count,
                },
                'total_bookings': total_bookings,
                'confirmed_count': confirmed_count,
                'completed_count': completed_count,
                'cancelled_count': cancelled_count,
                'no_show_count': no_show_count,
                'total_revenue': float(total_revenue),
                'last_14_days_volume': last_14_days_volume,
            })

        return Response({'detail': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)

