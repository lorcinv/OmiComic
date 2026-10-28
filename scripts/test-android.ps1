param([string]$Serial = 'emulator-5580', [ValidateSet('search1145','launch1145','search1144','search1143','restore1142','formats1142','provider1142','catalog1142','acceptance1142','authorize1141','covers1141','regression1141','catalog1141','about','smoke','restore','ui','archives','archive-restore','performance','loading','loading-restore','interactions','storage','upgrade','reader-tools','reader-tools-restore','mobile-covers','mobile','mobile-restore','mobile-actions','mobile-polish','mobile-fixes','mobile-fixes-restore','interface-polish','theme-polish','system-bars','mobile-motion','mobile-transitions','native-reader','native-speed','native-codecs','zip-fast','mobile-preview-speed','mobile-interactions1113','native-stability','mobile1115-home','mobile1115-performance','mobile1115-features','mobile1116-seek','mobile1116-formats','mobile1116-large','mobile1117-bench','mobile1117-png','mobile1118-prefetch','mobile1119-ui','mobile1120-ui','mobile1120-launch','mobile1121-lifecycle','mobile1122-lifecycle','mobile1123-resume','mobile1138-entry')][string]$Mode = 'smoke', [string]$JavaHome = $env:JAVA_HOME, [string]$ExpectedVersion, [string]$Fixture, [switch]$ColdCache)
$ErrorActionPreference = 'Stop'
if (!$Serial.StartsWith('emulator-')) { throw 'This test only runs on a dedicated emulator containing disposable fixtures.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$sdk = Join-Path $projectRoot '.cache\android-tools'
$platform = Join-Path $sdk 'android-35\android.jar'
$tools = Join-Path $sdk 'android-15'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$build = Join-Path $projectRoot '.cache\android-test'
New-Item -ItemType Directory -Force -Path $build,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'assets') | Out-Null
Copy-Item -Path 'tests\android\*.js' -Destination (Join-Path $build 'assets')
Copy-Item -LiteralPath 'tests/fixtures/android-antialias' -Destination (Join-Path $build 'assets') -Recurse -Force
Copy-Item -LiteralPath 'tests/fixtures/android-archives/RAR5.cbr' -Destination (Join-Path $build 'assets/stream.cbr')
$manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="io.github.lorcinv.omicomic.test"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application android:label="OmiComic test" android:testOnly="true"><provider android:name="io.github.lorcinv.omicomic.test.PipeProvider" android:authorities="io.github.lorcinv.omicomic.test.pipe" android:exported="true"/><provider android:name="io.github.lorcinv.omicomic.test.CatalogProvider" android:authorities="io.github.lorcinv.omicomic.test.catalog" android:exported="true" android:grantUriPermissions="true" android:process=":catalogfixtures"/></application><instrumentation android:name="io.github.lorcinv.omicomic.test.SmokeTest" android:targetPackage="io.github.lorcinv.omicomic"/></manifest>'
[IO.File]::WriteAllText((Join-Path $build 'AndroidManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))
function Run([string]$Tool, [string[]]$Arguments) { & $Tool @Arguments; if ($LASTEXITCODE -ne 0) { throw "Test tool failed: $Tool" } }
Run (Join-Path $JavaHome 'bin\javac.exe') @('--release','8','-encoding','UTF-8','-cp',$platform,'-d',(Join-Path $build 'classes'),'tests/android/SmokeTest.java','tests/android/PipeProvider.java','tests/android/CatalogProvider.java','tests/android/CatalogChecks.java')
Run (Join-Path $JavaHome 'bin\jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
$env:JAVA_HOME=$JavaHome
Run (Join-Path $tools 'd8.bat') @('--min-api','26','--lib',$platform,'--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'))
$apk = Join-Path $build 'test.apk'
Run (Join-Path $tools 'aapt.exe') @('package','-f','-M',(Join-Path $build 'AndroidManifest.xml'),'-A',(Join-Path $build 'assets'),'-I',$platform,'-F',$apk)
Push-Location -LiteralPath (Join-Path $build 'dex')
try { Run (Join-Path $tools 'aapt.exe') @('add',$apk,'classes.dex') } finally { Pop-Location }
$env:OMI_TEST_SIGNING_PASSWORD=[IO.File]::ReadAllText((Join-Path $projectRoot '.android-signing\password.txt'))
try { Run (Join-Path $tools 'apksigner.bat') @('sign','--ks',(Join-Path $projectRoot '.android-signing\omicomic-release.jks'),'--ks-key-alias','omicomic','--ks-pass','env:OMI_TEST_SIGNING_PASSWORD','--key-pass','env:OMI_TEST_SIGNING_PASSWORD',$apk) }
finally { Remove-Item Env:OMI_TEST_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
Run $adb @('-s',$Serial,'install','-r','-t',$apk)
if (!$ExpectedVersion) { $ExpectedVersion = (Get-Content -Raw -Encoding UTF8 -LiteralPath 'package.json' | ConvertFrom-Json).version }
$cacheMode = if ($ColdCache) { 'cold' } else { 'keep' }
$fixtureArgs = if ($Fixture) { @('-e','fixture',$Fixture) } else { @() }
$result = & $adb -s $Serial shell am instrument -w -e mode $Mode -e cache $cacheMode -e expectedVersion $expectedVersion @fixtureArgs io.github.lorcinv.omicomic.test/.SmokeTest
$result | Write-Output
$jsonLine = $result | Where-Object { $_.StartsWith('INSTRUMENTATION_RESULT: result=') } | Select-Object -Last 1
if (!$jsonLine) { throw 'Instrumentation did not return a result.' }
$json = $jsonLine.Substring('INSTRUMENTATION_RESULT: result='.Length)
[IO.File]::WriteAllText((Join-Path $projectRoot ('test-results\android-' + $Mode + '.json')), $json, [Text.UTF8Encoding]::new($false))
if (!(($json | ConvertFrom-Json).ok)) { throw 'Android packaged runtime test failed.' }
Run $adb @('-s',$Serial,'pull',('/sdcard/Android/data/io.github.lorcinv.omicomic/files/android-'+$Mode+'.png'),('test-results/android-'+$Mode+'.png'))
