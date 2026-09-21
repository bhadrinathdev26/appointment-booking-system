# SlotSync (Appointment & Slot Booking System) — Developer Learning Guide & Interview Prep

This document tracks technical decisions, architectural patterns, and interview preparation questions across all development phases of the Appointment / Slot Booking System.

---

## Phase 1: Database Setup, PyMySQL Shim & Project Scaffolding

### Key Technical Decisions
1. **Isolated Database User Privileges:**
   - Dedicated user `booking_user` granted `ALL PRIVILEGES` strictly on `booking_db.*` and `test_booking_db.*`.
   - No broad global privileges (`CREATE, DROP ON *.*`) were granted, maintaining strict database principle of least privilege.
2. **PyMySQL Shim for Windows Compatibility:**
   - Python 3.12 on Windows uses `pymysql.install_as_MySQLdb()` in `core/__init__.py` to provide a drop-in C-extension replacement without compilation issues.
3. **Time Zone Configuration:**
   - `USE_TZ = True`, `TIME_ZONE = 'Asia/Kolkata'`.
   - UTC storage in MySQL with localized calculations in Indian Standard Time (IST).
4. **MySQL Date Truncation Caveat:**
   - On MySQL, `__date` lookups and `TruncDate` require time zone tables loaded into the MySQL server's `mysql.time_zone` tables. Since local and free cloud MySQL instances usually lack these tables, date filtering is strictly performed using **aware datetime ranges** computed in Python (`start_of_day` to `start_of_next_day`), ensuring robust operations across any MySQL host.

### Interview Questions for Phase 1
- **Q: Why avoid `__date` or `TruncDate` with MySQL in Django?**
  *A:* "Django translates `__date` lookups to MySQL's `CONVERT_TZ()` function. If the server's time zone tables aren't populated, `CONVERT_TZ()` returns `NULL`, causing queries to unexpectedly return empty results. By constructing timezone-aware range boundaries in Python (`start_at__gte=day_start, start_at__lt=day_end`), we guarantee accurate filtering regardless of server configuration."
- **Q: Why create custom User model in the very first migration?**
  *A:* "Django's `AUTH_USER_MODEL` setting cannot be safely changed after the initial migration without manually rewriting foreign keys across content types, auth, and admin tables. Setting it up first ensures a clean schema."

---

## Phase 2: Custom User, RBAC, Authentication & Admin Safeguards

### Key Technical Decisions
1. **Unique Email as Authentication Identifier:**
   - Standardized on email login with automatic lowercase normalization on registration and login.
2. **Strict Public Role Guardrails:**
   - Public registration unconditionally forces `role='customer'`. Request payloads attempting to supply `role='admin'` or `role='provider'` are safely overridden.
3. **Provider Role Immutability:**
   - Providers have dedicated business profiles, services, working hours, and bookings. Changing a provider's role would orphan related data. Therefore, provider roles are immutable; providers can only be deactivated, which preserves past appointments.
4. **Administrative Protection Invariants:**
   - Self-deactivation by an administrator is rejected (HTTP 400).
   - Deactivation or demotion of the last remaining active administrator is prevented.
   - User deletion is completely disabled (`HTTP 405 Method Not Allowed`).

### Interview Questions for Phase 2
- **Q: How does your system prevent privilege escalation during user registration?**
  *A:* "In `RegisterSerializer.create()`, the `role` field is explicitly set to `User.ROLE_CUSTOMER` in Python code, ignoring any client-supplied role parameter. Furthermore, serializers for user self-updates mark `role` as read-only."
- **Q: Why can't a Provider role be changed to a Customer or Admin?**
  *A:* "In a service marketplace, providers hold foreign key references across working schedules, services, and appointment snapshots. Demoting or altering a provider's role would create architectural inconsistency. Instead, providers are deactivated, which safely hides them from new customer discovery while keeping existing bookings intact."

---

## Phase 3: Provider Profile, Services, Working Hours & Time-Off Integrity

### Key Technical Decisions
1. **DRF Serializer Validation over `Model.clean()`:**
   - In Django REST Framework, `model.clean()` is not invoked automatically during serializer validation. All schedule interval constraints, duration multiples of 5, and leave overlap checks are implemented directly in serializer `validate()` methods.
2. **Preventing Broken Past Bookings via Soft Service Deactivation:**
   - When a provider deletes a service that has past or existing appointments, the service is soft-deactivated (`is_active = False`) instead of hard deleted. This preserves historical invoice records while hiding the service from new booking requests.
