[CmdletBinding()]
param(
  [int]$AssessmentId = 220,
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/api/v1",
  [int]$TimeoutSec = 240
)

$ErrorActionPreference = "Stop"

$blockedHosts = @(
  "apps.apple.com",
  "play.google.com",
  "justuseapp.com",
  "gethuman.com",
  "productreview.com.au",
  "complaintsboard.com",
  "dearcustomercare.com",
  "consumeraffairs.com",
  "sitejabber.com",
  "trustpilot.com"
)

$blockedTitleTerms = @(
  "privacy policy",
  "ratings & reviews",
  "customer service phone number",
  "is safe or legit",
  "frequently asked questions",
  "faq",
  "complaints"
)

function Get-HostName {
  param([string]$Url)

  try {
    return ([Uri]$Url).Host.ToLowerInvariant()
  }
  catch {
    return ""
  }
}

function Test-EvidenceLink {
  param(
    [string]$CompanyName,
    [pscustomobject]$Link
  )

  $hostName = Get-HostName -Url $Link.url
  $sourceTitle = if ($null -ne $Link.source_title) { [string]$Link.source_title } else { "" }
  $label = if ($null -ne $Link.label) { [string]$Link.label } else { "" }
  $issues = New-Object System.Collections.Generic.List[string]

  if ([string]::IsNullOrWhiteSpace($Link.url) -or $Link.url -notmatch '^https?://') {
    $issues.Add("URL is missing or not absolute.")
  }

  if ($blockedHosts -contains $hostName) {
    $issues.Add("Weak source host: $hostName")
  }

  $titleSample = $sourceTitle.ToLowerInvariant()
  foreach ($term in $blockedTitleTerms) {
    if ($titleSample.Contains($term)) {
      $issues.Add("Weak title pattern: $term")
      break
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($CompanyName)) {
    $companySample = $CompanyName.ToLowerInvariant()
    $combined = ("{0} {1}" -f $sourceTitle, $Link.url).ToLowerInvariant()
    if (-not $combined.Contains($companySample)) {
      $issues.Add("Source does not visibly mention the competitor name.")
    }
  }

  if ($label.Length -lt 45) {
    $issues.Add("Evidence sentence is too short to explain the maturity signal.")
  }

  [pscustomobject]@{
    host = $hostName
    label = $label
    source_title = $sourceTitle
    url = [string]$Link.url
    issues = $issues
  }
}

try {
  $report = Invoke-RestMethod -Uri "$ApiBaseUrl/assessments/$AssessmentId/final-report" -Method Get -TimeoutSec $TimeoutSec
}
catch {
  Write-Error "Failed to fetch final report for assessment $AssessmentId from $ApiBaseUrl. $($_.Exception.Message)"
  exit 1
}

if ($null -eq $report.competitive_landscape) {
  Write-Error "competitive_landscape is missing from the final report."
  exit 1
}

$findings = New-Object System.Collections.Generic.List[object]

Write-Host ("Assessment {0} - {1} ({2})" -f $AssessmentId, $report.hero.company_name, $report.hero.sector_name) -ForegroundColor Cyan
Write-Host ""

foreach ($stage in $report.competitive_landscape) {
  Write-Host ("Stage {0} - {1}" -f $stage.level, $stage.label) -ForegroundColor Yellow
  foreach ($competitor in $stage.competitors) {
    Write-Host ("  {0}" -f $competitor.company_name) -ForegroundColor White
    foreach ($link in $competitor.evidence_links) {
      $result = Test-EvidenceLink -CompanyName $competitor.company_name -Link $link
      $findings.Add([pscustomobject]@{
        stage = $stage.label
        competitor = $competitor.company_name
        host = $result.host
        label = $result.label
        source_title = $result.source_title
        url = $result.url
        issues = ($result.issues -join "; ")
      })

      if ($result.issues.Count -eq 0) {
        Write-Host ("    PASS  {0}" -f $result.label) -ForegroundColor Green
      }
      else {
        Write-Host ("    FAIL  {0}" -f $result.label) -ForegroundColor Red
        foreach ($issue in $result.issues) {
          Write-Host ("          - {0}" -f $issue) -ForegroundColor DarkRed
        }
      }
      Write-Host ("          {0}" -f $result.url) -ForegroundColor DarkGray
    }
  }
  Write-Host ""
}

$failures = @($findings | Where-Object { -not [string]::IsNullOrWhiteSpace($_.issues) })

Write-Host ("Checked {0} evidence links." -f $findings.Count) -ForegroundColor Cyan
Write-Host ("Failures: {0}" -f $failures.Count) -ForegroundColor $(if ($failures.Count -gt 0) { "Red" } else { "Green" })

if ($failures.Count -gt 0) {
  exit 1
}
