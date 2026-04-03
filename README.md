# Prep My Day

> A morning briefing agent that compiles your calendar, email, and Teams into a single actionable brief — delivered through M365 Copilot or any MCP client.

## The Problem

Knowledge workers start every day the same way: scanning calendar, triaging email, catching up on Teams, and figuring out what matters. This context-gathering ritual takes 20–30 minutes and still leaves gaps — you walk into a meeting without knowing what the attendees emailed you about yesterday.

**Prep My Day** eliminates that friction. It fetches your M365 data, filters noise, and delivers one structured brief with schedule, email digest, Teams highlights, and per-meeting prep context — all before your first sip of coffee.

## Features

- **Morning Brief** — Schedule + email triage + Teams highlights + per-meeting prep context
- **Weekly Summary** — Mon–Fri schedule with confirmed meetings, free blocks, and tasks
- **Daily Summary** — Next workday's schedule in the same format
- **Smart Filtering** — Strips tentative, declined, focus time, and lunch blocks automatically
- **Conflict Detection** — Flags overlapping meetings with ⚠️ warnings
- **Meeting Prep** — Surfaces recent emails and Teams threads relevant to each meeting's attendees
- **Dual Transport** — Runs as both an MCP server (stdio) and an HTTP API
- **Zero Auth Setup** — No custom app registration; Copilot handles M365 authentication

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  User: "Prep my day"                                     │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  M365 Copilot (Declarative Agent)                        │
│                                                          │
│  ┌─────────┐ ┌───────┐ ┌───────────┐ ┌────────┐         │
│  │Calendar │ │ Email │ │  Teams    │ │ People │         │
│  │(built-in)│ │(cap.) │ │ Messages │ │ (cap.) │         │
│  └────┬────┘ └───┬───┘ │  (cap.)  │ └───┬────┘         │
│       │          │      └────┬─────┘     │              │
│       └──────────┴───────────┴───────────┘              │
│                         │  pre-fetched data              │
└─────────────────────────┼────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              │  stdio        HTTP    │
              │  (MCP)    (Express)   │
              └───────────┬───────────┘
                          ▼
┌──────────────────────────────────────────────────────────┐
│  PrepMyDay Server                                        │
│                                                          │
│  schedule-builder.ts    Filter meetings, compute gaps    │
│  message-formatter.ts   Plain text + Adaptive Cards      │
│  types.ts               Domain types + validation        │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Formatted Brief    │
              │  (text + card)      │
              └─────────────────────┘
```

**Key design decision:** Copilot fetches all M365 data via its built-in capabilities. The server receives pre-fetched data and handles only computation and formatting — no Graph API calls, no token management, no custom auth.

## Example Output

```
☀️ Morning Brief — Wednesday, 2025-03-11

━━ SCHEDULE ━━
  1:30 PM - 2:00 PM  Budget Review — Alex Chen
  2:05 PM - 2:30 PM  Security Sync — Dana Park, Ravi Patel
  5:30 PM - 6:00 PM  Platform Workstream — Jordan Lee +12
  ⚠️ 1 scheduling conflict

📊 3 meetings (1h 25m) · 3 free blocks (5h 35m) · ⚠️ 1 conflict

📧 EMAIL DIGEST
  Needs response:
  ⚡ Taylor Kim: Signing latency still unresolved
     Build signing taking ~55 min, blocking partner CI/CD pipeline
  • Casey Ng: Membership reinstatement & verification
     Needs guidance on reactivating program membership

💬 TEAMS HIGHLIGHTS
  • Sam Torres in Platform Triage 🔵
     Updated triage outcomes for Arm64 compatibility work

🎯 MEETING PREP
  ── Security Sync ──
  👥 Dana Park (Security PM), Ravi Patel (Engineering Lead)
  Recent emails:
    • Morgan Ali: Updated security action items for Q1 review

📌 TASKS
  ⚡ Close or re-scope tracking bug (due this week)
  • Review partner meeting follow-ups
```

## Quick Start

```bash
cd agent
npm install
npm run build
```

### MCP Mode (Copilot CLI / any MCP client)
```bash
npm run dev        # development (tsx)
npm start          # production (compiled)
```

### HTTP Mode (M365 Copilot via API plugin)
```bash
npm run dev:http   # development — http://localhost:3003
npm start:http     # production
```

### Deploy as M365 Copilot Agent
1. Zip the `appPackage/` contents (not the folder itself)
2. Upload to Teams Admin Center or Copilot Studio
3. Start the server or tunnel: `npm run start:copilot`
4. No app registration required — Copilot handles auth

## Project Structure

```
PrepMyDay/
├── agent/
│   ├── src/
│   │   ├── index.ts               # MCP + HTTP hybrid server entry point
│   │   ├── types.ts               # CalendarEvent, EmailDigest, MorningBrief, Config
│   │   ├── schedule-builder.ts    # Filter confirmed meetings, compute free blocks
│   │   └── message-formatter.ts   # Plain text + Adaptive Card formatting
│   ├── appPackage/
│   │   ├── manifest.json          # Teams app manifest (v1.19)
│   │   ├── declarativeAgent.json  # Agent config + M365 capabilities
│   │   ├── instruction.md         # Behavioral instructions (3 workflows)
│   │   ├── openapi.json           # OpenAPI spec for HTTP endpoints
│   │   └── render*.json           # Action wrappers for each endpoint
│   ├── data/                      # Runtime config (persisted)
│   └── dist/                      # Compiled output
└── README.md
```

## API Reference

### MCP Tools

| Tool | Description |
|------|-------------|
| `render_morning_brief` | Full morning briefing: schedule + email + Teams + meeting prep |
| `render_weekly_summary` | Mon–Fri meetings, free blocks, and tasks |
| `render_daily_summary` | Single-day meetings, free blocks, and tasks |
| `get_config` | View current configuration |
| `set_config` | Update working hours, timezone, filter keywords |

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/render-morning-brief` | Morning brief with all context |
| `POST` | `/api/render-weekly-summary` | Weekly summary |
| `POST` | `/api/render-daily-summary` | Daily summary |
| `GET` | `/api/config` | Get configuration |
| `PUT` | `/api/config` | Update configuration |

## Calendar Filtering Logic

| Rule | Behavior |
|------|----------|
| Confirmed | `showAs = busy` AND `responseStatus = accepted \| organizer` |
| Excluded | Tentative, declined, focus time, lunch, all-day events |
| Focus time | Detected by subject keywords ("focus time", "deep work", etc.) |
| Free blocks | Gaps between confirmed meetings within working hours |

## Configuration

Persisted in `agent/data/config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| `workingHoursStart` | `9` | Work start hour (24h) |
| `workingHoursEnd` | `17` | Work end hour (24h) |
| `timezone` | `America/Los_Angeles` | IANA timezone |
| `focusTimeKeywords` | `focus time, deep work, …` | Subjects treated as free time |
| `lunchKeywords` | `lunch, lunch break, …` | Subjects treated as free time |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `express` | HTTP server for API plugin endpoints |
| `zod` | Runtime schema validation for tool inputs |
| `tsx` | TypeScript execution for development |
| `typescript` | Type checking and compilation |

**Requirements:** Node.js 18+ · M365 Copilot license (for declarative agent deployment)

## Status

**Experimental / WIP** — This is a working prototype built to explore the M365 Copilot declarative agent + MCP pattern. The core briefing flow works end-to-end, but the project is under active development. Expect breaking changes.

## License

MIT
