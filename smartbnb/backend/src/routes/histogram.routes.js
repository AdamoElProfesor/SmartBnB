const router = require("express").Router();
const ctrl = require("../controllers/histogram.controller");

router.get("/", ctrl.base);

module.exports = router;
