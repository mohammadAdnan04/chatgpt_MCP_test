const express = require("express");
const router = express.Router();
const mawsoolController = require("../controllers/mawsoolController");

router.get("/contact", mawsoolController.getContact);
router.post("/contact", mawsoolController.postContact);

module.exports = router;
