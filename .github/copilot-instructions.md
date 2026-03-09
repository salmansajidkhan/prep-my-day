# Prep My Day — Copilot Instructions

## Project Overview
**Prep My Day** is an MCP server that proactively delivers concise schedule summaries and task reminders via Teams messages. It has two automated triggers (weekly Sunday 3PM, daily weekday 5PM) and integrates with Microsoft Graph Calendar + WorkIQ.

**Primary user:** Salman Khan (PM, WE2 Security Partner Enablement)

## Tech Stack
- **Language:** TypeScript 5.7+ → ES2022 JavaScript
- **Runtime:** Node.js (ESM, `"type": "module"`)
- **MCP SDK:** @modelcontextprotocol/sdk 1.12.1
- **HTTP Server:** Express 4.21
- **Auth:** @azure/msal-node (device code flow + token caching)
- **Graph:** @microsoft/microsoft-graph-client 3.0.7
- **Scheduling:** node-cron 3.0.3
- **Validation:** Zod 3.24
- **Dev:** tsx 4.19 (live TS execution)
- **Tunneling:** localtunnel 2.0.2 (M365 integration)

## Architecture
```
PrepMyDay/
├── agent/                          # Main agent
│   ├── src/                        # TypeScript source
│   │   ├── index.ts                # MCP + HTTP hybrid server (entry point)
│   │   ├── types.ts                # Core types + helpers
│   │   ├── graph-auth.ts           # MSAL device code auth
│   │   ├── calendar-service.ts     # Graph Calendar API
│   │   ├── schedule-builder.ts     # Filter meetings, compute free blocks
│   │   ├── workiq-service.ts       # WorkIQ task extraction
│   │   ├── message-formatter.ts    # Text + Adaptive Card formatting
│   │   ├── teams-sender.ts         # Proactive Teams messaging
│   │   └── scheduler.ts            # node-cron triggers
│   ├── appPackage/                 # M365 Copilot manifest
│   ├── dist/                       # Compiled JS output
│   └── data/                       # Runtime config + token cache
├── .github/
│   └── copilot-instructions.md     # This file
├── .gitignore
└── README.md
```

## Key Design Patterns
1. **Dual-mode execution** — stdio (MCP/Claude) and HTTP (M365 Copilot)
2. **Strategy pattern** — Schedule builder filters by event type
3. **Adapter pattern** — WorkIQ uses injectable query function
4. **Repository pattern** — Config persisted as JSON in data/

## MCP Tools (8 tools)
| Tool | Description |
|------|-------------|
| `authenticate` | MSAL device code auth for Graph |
| `generate_weekly_summary` | Mon–Fri schedule + tasks |
| `generate_daily_summary` | Next workday schedule + tasks |
| `get_upcoming_tasks` | WorkIQ query for tasks/projects |
| `send_summary` | Send via Teams message |
| `get_config` | View current configuration |
| `set_config` | Update working hours, triggers, timezone |
| `trigger_now` | Manually fire weekly or daily trigger |

## Naming Conventions
- **Files:** kebab-case (`calendar-service.ts`)
- **Functions:** camelCase (`fetchCalendarEvents()`)
- **Types:** PascalCase (`CalendarEvent`)
- **Constants:** UPPER_SNAKE_CASE or camelCase

## Running the Agent
```bash
cd agent
npm run dev          # Stdio mode (MCP clients)
npm run dev:http     # HTTP mode on port 3003
.\Start-Agent.ps1    # One-click launcher
```

## Calendar Filtering Rules
- **Confirmed** = showAs is "busy" AND responseStatus is "accepted" or "organizer"
- **Excluded** = tentative, declined, focus time, lunch, all-day events
- **Focus time** detected by: subject/category matching keywords
- **Free blocks** = gaps between confirmed meetings within working hours (9–5)

## Important Notes
- Human-in-the-loop: user reviews summaries before sending via `generate_*` tools
- Automated delivery via `trigger_now` or scheduler when `teamsDelivery` is enabled
- WorkIQ integration requires the host to inject the query function
- All times are timezone-aware (configurable, default Pacific)
