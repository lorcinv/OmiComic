param([Parameter(Mandatory=$true)][string]$InputPath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OmiWindowHitTest {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    public static long Hit(long handle, int x, int y) {
        var previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
        try {
            var hwnd = new IntPtr(handle);
            var point = new Point { X=x, Y=y };
            if (!ClientToScreen(hwnd, ref point)) throw new Exception("ClientToScreen failed");
            var packed = new IntPtr(unchecked((point.Y << 16) | (point.X & 0xffff)));
            UIntPtr result;
            if (SendMessageTimeout(hwnd, 0x84, IntPtr.Zero, packed, 2, 3000, out result) == IntPtr.Zero) throw new Exception("WM_NCHITTEST timed out");
            return unchecked((long)result.ToUInt64());
        } finally { SetThreadDpiAwarenessContext(previous); }
    }
}
'@
$request = Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
$results = foreach ($point in $request.points) {
    [pscustomobject]@{ name=$point.name; result=[OmiWindowHitTest]::Hit([long]$request.handle,[int]$point.x,[int]$point.y) }
}
ConvertTo-Json -InputObject @($results) -Compress
