const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

router.post("/buy-credits", isAuthenticated, paymentController.buyCredits);

router.post("/create-setup-intent", isAuthenticated, paymentController.createSetupIntent);

router.post("/payment-methods", isAuthenticated, paymentController.paymentMethods);
router.post("/set-default-payment-method", isAuthenticated, paymentController.setDefaultPaymentMethod);
router.get("/get-default-payment-method", isAuthenticated, paymentController.getDefaultPaymentMethod);

router.delete("/payment-method/:id", isAuthenticated, paymentController.deletePaymentMethod);

router.post("/billing-details", isAuthenticated, paymentController.updateBillingDetails);
router.get("/billing-details", isAuthenticated, paymentController.getBillingDetails);

router.post("/invoice-email", isAuthenticated, paymentController.updateInvoiceEmail);
router.get("/invoice-email", isAuthenticated, paymentController.getInvoiceEmail);

module.exports = router;
