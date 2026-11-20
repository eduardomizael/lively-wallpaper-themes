[CmdletBinding()]
param(
    [string]$Biblioteca,
    [string[]]$Temas,
    [switch]$Atualizar
)

$ErrorActionPreference = 'Stop'

function Resolve-WallpapersFolder([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    $expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
    $folder = Get-Item -LiteralPath $expanded -ErrorAction SilentlyContinue
    if (-not ($folder -is [IO.DirectoryInfo])) { return }
    if ($folder.Name -eq 'wallpapers') { return $folder.FullName }
    foreach ($relative in @('wallpapers', 'Library\wallpapers')) {
        $candidate = Join-Path $folder.FullName $relative
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            return (Get-Item -LiteralPath $candidate).FullName
        }
    }
}

function Find-WallpapersFolders([string]$LocalData) {
    $desktopData = Join-Path $LocalData 'Lively Wallpaper'
    $packages = Join-Path $LocalData 'Packages'
    $storeData = @(
        Get-ChildItem -LiteralPath $packages -Directory -Filter '*rocksdanister.LivelyWallpaper_*' -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'LocalCache\Local\Lively Wallpaper' }
    )

    foreach ($data in (@($desktopData) + $storeData)) {
        $defaultLibrary = Join-Path $data 'Library'
        $settingsPath = Join-Path $data 'Settings.json'
        if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
            try {
                $configured = (Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json).WallpaperDir
                # A Microsoft Store pode gravar o caminho virtual da biblioteca padrão.
                if ($data -ne $desktopData -and $configured -eq (Join-Path $desktopData 'Library')) {
                    $configured = $defaultLibrary
                }
                $folder = Resolve-WallpapersFolder $configured
                if ($folder) { $folder; continue }
                if ($configured -and $configured -ne $defaultLibrary) { continue }
            } catch {
                Write-Warning "Falha ao ler as configurações em $settingsPath."
            }
        }
        Resolve-WallpapersFolder $defaultLibrary
    }
}

[object[]]$catalog = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'catalogo.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
if ($Temas) {
    if ($Temas.Count -eq 1 -and $Temas[0] -eq 'todos') {
        $selected = $catalog
    } else {
        $unknown = @($Temas | Where-Object { $_ -notin $catalog.id })
        if ($unknown.Count) { throw "Tema(s) desconhecido(s): $($unknown -join ', ')." }
        $selected = @($catalog | Where-Object { $_.id -in $Temas })
    }
}

if ($Biblioteca) {
    $wallpapers = Resolve-WallpapersFolder $Biblioteca
    if (-not $wallpapers) { throw "Pasta da biblioteca do Lively inválida: $Biblioteca." }
} else {
    $detected = @(Find-WallpapersFolders ([Environment]::GetFolderPath('LocalApplicationData')) | Select-Object -Unique)
    if ($detected.Count -eq 1) {
        $wallpapers = $detected[0]
    } elseif ($detected.Count -gt 1) {
        Write-Host 'Bibliotecas do Lively encontradas:'
        for ($index = 0; $index -lt $detected.Count; $index++) {
            Write-Host ("  {0}. {1}" -f ($index + 1), $detected[$index])
        }
        do {
            $inputPath = Read-Host 'Digite o número da biblioteca, outro caminho ou 0 para sair'
            if ($inputPath -eq '0') { return }
            $number = 0
            if ([int]::TryParse($inputPath, [ref]$number) -and $number -ge 1 -and $number -le $detected.Count) {
                $wallpapers = $detected[$number - 1]
            } else { $wallpapers = Resolve-WallpapersFolder $inputPath }
            if (-not $wallpapers) { Write-Warning 'Escolha uma biblioteca existente.' }
        } until ($wallpapers)
    } else {
        Write-Host 'Biblioteca não encontrada. Abra Lively > Configurações > Geral e verifique o diretório dos papéis de parede.'
        do {
            $inputPath = Read-Host 'Cole o caminho de Library ou wallpapers, ou digite 0 para sair'
            if ($inputPath -eq '0') { return }
            $wallpapers = Resolve-WallpapersFolder $inputPath
            if (-not $wallpapers) { Write-Warning 'Pasta wallpapers não encontrada nesse caminho.' }
        } until ($wallpapers)
    }
}

