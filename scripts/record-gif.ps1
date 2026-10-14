<#
  Records the Claude desktop app's window to a looping GIF for the README.

  The app draws on the GPU, so grabbing the window by its title gives black frames;
  this grabs the window's area of the screen instead (keep it in front while recording).

  .\scripts\record-gif.ps1 -Seconds 20 -Name hero                     # the whole window
  .\scripts\record-gif.ps1 -Seconds 12 -Name panel -Crop panel        # the Crewdeck panel only
  .\scripts\record-gif.ps1 -FromVideo docs\raw\hero.mkv -Start 4 -Seconds 18 -Name hero   # re-encode a take

  Frame rate: the crabs flip 8 frames a second, so 16 fps shows every crab frame twice and
  keeps the walk even (GIF delays are in hundredths: 6/7 alternating).
#>
param(
  [double]$Seconds = 15,
  [string]$Name = 'capture',
  [ValidateSet('window', 'panel', 'chat')][string]$Crop = 'window',
  [int]$Fps = 16,
  [int]$Width = 0,
  [int]$Delay = 3,
  [string]$FromVideo = '',
  [double]$Start = 0,
  [string]$Out = (Join-Path $PSScriptRoot '..\docs')
)
$ErrorActionPreference = 'Stop'
$links = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'
$ffmpeg = if (Get-Command ffmpeg -ErrorAction SilentlyContinue) { 'ffmpeg' } else { Join-Path $links 'ffmpeg.exe' }

$raw = Join-Path $Out 'raw'
New-Item -ItemType Directory -Force $raw | Out-Null

if (-not $FromVideo) {
  Add-Type @'
using System; using System.Runtime.InteropServices;
public class CrewWin { [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; }
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out R r, int s); }
'@
  $h = (Get-Process claude | Where-Object MainWindowTitle -eq 'Claude' | Select-Object -First 1).MainWindowHandle
  if (-not $h) { throw 'The Claude window is not open.' }
  $r = New-Object CrewWin+R
  [CrewWin]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) | Out-Null  # the visible frame, no shadow
  $w = ($r.Ri - $r.L) -band -2; $hgt = ($r.B - $r.T) -band -2
  for ($i = $Delay; $i -gt 0; $i--) { Write-Host "Recording in $i..."; Start-Sleep 1 }
  Write-Host "Recording $Seconds s of ${w}x$hgt at ($($r.L),$($r.T))"
  $FromVideo = Join-Path $raw "$Name.mkv"
  & $ffmpeg -y -v error -f gdigrab -framerate 30 -draw_mouse 0 -offset_x $r.L -offset_y $r.T -video_size "${w}x$hgt" `
    -t $Seconds -i desktop -c:v libx264rgb -preset ultrafast -crf 0 $FromVideo
  $Start = 0
}

# Where the panel starts: the app docks it on the right, about 60% of the window in.
$cropF = switch ($Crop) {
  'panel' { 'crop=iw*0.40:ih-38:iw*0.60:38,' }
  'chat'  { 'crop=iw*0.60:ih:0:0,' }
  default { '' }
}
if (-not $Width) { $Width = if ($Crop -eq 'window') { 1280 } else { 640 } }
$gif = Join-Path $Out "$Name.gif"
$vf = "${cropF}fps=$Fps,scale=${Width}:-2:flags=lanczos"
$trim = @('-ss', $Start, '-t', $Seconds)
& $ffmpeg -y -v error @trim -i $FromVideo -vf "$vf,palettegen=max_colors=192:stats_mode=diff" (Join-Path $raw "$Name-palette.png")
& $ffmpeg -y -v error @trim -i $FromVideo -i (Join-Path $raw "$Name-palette.png") `
  -lavfi "$vf[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 $gif
$kb = [math]::Round((Get-Item $gif).Length / 1KB)
Write-Host "Wrote $gif ($kb KB)"
