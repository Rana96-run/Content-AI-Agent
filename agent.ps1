$BASE = "https://somaa-ai-agent-production.up.railway.app"

function Invoke-Post($path) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE$path" -Method POST -UseBasicParsing -TimeoutSec 120
        $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

function Invoke-Get($path) {
    try {
        $r = Invoke-WebRequest -Uri "$BASE$path" -Method GET -UseBasicParsing -TimeoutSec 30
        $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
    }
}

function Show-Help {
    Write-Host ""
    Write-Host "  listen          - run social listening now (X, LinkedIn, TikTok, Threads)" -ForegroundColor Yellow
    Write-Host "  listen-status   - show latest results and mention counts" -ForegroundColor Yellow
    Write-Host "  listen-reset    - clear Social Mentions tab" -ForegroundColor Yellow
    Write-Host "  monitor         - run weekly competitor monitor (slides + Slack)" -ForegroundColor Yellow
    Write-Host "  capture         - run daily competitor capture" -ForegroundColor Yellow
    Write-Host "  sheets-format   - apply formatting to all sheet tabs" -ForegroundColor Yellow
    Write-Host "  sheets-sync     - sync content library to Sheets" -ForegroundColor Yellow
    Write-Host "  health          - check if server is up" -ForegroundColor Yellow
    Write-Host "  exit            - quit" -ForegroundColor Yellow
    Write-Host ""
}

Clear-Host
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Qoyod Creative OS - Agent Terminal" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Show-Help

while ($true) {
    $cmd = (Read-Host "agent").Trim().ToLower()

    if ($cmd -eq "listen")        { Invoke-Post "/api/agent/listening/run-now" }
    elseif ($cmd -eq "listen-status") { Invoke-Get  "/api/agent/listening/latest" }
    elseif ($cmd -eq "listen-reset")  { Invoke-Post "/api/agent/sheets/reset-mentions" }
    elseif ($cmd -eq "monitor")   { Invoke-Post "/api/competitor-ads/run-monitor-now" }
    elseif ($cmd -eq "capture")   { Invoke-Post "/api/agent/daily-capture/run-now" }
    elseif ($cmd -eq "sheets-format") { Invoke-Post "/api/agent/sheets/format" }
    elseif ($cmd -eq "sheets-sync")   { Invoke-Post "/api/agent/content-library/sync" }
    elseif ($cmd -eq "health")    { Invoke-Get  "/api/ai-health" }
    elseif ($cmd -eq "help")      { Show-Help }
    elseif ($cmd -eq "exit" -or $cmd -eq "quit" -or $cmd -eq "q") { exit }
    elseif ($cmd -eq "")          { }
    else { Write-Host "Unknown command '$cmd'. Type 'help' to see all commands." -ForegroundColor DarkGray }
}
