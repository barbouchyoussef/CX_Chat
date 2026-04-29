param(
  [string]$EnvFile = ".env",
  [string]$Axis = "",
  [string]$Sector = "",
  [string]$Missing = "",
  [switch]$ShowPayload
)

$ErrorActionPreference = "Stop"

function Load-DotEnv([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.Length -eq 0) { continue }
    if ($t.StartsWith("#")) { continue }

    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }

    $key = $t.Substring(0, $idx).Trim()
    $value = $t.Substring($idx + 1).Trim()

    # Strip wrapping quotes if present.
    if ($value.Length -ge 2) {
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }

    if ($key.Length -gt 0) {
      Set-Item -Path "Env:$key" -Value $value
    }
  }
}

function Read-NonEmpty([string]$Prompt, [string]$Default = "") {
  while ($true) {
    $v = Read-Host $Prompt
    if (-not [string]::IsNullOrWhiteSpace($v)) { return $v.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($Default)) { return $Default.Trim() }
  }
}

function Read-HistoryTurns {
  Write-Host ""
  Write-Host "Enter conversation history lines (optional). Format: user: ... or assistant: ..."
  Write-Host "Press ENTER on an empty line to finish."
  $turns = @()
  while ($true) {
    $line = Read-Host "history"
    if ([string]::IsNullOrWhiteSpace($line)) { break }
    $m = [regex]::Match($line, "^(user|assistant)\s*:\s*(.+)$", "IgnoreCase")
    if (-not $m.Success) {
      Write-Host "Ignored (expected 'user:' or 'assistant:'): $line"
      continue
    }
    $turns += @{
      role = $m.Groups[1].Value.ToLower()
      content = $m.Groups[2].Value.Trim()
    }
  }
  return ,$turns
}

Load-DotEnv $EnvFile

if ([string]::IsNullOrWhiteSpace($env:MISTRAL_API_KEY)) {
  throw "MISTRAL_API_KEY is missing. Put it in $EnvFile or set it in the environment."
}

$baseUrl = $env:MISTRAL_BASE_URL
if ([string]::IsNullOrWhiteSpace($baseUrl)) { $baseUrl = "https://api.mistral.ai/v1" }
$model = $env:MISTRAL_MODEL
if ([string]::IsNullOrWhiteSpace($model)) { $model = "mistral-small-latest" }

if ([string]::IsNullOrWhiteSpace($Axis)) { $Axis = Read-NonEmpty "Axis (Manage/Analyze/Maintain)" }
if ([string]::IsNullOrWhiteSpace($Sector)) { $Sector = Read-NonEmpty "Sector" }
if ([string]::IsNullOrWhiteSpace($Missing)) { $Missing = Read-NonEmpty "Missing criteria (comma-separated)" }

$missingList = @()
foreach ($part in $Missing.Split(",")) {
  $p = $part.Trim()
  if ($p.Length -gt 0) { $missingList += $p }
}
if ($missingList.Count -eq 0) { $missingList = @("this axis") }

$history = Read-HistoryTurns

$system = @"
You are a CX consultant running a structured assessment.
Ask concise, specific questions to collect missing information.
Always ask exactly ONE question.
Return only the question text (no quotes, no extra commentary).
"@.Trim()

$missingBlock = ($missingList | Select-Object -First 12 | ForEach-Object { "- $_" }) -join "`n"
$user = @"
Sector: $Sector
Current axis: $Axis
Missing criteria:
$missingBlock

Write the best next question to cover missing criteria.
"@.Trim()

$messages = @()
$messages += @{ role = "system"; content = $system }
$messages += $history
$messages += @{ role = "user"; content = $user }

$payload = @{
  model = $model
  temperature = 0.2
  messages = $messages
}

if ($ShowPayload) {
  $payload | ConvertTo-Json -Depth 10 | Write-Host
}

$url = ($baseUrl.TrimEnd("/") + "/chat/completions")
$headers = @{
  Authorization = "Bearer $($env:MISTRAL_API_KEY)"
}

Write-Host ""
Write-Host "Calling Mistral ($model)..."

$resp = Invoke-RestMethod -Method POST -Uri $url -Headers $headers -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 10)
$text = $resp.choices[0].message.content

Write-Host ""
Write-Host "Question:"
Write-Host $text.Trim()

