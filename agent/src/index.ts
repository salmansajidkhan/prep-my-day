// Prep My Day — MCP + HTTP hybrid server entry point
//
// Architecture: M365 Copilot declarative agent pattern
// - Copilot fetches calendar events via built-in Meetings capability
// - Copilot fetches tasks via WorkIQ / built-in capabilities
// - This server receives pre-fetched data, filters/computes, and returns formatted output
// - NO direct Graph API calls, NO custom auth — Copilot handles all M365 access

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

import { buildDaySummary, buildWeekSummaries } from "./schedule-builder.js";
import {
  formatWeeklySummary,
  formatDailySummary,
  formatMorningBrief,
} from "./message-formatter.js";
import {
  DEFAULT_CONFIG,
  getNextMonday,
  getNextWorkday,
  toISODate,
} from "./types.js";
import type {
  PrepMyDayConfig,
  CalendarEvent,
  TaskItem,
  ActionItem,
  EmailDigest,
  TeamsHighlight,
  MeetingPrep,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "data", "config.json");
const PORT = parseInt(process.env.PORT ?? "3003", 10);

// ── Zod schemas for tool inputs ──

const CalendarEventSchema = z.object({
  subject: z.string(),
  startTime: z.string().describe("ISO 8601 datetime or 'HH:MM AM/PM' format"),
  endTime: z.string().describe("ISO 8601 datetime or 'HH:MM AM/PM' format"),
  organizer: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
  isOnline: z.boolean().optional(),
  joinUrl: z.string().optional(),
  showAs: z.enum(["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"]).optional(),
  responseStatus: z.enum(["none", "organizer", "tentativelyAccepted", "accepted", "declined", "notResponded"]).optional(),
  categories: z.array(z.string()).optional(),
  isAllDay: z.boolean().optional(),
});

const TaskItemSchema = z.object({
  title: z.string(),
  dueDate: z.string().optional(),
  source: z.string().optional(),
  sourceDetail: z.string().optional(),
  documentUrl: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
});

const ActionItemSchema = z.object({
  title: z.string(),
  category: z.enum(["action", "fyi", "todo"]).describe("action = needs response, fyi = informational, todo = follow-up task"),
  source: z.string().optional().describe("email, teams, planner"),
  sender: z.string().optional(),
  summary: z.string().optional().describe("Brief context on what they need"),
  priority: z.enum(["high", "normal", "low"]).optional(),
  url: z.string().optional().describe("Deep link to email or message"),
});

const EmailDigestSchema = z.object({
  subject: z.string(),
  sender: z.string(),
  receivedAt: z.string().optional().describe("ISO 8601 datetime"),
  snippet: z.string().describe("Brief preview of email content"),
  threadParticipants: z.array(z.string()).optional(),
  priority: z.enum(["high", "normal", "low"]).optional(),
  needsResponse: z.boolean().optional().describe("Whether this email requires a response"),
  url: z.string().optional().describe("Deep link to email"),
});

const TeamsHighlightSchema = z.object({
  channelOrChat: z.string().describe("Channel name or chat participants"),
  sender: z.string(),
  message: z.string().describe("Brief message content"),
  sentAt: z.string().optional().describe("ISO 8601 datetime"),
  isUnread: z.boolean().optional(),
  url: z.string().optional().describe("Deep link to Teams message"),
});

const MeetingPrepSchema = z.object({
  meetingSubject: z.string().describe("The meeting this prep is for"),
  recentEmails: z.array(EmailDigestSchema).optional().describe("Recent email threads with meeting attendees"),
  recentTeamsMessages: z.array(TeamsHighlightSchema).optional().describe("Recent Teams messages related to this meeting"),
  attendeeNotes: z.string().optional().describe("Org context, roles, or notes about attendees"),
});

// ── Config persistence ──

let config: PrepMyDayConfig = { ...DEFAULT_CONFIG };

function loadConfig(): void {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
}

function saveConfig(): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

loadConfig();

// ── Time parsing helper ──
// Copilot may pass times as "10:00 AM" or ISO strings.
// We normalize to ISO for a given date.

function normalizeEventTimes(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  return events.map((e) => ({
    ...e,
    startTime: toISO(e.startTime, dateStr),
    endTime: toISO(e.endTime, dateStr),
  }));
}

function toISO(time: string, dateStr: string): string {
  // Already ISO?
  if (time.includes("T")) return time;

  // Parse "10:00 AM", "2:30 PM" etc.
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${dateStr}T${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
  }

  // Fallback: return as-is
  return time;
}

// ── MCP Server ──

const server = new McpServer({
  name: "prep-my-day-agent",
  version: "1.0.0",
});

// Resource: schedule format guide
server.resource("schedule-guide", "guide://schedule-format", async () => ({
  contents: [{
    uri: "guide://schedule-format",
    mimeType: "text/plain",
    text: [
      "Prep My Day Schedule Format Guide",
      "==================================",
      "Copilot fetches calendar events via built-in Meetings capability,",
      "then passes them to this server for filtering and formatting.",
      "",
      "Confirmed meetings: showAs=busy AND responseStatus=accepted/organizer",
      "Excluded: tentative, focus time, lunch blocks, declined, all-day events",
      "Free time: gaps between confirmed meetings within working hours (default 9–5)",
      "",
      "Output: concise text + Adaptive Card, optimized for mobile Teams reading",
    ].join("\n"),
  }],
}));

