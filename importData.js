const mongoose = require("mongoose");
const csv = require("csvtojson");
const connectDB = require("./config/db");

const Voter = require("./models/Voter");
const Context = require("./models/Context");

// You will create this next
const Scheme = require("./models/Scheme");
const Booth = require("./models/Booth");

const makeMobileNumber = (index) => {
  // deterministic 10-digit fallback mobile numbers
  // e.g. 7000000000, 7000000001, ...
  const base = 7000000000;
  const num = base + index;
  return String(num).padStart(10, "0");
};

const importData = async () => {
  try {
    await connectDB();

    // Clear old data
    await Voter.deleteMany();
    await Context.deleteMany();
    await Scheme.deleteMany();
    await Booth.deleteMany();

    // Load CSV files
    const voters = await csv().fromFile("./data/VotersData.csv");
    const contexts = await csv().fromFile("./data/ContextData.csv");
    const schemes = await csv().fromFile("./data/SchemesData.csv");
    const booths = await csv().fromFile("./data/BoothsData.csv");

    // Normalize CSV fields to match Mongoose schemas
    const votersToInsert = voters.map((v, idx) => ({
      ...v,
      boothId: v.booth_id,
      mobileNumber: v.mobileNumber ? String(v.mobileNumber).trim() : makeMobileNumber(idx),
      occupation: v.Occupation || "",
      interests: v.Interests ? v.Interests.split(",").map(i => i.trim()) : []
      // keep original CSV fields for traceability if desired
    }));

    const contextsToInsert = contexts.map(c => ({
      ...c,
      boothId: c.booth_id,
      areaType: c.area_type
    }));

    const boothsToInsert = booths.map(b => ({
      ...b,
      voterCount: Number(b.voterCount) || 0,
    }));

    // Insert into DB
    await Voter.insertMany(votersToInsert);
    await Context.insertMany(contextsToInsert);
    await Scheme.insertMany(schemes);
    await Booth.insertMany(boothsToInsert);

    console.log("All data imported successfully ✅");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

importData();