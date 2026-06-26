param(
    [int]$AssessmentId = 145,
    [string]$BaseUrl = "http://127.0.0.1:8000/api/v1",
    [int]$PollSeconds = 3,
    [int]$TimeoutSeconds = 120
)

$reportUrl = "$BaseUrl/assessments/$AssessmentId/final-report"

Write-Host "Requesting final report for assessment #$AssessmentId" -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$response = Invoke-RestMethod $reportUrl
$sw.Stop()

Write-Host ("First response time: {0} ms" -f $sw.ElapsedMilliseconds) -ForegroundColor Green
Write-Host ("Initial leaders_snapshot.status: {0}" -f $response.leaders_snapshot.status) -ForegroundColor Yellow

$pollStart = Get-Date
while ($response.leaders_snapshot.status -ne "completed") {
    if (((Get-Date) - $pollStart).TotalSeconds -ge $TimeoutSeconds) {
        throw "Timed out waiting for leaders_snapshot to complete."
    }

    Start-Sleep -Seconds $PollSeconds
    $response = Invoke-RestMethod $reportUrl
    Write-Host ("Current status: {0}" -f $response.leaders_snapshot.status) -ForegroundColor Yellow
}

$totalMs = [int]((Get-Date) - $pollStart).TotalMilliseconds
Write-Host ("Completion poll time: {0} ms" -f $totalMs) -ForegroundColor Green
Write-Host ""

if ($response.leaders_snapshot.metrics) {
    Write-Host "Benchmark metrics:" -ForegroundColor Cyan
    Write-Host ("  Candidates considered: {0}" -f $response.leaders_snapshot.metrics.candidates_considered)
    Write-Host ("  Candidates evaluated:  {0}" -f $response.leaders_snapshot.metrics.candidates_evaluated)
    Write-Host ("  Web-search calls:      {0}" -f $response.leaders_snapshot.metrics.web_search_calls)
    Write-Host ("  Rerank calls:          {0}" -f $response.leaders_snapshot.metrics.rerank_calls)
    Write-Host ("  Mistral calls:         {0}" -f $response.leaders_snapshot.metrics.mistral_calls)
    Write-Host ("  Documents retrieved:   {0}" -f $response.leaders_snapshot.metrics.documents_retrieved)
    Write-Host ("  Documents validated:   {0}" -f $response.leaders_snapshot.metrics.documents_validated)
    Write-Host ("  Rejected indirect:     {0}" -f $response.leaders_snapshot.metrics.documents_rejected_indirect)
    Write-Host ("  Capability coverage:   {0}" -f $response.leaders_snapshot.metrics.capability_coverage_count)
    Write-Host ""
}

foreach ($leader in $response.leaders_snapshot.leaders) {
    Write-Host ("=== {0} ===" -f $leader.company_name) -ForegroundColor Cyan
    Write-Host ("Summary: {0}" -f $leader.leader_summary)
    $index = 1
    foreach ($evidence in $leader.evidence_links) {
        Write-Host ("  [{0}] Label: {1}" -f $index, $evidence.label)
        Write-Host ("      Mapped capability: {0}" -f $evidence.mapped_capability)
        Write-Host ("      Why relevant: {0}" -f $evidence.why_relevant)
        Write-Host ("      Source: {0}" -f $evidence.source_title)
        Write-Host ("      URL: {0}" -f $evidence.url)
        $index += 1
    }
    Write-Host ""
}

Write-Host "Raw leaders_snapshot JSON:" -ForegroundColor Cyan
$response.leaders_snapshot | ConvertTo-Json -Depth 8
