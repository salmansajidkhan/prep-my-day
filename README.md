# Prep My Day

Proactive schedule summaries and task reminders for Microsoft 365 — delivered via Teams.

## What It Does

**Prep My Day** is an MCP server agent that compiles your Microsoft 365 calendar data and WorkIQ task intelligence into concise, mobile-optimized summaries:

- **Weekly Summary** (Sunday 3 PM) — Mon–Fri schedule with confirmed meetings, free time blocks, and upcoming tasks
- **Daily Summary** (Weekday 5 PM) — Next workday's schedule with the same format

### Example Output
```
📅 Weekly Schedule — Week of 2026-03-16

**Monday** — Meeting: 10:00 AM–11:00 AM Project Kickoff; Free: 9:00 AM–10:00 AM, 11:00 AM–5:00 PM
**Tuesday** — No meetings – all free (480 min)
**Wednesday** — Meeting: 9:30 AM–10:00 AM 1:1 w/ Kevin; Meeting: 2:00 PM–3:00 PM Client Call; Free: 10:00 AM–2:00 PM, 3:00 PM–5:00 PM
...

📌 Upcoming Projects & Tasks:
⚡ Finish Q1 Budget Report (due Thursday) — Q1_Budget_Report.docx
• Follow up with EAC on driver submission (from team meeting)
• Review anti-cheat attestation API docs
```

## Quick Start

```bash
cd agent
npm install
npm run build
```

### Run in MCP mode (Claude Desktop / Copilot CLI)
```bash
npm run dev
```

### Run in HTTP mode (M365 Copilot / API)
```bash
npm run dev:http
# Server starts on http://localhost:3003
```

### One-click launcher (builds + starts + tunnels)
```powershell
.\Start-Agent.ps1
```

## Architecture

```
agent/src/
├── index.ts              # MCP + HTTP hybrid server (8 tools, 9 endpoints)
├── types.ts              # CalendarEvent, FreeBlock, DaySummary, TaskItem, Config
├── graph-auth.ts         # MSAL device code authentication
├── calendar-service.ts   # Microsoft Graph Calendar API integration
├── schedule-builder.ts   # Filter confirmed meetings, compute free blocks
├── workiq-service.ts     # WorkIQ task extraction
├── message-formatter.ts  # Plain text + Adaptive Card formatting
├── teams-sender.ts       # Proactive Teams messaging
└── scheduler.ts          # node-cron automated triggers
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `authenticate` | Auth with Microsoft Graph (device code flow) |
| `generate_weekly_summary` | Mon–Fri schedule + free blocks + tasks |
| `generate_daily_summary` | Next workday schedule + tasks |
| `get_upcoming_tasks` | Query WorkIQ for tasks/projects |
| `send_summary` | Send summary via Teams message |
| `get_config` | View current configuration |
| `set_config` | Update working hours, triggers, timezone |
| `trigger_now` | Manually fire a scheduled trigger |

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/authenticate` | Authenticate |
| GET | `/api/weekly-summary` | Weekly summary |
| GET | `/api/daily-summary` | Daily summary |
| GET | `/api/upcoming-tasks` | Upcoming tasks |
| POST | `/api/send-summary` | Send via Teams |
| GET | `/api/config` | Get config |
| PUT | `/api/config` | Update config |
| POST | `/api/trigger` | Manual trigger |

## Configuration

Configuration is persisted in `agent/data/config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `workingHoursStart` | 9 | Work start hour (24h) |
| `workingHoursEnd` | 17 | Work end hour (24h) |
| `timezone` | America/Los_Angeles | IANA timezone |
| `teamsDelivery` | false | Auto-send via Teams |
| `weeklyTrigger.enabled` | true | Sunday 3 PM trigger |
| `dailyTrigger.enabled` | true | Weekday 5 PM trigger |

## Calendar Filtering

- **Confirmed meetings**: `showAs = busy` AND `responseStatus = accepted/organizer`
- **Excluded**: tentative, declined, focus time, lunch blocks, all-day events
- **Focus time**: detected by subject keywords ("focus time", "deep work", etc.)
- **Free blocks**: computed as gaps between confirmed meetings within working hours

## Prerequisites

- Node.js 18+
- Azure AD app registration with these scopes: `Calendars.Read`, `Chat.ReadWrite`, `User.Read`
- Set environment variables:
  - `PREP_MY_DAY_CLIENT_ID` — Azure AD application (client) ID
  - `PREP_MY_DAY_AUTHORITY` — (optional) Azure AD authority URL

## Tech Stack

TypeScript · Node.js · MCP SDK · Express · Microsoft Graph · MSAL · WorkIQ · node-cron · Zod · Adaptive Cards