// Tool 1: render_weekly_summary
server.tool(
  "render_weekly_summary",
  "Render a weekly schedule summary from pre-fetched calendar events and tasks. Copilot should fetch Mon–Fri meetings via Meetings capability and tasks via WorkIQ before calling this tool.",
  {
    weekStartDate: z.string().describe("Monday date (YYYY-MM-DD)"),
    meetings: z.array(CalendarEventSchema).describe("All calendar events for Mon–Fri, fetched by Copilot"),
    tasks: z.array(TaskItemSchema).optional().describe("Upcoming tasks/follow-ups from WorkIQ"),
    actionItems: z.array(ActionItemSchema).optional().describe("Action items, FYIs, and todos from email/Teams triage"),
  },
  async ({ weekStartDate, meetings, tasks, actionItems }) => {
    try {
      const days = buildWeekSummaries(weekStartDate, meetings as CalendarEvent[], config);
      const summary = {
        weekStartDate,
        days,
        tasks: (tasks as TaskItem[]) ?? [],
        actionItems: (actionItems as ActionItem[]) ?? [],
        generatedAt: new Date().toISOString(),
      };
      const formatted = formatWeeklySummary(summary);
      return { content: [{ type: "text", text: formatted.plainText }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 2: render_daily_summary
server.tool(
  "render_daily_summary",
  "Render a next-day schedule summary from pre-fetched calendar events and tasks. Copilot should fetch the target day's meetings via Meetings capability and tasks via WorkIQ before calling this tool.",
  {
    targetDate: z.string().describe("Target date (YYYY-MM-DD)"),
    meetings: z.array(CalendarEventSchema).describe("Calendar events for the target date, fetched by Copilot"),
    tasks: z.array(TaskItemSchema).optional().describe("Upcoming tasks/follow-ups from WorkIQ"),
    actionItems: z.array(ActionItemSchema).optional().describe("Action items, FYIs, and todos from email/Teams triage"),
  },
  async ({ targetDate, meetings, tasks, actionItems }) => {
    try {
      const normalized = normalizeEventTimes(meetings as CalendarEvent[], targetDate);
      const day = buildDaySummary(targetDate, normalized, config);
      const summary = {
        targetDate,
        day,
        tasks: (tasks as TaskItem[]) ?? [],
        actionItems: (actionItems as ActionItem[]) ?? [],
        generatedAt: new Date().toISOString(),
      };
      const formatted = formatDailySummary(summary);
      return { content: [{ type: "text", text: formatted.plainText }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 3: render_morning_brief
server.tool(
  "render_morning_brief",
  "Render a comprehensive morning briefing combining calendar, email digest, Teams highlights, and per-meeting prep context. Copilot should fetch today's meetings (Calendar), important recent emails (Email capability), unread Teams messages (TeamsMessages capability), and tasks (WorkIQ) before calling this tool.",
  {
    targetDate: z.string().describe("Target date (YYYY-MM-DD), typically today"),
    meetings: z.array(CalendarEventSchema).describe("Calendar events for the target date"),
    tasks: z.array(TaskItemSchema).optional().describe("Upcoming tasks/follow-ups"),
    actionItems: z.array(ActionItemSchema).optional().describe("Action items, FYIs, and todos"),
    emailDigest: z.array(EmailDigestSchema).optional().describe("Important recent emails to surface in the brief"),
    teamsHighlights: z.array(TeamsHighlightSchema).optional().describe("Recent unread or important Teams messages"),
    meetingPreps: z.array(MeetingPrepSchema).optional().describe("Per-meeting context: recent emails/Teams with attendees"),
  },
  async ({ targetDate, meetings, tasks, actionItems, emailDigest, teamsHighlights, meetingPreps }) => {
    try {
      const normalized = normalizeEventTimes(meetings as CalendarEvent[], targetDate);
      const day = buildDaySummary(targetDate, normalized, config);
      const brief = {
        targetDate,
        day,
        tasks: (tasks as TaskItem[]) ?? [],
        actionItems: (actionItems as ActionItem[]) ?? [],
        emailDigest: (emailDigest as EmailDigest[]) ?? [],
        teamsHighlights: (teamsHighlights as TeamsHighlight[]) ?? [],
        meetingPreps: (meetingPreps as MeetingPrep[]) ?? [],
        generatedAt: new Date().toISOString(),
      };
      const formatted = formatMorningBrief(brief);
      return { content: [{ type: "text", text: formatted.plainText }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 4: get_config
server.tool(
  "get_config",
  "Get current Prep My Day configuration (working hours, timezone, filter keywords)",
  {},
  async () => {
    const configText = [
      "Prep My Day Configuration",
      "=========================",
      `Working hours: ${config.workingHoursStart}:00–${config.workingHoursEnd}:00`,
      `Timezone: ${config.timezone}`,
      "",
      `Focus time keywords: ${config.focusTimeKeywords.join(", ")}`,
      `Lunch keywords: ${config.lunchKeywords.join(", ")}`,
    ].join("\n");
    return { content: [{ type: "text", text: configText }] };
  },
);

// Tool 4: set_config
server.tool(
  "set_config",
  "Update Prep My Day configuration (working hours, timezone, filter keywords)",
  {
    workingHoursStart: z.number().min(0).max(23).optional().describe("Work start hour (0-23)"),
    workingHoursEnd: z.number().min(0).max(23).optional().describe("Work end hour (0-23)"),
    timezone: z.string().optional().describe("IANA timezone (e.g., 'America/Los_Angeles')"),
    focusTimeKeywords: z.array(z.string()).optional().describe("Subjects/categories treated as free time"),
    lunchKeywords: z.array(z.string()).optional().describe("Subjects/categories treated as free time"),
  },
  async (params) => {
    if (params.workingHoursStart !== undefined) config.workingHoursStart = params.workingHoursStart;
    if (params.workingHoursEnd !== undefined) config.workingHoursEnd = params.workingHoursEnd;
    if (params.timezone !== undefined) config.timezone = params.timezone;
    if (params.focusTimeKeywords !== undefined) config.focusTimeKeywords = params.focusTimeKeywords;
    if (params.lunchKeywords !== undefined) config.lunchKeywords = params.lunchKeywords;
    saveConfig();
    return { content: [{ type: "text", text: "Configuration updated." }] };
  },
);

// ── Express HTTP Server ──

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: "prep-my-day", version: "1.0.0" });
});

// POST /api/render-weekly-summary
app.post("/api/render-weekly-summary", async (req, res) => {
  try {
    const { weekStartDate, meetings, tasks, actionItems } = req.body;
    if (!weekStartDate || !meetings) {
      res.status(400).json({ error: "weekStartDate and meetings[] are required" });
      return;
    }
    const days = buildWeekSummaries(weekStartDate, meetings, config);
    const summary = {
      weekStartDate,
      days,
      tasks: tasks ?? [],
      actionItems: actionItems ?? [],
      generatedAt: new Date().toISOString(),
    };
    const formatted = formatWeeklySummary(summary);
    res.json({ summary, plainText: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/render-daily-summary
app.post("/api/render-daily-summary", async (req, res) => {
  try {
    const { targetDate, meetings, tasks, actionItems } = req.body;
    if (!targetDate || !meetings) {
      res.status(400).json({ error: "targetDate and meetings[] are required" });
      return;
    }
    const normalized = normalizeEventTimes(meetings, targetDate);
    const day = buildDaySummary(targetDate, normalized, config);
    const summary = {
      targetDate,
      day,
      tasks: tasks ?? [],
      actionItems: actionItems ?? [],
      generatedAt: new Date().toISOString(),
    };
    const formatted = formatDailySummary(summary);
    res.json({ summary, plainText: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// POST /api/render-morning-brief
app.post("/api/render-morning-brief", async (req, res) => {
  try {
    const { targetDate, meetings, tasks, actionItems, emailDigest, teamsHighlights, meetingPreps } = req.body;
    if (!targetDate || !meetings) {
      res.status(400).json({ error: "targetDate and meetings[] are required" });
      return;
    }
    const normalized = normalizeEventTimes(meetings, targetDate);
    const day = buildDaySummary(targetDate, normalized, config);
    const brief = {
      targetDate,
      day,
      tasks: tasks ?? [],
      actionItems: actionItems ?? [],
      emailDigest: emailDigest ?? [],
      teamsHighlights: teamsHighlights ?? [],
      meetingPreps: meetingPreps ?? [],
      generatedAt: new Date().toISOString(),
    };
    const formatted = formatMorningBrief(brief);
    res.json({ brief, plainText: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// GET /api/config
app.get("/api/config", (_req, res) => {
  res.json({ config });
});

// PUT /api/config
app.put("/api/config", (req, res) => {
  const updates = req.body;
  if (updates.workingHoursStart !== undefined) config.workingHoursStart = updates.workingHoursStart;
  if (updates.workingHoursEnd !== undefined) config.workingHoursEnd = updates.workingHoursEnd;
  if (updates.timezone !== undefined) config.timezone = updates.timezone;
  if (updates.focusTimeKeywords !== undefined) config.focusTimeKeywords = updates.focusTimeKeywords;
  if (updates.lunchKeywords !== undefined) config.lunchKeywords = updates.lunchKeywords;
  saveConfig();
  res.json({ config, message: "Configuration updated." });
});

// ── Startup ──

async function main(): Promise<void> {
  const mode = process.argv.includes("--http") ? "http" : "stdio";

  console.log(`[Prep My Day] Starting in ${mode} mode...`);

  if (mode === "http") {
    app.listen(PORT, () => {
      console.log(`[Prep My Day] HTTP server running on http://localhost:${PORT}`);
      console.log(`[Prep My Day] Health: http://localhost:${PORT}/health`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Prep My Day] MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("[Prep My Day] Fatal error:", error);
  process.exit(1);
});
