$ErrorActionPreference = 'Stop'
$base = 'http://38.76.195.153:8088'
$key = $env:GROK_KEY
$project = Get-Content (Join-Path $PSScriptRoot '..\xianxian-project.json') -Raw | ConvertFrom-Json
$root = Join-Path $PSScriptRoot '..\xianxian-output'
New-Item -ItemType Directory -Force -Path $root | Out-Null
$headers = @{ Authorization = "Bearer $key" }
$jobs = @{}
for ($i = 0; $i -lt $project.scenes.Count; $i++) {
  $scene = $project.scenes[$i]
  $body = @{ model = 'grok-imagine-video'; prompt = $scene.prompt; duration = [int]$scene.duration; aspect_ratio = '16:9' } | ConvertTo-Json -Depth 8
  try {
    $created = Invoke-RestMethod -Uri "$base/v1/videos/generations" -Method Post -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 90
    $id = $created.request_id; if (-not $id) { throw 'missing request_id' }
    $jobs[$id] = @{ index = $i; scene = $scene; status = 'queued' }
    Write-Output "SUBMITTED $($i + 1)/$($project.scenes.Count) $id"
  } catch { Write-Output "SUBMIT_FAILED $($i + 1) $($_.Exception.Message)" }
}
while (($jobs.Values | Where-Object { $_.status -notin @('done','failed') }).Count -gt 0) {
  foreach ($id in @($jobs.Keys)) {
    $job = $jobs[$id]; if ($job.status -in @('done','failed')) { continue }
    try {
      $result = Invoke-RestMethod -Uri "$base/v1/videos/$id" -Headers $headers -TimeoutSec 60
      if ($result.status -eq 'done') {
        $url = $result.video.url; $file = Join-Path $root (('{0:D2}.mp4' -f ($job.index + 1)))
        Invoke-WebRequest -Uri $url -Headers $headers -OutFile $file -TimeoutSec 180
        $job.status = 'done'; $job.file = $file; Write-Output "DONE $($job.index + 1) $file"
      } elseif ($result.status -in @('failed','cancelled')) { $job.status = 'failed'; Write-Output "FAILED $($job.index + 1) $($result|ConvertTo-Json -Compress)" }
    } catch { Write-Output "POLL_ERROR $($job.index + 1) $($_.Exception.Message)" }
  }
  if (($jobs.Values | Where-Object { $_.status -notin @('done','failed') }).Count -gt 0) { Start-Sleep -Seconds 8 }
}
Write-Output "COMPLETE done=$(@($jobs.Values | Where-Object status -eq 'done').Count) failed=$(@($jobs.Values | Where-Object status -eq 'failed').Count)"
