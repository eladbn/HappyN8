<#
.SYNOPSIS
  Builds (first time) or updates HappyN8 in Docker.

.DESCRIPTION
  Rebuilds the image from the current code and restarts the container.
  Users, the activity log and the n8n address saved in the app live in the
  Docker volume, so they are kept.

.EXAMPLE
  .\scripts\deploy.ps1            # build / update and start
  .\scripts\deploy.ps1 -Clean     # same, then remove old unused images
  .\scripts\deploy.ps1 -Logs      # same, then follow the logs (Ctrl+C to stop)
#>
param(
  [switch]$Clean,
  [switch]$Logs
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`nERROR: $text" -ForegroundColor Red; exit 1 }

# 1. Docker available and running?
Step 'Checking Docker'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker is not installed or not on PATH. Install Docker Desktop first.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running. Start Docker Desktop and try again.' }

# 2. .env present?
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Created .env from .env.example.' -ForegroundColor Yellow
  Fail 'Fill in .env (at least N8N_API_KEY and APP_PASSWORD), then run this script again.'
}

# Read a value from .env (KEY=value lines, # comments ignored).
function EnvValue($name, $default) {
  $line = Get-Content '.env' | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -Last 1
  if (-not $line) { return $default }
  $value = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if ($value) { return $value } else { return $default }
}
if (-not (EnvValue 'N8N_API_KEY' $null)) { Fail 'N8N_API_KEY is empty in .env (n8n > Settings > n8n API > Create an API key).' }

# 3. Build and (re)start.
Step 'Building the image and restarting HappyN8'
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'docker compose failed. See the output above.' }

# 4. Wait until the health check passes.
Step 'Waiting for HappyN8 to become healthy'
$status = ''
for ($i = 0; $i -lt 30; $i++) {
  $status = (docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' happyn8 2>$null)
  if ($status -eq 'healthy') { break }
  if ($status -eq 'exited' -or $status -eq 'dead') { break }
  Start-Sleep -Seconds 2
}
if ($status -ne 'healthy') {
  Write-Host "Container status: $status. Last log lines:" -ForegroundColor Yellow
  docker compose logs --tail 30
  Fail 'HappyN8 did not become healthy.'
}

# 5. Optional cleanup of old images left behind by rebuilds.
if ($Clean) {
  Step 'Removing old unused images'
  docker image prune -f | Out-Host
}

$port = EnvValue 'FLOWBOARD_PORT' '45310'
Write-Host "`nHappyN8 is up: http://localhost:$port" -ForegroundColor Green
if (-not (EnvValue 'N8N_URL' $null)) {
  Write-Host 'N8N_URL is not set: sign in as admin and set the n8n IP and port under Manage > n8n connection.' -ForegroundColor Yellow
}

if ($Logs) {
  Step 'Following logs (Ctrl+C to stop; HappyN8 keeps running)'
  docker compose logs -f
}
