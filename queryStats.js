const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1/samvad').then(async () => {
    const Voter = require('./models/Voter');
    
    const count = await Voter.aggregate([
        { $group: { _id: { boothId: '$boothId', occupation: '$occupation' }, count: { $sum: 1 } } }
    ]);
    
    console.log("Raw occupations:");
    console.log(count.filter(a => a.count === 42 || a.count === 43 || a.count === 215 || a.count === 93));

    const booths = await Voter.aggregate([
        { $group: { _id: '$boothId', count: { $sum: 1 } } }
    ]);
    console.log("\nTotal per booth:");
    console.log(booths.filter(b => b.count === 351 || b.count === 364));
    
    process.exit(0);
});