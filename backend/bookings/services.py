import zoneinfo
from datetime import datetime, date, time, timedelta
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework import status

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking
from bookings.notifications import (
    send_booking_confirmation_email,
    send_booking_cancelled_email,
    send_booking_rescheduled_email,
)

User = get_user_model()
IST = zoneinfo.ZoneInfo('Asia/Kolkata')


class ConflictError(ValidationError):
    status_code = status.HTTP_409_CONFLICT


def generate_available_slots(
    provider: ProviderProfile,
    duration_minutes: int,
    target_date: date,
    exclude_booking_id: int = None,
    now_override: datetime = None
) -> list[dict]:
    """
    Dynamically generates unbooked, valid time slots for a provider on a specific date.
    Calculated on request using datetime arithmetic in Asia/Kolkata.
    Uses at most 2 queries for the entire day.
    """
    now = now_override or timezone.now()
    now_ist = now.astimezone(IST)

    booking_rules = getattr(settings, 'BOOKING_RULES', {
        'MIN_NOTICE_HOURS': 2,
        'MAX_ADVANCE_DAYS': 60,
        'CANCEL_CUTOFF_HOURS': 4,
    })

    # Rule B.12: a slot starting exactly MIN_NOTICE_HOURS from now is allowed (>=)
    min_notice_delta = timedelta(hours=booking_rules['MIN_NOTICE_HOURS'])
    min_start_time = now_ist + min_notice_delta

    max_advance_delta = timedelta(days=booking_rules['MAX_ADVANCE_DAYS'])
    max_start_time = now_ist + max_advance_delta

    # Define boundaries of the target date in IST
    day_start_ist = datetime.combine(target_date, time.min).replace(tzinfo=IST)
    day_end_ist = day_start_ist + timedelta(days=1)

    # If the target date is entirely in the past or beyond max advance, return empty
    if day_end_ist <= min_start_time or day_start_ist > max_start_time:
        return []

    # 1. Fetch working hour intervals for target weekday (0=Monday, ..., 6=Sunday)
    weekday = target_date.weekday()
    intervals = list(
        WorkingHours.objects.filter(provider=provider, weekday=weekday).order_by('start_time')
    )
    if not intervals:
        return []  # Closed on this weekday

    # 2. Fetch existing confirmed bookings and time off for this day (at most 2 queries)
    bookings_qs = Booking.objects.filter(
        provider=provider,
        status=Booking.STATUS_CONFIRMED,
        start_at__lt=day_end_ist,
        end_at__gt=day_start_ist,
    )
    if exclude_booking_id:
        bookings_qs = bookings_qs.exclude(pk=exclude_booking_id)

    existing_bookings = list(bookings_qs.values('start_at', 'end_at'))

    time_offs = list(TimeOff.objects.filter(
        provider=provider,
        start_at__lt=day_end_ist,
        end_at__gt=day_start_ist,
    ).values('start_at', 'end_at'))

    # 3. Generate candidate slots
    slot_interval_delta = timedelta(minutes=provider.slot_interval_minutes)
    service_duration_delta = timedelta(minutes=duration_minutes)

    available_slots = []

    for interval in intervals:
        # Datetime arithmetic for accurate minute stepping
        interval_start_dt = datetime.combine(target_date, interval.start_time).replace(tzinfo=IST)
        interval_end_dt = datetime.combine(target_date, interval.end_time).replace(tzinfo=IST)

        current_start = interval_start_dt
        while current_start + service_duration_delta <= interval_end_dt:
            current_end = current_start + service_duration_delta

            # Boundary checks
            if current_start < min_start_time:
                current_start += slot_interval_delta
                continue
            if current_start > max_start_time:
                current_start += slot_interval_delta
                continue

            # Check TimeOff overlap: current_start < off.end AND current_end > off.start
            has_timeoff_overlap = any(
                current_start < off['end_at'] and current_end > off['start_at']
                for off in time_offs
            )
            if has_timeoff_overlap:
                current_start += slot_interval_delta
                continue

            # Check Booking overlap: current_start < book.end AND current_end > book.start
            # Back-to-back bookings (start == existing.end) are non-overlapping and allowed
            has_booking_overlap = any(
                current_start < book['end_at'] and current_end > book['start_at']
                for book in existing_bookings
            )
            if has_booking_overlap:
                current_start += slot_interval_delta
                continue

            available_slots.append({
                'start_at': current_start,
                'end_at': current_end,
            })
            current_start += slot_interval_delta

    return available_slots


