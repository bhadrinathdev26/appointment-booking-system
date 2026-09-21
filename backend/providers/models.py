from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


class ProviderProfile(models.Model):
    """Business profile for service providers (clinics, salons, tutors)."""

    CATEGORY_CLINIC = 'clinic'
    CATEGORY_SALON = 'salon'
    CATEGORY_TUTOR = 'tutor'
    CATEGORY_FITNESS = 'fitness'
    CATEGORY_CONSULTING = 'consulting'
    CATEGORY_OTHER = 'other'

    CATEGORY_CHOICES = (
        (CATEGORY_CLINIC, 'Clinic / Healthcare'),
        (CATEGORY_SALON, 'Salon & Spa'),
        (CATEGORY_TUTOR, 'Tutoring & Education'),
        (CATEGORY_FITNESS, 'Fitness & Personal Training'),
        (CATEGORY_CONSULTING, 'Consulting & Legal'),
        (CATEGORY_OTHER, 'Other Services'),
    )

    SLOT_INTERVAL_CHOICES = (
        (10, '10 minutes'),
        (15, '15 minutes'),
        (20, '20 minutes'),
        (30, '30 minutes'),
        (60, '60 minutes'),
    )

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='provider_profile'
    )
    business_name = models.CharField(max_length=200, db_index=True)
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        default=CATEGORY_OTHER,
        db_index=True
    )
    description = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    slot_interval_minutes = models.IntegerField(
        choices=SLOT_INTERVAL_CHOICES,
        default=30,
        help_text='Granularity of generated time slots'
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text='If deactivated, provider is hidden from directory and cannot receive new bookings'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['business_name']

    def __str__(self):
        return f"{self.business_name} ({self.get_category_display()})"


class Service(models.Model):
    """Service offerings published by a provider."""

    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='services'
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField(
        help_text='Service duration in minutes (must be multiple of 5 between 5 and 480)'
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text='Cost of the service'
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text='Deactivated services are hidden from new booking requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def clean(self):
        if self.duration_minutes is not None:
            if self.duration_minutes < 5 or self.duration_minutes > 480:
                raise ValidationError({'duration_minutes': 'Duration must be between 5 and 480 minutes.'})
            if self.duration_minutes % 5 != 0:
                raise ValidationError({'duration_minutes': 'Duration must be an exact multiple of 5 minutes.'})

    def __str__(self):
        return f"{self.name} ({self.duration_minutes}m - ₹{self.price})"


class WorkingHours(models.Model):
    """Recurring weekly working hour intervals for a provider."""

    WEEKDAY_CHOICES = (
        (0, 'Monday'),
        (1, 'Tuesday'),
        (2, 'Wednesday'),
        (3, 'Thursday'),
        (4, 'Friday'),
        (5, 'Saturday'),
        (6, 'Sunday'),
    )

    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='working_hours'
    )
    weekday = models.IntegerField(choices=WEEKDAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday', 'start_time']
        verbose_name_plural = 'Working Hours'

    def __str__(self):
        return f"{self.provider.business_name}: {self.get_weekday_display()} {self.start_time.strftime('%H:%M')}-{self.end_time.strftime('%H:%M')}"


class TimeOff(models.Model):
    """Scheduled provider leaves, vacations, or holidays that block availability."""

    provider = models.ForeignKey(
        ProviderProfile,
        on_delete=models.CASCADE,
        related_name='time_offs'
    )
    start_at = models.DateTimeField(db_index=True)
    end_at = models.DateTimeField(db_index=True)
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_at']
        verbose_name_plural = 'Time Offs'

    def __str__(self):
        return f"{self.provider.business_name} Leave: {self.start_at.strftime('%Y-%m-%d %H:%M')} to {self.end_at.strftime('%Y-%m-%d %H:%M')}"
