const router = require("express").Router();
const ctrl = require("../controllers/listings.controller");

router.get("/", ctrl.search);
router.get("/:id", ctrl.getById);

module.exports = router;
