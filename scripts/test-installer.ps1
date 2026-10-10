param([string]$Installer = 'release/OmiComic-Setup-0.2.0-x64.exe')
$ErrorActionPreference = 'Stop'
$omiWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $omiWorkspace
$omiGuid = (& node -e 'const {UUID}=require("builder-util-runtime"); process.stdout.write(UUID.v5("io.github.lorcinv.omicomic", UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3")));').Trim()
$omiUninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $omiGuid
$omiRegistryKeys = @($omiUninstallKey, ('HKCU:\Software\' + $omiGuid), 'HKCU:\Software\Classes\OmiComic.Document', 'HKCU:\Software\Classes\Applications\OmiComic.exe', 'HKCU:\Software\OmiComic\Capabilities')
$omiShortcuts = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'OmiComic.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'OmiComic.lnk'))
# This fresh-install check must never replace an existing installed application or shortcut.
foreach ($omiExisting in @($omiRegistryKeys) + @($omiShortcuts)) {
    if (Test-Path -LiteralPath $omiExisting) { throw 'An existing OmiComic installation or shortcut was found; fresh-install test stopped without changes.' }
}
$omiRegistered = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\RegisteredApplications')
try { if ($omiRegistered -and $null -ne $omiRegistered.GetValue('OmiComic')) { throw 'OmiComic is already registered; test stopped.' } } finally { if ($omiRegistered) { $omiRegistered.Dispose() } }
$omiExtensions = 'jpg','jpeg','png','webp','bmp','gif','zip','cbz','rar','cbr','7z','cb7','pdf','epub'
function Get-DefaultAssociations {
    $omiDefaults = @{}
    foreach ($omiExt in $omiExtensions) {
        $omiKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Classes\.' + $omiExt)
        try { $omiDefaults[$omiExt] = if ($omiKey) { $omiKey.GetValue('') } else { $null } } finally { if ($omiKey) { $omiKey.Dispose() } }
    }
    return $omiDefaults | ConvertTo-Json -Compress
}
$omiDefaultsBefore = Get-DefaultAssociations
$omiInstallRoot = Join-Path $omiWorkspace ('test-results\installer-smoke-' + [Guid]::NewGuid().ToString('N'))
$omiResolved = [IO.Path]::GetFullPath($omiInstallRoot)
$omiTestRoot = [IO.Path]::GetFullPath((Join-Path $omiWorkspace 'test-results')) + [IO.Path]::DirectorySeparatorChar
if (-not $omiResolved.StartsWith($omiTestRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation test path.' }
$omiInstallerPath = (Resolve-Path -LiteralPath $Installer).Path
$omiPreviousExe = $env:OMICOMIC_PACKAGED_EXE
$omiInstalled = $false
try {
    $omiSetup = Start-Process -FilePath $omiInstallerPath -ArgumentList ('/S /currentuser /D=' + $omiResolved) -WindowStyle Hidden -PassThru
    if (-not $omiSetup.WaitForExit(30000)) { throw 'Silent installer did not finish within 30 seconds.' }
    if ($omiSetup.ExitCode -ne 0) { throw ('Installer exit code: ' + $omiSetup.ExitCode) }
    $omiInstalled = $true
    $omiInstalledExe = Join-Path $omiResolved 'OmiComic.exe'
    if (-not (Test-Path -LiteralPath $omiInstalledExe)) { throw 'Installed executable missing.' }
    $omiEntry = Get-ItemProperty -LiteralPath $omiUninstallKey
    if ($omiEntry.DisplayName -ne 'OmiComic' -or $omiEntry.DisplayVersion -ne '0.2.0') { throw 'Installed Apps metadata mismatch.' }
    $omiShell = New-Object -ComObject WScript.Shell
    foreach ($omiShortcut in $omiShortcuts) {
        if (-not (Test-Path -LiteralPath $omiShortcut)) { throw 'Installer did not create its shortcut.' }
        if ($omiShell.CreateShortcut($omiShortcut).TargetPath -ne $omiInstalledExe) { throw 'Shortcut target mismatch.' }
    }
    foreach ($omiExt in $omiExtensions) {
        $omiKey = Get-Item -LiteralPath ('HKCU:\Software\Classes\.' + $omiExt + '\OpenWithProgids')
        if ($omiKey.GetValueNames() -notcontains 'OmiComic.Document') { throw ('Open With registration missing: ' + $omiExt) }
    }
    if ((Get-DefaultAssociations) -ne $omiDefaultsBefore) { throw 'Installer changed a default file association.' }
    $env:OMICOMIC_PACKAGED_EXE = $omiInstalledExe
    & node --test tests/packaged.electron.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
    [ordered]@{ installedAppsName=$omiEntry.DisplayName; version=$omiEntry.DisplayVersion; publisher=$omiEntry.Publisher; shortcuts=2; openWithFormats=$omiExtensions.Count; defaultAssociationsPreserved=$true; installedAppSmokePassed=$true } | ConvertTo-Json | Set-Content -LiteralPath 'test-results/installer-smoke.json'
} finally {
    $env:OMICOMIC_PACKAGED_EXE = $omiPreviousExe
    $omiUninstaller = Join-Path $omiResolved 'Uninstall OmiComic.exe'
    if (Test-Path -LiteralPath $omiUninstaller) {
        $omiRemoval = Start-Process -FilePath $omiUninstaller -ArgumentList '/S /currentuser' -WindowStyle Hidden -PassThru
        if (-not $omiRemoval.WaitForExit(30000)) { throw 'Silent uninstaller did not finish within 30 seconds.' }
        for ($omiAttempt=0; $omiAttempt -lt 40 -and (Test-Path -LiteralPath $omiUninstallKey); $omiAttempt++) { Start-Sleep -Milliseconds 250 }
    }
    if ($omiInstalled) {
        foreach ($omiEntryPath in @($omiRegistryKeys) + @($omiShortcuts)) {
            if (Test-Path -LiteralPath $omiEntryPath) { throw ('Uninstaller left an application entry: ' + $omiEntryPath) }
        }
        if ((Get-DefaultAssociations) -ne $omiDefaultsBefore) { throw 'Uninstaller changed a default file association.' }
    }
    if (Test-Path -LiteralPath $omiResolved) {
        $omiFinalPath = (Resolve-Path -LiteralPath $omiResolved).Path
        if (-not $omiFinalPath.StartsWith($omiTestRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup path.' }
        Remove-Item -LiteralPath $omiFinalPath -Recurse -Force
    }
}
Write-Output 'Silent installation, Installed Apps metadata, shortcuts, Open With, reading and uninstallation verified.'
