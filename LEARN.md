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