def generate_month_available_days(
    provider: ProviderProfile,
    duration_minutes: int,
    year: int,
    month: int,
    now_override: datetime = None
) -> list[str]:
    """
    Computes which calendar days in a month contain at least one available slot.
    Rule B.10: Fetches the entire month's bookings and time off in exactly 2 queries,
    then evaluates each day in memory.
    """
    now = now_override or timezone.now()
    now_ist = now.astimezone(IST)

    # Start and end of month in IST
    start_of_month = datetime(year, month, 1, tzinfo=IST)
    if month == 12:
        end_of_month = datetime(year + 1, 1, 1, tzinfo=IST)
    else:
        end_of_month = datetime(year, month + 1, 1, tzinfo=IST)

    # Fetch provider's weekly schedule
    working_hours = list(WorkingHours.objects.filter(provider=provider))
    wh_by_weekday = {}
    for wh in working_hours:
        wh_by_weekday.setdefault(wh.weekday, []).append(wh)

    # 2 queries for the entire month
    month_bookings = list(Booking.objects.filter(
        provider=provider,
        status=Booking.STATUS_CONFIRMED,
        start_at__lt=end_of_month,
        end_at__gt=start_of_month,
    ).values('start_at', 'end_at'))

    month_time_offs = list(TimeOff.objects.filter(
        provider=provider,
        start_at__lt=end_of_month,
        end_at__gt=start_of_month,
    ).values('start_at', 'end_at'))

    booking_rules = getattr(settings, 'BOOKING_RULES', {
        'MIN_NOTICE_HOURS': 2,
        'MAX_ADVANCE_DAYS': 60,
    })
    min_start_time = now_ist + timedelta(hours=booking_rules['MIN_NOTICE_HOURS'])
    max_start_time = now_ist + timedelta(days=booking_rules['MAX_ADVANCE_DAYS'])

    slot_interval_delta = timedelta(minutes=provider.slot_interval_minutes)
    service_duration_delta = timedelta(minutes=duration_minutes)

    available_days = []
    curr_date = start_of_month.date()
    end_date = end_of_month.date()

    while curr_date < end_date:
        day_start_ist = datetime.combine(curr_date, time.min).replace(tzinfo=IST)
        day_end_ist = day_start_ist + timedelta(days=1)

        # Skip days strictly in the past or beyond advance window
        if day_end_ist > min_start_time and day_start_ist <= max_start_time:
            intervals = wh_by_weekday.get(curr_date.weekday(), [])
            if intervals:
                # Filter day's bookings & time offs in memory
                day_bookings = [
                    b for b in month_bookings
                    if b['start_at'] < day_end_ist and b['end_at'] > day_start_ist
                ]
                day_time_offs = [
                    t for t in month_time_offs
                    if t['start_at'] < day_end_ist and t['end_at'] > day_start_ist
                ]

                # Check if at least one free slot exists on this day
                has_slot = False
                for interval in intervals:
                    interval_start_dt = datetime.combine(curr_date, interval.start_time).replace(tzinfo=IST)
                    interval_end_dt = datetime.combine(curr_date, interval.end_time).replace(tzinfo=IST)

                    slot_start = interval_start_dt
                    while slot_start + service_duration_delta <= interval_end_dt:
                        slot_end = slot_start + service_duration_delta

                        if min_start_time <= slot_start <= max_start_time:
                            no_timeoff = not any(
                                slot_start < off['end_at'] and slot_end > off['start_at']
                                for off in day_time_offs
                            )
                            no_booking = not any(
                                slot_start < book['end_at'] and slot_end > book['start_at']
                                for book in day_bookings
                            )
                            if no_timeoff and no_booking:
                                has_slot = True
                                break

                        slot_start += slot_interval_delta

                    if has_slot:
                        break

                if has_slot:
                    available_days.append(curr_date.strftime('%Y-%m-%d'))

        curr_date += timedelta(days=1)

    return available_days


