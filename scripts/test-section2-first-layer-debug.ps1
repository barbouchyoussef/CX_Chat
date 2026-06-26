[CmdletBinding()]
param(
  [int]$AssessmentId = 220,
  [string]$CompetitorName = "Vodafone",
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = "Stop"

$uri = "$ApiBaseUrl/assessments/$AssessmentId/competitive-first-layer-debug"
if ($CompetitorName) {
  $encodedName = [System.Uri]::EscapeDataString($CompetitorName)
  $uri = "${uri}?competitor_name=$encodedName"
}

try {
  $payload = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSec
}
catch {
  Write-Error "Failed to fetch first-layer debug for assessment $AssessmentId. $($_.Exception.Message)"
  exit 1
}

Write-Host ("Assessment #{0} - {1} ({2})" -f $AssessmentId, $payload.company_name, $payload.sector) -ForegroundColor Cyan
Write-Host ""

foreach ($competitor in $payload.competitors) {
  Write-Host ("Competitor: {0}" -f $competitor.company_name) -ForegroundColor Yellow
  Write-Host ("Domain: {0}" -f $competitor.domain) -ForegroundColor DarkGray
  Write-Host "Queries:" -ForegroundColor White
  foreach ($query in $competitor.queries) {
    Write-Host ("  - {0}" -f $query) -ForegroundColor Gray
  }

  $acceptedCount = if ($null -ne $competitor.accepted) { $competitor.accepted.Count } else { 0 }
  $rejectedCount = if ($null -ne $competitor.rejected) { $competitor.rejected.Count } else { 0 }
  Write-Host ("Accepted [{0}]" -f $acceptedCount) -ForegroundColor Green
  foreach ($item in $competitor.accepted) {
    Write-Host ("  * {0}" -f ([string]$item.title)) -ForegroundColor Green
    Write-Host ("    Query: {0}" -f ([string]$item.query)) -ForegroundColor DarkGray
    Write-Host ("    URL: {0}" -f ([string]$item.url)) -ForegroundColor DarkGray
    if ($item.summary) {
      Write-Host ("    Summary: {0}" -f ([string]$item.summary)) -ForegroundColor Gray
    }
  }

  Write-Host ("Rejected [{0}]" -f $rejectedCount) -ForegroundColor Red
  foreach ($item in $competitor.rejected) {
    Write-Host ("  * {0}" -f ([string]$item.title)) -ForegroundColor Red
    Write-Host ("    Reason: {0}" -f ([string]$item.reason)) -ForegroundColor DarkGray
    if ($item.url) {
      Write-Host ("    URL: {0}" -f ([string]$item.url)) -ForegroundColor DarkGray
    }
    Write-Host ("    Query: {0}" -f ([string]$item.query)) -ForegroundColor DarkGray
  }
  Write-Host ""
}
