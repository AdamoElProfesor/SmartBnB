const router = require("express").Router();
const ctrl = require("../controllers/heatmap.controller");

router.get("/", ctrl.getHeatMapController);

module.exports = router;
