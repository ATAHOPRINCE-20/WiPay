$f1 = "C:\Users\abaas\.gemini\antigravity-ide\brain\ad317662-c538-458b-9027-f044b2f928b7\media__1787297789975.png"
$f2 = "C:\Users\abaas\.gemini\antigravity-ide\brain\ad317662-c538-458b-9027-f044b2f928b7\media__1787297855428.jpg"

$b1 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f1))
$b2 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($f2))

Set-Content -Path "f:\WIPAY\scratch\b1.txt" -Value $b1
Set-Content -Path "f:\WIPAY\scratch\b2.txt" -Value $b2
Write-Host "SUCCESS!"
