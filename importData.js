const mongoose = require("mongoose");
const csv = require("csvtojson");

const Voter = require("./models/Voter");
const Context = require("./models/Context");

// You will create this next
const Scheme = require("./models/Scheme");

mongoose.connect("mongodb://127.0.0.1:27017/samvad");

const importData = async () => {
  try {
    // Clear old data
    await Voter.deleteMany();
    await Context.deleteMany();
    await Scheme.deleteMany();

    // Load CSV files
    const voters = await csv().fromFile("./data/VotersData.csv");
    const contexts = await csv().fromFile("./data/ContextData.csv");
    const schemes = await csv().fromFile("./data/SchemesData.csv");

    // Normalize CSV fields to match Mongoose schemas
    const votersToInsert = voters.map(v => ({
      ...v,
      boothId: v.booth_id,
      // keep original CSV fields for traceability if desired
    }));

    const contextsToInsert = contexts.map(c => ({
      ...c,
      boothId: c.booth_id,
      areaType: c.area_type
    }));

    // Insert into DB
    await Voter.insertMany(votersToInsert);
    await Context.insertMany(contextsToInsert);
    await Scheme.insertMany(schemes);

    console.log("All data imported successfully ✅");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

importData();