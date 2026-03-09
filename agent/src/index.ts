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
  },
  async ({ weekStartDate, meetings, tasks }) => {
    try {
      const days = buildWeekSummaries(weekStartDate, meetings as CalendarEvent[], config);
      const summary = {
        weekStartDate,
        days,
        tasks: (tasks as TaskItem[]) ?? [],
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
  },
  async ({ targetDate, meetings, tasks }) => {
    try {
      const normalized = normalizeEventTimes(meetings as CalendarEvent[], targetDate);
      const day = buildDaySummary(targetDate, normalized, config);
      const summary = {
        targetDate,
        day,
        tasks: (tasks as TaskItem[]) ?? [],
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

// Tool 3: get_config
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
    const { weekStartDate, meetings, tasks } = req.body;
    if (!weekStartDate || !meetings) {
      res.status(400).json({ error: "weekStartDate and meetings[] are required" });
      return;
    }
    const days = buildWeekSummaries(weekStartDate, meetings, config);
    const summary = {
      weekStartDate,
      days,
      tasks: tasks ?? [],
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
    const { targetDate, meetings, tasks } = req.body;
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
      generatedAt: new Date().toISOString(),
    };
    const formatted = formatDailySummary(summary);
    res.json({ summary, plainText: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
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
