import { format, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export const TIME_ZONE = 'Asia/Kolkata';

/**
 * Formats an ISO datetime string into human readable IST format.
 * E.g. "Monday, Oct 12, 2026, 10:00 AM"
 */
export function formatDateTimeIST(dateStr, pattern = "EEE, MMM d, yyyy 'at' h:mm a") {
  if (!dateStr) return '';
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return formatInTimeZone(date, TIME_ZONE, pattern);
  } catch (err) {
    return dateStr;
  }
}

/**
 * Formats a Date object or string as YYYY-MM-DD in local/IST time for API queries.
 */
export function formatDateParam(date) {
  if (!date) return '';
  try {
    return format(date, 'yyyy-MM-dd');
  } catch (err) {
    return '';
  }
}

/**
 * Formats time only e.g. "10:00 AM"
 */
export function formatTimeIST(dateStr) {
  return formatDateTimeIST(dateStr, 'h:mm a');
}

/**
 * Formats date only e.g. "Oct 12, 2026"
 */
export function formatDateIST(dateStr) {
  return formatDateTimeIST(dateStr, 'MMM d, yyyy');
}

/**
 * Friendly duration display e.g. 30 mins, 1 hr, 1 hr 30 mins
 */
export function formatDuration(minutes) {
  if (!minutes) return '0 min';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs} hr ${mins} min`;
  if (hrs > 0) return `${hrs} hr`;
  return `${mins} min`;
}

/**
 * Indian Rupee formatter
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
