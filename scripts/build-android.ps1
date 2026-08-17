$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$java = Get-Command java -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath $sdk)) {
    throw "Android SDK not found: $sdk"
}
if (-not $java) {
    throw 'Java 17 or newer is required to build the Android app.'
}
$env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $java.Source)

Push-Location $root
try {
    npm run build
    npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        throw "Capacitor sync failed with exit code $LASTEXITCODE."
    }
    $capacitorGradle = 'android\app\capacitor.build.gradle'
    $gradleContent = (Get-Content -LiteralPath $capacitorGradle -Raw).Replace('JavaVersion.VERSION_21', 'JavaVersion.VERSION_17')
    Set-Content -LiteralPath $capacitorGradle -Value $gradleContent -Encoding ASCII
    $escapedSdk = $sdk.Replace('\', '\\')
    Set-Content -LiteralPath 'android\local.properties' -Value "sdk.dir=$escapedSdk" -Encoding ASCII
    Push-Location 'android'
    try {
        .\gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
    New-Item -ItemType Directory -Force -Path 'artifacts' | Out-Null
    Copy-Item -LiteralPath 'android\app\build\outputs\apk\debug\app-debug.apk' -Destination 'artifacts\ScanYao-android-debug.apk' -Force
    Write-Host "Android package: $root\artifacts\ScanYao-android-debug.apk"
}
finally {
    Pop-Location
}