3. **Pessimistic Locking on Time-Off Scheduling:**
   - To prevent a race condition where a customer books an appointment at the exact millisecond a provider schedules a leave, `TimeOff` creation acquires a row lock on `ProviderProfile` before inspecting confirmed bookings. Conflicting bookings are returned in a structured 400 error payload.

### Interview Questions for Phase 3
- **Q: How do you handle multi-interval working hours (e.g. lunch breaks)?**
  *A:* "Rather than storing a single start and end time per day, `WorkingHours` stores multiple distinct intervals per weekday. Each interval is validated so that `end_time > start_time` and no two intervals overlap on the same weekday for that provider. A gap between two intervals (e.g., 13:00 to 14:00) represents an unbookable break."
- **Q: Why do you lock the provider row when scheduling time off?**
  *A:* "Without locking, a customer transaction could confirm a new booking after our query checks for conflicts but before the `TimeOff` record is inserted. Locking the provider row serializes both operations, preventing overlapping appointments and leaves."

---

## Phase 4: Dynamic Slot Generation Algorithm & Availability

### Key Technical Decisions
1. **On-Demand Calculation vs Phantom Slot Storage:**
   - Rather than pre-generating and storing millions of potential appointment slots in the database, slots are computed dynamically on request in memory. This eliminates stale state and complex batch generation jobs.
2. **Optimized Query Efficiency (Max 2 DB Queries per Day / Month):**
   - For a single day, the generator executes at most 2 queries: one for the day's confirmed bookings and one for scheduled time-offs.
   - For the month-availability calendar endpoint, the service fetches the entire month's bookings and time-offs in **exactly 2 queries**, then computes day availability in memory rather than running 31 separate queries.
3. **Strict Overlap Detection Logic:**
   - A candidate slot `[s, e]` overlaps with an existing interval `[b_start, b_end]` if and only if:
     $$\text{s} < \text{b\_end} \quad \text{AND} \quad \text{e} > \text{b\_start}$$
   - This mathematically allows back-to-back bookings (e.g. an appointment ending at 10:30 and the next starting at 10:30 do not overlap).
4. **Boundary Invariants:**
   - A slot starting exactly `MIN_NOTICE_HOURS` (2 hours) from the current timestamp is allowed (`>= min_start_time`).
   - Appointments beyond `MAX_ADVANCE_DAYS` (60 days) are excluded.

### Interview Questions for Phase 4
- **Q: Why calculate slots dynamically instead of storing available slots in a database table?**
  *A:* "Storing future empty slots creates massive database bloat and synchronization nightmares whenever a provider modifies their weekly working hours, takes a day off, or changes their slot duration. Dynamic calculation takes milliseconds, executes only two bounded queries, and guarantees zero stale availability."
- **Q: How do you verify that back-to-back appointments do not conflict?**
  *A:* "Using strict inequality overlap checking (`slot_start < existing_end AND slot_end > existing_start`). If Slot A is 10:00 to 10:30 and Slot B is 10:30 to 11:00, `slot_start (10:30) < existing_end (10:30)` evaluates to `False`, so no conflict is detected and the slot is rightly marked available."

---

## Phase 5: Booking Creation with Locking & Lifecycle

### Key Technical Decisions
1. **Strict Double-Locking Hierarchy (Customer -> Provider -> Booking):**
   - To prevent deadlocks under high concurrency, all transactional booking operations acquire pessimistic row locks in a strictly uniform order:
     1. Customer row (`User.objects.select_for_update()`)
     2. Provider row (`ProviderProfile.objects.select_for_update()`)
     3. Booking row (`Booking.objects.select_for_update()`, if updating/rescheduling)
   - Because all transactions acquire locks in this exact identical sequence, circular wait conditions (deadlocks) are mathematically impossible.
2. **Fresh Verification Under Pessimistic Lock:**
   - Once locks are acquired, the transaction re-fetches the `Service`, `ProviderProfile`, and provider's `User` record to ensure all entities are still active (`is_active=True`). This guards against the race condition where an admin or provider deactivates an account or service while a booking payload is in flight.
3. **Customer Self-Overlap Prevention:**
   - Locking the customer row allows an atomic query across the customer's own confirmed bookings. Even if a customer fires concurrent requests to book two different providers at the exact same hour, only one can acquire the customer lock first; the second will detect the time overlap and be rejected with HTTP 409 Conflict.
