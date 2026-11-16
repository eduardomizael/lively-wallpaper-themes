$ErrorActionPreference = 'Stop'
$themeRoot = Split-Path -Parent $PSScriptRoot
$settingsRoot = Join-Path $themeRoot 'settings'
$encoding = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $settingsRoot -Force | Out-Null
function Write-Atomic([string]$name, [string]$content) {
    $target = Join-Path $settingsRoot $name
    $temporary = $target + '.' + $PID + '.tmp'
    [IO.File]::WriteAllText($temporary, $content, $encoding)
    Move-Item -LiteralPath $temporary -Destination $target -Force
}
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'DesktopMap.cs')
    $snapshot = [DesktopMap]::Capture()
    if ($snapshot.error) { throw $snapshot.error }
    $json = $snapshot | ConvertTo-Json -Depth 6 -Compress
    Write-Atomic 'desktop-map.json' $json
    Write-Atomic 'desktop-map.js' ('window.receiveDesktopMap && window.receiveDesktopMap(' + $json + ');')
    $result = @{ completedAt = [DateTime]::UtcNow.ToString('o'); ok = $true; map = $snapshot }
    Write-Output ('Mapa salvo: ' + $snapshot.icons.Length + ' icones.')
} catch {
    $result = @{ completedAt = [DateTime]::UtcNow.ToString('o'); ok = $false; error = $_.Exception.Message }
    Write-Warning $_.Exception.Message
}
$resultJson = $result | ConvertTo-Json -Depth 7 -Compress
Write-Atomic 'collection-result.js' ('window.receiveCollectionResult && window.receiveCollectionResult(' + $resultJson + ');')
if (-not $result.ok) { exit 1 }
