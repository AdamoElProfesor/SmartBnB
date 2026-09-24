const express = require("express");
const routes = require("./routes");
const { health } = require("./controllers/health.controller");
const { apiNotFound, apiErrorHandler } = require("./middleware/errors");

const api = express.Router();

// Before the body parser and every other route: cheap and never rate limited
api.get("/health", health);

api.use(express.json({ limit: "10kb" }));

api.use(routes);

api.use(apiNotFound);
api.use(apiErrorHandler);

module.exports = api;
