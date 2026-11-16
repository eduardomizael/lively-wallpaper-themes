param([Parameter(Mandatory = $true)][string]$LibraryPath)
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
$library = (Resolve-Path -LiteralPath $LibraryPath).Path
$wallpapers = Join-Path $library 'wallpapers'
if (-not (Test-Path -LiteralPath $wallpapers -PathType Container)) { throw 'Pasta de wallpapers nao encontrada.' }
$target = Join-Path $wallpapers 'circuit-orbit-v2'
$previousDefaults = $null
if (Test-Path -LiteralPath (Join-Path $target 'LivelyProperties.json')) { $previousDefaults = Get-Content -LiteralPath (Join-Path $target 'LivelyProperties.json') -Raw -Encoding UTF8 | ConvertFrom-Json }
$files = @('index.html','app.js','engine.js','hud.js','atmosphere.js','mouse-fluid.js','licenses\Fluids-MIT.txt','style.css','LivelyInfo.json','LivelyProperties.json','thumbnail.jpg','preview.gif','Configurar-utilitario.cmd','Coletar-icones.cmd','tools\DesktopMap.cs','tools\Collect-Desktop.ps1','tools\Register-Collector.ps1')
foreach ($file in $files) { if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw ('Arquivo ausente: ' + $file) } }
$all = @(Get-CimInstance Win32_Process)
$players = @($all | Where-Object { $_.Name -eq 'Lively.Player.WebView2.exe' -and $_.CommandLine -like '*\wallpapers\circuit-orbit-v2\index.html*' })
$reload = @(); $closed = @()
if ($players.Count) {
    $executable = ($all | Where-Object { $_.ProcessId -eq $players[0].ParentProcessId }).ExecutablePath
    $layoutFile = Join-Path (Split-Path -Parent $library) 'WallpaperLayout.json'
    $reload = @(Get-Content -LiteralPath $layoutFile -Raw -Encoding UTF8 | ConvertFrom-Json | Where-Object { $_.LivelyInfoPath -like '*\circuit-orbit-v2' })
    if (-not $reload.Count) { throw 'Instancia ativa sem monitor identificado; instalacao cancelada.' }
}
function Invoke-Lively([string[]]$arguments) {
    $p = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $p.WaitForExit(10000)) { throw 'Comando do Lively nao encerrou.' }
}
try {
    # Close only this theme so stale in-memory controls cannot overwrite the new schema.
    foreach ($entry in $reload) {
        Invoke-Lively @('closewp','--monitor',([string]$entry.LivelyScreen.Index))
        $closed += $entry
    }
    if ($closed.Count) {
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            $remaining = @(Get-Process -Id @($players | ForEach-Object { [int]$_.ProcessId }) -ErrorAction SilentlyContinue)
            if (-not $remaining.Count) { break }
            Start-Sleep -Milliseconds 100
        }
        if ($remaining.Count) { throw 'O player nao encerrou antes da atualizacao.' }
    }
    foreach ($folder in @($target,(Join-Path $target 'tools'),(Join-Path $target 'settings'),(Join-Path $target 'licenses'))) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        foreach ($file in $files) {
            $from = Join-Path $source $file; $to = Join-Path $target $file
            Copy-Item -LiteralPath $from -Destination $to -Force
            if ([Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($from))) -ne [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($to)))) { throw ('Copia divergente: ' + $file) }
        }
    } finally { $sha.Dispose() }
    $mapSource = Join-Path $wallpapers 'circuit-orbit\settings'
    if (-not (Test-Path -LiteralPath (Join-Path $mapSource 'desktop-map.json'))) { $mapSource = Join-Path $source 'settings' }
    foreach ($file in @('desktop-map.json','desktop-map.js')) {
        $from = Join-Path $mapSource $file; $to = Join-Path (Join-Path $target 'settings') $file
        if ((Test-Path -LiteralPath $from) -and -not (Test-Path -LiteralPath $to)) { Copy-Item -LiteralPath $from -Destination $to }
    }
    $cacheRoot = Join-Path $library 'SaveData\wpdata\circuit-orbit-v2'
    if (Test-Path -LiteralPath $cacheRoot) {
        $encoding = New-Object System.Text.UTF8Encoding($false)
        foreach ($cache in (Get-ChildItem -LiteralPath $cacheRoot -Recurse -File -Filter LivelyProperties.json)) {
            $old = Get-Content -LiteralPath $cache.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
            $new = Get-Content -LiteralPath (Join-Path $source 'LivelyProperties.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($property in $new.PSObject.Properties) {
                $existing = $old.PSObject.Properties[$property.Name]
                $wasOldMouseDefault = $property.Name -eq 'mouseFogSize' -and $existing -and $previousDefaults -and $existing.Value.value -eq $previousDefaults.mouseFogSize.value
                if ($existing -and $property.Value.type -ne 'button' -and -not $wasOldMouseDefault) { $property.Value.value = $existing.Value.value }
            }
            [IO.File]::WriteAllText($cache.FullName,($new | ConvertTo-Json -Depth 8),$encoding)
        }
    }
    & (Join-Path $target 'tools\Register-Collector.ps1')
} finally {
    foreach ($entry in $closed) { Invoke-Lively @('setwp','--file',('"' + $entry.LivelyInfoPath + '"'),'--monitor',([string]$entry.LivelyScreen.Index)) }
}
Write-Output ('Instalada: ' + $target)
Write-Output ('Arquivos conferidos: ' + $files.Count + '; monitores da v2 recarregados: ' + $closed.Count)
Write-Output 'Versao 1 e preferencias preservadas. Nenhum servico iniciado.'
