$ErrorActionPreference = 'Stop'
$omiRepository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$omiExecutable = Join-Path $omiRepository 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $omiExecutable) -or -not (Test-Path -LiteralPath (Join-Path $omiRepository 'dist\index.html'))) {
    throw '请先安装依赖并运行 npm run build。'
}

# 只注册当前用户的“打开方式”候选项；不修改 Windows 的默认文件关联。
$omiCommand = '"{0}" "{1}" "%1"' -f $omiExecutable, $omiRepository
$omiProgId = 'OmiComic.LocalDocument'
$omiExtensions = '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.zip', '.cbz', '.rar', '.cbr', '.7z', '.cb7', '.pdf', '.epub'
$omiClasses = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Software\Classes')
try {
    foreach ($omiApplicationKey in @($omiProgId, 'Applications\OmiComic.Local.exe')) {
        $omiKey = $omiClasses.CreateSubKey($omiApplicationKey)
        try { $omiKey.SetValue('', 'OmiComic'); $omiKey.SetValue('FriendlyAppName', 'OmiComic') } finally { $omiKey.Dispose() }
        $omiKey = $omiClasses.CreateSubKey($omiApplicationKey + '\shell\open\command')
        try { $omiKey.SetValue('', $omiCommand) } finally { $omiKey.Dispose() }
    }
    foreach ($omiExtension in $omiExtensions) {
        $omiKey = $omiClasses.CreateSubKey($omiExtension + '\OpenWithProgids')
        try { $omiKey.SetValue($omiProgId, [byte[]]@(), [Microsoft.Win32.RegistryValueKind]::None) } finally { $omiKey.Dispose() }
        $omiKey = $omiClasses.CreateSubKey('Applications\OmiComic.Local.exe\SupportedTypes')
        try { $omiKey.SetValue($omiExtension, '') } finally { $omiKey.Dispose() }
    }
} finally { $omiClasses.Dispose() }
Write-Output '已注册 OmiComic 文件打开方式。资源管理器中右键文件，选择“打开方式 → OmiComic”。'
