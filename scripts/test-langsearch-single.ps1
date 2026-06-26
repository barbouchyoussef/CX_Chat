[CmdletBinding()]
param(
  [string]$Query = "Find public case studies showing how Deutsche Telekom improves customer experience in telecom.",
  [string]$EnvFile = ".\backend\.env",
  [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

$envLines = Get-Content -Path $EnvFile
$apiKeyLine = $envLines | Where-Object { $_ -match '^LANGSEARCH_API_KEY=' } | Select-Object -First 1
$baseUrlLine = $envLines | Where-Object { $_ -match '^LANGSEARCH_BASE_URL=' } | Select-Object -First 1

if (-not $apiKeyLine) {
  Write-Error "LANGSEARCH_API_KEY not found in $EnvFile"
  exit 1
}

$apiKey = ($apiKeyLine -replace '^LANGSEARCH_API_KEY=', '').Trim().Trim('"')
$baseUrl = "https://api.langsearch.com/v1"
if ($baseUrlLine) {
  $baseUrl = ($baseUrlLine -replace '^LANGSEARCH_BASE_URL=', '').Trim().Trim('"')
}

$uri = "$baseUrl/web-search"
$headers = @{
  Authorization = "Bearer $apiKey"
  "Content-Type" = "application/json"
}
$body = @{
  query = $Query
  freshness = "oneYear"
  summary = $true
  count = 5
} | ConvertTo-Json -Depth 5

try {
  $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body -TimeoutSec $TimeoutSec
}
catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  if ($statusCode) {
    Write-Host ("HTTP Status: {0}" -f $statusCode) -ForegroundColor Red
  }
  Write-Error $_.Exception.Message
  exit 1
}

$items = @((((($response.data).webPages).value)))

Write-Host ("Query: {0}" -f $Query) -ForegroundColor Cyan
Write-Host ("Result count: {0}" -f $items.Count) -ForegroundColor Yellow
Write-Host ""

foreach ($item in $items) {
  Write-Host ("- {0}" -f ([string]$item.name)) -ForegroundColor White
  Write-Host ("  {0}" -f ([string]$item.url)) -ForegroundColor DarkGray
  if ($item.summary) {
    Write-Host ("  {0}" -f ([string]$item.summary)) -ForegroundColor Gray
  }
  Write-Host ""
}
