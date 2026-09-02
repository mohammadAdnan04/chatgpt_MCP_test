const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middlewares/authMiddleware");
const subCtrl = require("../controllers/subscriptionController");

router.get("/plans", isAuthenticated, subCtrl.getPlans);
router.post("/start", isAuthenticated, subCtrl.startSubscription);
router.post("/update-credit-addon", isAuthenticated, subCtrl.updateCreditAddon);
router.post("/change", isAuthenticated, subCtrl.changePlan);
router.get("/me", isAuthenticated, subCtrl.getMySubscription);
// Buy extra credits
router.post("/cancel", isAuthenticated, subCtrl.cancelAtPeriodEnd);
router.post("/resume", isAuthenticated, subCtrl.resume);
router.post("/add-seats", isAuthenticated, subCtrl.addSeats);
// invoices routes
router.get("/invoices", isAuthenticated, subCtrl.getInvoices);

module.exports = router;
