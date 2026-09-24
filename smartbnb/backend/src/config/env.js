require("dotenv").config({ quiet: true });

module.exports = {
  DATA_MODE: process.env.DATA_MODE,
  DATABASE_URL: process.env.DATABASE_URL,
  PORT: process.env.PORT || 3000,
};
