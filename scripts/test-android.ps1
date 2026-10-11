param([string]$Serial = 'emulator-5580', [ValidateSet('smoke','restore','ui','archives','archive-restore')][string]$Mode = 'smoke', [string]$JavaHome = $env:JAVA_HOME)
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
$manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="io.github.lorcinv.omicomic.test"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application android:label="OmiComic test" android:testOnly="true"/><instrumentation android:name="io.github.lorcinv.omicomic.test.SmokeTest" android:targetPackage="io.github.lorcinv.omicomic"/></manifest>'
[IO.File]::WriteAllText((Join-Path $build 'AndroidManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))
function Run([string]$Tool, [string[]]$Arguments) { & $Tool @Arguments; if ($LASTEXITCODE -ne 0) { throw "Test tool failed: $Tool" } }
Run (Join-Path $JavaHome 'bin\javac.exe') @('--release','8','-encoding','UTF-8','-cp',$platform,'-d',(Join-Path $build 'classes'),'tests/android/SmokeTest.java')
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
$expectedVersion = (Get-Content -Raw -Encoding UTF8 -LiteralPath 'package.json' | ConvertFrom-Json).version
$result = & $adb -s $Serial shell am instrument -w -e mode $Mode -e expectedVersion $expectedVersion io.github.lorcinv.omicomic.test/.SmokeTest
$result | Write-Output
$jsonLine = $result | Where-Object { $_.StartsWith('INSTRUMENTATION_RESULT: result=') } | Select-Object -Last 1
if (!$jsonLine) { throw 'Instrumentation did not return a result.' }
$json = $jsonLine.Substring('INSTRUMENTATION_RESULT: result='.Length)
[IO.File]::WriteAllText((Join-Path $projectRoot ('test-results\android-' + $Mode + '.json')), $json, [Text.UTF8Encoding]::new($false))
if (!(($json | ConvertFrom-Json).ok)) { throw 'Android packaged runtime test failed.' }
Run $adb @('-s',$Serial,'pull',('/sdcard/Android/data/io.github.lorcinv.omicomic/files/android-'+$Mode+'.png'),('test-results/android-'+$Mode+'.png'))
