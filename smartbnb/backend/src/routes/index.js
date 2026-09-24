const router = require("express").Router();

router.use("/listings", require("./listings.routes"));
router.use("/score", require("./score.routes"));
router.use("/heatmap", require("./heatmap.routes"));
router.use("/histogram", require("./histogram.routes"));

module.exports = router;
