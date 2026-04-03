// Core types for Prep My Day agent
// Data is pre-fetched by M365 Copilot via built-in capabilities (Meetings, Email)
// and passed to the MCP server for filtering, computation, and formatting.

// ── Calendar Types (input from Copilot) ──

export interface CalendarEvent {
  subject: string;
  startTime: string;       // ISO 8601 or "10:00 AM" format
  endTime: string;         // ISO 8601 or "11:00 AM" format
  organizer?: string;
  attendees?: string[];
  location?: string;
  isOnline?: boolean;
  joinUrl?: string;
  showAs?: ShowAs;
  responseStatus?: ResponseStatus;
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

// ── Task Types (input from Copilot/WorkIQ) ──

export interface TaskItem {
  title: string;
  dueDate?: string;        // YYYY-MM-DD or descriptive
  source?: string;         // "meeting", "email", "document", "planner"
  sourceDetail?: string;   // meeting name, email subject, doc title
  documentUrl?: string;    // link to source document
  priority?: "high" | "normal" | "low";
}

// ── Action Item Types (email/Teams triage from WorkIQ) ──

export type ActionCategory = "action" | "fyi" | "todo";

export interface ActionItem {
  title: string;
  category: ActionCategory;   // action = needs response, fyi = informational, todo = follow-up task
  source?: string;            // "email" | "teams" | "planner"
  sender?: string;            // who sent it
  summary?: string;           // brief context on what they need
  priority?: "high" | "normal" | "low";
  url?: string;               // deep link to email/message
}

// ── Email Digest Types (from M365 Email capability) ──

export interface EmailDigest {
  subject: string;
  sender: string;
  receivedAt?: string;        // ISO 8601
  snippet: string;            // brief preview of email content
  threadParticipants?: string[];
  priority?: "high" | "normal" | "low";
  needsResponse?: boolean;
  url?: string;               // deep link to email
}

// ── Teams Highlight Types (from M365 TeamsMessages capability) ──

export interface TeamsHighlight {
  channelOrChat: string;      // channel name or chat participants
  sender: string;
  message: string;            // brief message content
  sentAt?: string;            // ISO 8601
  isUnread?: boolean;
  url?: string;               // deep link to Teams message
}

// ── Meeting Prep Types (per-meeting context from email/Teams) ──

export interface MeetingPrep {
  meetingSubject: string;
  recentEmails?: EmailDigest[];      // recent email threads with meeting attendees
  recentTeamsMessages?: TeamsHighlight[];  // recent Teams messages related to meeting
  attendeeNotes?: string;            // org context, roles, or notes about attendees
}

// ── Summary Types ──

export interface WeeklySummary {
  weekStartDate: string;   // Monday's date (YYYY-MM-DD)
  days: DaySummary[];
  tasks: TaskItem[];
  actionItems?: ActionItem[];
  generatedAt: string;     // ISO 8601
}

export interface DailySummaryResult {
  targetDate: string;      // YYYY-MM-DD
  day: DaySummary;
  tasks: TaskItem[];
  actionItems?: ActionItem[];
  generatedAt: string;     // ISO 8601
}

// ── Morning Brief Types (comprehensive daily briefing) ──

export interface MorningBrief {
  targetDate: string;         // YYYY-MM-DD
  day: DaySummary;
  tasks: TaskItem[];
  actionItems?: ActionItem[];
  emailDigest?: EmailDigest[];         // important emails to triage
  teamsHighlights?: TeamsHighlight[];  // unread Teams messages
  meetingPreps?: MeetingPrep[];        // per-meeting context
  generatedAt: string;        // ISO 8601
}

// ── Config Types ──

export interface PrepMyDayConfig {
  workingHoursStart: number;   // 9 = 9:00 AM
  workingHoursEnd: number;     // 17 = 5:00 PM
  timezone: string;            // IANA timezone, e.g. "America/Los_Angeles"
  focusTimeKeywords: string[]; // subjects/categories treated as free
  lunchKeywords: string[];     // subjects/categories treated as free
}

export const DEFAULT_CONFIG: PrepMyDayConfig = {
  workingHoursStart: 9,
  workingHoursEnd: 17,
  timezone: "America/Los_Angeles",
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
