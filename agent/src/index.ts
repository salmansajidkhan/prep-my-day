// Prep My Day — MCP + HTTP hybrid server entry point

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

import { authenticate, isAuthenticated, getAccessToken } from "./graph-auth.js";
import { fetchCalendarEvents } from "./calendar-service.js";
import { buildDaySummary, buildWeekSummaries } from "./schedule-builder.js";
import { getUpcomingTasks, setWorkIqQueryFn } from "./workiq-service.js";
import {
  formatWeeklySummary,
  formatDailySummary,
  formatWeeklySummaryText,
  formatDailySummaryText,
} from "./message-formatter.js";
import { sendTeamsMessage, sendTeamsCard } from "./teams-sender.js";
import { startScheduler, stopScheduler, getSchedulerStatus } from "./scheduler.js";
import {
  DEFAULT_CONFIG,
  getNextMonday,
  getNextWorkday,
  toISODate,
} from "./types.js";
import type {
  PrepMyDayConfig,
  WeeklySummary,
  DailySummaryResult,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "data", "config.json");
const PORT = parseInt(process.env.PORT ?? "3003", 10);

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

// ── Core logic ──

async function generateWeekly(weekStartDate?: string): Promise<WeeklySummary> {
  const monday = weekStartDate ?? toISODate(getNextMonday());
  const fridayDate = new Date(monday + "T12:00:00");
  fridayDate.setDate(fridayDate.getDate() + 4);
  const friday = toISODate(fridayDate);

  const events = await fetchCalendarEvents(monday, friday);
  const days = buildWeekSummaries(monday, events, config);
  const tasks = await getUpcomingTasks("week", monday);

  return {
    weekStartDate: monday,
    days,
    tasks,
    generatedAt: new Date().toISOString(),
  };
}

async function generateDaily(targetDate?: string): Promise<DailySummaryResult> {
  const date = targetDate ?? toISODate(getNextWorkday());
  const events = await fetchCalendarEvents(date, date);
  const day = buildDaySummary(date, events, config);
  const tasks = await getUpcomingTasks("day", date);

  return {
    targetDate: date,
    day,
    tasks,
    generatedAt: new Date().toISOString(),
  };
}

async function handleTrigger(type: "weekly" | "daily"): Promise<string> {
  if (!isAuthenticated()) {
    return "Not authenticated — cannot send summary. Run authenticate first.";
  }

  if (type === "weekly") {
    const summary = await generateWeekly();
    const formatted = formatWeeklySummary(summary);

    if (config.teamsDelivery) {
      const result = await sendTeamsCard(formatted.adaptiveCard);
      return result.success
        ? `Weekly summary sent to Teams.\n\n${formatted.plainText}`
        : `Failed to send: ${result.message}\n\n${formatted.plainText}`;
    }
    return formatted.plainText;
  } else {
    const summary = await generateDaily();
    const formatted = formatDailySummary(summary);

    if (config.teamsDelivery) {
      const result = await sendTeamsCard(formatted.adaptiveCard);
      return result.success
        ? `Daily summary sent to Teams.\n\n${formatted.plainText}`
        : `Failed to send: ${result.message}\n\n${formatted.plainText}`;
    }
    return formatted.plainText;
  }
}

// ── MCP Server ──

const server = new McpServer({
  name: "prep-my-day-agent",
  version: "1.0.0",
});

// Resources
server.resource("schedule-guide", "guide://schedule-format", async () => ({
  contents: [{
    uri: "guide://schedule-format",
    mimeType: "text/plain",
    text: [
      "Prep My Day Schedule Format Guide",
      "==================================",
      "Weekly (Sunday 3PM): Mon–Fri schedule with meetings + free blocks + tasks",
      "Daily (Weekday 5PM): Next workday schedule with meetings + free blocks + tasks",
      "",
      "Confirmed meetings: showAs=busy AND responseStatus=accepted/organizer",
      "Free time: gaps between meetings within working hours (default 9AM–5PM)",
      "Excluded: tentative, focus time, lunch blocks, declined, all-day events",
      "",
      "Output: concise text optimized for mobile Teams reading",
    ].join("\n"),
  }],
}));

// Tool 1: authenticate
server.tool(
  "authenticate",
  "Authenticate with Microsoft Graph for calendar and Teams access",
  {},
  async () => {
    let deviceCodeMsg = "";
    const result = await authenticate((msg) => { deviceCodeMsg = msg; });
    const text = result.success
      ? result.message
      : `${result.message}\n\n${deviceCodeMsg}`;
    return { content: [{ type: "text", text }] };
  },
);

