$content = Get-Content ml/classifier_service.py -Raw
$content = $content -replace '\["student", "youth", "skill", "job", "apprentice", "education"\]', '["student", "youth", "job", "education"]'
$content | Set-Content ml/classifier_service.py
