# Prep My Day — Copilot Instructions

## Project Overview
**Prep My Day** is an M365 Copilot declarative agent + MCP server that delivers concise schedule summaries. Copilot fetches calendar data via built-in Meetings capability, then passes pre-fetched events to the MCP server for filtering, computation, and formatting. **No custom Azure AD app registration required.**

**Primary user:** Salman Khan (PM, WE2 Security Partner Enablement)

## Architecture (Declarative Agent + API Plugin)
```
User: "Prep my week"
    ↓
M365 Copilot (declarativeAgent.json)
    ↓
Uses built-in "Meetings" capability → fetches calendar events (no custom auth)
Uses WorkIQ (if available) → fetches tasks
    ↓
Calls MCP Server POST /api/render-weekly-summary (via OpenAPI plugin)
    ↓
MCP Server: filters confirmed meetings, computes free blocks, formats output
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
│   │   ├── types.ts                # Core types + helpers
│   │   ├── schedule-builder.ts     # Filter meetings, compute free blocks
│   │   └── message-formatter.ts    # Text + Adaptive Card formatting
│   ├── appPackage/                 # M365 Copilot declarative agent manifest
│   │   ├── manifest.json           # Teams app manifest (v1.19)
│   │   ├── declarativeAgent.json   # Agent config with capabilities + actions
│   │   ├── instruction.md          # Agent behavioral instructions
│   │   ├── openapi.json            # OpenAPI spec for HTTP endpoints
│   │   ├── renderWeeklySummary.json # Action wrapper for weekly
│   │   └── renderDailySummary.json  # Action wrapper for daily
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

## MCP Tools (4 tools)
| Tool | Description |
|------|-------------|
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
- Data flows: Copilot → Server → formatted output
- Deploy via Teams app package (appPackage.zip) to M365 Copilot
