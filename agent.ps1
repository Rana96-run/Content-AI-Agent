$BASE = "https://somaa-ai-agent-production.up.railway.app"

function listen {
    Write-Host "Running social listener..." -ForegroundColor Cyan
    (Invoke-WebRequest -Uri "$BASE/api/agent/listening/run-now" -Method POST -UseBasicParsing -TimeoutSec 120).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function listen-status {
    (Invoke-WebRequest -Uri "$BASE/api/agent/listening/latest" -Method GET -UseBasicParsing -TimeoutSec 30).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function listen-reset {
    (Invoke-WebRequest -Uri "$BASE/api/agent/sheets/reset-mentions" -Method POST -UseBasicParsing -TimeoutSec 30).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function monitor {
    Write-Host "Running competitor monitor..." -ForegroundColor Cyan
    (Invoke-WebRequest -Uri "$BASE/api/competitor-ads/run-monitor-now" -Method POST -UseBasicParsing -TimeoutSec 120).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function capture {
    (Invoke-WebRequest -Uri "$BASE/api/agent/daily-capture/run-now" -Method POST -UseBasicParsing -TimeoutSec 120).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function sheets-format {
    (Invoke-WebRequest -Uri "$BASE/api/agent/sheets/format" -Method POST -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function sheets-sync {
    (Invoke-WebRequest -Uri "$BASE/api/agent/content-library/sync" -Method POST -UseBasicParsing -TimeoutSec 60).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

function health {
    (Invoke-WebRequest -Uri "$BASE/api/ai-health" -Method GET -UseBasicParsing -TimeoutSec 30).Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
}

Clear-Host
Write-Host "Qoyod Creative OS - Agent Terminal" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Cyan
Write-Host "listen          listen-status    listen-reset" -ForegroundColor Yellow
Write-Host "monitor         capture          health" -ForegroundColor Yellow
Write-Host "sheets-format   sheets-sync" -ForegroundColor Yellow
Write-Host ""
