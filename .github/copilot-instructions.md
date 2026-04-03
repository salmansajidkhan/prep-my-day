# Prep My Day — Copilot Instructions

## Project Overview
**Prep My Day** is an M365 Copilot declarative agent + MCP server that delivers comprehensive morning briefings combining schedule, email digest, Teams highlights, and per-meeting prep context. Copilot fetches M365 data via built-in capabilities (Calendar, Email, TeamsMessages, People), then passes pre-fetched data to the MCP server for filtering, computation, and formatting. **No custom Azure AD app registration required.**

**Primary user:** Salman Khan (PM, WE2 Security Partner Enablement)

## Architecture (Declarative Agent + API Plugin)
```
User: "Prep my day"
    ↓
M365 Copilot (declarativeAgent.json)
    ↓
Uses built-in Calendar → fetches today's meetings
Uses Email capability → fetches recent important emails
Uses TeamsMessages capability → fetches unread Teams messages
Uses People capability → fetches attendee org context
Uses WorkIQ (if available) → fetches tasks
    ↓
Calls MCP Server POST /api/render-morning-brief (via OpenAPI plugin)
    ↓
MCP Server: filters meetings, computes free blocks, formats email/Teams/meeting prep
    ↓
Returns plainText + Adaptive Card → Copilot displays to user
```

## Tech Stack
- **Language:** TypeScript 5.7+ → ES2022 JavaScript
- **Runtime:** Node.js (ESM, `"type": "module"`)
- **MCP SDK:** @modelcontextprotocol/sdk 1.12.1
- **HTTP Server:** Express 4.21
- **Validation:** Zod 3.24
- **Dev:** tsx 4.19 (live TS execution)
- **Tunneling:** localtunnel 2.0.2 (M365 integration)
- **Auth:** None — Copilot handles M365 authentication via user's existing session

## Source Files
```
PrepMyDay/
├── agent/                          # Main agent
│   ├── src/                        # TypeScript source
│   │   ├── index.ts                # MCP + HTTP hybrid server (entry point)
│   │   ├── types.ts                # Core types + M365 enrichment types + helpers
│   │   ├── schedule-builder.ts     # Filter meetings, compute free blocks
│   │   └── message-formatter.ts    # Text + Adaptive Card formatting (daily, weekly, morning brief)
│   ├── appPackage/                 # M365 Copilot declarative agent manifest
│   │   ├── manifest.json           # Teams app manifest (v1.19)
│   │   ├── declarativeAgent.json   # Agent config with Email/Teams/People capabilities + actions
│   │   ├── instruction.md          # Agent behavioral instructions (3 workflows)
│   │   ├── openapi.json            # OpenAPI spec for HTTP endpoints
│   │   ├── renderWeeklySummary.json  # Action wrapper for weekly
│   │   ├── renderDailySummary.json   # Action wrapper for daily
│   │   └── renderMorningBrief.json   # Action wrapper for morning brief
│   ├── dist/                       # Compiled JS output
│   └── data/                       # Runtime config
├── .github/
│   └── copilot-instructions.md     # This file
├── .gitignore
└── README.md
```

## Key Design Patterns
1. **Declarative agent pattern** — Copilot fetches M365 data, server does computation
2. **No custom auth** — Copilot handles authentication via user's existing session
3. **API plugin** — OpenAPI spec connects declarative agent to MCP server
4. **Dual-mode execution** — stdio (MCP/CLI) and HTTP (M365 Copilot)
5. **M365 capability grounding** — Email, TeamsMessages, People capabilities enable rich context

## MCP Tools (6 tools)
| Tool | Description |
|------|-------------|
| `render_morning_brief` | Comprehensive morning briefing: schedule + email + Teams + meeting prep |
| `render_weekly_summary` | Filter meetings + compute free blocks for Mon–Fri |
| `render_daily_summary` | Filter meetings + compute free blocks for one day |
| `get_config` | View current configuration |
| `set_config` | Update working hours, timezone, filter keywords |

## Naming Conventions
- **Files:** kebab-case (`schedule-builder.ts`)
- **Functions:** camelCase (`buildDaySummary()`)
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
- No custom Azure AD app required — Copilot handles auth via user's M365 session
- Server receives pre-fetched data, does NOT call Graph directly
- WorkIQ tasks are fetched by Copilot and passed in as input
- Email/Teams data is fetched by Copilot via declared capabilities and passed to server
- Data flows: Copilot → Server → formatted output
- Deploy via Teams app package (appPackage.zip) to M365 Copilot
- **`capabilities` in declarativeAgent.json is a whitelist** — listing specific capabilities restricts the agent to only those. The agent declares Email, TeamsMessages, and People explicitly. Calendar access comes from default M365 grounding (no explicit capability needed).
- Zip Teams app packages with wildcard (`folder\*`) to avoid nested subfolder in the archive
- **New types**: EmailDigest, TeamsHighlight, MeetingPrep, MorningBrief — for M365 enrichment data
