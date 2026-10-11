# Builds the browser demo and publishes it to the gh-pages branch, which GitHub Pages serves at
# https://virajvaidya0504-sys.github.io/Paisa/ . Run after changing the app: .\publish-demo.ps1
# The gh-pages branch holds build output only; your source stays on main.
$root = $PSScriptRoot

Push-Location "$root\frontend"
npm run build:demo
$built = ($LASTEXITCODE -eq 0)
Pop-Location
if (-not $built) { Write-Host "Demo build failed." -ForegroundColor Red; exit 1 }

$tmp = Join-Path $env:TEMP ("paisa-pages-" + [guid]::NewGuid())
Copy-Item "$root\frontend\dist-demo" $tmp -Recurse
New-Item "$tmp\.nojekyll" -ItemType File | Out-Null   # serve files as-is

$remote = git -C $root remote get-url origin
$name = git -C $root config user.name
$email = git -C $root config user.email
Push-Location $tmp
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Publish demo"
git push -f -q $remote gh-pages
$pushed = ($LASTEXITCODE -eq 0)
Pop-Location
Remove-Item $tmp -Recurse -Force

if ($pushed) { Write-Host "Published. It goes live in about a minute: https://virajvaidya0504-sys.github.io/Paisa/" -ForegroundColor Green }
else { Write-Host "Push failed. Are you signed in? Try: gh auth status" -ForegroundColor Red; exit 1 }
