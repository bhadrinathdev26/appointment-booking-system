import logging
import zoneinfo
from django.core.mail import send_mail
from django.conf import settings
from bookings.models import Booking

logger = logging.getLogger(__name__)
IST = zoneinfo.ZoneInfo('Asia/Kolkata')


def format_ist_datetime(dt):
    """Formats a datetime into a human-readable IST string."""
    if not dt:
        return ""
    dt_ist = dt.astimezone(IST)
    return dt_ist.strftime('%A, %B %d, %Y at %I:%M %p IST')


def send_booking_confirmation_email(booking_id: int):
    try:
        booking = Booking.objects.select_related('customer', 'provider', 'provider__user', 'service').get(pk=booking_id)
        subject = f"Appointment Confirmed: {booking.service_name} with {booking.provider.business_name}"
        time_str = format_ist_datetime(booking.start_at)
        
        message = (
            f"Hello {booking.customer.get_full_name() or booking.customer.username},\n\n"
            f"Your appointment has been confirmed!\n\n"
            f"Service: {booking.service_name}\n"
            f"Provider: {booking.provider.business_name}\n"
            f"Date & Time: {time_str}\n"
            f"Duration: {booking.service_duration} minutes\n"
            f"Price: Rs. {booking.service_price}\n"
            f"Location / Address: {booking.provider.address or 'Online / At provider location'}\n"
        )
        if booking.notes:
            message += f"Notes: {booking.notes}\n"
        message += (
            f"\nCancellation Policy: Cancellations and rescheduling are permitted up to 4 hours prior to the appointment.\n\n"
            f"Thank you for choosing SlotSync!"
        )
        
        recipient_list = [booking.customer.email]
        if booking.provider.user.email and booking.provider.user.email != booking.customer.email:
            recipient_list.append(booking.provider.user.email)
            
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@slotsync.local',
            recipient_list=recipient_list,
            fail_silently=True,
        )
    except Exception as e:
        logger.warning(f"Failed to send booking confirmation email for #{booking_id}: {e}")


def send_booking_cancelled_email(booking_id: int):
    try:
        booking = Booking.objects.select_related('customer', 'provider', 'provider__user').get(pk=booking_id)
        subject = f"Appointment Cancelled: {booking.service_name} with {booking.provider.business_name}"
        time_str = format_ist_datetime(booking.start_at)
        
        message = (
            f"Hello,\n\n"
            f"The appointment for {booking.service_name} on {time_str} has been cancelled.\n\n"
            f"Cancelled by: {booking.get_cancelled_by_display() if hasattr(booking, 'get_cancelled_by_display') else booking.cancelled_by}\n"
        )
        if booking.cancel_reason:
            message += f"Reason: {booking.cancel_reason}\n"
        message += "\nIf this was unexpected, please visit SlotSync to book a new appointment."
        
        recipient_list = [booking.customer.email]
        if booking.provider.user.email and booking.provider.user.email != booking.customer.email:
            recipient_list.append(booking.provider.user.email)
            
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@slotsync.local',
            recipient_list=recipient_list,
            fail_silently=True,
        )
    except Exception as e:
        logger.warning(f"Failed to send booking cancellation email for #{booking_id}: {e}")


def send_booking_rescheduled_email(booking_id: int):
    try:
        booking = Booking.objects.select_related('customer', 'provider', 'provider__user').get(pk=booking_id)
        subject = f"Appointment Rescheduled: {booking.service_name} with {booking.provider.business_name}"
        new_time_str = format_ist_datetime(booking.start_at)
        
        message = (
            f"Hello {booking.customer.get_full_name() or booking.customer.username},\n\n"
            f"Your appointment has been successfully rescheduled.\n\n"
            f"Service: {booking.service_name}\n"
            f"Provider: {booking.provider.business_name}\n"
            f"New Date & Time: {new_time_str}\n"
            f"Duration: {booking.service_duration} minutes\n\n"
            f"Cancellation Policy: Changes can be made up to 4 hours before the appointment.\n"
        )
        
        recipient_list = [booking.customer.email]
        if booking.provider.user.email and booking.provider.user.email != booking.customer.email:
            recipient_list.append(booking.provider.user.email)
            
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL if hasattr(settings, 'DEFAULT_FROM_EMAIL') else 'noreply@slotsync.local',
            recipient_list=recipient_list,
            fail_silently=True,
        )
    except Exception as e:
        logger.warning(f"Failed to send booking reschedule email for #{booking_id}: {e}")