# ============================================================================
# Core Booking Operations with Pessimistic Locking & Strict Lifecycle
# ============================================================================

@transaction.atomic
def create_booking(
    customer_user,
    service_id: int,
    start_at: datetime,
    notes: str = "",
    now_override: datetime = None
) -> Booking:
    """
    Creates an appointment booking with atomic conflict prevention.
    Strict locking order:
      1. customer (User row)
      2. provider (ProviderProfile row)
    """
    if customer_user.role != 'customer':
        raise ValidationError({"detail": "Only customers can book appointments."})

    # 1. Lock customer row first (Rule B.4)
    customer = User.objects.select_for_update().get(pk=customer_user.pk)

    # 2. Re-fetch service and lock provider row (Rule B.4 & B.5)
    try:
        service = Service.objects.select_related('provider', 'provider__user').get(pk=service_id)
    except Service.DoesNotExist:
        raise ValidationError({"service_id": "Service does not exist."})

    provider = ProviderProfile.objects.select_for_update().get(pk=service.provider_id)
    # Re-fetch service under lock
    service = Service.objects.get(pk=service_id)

    # Rule B.5: Fresh verification that service, provider, and provider user are active
    if not service.is_active or not provider.is_active or not provider.user.is_active:
        raise ValidationError({"detail": "This service or provider is currently inactive."})

    # Datetime handling in IST
    if timezone.is_naive(start_at):
        start_at_ist = timezone.make_aware(start_at, IST)
    else:
        start_at_ist = start_at.astimezone(IST)

    duration_minutes = service.duration_minutes
    end_at_ist = start_at_ist + timedelta(minutes=duration_minutes)

    # Re-verify slot availability under provider lock
    available_slots = generate_available_slots(
        provider=provider,
        duration_minutes=duration_minutes,
        target_date=start_at_ist.date(),
        now_override=now_override
    )

    matching_slot = any(
        slot['start_at'].year == start_at_ist.year and
        slot['start_at'].month == start_at_ist.month and
        slot['start_at'].day == start_at_ist.day and
        slot['start_at'].hour == start_at_ist.hour and
        slot['start_at'].minute == start_at_ist.minute
        for slot in available_slots
    )
    if not matching_slot:
        raise ConflictError({"detail": "The requested time slot is no longer available."})

    # Rule B.4: Customer overlap check under customer lock
    customer_conflict = Booking.objects.filter(
        customer=customer,
        status=Booking.STATUS_CONFIRMED,
        start_at__lt=end_at_ist,
        end_at__gt=start_at_ist,
    ).exists()
    if customer_conflict:
        raise ConflictError({"detail": "You already have an appointment scheduled during this time window."})

    # Create booking record with snapshots
    booking = Booking.objects.create(
        customer=customer,
        provider=provider,
        service=service,
        start_at=start_at_ist,
        end_at=end_at_ist,
        status=Booking.STATUS_CONFIRMED,
        service_name=service.name,
        service_duration=service.duration_minutes,
        service_price=service.price,
        notes=notes or "",
    )

    # Rule B.9: Schedule email notification on commit
    booking_id = booking.id
    transaction.on_commit(lambda: send_booking_confirmation_email(booking_id))

    return booking


