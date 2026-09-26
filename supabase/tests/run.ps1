# Runs the rollback-only regression scripts against the linked Supabase project.
# Each script is a single DO block that always ends with `raise exception 'RESULT: ...'`,
# so the transaction is rolled back and nothing is persisted. Scripts must not use `--` comments
# because newlines are collapsed before sending, nor double quotes (Windows PowerShell strips them
# from native arguments: build JSON with jsonb_build_object instead).
param([string]$Filter = "*.sql")

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Push-Location $root
$failed = 0
try {
  foreach ($file in Get-ChildItem (Join-Path $PSScriptRoot $Filter) | Sort-Object Name) {
    $sql = (Get-Content $file.FullName -Raw) -replace "\r?\n", " "
    $out = (npx supabase db query --linked "$sql" 2>&1 | Out-String)
    $m = [regex]::Match($out, "RESULT: (PASS|FAIL|SKIP)[^\\""]*")
    if (-not $m.Success) {
      Write-Host "ERROR $($file.Name)" -ForegroundColor Red
      Write-Host $out
      $failed++
    } elseif ($m.Groups[1].Value -eq "FAIL") {
      Write-Host "$($file.Name): $($m.Value)" -ForegroundColor Red
      $failed++
    } else {
      Write-Host "$($file.Name): $($m.Value)" -ForegroundColor Green
    }
  }
} finally {
  Pop-Location
}
if ($failed) { Write-Host "$failed script(s) failed" -ForegroundColor Red; exit 1 }
Write-Host "All regression scripts passed" -ForegroundColor Green
