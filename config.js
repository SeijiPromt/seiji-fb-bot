const path = require("path");

module.exports = {
  PORT: parseInt(process.env.PORT || "8000", 10),
  PREFIX: process.env.PREFIX || "!",
  ADMIN_IDS: (process.env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean),
  DAILY_LIMIT: parseInt(process.env.DAILY_LIMIT || "100", 10),
  CONTEXT_TURNS: parseInt(process.env.CONTEXT_TURNS || "6", 10),
  DB_PATH: process.env.DB_PATH || path.join(__dirname, "data", "bot.json"),
};