Write-Host "Biblioteca: $wallpapers"
if (-not $Temas) {
    for ($index = 0; $index -lt $catalog.Count; $index++) {
        $metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot "$($catalog[$index].id)/LivelyInfo.json") -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Host ("  {0}. {1}" -f ($index + 1), $metadata.Title)
    }
    do {
        $selection = (Read-Host 'Digite os números separados por vírgula, T para todos ou 0 para sair').Trim()
        if ($selection -eq '0') { return }
        if ($selection -eq 'T') {
            $selected = $catalog
        } else {
            $choices = @($selection -split '[,;\s]+' | Where-Object { $_ })
            $indices = @()
            foreach ($choice in $choices) {
                $number = 0
                if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $catalog.Count) {
                    $indices = @()
                    break
                }
                $indices += ($number - 1)
            }
            $selected = @($indices | Select-Object -Unique | ForEach-Object { $catalog[$_] })
        }
        if (-not $selected) { Write-Warning 'Seleção inválida.' }
    } until ($selected)
}

$libraryRoot = Split-Path -Parent $wallpapers
$installed = 0
$failures = @()
foreach ($theme in $selected) {
    $source = Join-Path $PSScriptRoot $theme.id
    $target = Join-Path $wallpapers $theme.destino
    $existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    if ($existing) {
        if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint -or -not $existing.PSIsContainer) {
            $failures += $theme.id
            Write-Warning "Destino incompatível: $target"
            continue
        }
        if (-not $Atualizar) {
            if ($Temas -or (Read-Host "$($theme.id) já existe. Atualizar com backup? [s/N]") -ne 's') {
                Write-Host "Mantido: $target"
                continue
            }
        }
    }

    $operation = [guid]::NewGuid().ToString('N')
    $stage = Join-Path $libraryRoot ".instalar-tema-$operation"
    $backup = $null
    try {
        $null = [IO.Directory]::CreateDirectory($stage)
        foreach ($file in $theme.arquivos) {
            $from = Join-Path $source $file
            $to = Join-Path $stage $file
            $null = [IO.Directory]::CreateDirectory((Split-Path -Parent $to))
            Copy-Item -LiteralPath $from -Destination $to
        }
        if ($existing) {
            if ($theme.id -eq 'circuit-orbit') {
                foreach ($name in @('desktop-map.json', 'desktop-map.js')) {
                    $map = Join-Path $target "settings/$name"
                    if (Test-Path -LiteralPath $map -PathType Leaf) {
                        $mapFolder = Join-Path $stage 'settings'
                        $null = [IO.Directory]::CreateDirectory($mapFolder)
                        Copy-Item -LiteralPath $map -Destination $mapFolder
                    }
                }
            }
            $backupFolder = Join-Path $libraryRoot 'BackupsTemas'
            $null = [IO.Directory]::CreateDirectory($backupFolder)
            $backup = Join-Path $backupFolder "$($theme.destino)-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$operation"
            [IO.Directory]::Move($target, $backup)
        }
        try {
            [IO.Directory]::Move($stage, $target)
        } catch {
            if ($backup -and (Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $target)) {
                [IO.Directory]::Move($backup, $target)
            }
            throw
        }
        $installed++
        Write-Host "Instalado: $target"
        if ($backup) { Write-Host "Backup: $backup" }
    } catch {
        $failures += $theme.id
        Write-Warning "Falha ao instalar $($theme.id): $($_.Exception.Message)"
        if ($backup -and (Test-Path -LiteralPath $backup)) { Write-Warning "Backup disponível em $backup" }
    } finally {
        if (Test-Path -LiteralPath $stage) {
            $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
            if ($resolvedStage -eq $stage -and (Split-Path -Parent $resolvedStage) -eq $libraryRoot) {
                Remove-Item -LiteralPath $resolvedStage -Recurse -Force -ErrorAction Continue
            }
        }
    }
}

if ($installed) {
    Write-Host ''
    Write-Host 'Para recarregar a biblioteca, clique com o botão direito no Lively perto do relógio e selecione Sair.'
    Write-Host 'Abra Lively Wallpaper no menu Iniciar e selecione o tema na Biblioteca.'
}
if ($failures.Count) { throw "Instalação incompleta: $($failures -join ', ')." }
