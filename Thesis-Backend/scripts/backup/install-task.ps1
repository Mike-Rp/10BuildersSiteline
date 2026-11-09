# Schedules the backup in Windows Task Scheduler. Run once, in a PowerShell window opened as Administrator.
#
#   .\install-task.ps1                       nightly at 02:00, and a check for Admin requests every 5 minutes
#   .\install-task.ps1 -Time "03:30"         another nightly time
#   .\install-task.ps1 -Remove               remove both schedules
#
# Two tasks are created:
#   SITELINE Nightly Backup          every day: asks the website for the nightly run, backs up, and reports
#   SITELINE Backup Request Check    every 5 minutes: does nothing unless an Admin pressed "Run backup request"
# Both run as you, whether or not you are signed in, without storing your Windows password. A missed nightly run
# starts as soon as the PC is back on, and the PC is woken for it when Windows allows.
param(
  [string]$Time = "02:00",
  [string]$Config = "C:\siteline-backups\config\backup.env",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$nightlyName = "SITELINE Nightly Backup"
$pollName = "SITELINE Backup Request Check"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Open PowerShell as Administrator (right-click, Run as administrator) and run this again." }

if ($Remove) {
  foreach ($name in @($nightlyName, $pollName)) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue }
  Write-Host "Removed the scheduled tasks '$nightlyName' and '$pollName'."
  return
}

if (-not (Test-Path $Config)) { throw "The settings file was not found: $Config" }
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $PSScriptRoot "nightly-backup.js"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

# Nightly run.
$nightlyAction = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --scheduled --config `"$Config`"" -WorkingDirectory $PSScriptRoot
$nightlyTrigger = New-ScheduledTaskTrigger -Daily -At $Time
$nightlySettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nightlyName -Action $nightlyAction -Trigger $nightlyTrigger -Settings $nightlySettings -Principal $principal -Force | Out-Null

# Request check, every 5 minutes. It only acts when an Admin has asked for a backup.
$pollAction = New-ScheduledTaskAction -Execute $node -Argument "`"$script`" --poll --config `"$Config`"" -WorkingDirectory $PSScriptRoot
$pollTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$pollSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $pollName -Action $pollAction -Trigger $pollTrigger -Settings $pollSettings -Principal $principal -Force | Out-Null

Write-Host "Scheduled '$nightlyName' every day at $Time."
Write-Host "Scheduled '$pollName' every 5 minutes."
Write-Host "Check them with:  Get-ScheduledTaskInfo -TaskName '$nightlyName'"
Write-Host "Run the nightly one now with:  Start-ScheduledTask -TaskName '$nightlyName'"
