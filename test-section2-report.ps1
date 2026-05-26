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
  param([string]$BaseUrl)

  $response = Invoke-RestMethod -Uri "$BaseUrl/assessments?limit=20" -Method Get
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

function Test-CompetitiveLandscape {
  param(
    [string]$BaseUrl,
    [int]$ResolvedAssessmentId
  )

  $report = Invoke-RestMethod -Uri "$BaseUrl/assessments/$ResolvedAssessmentId/final-report" -Method Get

  Assert-Value ($null -ne $report.competitive_landscape) "Final report is missing competitive_landscape."
  Assert-Value ($report.competitive_landscape.Count -eq 3) "Expected 3 competitive landscape stages."

  foreach ($stage in $report.competitive_landscape) {
    Assert-Value ($stage.level -ge 1 -and $stage.level -le 3) "Invalid stage level in competitive_landscape."
    Assert-Value (-not [string]::IsNullOrWhiteSpace($stage.label)) "A stage label is missing."
    Assert-Value ($stage.competitors.Count -ge 2) "Each stage should include at least 2 competitors."

    foreach ($competitor in $stage.competitors) {
      Assert-Value (-not [string]::IsNullOrWhiteSpace($competitor.company_name)) "Competitor name is missing."
      Assert-Value ($competitor.evidence_links.Count -eq 3) "Each competitor should expose exactly 3 evidence links."
      foreach ($link in $competitor.evidence_links) {
        Assert-Value (-not [string]::IsNullOrWhiteSpace($link.label)) "Evidence link label is missing."
        Assert-Value ($link.url -match '^https?://') "Evidence link URL must be absolute."
      }
    }
  }

  Write-Host "Competitive landscape payload looks valid." -ForegroundColor Green
  foreach ($stage in $report.competitive_landscape) {
    Write-Host ("  Stage {0}: {1} ({2} competitors)" -f $stage.level, $stage.label, $stage.competitors.Count)
  }
}

function Test-FrontendBuild {
  param([string]$WorkingDirectory)

  Assert-Value (Test-Path $WorkingDirectory) "Frontend directory not found: $WorkingDirectory"
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
}

try {
  if (-not $AssessmentId) {
    $AssessmentId = Resolve-AssessmentId -BaseUrl $ApiBaseUrl
    Write-Host "Using assessment id $AssessmentId" -ForegroundColor Yellow
  }

  Test-CompetitiveLandscape -BaseUrl $ApiBaseUrl -ResolvedAssessmentId $AssessmentId
  Test-FrontendBuild -WorkingDirectory $FrontendDir
  Write-Host "Section 2 report checks passed." -ForegroundColor Green
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