4. **Snapshot Preservation for Historical and Rescheduling Accuracy:**
   - At booking time, `service_name`, `service_duration`, and `service_price` are captured permanently on the `Booking` record.
   - When rescheduling, the booking's new end time is calculated using `booking.service_duration`, preserving the original terms even if the provider has modified the service duration since the initial booking.
5. **Enforcing Cutoff Windows:**
   - Customers may only cancel or reschedule appointments **strictly more than 4 hours** ahead (`CANCEL_CUTOFF_HOURS = 4`). Requests made $\le 4$ hours before `start_at` are rejected with HTTP 400.
   - Providers and Admins can cancel or reschedule any time prior to the start time.
   - Once an appointment has started or concluded, it cannot be cancelled or rescheduled.
6. **Scoped Access and REST Immutability:**
   - Direct `PUT`, `PATCH`, and `DELETE` requests to `/api/bookings/{id}/` are blocked with `HTTP 405 Method Not Allowed`. Status transitions must follow explicit action verbs (`/cancel/`, `/reschedule/`, `/complete/`, `/no-show/`).
   - `BookingViewSet.get_queryset()` scopes records automatically based on user role: Customers see only their bookings, Providers see bookings assigned to their business, and Admins see everything. A customer querying another customer's booking receives a clean `404 Not Found`, not a revealing `403 Forbidden`.
7. **Thread Cleanup in Concurrency Tests:**
   - Multi-threaded race condition tests (`TransactionTestCase`) explicitly invoke `connection.close()` in worker `finally` blocks, preventing stalled MySQL connection pools during test runner teardown.

### Interview Questions for Phase 5
- **Q: How do you prevent double bookings when two users try to book the exact same slot at the exact same millisecond?**
  *A:* "We wrap booking creation in a database transaction with pessimistic locking (`SELECT ... FOR UPDATE`). We lock the provider's row first, re-calculate the available slots under that lock, and verify slot availability. If user A's transaction commits first, user B's transaction will re-evaluate availability once it acquires the lock, discover the slot is no longer open, and raise a `ConflictError` resulting in an HTTP 409 Conflict response."
- **Q: How do you prevent a customer from booking two different providers at the exact same time?**
  *A:* "By locking the customer row with `select_for_update()` before checking the customer's existing bookings. Any concurrent booking attempts for the same customer are serialized by that lock, ensuring the second transaction sees the first booking and rejects the overlapping appointment."
- **Q: Why snapshot service duration and price on the booking model?**
  *A:* "A service business frequently updates its prices or service lengths. If a customer booked a 30-minute massage for Rs. 500, and the provider later increases the price to Rs. 800 or changes the duration to 45 minutes, the existing booking and invoice must remain unchanged. When rescheduling, we must also honor the booked duration snapshot."

---

## Phase 6: Notifications, ICS Calendar Generation, Reminders & Dashboard Aggregations

### Key Technical Decisions
1. **RFC 5545 iCalendar Standard Compliance:**
   - The `.ics` calendar download endpoint generates standard RFC 5545 calendar feeds directly from appointment records.
   - **Line Endings:** RFC 5545 strictly mandates `\r\n` (CRLF) line delimiters. Standard Unix `\n` line breaks cause import errors on Microsoft Outlook, Apple Calendar, and Google Calendar.
   - **UTC Timestamps:** All dates are converted to UTC and formatted as `YYYYMMDDTHHMMSSZ` (`Z` suffix denoting Zulu / UTC time) to avoid time zone ambiguity when imported into client devices set to different time zones.
   - **Stable UIDs:** Unique identifiers formatted as `booking-{id}@{domain}` ensure that downloading an updated `.ics` file for a rescheduled appointment updates the existing calendar event on the user's phone or desktop rather than creating a duplicate entry.
   - **Access Scoping:** The ICS endpoint enforces standard object ownership, returning `404 Not Found` if a customer attempts to download an iCalendar file for another user's appointment.
2. **Idempotent Automated Reminders via Management Command:**
   - The `send_reminders` command queries confirmed bookings occurring within the rolling 24-hour window where `reminder_sent_at` is `NULL`.
   - By immediately recording `reminder_sent_at = timezone.now()` within the update flow, subsequent or repeated runs of the command (e.g. from a recurring cron job every hour) will never re-send duplicate notifications to the same client.
