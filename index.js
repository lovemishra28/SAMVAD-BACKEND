const connectDB = require("./config/db");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const boothRoutes = require("./routes/boothRoutes");
const voterRoutes = require("./routes/voterRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const schemeRoutes = require("./routes/schemeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const errorHandler = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const mobileRoutes = require("./routes/mobileRoutes");

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
app.use("/api/booth", boothRoutes);
app.use("/api/booths", boothRoutes);
app.use("/api/voters", voterRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/schemes", schemeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/applications", require("./routes/applicationRoutes"));

// Mobile app API routes
app.use("/api/auth", authRoutes);
app.use("/api/mobile", mobileRoutes);

// Global error handler (Phase 6)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
connectDB();