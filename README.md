# Prep My Day

Concise schedule summaries with meetings, free time blocks, and upcoming tasks — delivered in M365 Copilot.

## What It Does

**Prep My Day** is an M365 Copilot declarative agent that compiles your calendar into mobile-optimized summaries. No custom Azure AD app needed — Copilot handles all M365 authentication.

- **Weekly Summary** — Mon-Fri schedule with confirmed meetings, free blocks, and tasks
- **Daily Summary** — Next workday's schedule in the same format

### How It Works
```
User: "Prep my week"
       |
M365 Copilot -> fetches calendar events via built-in Meetings capability
             -> queries WorkIQ for tasks (if available)
       |
MCP Server -> filters confirmed meetings, computes free blocks, formats output
       |
User sees concise schedule in Teams
```

### Example Output
```
Weekly Schedule -- Week of 2026-03-16

**Monday** -- Meeting: 10:00 AM-11:00 AM Project Kickoff; Free: 9:00 AM-10:00 AM, 11:00 AM-5:00 PM
**Tuesday** -- No meetings - all free (480 min)
**Wednesday** -- Meeting: 9:30 AM-10:00 AM 1:1 w/ Kevin; Meeting: 2:00 PM-3:00 PM Client Call

Upcoming Projects and Tasks:
- Finish Q1 Budget Report (due Thursday)
- Review anti-cheat attestation API docs
```

## Quick Start

```bash
cd agent
npm install
npm run build
```

### Run in MCP mode (Copilot CLI)
```bash
npm run dev
```

### Run in HTTP mode (M365 Copilot via API plugin)
```bash
npm run dev:http
# Server starts on http://localhost:3003
```

### Deploy as M365 Copilot Agent
1. Build the app package: zip the `appPackage/` folder
2. Upload to Teams Admin Center or Copilot Studio
3. Start the MCP server (`npm run dev:http`) or tunnel (`npm run start:copilot`)
4. No Azure AD app registration needed

## Architecture

```
agent/src/
  index.ts              # MCP + HTTP hybrid server (4 tools, 4 endpoints)
  types.ts              # CalendarEvent, FreeBlock, DaySummary, TaskItem, Config
  schedule-builder.ts   # Filter confirmed meetings, compute free blocks
  message-formatter.ts  # Plain text + Adaptive Card formatting

agent/appPackage/
  manifest.json              # Teams app manifest (v1.19)
  declarativeAgent.json      # Copilot agent with capabilities + actions
  instruction.md             # Agent behavioral instructions
  openapi.json               # OpenAPI spec for HTTP endpoints
  renderWeeklySummary.json   # Action wrapper for weekly endpoint
  renderDailySummary.json    # Action wrapper for daily endpoint
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `render_weekly_summary` | Filter Mon-Fri meetings + compute free blocks + format |
| `render_daily_summary` | Filter one day's meetings + compute free blocks + format |
| `get_config` | View current configuration |
| `set_config` | Update working hours, timezone, filter keywords |

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/render-weekly-summary` | Weekly summary (accepts meetings + tasks) |
| POST | `/api/render-daily-summary` | Daily summary (accepts meetings + tasks) |
| GET | `/api/config` | Get config |
| PUT | `/api/config` | Update config |

## Calendar Filtering

- **Confirmed meetings**: `showAs = busy` AND `responseStatus = accepted/organizer`
- **Excluded**: tentative, declined, focus time, lunch blocks, all-day events
- **Focus time**: detected by subject keywords ("focus time", "deep work", etc.)
- **Free blocks**: gaps between confirmed meetings within working hours (default 9-5)

## Configuration

Persisted in `agent/data/config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `workingHoursStart` | 9 | Work start hour (24h) |
| `workingHoursEnd` | 17 | Work end hour (24h) |
| `timezone` | America/Los_Angeles | IANA timezone |
| `focusTimeKeywords` | focus time, deep work, ... | Subjects treated as free |
| `lunchKeywords` | lunch, lunch break, ... | Subjects treated as free |

## Prerequisites

- Node.js 18+
- M365 Copilot license (for declarative agent deployment)
- No Azure AD app registration needed

## Tech Stack

TypeScript, Node.js, MCP SDK, Express, Zod, Adaptive Cards, M365 Copilot Declarative Agent
