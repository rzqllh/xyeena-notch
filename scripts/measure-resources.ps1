# Measure resources for Xyeena Island
param (
    [string]$ProcessName = "xyeena-island",
    [int]$SampleDurationSeconds = 5
)

$hostProc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $hostProc) {
    Write-Warning "Process '$ProcessName' is not currently running."
    Write-Output "U - needs host measurement: Launch xyeena-island.exe and run powershell -File scripts/measure-resources.ps1"
    exit 0
}

function Get-DescendantProcesses([int]$parentId) {
    $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $parentId }
    $all = @($children)
    foreach ($child in $children) {
        $grand = Get-DescendantProcesses -parentId $child.ProcessId
        if ($grand) {
            $all += $grand
        }
    }
    return $all
}

$descendants = Get-DescendantProcesses -parentId $hostProc.Id
$descendantPids = $descendants | ForEach-Object { $_.ProcessId } | Select-Object -Unique

$hostDetails = Get-Process -Id $hostProc.Id
$childProcs = if ($descendantPids) { @(Get-Process -Id $descendantPids -ErrorAction SilentlyContinue) } else { @() }

$hostWsMb = [math]::Round($hostDetails.WorkingSet64 / 1MB, 2)
$hostPrivMb = [math]::Round($hostDetails.PrivateMemorySize64 / 1MB, 2)

$childWsMb = 0.0
$childPrivMb = 0.0
$childList = @()

foreach ($cp in $childProcs) {
    $ws = [math]::Round($cp.WorkingSet64 / 1MB, 2)
    $pm = [math]::Round($cp.PrivateMemorySize64 / 1MB, 2)
    $childWsMb += $ws
    $childPrivMb += $pm
    $childList += [PSCustomObject]@{
        ProcessId = $cp.Id
        Name = $cp.ProcessName
        WorkingSetMB = $ws
        PrivateMemoryMB = $pm
    }
}

$totalWsMb = [math]::Round($hostWsMb + $childWsMb, 2)
$totalPrivMb = [math]::Round($hostPrivMb + $childPrivMb, 2)

Write-Output "Measuring CPU over $SampleDurationSeconds seconds sampling..."
$cpuStartHost = $hostDetails.TotalProcessorTime.TotalSeconds
$cpuStartChildren = @{}
foreach ($cp in $childProcs) {
    $cpuStartChildren[$cp.Id] = $cp.TotalProcessorTime.TotalSeconds
}
$timeStart = [DateTime]::UtcNow

Start-Sleep -Seconds $SampleDurationSeconds

$hostDetailsEnd = Get-Process -Id $hostProc.Id
$cpuEndHost = $hostDetailsEnd.TotalProcessorTime.TotalSeconds
$timeEnd = [DateTime]::UtcNow
$totalElapsedSec = ($timeEnd - $timeStart).TotalSeconds
$cpuCoreCount = [Environment]::ProcessorCount

$hostCpuPercent = [math]::Round((($cpuEndHost - $cpuStartHost) / ($totalElapsedSec * $cpuCoreCount)) * 100, 2)

$childCpuTotalSec = 0.0
foreach ($cp in $childProcs) {
    $cpEnd = Get-Process -Id $cp.Id -ErrorAction SilentlyContinue
    if ($cpEnd -and $cpuStartChildren.ContainsKey($cp.Id)) {
        $childCpuTotalSec += ($cpEnd.TotalProcessorTime.TotalSeconds - $cpuStartChildren[$cp.Id])
    }
}
$childCpuPercent = [math]::Round(($childCpuTotalSec / ($totalElapsedSec * $cpuCoreCount)) * 100, 2)
$totalCpuPercent = [math]::Round($hostCpuPercent + $childCpuPercent, 2)

$count = $childProcs.Count
$subWs = [math]::Round($childWsMb, 2)
$subPriv = [math]::Round($childPrivMb, 2)

Write-Output ""
Write-Output "=== Xyeena Island Resource Measurement ==="
Write-Output "Sample Duration: $SampleDurationSeconds s | Cores: $cpuCoreCount"
Write-Output ""
Write-Output "Host Process: $($hostProc.ProcessName) (PID $($hostProc.Id))"
Write-Output "  Working Set   : $hostWsMb MB"
Write-Output "  Private Memory: $hostPrivMb MB"
Write-Output "  CPU Usage     : $hostCpuPercent %"
Write-Output ""
Write-Output "WebView2 Process Tree ($count processes):"
foreach ($item in $childList) {
    Write-Output "  - PID $($item.ProcessId) | $($item.Name) | WS: $($item.WorkingSetMB) MB | Priv: $($item.PrivateMemoryMB) MB"
}
Write-Output "  Subtotal Working Set   : $subWs MB"
Write-Output "  Subtotal Private Memory: $subPriv MB"
Write-Output "  Subtotal CPU Usage     : $childCpuPercent %"
Write-Output ""
Write-Output "Combined Totals (Host + WebView2 Tree):"
Write-Output "  Total Working Set   : $totalWsMb MB"
Write-Output "  Total Private Memory: $totalPrivMb MB"
Write-Output "  Total CPU Usage     : $totalCpuPercent %"
Write-Output "==========================================="
