param([Parameter(Mandatory=$true)][int]$ParentPid, [switch]$CompileOnly, [string]$PreviewDirectory, [switch]$SyntheticUia, [switch]$FeedbackRegression)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  $names = @('System','System.Core','System.Drawing','System.Web.Extensions','System.Xaml','WindowsBase','PresentationCore','PresentationFramework','UIAutomationClient','UIAutomationTypes')
  $refs = foreach ($name in $names) { $a = [Reflection.Assembly]::LoadWithPartialName($name); if (!$a) { throw 'Missing framework assembly' }; $a.Location }
  $sources = @((Join-Path $PSScriptRoot 'Native.cs'), (Join-Path $PSScriptRoot 'InputArbiter.cs'), (Join-Path $PSScriptRoot 'Foreground.cs'), (Join-Path $PSScriptRoot 'Overlay.cs'), (Join-Path $PSScriptRoot 'Server.cs'))
  if ($CompileOnly -and $SyntheticUia) {
    $refs += [Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms').Location
    $sources += (Join-Path $PSScriptRoot '..\tests\fixtures\HiddenUia.cs')
  }
  if ($CompileOnly -and $FeedbackRegression) { $sources += @((Join-Path $PSScriptRoot '..\tests\fixtures\FeedbackRegression.cs'), (Join-Path $PSScriptRoot '..\tests\fixtures\ForegroundRegression.cs')) }
  Add-Type -Path $sources -ReferencedAssemblies $refs -ErrorAction Stop -IgnoreWarnings
  if ($CompileOnly) {
    if ($FeedbackRegression) { [Console]::WriteLine([MK.Verification.FeedbackRegression]::Run()); exit 0 }
    if ($SyntheticUia) { [Console]::WriteLine([MK.Verification.HiddenUia]::Run()); exit 0 }
    if ($PreviewDirectory) { [MK.Overlay]::RenderPreview((Join-Path $PSScriptRoot '..\assets\deepseek.path.txt'), $PreviewDirectory) }
    [Console]::WriteLine([MK.Native]::SelfTest()); exit 0
  }
  [MK.Server]::Run($ParentPid, (Join-Path $PSScriptRoot '..\assets\deepseek.path.txt'))
} catch {
  if ($CompileOnly) { [Console]::Error.WriteLine($_.Exception.Message) }
  # Never emit compiler source, native window text, paths, or request payloads.
  [Console]::Error.WriteLine('MK_HELPER_BOOT_FAILED: ' + $_.Exception.GetType().Name)
  exit 1
}
