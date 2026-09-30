const router = require("express").Router();
const ctrl = require("../controllers/score.controller");
const { scoreLimiters, analysisLimiters } = require("../middleware/rate-limit");

// The score answers at once; the analysis may spend the shared daily AI
// quota, so it is limited per visitor more strictly
router.post("/", ...scoreLimiters(), ctrl.computeFromUrl);
router.post("/analysis", ...analysisLimiters(), ctrl.analyze);

module.exports = router;
