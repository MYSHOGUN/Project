// db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const dbURI = process.env.MONGODB_URI || "mongodb://localhost:27017/test";
    await mongoose.connect(dbURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    // Log whether MONGODB_URI is being loaded correctly
    console.error("🔍 MONGODB_URI Loaded:", process.env.MONGODB_URI ? "Yes" : "No (using localhost fallback)");
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
