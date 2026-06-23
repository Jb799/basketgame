# Normalise les sons via scripts/normalize-sounds.mjs (ffmpeg loudnorm).
# Usage: .\scripts\normalize-sounds.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
node scripts/normalize-sounds.mjs @args
