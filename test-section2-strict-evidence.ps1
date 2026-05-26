[CmdletBinding()]
param(
  [int]$AssessmentId,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1"
)

$ErrorActionPreference = "Stop"

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

function Normalize-Name {
  param([string]$Value)
  if (-not $Value) { return "" }
  $normalized = $Value.ToLowerInvariant()
  $normalized = $normalized -replace "[^a-z0-9\.]+", " "
  return ($normalized -replace "\s+", " ").Trim()
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

try {
  if (-not $AssessmentId) {
    $AssessmentId = Resolve-AssessmentId -BaseUrl $ApiBaseUrl
    Write-Host "Using assessment id $AssessmentId" -ForegroundColor Yellow
  }

  $report = Invoke-RestMethod -Uri "$ApiBaseUrl/assessments/$AssessmentId/final-report" -Method Get
  Assert-Value ($null -ne $report.competitive_landscape) "Final report is missing competitive_landscape."

  foreach ($stage in $report.competitive_landscape) {
    foreach ($competitor in $stage.competitors) {
      Assert-Value ($competitor.evidence_links.Count -le 3) "Competitor $($competitor.company_name) has more than 3 evidence links."

      $normalizedCompany = Normalize-Name $competitor.company_name
      foreach ($link in $competitor.evidence_links) {
        Assert-Value (-not [string]::IsNullOrWhiteSpace($link.source_title)) "Evidence link for $($competitor.company_name) is missing source_title."
        $normalizedTitle = Normalize-Name $link.source_title
        Assert-Value ($normalizedTitle.Contains($normalizedCompany)) "Evidence source title does not explicitly mention $($competitor.company_name): $($link.source_title)"
        Assert-Value ($link.url -match '^https?://') "Evidence URL must be absolute for $($competitor.company_name)."
      }
    }
  }

  Write-Host "Strict evidence checks passed." -ForegroundColor Green
  foreach ($stage in $report.competitive_landscape) {
    Write-Host ("  Stage {0}: {1}" -f $stage.level, $stage.label)
    foreach ($competitor in $stage.competitors) {
      Write-Host ("    {0}: {1} strict evidence links" -f $competitor.company_name, $competitor.evidence_links.Count)
    }
  }
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
