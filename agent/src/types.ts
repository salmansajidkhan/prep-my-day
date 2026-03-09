// Core types for Prep My Day agent

// ── Calendar Types ──

export interface CalendarEvent {
  id: string;
  subject: string;
  startTime: string;       // ISO 8601
  endTime: string;         // ISO 8601
  organizer?: string;
  attendees?: string[];
  location?: string;
  isOnline?: boolean;
  joinUrl?: string;
  showAs: ShowAs;
  responseStatus: ResponseStatus;
  categories?: string[];
  isAllDay?: boolean;
}

export type ShowAs = "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
export type ResponseStatus = "none" | "organizer" | "tentativelyAccepted" | "accepted" | "declined" | "notResponded";

export interface FreeBlock {
  startTime: string;       // ISO 8601
  endTime: string;         // ISO 8601
  durationMinutes: number;
}

export interface DaySummary {
  date: string;            // YYYY-MM-DD
  dayName: string;         // "Monday", "Tuesday", etc.
  meetings: CalendarEvent[];
  freeBlocks: FreeBlock[];
  totalMeetingMinutes: number;
  totalFreeMinutes: number;
}

// ── Task Types ──

export interface TaskItem {
  title: string;
  dueDate?: string;        // YYYY-MM-DD or descriptive
  source?: string;         // "meeting", "email", "document", "planner"
  sourceDetail?: string;   // meeting name, email subject, doc title
  documentUrl?: string;    // link to source document
  priority?: "high" | "normal" | "low";
}

// ── Summary Types ──

export interface WeeklySummary {
  weekStartDate: string;   // Monday's date (YYYY-MM-DD)
  days: DaySummary[];
  tasks: TaskItem[];
  generatedAt: string;     // ISO 8601
}

export interface DailySummaryResult {
  targetDate: string;      // YYYY-MM-DD
  day: DaySummary;
  tasks: TaskItem[];
  generatedAt: string;     // ISO 8601
}

// ── Config Types ──

export interface PrepMyDayConfig {
  workingHoursStart: number;   // 9 = 9:00 AM
  workingHoursEnd: number;     // 17 = 5:00 PM
  timezone: string;            // IANA timezone, e.g. "America/Los_Angeles"
  weeklyTrigger: CronTrigger;
  dailyTrigger: CronTrigger;
  teamsDelivery: boolean;      // auto-send via Teams
  focusTimeKeywords: string[]; // subjects/categories treated as free
  lunchKeywords: string[];     // subjects/categories treated as free
}

export interface CronTrigger {
  enabled: boolean;
  cronExpression: string;      // node-cron format
  description: string;
}

export const DEFAULT_CONFIG: PrepMyDayConfig = {
  workingHoursStart: 9,
  workingHoursEnd: 17,
  timezone: "America/Los_Angeles",
  weeklyTrigger: {
    enabled: true,
    cronExpression: "0 15 * * 0",  // Sunday 3:00 PM
    description: "Weekly summary every Sunday at 3:00 PM",
  },
  dailyTrigger: {
    enabled: true,
    cronExpression: "0 17 * * 1-5", // Mon–Fri 5:00 PM
    description: "Daily summary every weekday at 5:00 PM",
  },
  teamsDelivery: false,
  focusTimeKeywords: ["focus time", "focus block", "deep work", "no meetings"],
  lunchKeywords: ["lunch", "lunch break", "lunch block"],
};

// ── Formatted Output ──

export interface FormattedSummary {
  plainText: string;
  adaptiveCard: Record<string, unknown>;
}

// ── Helpers ──

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDateShort(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function getDayName(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
}

export function getNextMonday(from: Date = new Date()): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getNextWorkday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}
