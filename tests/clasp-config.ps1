# Run: pwsh -File tests/clasp-config.ps1. No Google writes are performed.
$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot '../integrations/google-workspace'
$helper = Join-Path $bridge 'clasp.ps1'

& $helper -Action Push -WhatIf
& $helper -Action Version -Description 'Test version description' -WhatIf
& $helper -Action Deploy -VersionNumber 2 -Description 'Test deployment description' -WhatIf

function Assert-Rejected([scriptblock]$Run, [string]$Expected) {
    try { & $Run } catch {
        if ($_.Exception.Message -like "*$Expected*") { return }
        throw
    }
    throw "Expected rejection: $Expected"
}
Assert-Rejected { & $helper -Action Deploy -Description 'Missing version' -WhatIf } 'Provide -VersionNumber'
Assert-Rejected { & $helper -Action Version -WhatIf } 'Provide -Description'

# Test safeguards using isolated configuration copies, never the real settings.
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('ttt-clasp-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    foreach ($name in @('clasp.ps1', '.clasp.json', 'deployment.json', 'appsscript.json')) {
        Copy-Item -LiteralPath (Join-Path $bridge $name) -Destination (Join-Path $testRoot $name)
    }
    $copy = Join-Path $testRoot 'clasp.ps1'
    $configPath = Join-Path $testRoot 'deployment.json'
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $config.endpoint = 'https://script.google.com/macros/s/DIFFERENT/exec'
    $config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $configPath
    Assert-Rejected { & $copy -Action Deploy -VersionNumber 2 -Description 'Test' -WhatIf } 'deployment ID and /exec endpoint must match'
    Copy-Item -LiteralPath (Join-Path $bridge 'deployment.json') -Destination $configPath
    $manifestPath = Join-Path $testRoot 'appsscript.json'
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $manifest.webapp.access = 'MYSELF'
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath
    Assert-Rejected { & $copy -Action Push -WhatIf } 'Web App access settings differ'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        !(Split-Path $resolved -Leaf).StartsWith('ttt-clasp-test-')) {
        throw 'Temporary cleanup target is outside the test directory.'
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Output 'PASS: explicit deployment/version arguments; missing-input and endpoint/access guards; no remote mutations.'
