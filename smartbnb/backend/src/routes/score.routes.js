const router = require("express").Router();
const ctrl = require("../controllers/score.controller");
const { scoreLimiters } = require("../middleware/rate-limit");

// Each check may spend the shared daily AI quota: limit it per visitor
router.post("/", ...scoreLimiters(), ctrl.computeFromUrl);

module.exports = router;
