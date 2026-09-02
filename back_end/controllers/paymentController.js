const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_not_configured");

const Credit = require("../models/Credit");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { addCreditsForUser, getBalanceForUser } = require("../utils/wallet");

exports.buyCredits = async (req, res) => {
  const purchaserId = req.user.id;
  const { amount, targetUserId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid credit amount" });
  }
  if (!targetUserId) {
    return res.status(400).json({ error: "Please select a user to credit" });
  }

  const getPricePerCredit = (amount) => {
    // These must exactly match the frontend creditTiers to avoid discrepancies
    if (amount >= 100000) return 0.023;
    if (amount >= 50000) return 0.026;
    if (amount >= 25000) return 0.029;
    if (amount >= 10000) return 0.032;
    if (amount >= 5000) return 0.035;
    if (amount >= 1000) return 0.038;
    return 0.049; // Default fallback
  };

  const pricePerCredit = getPricePerCredit(amount);
  const totalAmount = Math.round(amount * pricePerCredit * 100); // in cents

  try {
    const user = await User.findById(purchaserId);

    // Stripe Customer ID check
    if (!user.stripeCustomerId) {
      return res.status(400).json({
        error: "No Stripe customer found. Please add a payment method first."
      });
    }

    // Fetch customer data from Stripe
    let customer;
    try {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (customer.deleted) {
        return res.status(400).json({ error: "Customer was deleted in Stripe. Please add a new payment method." });
      }
    } catch (err) {
      if (err.code === 'resource_missing') {
        return res.status(400).json({ error: "Stripe customer not found. Please add a new payment method." });
      }
      throw err;
    }

    // Default payment method check with fallback
    let defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
    
    // Fallback: If no explicit default_payment_method, try to find an attached card and set it as default
    if (!defaultPaymentMethod) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
      });
      
      if (paymentMethods.data.length > 0) {
        defaultPaymentMethod = paymentMethods.data[0].id;
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: { default_payment_method: defaultPaymentMethod },
        });
      }
    }

    if (!defaultPaymentMethod) {
      return res.status(400).json({
        error: "Please add a payment method before purchasing credits."
      });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: defaultPaymentMethod,
      off_session: true,
      confirm: true,
      metadata: {
        userId: purchaserId,
        creditsPurchased: amount,
        usdCharged: (totalAmount / 100).toFixed(2),
      },
    });

    // Payment successful
    if (paymentIntent.status === "succeeded") {
      let recipientId = targetUserId;
      const recipient = await User.findById(targetUserId);
      if (!recipient) return res.status(404).json({ error: "Target user not found" });
      if (String(targetUserId) !== String(purchaserId)) {
        // If purchaser has org, allow crediting members of same org
        if (!(user.orgId && recipient.orgId && String(user.orgId) === String(recipient.orgId))) {
          return res.status(403).json({ error: "Not allowed to credit this user" });
        }
      }

      await addCreditsForUser(
        recipientId,
        amount,
        `Purchased ${amount} credits via Stripe`
      );

      const balance = await getBalanceForUser(recipientId);
      return res.json({
        message: "Credits purchased successfully",
        credits: balance
      });
    } else {
      return res.status(400).json({
        error: "Payment failed",
        status: paymentIntent.status
      });
    }
  } catch (err) {
    // Stripe card decline or authentication required
    if (err.code === "authentication_required") {
      return res.status(402).json({
        error: "Card requires authentication. Please update your payment method."
      });
    }
    return res.status(500).json({
      error: err.message || "An error occurred while processing payment"
    });
  }
};



exports.createSetupIntent = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    let customerId = user.stripeCustomerId;

    if (customerId) {
      // Check if customer is valid in current Stripe environment
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
           customerId = null;
        }
      } catch (err) {
        if (err.code === 'resource_missing') {
          // Customer exists in DB but not in this Stripe account/env
          customerId = null;
        } else {
          throw err;
        }
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
      });
      user.stripeCustomerId = customer.id;
      await user.save();
      customerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error("Error in createSetupIntent:", err);
    res.status(500).json({ error: err.message });
  }
};


