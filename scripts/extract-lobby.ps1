$htmlPath = 'f:\GitHub\grudge-arena\index.html'
$lobbyPath = 'f:\GitHub\grudge-arena\src\lobby.js'

# Read original index.html from git
$raw = git -C 'f:\GitHub\grudge-arena' show HEAD:index.html
$rawStr = $raw -join "`n"

$scriptOpen = '<script type="module">'
$scriptClose = '</script>'
$startIdx = $rawStr.IndexOf($scriptOpen) + $scriptOpen.Length
$endIdx = $rawStr.LastIndexOf($scriptClose)
$scriptContent = $rawStr.Substring($startIdx, $endIdx - $startIdx)

[System.IO.File]::WriteAllText($lobbyPath, $scriptContent, [System.Text.Encoding]::UTF8)
Write-Host "lobby.js written, length: $($scriptContent.Length)"

# Also fix index.html (already done, but verify)
$before = $rawStr.Substring(0, $rawStr.IndexOf($scriptOpen))
$after = $rawStr.Substring($endIdx + $scriptClose.Length)
$newHtml = $before + '<script type="module" src="/src/lobby.js"></script>' + $after
[System.IO.File]::WriteAllText($htmlPath, $newHtml, [System.Text.Encoding]::UTF8)
Write-Host "index.html fixed, length: $($newHtml.Length)"
