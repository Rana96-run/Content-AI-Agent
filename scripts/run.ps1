#!/usr/bin/env pwsh
# Qoyod Creative OS — quick command runner
# Usage: .\scripts\run.ps1 <command>
# Example: .\scripts\run.ps1 listen

$BASE = "https://somaa-ai-agent-production.up.railway.app"

function Post($path) {
    $r = Invoke-WebRequest -Uri "$BASE$path" -Method POST -UseBasicParsing
    $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function Get-Api($path) {
    $r = Invoke-WebRequest -Uri "$BASE$path" -Method GET -UseBasicParsing
    $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

switch ($args[0]) {

    # ── Social Listening ──────────────────────────────────────────────────────
    "listen"          { Post "/api/agent/listening/run-now" }
    "listen-status"   { Get-Api "/api/agent/listening/latest" }
    "listen-reset"    { Post "/api/agent/sheets/reset-mentions" }

    # ── Competitor Intel ──────────────────────────────────────────────────────
    "monitor"         { Post "/api/competitor-ads/run-monitor-now" }
    "capture"         { Post "/api/agent/daily-capture/run-now" }

    # ── Google Sheets ─────────────────────────────────────────────────────────
    "sheets-format"   { Post "/api/agent/sheets/format" }
    "sheets-sync"     { Post "/api/agent/content-library/sync" }

    # ── Health ────────────────────────────────────────────────────────────────
    "health"          { Get-Api "/api/ai-health" }

    # ── Help ──────────────────────────────────────────────────────────────────
    default {
        Write-Host ""
        Write-Host "Qoyod Creative OS — available commands:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  LISTENING"
        Write-Host "    listen          — trigger social listening run now (X, LinkedIn, TikTok, Threads)"
        Write-Host "    listen-status   — show latest listening results + mention counts"
        Write-Host "    listen-reset    — clear Social Mentions tab and reformat"
        Write-Host ""
        Write-Host "  COMPETITOR"
        Write-Host "    monitor         — run weekly competitor monitor now (slides + Slack)"
        Write-Host "    capture         — run daily competitor Instagram capture now"
        Write-Host ""
        Write-Host "  SHEETS"
        Write-Host "    sheets-format   — apply navy formatting to all tabs"
        Write-Host "    sheets-sync     — backfill content library entries to Sheets"
        Write-Host ""
        Write-Host "  OTHER"
        Write-Host "    health          — check if Railway server is up"
        Write-Host ""
        Write-Host "Usage: .\scripts\run.ps1 <command>" -ForegroundColor Yellow
        Write-Host ""
    }
}
