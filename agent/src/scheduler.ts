// Automated scheduling for weekly and daily triggers using node-cron

import cron from "node-cron";
import type { PrepMyDayConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export type TriggerCallback = (type: "weekly" | "daily") => Promise<string | void>;

let weeklyJob: cron.ScheduledTask | null = null;
let dailyJob: cron.ScheduledTask | null = null;

/**
 * Start the automated cron triggers.
 */
export function startScheduler(
  callback: TriggerCallback,
  config: PrepMyDayConfig = DEFAULT_CONFIG,
): void {
  stopScheduler();

  if (config.weeklyTrigger.enabled) {
    weeklyJob = cron.schedule(
      config.weeklyTrigger.cronExpression,
      async () => {
        console.log(`[Scheduler] Weekly trigger fired at ${new Date().toISOString()}`);
        try {
          await callback("weekly");
        } catch (error) {
          console.error("[Scheduler] Weekly trigger error:", error);
        }
      },
      { timezone: config.timezone },
    );
    console.log(`[Scheduler] Weekly trigger scheduled: ${config.weeklyTrigger.description}`);
  }

  if (config.dailyTrigger.enabled) {
    dailyJob = cron.schedule(
      config.dailyTrigger.cronExpression,
      async () => {
        console.log(`[Scheduler] Daily trigger fired at ${new Date().toISOString()}`);
        try {
          await callback("daily");
        } catch (error) {
          console.error("[Scheduler] Daily trigger error:", error);
        }
      },
      { timezone: config.timezone },
    );
    console.log(`[Scheduler] Daily trigger scheduled: ${config.dailyTrigger.description}`);
  }
}

/**
 * Stop all scheduled triggers.
 */
export function stopScheduler(): void {
  if (weeklyJob) {
    weeklyJob.stop();
    weeklyJob = null;
  }
  if (dailyJob) {
    dailyJob.stop();
    dailyJob = null;
  }
}

/**
 * Get current scheduler status.
 */
export function getSchedulerStatus(): { weekly: boolean; daily: boolean } {
  return {
    weekly: weeklyJob !== null,
    daily: dailyJob !== null,
  };
}