3. **Database-Agnostic Dashboard Aggregation:**
   - To report daily booking volumes over the past 14 days on the Admin dashboard without depending on MySQL's timezone tables (`mysql.time_zone`), the system generates aware datetime ranges in Python and aggregates counts in memory.
   - For Providers, today's schedule is bounded using local IST midnight-to-midnight ranges, and the revenue sum is calculated over completed appointments using Django's `aggregate(models.Sum('service_price'))`.
4. **Defensive Demo Dataset Seeding:**
   - The `seed_demo` command refuses execution if `DEBUG=False` unless the explicit `--allow-production` flag is passed, preventing accidental test data injection into live production databases.
   - It provisions realistic multi-interval weekly schedules, clinic/salon/tutor services, and 40 appointments distributed realistically across past completed, cancelled, and upcoming confirmed states.

### Interview Questions for Phase 6
- **Q: What are the common pitfalls when generating `.ics` iCalendar files dynamically?**
  *A:* "First, failing to use CRLF (`\r\n`) line terminators as required by RFC 5545, which breaks parsers in Outlook and Apple Calendar. Second, using local or naive timestamps instead of UTC Zulu format (`YYYYMMDDTHHMMSSZ`). Third, omitting a deterministic UID, which causes calendar apps to duplicate events on reschedule instead of updating the existing entry."
- **Q: How do you ensure automated reminder commands do not send duplicate emails if executed multiple times?**
  *A:* "By adding a `reminder_sent_at` timestamp field to the `Booking` model. The query explicitly filters by `reminder_sent_at__isnull=True`. As soon as an email is dispatched, `reminder_sent_at` is updated and saved. Any subsequent cron invocation ignores already-reminded appointments."

---

## Phase 7: Frontend Scaffolding, JWT Refresh Interceptor & Foundational Layout

### Key Technical Decisions
1. **Concurrency-Safe Axios Refresh Interceptor:**
   - In single-page applications, multiple parallel API calls may fail with `401 Unauthorized` simultaneously when an access token expires.
   - The Axios interceptor uses a `isRefreshing` mutex flag and a `failedQueue` promise array. When the first 401 triggers, subsequent failed requests are queued. Once the refresh token request succeeds, all queued requests are resolved with the new access token and retried without re-prompting the user.
2. **Deterministic IST Time Zone Formatting on Client:**
   - Client machines may be running in any local time zone (e.g. UTC, US/Pacific, BST). If the client formats timestamps using standard browser `Intl` or `Date.prototype.toLocaleString()`, slots and working hours would display in the client's local time rather than the business's timezone.
   - Using `formatInTimeZone(date, 'Asia/Kolkata', ...)` from `date-fns-tz` guarantees that appointment slots, calendar grids, and cancellation policies display uniformly in Indian Standard Time (IST).
3. **Demo Sandbox Architecture:**
   - Real-world hiring managers and interviewers often test portfolio projects without wanting to register a new account or copy-paste credentials.
   - When `VITE_DEMO_MODE=true`, the `DemoBanner` renders a quick 1-click persona switcher (Admin, Clinic Provider, Salon Provider, and Customer). In production mode, this flag is disabled without touching application logic.

### Interview Questions for Phase 7
- **Q: How do you handle simultaneous 401 errors when an access token expires while multiple API calls are in flight?**
  *A:* "Using a queue mechanism in the Axios response interceptor. We flag `isRefreshing = true` on the first 401 and queue all subsequent failed requests in an array of pending promises. When the refresh endpoint returns a fresh access token, we process the queue, update the authorization headers, and replay all original requests seamlessly."
- **Q: Why format dates with an explicit time zone like `Asia/Kolkata` on the frontend instead of relying on the user's browser clock?**
  *A:* "Service businesses operate in fixed geographic locations. If an overseas interviewer opens the app from London or New York, relying on browser local time would cause a 10:00 AM IST clinic slot to display as 4:30 AM or 00:30 AM, confusing slot availability and calendar navigation. Locking display formatting to the business timezone ensures consistency."

---

## Phase 8: Public Directory, Search, Filtering & Provider Overview

### Key Technical Decisions
1. **Multi-Criteria Client & Server Filtering:**
   - The public directory allows instant category filtering (Clinics, Salons, Tutors, Fitness, Consulting) with real-time text searching matching business names, descriptions, or offered service titles.
2. **Clean Public/Protected Route Separation:**
   - Anyone can discover providers, inspect service offerings, and check pricing without being forced to authenticate first. Authentication is only required when clicking to book a chosen slot.

