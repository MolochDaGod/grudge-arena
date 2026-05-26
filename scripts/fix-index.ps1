$path = 'f:\GitHub\grudge-arena\index.html'
$raw = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$scriptOpen = '<script type="module">'
$scriptClose = '</script>'
$startIdx = $raw.IndexOf($scriptOpen)
$endIdx = $raw.LastIndexOf($scriptClose) + $scriptClose.Length
$before = $raw.Substring(0, $startIdx)
$after = $raw.Substring($endIdx)
$newHtml = $before + '<script type="module" src="/src/lobby.js"></script>' + $after
[System.IO.File]::WriteAllText($path, $newHtml, [System.Text.Encoding]::UTF8)
Write-Host "Done. New index.html length: $($newHtml.Length)"
