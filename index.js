const connectDB = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const boothRoutes = require("./routes/boothRoutes");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test route
app.get("/", (req, res) => {
    res.send("Samvad Backend Running 🚀");
});

// Server start
const PORT = process.env.PORT || 5000;
app.use("/booth", boothRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
connectDB();