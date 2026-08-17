$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$adb = if (Get-Command adb -ErrorAction SilentlyContinue) { 'adb' } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }

if (-not (Test-Path -LiteralPath $adb) -and $adb -ne 'adb') {
    throw "ADB not found: $adb"
}

Push-Location $root
try {
    & (Join-Path $PSScriptRoot 'build-android.ps1')
    $devices = & $adb devices
    if (-not ($devices | Select-String '\tdevice$')) {
        throw 'No authorized Android device was detected.'
    }
    & $adb install -r 'artifacts\ScanYao-android-debug.apk'
    if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
    & $adb shell am force-stop com.jensenyao.scanyao
    & $adb shell monkey -p com.jensenyao.scanyao -c android.intent.category.LAUNCHER 1 | Out-Null
    Write-Host 'ScanYao is installed and running.'
}
finally {
    Pop-Location
}
