/**
 * Monthly recurrence dates, as "YYYY-MM-DD" strings in local time.
 * Mirrors private.recurring_occurrence / private.next_occurrence in the database, which is
 * what actually creates the expenses (hourly pg_cron job).
 */

/** "YYYY-MM-DD" for a local date. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

/** The occurrence in a given month: `day`, or the month's last day if it's shorter. */
export function occurrenceIn(year: number, month0: number, day: number): string {
  const last = new Date(year, month0 + 1, 0).getDate();
  return dateKey(new Date(year, month0, Math.min(day, last)));
}

/** First occurrence strictly after `after` ("YYYY-MM-DD") for a monthly rule on `day`. */
export function nextOccurrence(after: string, day: number): string {
  const [y, m] = parseKey(after);
  const sameMonth = occurrenceIn(y, m, day);
  if (sameMonth > after) return sameMonth;
  return occurrenceIn(m === 11 ? y + 1 : y, (m + 1) % 12, day);
}

/**
 * When creating a monthly rule from an expense dated `first`:
 * - `createNow`: the first expense is due already (today or earlier), so add it right away;
 * - `nextDate`: when the server should create the next one.
 */
export function planRecurrence(first: string, day: number, today: string): { createNow: boolean; nextDate: string } {
  return first <= today ? { createNow: true, nextDate: nextOccurrence(first, day) } : { createNow: false, nextDate: first };
}

/** Next date on or after `today`, used when resuming a paused rule (no back-filling of missed months). */
export function resumeDate(today: string, day: number): string {
  const [y, m, d] = parseKey(today);
  return nextOccurrence(dateKey(new Date(y, m, d - 1)), day);
}

const LONG = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

/** "15 de diciembre" for a "YYYY-MM-DD" key. */
export function formatDateKey(key: string): string {
  const [y, m, d] = parseKey(key);
  return LONG.format(new Date(y, m, d));
}
