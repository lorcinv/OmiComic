param([string]$JavaHome = $env:JAVA_HOME, [string]$AndroidSdk = $env:ANDROID_SDK_ROOT)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (!$JavaHome) { throw 'Set JAVA_HOME to a JDK 17 or newer installation.' }
if (!$AndroidSdk) { $AndroidSdk = Join-Path $projectRoot '.cache\android-tools' }
$platform = Join-Path $AndroidSdk 'platforms\android-35\android.jar'
if (!(Test-Path -LiteralPath $platform)) { $platform = Join-Path $AndroidSdk 'android-35\android.jar' }
$buildTools = Join-Path $AndroidSdk 'build-tools\35.0.0'
if (!(Test-Path -LiteralPath $buildTools)) { $buildTools = Join-Path $AndroidSdk 'android-15' }
if (!(Test-Path -LiteralPath $platform) -or !(Test-Path -LiteralPath (Join-Path $buildTools 'aapt.exe'))) { throw 'Android platform 35 and build-tools 35.0.0 are required.' }
$env:JAVA_HOME = $JavaHome
function Invoke-Checked([string]$Tool, [string[]]$Arguments) {
  & $Tool @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Build tool failed: $Tool ($LASTEXITCODE)" }
}
Invoke-Checked 'node' @('scripts/prepare-android.cjs')
$build = Join-Path $projectRoot 'android\build'
$release = Join-Path $projectRoot 'release'
$signing = Join-Path $projectRoot '.android-signing'
New-Item -ItemType Directory -Force -Path $build,$release,$signing,(Join-Path $build 'classes'),(Join-Path $build 'dex'),(Join-Path $build 'res\drawable'),(Join-Path $build 'res\values'),(Join-Path $build 'assets\web') | Out-Null
# Remove stale bundled assets only after verifying the target is inside this build directory.
$assetTarget = [IO.Path]::GetFullPath((Join-Path $build 'assets\web'))
if (!$assetTarget.StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid asset directory' }
Get-ChildItem -LiteralPath $assetTarget -Force | Remove-Item -Recurse -Force
Copy-Item -Path 'dist-android\*' -Destination $assetTarget -Recurse
$licenseTarget = Join-Path $assetTarget 'licenses'
New-Item -ItemType Directory -Force -Path $licenseTarget | Out-Null
$noticeLines = @('OmiComic Android third-party notices', 'Android System WebView is provided by the device.', '')
foreach ($packageName in @('react','react-dom','scheduler','pdfjs-dist')) {
  $packageDir = Join-Path (Join-Path $projectRoot 'node_modules') $packageName
  $packageInfo = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $packageDir 'package.json') | ConvertFrom-Json
  $noticeLines += ($packageName + ' ' + $packageInfo.version + ' - ' + $packageInfo.license)
  Get-ChildItem -LiteralPath $packageDir -File | Where-Object { $_.Name -match '^(LICENSE|NOTICE|COPYING)(\.|$)' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $licenseTarget ($packageName + '-' + $_.Name)) }
}
$noticeLines += 'core-js 3.50.0 (bundled by PDF.js legacy) - MIT'
$noticeLines += 'libarchive-android 1.1.7 - Apache-2.0; bundled libarchive and compression libraries: see libarchive-NOTICES.txt'
$noticeLines += 'PNGJ 2.1.0 - Apache-2.0; streaming PNG reduction: see pngj-LICENSE.txt and pngj-NOTICE.txt'
Copy-Item -Path 'android\licenses\*' -Destination $licenseTarget
[IO.File]::WriteAllLines((Join-Path $assetTarget 'THIRD_PARTY_NOTICES.txt'), $noticeLines, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath 'resources\icon.png' -Destination (Join-Path $build 'res\drawable\icon.png')
Copy-Item -Path 'android\res\*' -Destination (Join-Path $build 'res') -Recurse -Force
$version = (Get-Content -Raw -Encoding UTF8 -LiteralPath 'package.json' | ConvertFrom-Json).version
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath 'android\AndroidManifest.xml'
$parts = $version.Split('.')
if ($parts.Length -ne 3) { throw 'Android version must contain major.minor.patch.' }
$versionCode = [int]$parts[0]*10000 + [int]$parts[1]*100 + [int]$parts[2]
$manifest = $manifest -replace 'android:versionName="[^"]+"', ('android:versionName="' + $version + '"')
$manifest = $manifest -replace 'android:versionCode="[^"]+"', ('android:versionCode="' + $versionCode + '"')
[IO.File]::WriteAllText((Join-Path $build 'AndroidManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))
$sources = @(Get-ChildItem -LiteralPath 'android\src' -Recurse -Filter '*.java' | ForEach-Object FullName)
$nativeJar = Join-Path $build 'native\classes.jar'
$pngJar = Join-Path $build 'native\pngj.jar'
Invoke-Checked (Join-Path $JavaHome 'bin\javac.exe') (@('--release','8','-encoding','UTF-8','-cp',($platform + ';' + $nativeJar + ';' + $pngJar),'-d',(Join-Path $build 'classes')) + $sources)
Invoke-Checked (Join-Path $JavaHome 'bin\jar.exe') @('cf',(Join-Path $build 'classes.jar'),'-C',(Join-Path $build 'classes'),'.')
Invoke-Checked (Join-Path $buildTools 'd8.bat') @('--release','--min-api','26','--lib',$platform,'--output',(Join-Path $build 'dex'),(Join-Path $build 'classes.jar'),$nativeJar,$pngJar)
$unsigned = Join-Path $build 'unsigned.apk'
Invoke-Checked (Join-Path $buildTools 'aapt.exe') @('package','-f','-M',(Join-Path $build 'AndroidManifest.xml'),'-S',(Join-Path $build 'res'),'-A',(Join-Path $build 'assets'),'-I',$platform,'-F',$unsigned)
Push-Location -LiteralPath (Join-Path $build 'dex')
try { Invoke-Checked (Join-Path $buildTools 'aapt.exe') @('add',$unsigned,'classes.dex') } finally { Pop-Location }
$sevenZip = & node -e "process.stdout.write(require('7zip-bin-full').path7z)"
Push-Location -LiteralPath (Join-Path $build 'native')
try {
  foreach ($abi in @('arm64-v8a','armeabi-v7a','x86_64','x86')) {
    Invoke-Checked $sevenZip @('a','-tzip','-mx=0','-bd','-bso0',$unsigned,('lib/' + $abi + '/libarchive-jni.so'))
  }
} finally { Pop-Location }
$aligned = Join-Path $build 'aligned.apk'
Invoke-Checked (Join-Path $buildTools 'zipalign.exe') @('-f','-P','16','4',$unsigned,$aligned)
Invoke-Checked (Join-Path $buildTools 'zipalign.exe') @('-c','-P','16','4',$aligned)
$keyfile = Join-Path $signing 'omicomic-release.jks'
$passwordFile = Join-Path $signing 'password.txt'
if (!(Test-Path -LiteralPath $keyfile)) {
  if (Test-Path -LiteralPath $passwordFile) { throw 'Signing key is missing; restore the original key before rebuilding.' }
  $password = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllText($passwordFile,$password)
  $env:OMI_SIGNING_PASSWORD = $password
  Invoke-Checked (Join-Path $JavaHome 'bin\keytool.exe') @('-genkeypair','-keystore',$keyfile,'-storetype','JKS','-alias','omicomic','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=OmiComic, OU=Local Release, O=Lorcin','-storepass:env','OMI_SIGNING_PASSWORD','-keypass:env','OMI_SIGNING_PASSWORD')
}
$env:OMI_SIGNING_PASSWORD = [IO.File]::ReadAllText($passwordFile)
$apk = Join-Path $release ('OmiComic-' + $version + '-android.apk')
try {
  Invoke-Checked (Join-Path $buildTools 'apksigner.bat') @('sign','--ks',$keyfile,'--ks-key-alias','omicomic','--ks-pass','env:OMI_SIGNING_PASSWORD','--key-pass','env:OMI_SIGNING_PASSWORD','--out',$apk,$aligned)
  Invoke-Checked (Join-Path $buildTools 'apksigner.bat') @('verify','--verbose','--print-certs',$apk)
} finally { Remove-Item Env:OMI_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
$hashStream = [IO.File]::OpenRead($apk)
$sha256 = [Security.Cryptography.SHA256]::Create()
try { Write-Output ('SHA256: ' + [BitConverter]::ToString($sha256.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant()) }
finally { $hashStream.Dispose(); $sha256.Dispose() }
Write-Output ('Android APK: ' + $apk)
