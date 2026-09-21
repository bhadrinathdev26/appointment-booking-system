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
