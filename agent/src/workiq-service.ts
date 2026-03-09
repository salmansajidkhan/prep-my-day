// WorkIQ integration for upcoming tasks and projects

import type { TaskItem } from "./types.js";

/**
 * Query WorkIQ for upcoming tasks and projects.
 *
 * WorkIQ provides a natural-language query interface over M365 data
 * (emails, meetings, documents, Teams chats). We issue targeted queries
 * and parse the results into structured TaskItem objects.
 *
 * In MCP mode, the host (Copilot CLI) provides WorkIQ access via the
 * workiq-ask_work_iq tool. In standalone/HTTP mode, this module provides
 * a fallback that returns a placeholder.
 */

export type WorkIqQueryFn = (question: string) => Promise<string>;

let workIqQueryFn: WorkIqQueryFn | null = null;

/**
 * Register the WorkIQ query function (injected from the MCP host or HTTP layer).
 */
export function setWorkIqQueryFn(fn: WorkIqQueryFn): void {
  workIqQueryFn = fn;
}

/**
 * Query WorkIQ for tasks relevant to a timeframe.
 */
export async function getUpcomingTasks(
  timeframe: "week" | "day",
  targetDate?: string,
): Promise<TaskItem[]> {
  if (!workIqQueryFn) {
    return getPlaceholderTasks(timeframe);
  }

  const dateContext = targetDate ? ` (around ${targetDate})` : "";

  const queries = timeframe === "week"
    ? [
        `What are my key tasks, deliverables, and deadlines for next week${dateContext}? Include document links if available.`,
        `What action items were assigned to me in recent meetings${dateContext}? Include the meeting name and any follow-up details.`,
      ]
    : [
        `What tasks and follow-ups do I have for tomorrow${dateContext}? Include document links if available.`,
        `Are there any deadlines or deliverables due tomorrow${dateContext}?`,
      ];

  const results: string[] = [];
  for (const q of queries) {
    try {
      const answer = await workIqQueryFn(q);
      if (answer) results.push(answer);
    } catch {
      // WorkIQ query failed — continue with other queries
    }
  }

  if (results.length === 0) {
    return [];
  }

  return parseWorkIqResults(results.join("\n\n"));
}

/**
 * Parse WorkIQ natural-language response into structured TaskItem objects.
 * This is a best-effort extraction — WorkIQ responses vary in format.
 */
function parseWorkIqResults(text: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0);

  for (const line of lines) {
    const trimmed = line.replace(/^[-•*]\s*/, "").trim();
    if (trimmed.length < 5) continue;
    // Skip lines that are headers or meta-commentary
    if (trimmed.startsWith("#") || trimmed.toLowerCase().startsWith("here are")) continue;

    const task: TaskItem = { title: trimmed };

    // Extract due date patterns like "(due Thursday)", "(by March 12)"
    const dueMatch = trimmed.match(/\((?:due|by|deadline:?)\s+([^)]+)\)/i);
    if (dueMatch) {
      task.dueDate = dueMatch[1].trim();
      task.title = trimmed.replace(dueMatch[0], "").trim();
    }

    // Extract document URLs
    const urlMatch = trimmed.match(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
    if (urlMatch) {
      task.documentUrl = urlMatch[2];
      task.title = task.title.replace(urlMatch[0], urlMatch[1]).trim();
    }

    // Detect source type from context clues
    if (/meeting|call|sync|standup/i.test(trimmed)) {
      task.source = "meeting";
    } else if (/email|mail|message/i.test(trimmed)) {
      task.source = "email";
    } else if (/document|doc|report|plan|deck/i.test(trimmed)) {
      task.source = "document";
    }

    // Detect priority
    if (/urgent|critical|asap|high priority/i.test(trimmed)) {
      task.priority = "high";
    }

    if (task.title.length > 3) {
      tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Fallback when WorkIQ is not available.
 */
function getPlaceholderTasks(timeframe: "week" | "day"): TaskItem[] {
  return [{
    title: `WorkIQ not connected — unable to retrieve ${timeframe === "week" ? "weekly" : "daily"} tasks`,
    source: undefined,
    priority: "normal",
  }];
}
