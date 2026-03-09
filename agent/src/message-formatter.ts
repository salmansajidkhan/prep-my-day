// Format summaries as plain text (mobile-optimized) and Adaptive Card

import type {
  DaySummary,
  WeeklySummary,
  DailySummaryResult,
  TaskItem,
  FormattedSummary,
} from "./types.js";
import { formatTime } from "./types.js";

// ── Plain Text Formatting ──

export function formatWeeklySummaryText(summary: WeeklySummary): string {
  const lines: string[] = [];
  lines.push(`📅 Weekly Schedule — Week of ${summary.weekStartDate}`);
  lines.push("");

  for (const day of summary.days) {
    lines.push(formatDayText(day));
  }

  if (summary.tasks.length > 0) {
    lines.push("");
    lines.push(formatTasksText(summary.tasks));
  }

  return lines.join("\n");
}

export function formatDailySummaryText(summary: DailySummaryResult): string {
  const lines: string[] = [];
  lines.push(`📋 Tomorrow (${summary.day.dayName}, ${summary.targetDate})`);
  lines.push("");
  lines.push(formatDayText(summary.day));

  if (summary.tasks.length > 0) {
    lines.push("");
    lines.push(formatTasksText(summary.tasks));
  }

  return lines.join("\n");
}

function formatDayText(day: DaySummary): string {
  if (day.meetings.length === 0) {
    return `**${day.dayName}** — No meetings – all free (${day.totalFreeMinutes} min)`;
  }

  const parts: string[] = [];
  // Merge meetings and free blocks into chronological order
  const slots = buildChronologicalSlots(day);

  for (const slot of slots) {
    if (slot.type === "meeting") {
      parts.push(`Meeting: ${fmtTime(slot.start)}–${fmtTime(slot.end)} ${slot.label}`);
    } else {
      parts.push(`Free: ${fmtTime(slot.start)}–${fmtTime(slot.end)}`);
    }
  }

  return `**${day.dayName}** — ${parts.join("; ")}`;
}

function formatTasksText(tasks: TaskItem[]): string {
  const lines: string[] = ["📌 Upcoming Projects & Tasks:"];
  for (const task of tasks) {
    let line = `• ${task.title}`;
    if (task.dueDate) line += ` (due ${task.dueDate})`;
    if (task.documentUrl) line += ` – [${task.sourceDetail ?? "Link"}](${task.documentUrl})`;
    if (task.priority === "high") line = `⚡ ${line.slice(2)}`;
    lines.push(line);
  }
  return lines.join("\n");
}

interface TimeSlot {
  type: "meeting" | "free";
  start: string;
  end: string;
  label: string;
}

function buildChronologicalSlots(day: DaySummary): TimeSlot[] {
  const slots: TimeSlot[] = [];

  for (const m of day.meetings) {
    slots.push({ type: "meeting", start: m.startTime, end: m.endTime, label: m.subject });
  }
  for (const f of day.freeBlocks) {
    slots.push({ type: "free", start: f.startTime, end: f.endTime, label: "" });
  }

  slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return slots;
}

function fmtTime(iso: string): string {
  return formatTime(iso);
}

// ── Adaptive Card Formatting ──

export function formatWeeklySummaryCard(summary: WeeklySummary): Record<string, unknown> {
  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: `📅 Weekly Schedule — Week of ${summary.weekStartDate}`,
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    },
  ];

  for (const day of summary.days) {
    body.push(...buildDayCardBlocks(day));
  }

  if (summary.tasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "📌 Upcoming Projects & Tasks",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });
    body.push(...buildTaskCardBlocks(summary.tasks));
  }

  return buildAdaptiveCard(body);
}

export function formatDailySummaryCard(summary: DailySummaryResult): Record<string, unknown> {
  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: `📋 Tomorrow — ${summary.day.dayName}, ${summary.targetDate}`,
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    },
    ...buildDayCardBlocks(summary.day),
  ];

  if (summary.tasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "📌 Upcoming Tasks",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });
    body.push(...buildTaskCardBlocks(summary.tasks));
  }

  return buildAdaptiveCard(body);
}

function buildDayCardBlocks(day: DaySummary): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  blocks.push({
    type: "TextBlock",
    text: `**${day.dayName}**`,
    weight: "Bolder",
    spacing: "Medium",
    wrap: true,
  });

  if (day.meetings.length === 0) {
    blocks.push({
      type: "TextBlock",
      text: "No meetings – all free ✅",
      color: "Good",
      wrap: true,
    });
    return blocks;
  }

  const slots = buildChronologicalSlots(day);
  const facts: Array<{ title: string; value: string }> = [];

  for (const slot of slots) {
    if (slot.type === "meeting") {
      facts.push({
        title: `🔵 ${fmtTime(slot.start)}–${fmtTime(slot.end)}`,
        value: slot.label,
      });
    } else {
      facts.push({
        title: `⬜ ${fmtTime(slot.start)}–${fmtTime(slot.end)}`,
        value: "Free",
      });
    }
  }

  blocks.push({ type: "FactSet", facts });
  return blocks;
}

function buildTaskCardBlocks(tasks: TaskItem[]): Record<string, unknown>[] {
  return tasks.map((task) => {
    let text = task.priority === "high" ? `⚡ ${task.title}` : `• ${task.title}`;
    if (task.dueDate) text += ` _(due ${task.dueDate})_`;

    const block: Record<string, unknown> = {
      type: "TextBlock",
      text,
      wrap: true,
    };

    return block;
  });
}

function buildAdaptiveCard(body: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
  };
}

// ── Combined Formatter ──

export function formatWeeklySummary(summary: WeeklySummary): FormattedSummary {
  return {
    plainText: formatWeeklySummaryText(summary),
    adaptiveCard: formatWeeklySummaryCard(summary),
  };
}

export function formatDailySummary(summary: DailySummaryResult): FormattedSummary {
  return {
    plainText: formatDailySummaryText(summary),
    adaptiveCard: formatDailySummaryCard(summary),
  };
}
