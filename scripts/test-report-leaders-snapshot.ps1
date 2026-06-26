[CmdletBinding()]
param(
  [int]$AssessmentId = 145,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"

$uri = "$ApiBaseUrl/assessments/$AssessmentId/final-report"

try {
  $payload = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSec
}
catch {
  Write-Error "Failed to fetch final report for assessment $AssessmentId. $($_.Exception.Message)"
  exit 1
}

Write-Host ("Assessment #{0}" -f $AssessmentId) -ForegroundColor Cyan
Write-Host ("Sector: {0}" -f ([string]$payload.hero.sector_name)) -ForegroundColor Gray
Write-Host ("Company: {0}" -f ([string]$payload.hero.company_name)) -ForegroundColor Gray
Write-Host ""

$snapshot = $payload.leaders_snapshot
if (-not $snapshot) {
  Write-Host "leaders_snapshot is missing." -ForegroundColor Yellow
  exit 0
}

Write-Host ("Supported: {0}" -f ([string]$snapshot.supported)) -ForegroundColor Yellow
Write-Host ("Snapshot sector: {0}" -f ([string]$snapshot.sector)) -ForegroundColor Yellow
Write-Host ""

foreach ($leader in $snapshot.leaders) {
  Write-Host ("Leader: {0}" -f ([string]$leader.company_name)) -ForegroundColor Green
  if ($leader.leader_summary) {
    Write-Host ("Summary: {0}" -f ([string]$leader.leader_summary)) -ForegroundColor White
  } elseif ($leader.note) {
    Write-Host ("Summary: {0}" -f ([string]$leader.note)) -ForegroundColor White
  }
  foreach ($link in $leader.evidence_links) {
    Write-Host ("  * {0}" -f ([string]$link.label)) -ForegroundColor Gray
    Write-Host ("    {0}" -f ([string]$link.url)) -ForegroundColor DarkGray
  }
  Write-Host ""
}
