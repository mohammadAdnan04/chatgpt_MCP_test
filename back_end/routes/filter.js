const express = require("express");
const router = express.Router();
const filterController = require("../controllers/filterController");
const { isAuthenticated } = require("../middlewares/authMiddleware");


router.post("/save", isAuthenticated, filterController.saveFilter);
router.get("/get-Filter", isAuthenticated, filterController.getFilter); 
router.post("/create", isAuthenticated, filterController.createFilter);
router.delete("/delete", isAuthenticated, filterController.deleteFilter);

module.exports = router;
