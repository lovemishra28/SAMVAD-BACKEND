const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/samvad').then(async () => {
    // 1. Clear users to force re-login/re-pull from voter data
    await mongoose.connection.collection('users').deleteMany({});
    
    // 2. Erase occupation and interests from a known testing voter
    await mongoose.connection.collection('voters').updateOne(
        { mobileNumber: '7000000000' },
        { $set: { occupation: '', interests: [] } }
    );
    
    console.log('Database reset successfully. User 7000000000 is ready for testing onboarding.');
    process.exit(0);
});