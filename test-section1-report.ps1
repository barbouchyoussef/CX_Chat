[CmdletBinding()]
param(
  [int]$AssessmentId,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [string]$FrontendDir
)

$ErrorActionPreference = "Stop"
$ScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $FrontendDir) {
  $FrontendDir = Join-Path $ScriptRoot "frontend"
}

function Assert-Value {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$Condition,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Resolve-AssessmentId {
  param(
    [string]$BaseUrl
  )

  $listUrl = "$BaseUrl/assessments?limit=20"
  Write-Host "Fetching assessments from $listUrl" -ForegroundColor Cyan
  $response = Invoke-RestMethod -Uri $listUrl -Method Get
  Assert-Value ($null -ne $response.items -and $response.items.Count -gt 0) "No assessments were returned by the backend."

  $candidate = $response.items |
    Where-Object { $_.status -eq "completed" } |
    Sort-Object updated_at -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    $candidate = $response.items | Sort-Object updated_at -Descending | Select-Object -First 1
  }

  Assert-Value ($null -ne $candidate.id) "Unable to resolve an assessment id from the backend response."
  return [int]$candidate.id
}

function Test-FinalReportHero {
  param(
    [string]$BaseUrl,
    [int]$ResolvedAssessmentId
  )

  $reportUrl = "$BaseUrl/assessments/$ResolvedAssessmentId/final-report"
  Write-Host "Fetching final report from $reportUrl" -ForegroundColor Cyan
  $report = Invoke-RestMethod -Uri $reportUrl -Method Get

  Assert-Value ($null -ne $report.hero) "Final report is missing the hero payload."
  Assert-Value (-not [string]::IsNullOrWhiteSpace($report.hero.report_title)) "Hero.report_title is empty."
  Assert-Value (-not [string]::IsNullOrWhiteSpace($report.hero.overall_maturity_band)) "Hero.overall_maturity_band is empty."
  Assert-Value (-not [string]::IsNullOrWhiteSpace($report.hero.company_name)) "Hero.company_name is empty."
  Assert-Value (-not [string]::IsNullOrWhiteSpace($report.summary.overall_maturity_band)) "Summary.overall_maturity_band is empty."

  $strongest = if ([string]::IsNullOrWhiteSpace($report.hero.strongest_axis)) { "<missing>" } else { $report.hero.strongest_axis }
  $priority = if ([string]::IsNullOrWhiteSpace($report.hero.priority_axis)) { "<missing>" } else { $report.hero.priority_axis }

  Write-Host "Hero payload looks valid." -ForegroundColor Green
  Write-Host ("  Company : {0}" -f $report.hero.company_name)
  $levelLabel = if ([string]::IsNullOrWhiteSpace($report.hero.overall_level_label)) { "n/a" } else { $report.hero.overall_level_label }
  Write-Host ("  Stage   : {0} ({1})" -f $report.hero.overall_maturity_band, $levelLabel)
  Write-Host ("  Strongest axis : {0}" -f $strongest)
  Write-Host ("  Priority axis  : {0}" -f $priority)
}

function Test-FrontendBuild {
  param(
    [string]$WorkingDirectory
  )

  Assert-Value (Test-Path $WorkingDirectory) "Frontend directory not found: $WorkingDirectory"
  Write-Host "Running frontend build in $WorkingDirectory" -ForegroundColor Cyan
  Push-Location $WorkingDirectory
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend build failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "Frontend build completed successfully." -ForegroundColor Green
}

try {
  if (-not $AssessmentId) {
    $AssessmentId = Resolve-AssessmentId -BaseUrl $ApiBaseUrl
    Write-Host "Using assessment id $AssessmentId" -ForegroundColor Yellow
  }

  Test-FinalReportHero -BaseUrl $ApiBaseUrl -ResolvedAssessmentId $AssessmentId
  Test-FrontendBuild -WorkingDirectory $FrontendDir
  Write-Host "Section 1 hero integration checks passed." -ForegroundColor Green
}
catch {
  $message = $_.Exception.Message
  if ($message -match "Impossible de se connecter au serveur distant|Unable to connect to the remote server|Connection refused") {
    Write-Error "Backend API is not reachable at $ApiBaseUrl. Start the FastAPI server first, then rerun this script."
  }
  else {
    Write-Error $_
  }
  exit 1
}
