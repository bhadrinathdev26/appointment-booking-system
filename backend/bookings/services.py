import zoneinfo
from datetime import datetime, date, time, timedelta
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError
from rest_framework import status

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking

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
