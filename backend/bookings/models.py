from django.db import models
from django.conf import settings
from providers.models import ProviderProfile, Service


class Booking(models.Model):
    """Core appointment booking record with immutable service snapshots."""

    STATUS_CONFIRMED = 'confirmed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_COMPLETED = 'completed'
    STATUS_NO_SHOW = 'no_show'

    STATUS_CHOICES = (
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_CANCELLED, 'Cancelled'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_NO_SHOW, 'No Show'),
    )

    CANCELLED_BY_CUSTOMER = 'customer'
    CANCELLED_BY_PROVIDER = 'provider'
    CANCELLED_BY_ADMIN = 'admin'

    CANCELLED_BY_CHOICES = (
        (CANCELLED_BY_CUSTOMER, 'Customer'),
        (CANCELLED_BY_PROVIDER, 'Provider'),
        (CANCELLED_BY_ADMIN, 'Admin'),
    )

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='customer_bookings'
    )
    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.PROTECT,
        related_name='provider_bookings'
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name='bookings'
    )

    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_CONFIRMED,
        db_index=True
    )

    # Immutable snapshot captured at booking creation time
    service_name = models.CharField(max_length=150)
    service_duration = models.PositiveIntegerField(help_text='Duration in minutes captured at booking time')
    service_price = models.DecimalField(max_digits=10, decimal_places=2, help_text='Price captured at booking time')

    # Lifecycle and audit fields
    notes = models.TextField(blank=True)
    cancelled_by = models.CharField(max_length=20, choices=CANCELLED_BY_CHOICES, null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.TextField(blank=True)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_at']
        indexes = [
            models.Index(fields=['provider', 'start_at']),
            models.Index(fields=['customer', 'start_at']),
            models.Index(fields=['status', 'start_at']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Booking #{self.id}: {self.customer.username} with {self.provider.business_name} at {self.start_at.strftime('%Y-%m-%d %H:%M')}"
