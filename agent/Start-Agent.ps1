# Start-Agent.ps1 — One-click launcher for Prep My Day agent
# Usage: .\Start-Agent.ps1 [-Http] [-Tunnel]

param(
    [switch]$Http,
    [switch]$Tunnel
)

$ErrorActionPreference = "Stop"
$agentDir = Join-Path $PSScriptRoot "agent"

Write-Host "=== Prep My Day Agent ===" -ForegroundColor Cyan
Write-Host ""

# Build
Write-Host "[1/3] Building TypeScript..." -ForegroundColor Yellow
Push-Location $agentDir
npm run build 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Write-Host "  Build successful." -ForegroundColor Green
Pop-Location

# Start server
if ($Http -or $Tunnel) {
    Write-Host "[2/3] Starting HTTP server on port 3003..." -ForegroundColor Yellow
    $env:PORT = "3003"

    if ($Tunnel) {
        Write-Host "[3/3] Starting with localtunnel..." -ForegroundColor Yellow
        Push-Location $agentDir
        npm run start:copilot
        Pop-Location
    } else {
        Push-Location $agentDir
        npm run start:http
        Pop-Location
    }
} else {
    Write-Host "[2/3] Starting MCP server (stdio mode)..." -ForegroundColor Yellow
    Write-Host "[3/3] Ready for MCP client connection." -ForegroundColor Green
    Push-Location $agentDir
    npm run start
    Pop-Location
}
