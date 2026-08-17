$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationFramework
$app = Join-Path $PSScriptRoot 'ScanYao.exe'
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
$desktopRuntime = if ($dotnet) {
    & $dotnet.Source --list-runtimes 2>$null | Select-String '^Microsoft\.WindowsDesktop\.App 8\.'
}

if (-not $desktopRuntime) {
    $answer = [System.Windows.MessageBox]::Show(
        'ScanYao requires the .NET 8 Desktop Runtime. Open the official Microsoft download page?',
        '.NET 8 required',
        [System.Windows.MessageBoxButton]::YesNo,
        [System.Windows.MessageBoxImage]::Information)
    if ($answer -eq [System.Windows.MessageBoxResult]::Yes) {
        Start-Process 'https://dotnet.microsoft.com/download/dotnet/8.0/runtime'
    }
    exit 1
}

if (-not (Test-Path -LiteralPath $app)) {
    [System.Windows.MessageBox]::Show('The package is incomplete: ScanYao.exe was not found.', 'ScanYao') | Out-Null
    exit 1
}

Start-Process -FilePath $app -WorkingDirectory $PSScriptRoot
