#!/usr/bin/env pwsh
# Qoyod Creative OS — interactive agent terminal
# Double-click or run: .\run.ps1

$BASE = "https://somaa-ai-agent-production.up.railway.app"

function Invoke-Post($path) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE$path" -Method POST -UseBasicParsing -TimeoutSec 120
        $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    } catch { Write-Host "Error: $_" -ForegroundColor Red }
}

function Invoke-Get($path) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE$path" -Method GET -UseBasicParsing -TimeoutSec 30
        $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    } catch { Write-Host "Error: $_" -ForegroundColor Red }
}

function Show-Help {
    Write-Host ""
    Write-Host "  listen          " -NoNewline -ForegroundColor Yellow; Write-Host "run social listening now (X, LinkedIn, TikTok, Threads)"
    Write-Host "  listen-status   " -NoNewline -ForegroundColor Yellow; Write-Host "show latest results + mention counts"
    Write-Host "  listen-reset    " -NoNewline -ForegroundColor Yellow; Write-Host "clear Social Mentions tab"
    Write-Host "  monitor         " -NoNewline -ForegroundColor Yellow; Write-Host "run weekly competitor monitor (slides + Slack)"
    Write-Host "  capture         " -NoNewline -ForegroundColor Yellow; Write-Host "run daily competitor capture"
    Write-Host "  sheets-format   " -NoNewline -ForegroundColor Yellow; Write-Host "apply formatting to all sheet tabs"
    Write-Host "  sheets-sync     " -NoNewline -ForegroundColor Yellow; Write-Host "sync content library to Sheets"
    Write-Host "  health          " -NoNewline -ForegroundColor Yellow; Write-Host "check if server is up"
    Write-Host "  exit            " -NoNewline -ForegroundColor Yellow; Write-Host "quit"
    Write-Host ""
}

Clear-Host
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Qoyod Creative OS  —  Agent Terminal   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Show-Help

while ($true) {
    $cmd = Read-Host "agent"
    $cmd = $cmd.Trim().ToLower()

    switch ($cmd) {
        "listen"        { Invoke-Post "/api/agent/listening/run-now" }
        "listen-status" { Invoke-Get  "/api/agent/listening/latest" }
        "listen-reset"  { Invoke-Post "/api/agent/sheets/reset-mentions" }
        "monitor"       { Invoke-Post "/api/competitor-ads/run-monitor-now" }
        "capture"       { Invoke-Post "/api/agent/daily-capture/run-now" }
        "sheets-format" { Invoke-Post "/api/agent/sheets/format" }
        "sheets-sync"   { Invoke-Post "/api/agent/content-library/sync" }
        "health"        { Invoke-Get  "/api/ai-health" }
        "help"          { Show-Help }
        { $_ -in "exit","quit","q" } { exit }
        ""              { }
        default         { Write-Host "Unknown command. Type 'help' to see all commands." -ForegroundColor DarkGray }
    }
}
