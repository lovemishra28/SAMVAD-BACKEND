$content = Get-Content services/insightService.js -Raw

$content = $content -replace 'Senior: "seniorCitizens",', '"Senior Citizen": "seniorCitizens",'
$content | Set-Content services/insightService.js
