[CmdletBinding()]
param(
  [int]$AssessmentId = 220,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"

try {
  $report = Invoke-RestMethod -Uri "$ApiBaseUrl/assessments/$AssessmentId/final-report" -Method Get -TimeoutSec $TimeoutSec
}
catch {
  Write-Error "Failed to fetch final report for assessment $AssessmentId. $($_.Exception.Message)"
  exit 1
}

if ($null -eq $report.competitive_landscape) {
  Write-Error "competitive_landscape is missing from the final report payload."
  exit 1
}

Write-Host ("Assessment #{0} - {1} ({2})" -f $AssessmentId, $report.hero.company_name, $report.hero.sector_name) -ForegroundColor Cyan
Write-Host ""

foreach ($stage in $report.competitive_landscape) {
  $competitorCount = if ($null -ne $stage.competitors) { $stage.competitors.Count } else { 0 }
  Write-Host ("Stage {0} - {1} [{2} competitors]" -f $stage.level, $stage.label, $competitorCount) -ForegroundColor Yellow
  Write-Host ("  Summary: {0}" -f $stage.summary) -ForegroundColor DarkGray
  foreach ($competitor in $stage.competitors) {
    Write-Host ("  - {0}" -f $competitor.company_name) -ForegroundColor White
    Write-Host ("    Note: {0}" -f $competitor.note) -ForegroundColor Gray
    foreach ($link in $competitor.evidence_links) {
      $label = if ($null -ne $link.label) { [string]$link.label } else { "" }
      $url = if ($null -ne $link.url) { [string]$link.url } else { "" }
      Write-Host ("      * {0}" -f $label) -ForegroundColor Green
      Write-Host ("        {0}" -f $url) -ForegroundColor DarkGray
    }
  }
  Write-Host ""
}
