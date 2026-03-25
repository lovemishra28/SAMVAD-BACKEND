const mongoose = require("mongoose");
const csv = require("csvtojson");

const Voter = require("./models/Voter");
const Context = require("./models/Context");

// You will create this next
const Scheme = require("./models/Scheme");
const Booth = require("./models/Booth");

mongoose.connect("mongodb://127.0.0.1:27017/samvad");

const makeMobileNumber = (index) => {
  // deterministic 10-digit fallback mobile numbers
  // e.g. 7000000000, 7000000001, ...
  const base = 7000000000;
  const num = base + index;
  return String(num).padStart(10, "0");
};

const normalizeCityFromAddress = (address) => {
  if (!address || !String(address).trim()) return "";
  let city = String(address).trim();

  // remove known area suffixes
  city = city.replace(/\b(Semi-Urban|SemiUrban|Urban|Rural|District|City|Area|Tehsil)\b/gi, "").trim();

  // usually address is "City X", or "City"; we keep the primary city token
  const tokens = city.split(/\s+/).filter(Boolean);
  return tokens.length > 0 ? tokens[0] : "";
};

// ─── Parse CSV eligibility text into structured object ─────────────
const WOMEN_KEYWORDS = ['women', 'female', 'mahila', 'girl', 'beti', 'stree'];

const parseEligibility = (rawText, scheme) => {
  const text = (rawText || '').toLowerCase();
  const result = {
    rawText: rawText || '',
    maxIncomeBracket: null,
    requiresPwd: false,
    requiresBpl: false,
    requiresScst: false,
    targetGender: null,
    validOccupations: [],
    validAreaTypes: [],
  };

  // Detect BPL requirement
  if (text.includes('bpl')) {
    result.requiresBpl = true;
  }

  // Detect SC/ST requirement
  if (/\bsc\b/.test(text) || /\bst\b/.test(text)) {
    result.requiresScst = false; // SC/ST in CSV means "focuses on" not "requires"
    // Note: We mark requiresScst = true only if the scheme is EXCLUSIVELY for SC/ST
    // Current CSV uses "Focuses on sc, st" meaning priority, not exclusivity
  }

  // Detect women-only schemes
  if (WOMEN_KEYWORDS.some(kw => text.includes(kw))) {
    result.targetGender = 'Female';
  }

  // Detect income-sensitive schemes (keywords like "poor", "bpl")
  if (text.includes('poor') || text.includes('bpl')) {
    result.maxIncomeBracket = '3_to_6'; // Schemes for poor/BPL cap at ₹6L
  }

  // Extract valid occupations from target_occupation
  const occ = (scheme.target_occupation || '').trim();
  if (occ) {
    result.validOccupations = [occ];
  }

  // Extract valid area types from area_type
  const area = (scheme.area_type || '').trim();
  if (area && area !== 'All' && area !== 'Both') {
    result.validAreaTypes = [area];
  }

  return result;
};

const importData = async () => {
  try {
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
    const boothCityMap = booths.reduce((map, b) => {
      const key = String(b.district || "").trim().toLowerCase();
      if (key) map[key] = b.id;
      return map;
    }, {});

    const votersToInsert = voters.map((v, idx) => {
      const city = v.city || "";
      const normalizedCity = city.trim().toLowerCase();
      const mappedBoothId = boothCityMap[normalizedCity];
      const chosenBoothId = mappedBoothId || v.booth_id;

      if (mappedBoothId && v.booth_id && v.booth_id !== mappedBoothId) {
        console.log(`Remapping voter ${v.name} city=${city} booth ${v.booth_id} -> ${mappedBoothId}`);
      }

      return {
        ...v,
        city,
        boothId: chosenBoothId,
        mobileNumber: v.mobileNumber ? String(v.mobileNumber).trim() : makeMobileNumber(idx),
        occupation: v.Occupation || "",
        interests: v.Interests ? v.Interests.split(",").map(i => i.trim()) : [],
      };
    });

    const contextsToInsert = contexts.map(c => ({
      ...c,
      boothId: c.booth_id,
      areaType: c.area_type
    }));

    // Parse schemes with structured eligibility
    const schemesToInsert = schemes.map(s => ({
      ...s,
      eligibility: parseEligibility(s.eligibility, s),
    }));

    const boothsToInsert = booths.map(b => ({
      ...b,
      voterCount: Number(b.voterCount) || 0,
    }));

    // Insert into DB
    await Voter.insertMany(votersToInsert);
    await Context.insertMany(contextsToInsert);
    await Scheme.insertMany(schemesToInsert);
    await Booth.insertMany(boothsToInsert);

    console.log("All data imported successfully ✅");
    process.exit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

importData();

