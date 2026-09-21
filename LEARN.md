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
