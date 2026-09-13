[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Status', 'Push', 'Version', 'Deploy')]
    [string]$Action,
    [string]$Description,
    [int]$VersionNumber
)

$ErrorActionPreference = 'Stop'
$project = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.clasp.json') -Raw | ConvertFrom-Json
$deployment = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.json') -Raw | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'appsscript.json') -Raw | ConvertFrom-Json

if (!$project.scriptId -or $project.scriptId -ne $deployment.scriptId) {
    throw 'The clasp Script ID must match the existing deployment project.'
}
if (!$deployment.deploymentId -or $deployment.endpoint -ne "https://script.google.com/macros/s/$($deployment.deploymentId)/exec") {
    throw 'The existing deployment ID and /exec endpoint must match.'
}
if ($manifest.webapp.executeAs -ne $deployment.webapp.executeAs -or
    $manifest.webapp.access -ne $deployment.webapp.access) {
    throw 'Web App access settings differ from the existing deployment. Restore the original manifest settings.'
}
if ($Action -in @('Version', 'Deploy') -and [string]::IsNullOrWhiteSpace($Description)) {
    throw 'Provide -Description for the version or deployment update.'
}
if ($Action -eq 'Deploy' -and $VersionNumber -lt 1) {
    throw 'Provide -VersionNumber from a completed Version command. No deployment or version will be created implicitly.'
}

# Select the installed CLI explicitly; this helper is also named clasp.ps1.
$cli = Get-Command clasp.cmd -CommandType Application -ErrorAction Stop
[string[]]$claspArguments = @(switch ($Action) {
    'Status'  { @('status') }
    'Push'    { @('push') }
    'Version' { @('version', $Description) }
    'Deploy'  { @('redeploy', $deployment.deploymentId, '--versionNumber', "$VersionNumber", '--description', $Description) }
})

Push-Location $PSScriptRoot
try {
    $target = if ($Action -eq 'Deploy') { $deployment.endpoint } else { $project.scriptId }
    if ($Action -eq 'Status' -or $PSCmdlet.ShouldProcess($target, "clasp $($claspArguments -join ' ')")) {
        & $cli.Source @claspArguments
        if ($LASTEXITCODE -ne 0) { throw "clasp $Action failed (exit $LASTEXITCODE)." }
    }
} finally {
    Pop-Location
}
