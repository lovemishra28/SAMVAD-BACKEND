const connectDB = require("./config/db");
const { processBoothData } = require("./services/boothService");

connectDB()
  .then(() => processBoothData("Booth_01"))
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  });
