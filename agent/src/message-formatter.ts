// Format summaries as plain text (mobile-optimized) and Adaptive Card
// Layout: Calendar > Meetings section > Free Blocks section > Totals > Action Items / FYIs / Todos

import type {
  DaySummary,
  WeeklySummary,
  DailySummaryResult,
  MorningBrief,
  TaskItem,
  ActionItem,
  EmailDigest,
  TeamsHighlight,
  MeetingPrep,
  FormattedSummary,
} from "./types.js";
import { formatTime } from "./types.js";

// -- Helpers --

function fmtTime(iso: string): string {
  return formatTime(iso);
}

function toHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function countConflicts(day: DaySummary): number {
  const sorted = [...day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  let conflicts = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i].startTime).getTime() < new Date(sorted[i - 1].endTime).getTime()) {
      conflicts++;
    }
  }
  return conflicts;
}

// -- Plain Text: Daily --

export function formatDailySummaryText(summary: DailySummaryResult): string {
  const { day, tasks, actionItems } = summary;
  const lines: string[] = [];

  lines.push(`\u{1F4CB} ${day.dayName}, ${summary.targetDate}`);
  lines.push("");

  // Meetings section
  lines.push("MEETINGS");
  if (day.meetings.length === 0) {
    lines.push("  No meetings today \u2705");
  } else {
    const sorted = [...day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (const m of sorted) {
      const attendeeStr = m.attendees?.length
        ? ` \u2014 ${m.attendees.slice(0, 3).join(", ")}${m.attendees.length > 3 ? ` +${m.attendees.length - 3}` : ""}`
        : "";
      lines.push(`  ${fmtTime(m.startTime)} - ${fmtTime(m.endTime)}  ${m.subject}${attendeeStr}`);
    }
  }
  lines.push("");

  // Free blocks section
  lines.push("FREE BLOCKS");
  const significantFree = day.freeBlocks.filter((f) => f.durationMinutes >= 15);
  if (significantFree.length === 0) {
    lines.push("  No significant free time");
  } else {
    for (const f of significantFree) {
      lines.push(`  ${fmtTime(f.startTime)} - ${fmtTime(f.endTime)}  (${toHours(f.durationMinutes)})`);
    }
  }
  lines.push("");

  // Totals
  const conflicts = countConflicts(day);
  let totalLine = `\u{1F4CA} ${day.meetings.length} meetings (${toHours(day.totalMeetingMinutes)}) \u00B7 ${significantFree.length} free blocks (${toHours(day.totalFreeMinutes)})`;
  if (conflicts > 0) totalLine += ` \u00B7 \u26A0\uFE0F ${conflicts} conflict${conflicts > 1 ? "s" : ""}`;
  lines.push(totalLine);

  // Tasks
  if (tasks && tasks.length > 0) {
    lines.push("");
    lines.push(formatTasksText(tasks));
  }

  // Action items at the bottom
  if (actionItems && actionItems.length > 0) {
    lines.push("");
    lines.push(formatActionItemsText(actionItems));
  }

  return lines.join("\n");
}

// -- Plain Text: Weekly --

export function formatWeeklySummaryText(summary: WeeklySummary): string {
  const lines: string[] = [];
  lines.push(`\u{1F4C5} Weekly Schedule \u2014 Week of ${summary.weekStartDate}`);

  for (const day of summary.days) {
    lines.push("");
    lines.push(`\u2501\u2501 ${day.dayName} \u2501\u2501`);

    if (day.meetings.length === 0) {
      lines.push("  No meetings \u2705");
    } else {
      const sorted = [...day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      for (const m of sorted) {
        lines.push(`  ${fmtTime(m.startTime)} - ${fmtTime(m.endTime)}  ${m.subject}`);
      }
    }

    const significantFree = day.freeBlocks.filter((f) => f.durationMinutes >= 15);
    if (significantFree.length > 0) {
      lines.push(`  Free: ${significantFree.map((f) => `${fmtTime(f.startTime)}-${fmtTime(f.endTime)} (${toHours(f.durationMinutes)})`).join(", ")}`);
    }
  }

  // Week totals
  const totalMeetings = summary.days.reduce((s, d) => s + d.meetings.length, 0);
  const totalMeetingMin = summary.days.reduce((s, d) => s + d.totalMeetingMinutes, 0);
  const totalFreeMin = summary.days.reduce((s, d) => s + d.totalFreeMinutes, 0);
  lines.push("");
  lines.push(`\u{1F4CA} Week total: ${totalMeetings} meetings (${toHours(totalMeetingMin)}) \u00B7 ${toHours(totalFreeMin)} free`);

  if (summary.tasks && summary.tasks.length > 0) {
    lines.push("");
    lines.push(formatTasksText(summary.tasks));
  }

  if (summary.actionItems && summary.actionItems.length > 0) {
    lines.push("");
    lines.push(formatActionItemsText(summary.actionItems));
  }

  return lines.join("\n");
}

// -- Tasks --

function formatTasksText(tasks: TaskItem[]): string {
  const lines: string[] = ["\u{1F4CC} TASKS"];
  for (const task of tasks) {
    const icon = task.priority === "high" ? "\u26A1" : "\u2022";
    let line = `  ${icon} ${task.title}`;
    if (task.dueDate) line += ` (due ${task.dueDate})`;
    lines.push(line);
  }
  return lines.join("\n");
}

// -- Action Items / FYIs / Todos --

function formatActionItemsText(items: ActionItem[]): string {
  const actions = items.filter((i) => i.category === "action");
  const todos = items.filter((i) => i.category === "todo");
  const fyis = items.filter((i) => i.category === "fyi");

  const lines: string[] = [];

  if (actions.length > 0) {
    lines.push("\u{1F534} ACTION ITEMS (respond today)");
    for (const item of actions) {
      const icon = item.priority === "high" ? "\u26A1" : "\u2022";
      const src = item.source ? ` [${item.source}]` : "";
      const sender = item.sender ? ` \u2014 ${item.sender}` : "";
      lines.push(`  ${icon} ${item.title}${sender}${src}`);
      if (item.summary) lines.push(`    ${item.summary}`);
    }
    lines.push("");
  }

  if (todos.length > 0) {
    lines.push("\u{1F7E1} FOLLOW-UPS");
    for (const item of todos) {
      const src = item.source ? ` [${item.source}]` : "";
      const sender = item.sender ? ` \u2014 ${item.sender}` : "";
      lines.push(`  \u2022 ${item.title}${sender}${src}`);
      if (item.summary) lines.push(`    ${item.summary}`);
    }
    lines.push("");
  }

  if (fyis.length > 0) {
    lines.push("\u2705 FYI (no action needed)");
    for (const item of fyis) {
      const sender = item.sender ? ` \u2014 ${item.sender}` : "";
      lines.push(`  \u2022 ${item.title}${sender}`);
      if (item.summary) lines.push(`    ${item.summary}`);
    }
  }

  return lines.join("\n");
}

// -- Adaptive Card: Daily --

export function formatDailySummaryCard(summary: DailySummaryResult): Record<string, unknown> {
  const { day, tasks, actionItems } = summary;
  const body: Record<string, unknown>[] = [];

  body.push({
    type: "TextBlock",
    text: `\u{1F4CB} ${day.dayName}, ${summary.targetDate}`,
    weight: "Bolder",
    size: "Large",
    wrap: true,
  });

  // Meetings section
  body.push({
    type: "TextBlock",
    text: "MEETINGS",
    weight: "Bolder",
    size: "Medium",
    spacing: "Medium",
    wrap: true,
  });

  if (day.meetings.length === 0) {
    body.push({ type: "TextBlock", text: "No meetings today \u2705", color: "Good", wrap: true });
  } else {
    const sorted = [...day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const meetingFacts = sorted.map((m) => ({
      title: `${fmtTime(m.startTime)}\u2013${fmtTime(m.endTime)}`,
      value: m.subject,
    }));
    body.push({ type: "FactSet", facts: meetingFacts });
  }

  // Free blocks section
  const significantFree = day.freeBlocks.filter((f) => f.durationMinutes >= 15);
  if (significantFree.length > 0) {
    body.push({
      type: "TextBlock",
      text: "FREE BLOCKS",
      weight: "Bolder",
      size: "Medium",
      spacing: "Medium",
      wrap: true,
    });
    const freeFacts = significantFree.map((f) => ({
      title: `${fmtTime(f.startTime)}\u2013${fmtTime(f.endTime)}`,
      value: toHours(f.durationMinutes),
    }));
    body.push({ type: "FactSet", facts: freeFacts });
  }

  // Totals
  const conflicts = countConflicts(day);
  let totalText = `${day.meetings.length} meetings (${toHours(day.totalMeetingMinutes)}) \u00B7 ${significantFree.length} free blocks (${toHours(day.totalFreeMinutes)})`;
  if (conflicts > 0) totalText += ` \u00B7 \u26A0\uFE0F ${conflicts} conflict${conflicts > 1 ? "s" : ""}`;
  body.push({
    type: "TextBlock",
    text: totalText,
    spacing: "Medium",
    wrap: true,
    isSubtle: true,
  });

  // Separator before triage
  if ((tasks && tasks.length > 0) || (actionItems && actionItems.length > 0)) {
    body.push({ type: "TextBlock", text: " ", spacing: "Small" });
  }

  // Tasks
  if (tasks && tasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "\u{1F4CC} TASKS",
      weight: "Bolder",
      size: "Medium",
      spacing: "Medium",
      wrap: true,
    });
    for (const task of tasks) {
      const icon = task.priority === "high" ? "\u26A1" : "\u2022";
      let text = `${icon} ${task.title}`;
      if (task.dueDate) text += ` _(due ${task.dueDate})_`;
      body.push({ type: "TextBlock", text, wrap: true });
    }
  }

  // Action items
  if (actionItems && actionItems.length > 0) {
    const actions = actionItems.filter((i) => i.category === "action");
    const todos = actionItems.filter((i) => i.category === "todo");
    const fyis = actionItems.filter((i) => i.category === "fyi");

    if (actions.length > 0) {
      body.push({
        type: "TextBlock",
        text: "\u{1F534} ACTION ITEMS",
        weight: "Bolder",
        size: "Medium",
        spacing: "Medium",
        color: "Attention",
        wrap: true,
      });
      for (const item of actions) {
        const icon = item.priority === "high" ? "\u26A1" : "\u2022";
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `${icon} **${item.title}**${sender}`, wrap: true });
        if (item.summary) {
          body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
        }
      }
    }

    if (todos.length > 0) {
      body.push({
        type: "TextBlock",
        text: "\u{1F7E1} FOLLOW-UPS",
        weight: "Bolder",
        size: "Medium",
        spacing: "Medium",
        color: "Warning",
        wrap: true,
      });
      for (const item of todos) {
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `\u2022 ${item.title}${sender}`, wrap: true });
        if (item.summary) {
          body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
        }
      }
    }

    if (fyis.length > 0) {
      body.push({
        type: "TextBlock",
        text: "\u2705 FYI",
        weight: "Bolder",
        size: "Medium",
        spacing: "Medium",
        color: "Good",
        wrap: true,
      });
      for (const item of fyis) {
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `\u2022 ${item.title}${sender}`, wrap: true });
        if (item.summary) {
          body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
        }
      }
    }
  }

  return buildAdaptiveCard(body);
}

