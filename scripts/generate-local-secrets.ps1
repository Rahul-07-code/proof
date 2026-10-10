$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localEnvPath = Join-Path $projectRoot '.env.local'
if (-not (Test-Path -LiteralPath $localEnvPath)) { throw '.env.local is missing; provision the local database first.' }

$content = Get-Content -LiteralPath $localEnvPath -Raw
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    foreach ($entry in @(@{ Key = 'SESSION_SECRET'; Placeholder = 'replace-with-at-least-32-random-characters'; Bytes = 32 }, @{ Key = 'GITHUB_TOKEN_ENCRYPTION_KEY'; Placeholder = '32-byte-hex-key'; Bytes = 32 })) {
        $match = [regex]::Match($content, "(?m)^$($entry.Key)=(.*)$")
        if (-not $match.Success) { throw "Missing $($entry.Key) in .env.local." }
        if ($match.Groups[1].Value -eq $entry.Placeholder) {
            $bytes = [byte[]]::new($entry.Bytes)
            $random.GetBytes($bytes)
            $secret = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
            [Array]::Clear($bytes, 0, $bytes.Length)
            $content = [regex]::Replace($content, "(?m)^$($entry.Key)=.*$", "$($entry.Key)=$secret")
        }
    }
} finally { $random.Dispose() }
[IO.File]::WriteAllText($localEnvPath, $content, [Text.UTF8Encoding]::new($false))
Write-Output 'Generated missing session and token-encryption secrets in ignored .env.local; existing configured values were preserved.'
