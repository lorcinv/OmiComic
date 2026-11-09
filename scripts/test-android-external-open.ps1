param([string]$Serial='emulator-5580', [string]$JavaHome='', [ValidateSet('open','restore')][string]$Mode='open', [switch]$SkipBuild)
$ErrorActionPreference='Stop'
if (!$Serial.StartsWith('emulator-')) { throw 'Use a disposable test emulator.' }
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (!$JavaHome) { $JavaHome=Join-Path $projectRoot '.cache/android-tools/local-jdk17-20261027/jdk-17.0.20.1+1' }
$sdk=Join-Path $projectRoot '.cache/android-tools'
$platform=Join-Path $sdk 'android-35/android.jar'
$buildTools=Join-Path $sdk 'android-15'
$adb=Join-Path $sdk 'platform-tools/adb.exe'
$build=Join-Path $projectRoot '.cache/external-open-20261108/test'
function Run([string]$Tool,[string[]]$Arguments) { & $Tool @Arguments; if ($LASTEXITCODE -ne 0) { throw "Tool failed: $Tool" } }
if (!$SkipBuild) {
  New-Item -ItemType Directory -Force -Path $build,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'assets') | Out-Null
  Copy-Item -LiteralPath 'tests/fixtures/images/portrait-3000x4000.png' -Destination (Join-Path $build 'assets/external.png')
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $fixture=Join-Path $build 'assets/external.cbz'
  $zipStream=[IO.File]::Open($fixture,[IO.FileMode]::Create)
  $zip=[IO.Compression.ZipArchive]::new($zipStream,[IO.Compression.ZipArchiveMode]::Create)
  try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $build 'assets/external.png'),'001.png') | Out-Null } finally { $zip.Dispose();$zipStream.Dispose() }
  $manifest='<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="io.github.lorcinv.omicomic.externaltest"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="35"/><application android:label="Omi external-open test" android:testOnly="true"><provider android:name=".ExternalOpenTest$Provider" android:authorities="io.github.lorcinv.omicomic.externaltest.files" android:exported="true" android:grantUriPermissions="true"/></application><instrumentation android:name=".ExternalOpenTest" android:targetPackage="io.github.lorcinv.omicomic"/></manifest>'
  [IO.File]::WriteAllText((Join-Path $build 'AndroidManifest.xml'),$manifest,[Text.UTF8Encoding]::new($false))
  Run (Join-Path $JavaHome 'bin/javac.exe') @('--release','8','-encoding','UTF-8','-cp',$platform,'-d',(Join-Path $build 'classes'),'tests/android/ExternalOpenTest.java')
  Run (Join-Path $JavaHome 'bin/jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
  $env:JAVA_HOME=$JavaHome
  Run (Join-Path $buildTools 'd8.bat') @('--min-api','26','--lib',$platform,'--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'))
  $apk=Join-Path $build 'external-test.apk'
  Run (Join-Path $buildTools 'aapt.exe') @('package','-f','-M',(Join-Path $build 'AndroidManifest.xml'),'-A',(Join-Path $build 'assets'),'-I',$platform,'-F',$apk)
  Push-Location -LiteralPath (Join-Path $build 'dex')
  try { Run (Join-Path $buildTools 'aapt.exe') @('add',$apk,'classes.dex') } finally { Pop-Location }
  $env:OMI_TEST_SIGNING_PASSWORD=[IO.File]::ReadAllText((Join-Path $projectRoot '.android-signing/password.txt'))
  try { Run (Join-Path $buildTools 'apksigner.bat') @('sign','--ks',(Join-Path $projectRoot '.android-signing/omicomic-release.jks'),'--ks-key-alias','omicomic','--ks-pass','env:OMI_TEST_SIGNING_PASSWORD','--key-pass','env:OMI_TEST_SIGNING_PASSWORD',$apk) } finally { Remove-Item Env:OMI_TEST_SIGNING_PASSWORD }
  Run $adb @('-s',$Serial,'install','-r','-t',$apk)
}
Run $adb @('-s',$Serial,'shell','am','force-stop','io.github.lorcinv.omicomic')
$version=(Get-Content -Raw -Encoding UTF8 -LiteralPath 'package.json' | ConvertFrom-Json).version
$result=& $adb -s $Serial shell am instrument -w -e version $version -e mode $Mode io.github.lorcinv.omicomic.externaltest/.ExternalOpenTest
$result | Tee-Object -FilePath (Join-Path $build ($Mode+'-result.txt'))
if (($result -join "`n") -notmatch '"ok":true') { throw 'External-open device test failed.' }
