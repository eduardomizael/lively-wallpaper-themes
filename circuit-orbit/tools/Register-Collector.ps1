$ErrorActionPreference = 'Stop'
$protocolRoot = 'HKCU:\Software\Classes\circuit-orbit-v2'
$collector = Join-Path $PSScriptRoot 'Collect-Desktop.ps1'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# The URL is deliberately not passed as an argument: this protocol can only collect the desktop map.
$command = '"' + $powershellPath + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $collector + '"'
New-Item -Path ($protocolRoot + '\shell\open\command') -Force | Out-Null
Set-Item -LiteralPath $protocolRoot -Value 'URL:Circuit Orbit Collector'
New-ItemProperty -LiteralPath $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -LiteralPath ($protocolRoot + '\shell\open\command') -Value $command
Write-Output 'Botao de coleta configurado para esta pasta. Nenhum servico foi iniciado.'
