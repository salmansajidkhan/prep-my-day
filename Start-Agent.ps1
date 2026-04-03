<#
.SYNOPSIS
    Start the Prep My Day MCP agent.

.DESCRIPTION
    One-click launcher: installs dependencies if needed, builds TypeScript,
    and starts the server in the requested mode.

.PARAMETER Mode
    stdio  — MCP stdio transport (default, for Copilot CLI)
    http   — Express HTTP server on port 3003 (for M365 Copilot / API plugin)
    copilot — HTTP + localtunnel (public URL for M365 Copilot cloud access)
#>

param(
    [ValidateSet("stdio", "http", "copilot")]
    [string]$Mode = "stdio"
)

$ErrorActionPreference = "Stop"
$AgentDir = Join-Path $PSScriptRoot "agent"

# ── Preflight ──

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

Push-Location $AgentDir
try {
    # Dependencies
    if (-not (Test-Path "node_modules")) {
        Write-Host "[Prep My Day] Installing dependencies..." -ForegroundColor Cyan
        npm install --silent
    }

    # Build
    Write-Host "[Prep My Day] Building TypeScript..." -ForegroundColor Cyan
    npm run build --silent

    # Start
    switch ($Mode) {
        "stdio" {
            Write-Host "[Prep My Day] Starting MCP server (stdio)..." -ForegroundColor Green
            node dist/index.js
        }
        "http" {
            Write-Host "[Prep My Day] Starting HTTP server on http://localhost:3003 ..." -ForegroundColor Green
            node dist/index.js --http
        }
        "copilot" {
            Write-Host "[Prep My Day] Starting HTTP + localtunnel..." -ForegroundColor Green
            npm run start:copilot
        }
    }
}
finally {
    Pop-Location
}
