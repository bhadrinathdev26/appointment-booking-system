import zoneinfo
from datetime import datetime, date, time, timedelta
from django.core.management.base import BaseCommand
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from providers.models import ProviderProfile, Service, WorkingHours, TimeOff
from bookings.models import Booking

User = get_user_model()
IST = zoneinfo.ZoneInfo('Asia/Kolkata')


class Command(BaseCommand):
    help = "Seeds demo users, providers, services, working schedules, and realistic appointments."

    def add_arguments(self, parser):
        parser.add_argument(
            '--allow-production',
            action='store_true',
            help='Allow running demo seed even when DEBUG=False'
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options.get('allow_production'):
            self.stderr.write(self.style.ERROR(
                "ERROR: seed_demo cannot run when DEBUG=False without --allow-production flag."
            ))
            return

        self.stdout.write(self.style.NOTICE("Starting demo dataset seeding..."))

        # 1. Admin Account
        admin_user, created = User.objects.get_or_create(
            email='admin@slotsync.local',
            defaults={
                'username': 'admin',
                'first_name': 'Platform',
                'last_name': 'Administrator',
                'role': User.ROLE_ADMIN,
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password('AdminPass123!')
        admin_user.role = User.ROLE_ADMIN
        admin_user.save()

        # 2. Providers
        providers_data = [
            {
                'email': 'aisha.sharma@slotsync.local',
                'username': 'dr_aisha',
                'first_name': 'Aisha',
                'last_name': 'Sharma',
                'phone': '+91 98765 43210',
                'business_name': 'Apex Dental Care',
                'category': 'clinic',
                'interval': 30,
                'address': 'Suite 402, Lotus Health Plaza, Indiranagar, Bengaluru',
                'description': 'Over 12 years of experience in modern cosmetic dentistry and pain-free preventative dental care.',
                'hours': [
                    (0, time(9, 0), time(13, 0)), (0, time(14, 0), time(18, 0)),
                    (1, time(9, 0), time(13, 0)), (1, time(14, 0), time(18, 0)),
                    (2, time(9, 0), time(13, 0)), (2, time(14, 0), time(18, 0)),
                    (3, time(9, 0), time(13, 0)), (3, time(14, 0), time(18, 0)),
                    (4, time(9, 0), time(13, 0)), (4, time(14, 0), time(18, 0)),
                ],
                'services': [
                    ('Routine Dental Checkup & Cleaning', 30, 500.00),
                    ('Deep Scaling & Polishing', 45, 1200.00),
                    ('Root Canal & Crown Consultation', 60, 1800.00),
                ]
            },
            {
                'email': 'marcus.vance@slotsync.local',
                'username': 'marcus_vance',
                'first_name': 'Marcus',
                'last_name': 'Vance',
                'phone': '+91 98765 43211',
                'business_name': 'Urban Edge Salon',
                'category': 'salon',
                'interval': 30,
                'address': 'Shop 12, Phoenix Marketcity, Whitefield, Bengaluru',
                'description': 'Precision haircuts, classic beard grooming, and modern styling tailored to your lifestyle.',
                'hours': [
                    (1, time(10, 0), time(14, 0)), (1, time(15, 0), time(20, 0)),
                    (2, time(10, 0), time(14, 0)), (2, time(15, 0), time(20, 0)),
                    (3, time(10, 0), time(14, 0)), (3, time(15, 0), time(20, 0)),
                    (4, time(10, 0), time(14, 0)), (4, time(15, 0), time(20, 0)),
                    (5, time(10, 0), time(14, 0)), (5, time(15, 0), time(20, 0)),
                    (6, time(11, 0), time(17, 0)),
                ],
                'services': [
                    ('Signature Haircut & Wash', 30, 450.00),
                    ('Beard Sculpting & Hot Towel', 30, 300.00),
                    ('Executive Complete Grooming Package', 60, 1100.00),
                ]
            },
            {
                'email': 'elena.rostova@slotsync.local',
                'username': 'elena_rostova',
                'first_name': 'Elena',
                'last_name': 'Rostova',
                'phone': '+91 98765 43212',
                'business_name': 'Master Piano & Music Studio',
                'category': 'tutor',
                'interval': 30,
                'address': 'Studio 8B, Harmony Enclave, Koramangala, Bengaluru',
                'description': 'Concert pianist and conservatory instructor teaching classical and contemporary piano technique.',
                'hours': [
                    (0, time(14, 0), time(19, 0)),
                    (2, time(14, 0), time(19, 0)),
                    (4, time(14, 0), time(19, 0)),
                    (5, time(10, 0), time(15, 0)),
                ],
                'services': [
                    ('Beginner Piano Technique & Reading', 45, 700.00),
                    ('Advanced Classical Coaching', 45, 1000.00),
                    ('Comprehensive Theory & Sight Reading', 45, 650.00),
                ]
            }
        ]

        created_providers = []
        for pdata in providers_data:
            u, _ = User.objects.get_or_create(
                email=pdata['email'],
                defaults={
                    'username': pdata['username'],
                    'first_name': pdata['first_name'],
                    'last_name': pdata['last_name'],
                    'phone': pdata['phone'],
                    'role': User.ROLE_PROVIDER,
                }
            )
            u.set_password('DemoPass123!')
            u.role = User.ROLE_PROVIDER
            u.save()

            prof, _ = ProviderProfile.objects.get_or_create(
                user=u,
                defaults={
                    'business_name': pdata['business_name'],
                    'category': pdata['category'],
                    'slot_interval_minutes': pdata['interval'],
                    'address': pdata['address'],
                    'description': pdata['description'],
                    'phone': pdata['phone'],
                }
            )
            prof.business_name = pdata['business_name']
            prof.category = pdata['category']
            prof.slot_interval_minutes = pdata['interval']
            prof.description = pdata['description']
            prof.save()

            # Working Hours
            WorkingHours.objects.filter(provider=prof).delete()
            for day, st, et in pdata['hours']:
                WorkingHours.objects.create(provider=prof, weekday=day, start_time=st, end_time=et)

            # Services
            Service.objects.filter(provider=prof).delete()
            created_services = []
            for sname, dur, price in pdata['services']:
                srv = Service.objects.create(
                    provider=prof,
                    name=sname,
                    duration_minutes=dur,
                    price=price,
                    is_active=True
                )
                created_services.append(srv)

            created_providers.append((prof, created_services))

        # 3. Customers
        customers_data = [
            ('rahul.verma@example.com', 'rahul_verma', 'Rahul', 'Verma', '+91 91234 56780'),
            ('priya.nair@example.com', 'priya_nair', 'Priya', 'Nair', '+91 91234 56781'),
            ('amit.patel@example.com', 'amit_patel', 'Amit', 'Patel', '+91 91234 56782'),
            ('sneha.reddy@example.com', 'sneha_reddy', 'Sneha', 'Reddy', '+91 91234 56783'),
            ('vikram.singh@example.com', 'vikram_singh', 'Vikram', 'Singh', '+91 91234 56784'),
        ]

        created_customers = []
        for em, un, fn, ln, ph in customers_data:
            cust, _ = User.objects.get_or_create(
                email=em,
                defaults={
                    'username': un,
                    'first_name': fn,
                    'last_name': ln,
                    'phone': ph,
                    'role': User.ROLE_CUSTOMER,
                }
            )
            cust.set_password('DemoPass123!')
            cust.role = User.ROLE_CUSTOMER
            cust.save()
            created_customers.append(cust)

        # 4. Realistic Appointments (~40 bookings across past 14 days and next 14 days)
        Booking.objects.all().delete()
        now_ist = timezone.now().astimezone(IST)

        # Past completed bookings (generate revenue & past history)
        past_offsets = [-14, -12, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1]
        booking_count = 0

        for i, day_offset in enumerate(past_offsets):
            appt_date = (now_ist + timedelta(days=day_offset)).date()
            p_idx = i % len(created_providers)
            c_idx = i % len(created_customers)
            prof, services = created_providers[p_idx]
            cust = created_customers[c_idx]
            srv = services[0]

            start_dt = datetime.combine(appt_date, time(10, 0)).replace(tzinfo=IST)
            end_dt = start_dt + timedelta(minutes=srv.duration_minutes)

            Booking.objects.create(
                customer=cust,
                provider=prof,
                service=srv,
                start_at=start_dt,
                end_at=end_dt,
                status=Booking.STATUS_COMPLETED,
                service_name=srv.name,
                service_duration=srv.duration_minutes,
                service_price=srv.price,
                notes="Follow-up requested after session.",
            )
            booking_count += 1

            srv2 = services[1]
            start_dt2 = datetime.combine(appt_date, time(14, 0)).replace(tzinfo=IST)
            end_dt2 = start_dt2 + timedelta(minutes=srv2.duration_minutes)
            cust2 = created_customers[(c_idx + 1) % len(created_customers)]

            Booking.objects.create(
                customer=cust2,
                provider=prof,
                service=srv2,
                start_at=start_dt2,
                end_at=end_dt2,
                status=Booking.STATUS_COMPLETED,
                service_name=srv2.name,
                service_duration=srv2.duration_minutes,
                service_price=srv2.price,
                notes="Routine regular checkup.",
            )
            booking_count += 1

        # Past cancelled bookings
        for i in range(4):
            appt_date = (now_ist - timedelta(days=i + 2)).date()
            prof, services = created_providers[i % len(created_providers)]
            cust = created_customers[(i + 2) % len(created_customers)]
            srv = services[0]
            start_dt = datetime.combine(appt_date, time(11, 30)).replace(tzinfo=IST)
            end_dt = start_dt + timedelta(minutes=srv.duration_minutes)

            Booking.objects.create(
                customer=cust,
                provider=prof,
                service=srv,
                start_at=start_dt,
                end_at=end_dt,
                status=Booking.STATUS_CANCELLED,
                service_name=srv.name,
                service_duration=srv.duration_minutes,
                service_price=srv.price,
                cancelled_by=Booking.CANCELLED_BY_CUSTOMER,
                cancelled_at=start_dt - timedelta(days=1),
                cancel_reason="Work schedule change.",
            )
            booking_count += 1

        # Past no-show bookings
        for i in range(2):
            appt_date = (now_ist - timedelta(days=i + 1)).date()
            prof, services = created_providers[(i + 1) % len(created_providers)]
            cust = created_customers[(i + 3) % len(created_customers)]
            srv = services[0]
            start_dt = datetime.combine(appt_date, time(16, 0)).replace(tzinfo=IST)
            end_dt = start_dt + timedelta(minutes=srv.duration_minutes)

            Booking.objects.create(
                customer=cust,
                provider=prof,
                service=srv,
                start_at=start_dt,
                end_at=end_dt,
                status=Booking.STATUS_NO_SHOW,
                service_name=srv.name,
                service_duration=srv.duration_minutes,
                service_price=srv.price,
                notes="Patient did not arrive or respond.",
            )
            booking_count += 1

        # Future upcoming confirmed bookings (next 1 to 10 days)
        future_offsets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        for i, day_offset in enumerate(future_offsets):
            appt_date = (now_ist + timedelta(days=day_offset)).date()
            p_idx = i % len(created_providers)
            c_idx = i % len(created_customers)
            prof, services = created_providers[p_idx]
            cust = created_customers[c_idx]
            srv = services[i % len(services)]

            start_dt = datetime.combine(appt_date, time(10, 0)).replace(tzinfo=IST)
            end_dt = start_dt + timedelta(minutes=srv.duration_minutes)

            Booking.objects.create(
                customer=cust,
                provider=prof,
                service=srv,
                start_at=start_dt,
                end_at=end_dt,
                status=Booking.STATUS_CONFIRMED,
                service_name=srv.name,
                service_duration=srv.duration_minutes,
                service_price=srv.price,
                notes=f"Confirmed upcoming appointment for {cust.first_name}.",
            )
            booking_count += 1

        self.stdout.write(self.style.SUCCESS(f"Created {booking_count} realistic appointment records!"))

        # Output credentials table
        self.stdout.write("\n" + "=" * 70)
        self.stdout.write(self.style.SUCCESS("SLOTSYNC DEMO DATA SEEDING COMPLETE"))
        self.stdout.write("=" * 70)
        self.stdout.write("Role       | Email                          | Password")
        self.stdout.write("-" * 70)
        self.stdout.write("Admin      | admin@slotsync.local           | AdminPass123!")
        self.stdout.write("Provider 1 | aisha.sharma@slotsync.local   | DemoPass123! (Dental Clinic)")
        self.stdout.write("Provider 2 | marcus.vance@slotsync.local    | DemoPass123! (Salon)")
        self.stdout.write("Provider 3 | elena.rostova@slotsync.local   | DemoPass123! (Music Tutor)")
        self.stdout.write("Customer 1 | rahul.verma@example.com        | DemoPass123!")
        self.stdout.write("Customer 2 | priya.nair@example.com         | DemoPass123!")
        self.stdout.write("Customer 3 | amit.patel@example.com          | DemoPass123!")
        self.stdout.write("Customer 4 | sneha.reddy@example.com        | DemoPass123!")
        self.stdout.write("Customer 5 | vikram.singh@example.com       | DemoPass123!")
        self.stdout.write("=" * 70 + "\n")
