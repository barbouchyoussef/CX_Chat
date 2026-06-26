[CmdletBinding()]
param(
  [int]$AssessmentId = 220,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"

$uri = "$ApiBaseUrl/assessments/$AssessmentId/telecom-semantic-leaders-debug"

try {
  $payload = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSec
}
catch {
  Write-Error "Failed to fetch telecom semantic leaders debug for assessment $AssessmentId. $($_.Exception.Message)"
  exit 1
}

Write-Host ("Assessment #{0} - {1} ({2})" -f $AssessmentId, $payload.respondent_company_name, $payload.sector) -ForegroundColor Cyan
Write-Host ""

Write-Host "Pain points" -ForegroundColor Yellow
foreach ($item in $payload.pain_points) {
  Write-Host ("  - {0}" -f ([string]$item.capability)) -ForegroundColor White
  if ($item.rationale) {
    Write-Host ("    {0}" -f ([string]$item.rationale)) -ForegroundColor Gray
  }
}
Write-Host ""

foreach ($leader in $payload.leaders) {
  Write-Host ("Leader: {0}" -f ([string]$leader.company_name)) -ForegroundColor Green
  Write-Host ("Logo: {0}" -f ([string]$leader.logo_url)) -ForegroundColor DarkGray
  Write-Host ("Search query: {0}" -f ([string]$leader.search_query)) -ForegroundColor Gray
  Write-Host ""
  foreach ($link in $leader.evidence_links) {
    Write-Host ("  * {0}" -f ([string]$link.label)) -ForegroundColor White
    Write-Host ("    {0}" -f ([string]$link.url)) -ForegroundColor DarkGray
  }
  Write-Host ""
}