### Interview Questions for Phase 8
- **Q: Why allow unauthenticated users to browse the directory and view slots?**
  *A:* "Public discovery maximizes booking conversion. Requiring account registration upfront creates friction. Allowing users to find a provider, pick their preferred date, and choose a slot before requesting login mirrors modern platforms like Calendly, Airbnb, and Practo."

---

## Phase 9: Interactive 3-Step Dynamic Booking Flow & Conflict Recovery

### Key Technical Decisions
1. **Optimized Calendar Month Queries:**
   - When a user selects a service, the calendar queries `/api/providers/{id}/availability/days/?service={id}&month={YYYY-MM}`. The backend returns only dates containing at least one open slot, allowing `react-day-picker` to disable all booked, closed, or time-off days automatically.
2. **Graceful 409 Conflict Recovery:**
   - If two users submit the same slot simultaneously and the user's request fails with `HTTP 409 Conflict`, the UI catches the conflict error, displays a clear alert ("This time slot was just booked by another client. Please select another slot."), and immediately re-queries available slots for that date while preserving the user's selected date and service.

### Interview Questions for Phase 9
- **Q: How does the frontend handle booking race conditions when two users click the same slot simultaneously?**
  *A:* "The API returns HTTP 409 Conflict. Instead of crashing or resetting the entire form, the frontend displays an informative banner explaining that the slot was just claimed, preserves the selected service and date, and re-fetches the slot list for that day so the user can immediately select an adjacent opening."

---

## Phase 10: Customer Appointments Portal & RFC 5545 Blob Calendar Invites

### Key Technical Decisions
1. **Client-Side Cutoff Feedback:**
   - While the backend authoritatively rejects cancellations and reschedules within 4 hours (`CANCEL_CUTOFF_HOURS = 4`), the UI proactively calculates the remaining hours. If an appointment is within 4 hours, the Reschedule and Cancel buttons are disabled with a tooltip ("Under 4h cutoff &bull; Changes locked"), preventing unnecessary rejected requests.
2. **Direct Blob Download via Axios:**
   - Calendar invite files (`.ics`) are fetched using Axios with `responseType: 'blob'`. The response is converted to a browser Object URL (`window.URL.createObjectURL(blob)`) and triggered via a programmatic link click, ensuring authenticated `.ics` downloads succeed without exposing auth tokens in URL query strings.

### Interview Questions for Phase 10
- **Q: Why download calendar `.ics` files using Axios blobs instead of direct `<a href="...">` links?**
  *A:* "Direct anchor links cannot send `Authorization: Bearer <token>` headers. Using Axios with `responseType: 'blob'` allows the request to be authenticated via our standard interceptor, and the resulting blob is downloaded safely to the user's device."

---

## Phase 11: Provider Operations, Multi-Interval Hours & Leave Management

### Key Technical Decisions
1. **Multi-Interval Working Hours Editor:**
   - Providers can configure multiple distinct working intervals per day (e.g. 09:00–13:00 and 14:00–18:00), which automatically turns the intervening gap into an unbookable lunch break.
2. **Detailed Conflict Breakdown on Leave Scheduling:**
   - If a provider attempts to schedule time off that overlaps existing confirmed bookings, the backend returns an HTTP 400 listing the conflicting appointments. The UI renders this list directly on the modal, informing the provider which clients must be contacted or rescheduled before the leave can be recorded.

### Interview Questions for Phase 11
- **Q: How do you prevent providers from scheduling leaves over confirmed client appointments?**
  *A:* "The provider time-off endpoint acquires a pessimistic lock on the provider profile and queries for confirmed bookings within the requested leave window. If conflicts exist, the API rejects the request with HTTP 400 and returns the conflicting booking details so the provider can resolve them."

---

## Phase 12: Admin Platform Operations, Role Governance & Volume Trends

### Key Technical Decisions
1. **Platform Analytics with Recharts:**
   - Admin dashboards render an Area chart tracking 14-day daily booking registrations computed via aware datetime ranges on the backend, alongside metrics for total platform revenue and status distribution.
2. **Administrative Invariants on Account Deactivation:**
   - Deactivating a provider account triggers a calculation of future confirmed appointments and returns the count in the response payload, giving administrators full visibility into affected clients.
   - Admins cannot deactivate their own account or the last remaining platform administrator.

### Interview Questions for Phase 12
- **Q: What safeguards are implemented for administrative user management?**
  *A:* "Administrators cannot deactivate themselves or demote the last remaining active admin. When deactivating a service provider, the system calculates and reports the number of future confirmed bookings that provider holds so the administrator can take appropriate operational actions."



