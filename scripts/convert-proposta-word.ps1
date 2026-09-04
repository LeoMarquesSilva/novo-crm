param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
if ($env:NODE_ENV -ne 'development') { throw 'Word desktop conversion is development-only.' }
$proposalInput = [System.IO.Path]::GetFullPath($InputPath)
$proposalOutput = [System.IO.Path]::GetFullPath($OutputPath)
if ([System.IO.Path]::GetExtension($proposalInput) -ne '.docx' -or [System.IO.Path]::GetExtension($proposalOutput) -ne '.pdf') { throw 'Invalid conversion extensions.' }
$proposalMutex = New-Object System.Threading.Mutex($false, 'Local\BpProposalWordConverter')
$proposalLock = $false
$wordApp = $null
$wordDoc = $null
$proposalPreviousUpdateLinks = $null
try {
    try { $proposalLock = $proposalMutex.WaitOne(45000) } catch [System.Threading.AbandonedMutexException] { $proposalLock = $true }
    if (-not $proposalLock) { throw 'Word conversion queue timed out.' }
    $wordApp = New-Object -ComObject Word.Application
    $wordApp.Visible = $false
    $wordApp.DisplayAlerts = 0
    $wordApp.AutomationSecurity = 3
    $proposalPreviousUpdateLinks = $wordApp.Options.UpdateLinksAtOpen
    $wordApp.Options.UpdateLinksAtOpen = $false
    # ConfirmConversions=false, ReadOnly=true, AddToRecentFiles=false.
    $wordDoc = $wordApp.Documents.Open($proposalInput, $false, $true, $false)
    $wordDoc.ExportAsFixedFormat($proposalOutput, 17)
} finally {
    if ($null -ne $wordDoc) { try { $wordDoc.Close(0) } catch {} }
    if ($null -ne $wordApp) {
        if ($null -ne $proposalPreviousUpdateLinks) { try { $wordApp.Options.UpdateLinksAtOpen = $proposalPreviousUpdateLinks } catch {} }
        try { $wordApp.Quit(0) } catch {}
    }
    if ($proposalLock) { $proposalMutex.ReleaseMutex() }
    $proposalMutex.Dispose()
}
