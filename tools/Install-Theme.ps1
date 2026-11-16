param([Parameter(Mandatory = $true)][string]$LibraryPath)
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
$library = (Resolve-Path -LiteralPath $LibraryPath).Path
$wallpapers = Join-Path $library 'wallpapers'
if (-not (Test-Path -LiteralPath $wallpapers -PathType Container)) { throw 'Pasta de wallpapers nao encontrada.' }
$target = Join-Path $wallpapers 'circuit-orbit-v2'
$files = @('index.html','app.js','engine.js','hud.js','style.css','LivelyInfo.json','LivelyProperties.json','thumbnail.jpg','preview.gif','Configurar-utilitario.cmd','Coletar-icones.cmd','tools\DesktopMap.cs','tools\Collect-Desktop.ps1','tools\Register-Collector.ps1')
foreach ($file in $files) { if (-not (Test-Path -LiteralPath (Join-Path $source $file) -PathType Leaf)) { throw ('Arquivo ausente: ' + $file) } }
foreach ($folder in @($target,(Join-Path $target 'tools'),(Join-Path $target 'settings'))) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
$sha = [Security.Cryptography.SHA256]::Create()
try {
    foreach ($file in $files) {
        $from = Join-Path $source $file; $to = Join-Path $target $file
        Copy-Item -LiteralPath $from -Destination $to -Force
        if ([Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($from))) -ne [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($to)))) { throw ('Copia divergente: ' + $file) }
    }
} finally { $sha.Dispose() }
# Reuse the saved map without automatically collecting or replacing an existing v2 configuration.
$mapSource = Join-Path $wallpapers 'circuit-orbit\settings'
if (-not (Test-Path -LiteralPath (Join-Path $mapSource 'desktop-map.json'))) { $mapSource = Join-Path $source 'settings' }
foreach ($file in @('desktop-map.json','desktop-map.js')) {
    $from = Join-Path $mapSource $file; $to = Join-Path (Join-Path $target 'settings') $file
    if ((Test-Path -LiteralPath $from) -and -not (Test-Path -LiteralPath $to)) { Copy-Item -LiteralPath $from -Destination $to }
}
& (Join-Path $target 'tools\Register-Collector.ps1')
Write-Output ('Instalada: ' + $target)
Write-Output ('Arquivos de execucao conferidos: ' + $files.Count)
Write-Output 'Versao 1 preservada. Nenhum wallpaper foi ativado ou servico iniciado.'
