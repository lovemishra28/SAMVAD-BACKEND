const fs = require('fs');
const path = './data/VotersData.csv';
const backupPath = './data/VotersData.backup.csv';
fs.copyFileSync(path, backupPath);
const text = fs.readFileSync(path, 'utf8');
const lines = text.split(/\r?\n/);
if (!lines[0].startsWith('name,age,gender,booth_id,address')) {
  throw new Error('Unexpected header: ' + lines[0]);
}
const out = [lines[0] + ',mobileNumber'];
for (let i = 1; i < lines.length; i++) {
  const row = lines[i].trim();
  if (!row) continue;
  const num = 7000000000 + (i - 1);
  const mobile = ('0000000000' + num).slice(-10);
  out.push(row + ',' + mobile);
}
fs.writeFileSync(path, out.join('\n'), 'utf8');
console.log('updated rows', out.length-1);
