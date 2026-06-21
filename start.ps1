# start.ps1 - Lance BasketGame sur Windows (PowerShell)
#
# Usage :
#   .\start.ps1           # demarre le hub (production)
#   .\start.ps1 --dev     # mode developpement (rechargement auto)
#   .\start.ps1 --open    # ouvre controleur + tele dans le navigateur
#   .\start.ps1 --install # force npm install avant le demarrage

#Requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Recharger PATH (Machine + User) — necessaire si le terminal a ete ouvert
# avant l'installation de Node, ou si le PATH parent est incomplet (ex. IDE).
$env:PATH = @(
    [Environment]::GetEnvironmentVariable('Path', 'Machine')
    [Environment]::GetEnvironmentVariable('Path', 'User')
) -join ';'

$PortHub = if ($env:PORT) { [int]$env:PORT } else { 3000 }
$PortGame = if ($env:GAME_PORT) { [int]$env:GAME_PORT } else { 3101 }

function Write-Info($Message)  { Write-Host "> $Message" -ForegroundColor Cyan }
function Write-Ok($Message)    { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn($Message)  { Write-Host "[!] $Message" -ForegroundColor Yellow }
function Write-Err($Message)   { Write-Host "[X] $Message" -ForegroundColor Red }

$Mode = 'start'
$OpenBrowser = $false
$ForceInstall = $false

foreach ($arg in $args) {
    switch ($arg) {
        '--dev'     { $Mode = 'dev' }
        '--open'    { $OpenBrowser = $true }
        '--install' { $ForceInstall = $true }
        { $_ -in '-h', '--help' } {
            Write-Host 'Usage: .\start.ps1 [--dev] [--open] [--install]'
            Write-Host ''
            Write-Host '  --dev      Rechargement auto (npm run dev)'
            Write-Host '  --open     Ouvre le controleur et la tele dans le navigateur'
            Write-Host '  --install  Force npm install avant le demarrage'
            exit 0
        }
        default {
            Write-Err "Option inconnue : $arg (essayez --help)"
            exit 1
        }
    }
}

# --- Node.js ---
function Find-NodeExecutable {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @()
    try {
        $installPath = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Node.js' -ErrorAction Stop).InstallPath
        if ($installPath) {
            $candidates += Join-Path $installPath.TrimEnd('\') 'node.exe'
        }
    } catch {}

    $candidates += @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\node\node.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return $null
}

$NodeExe = Find-NodeExecutable
if (-not $NodeExe) {
    Write-Err 'Node.js introuvable. Installez Node.js >= 18 : https://nodejs.org/'
    Write-Err 'Si Node est deja installe, fermez puis rouvrez le terminal (ou Cursor).'
    exit 1
}

$NodeDir = Split-Path -Parent $NodeExe
if ($env:PATH -notlike "*$NodeDir*") {
    $env:PATH = "$NodeDir;$env:PATH"
}

$NodeMajor = [int](& $NodeExe -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt 18) {
    Write-Err "Node.js >= 18 requis (version actuelle : $(& $NodeExe -v))"
    exit 1
}

# --- Dependances ---
if ($ForceInstall -or -not (Test-Path 'node_modules')) {
    Write-Info 'Installation des dependances...'
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Ok 'Dependances pretes'
}

# --- Liberer les ports si occupes ---
function Free-Port {
    param([int]$Port)

    $pids = @()

    try {
        $pids = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        $lines = netstat -ano | Select-String ":\s*$Port\s+.*LISTENING"
        foreach ($line in $lines) {
            $procId = ($line -split '\s+')[-1]
            if ($procId -match '^\d+$') { $pids += [int]$procId }
        }
        $pids = @($pids | Select-Object -Unique)
    }

    if ($pids.Count -gt 0) {
        Write-Warn "Port $Port occupe (PID $($pids -join ', ')) - arret du processus..."
        foreach ($procId in $pids) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    }
}

Free-Port -Port $PortHub
Free-Port -Port $PortGame

# --- IP locale (Wi-Fi / Ethernet) ---
function Get-LocalIp {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Sort-Object InterfaceMetric |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($ip) { return $ip }
    } catch {
        try {
            $ip = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
                Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '169.254.*' } |
                Select-Object -First 1
            if ($ip) { return $ip.IPAddressToString }
        } catch {}
    }
    return 'localhost'
}

$IP = Get-LocalIp

# --- Banniere ---
Write-Host ''
Write-Host '======================================================' -ForegroundColor Magenta
Write-Host '       BasketGame - Lancement sur Windows' -ForegroundColor Magenta
Write-Host '======================================================' -ForegroundColor Magenta
Write-Host ''
Write-Ok "Node $(& $NodeExe -v)"
Write-Host ''
Write-Info "Controleur (PC / mobile) :  http://${IP}:${PortHub}/"
Write-Info "Tele (grand ecran)       :  http://${IP}:${PortHub}/tv"
Write-Info "Capteurs IR (dashboard)  :  http://${IP}:${PortHub}/sensors"
Write-Info "Trigger manuel/simulateur:  POST http://${IP}:${PortHub}/api/trigger?col=N"
Write-Host ''

if ($OpenBrowser) {
    Write-Info 'Ouverture du navigateur...'
    Start-Process "http://localhost:${PortHub}/" -ErrorAction SilentlyContinue
    Start-Process "http://localhost:${PortHub}/tv" -ErrorAction SilentlyContinue
}

Write-Info 'Ctrl+C pour arreter le serveur'
Write-Host ''

# --- Demarrage ---
try {
    if ($Mode -eq 'dev') {
        npm run dev
    } else {
        npm start
    }
    exit $LASTEXITCODE
} catch {
    Write-Err $_.Exception.Message
    exit 1
} finally {
    Write-Host ''
    Write-Warn 'Arret de BasketGame...'
}
