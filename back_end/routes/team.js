const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middlewares/authMiddleware");
const teamCtrl = require("../controllers/teamController");

router.get("/members", isAuthenticated, teamCtrl.getMembers);
router.post("/add", isAuthenticated, teamCtrl.addMember);
router.put("/member/:id/role", isAuthenticated, teamCtrl.updateRole);
router.put("/member/:id/limit", isAuthenticated, teamCtrl.updateLimit);
router.delete("/member/:id", isAuthenticated, teamCtrl.removeMember);

module.exports = router;
