import csv
from pathlib import Path
path = Path('data/VotersData.csv')
rows = []
with path.open(newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        if row.get('area_type', '').strip().lower() == 'rural':
            row['Occupation'] = ''
            row['Interests'] = ''
        rows.append(row)

with path.open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f'Updated {len(rows)} rows in {path}')
