$ErrorActionPreference = 'Stop'
$protocolRoot = 'HKCU:\Software\Classes\circuit-orbit-v2'
$commandKey = $protocolRoot + '\shell\open\command'
if (Test-Path -LiteralPath $commandKey) {
    $command = (Get-Item -LiteralPath $commandKey).GetValue('')
    $collector = Join-Path $PSScriptRoot 'Collect-Desktop.ps1'
    if ($command -and $command.Contains($collector)) {
        # Only the explicitly named, project-owned protocol registration is removed.
        Remove-Item -LiteralPath $protocolRoot -Recurse -Force
    }
}
