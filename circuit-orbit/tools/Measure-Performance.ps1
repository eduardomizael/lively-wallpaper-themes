param([int]$Seconds = 20, [int[]]$Speeds = @(160, 800))
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$library = 'C:\Users\eduar\AppData\Local\Packages\12030rocksdanister.LivelyWallpaper_97hta09mmv6hy\LocalCache\Local\Lively Wallpaper\Library'
$propertiesFile = Join-Path $library 'SaveData\wpdata\circuit-orbit-v2\1\LivelyProperties.json'
$original = Get-Content -LiteralPath $propertiesFile -Raw -Encoding UTF8 | ConvertFrom-Json
$all = @(Get-CimInstance Win32_Process)
$players = @($all | Where-Object { $_.Name -eq 'Lively.Player.WebView2.exe' -and $_.CommandLine -like '*\wallpapers\circuit-orbit-v2\index.html*' })
if ($players.Count -ne 1) { throw 'A medicao exige uma instancia ativa do Circuit Orbit no Lively.' }
$player = $players[0]
$hostProcess = $all | Where-Object { $_.ProcessId -eq $player.ParentProcessId }
$ids = @([int]$player.ProcessId)
do {
    $children = @($all | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids })
    $ids += @($children | ForEach-Object { [int]$_.ProcessId })
} while ($children.Count)
$rendererIds = @($all | Where-Object { $_.ProcessId -in $ids -and $_.CommandLine -match '--type=renderer' } | ForEach-Object { [int]$_.ProcessId })
$gpuIds = @($all | Where-Object { $_.ProcessId -in $ids -and $_.CommandLine -match '--type=gpu-process' } | ForEach-Object { [int]$_.ProcessId })
$logical = [int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
function Set-Speed([int]$value) {
    $commandProcess = Start-Process -FilePath $hostProcess.ExecutablePath -ArgumentList @('setprop','--monitor','1','--property',('speed=' + $value)) -WindowStyle Hidden -PassThru
    if (-not $commandProcess.WaitForExit(10000)) { throw 'O comando do Lively nao encerrou.' }
    Start-Sleep -Milliseconds 1200
    $saved = Get-Content -LiteralPath $propertiesFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$saved.speed.value -ne $value) { throw 'Velocidade nao confirmada nas propriedades do Lively.' }
}
function Read-Cpu {
    $values = @{}
    foreach ($p in (Get-Process -Id $ids)) { $values[[int]$p.Id] = $p.TotalProcessorTime.TotalSeconds }
    return $values
}
function Mean($items) { return [Math]::Round(($items | Measure-Object -Average).Average, 2) }
function Peak($items) { return [Math]::Round(($items | Measure-Object -Maximum).Maximum, 2) }
$runs = @()
try {
    foreach ($speed in $Speeds) {
        Set-Speed $speed
        Write-Output ('Medindo velocidade ' + $speed + '...')
        $samples = @()
        $clock = [Diagnostics.Stopwatch]::StartNew()
        $initial = Read-Cpu
        $previous = $initial
        $previousTime = $clock.Elapsed.TotalSeconds
        do {
            Start-Sleep -Milliseconds 700
            $memory = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -in $ids })
            $gpu = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object {
                $match = [regex]::Match($_.Name, '^pid_(\d+)_.*engtype_3D$')
                $match.Success -and [int]$match.Groups[1].Value -in $gpuIds
            })
            $now = $clock.Elapsed.TotalSeconds
            $cpu = Read-Cpu
            $delta = 0.0
            foreach ($processId in $ids) { $delta += $cpu[$processId] - $previous[$processId] }
            $samples += [PSCustomObject]@{
                seconds = [Math]::Round($now, 3)
                cpuPercentTotal = $delta / ($now - $previousTime) / $logical * 100
                privateResidentMiB = ($memory | Measure-Object WorkingSetPrivate -Sum).Sum / 1MB
                privateCommitMiB = ($memory | Measure-Object PrivateBytes -Sum).Sum / 1MB
                busiestGpu3DEnginePercent = ($gpu | Measure-Object UtilizationPercentage -Maximum).Maximum
            }
            $previous = $cpu; $previousTime = $now
        } while ($clock.Elapsed.TotalSeconds -lt $Seconds)
        $elapsed = $clock.Elapsed.TotalSeconds
        $final = Read-Cpu
        $delta = 0.0; $rendererDelta = 0.0; $gpuDelta = 0.0
        foreach ($processId in $ids) {
            $used = $final[$processId] - $initial[$processId]
            $delta += $used
            if ($processId -in $rendererIds) { $rendererDelta += $used }
            if ($processId -in $gpuIds) { $gpuDelta += $used }
        }
        $run = [PSCustomObject]@{
            speed = $speed; durationSeconds = [Math]::Round($elapsed, 2); samples = $samples.Count
            cpuMeanPercentTotal = [Math]::Round($delta / $elapsed / $logical * 100, 2)
            cpuPeakPercentTotal = Peak $samples.cpuPercentTotal
            rendererCpuPercentTotal = [Math]::Round($rendererDelta / $elapsed / $logical * 100, 2)
            gpuProcessCpuPercentTotal = [Math]::Round($gpuDelta / $elapsed / $logical * 100, 2)
            privateResidentMeanMiB = Mean $samples.privateResidentMiB
            privateResidentPeakMiB = Peak $samples.privateResidentMiB
            privateCommitMeanMiB = Mean $samples.privateCommitMiB
            busiestGpu3DEngineMeanPercent = Mean $samples.busiestGpu3DEnginePercent
            busiestGpu3DEnginePeakPercent = Peak $samples.busiestGpu3DEnginePercent
            rawSamples = $samples
        }
        $runs += $run
        $run | Select-Object * -ExcludeProperty rawSamples | ConvertTo-Json -Compress | Write-Output
    }
} finally { Set-Speed ([int]$original.speed.value) }
$report = [PSCustomObject]@{
    measuredAt = [DateTime]::UtcNow.ToString('o'); logicalProcessors = $logical
    originalSpeed = $original.speed.value; restoredSpeed = $original.speed.value
    themeProcesses = @($all | Where-Object { $_.ProcessId -in $ids } | Select-Object Name,ProcessId,ParentProcessId)
    properties = @{ circleSize = $original.circleSize.value; glow = $original.glow.value; trail = $original.trail.value; grid = $original.grid.value }
    runs = $runs
}
$encoding = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $root 'outputs\performance-lively-v2.json'), ($report | ConvertTo-Json -Depth 8), $encoding)
Write-Output ('Velocidade original restaurada: ' + $original.speed.value)
