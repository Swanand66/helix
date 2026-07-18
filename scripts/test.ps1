$ErrorActionPreference = "Continue"

function Section($n, $title) {
  Write-Host ""
  Write-Host "===== $n. $title =====" -ForegroundColor Cyan
}

Section 1 "Unit tests (vitest)"
pnpm test

Section 2 "Build (tsup)"
pnpm build

Section 3 "Default table for 'hello world'"
node apps\cli\dist\index.js "hello world"

Section 4 "Compare gpt-4o vs claude-4.5-sonnet vs gemini-2.5-pro"
node apps\cli\dist\index.js compare "explain quantum tunneling" --models gpt-4o,claude-4.5-sonnet,gemini-2.5-pro

Section 5 "Batch cost estimate (gpt-4o x 10,000)"
node apps\cli\dist\index.js cost gpt-4o --n 10000 --in 800 --out 400

Section 6 "Budget check (under budget)"
node apps\cli\dist\index.js budget "hello world" --model gpt-4o --max 0.01

Section 7 "Budget check (over budget)"
$long = "word " * 2000
node apps\cli\dist\index.js budget $long --model claude-4.5-opus --max 0.001

Section 8 "Prices rate card"
node apps\cli\dist\index.js prices

Section 9 "JSON output"
node apps\cli\dist\index.js "hi" --json | ConvertFrom-Json | Format-Table -AutoSize

Section 10 "Stdin input"
"explain quantum tunneling in three paragraphs" | node apps\cli\dist\index.js

Section 11 "File input"
Set-Content -Path _test-prompt.txt -Value "explain quantum tunneling in detail"
node apps\cli\dist\index.js --file _test-prompt.txt
Remove-Item _test-prompt.txt -Force

Section 12 "Bundle sizes"
Get-ChildItem packages\core\dist\index.js, packages\prices\dist\index.js, apps\cli\dist\index.js |
  Select-Object @{n="File";e={$_.FullName.Replace((Get-Location).Path + "\","")}}, @{n="KB";e={"{0:N2}" -f ($_.Length / 1024)}} |
  Format-Table -AutoSize

Write-Host ""
Write-Host "===== ALL DONE =====" -ForegroundColor Green