// -- Adaptive Card: Weekly --

export function formatWeeklySummaryCard(summary: WeeklySummary): Record<string, unknown> {
  const body: Record<string, unknown>[] = [];

  body.push({
    type: "TextBlock",
    text: `\u{1F4C5} Weekly Schedule \u2014 Week of ${summary.weekStartDate}`,
    weight: "Bolder",
    size: "Large",
    wrap: true,
  });

  for (const day of summary.days) {
    body.push({
      type: "TextBlock",
      text: `**${day.dayName}**`,
      weight: "Bolder",
      spacing: "Medium",
      wrap: true,
    });

    if (day.meetings.length === 0) {
      body.push({ type: "TextBlock", text: "No meetings \u2705", color: "Good", wrap: true });
    } else {
      const sorted = [...day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const facts = sorted.map((m) => ({
        title: `${fmtTime(m.startTime)}\u2013${fmtTime(m.endTime)}`,
        value: m.subject,
      }));
      body.push({ type: "FactSet", facts });
    }

    const significantFree = day.freeBlocks.filter((f) => f.durationMinutes >= 15);
    if (significantFree.length > 0) {
      body.push({
        type: "TextBlock",
        text: `Free: ${significantFree.map((f) => `${fmtTime(f.startTime)}\u2013${fmtTime(f.endTime)} (${toHours(f.durationMinutes)})`).join(", ")}`,
        isSubtle: true,
        wrap: true,
        spacing: "None",
      });
    }
  }

  // Week totals
  const totalMeetings = summary.days.reduce((s, d) => s + d.meetings.length, 0);
  const totalMeetingMin = summary.days.reduce((s, d) => s + d.totalMeetingMinutes, 0);
  const totalFreeMin = summary.days.reduce((s, d) => s + d.totalFreeMinutes, 0);
  body.push({
    type: "TextBlock",
    text: `${totalMeetings} meetings (${toHours(totalMeetingMin)}) \u00B7 ${toHours(totalFreeMin)} free`,
    spacing: "Large",
    wrap: true,
    isSubtle: true,
  });

  // Tasks
  if (summary.tasks && summary.tasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "\u{1F4CC} TASKS",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });
    for (const task of summary.tasks) {
      const icon = task.priority === "high" ? "\u26A1" : "\u2022";
      let text = `${icon} ${task.title}`;
      if (task.dueDate) text += ` _(due ${task.dueDate})_`;
      body.push({ type: "TextBlock", text, wrap: true });
    }
  }

  // Action items (same pattern as daily)
  if (summary.actionItems && summary.actionItems.length > 0) {
    const actions = summary.actionItems.filter((i) => i.category === "action");
    const todos = summary.actionItems.filter((i) => i.category === "todo");
    const fyis = summary.actionItems.filter((i) => i.category === "fyi");

    if (actions.length > 0) {
      body.push({ type: "TextBlock", text: "\u{1F534} ACTION ITEMS", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Attention", wrap: true });
      for (const item of actions) {
        const icon = item.priority === "high" ? "\u26A1" : "\u2022";
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `${icon} **${item.title}**${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }

    if (todos.length > 0) {
      body.push({ type: "TextBlock", text: "\u{1F7E1} FOLLOW-UPS", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Warning", wrap: true });
      for (const item of todos) {
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `\u2022 ${item.title}${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }

    if (fyis.length > 0) {
      body.push({ type: "TextBlock", text: "\u2705 FYI", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Good", wrap: true });
      for (const item of fyis) {
        const sender = item.sender ? ` \u2014 ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `\u2022 ${item.title}${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }
  }

  return buildAdaptiveCard(body);
}

// -- Adaptive Card builder --

function buildAdaptiveCard(body: Record<string, unknown>[]): Record<string, unknown> {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
  };
}

// -- Combined Formatters --

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

// -- Morning Brief: Plain Text --

export function formatMorningBriefText(brief: MorningBrief): string {
  const lines: string[] = [];

  lines.push(`☀️ Morning Brief — ${brief.day.dayName}, ${brief.targetDate}`);
  lines.push("");

  // Schedule overview
  lines.push("━━ SCHEDULE ━━");
  if (brief.day.meetings.length === 0) {
    lines.push("  No meetings today ✅");
  } else {
    const sorted = [...brief.day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (const m of sorted) {
      const attendeeStr = m.attendees?.length
        ? ` — ${m.attendees.slice(0, 3).join(", ")}${m.attendees.length > 3 ? ` +${m.attendees.length - 3}` : ""}`
        : "";
      lines.push(`  ${fmtTime(m.startTime)} - ${fmtTime(m.endTime)}  ${m.subject}${attendeeStr}`);
    }
  }

  // Conflicts
  const conflicts = countConflicts(brief.day);
  if (conflicts > 0) {
    lines.push(`  ⚠️ ${conflicts} scheduling conflict${conflicts > 1 ? "s" : ""}`);
  }
  lines.push("");

  // Free blocks
  const significantFree = brief.day.freeBlocks.filter((f) => f.durationMinutes >= 15);
  if (significantFree.length > 0) {
    lines.push("FREE BLOCKS");
    for (const f of significantFree) {
      lines.push(`  ${fmtTime(f.startTime)} - ${fmtTime(f.endTime)}  (${toHours(f.durationMinutes)})`);
    }
    lines.push("");
  }

  // Totals
  let totalLine = `📊 ${brief.day.meetings.length} meetings (${toHours(brief.day.totalMeetingMinutes)}) · ${significantFree.length} free blocks (${toHours(brief.day.totalFreeMinutes)})`;
  if (conflicts > 0) totalLine += ` · ⚠️ ${conflicts} conflict${conflicts > 1 ? "s" : ""}`;
  lines.push(totalLine);
  lines.push("");

  // Email digest
  if (brief.emailDigest && brief.emailDigest.length > 0) {
    lines.push(formatEmailDigestText(brief.emailDigest));
    lines.push("");
  }

  // Teams highlights
  if (brief.teamsHighlights && brief.teamsHighlights.length > 0) {
    lines.push(formatTeamsHighlightsText(brief.teamsHighlights));
    lines.push("");
  }

  // Meeting prep briefs
  if (brief.meetingPreps && brief.meetingPreps.length > 0) {
    lines.push(formatMeetingPrepsText(brief.meetingPreps));
    lines.push("");
  }

  // Tasks
  if (brief.tasks && brief.tasks.length > 0) {
    lines.push(formatTasksText(brief.tasks));
    lines.push("");
  }

  // Action items
  if (brief.actionItems && brief.actionItems.length > 0) {
    lines.push(formatActionItemsText(brief.actionItems));
  }

  return lines.join("\n");
}

// -- Email Digest --

function formatEmailDigestText(emails: EmailDigest[]): string {
  const needsResponse = emails.filter((e) => e.needsResponse);
  const fyi = emails.filter((e) => !e.needsResponse);
  const lines: string[] = ["📧 EMAIL DIGEST"];

  if (needsResponse.length > 0) {
    lines.push("  Needs response:");
    for (const e of needsResponse) {
      const icon = e.priority === "high" ? "⚡" : "•";
      lines.push(`  ${icon} ${e.sender}: ${e.subject}`);
      if (e.snippet) lines.push(`    ${e.snippet}`);
    }
  }

  if (fyi.length > 0) {
    if (needsResponse.length > 0) lines.push("");
    lines.push("  FYI:");
    for (const e of fyi) {
      lines.push(`  • ${e.sender}: ${e.subject}`);
      if (e.snippet) lines.push(`    ${e.snippet}`);
    }
  }

  return lines.join("\n");
}

// -- Teams Highlights --

function formatTeamsHighlightsText(messages: TeamsHighlight[]): string {
  const lines: string[] = ["💬 TEAMS HIGHLIGHTS"];
  for (const m of messages) {
    const unread = m.isUnread ? " 🔵" : "";
    lines.push(`  • ${m.sender} in ${m.channelOrChat}${unread}`);
    lines.push(`    ${m.message}`);
  }
  return lines.join("\n");
}

// -- Meeting Prep Briefs --

function formatMeetingPrepsText(preps: MeetingPrep[]): string {
  const lines: string[] = ["🎯 MEETING PREP"];

  for (const prep of preps) {
    lines.push(`  ── ${prep.meetingSubject} ──`);

    if (prep.attendeeNotes) {
      lines.push(`  👥 ${prep.attendeeNotes}`);
    }

    if (prep.recentEmails && prep.recentEmails.length > 0) {
      lines.push("  Recent emails:");
      for (const e of prep.recentEmails.slice(0, 3)) {
        lines.push(`    • ${e.sender}: ${e.subject}`);
        if (e.snippet) lines.push(`      ${e.snippet}`);
      }
    }

    if (prep.recentTeamsMessages && prep.recentTeamsMessages.length > 0) {
      lines.push("  Recent Teams:");
      for (const m of prep.recentTeamsMessages.slice(0, 3)) {
        lines.push(`    • ${m.sender}: ${m.message}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// -- Morning Brief: Adaptive Card --

export function formatMorningBriefCard(brief: MorningBrief): Record<string, unknown> {
  const body: Record<string, unknown>[] = [];

  body.push({
    type: "TextBlock",
    text: `☀️ Morning Brief — ${brief.day.dayName}, ${brief.targetDate}`,
    weight: "Bolder",
    size: "Large",
    wrap: true,
  });

  // Schedule section
  body.push({
    type: "TextBlock",
    text: "SCHEDULE",
    weight: "Bolder",
    size: "Medium",
    spacing: "Medium",
    wrap: true,
  });

  if (brief.day.meetings.length === 0) {
    body.push({ type: "TextBlock", text: "No meetings today ✅", color: "Good", wrap: true });
  } else {
    const sorted = [...brief.day.meetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    const meetingFacts = sorted.map((m) => ({
      title: `${fmtTime(m.startTime)}–${fmtTime(m.endTime)}`,
      value: m.subject,
    }));
    body.push({ type: "FactSet", facts: meetingFacts });
  }

  // Totals
  const conflicts = countConflicts(brief.day);
  const significantFree = brief.day.freeBlocks.filter((f) => f.durationMinutes >= 15);
  let totalText = `${brief.day.meetings.length} meetings (${toHours(brief.day.totalMeetingMinutes)}) · ${significantFree.length} free blocks (${toHours(brief.day.totalFreeMinutes)})`;
  if (conflicts > 0) totalText += ` · ⚠️ ${conflicts} conflict${conflicts > 1 ? "s" : ""}`;
  body.push({
    type: "TextBlock",
    text: totalText,
    spacing: "Medium",
    wrap: true,
    isSubtle: true,
  });

  // Email digest section
  if (brief.emailDigest && brief.emailDigest.length > 0) {
    body.push({
      type: "TextBlock",
      text: "📧 EMAIL DIGEST",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });

    const needsResponse = brief.emailDigest.filter((e) => e.needsResponse);
    const fyi = brief.emailDigest.filter((e) => !e.needsResponse);

    if (needsResponse.length > 0) {
      body.push({ type: "TextBlock", text: "**Needs response:**", wrap: true, spacing: "Small" });
      for (const e of needsResponse) {
        const icon = e.priority === "high" ? "⚡" : "•";
        body.push({ type: "TextBlock", text: `${icon} **${e.sender}**: ${e.subject}`, wrap: true });
        if (e.snippet) body.push({ type: "TextBlock", text: e.snippet, wrap: true, isSubtle: true, spacing: "None" });
      }
    }

    if (fyi.length > 0) {
      body.push({ type: "TextBlock", text: "**FYI:**", wrap: true, spacing: "Small" });
      for (const e of fyi) {
        body.push({ type: "TextBlock", text: `• ${e.sender}: ${e.subject}`, wrap: true });
        if (e.snippet) body.push({ type: "TextBlock", text: e.snippet, wrap: true, isSubtle: true, spacing: "None" });
      }
    }
  }

  // Teams highlights section
  if (brief.teamsHighlights && brief.teamsHighlights.length > 0) {
    body.push({
      type: "TextBlock",
      text: "💬 TEAMS HIGHLIGHTS",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });
    for (const m of brief.teamsHighlights) {
      const unread = m.isUnread ? " 🔵" : "";
      body.push({ type: "TextBlock", text: `**${m.sender}** in ${m.channelOrChat}${unread}`, wrap: true });
      body.push({ type: "TextBlock", text: m.message, wrap: true, isSubtle: true, spacing: "None" });
    }
  }

  // Meeting prep section
  if (brief.meetingPreps && brief.meetingPreps.length > 0) {
    body.push({
      type: "TextBlock",
      text: "🎯 MEETING PREP",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });

    for (const prep of brief.meetingPreps) {
      body.push({ type: "TextBlock", text: `**${prep.meetingSubject}**`, weight: "Bolder", spacing: "Medium", wrap: true });

      if (prep.attendeeNotes) {
        body.push({ type: "TextBlock", text: `👥 ${prep.attendeeNotes}`, wrap: true, isSubtle: true, spacing: "None" });
      }

      if (prep.recentEmails && prep.recentEmails.length > 0) {
        for (const e of prep.recentEmails.slice(0, 3)) {
          body.push({ type: "TextBlock", text: `📧 ${e.sender}: ${e.subject}`, wrap: true, spacing: "None" });
          if (e.snippet) body.push({ type: "TextBlock", text: e.snippet, wrap: true, isSubtle: true, spacing: "None" });
        }
      }

      if (prep.recentTeamsMessages && prep.recentTeamsMessages.length > 0) {
        for (const m of prep.recentTeamsMessages.slice(0, 3)) {
          body.push({ type: "TextBlock", text: `💬 ${m.sender}: ${m.message}`, wrap: true, spacing: "None" });
        }
      }
    }
  }

  // Tasks
  if (brief.tasks && brief.tasks.length > 0) {
    body.push({
      type: "TextBlock",
      text: "📌 TASKS",
      weight: "Bolder",
      size: "Medium",
      spacing: "Large",
      wrap: true,
    });
    for (const task of brief.tasks) {
      const icon = task.priority === "high" ? "⚡" : "•";
      let text = `${icon} ${task.title}`;
      if (task.dueDate) text += ` _(due ${task.dueDate})_`;
      body.push({ type: "TextBlock", text, wrap: true });
    }
  }

  // Action items
  if (brief.actionItems && brief.actionItems.length > 0) {
    const actions = brief.actionItems.filter((i) => i.category === "action");
    const todos = brief.actionItems.filter((i) => i.category === "todo");
    const fyis = brief.actionItems.filter((i) => i.category === "fyi");

    if (actions.length > 0) {
      body.push({ type: "TextBlock", text: "🔴 ACTION ITEMS", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Attention", wrap: true });
      for (const item of actions) {
        const icon = item.priority === "high" ? "⚡" : "•";
        const sender = item.sender ? ` — ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `${icon} **${item.title}**${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }

    if (todos.length > 0) {
      body.push({ type: "TextBlock", text: "🟡 FOLLOW-UPS", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Warning", wrap: true });
      for (const item of todos) {
        const sender = item.sender ? ` — ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `• ${item.title}${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }

    if (fyis.length > 0) {
      body.push({ type: "TextBlock", text: "✅ FYI", weight: "Bolder", size: "Medium", spacing: "Medium", color: "Good", wrap: true });
      for (const item of fyis) {
        const sender = item.sender ? ` — ${item.sender}` : "";
        body.push({ type: "TextBlock", text: `• ${item.title}${sender}`, wrap: true });
        if (item.summary) body.push({ type: "TextBlock", text: item.summary, wrap: true, isSubtle: true, spacing: "None" });
      }
    }
  }

  return buildAdaptiveCard(body);
}

// -- Combined Formatters --

export function formatMorningBrief(brief: MorningBrief): FormattedSummary {
  return {
    plainText: formatMorningBriefText(brief),
    adaptiveCard: formatMorningBriefCard(brief),
  };
}
