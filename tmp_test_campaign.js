const { createCampaign } = require("./controllers/campaignController");

const req = {
  body: {
    schemeId: "SCH001",
    type: "launch",
    category: "Farmers",
    boothId: "Booth_01",
  },
};

const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    console.log("RESPONSE", this.statusCode, payload);
  },
};

createCampaign(req, res).catch((err) => {
  console.error("ERROR", err);
});