exports.paymentMethods = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.stripeCustomerId) {
      return res.json([]);
    }

    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
      });
      return res.json(paymentMethods.data);
    } catch (err) {
      if (err.code === 'resource_missing') {
        // Customer does not exist in this Stripe account
        return res.json([]);
      }
      throw err;
    }
  } catch (err) {
    console.error("Error in paymentMethods:", err);
    res.status(500).json({ error: err.message });
  }
};


exports.setDefaultPaymentMethod = async (req, res) => {
 try {
    const { paymentMethodId } = req.body;
    const user = await User.findById(req.user.id);

    await stripe.customers.update(user.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    if (user.orgId) {
      const org = await Organization.findById(user.orgId);
      if (org && org.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.update(org.stripeSubscriptionId, {
            default_payment_method: paymentMethodId,
          });
        } catch (subErr) {
          console.warn("Failed to update subscription payment method:", subErr.message);
        }
      }
    }

    res.json({ message: "Default payment method updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDefaultPaymentMethod = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: "No Stripe customer found" });
    }
    let customer;
    try {
      customer = await stripe.customers.retrieve(user.stripeCustomerId);
      if (customer.deleted) {
        return res.status(400).json({ error: "Customer deleted in Stripe" });
      }
    } catch (err) {
      if (err.code === 'resource_missing') {
        return res.status(400).json({ error: "Customer not found in Stripe" });
      }
      throw err;
    }

    const defaultPaymentMethodId =
      customer.invoice_settings?.default_payment_method;

    if (!defaultPaymentMethodId) {
      return res.status(404).json({
        error: "No default payment method set",
      });
    }

    // Fetch full details of the default payment method
    const paymentMethod = await stripe.paymentMethods.retrieve(
      defaultPaymentMethodId
    );

    res.json(paymentMethod);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.deletePaymentMethod = async (req, res) => {
 try {
    await stripe.paymentMethods.detach(req.params.id);
    res.json({ message: "Card deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.updateBillingDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      companyName,
      address,
      city,
      state,
      country,
      postalCode
    } = req.body;

    const user = await User.findById(userId);

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        error: "No Stripe customer found. Please add a payment method first."
      });
    }

    // Update billing details on Stripe
    let updatedCustomer;
    try {
      updatedCustomer = await stripe.customers.update(user.stripeCustomerId, {
        name: user.name,
        email: user.email,
        address: {
          line1: address,
          city,
          state,
          country,
          postal_code: postalCode
        },
        metadata: {
          companyName: companyName || ""
        }
      });
    } catch (err) {
      if (err.code === 'resource_missing') {
        return res.status(400).json({ error: "Customer not found in Stripe. Please add a payment method again." });
      }
      throw err;
    }

    // Save billing details in MongoDB (optional)
    user.billingDetails = {
      companyName,
      address,
      city,
      state,
      country,
      postalCode
    };
    await user.save();

    res.json({
      message: "Billing details updated successfully",
      billingDetails: user.billingDetails,
      stripeCustomer: updatedCustomer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBillingDetails = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("billingDetails");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user.billingDetails || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateInvoiceEmail = async (req, res) => {
  try {
    const { invoiceEmail } = req.body;
    if (!invoiceEmail) return res.status(400).json({ error: "Invoice email is required" });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.invoiceEmail = invoiceEmail;
    await user.save();

    const stripeEmail = invoiceEmail || user.email;
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          email: stripeEmail
        });
      } catch (err) {
        if (err.code === 'resource_missing') {
          // Ignore if customer not found in Stripe, user needs to add a new payment method anyway
          console.warn("Stripe customer missing when updating email:", user.stripeCustomerId);
        } else {
          throw err;
        }
      }
    }

    res.json({
      message: "Invoice email updated",
      invoiceEmail: stripeEmail
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getInvoiceEmail = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("invoiceEmail email");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      invoiceEmail: user.invoiceEmail || user.email 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
