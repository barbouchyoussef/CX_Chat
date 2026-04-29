param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [string]$CompanyName = "ACME",
  [string]$Sector = "Retail",
  [string]$Size = "SMB",
  [int]$AssessmentId = 0,
  [switch]$Auto,
  [int]$MaxTurns = 30,
  [string]$AnswersFile = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Json($Method, $Url, $Body) {
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json"
  }
  $json = $Body | ConvertTo-Json -Depth 10
  return Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json" -Body $json
}

function Load-Answers($Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  if (-not (Test-Path -LiteralPath $Path)) { throw "AnswersFile not found: $Path" }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-AutoAnswer($Axis, $Turn, $Config) {
  # Default canned answers: tuned to include keywords similar to criteria labels seeded in 003_seed_axes_and_criteria.sql.
  $defaults = @{
    Manage   = @(
      "We collect feedback via post-purchase surveys, in-app prompts, and support follow-ups weekly. We have a feedback cadence and owners.",
      "Support ticketing process: Zendesk, clear ownership by team leads, SLAs, escalation, and tagging to track issues and recurring themes.",
      "Customer journeys are documented (onboarding, purchase, delivery, returns). We monitor drop-offs and collect feedback at key touchpoints."
    )
    Analyze  = @(
      "We measure KPIs like NPS and CSAT monthly, review them in a weekly ops meeting, and share dashboards with stakeholders.",
      "We segment customers by plan, region, and lifecycle stage to analyze behavior and feedback differences.",
      "We do root cause analysis combining qualitative feedback and quantitative data; top issues are prioritized and tracked with owners."
    )
    Maintain = @(
      "We run a continuous improvement loop: prioritize initiatives, track progress, measure impact, and close the loop with customers.",
      "Training: onboarding for support and success teams, playbooks, QA, and refresh sessions to keep consistent customer experience.",
      "Governance: clear roles, rituals (weekly review), accountability, and decision-making for CX outcomes across teams."
    )
  }

  if ($Config -ne $null -and $Config.$Axis) {
    $arr = @($Config.$Axis)
    if ($arr.Count -gt 0) { return $arr[$Turn % $arr.Count] }
  }

  $arr2 = $defaults[$Axis]
  if ($null -eq $arr2 -or $arr2.Count -eq 0) { return "Can you clarify?" }
  return $arr2[$Turn % $arr2.Count]
}

$answersConfig = Load-Answers $AnswersFile

if ($AssessmentId -gt 0) {
  $assessmentId = $AssessmentId
  Write-Host "Using assessment ID: $assessmentId"
  Write-Host ""
} else {
  Write-Host "Starting assessment..."
  $start = Invoke-Json "POST" "$BaseUrl/api/v1/assessments" @{
    company_name = $CompanyName
    sector = $Sector
    size = $Size
  }
  $assessmentId = $start.assessment_id
  Write-Host "Assessment ID: $assessmentId"
  Write-Host ""
}

$turn = 0
while ($true) {
  if ($MaxTurns -gt 0 -and $turn -ge $MaxTurns) {
    Write-Host "Reached MaxTurns=$MaxTurns, stopping."
    break
  }

  $next = Invoke-Json "GET" "$BaseUrl/api/v1/assessments/$assessmentId/next-question" $null

  if ($next.status -ne "in_progress") {
    Write-Host "Status: $($next.status)"
    if ($next.message) { Write-Host $next.message }
    break
  }

  Write-Host "Axis: $($next.axis)"
  Write-Host "Assistant: $($next.question)"
  Write-Host ""

  if ($Auto) {
    $answer = Get-AutoAnswer $next.axis $turn $answersConfig
    Write-Host "Client: $answer"
  } else {
    $answer = Read-Host "Client"
  }

  if ([string]::IsNullOrWhiteSpace($answer)) {
    Write-Host "Empty answer, stopping."
    break
  }

  $resp = Invoke-Json "POST" "$BaseUrl/api/v1/assessments/$assessmentId/answers" @{
    answer = $answer
  }

  Write-Host ""
  Write-Host "Server: status=$($resp.status) axis=$($resp.axis) covered=$($resp.covered -join ',') confidence=$($resp.confidence)"
  Write-Host ""

  $turn++
}