@transaction.atomic
def cancel_booking(
    booking_id: int,
    user,
    cancel_reason: str = "",
    now_override: datetime = None
) -> Booking:
    """
    Cancels a confirmed booking.
    Customer cutoff: MORE than 4 hours before start (Rule B.12).
    Provider / Admin: Any time before start.
    """
    # Rule B.7: Lock booking row
    try:
        booking = Booking.objects.select_for_update().select_related('customer', 'provider', 'provider__user').get(pk=booking_id)
    except Booking.DoesNotExist:
        raise ValidationError({"detail": "Booking not found."})

    if booking.status != Booking.STATUS_CONFIRMED:
        raise ValidationError({"detail": f"Cannot cancel a booking with status '{booking.status}'."})

    now = now_override or timezone.now()
    now_ist = now.astimezone(IST)
    start_at_ist = booking.start_at.astimezone(IST)

    booking_rules = getattr(settings, 'BOOKING_RULES', {'CANCEL_CUTOFF_HOURS': 4})
    cutoff_hours = booking_rules.get('CANCEL_CUTOFF_HOURS', 4)

    if user.role == 'customer':
        if booking.customer_id != user.id:
            raise PermissionDenied({"detail": "You cannot cancel another customer's booking."})
        # Rule B.12: Cancellation requires MORE than 4 hours ahead (now + cutoff < start_at)
        if now_ist + timedelta(hours=cutoff_hours) >= start_at_ist:
            raise ValidationError({
                "detail": f"Cancellations must be made more than {cutoff_hours} hours before the appointment."
            })
        cancelled_by = Booking.CANCELLED_BY_CUSTOMER

    elif user.role == 'provider':
        if booking.provider.user_id != user.id:
            raise PermissionDenied({"detail": "You cannot cancel another provider's booking."})
        if now_ist >= start_at_ist:
            raise ValidationError({"detail": "Cannot cancel an appointment that has already started."})
        cancelled_by = Booking.CANCELLED_BY_PROVIDER

    elif user.role == 'admin':
        if now_ist >= start_at_ist:
            raise ValidationError({"detail": "Cannot cancel an appointment that has already started."})
        cancelled_by = Booking.CANCELLED_BY_ADMIN

    else:
        raise PermissionDenied({"detail": "Unauthorized."})

    booking.status = Booking.STATUS_CANCELLED
    booking.cancelled_by = cancelled_by
    booking.cancelled_at = now
    booking.cancel_reason = cancel_reason or ""
    booking.save()

    b_id = booking.id
    transaction.on_commit(lambda: send_booking_cancelled_email(b_id))

    return booking


@transaction.atomic
def reschedule_booking(
    booking_id: int,
    user,
    new_start_at: datetime,
    now_override: datetime = None
) -> Booking:
    """
    Reschedules an existing confirmed booking to a new time slot.
    Strict locking order:
      1. customer (User row)
      2. provider (ProviderProfile row)
      3. booking (Booking row)
    Must use booking.service_duration snapshot (Rule B.6).
    """
    try:
        b_info = Booking.objects.values('id', 'customer_id', 'provider_id', 'status').get(pk=booking_id)
    except Booking.DoesNotExist:
        raise ValidationError({"detail": "Booking not found."})

    if b_info['status'] != Booking.STATUS_CONFIRMED:
        raise ValidationError({"detail": f"Cannot reschedule a booking with status '{b_info['status']}'."})

    # Strict locking order (Rule B.4): customer -> provider -> booking
    customer = User.objects.select_for_update().get(pk=b_info['customer_id'])
    provider = ProviderProfile.objects.select_for_update().get(pk=b_info['provider_id'])
    booking = Booking.objects.select_for_update().get(pk=booking_id)

    if booking.status != Booking.STATUS_CONFIRMED:
        raise ValidationError({"detail": f"Cannot reschedule a booking with status '{booking.status}'."})

    now = now_override or timezone.now()
    now_ist = now.astimezone(IST)
    curr_start_ist = booking.start_at.astimezone(IST)

    booking_rules = getattr(settings, 'BOOKING_RULES', {'CANCEL_CUTOFF_HOURS': 4})
    cutoff_hours = booking_rules.get('CANCEL_CUTOFF_HOURS', 4)

    if user.role == 'customer':
        if booking.customer_id != user.id:
            raise PermissionDenied({"detail": "You cannot reschedule another customer's booking."})
        if now_ist + timedelta(hours=cutoff_hours) >= curr_start_ist:
            raise ValidationError({
                "detail": f"Rescheduling must be requested more than {cutoff_hours} hours before the appointment."
            })
    elif user.role == 'provider':
        if booking.provider.user_id != user.id:
            raise PermissionDenied({"detail": "You cannot reschedule another provider's booking."})
        if now_ist >= curr_start_ist:
            raise ValidationError({"detail": "Cannot reschedule an appointment that has already started."})
    elif user.role == 'admin':
        if now_ist >= curr_start_ist:
            raise ValidationError({"detail": "Cannot reschedule an appointment that has already started."})
    else:
        raise PermissionDenied({"detail": "Unauthorized."})

    # Datetime handling in IST
    if timezone.is_naive(new_start_at):
        new_start_ist = timezone.make_aware(new_start_at, IST)
    else:
        new_start_ist = new_start_at.astimezone(IST)

    # Rule B.6: MUST use booking.service_duration snapshot
    duration_minutes = booking.service_duration
    new_end_ist = new_start_ist + timedelta(minutes=duration_minutes)

    # Check slot availability for provider excluding current booking
    available_slots = generate_available_slots(
        provider=provider,
        duration_minutes=duration_minutes,
        target_date=new_start_ist.date(),
        exclude_booking_id=booking.id,
        now_override=now_override
    )

    matching_slot = any(
        slot['start_at'].year == new_start_ist.year and
        slot['start_at'].month == new_start_ist.month and
        slot['start_at'].day == new_start_ist.day and
        slot['start_at'].hour == new_start_ist.hour and
        slot['start_at'].minute == new_start_ist.minute
        for slot in available_slots
    )
    if not matching_slot:
        raise ConflictError({"detail": "The requested time slot is not available."})

    # Rule B.4: Customer overlap check excluding current booking
    customer_conflict = Booking.objects.filter(
        customer=customer,
        status=Booking.STATUS_CONFIRMED,
        start_at__lt=new_end_ist,
        end_at__gt=new_start_ist,
    ).exclude(pk=booking.id).exists()
    if customer_conflict:
        raise ConflictError({"detail": "You already have an appointment scheduled during this time window."})

    booking.start_at = new_start_ist
    booking.end_at = new_end_ist
    booking.save()

    b_id = booking.id
    transaction.on_commit(lambda: send_booking_rescheduled_email(b_id))

    return booking


