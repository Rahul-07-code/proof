$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localEnvPath = Join-Path $projectRoot '.env.local'
if (-not (Test-Path -LiteralPath $localEnvPath)) { throw '.env.local is missing; provision local PostgreSQL first.' }

$clientId = (Read-Host 'GitHub OAuth Client ID').Trim()
if ([string]::IsNullOrWhiteSpace($clientId)) { throw 'Client ID is required.' }
$secretSecure = Read-Host 'GitHub OAuth Client Secret (hidden input)' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
try { $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
if ([string]::IsNullOrWhiteSpace($clientSecret)) { throw 'Client Secret is required.' }

$reviewerLogins = (Read-Host 'Trusted reviewer GitHub login(s), comma-separated').Trim()
$recruiterLogins = (Read-Host 'Optional recruiter GitHub login(s), comma-separated').Trim()
$collegeLogins = (Read-Host 'Optional college administrator GitHub login(s), comma-separated').Trim()
$lines = [Collections.Generic.List[string]]::new()
foreach ($line in (Get-Content -LiteralPath $localEnvPath)) { $lines.Add($line) }
$values = @{
    GITHUB_CLIENT_ID = $clientId
    GITHUB_CLIENT_SECRET = $clientSecret
    GITHUB_CALLBACK_URL = 'http://localhost:3000/api/auth/github/callback'
    APP_BASE_URL = 'http://localhost:3000'
}
if ($reviewerLogins) { $values.REVIEWER_GITHUB_LOGINS = $reviewerLogins }
if ($recruiterLogins) { $values.RECRUITER_GITHUB_LOGINS = $recruiterLogins }
if ($collegeLogins) { $values.COLLEGE_GITHUB_LOGINS = $collegeLogins }
foreach ($key in $values.Keys) {
    $replacement = "$key=$([string]$values[$key])"
    $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].StartsWith("$key=", [StringComparison]::Ordinal)) {
            $lines[$index] = $replacement
            $found = $true
            break
        }
    }
    if (-not $found) { $lines.Add($replacement) }
}
[IO.File]::WriteAllText($localEnvPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
$clientSecret = $null
$secretSecure.Dispose()
Write-Output 'GitHub OAuth settings saved to ignored .env.local. The Client Secret was not echoed.'
