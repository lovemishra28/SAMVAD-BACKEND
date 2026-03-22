$file1 = 'controllers/boothController.js'
$content = Get-Content $file1 -Raw
$content = $content -replace 'const booths = await Booth.find\(\{\}\)\.lean\(\);', "const booths = await Booth.find({}).lean();
    const counts = await require('../models/Voter').aggregate([{ $group: { _id: '$boothId', count: { $sum: 1 } } }]);
    const countMap = counts.reduce((acc, curr) => { acc[curr._id] = curr.count; return acc; }, {});
    booths.forEach(b => { if (countMap[b.id]) b.voterCount = countMap[b.id]; });"
$content = $content -replace 'const booth = await Booth.findOne\(\{ id: boothId \}\)\.lean\(\);([^i]*?)if \(!booth\) \{', "const booth = await Booth.findOne({ id: boothId }).lean();
    if (booth) booth.voterCount = await require('../models/Voter').countDocuments({ boothId });
$1if (!booth) {"
$content | Set-Content $file1

$file2 = 'services/boothService.js'
$content = Get-Content $file2 -Raw
$content = $content -replace '  processed\.forEach\(\(v\) => \{', "  processed.forEach((v) => {
    if (v.gender && v.gender.toLowerCase() === 'female') {
      if (!grouped['Women']) grouped['Women'] = [];
      grouped['Women'].push(v);
    }"
$content | Set-Content $file2

$file3 = 'services/insightService.js'
$content = Get-Content $file3 -Raw
$content = $content -replace 'return Object\.values\(groupedByCategory\)\.flat\(\);', "const all = Object.values(groupedByCategory).flat();
  const unique = new Map();
  all.forEach((v) => unique.set(v._id?.toString() || v.id || v.mobileNumber, v));
  return Array.from(unique.values());"
$content | Set-Content $file3

$file4 = 'controllers/notificationController.js'
$content = Get-Content $file4 -Raw
$content = $content -replace 'Workers: "Worker",', "Workers: "Worker",
  Women: "Women","
$content | Set-Content $file4