// Tool 2: generate_weekly_summary
server.tool(
  "generate_weekly_summary",
  "Generate a weekly schedule summary for Mon–Fri with meetings, free blocks, and tasks",
  { weekStartDate: z.string().optional().describe("Monday date (YYYY-MM-DD). Defaults to next Monday.") },
  async ({ weekStartDate }) => {
    try {
      const summary = await generateWeekly(weekStartDate);
      const formatted = formatWeeklySummary(summary);
      return { content: [{ type: "text", text: formatted.plainText }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 3: generate_daily_summary
server.tool(
  "generate_daily_summary",
  "Generate a next-day schedule summary with meetings, free blocks, and tasks",
  { targetDate: z.string().optional().describe("Target date (YYYY-MM-DD). Defaults to next workday.") },
  async ({ targetDate }) => {
    try {
      const summary = await generateDaily(targetDate);
      const formatted = formatDailySummary(summary);
      return { content: [{ type: "text", text: formatted.plainText }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 4: get_upcoming_tasks
server.tool(
  "get_upcoming_tasks",
  "Query WorkIQ for upcoming tasks and project follow-ups",
  {
    timeframe: z.enum(["week", "day"]).describe("Timeframe: 'week' or 'day'"),
    targetDate: z.string().optional().describe("Target date (YYYY-MM-DD) for context"),
  },
  async ({ timeframe, targetDate }) => {
    try {
      const tasks = await getUpcomingTasks(timeframe, targetDate);
      if (tasks.length === 0) {
        return { content: [{ type: "text", text: "No upcoming tasks found." }] };
      }
      const lines = tasks.map((t) => {
        let line = `• ${t.title}`;
        if (t.dueDate) line += ` (due ${t.dueDate})`;
        if (t.documentUrl) line += ` — ${t.documentUrl}`;
        return line;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 5: send_summary
server.tool(
  "send_summary",
  "Send a formatted summary to the user via Teams message",
  {
    summaryType: z.enum(["weekly", "daily"]).describe("Type of summary to send"),
    targetDate: z.string().optional().describe("Target date (YYYY-MM-DD)"),
  },
  async ({ summaryType, targetDate }) => {
    try {
      if (!isAuthenticated()) {
        return { content: [{ type: "text", text: "Not authenticated. Run authenticate first." }] };
      }

      let text: string;
      let card: Record<string, unknown>;

      if (summaryType === "weekly") {
        const summary = await generateWeekly(targetDate);
        const formatted = formatWeeklySummary(summary);
        text = formatted.plainText;
        card = formatted.adaptiveCard;
      } else {
        const summary = await generateDaily(targetDate);
        const formatted = formatDailySummary(summary);
        text = formatted.plainText;
        card = formatted.adaptiveCard;
      }

      // Try Adaptive Card first, fall back to text
      let result = await sendTeamsCard(card);
      if (!result.success) {
        result = await sendTeamsMessage(text);
      }

      const status = result.success ? "✅ Sent to Teams" : `❌ ${result.message}`;
      return { content: [{ type: "text", text: `${status}\n\n${text}` }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  },
);

// Tool 6: get_config
server.tool(
  "get_config",
  "Get current Prep My Day configuration (working hours, triggers, timezone)",
  {},
  async () => {
    const scheduler = getSchedulerStatus();
    const configText = [
      "Prep My Day Configuration",
      "=========================",
      `Working hours: ${config.workingHoursStart}:00–${config.workingHoursEnd}:00`,
      `Timezone: ${config.timezone}`,
      `Teams auto-delivery: ${config.teamsDelivery ? "ON" : "OFF"}`,
      "",
      `Weekly trigger: ${config.weeklyTrigger.enabled ? "ON" : "OFF"} — ${config.weeklyTrigger.description}`,
      `  Cron: ${config.weeklyTrigger.cronExpression}`,
      `  Scheduler running: ${scheduler.weekly ? "YES" : "NO"}`,
      "",
      `Daily trigger: ${config.dailyTrigger.enabled ? "ON" : "OFF"} — ${config.dailyTrigger.description}`,
      `  Cron: ${config.dailyTrigger.cronExpression}`,
      `  Scheduler running: ${scheduler.daily ? "YES" : "NO"}`,
      "",
      `Focus time keywords: ${config.focusTimeKeywords.join(", ")}`,
      `Lunch keywords: ${config.lunchKeywords.join(", ")}`,
    ].join("\n");
    return { content: [{ type: "text", text: configText }] };
  },
);

// Tool 7: set_config
server.tool(
  "set_config",
  "Update Prep My Day configuration",
  {
    workingHoursStart: z.number().min(0).max(23).optional().describe("Work start hour (0-23)"),
    workingHoursEnd: z.number().min(0).max(23).optional().describe("Work end hour (0-23)"),
    timezone: z.string().optional().describe("IANA timezone (e.g., 'America/Los_Angeles')"),
    teamsDelivery: z.boolean().optional().describe("Auto-send summaries via Teams"),
    weeklyEnabled: z.boolean().optional().describe("Enable weekly trigger"),
    dailyEnabled: z.boolean().optional().describe("Enable daily trigger"),
  },
  async (params) => {
    if (params.workingHoursStart !== undefined) config.workingHoursStart = params.workingHoursStart;
    if (params.workingHoursEnd !== undefined) config.workingHoursEnd = params.workingHoursEnd;
    if (params.timezone !== undefined) config.timezone = params.timezone;
    if (params.teamsDelivery !== undefined) config.teamsDelivery = params.teamsDelivery;
    if (params.weeklyEnabled !== undefined) config.weeklyTrigger.enabled = params.weeklyEnabled;
    if (params.dailyEnabled !== undefined) config.dailyTrigger.enabled = params.dailyEnabled;
    saveConfig();

    // Restart scheduler with new config
    startScheduler(handleTrigger, config);

    return { content: [{ type: "text", text: "Configuration updated and scheduler restarted." }] };
  },
);

// Tool 8: trigger_now
server.tool(
  "trigger_now",
  "Manually fire a weekly or daily summary trigger right now",
  {
    type: z.enum(["weekly", "daily"]).describe("Which trigger to fire"),
  },
  async ({ type }) => {
    try {
      const result = await handleTrigger(type);
      return { content: [{ type: "text", text: result }] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Trigger failed: ${msg}` }] };
    }
  },
);

// ── Express HTTP Server ──

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "prep-my-day",
    authenticated: isAuthenticated(),
    scheduler: getSchedulerStatus(),
  });
});

app.post("/api/authenticate", async (_req, res) => {
  let deviceCodeMsg = "";
  const result = await authenticate((msg) => { deviceCodeMsg = msg; });
  res.json({ ...result, deviceCodeMessage: deviceCodeMsg || undefined });
});

app.get("/api/weekly-summary", async (req, res) => {
  try {
    const weekStartDate = req.query.weekStartDate as string | undefined;
    const summary = await generateWeekly(weekStartDate);
    const formatted = formatWeeklySummary(summary);
    res.json({ summary, formatted: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/daily-summary", async (req, res) => {
  try {
    const targetDate = req.query.targetDate as string | undefined;
    const summary = await generateDaily(targetDate);
    const formatted = formatDailySummary(summary);
    res.json({ summary, formatted: formatted.plainText, adaptiveCard: formatted.adaptiveCard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/upcoming-tasks", async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as string) === "day" ? "day" : "week";
    const targetDate = req.query.targetDate as string | undefined;
    const tasks = await getUpcomingTasks(timeframe as "week" | "day", targetDate);
    res.json({ tasks });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/send-summary", async (req, res) => {
  try {
    const { summaryType, targetDate } = req.body;
    const type = summaryType === "daily" ? "daily" : "weekly";
    const result = await handleTrigger(type);
    res.json({ result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({ config, scheduler: getSchedulerStatus() });
});

app.put("/api/config", (req, res) => {
  const updates = req.body;
  if (updates.workingHoursStart !== undefined) config.workingHoursStart = updates.workingHoursStart;
  if (updates.workingHoursEnd !== undefined) config.workingHoursEnd = updates.workingHoursEnd;
  if (updates.timezone !== undefined) config.timezone = updates.timezone;
  if (updates.teamsDelivery !== undefined) config.teamsDelivery = updates.teamsDelivery;
  saveConfig();
  startScheduler(handleTrigger, config);
  res.json({ config, message: "Configuration updated." });
});

app.post("/api/trigger", async (req, res) => {
  try {
    const type = req.body.type === "daily" ? "daily" : "weekly";
    const result = await handleTrigger(type as "weekly" | "daily");
    res.json({ result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// ── Startup ──

async function main(): Promise<void> {
  const mode = process.argv.includes("--http") ? "http" : "stdio";

  console.log(`[Prep My Day] Starting in ${mode} mode...`);

  // Start scheduler if triggers are enabled
  startScheduler(handleTrigger, config);

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
