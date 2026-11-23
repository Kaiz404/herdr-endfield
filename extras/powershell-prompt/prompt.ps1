# Endfield prompt for PowerShell 5.1 and 7.
#   // folder  branch ›
# The chevron is red after a failed command and dim otherwise. Colours are ANSI 16 only,
# so the terminal theme decides the hues. Branch comes from .git/HEAD (no git.exe call).
# Opt in by dot-sourcing this file from $PROFILE; see README.md beside it.

function global:Get-EfBranch([string]$dir) {
    while ($dir) {
        $git = Join-Path $dir '.git'
        $head = $null
        if (Test-Path -LiteralPath $git -PathType Container) {
            $head = Join-Path $git 'HEAD'
        } elseif (Test-Path -LiteralPath $git -PathType Leaf) {
            $line = [IO.File]::ReadAllText($git).Trim()
            if ($line.StartsWith('gitdir: ')) {
                $gitdir = $line.Substring(8)
                if (-not [IO.Path]::IsPathRooted($gitdir)) { $gitdir = Join-Path $dir $gitdir }
                $head = Join-Path $gitdir 'HEAD'
            }
        }
        if ($head -and (Test-Path -LiteralPath $head)) {
            $ref = [IO.File]::ReadAllText($head).Trim()
            if ($ref.StartsWith('ref: refs/heads/')) { return $ref.Substring(16) }
            return $ref.Substring(0, [Math]::Min(7, $ref.Length))
        }
        $dir = Split-Path -Parent $dir
    }
    return $null
}

function global:prompt {
    $failed = -not $?
    $exit = $global:LASTEXITCODE
    $e = [char]27
    $loc = $ExecutionContext.SessionState.Path.CurrentLocation
    $out = ''

    if ($loc.Provider.Name -eq 'FileSystem') {
        $path = $loc.ProviderPath
        $uri = 'file://' + [Environment]::MachineName + '/' + ($path -replace '\\', '/').TrimStart('/')
        $out += "$e]7;$uri$e\"
        $folder = if ($path.TrimEnd('\') -eq $HOME.TrimEnd('\')) { '~' } else { Split-Path -Leaf $path }
        if (-not $folder) { $folder = $path }
        $branch = Get-EfBranch $path
    } else {
        $folder = $loc.Path
        $branch = $null
    }

    $out += "$e[90m//$e[0m $e[1m$folder$e[0m"
    if ($branch) { $out += "  $e[90m$([char]0xE0A0)$e[0m $branch" }
    $mark = if ($failed) { "$e[31m" } else { "$e[90m" }
    $out += " $mark$([char]0x203A)$e[0m "

    $global:LASTEXITCODE = $exit
    return $out
}
