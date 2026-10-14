param([ValidateSet('Archive', 'Verify', 'Restore')][string]$Mode = 'Verify')
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'archive/legacy-2026-10-14'))
$manifestPath = Join-Path $archiveRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

function Resolve-CheckedPath([string]$relativePath, [string]$boundary) {
    if ([IO.Path]::IsPathRooted($relativePath)) { throw "Expected relative path: $relativePath" }
    $absolutePath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relativePath))
    $prefix = $boundary.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $absolutePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes intended directory: $relativePath"
    }
    $ancestor = $absolutePath
    while ($ancestor -and $ancestor.Length -ge $workspaceRoot.Length) {
        if (Test-Path -LiteralPath $ancestor) {
            if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing reparse point: $ancestor"
            }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    return $absolutePath
}
function Assert-Hash([string]$path, [string]$expected) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing file: $path" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
        throw "File changed; refusing operation: $path"
    }
}
function Save-Manifest {
    $tempPath = Join-Path $archiveRoot 'manifest.next.json'
    $manifest | ConvertTo-Json -Depth 35 | Set-Content -LiteralPath $tempPath -Encoding utf8
    Move-Item -LiteralPath $tempPath -Destination $manifestPath -Force
}
$originalPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$destinationPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$operations = @($manifest.entries | ForEach-Object {
    $original = Resolve-CheckedPath $_.original $workspaceRoot
    $archived = Resolve-CheckedPath $_.archived $archiveRoot
    if (-not $originalPaths.Add($original) -or -not $destinationPaths.Add($archived)) { throw 'Duplicate manifest entry' }
    [PSCustomObject]@{ Entry = $_; Original = $original; Archived = $archived }
})
if ($Mode -eq 'Archive') {
    if ($manifest.status -ne 'planned') { throw "Archive must be planned, was $($manifest.status)" }
    foreach ($op in $operations) {
        Assert-Hash $op.Original $op.Entry.sha256
        if (Test-Path -LiteralPath $op.Archived) { throw "Destination already exists: $($op.Archived)" }
    }
} elseif ($Mode -eq 'Restore') {
    if ($manifest.status -ne 'archived') { throw "Archive must be archived, was $($manifest.status)" }
    foreach ($op in $operations) {
        Assert-Hash $op.Archived $op.Entry.sha256
        if (Test-Path -LiteralPath $op.Original) { throw "Restore would overwrite: $($op.Original)" }
    }
}
# Full preflight before any move: active code, media, editable Blender sources and saved user data must be unchanged.
foreach ($file in $manifest.checks.protectedFiles) {
    Assert-Hash (Resolve-CheckedPath $file.path $workspaceRoot) $file.sha256
}
if ($Mode -ne 'Verify') {
    $manifest.status = if ($Mode -eq 'Archive') { 'archiving' } else { 'restoring' }
    $manifest | Add-Member -NotePropertyName completedMoves -NotePropertyValue @() -Force
    Save-Manifest
    foreach ($op in $operations) {
        $source = if ($Mode -eq 'Archive') { $op.Original } else { $op.Archived }
        $target = if ($Mode -eq 'Archive') { $op.Archived } else { $op.Original }
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        Move-Item -LiteralPath $source -Destination $target
        Assert-Hash $target $op.Entry.sha256
        $manifest.completedMoves = @($manifest.completedMoves) + $op.Entry.original
        Save-Manifest
    }
    $manifest.status = if ($Mode -eq 'Archive') { 'archived' } else { 'restored' }
    Save-Manifest
}
foreach ($op in $operations) {
    $expectedPath = if ($manifest.status -eq 'restored') { $op.Original } else { $op.Archived }
    $absentPath = if ($manifest.status -eq 'restored') { $op.Archived } else { $op.Original }
    Assert-Hash $expectedPath $op.Entry.sha256
    if (Test-Path -LiteralPath $absentPath) { throw "Unexpected duplicate: $absentPath" }
}
foreach ($dependency in $manifest.checks.imports) {
    if (-not (Test-Path -LiteralPath (Resolve-CheckedPath $dependency.target $workspaceRoot))) {
        throw "New broken import: $($dependency.source) -> $($dependency.target)"
    }
}
foreach ($file in $manifest.checks.protectedFiles) {
    Assert-Hash (Resolve-CheckedPath $file.path $workspaceRoot) $file.sha256
}
$result = [PSCustomObject]@{
    status = $manifest.status; archivedFiles = $manifest.fileCount; bytes = $manifest.bytes
    verifiedProtectedFiles = @($manifest.checks.protectedFiles).Count
    verifiedExistingImports = @($manifest.checks.imports).Count
    preexistingMissingImports = $manifest.checks.preexistingMissingImports
}
$result | ConvertTo-Json -Depth 6
