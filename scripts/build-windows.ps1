param(
    [switch]$SelfContained
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    npm run build
    $output = Join-Path $root 'artifacts\windows\ScanYao-win-x64'
    $arguments = @(
        'publish',
        'windows\ScanYao.Windows\ScanYao.Windows.csproj',
        '-c', 'Release',
        '-r', 'win-x64',
        '--self-contained', $SelfContained.ToString().ToLowerInvariant(),
        '-o', $output
    )
    dotnet @arguments
    Copy-Item -LiteralPath 'scripts\Start-ScanYao.ps1' -Destination $output -Force
    Compress-Archive -Path "$output\*" -DestinationPath 'artifacts\ScanYao-win-x64.zip' -Force
    Write-Host "Windows package: $root\artifacts\ScanYao-win-x64.zip"
}
finally {
    Pop-Location
}
