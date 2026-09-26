import { format } from "date-fns";

/** Parse a YYYY-MM-DD calendar label as a local date instead of UTC midnight. */
export function parseLocalCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const result = new Date(year, month, day);
  if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== day) {
    return new Date(Number.NaN);
  }
  return result;
}

/** Format appointment instants in the browser's local timezone for matching labels. */
export function formatLocalSlotRange(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Invalid time";
  return `${format(start, "h:mm a")} - ${format(end, "h:mm a")}`;
}

/** Group server-generated appointment instants by the viewer's local calendar date. */
export function groupSlotsByLocalDate(days = []) {
  const grouped = new Map();
  for (const day of days) {
    for (const slot of day.slots || []) {
      const start = new Date(slot.startTime);
      if (Number.isNaN(start.getTime())) continue;
      const date = format(start, "yyyy-MM-dd");
      if (!grouped.has(date)) {
        grouped.set(date, { date, displayDate: format(start, "EEEE, MMMM d"), slots: [] });
      }
      grouped.get(date).slots.push(slot);
    }
  }

  for (const day of days) {
    if (day.slots?.length) continue;
    const localDate = parseLocalCalendarDate(day.date);
    if (Number.isNaN(localDate.getTime())) continue;
    const date = format(localDate, "yyyy-MM-dd");
    if (!grouped.has(date)) grouped.set(date, { date, displayDate: format(localDate, "EEEE, MMMM d"), slots: [] });
  }

  return [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

/** Shared join window policy for authorization and credential issuance. */
export function getVideoJoinWindowError(startTime, endTime, now = new Date()) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (start.getTime() - now.getTime() > 30 * 60 * 1000) {
    return "The call will be available 30 minutes before the scheduled time";
  }
  if (now >= end) return "This appointment has ended";
  return null;
}
