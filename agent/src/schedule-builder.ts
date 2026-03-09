// Schedule filtering and free time computation

import type { CalendarEvent, DaySummary, FreeBlock, PrepMyDayConfig } from "./types.js";
import { DEFAULT_CONFIG, getDayName, toISODate } from "./types.js";

/**
 * Filter events to only confirmed meetings.
 * Excludes: tentative, declined, focus time, lunch, all-day events, free events.
 */
export function filterConfirmedMeetings(
  events: CalendarEvent[],
  config: PrepMyDayConfig = DEFAULT_CONFIG,
): CalendarEvent[] {
  return events.filter((e) => {
    // Exclude all-day events (they're not time-blocked meetings)
    if (e.isAllDay) return false;

    // Exclude free or tentative showAs
    if (e.showAs === "free" || e.showAs === "tentative") return false;

    // Exclude declined
    if (e.responseStatus === "declined") return false;

    // Exclude tentatively accepted
    if (e.responseStatus === "tentativelyAccepted") return false;

    // Exclude focus time by keyword match
    const subjectLower = (e.subject ?? "").toLowerCase();
    const categoriesLower = (e.categories ?? []).map((c) => c.toLowerCase());

    for (const keyword of config.focusTimeKeywords) {
      if (subjectLower.includes(keyword.toLowerCase())) return false;
      if (categoriesLower.some((c) => c.includes(keyword.toLowerCase()))) return false;
    }

    // Exclude lunch blocks by keyword match
    for (const keyword of config.lunchKeywords) {
      if (subjectLower.includes(keyword.toLowerCase())) return false;
      if (categoriesLower.some((c) => c.includes(keyword.toLowerCase()))) return false;
    }

    return true;
  });
}

/**
 * Compute free time blocks between meetings within working hours.
 */
export function computeFreeBlocks(
  meetings: CalendarEvent[],
  dateStr: string,
  config: PrepMyDayConfig = DEFAULT_CONFIG,
): FreeBlock[] {
  const workStart = new Date(`${dateStr}T${pad(config.workingHoursStart)}:00:00`);
  const workEnd = new Date(`${dateStr}T${pad(config.workingHoursEnd)}:00:00`);

  if (meetings.length === 0) {
    const durationMinutes = (workEnd.getTime() - workStart.getTime()) / 60000;
    return [{
      startTime: workStart.toISOString(),
      endTime: workEnd.toISOString(),
      durationMinutes,
    }];
  }

  // Sort meetings by start time
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const freeBlocks: FreeBlock[] = [];
  let cursor = workStart.getTime();

  for (const meeting of sorted) {
    const meetStart = Math.max(new Date(meeting.startTime).getTime(), workStart.getTime());
    const meetEnd = Math.min(new Date(meeting.endTime).getTime(), workEnd.getTime());

    // Skip meetings entirely outside working hours
    if (meetEnd <= workStart.getTime() || meetStart >= workEnd.getTime()) continue;

    // Gap before this meeting
    if (cursor < meetStart) {
      const durationMinutes = (meetStart - cursor) / 60000;
      if (durationMinutes >= 5) {
        freeBlocks.push({
          startTime: new Date(cursor).toISOString(),
          endTime: new Date(meetStart).toISOString(),
          durationMinutes,
        });
      }
    }

    // Advance cursor past this meeting (handle overlaps)
    cursor = Math.max(cursor, meetEnd);
  }

  // Gap after last meeting until work end
  if (cursor < workEnd.getTime()) {
    const durationMinutes = (workEnd.getTime() - cursor) / 60000;
    if (durationMinutes >= 5) {
      freeBlocks.push({
        startTime: new Date(cursor).toISOString(),
        endTime: workEnd.toISOString(),
        durationMinutes,
      });
    }
  }

  return freeBlocks;
}

/**
 * Build a DaySummary for a single date from raw calendar events.
 */
export function buildDaySummary(
  dateStr: string,
  allEvents: CalendarEvent[],
  config: PrepMyDayConfig = DEFAULT_CONFIG,
): DaySummary {
  // Filter events for this specific date
  const dayEvents = allEvents.filter((e) => {
    const eventDate = e.startTime.split("T")[0];
    return eventDate === dateStr;
  });

  const meetings = filterConfirmedMeetings(dayEvents, config);
  const freeBlocks = computeFreeBlocks(meetings, dateStr, config);

  const totalMeetingMinutes = meetings.reduce((sum, m) => {
    const start = new Date(m.startTime).getTime();
    const end = new Date(m.endTime).getTime();
    return sum + (end - start) / 60000;
  }, 0);

  const totalFreeMinutes = freeBlocks.reduce((sum, f) => sum + f.durationMinutes, 0);

  return {
    date: dateStr,
    dayName: getDayName(dateStr),
    meetings,
    freeBlocks,
    totalMeetingMinutes,
    totalFreeMinutes,
  };
}

/**
 * Build DaySummaries for a full workweek (Monday–Friday).
 */
export function buildWeekSummaries(
  mondayDate: string,
  allEvents: CalendarEvent[],
  config: PrepMyDayConfig = DEFAULT_CONFIG,
): DaySummary[] {
  const days: DaySummary[] = [];
  const monday = new Date(mondayDate + "T12:00:00");

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toISODate(d);
    days.push(buildDaySummary(dateStr, allEvents, config));
  }

  return days;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