@transaction.atomic
def complete_booking(booking_id: int, user, now_override: datetime = None) -> Booking:
    """
    Marks an appointment as completed. Provider or Admin only.
    Cannot complete future appointments (now >= start_at).
    """
    try:
        booking = Booking.objects.select_for_update().select_related('provider', 'provider__user').get(pk=booking_id)
    except Booking.DoesNotExist:
        raise ValidationError({"detail": "Booking not found."})

    if booking.status != Booking.STATUS_CONFIRMED:
        raise ValidationError({"detail": f"Cannot complete a booking with status '{booking.status}'."})

    if user.role == 'provider' and booking.provider.user_id != user.id:
        raise PermissionDenied({"detail": "Unauthorized."})
    elif user.role not in ('provider', 'admin'):
        raise PermissionDenied({"detail": "Only providers or admins can mark bookings as completed."})

    now = now_override or timezone.now()
    if now < booking.start_at:
        raise ValidationError({"detail": "Cannot mark an appointment as completed before its scheduled start time."})

    booking.status = Booking.STATUS_COMPLETED
    booking.save()
    return booking


@transaction.atomic
def no_show_booking(booking_id: int, user, now_override: datetime = None) -> Booking:
    """
    Marks an appointment as no-show. Provider or Admin only.
    Cannot mark future appointments as no-show (now >= start_at).
    """
    try:
        booking = Booking.objects.select_for_update().select_related('provider', 'provider__user').get(pk=booking_id)
    except Booking.DoesNotExist:
        raise ValidationError({"detail": "Booking not found."})

    if booking.status != Booking.STATUS_CONFIRMED:
        raise ValidationError({"detail": f"Cannot mark a booking with status '{booking.status}' as no-show."})

    if user.role == 'provider' and booking.provider.user_id != user.id:
        raise PermissionDenied({"detail": "Unauthorized."})
    elif user.role not in ('provider', 'admin'):
        raise PermissionDenied({"detail": "Only providers or admins can mark bookings as no-show."})

    now = now_override or timezone.now()
    if now < booking.start_at:
        raise ValidationError({"detail": "Cannot mark an appointment as no-show before its scheduled start time."})

    booking.status = Booking.STATUS_NO_SHOW
    booking.save()
    return booking
