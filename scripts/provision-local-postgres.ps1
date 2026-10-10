$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$examplePath = Join-Path $projectRoot '.env.example'
$localEnvPath = Join-Path $projectRoot '.env.local'
$psqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$secureAdminPassword = $null
$adminPassword = $null

if (-not (Test-Path -LiteralPath $psqlPath)) { throw 'PostgreSQL 18 psql.exe was not found at the standard installation path.' }
if (-not (Test-Path -LiteralPath $examplePath)) { throw '.env.example is missing.' }
if (Test-Path -LiteralPath $localEnvPath) { throw '.env.local already exists; refusing to overwrite local credentials.' }

$secureAdminPassword = Read-Host 'Enter the local PostgreSQL administrator password (hidden input)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)
try {
    $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
$env:PGPASSWORD = $adminPassword

try {
    $query = "SELECT current_user || '|' || current_database() || '|' || COALESCE((SELECT string_agg(name, ',') FROM (SELECT rolname AS name FROM pg_roles WHERE rolname IN ('proof_app','proof_migrator') UNION ALL SELECT datname AS name FROM pg_database WHERE datname='proof_of_skill') AS existing), 'NONE');"
    $identity = & $psqlPath -X -w -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c $query
    if ($LASTEXITCODE -ne 0) { throw 'Could not authenticate to the local PostgreSQL server or inspect the requested names.' }
    $identityParts = ([string]$identity).Trim().Split('|', 3)
    if ($identityParts.Count -lt 3) { throw 'PostgreSQL returned an unexpected inspection result; no changes were made.' }
    $existingTargets = $identityParts[2]
    if ($existingTargets -ne 'NONE') {
        throw "Existing target database/role name(s) found ($existingTargets). No roles, passwords, database, or data were changed. Inspect them in pgAdmin before continuing."
    }

    $appBytes = [byte[]]::new(32)
    $migrationBytes = [byte[]]::new(32)
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $random.GetBytes($appBytes)
    $random.GetBytes($migrationBytes)
    $random.Dispose()
    $appPassword = [BitConverter]::ToString($appBytes).Replace('-', '').ToLowerInvariant()
    $migrationPassword = [BitConverter]::ToString($migrationBytes).Replace('-', '').ToLowerInvariant()
    [Array]::Clear($appBytes, 0, $appBytes.Length)
    [Array]::Clear($migrationBytes, 0, $migrationBytes.Length)

    $createRoles = @"
CREATE ROLE proof_migrator LOGIN PASSWORD '$migrationPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE proof_app LOGIN PASSWORD '$appPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
"@
    $createRoles | & $psqlPath -X -w -q -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Role creation failed. No existing database or role was modified.' }

    & $psqlPath -X -w -q -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE proof_of_skill OWNER proof_migrator;'
    if ($LASTEXITCODE -ne 0) { throw 'Database creation failed. The newly-created roles were left intact; inspect PostgreSQL before retrying.' }

    & $psqlPath -X -w -q -h 127.0.0.1 -p 5432 -U postgres -d proof_of_skill -v ON_ERROR_STOP=1 -c 'GRANT CONNECT ON DATABASE proof_of_skill TO proof_app; GRANT USAGE ON SCHEMA public TO proof_app;'
    if ($LASTEXITCODE -ne 0) { throw 'Runtime database grants failed. Inspect the new database before retrying.' }

    $envLines = Get-Content -LiteralPath $examplePath -Raw
    $envLines = [regex]::Replace($envLines, '(?m)^DATABASE_URL=.*$', "DATABASE_URL=postgresql://proof_app:$appPassword@127.0.0.1:5432/proof_of_skill")
    $envLines = [regex]::Replace($envLines, '(?m)^MIGRATION_DATABASE_URL=.*$', "MIGRATION_DATABASE_URL=postgresql://proof_migrator:$migrationPassword@127.0.0.1:5432/proof_of_skill")
    $envLines = [regex]::Replace($envLines, '(?m)^APP_DB_ROLE=.*$', 'APP_DB_ROLE=proof_app')
    [IO.File]::WriteAllText($localEnvPath, $envLines, [Text.UTF8Encoding]::new($false))
    Write-Output 'Created proof_of_skill and separate least-privilege roles. Generated credentials were written only to ignored .env.local.'
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    $adminPassword = $null
    if ($secureAdminPassword) { $secureAdminPassword.Dispose() }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
