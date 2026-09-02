const express = require("express");
const router = express.Router();
const doNotSellMyDataController = require("../controllers/doNotSellMyDataController");

router.post("/", doNotSellMyDataController.insert);
router.get("/", doNotSellMyDataController.getAllRequests);



module.exports = router;
