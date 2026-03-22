const fs = require('fs');
let code = fs.readFileSync('controllers/boothController.js', 'utf8');

code = code.replace(/const Booth = require\([^)]+\);/, "const Booth = require('../models/Booth');\nconst Voter = require('../models/Voter');");

code = code.replace('const booths = await Booth.find({}).lean();', `const booths = await Booth.find({}).lean();
    const counts = await Voter.aggregate([{ $group: { _id: '$boothId', count: { $sum: 1 } } }]);
    const countMap = counts.reduce((acc, curr) => { acc[curr._id] = curr.count; return acc; }, {});
    booths.forEach(b => { if (countMap[b.id] !== undefined) b.voterCount = countMap[b.id]; });`);

code = code.replace(/const booth = await Booth\.findOne\([^)]+\)\.lean\(\);[\s\S]*?if \(!booth\) \{[\s\S]*?\}[\s\S]*?res\.json\(\{ success: true, booth \}\);/, `const booth = await Booth.findOne({ id: boothId }).lean();
    if (!booth) {
      return res.status(404).json({ success: false, message: 'Booth not found' });
    }
    booth.voterCount = await Voter.countDocuments({ boothId });
    res.json({ success: true, booth });`);

fs.writeFileSync('controllers/boothController.js', code);
console.log('Fixed boothController.js');