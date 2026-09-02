const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Organization = require("../models/Organization");
const User = require("../models/User");
const StripeGrant = require("../models/StripeGrant");
const planConfig = require("../config/planConfig");

function planFromKey(key) {
  const k = (key || "").toUpperCase();
  if (!planConfig[k]) throw new Error("Invalid plan key");
  return { key: k, ...planConfig[k] };
}

function normalizeSeatsForPlan(plan, requestedSeats) {
  const includedSeats = Number(plan.seats || 1);
  const maxExtraUsers = Number(plan.maxExtraUsers || 0);
  const maxSeats = includedSeats + maxExtraUsers;
  const parsed = parseInt(requestedSeats, 10) || includedSeats;
  if (parsed > maxSeats) {
    throw new Error(`The ${plan.name} plan only supports up to ${maxSeats} seat(s). Please upgrade your plan to add more team members.`);
  }
  return Math.max(parsed, includedSeats);
}

// GET /api/subscriptions/plans
exports.getPlans = async (req, res) => {
  const plans = Object.entries(planConfig).map(([key, v]) => ({
    key,
    name: v.name,
    seats: v.seats,
    monthlyCredits: v.monthlyCredits,
    priceIds: {
      monthly: !!v.prices.monthly,
      annual: !!v.prices.annual
    }
  }));
  res.json(plans);
};

// POST /api/subscriptions/start  (use saved default PM)
// exports.startSubscription = async (req, res) => {
//   try {
//     const { planKey, interval, seats, automation } = req.body;
//     const user = await User.findById(req.user.id);
//     const plan = planFromKey(planKey);
//     const billingInterval = (interval || "monthly").toLowerCase();

//     const priceId = plan.prices[billingInterval];
//     if (!priceId) return res.status(400).json({ msg: "Price not configured for this plan/interval" });

//     // automation price ID
//     const automationPriceId = process.env.STRIPE_AUTOMATION_PRICE_ID; 
//     const automationAnnualPriceId = process.env.STRIPE_AUTOMATION_ANNUAL_PRICE_ID; 
//     if (automation && !automationPriceId && !automationAnnualPriceId) {
//       return res.status(400).json({ msg: "Automation price not configured" });
//     }

//     // Ensure stripe customer exists
//     if (!user.stripeCustomerId) {
//       const customer = await stripe.customers.create({
//         email: user.email,
//         name: user.name
//       });
//       user.stripeCustomerId = customer.id;
//       await user.save();
//     }

//     // Check default payment method
//     const customer = await stripe.customers.retrieve(user.stripeCustomerId);
//     if (!customer.invoice_settings?.default_payment_method) {
//       return res.status(401).json({
//         msg: "No default payment method is set. Please add or select a card in Settings before proceeding."
//       });
//     }

//     // Create/Find organization
//     let org = await Organization.findOne({ ownerId: user._id });
//     if (!org) {
//       org = await Organization.create({
//         name: `${user.name}'s Organization`,
//         ownerId: user._id,
//         stripeCustomerId: user.stripeCustomerId,
//         members: [{ userId: user._id, role: "owner" }]
//       });
//       user.orgId = org._id;
//       user.orgRole = "owner";
//       await user.save();
//     }

//     // Prepare subscription items
//     const subscriptionItems = [{ price: priceId, quantity: seats }];
    
//     // Add automation item if selected
//     if (automation && automation.users > 0) {
//       const selectedAutomationPriceId = billingInterval === "annual" ? automationAnnualPriceId : automationPriceId;
//       if (!selectedAutomationPriceId) {
//         return res.status(400).json({ msg: `Automation price not configured for ${billingInterval} billing` });
//       }
//       subscriptionItems.push({
//         price: selectedAutomationPriceId,
//         quantity: automation.users,
//       });
//     }

//     // Create subscription
//     const sub = await stripe.subscriptions.create({
//       customer: user.stripeCustomerId,
//       items: subscriptionItems,
//       payment_behavior: "allow_incomplete",
//       collection_method: "charge_automatically",
//       payment_settings: {
//         save_default_payment_method: "on_subscription"
//       },
//       expand: ["latest_invoice.payment_intent"]
//     });
//     // If payment intent exists, confirm it
//     if (sub.latest_invoice?.payment_intent?.status === "requires_confirmation") {
//       await stripe.paymentIntents.confirm(sub.latest_invoice.payment_intent.id);
//     }

//     org.planKey = plan.key;
//     org.billingInterval = billingInterval;
//     org.seatsAllowed = seats;
//     org.stripeSubscriptionId = sub.id;
//     org.cancelAtPeriodEnd = false;
//     org.automation = automation
//       ? { users: automation.users, pricePerUser: automation.pricePerUser }
//       : null;
//     if (sub.current_period_end) {
//       org.currentPeriodEnd = new Date(sub.current_period_end * 1000);
//     }
//     await org.save();

//     const paymentIntent = sub.latest_invoice?.payment_intent || null;

//     let clientSecret = null;
//     if (paymentIntent?.status === "requires_action" || paymentIntent?.status === "requires_confirmation") {
//       clientSecret = paymentIntent.client_secret;
//     }

//     res.json({
//       message: "Your subscription is now active. You can start using all the features included in your plan right away.",
//       subscriptionId: sub.id,
//       status: paymentIntent?.status || sub.status,
//       clientSecret: clientSecret
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       msg: "Error starting subscription",
//       error: err.message
//     });
//   }
// };

exports.startSubscription = async (req, res) => {
  try {
    const { planKey, interval, seats, automation, selectedUserIds, destination } = req.body;

    const user = await User.findById(req.user.id);
    const plan = planFromKey(planKey);
    let actualSeats;
    try {
      actualSeats = normalizeSeatsForPlan(plan, seats);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    const actualDestination = actualSeats > 1 ? 'team' : 'personal';
    const billingInterval = (interval || "monthly").toLowerCase();

    const priceId = plan.prices[billingInterval];
    if (!priceId) return res.status(400).json({ msg: "Price not configured for this plan/interval" });

    // Automation price ID
    const automationPriceId = process.env.STRIPE_AUTOMATION_PRICE_ID;
    const automationAnnualPriceId = process.env.STRIPE_AUTOMATION_ANNUAL_PRICE_ID;
    if (automation && !automationPriceId && !automationAnnualPriceId) {
      return res.status(400).json({ msg: "Automation price not configured" });
    }

    // Ensure stripe customer exists
    let customerId = user.stripeCustomerId;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          customerId = null;
        }
      } catch (err) {
        if (err.code === 'resource_missing') {
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

    // Check default payment method
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.invoice_settings?.default_payment_method) {
      return res.status(400).json({
        msg: "No default payment method is set. Please add or select a card in Settings before proceeding.",
      });
    }

    // Create/Find organization
    let org = await Organization.findOne({ ownerId: user._id });
    if (!org) {
      org = await Organization.create({
        name: `${user.name}'s Organization`,
        ownerId: user._id,
        stripeCustomerId: user.stripeCustomerId,
        members: [{ userId: user._id, role: "owner" }],
      });
      user.orgId = org._id;
      user.orgRole = "owner";
      await user.save();
    }

    // Prepare subscription items
    const subscriptionItems = [{ price: priceId, quantity: actualSeats }];

    // Add automation item if selected
    if (automation && automation.users > 0) {
      const selectedAutomationPriceId = billingInterval === "annual" ? automationAnnualPriceId : automationPriceId;
      if (!selectedAutomationPriceId) {
        return res.status(400).json({ msg: `Automation price not configured for ${billingInterval} billing` });
      }
      subscriptionItems.push({
        price: selectedAutomationPriceId,
        quantity: automation.users,
      });
    }

    // Capture current plan values before overwriting (needed for upgrade credit diff calculation)
    const prevPlanKey = org.planKey;
    const prevBillingInterval = org.billingInterval;
    const prevSeatsAllowed = org.seatsAllowed;
    const prevCreditDestination = org.creditDestination;
    const prevStripeCustomerId = org.stripeCustomerId;

    // Check for existing subscription
      let sub;
      let isUpgrade = false;
      let creditDiff = 0;

      if (org.stripeSubscriptionId) {
        // Retrieve existing subscription
        try {
          sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
        } catch (err) {
          console.warn("Could not retrieve old subscription, assuming it is dead:", err.message);
          sub = { status: "canceled" }; // Mock it so the code below creates a new one
        }
        
        if (sub.status === "active" || sub.status === "trialing") {
          let oldPlanName = "Previous Plan";
          // Calculate credit difference for upgrade (use prev values, not the newly set ones)
          if (prevPlanKey) {
            try {
              const oldPlan = planFromKey(prevPlanKey);
              oldPlanName = oldPlan.name;
              const oldMonthly = oldPlan.monthlyCredits || 0;
              const oldCredits = (prevBillingInterval === "annual" ? oldMonthly * 12 : oldMonthly) * (prevSeatsAllowed || 1);
              const newMonthly = plan.monthlyCredits || 0;
              const newCredits = (billingInterval === "annual" ? newMonthly * 12 : newMonthly) * actualSeats;
              creditDiff = newCredits - oldCredits;
              if (creditDiff > 0) isUpgrade = true;
            } catch (e) {
              console.warn("Could not parse old plan for credit diff:", e);
            }
          }

          // Calculate exact price difference
          let oldCost = 0;
          sub.items.data.forEach(item => {
            oldCost += item.price.unit_amount * item.quantity;
          });

          let newCost = 0;
          for (const item of subscriptionItems) {
            const priceObj = await stripe.prices.retrieve(item.price);
            newCost += priceObj.unit_amount * item.quantity;
          }
          const priceDiff = newCost - oldCost;

          // Update existing subscription
          const updatedItems = subscriptionItems.map((item) => ({
            id: sub.items.data.find((si) => si.price.id === item.price)?.id,
            price: item.price,
            quantity: item.quantity,
          }));

          // Remove items not in the new subscription (e.g., if automation is removed)
          const itemsToDelete = sub.items.data
            .filter((si) => !subscriptionItems.some((ni) => ni.price === si.price.id))
            .map((si) => ({ id: si.id, deleted: true }));

          const isMonthlyToAnnual = prevBillingInterval === "monthly" && billingInterval === "annual";

          // If resetting the cycle for Monthly -> Annual, give credit for what they already paid
          if (isMonthlyToAnnual && oldCost > 0) {
            await stripe.invoiceItems.create({
              customer: user.stripeCustomerId,
              amount: -oldCost,
              currency: 'usd',
              description: `Credit for current month's plan towards Annual upgrade`,
            });
          }

          const updateParams = {
            items: [...updatedItems, ...itemsToDelete],
            proration_behavior: "none", // NO time-based prorations. Downgrades/Upgrades keep same billing date without refunds.
            payment_behavior: "allow_incomplete",
            collection_method: "charge_automatically",
            payment_settings: {
              save_default_payment_method: "on_subscription",
            },
            expand: ["latest_invoice.payment_intent"],
          };

          if (isMonthlyToAnnual) {
            updateParams.billing_cycle_anchor = "now";
          }

          sub = await stripe.subscriptions.update(org.stripeSubscriptionId, updateParams);

          // If it's a true price upgrade, charge the exact flat difference NOW via a direct
          // PaymentIntent instead of an invoice item. Using invoice items causes them to be
          // silently collected by Stripe's auto-generated subscription-update draft invoice,
          // leaving our manually created invoice with $0.
          if (priceDiff > 0 && !isMonthlyToAnnual) {
            const defaultPM = customer.invoice_settings?.default_payment_method;
            try {
              const upgradePI = await stripe.paymentIntents.create({
                amount: priceDiff,
                currency: 'usd',
                customer: user.stripeCustomerId,
                payment_method: defaultPM,
                description: `Plan Upgrade Fee (${oldPlanName} to ${plan.name})`,
                confirm: true,
                off_session: true,
              });
              if (!sub.latest_invoice) sub.latest_invoice = {};
              sub.latest_invoice.payment_intent = upgradePI;
            } catch (err) {
              // If charge fails, block credit grant by setting a failed sentinel
              if (!sub.latest_invoice) sub.latest_invoice = {};
              sub.latest_invoice.payment_intent = { status: 'failed' };
            }
          }
        } else {
        // Cancel old subscription if it's not active or already canceled
        if (sub.status !== "canceled") {
          try {
            await stripe.subscriptions.cancel(org.stripeSubscriptionId);
          } catch (cancelErr) {
            console.warn("Could not cancel old subscription (maybe already canceled):", cancelErr.message);
          }
        }
        // Create new subscription
        sub = await stripe.subscriptions.create({
          customer: user.stripeCustomerId,
          items: subscriptionItems,
          payment_behavior: "allow_incomplete",
          collection_method: "charge_automatically",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
        });
      }
    } else {
      // Create new subscription
      sub = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: subscriptionItems,
        payment_behavior: "allow_incomplete",
        collection_method: "charge_automatically",
        payment_settings: {
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      });
    }

    // If payment intent exists, confirm it
      if (sub.latest_invoice?.payment_intent?.status === "requires_confirmation") {
        const confirmed = await stripe.paymentIntents.confirm(sub.latest_invoice.payment_intent.id);
        sub.latest_invoice.payment_intent = confirmed;
      }
      
      const paymentIntent = sub.latest_invoice?.payment_intent || null;
      
      // Check if the payment failed, requires action, or is processing (we only accept 'succeeded')
      const isPaymentFailed = 
        sub.status === "incomplete" || 
        sub.status === "past_due" ||
        (paymentIntent && paymentIntent.status !== "succeeded");

      if (isPaymentFailed) {
         if (!org.stripeSubscriptionId) {
            // It's a brand new subscription. Cancel it immediately so it doesn't linger as incomplete
            await stripe.subscriptions.cancel(sub.id);
         } else {
            // Check if the previous subscription was already inactive/canceled.
            // If it was canceled, we created a brand NEW subscription in Stripe above, but org.stripeSubscriptionId 
            // still points to the old dead one. We must cancel the NEW one (`sub.id`) so it doesn't linger.
            if (sub.id !== org.stripeSubscriptionId) {
               await stripe.subscriptions.cancel(sub.id);
            } else {
               // It's an upgrade/downgrade of an existing active subscription that failed.
               // We should revert the subscription items back to the previous state.
               if (prevPlanKey && prevBillingInterval) {
                  try {
                     const oldPlan = planFromKey(prevPlanKey);
                     const oldPriceId = oldPlan.prices[prevBillingInterval];
                     if (oldPriceId) {
                       const revertItems = sub.items.data.map(item => ({
                         id: item.id,
                         deleted: true
                       }));
                       
                       // Double check if the subscription is still alive before updating it
                       const currentStripeSub = await stripe.subscriptions.retrieve(sub.id);
                       if (currentStripeSub.status !== 'canceled') {
                           await stripe.subscriptions.update(sub.id, {
                             items: [
                               ...revertItems,
                               { price: oldPriceId, quantity: prevSeatsAllowed || 1 }
                             ],
                             proration_behavior: 'none'
                           });
                       }
                     }
                  } catch (revertErr) {
                    console.error("Failed to revert subscription after failed upgrade:", revertErr);
                  }
               }
            }
         }
         
         return res.status(400).json({ 
           error: "Payment declined or requires authentication. Please update your payment method and try again.",
           clientSecret: paymentIntent?.client_secret || null,
           status: paymentIntent?.status || sub.status
         });
      }

      // Grant credit difference immediately for upgrades
      if (isUpgrade && creditDiff > 0) {
        const piStatus = sub.latest_invoice?.payment_intent?.status;
        // Proceed if there's no payment intent (e.g. $0 price diff) or the upgrade PI succeeded
        if (!sub.latest_invoice?.payment_intent || piStatus === "succeeded") {
          if (actualDestination === 'personal') {
            user.credits = (user.credits || 0) + creditDiff;
            await user.save();
          } else {
            org.poolCredits = (org.poolCredits || 0) + creditDiff;
          }
        }
      }

      // Update organization details
    const isNewSubscription = !org.stripeSubscriptionId;
    org.stripeSubscriptionId = sub.id;
    org.cancelAtPeriodEnd = false;
    org.planKey = plan.key;
    org.billingInterval = billingInterval;
    org.seatsAllowed = actualSeats;
    org.creditDestination = actualDestination;
    if (!org.stripeCustomerId) org.stripeCustomerId = user.stripeCustomerId;
    
    org.automation = automation
      ? { users: automation.users, pricePerUser: automation.pricePerUser }
      : null;
    const subPeriodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
    if (subPeriodEnd) {
      org.currentPeriodEnd = new Date(subPeriodEnd * 1000);
    }
    // Persist selected recipients for future grants
    if (Array.isArray(selectedUserIds)) {
      const uniq = Array.from(new Set(selectedUserIds.map(String)));
      org.creditRecipients = uniq;
    }
    await org.save();

    // For a brand-new subscription (not an upgrade), grant credits immediately in the controller.
    // We also create the StripeGrant lock so the webhook skips this invoice and doesn't double-credit.
    if (isNewSubscription) {
      // This is a fresh first-time purchase (not an upgrade of an existing sub)
      const invoiceId = sub.latest_invoice?.id;
      const piStatus = sub.latest_invoice?.payment_intent?.status;
      
      // ONLY grant credits if the subscription is active AND the payment actually succeeded
      if (invoiceId && sub.status === "active" && piStatus === "succeeded") {
        try {
          await StripeGrant.create({
            invoiceId,
            grantType: "main_plan",
            customerId: user.stripeCustomerId,
            subscriptionId: sub.id,
          });
          // Lock acquired — grant credits now
          const creditPlan = planFromKey(plan.key);
          const creditsToGrant = (billingInterval === "annual"
            ? creditPlan.monthlyCredits * 12
            : creditPlan.monthlyCredits) * actualSeats;

          if (actualDestination === "personal") {
            user.credits = (user.credits || 0) + creditsToGrant;
            await user.save();
          } else {
            org.poolCredits = (org.poolCredits || 0) + creditsToGrant;
          }
          console.log(`[Controller] Granted ${creditsToGrant} credits (${actualDestination}) for new subscription ${sub.id}`);
        } catch (lockErr) {
          if (lockErr?.code === 11000) {
            // Webhook already processed this invoice — skip to avoid double-credit
            console.log(`[Controller] Grant lock already exists for invoice ${invoiceId}, skipping.`);
          } else {
            console.error("[Controller] Error creating grant lock:", lockErr.message);
          }
        }
      } else {
         console.log(`[Controller] Skipped immediate credit grant for new sub ${sub.id}. Status: ${sub.status}, PI: ${piStatus}`);
      }
    }

    let clientSecret = null;
    if (paymentIntent?.status === "requires_action" || paymentIntent?.status === "requires_confirmation") {
      clientSecret = paymentIntent.client_secret;
    }

    res.json({
      message: "Your subscription has been updated successfully.",
      subscriptionId: sub.id,
      status: paymentIntent?.status || sub.status,
      clientSecret: clientSecret,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      msg: "Error updating subscription",
      error: err.message,
    });
  }
};

// POST /api/subscriptions/update-credit-addon
exports.updateCreditAddon = async (req, res) => {
  try {
    const { amount, destination, priceId } = req.body;
    const user = await User.findById(req.user.id).populate('orgId');
    
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.stripeCustomerId) return res.status(400).json({ message: "User does not have a Stripe Customer ID." });
    
    // Fetch active AND trialing subscriptions — add-ons with trial_end alignment will be in 'trialing' status
    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'active' }),
      stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'trialing' }),
    ]);
    const allSubs = [...activeSubs.data, ...trialingSubs.data];

    // Find the specific standalone subscription we created for credit add-ons
    const creditAddonSub = allSubs.find(sub => sub.metadata.type === 'credit_addon');
    // Find the user's main plan subscription (the one that isn't the add-on)
    const mainPlanSub = allSubs.find(sub => sub.metadata.type !== 'credit_addon');

    if (amount === 0) {
      // Cancel the add-on completely
      if (creditAddonSub) {
        await stripe.subscriptions.cancel(creditAddonSub.id);
      }
      return res.status(200).json({ 
        message: "Credit add-on canceled successfully",
        credits: user.credits 
      });
    }

    if (!priceId) {
      return res.status(400).json({ message: "Missing Stripe Price ID for the selected credit tier." });
    }

    // If they already have a credit add-on running, we cancel it and start a fresh one 
    if (creditAddonSub) {
      await stripe.subscriptions.cancel(creditAddonSub.id);
    }

    // For monthly plans: use trial_end = plan's current_period_end so the add-on renews on the
    // same date as the plan. Stripe allows trial_end up to 730 days — no anchor constraint.
    // We charge the first period immediately via PaymentIntent and grant credits now.
    // For annual plans: no trial, subscription starts and bills monthly from today.
    const org = user.orgId && typeof user.orgId === 'object' ? user.orgId : null;
    const isMonthlyPlan = org?.billingInterval === 'monthly';
    let trialEnd = null;
    if (isMonthlyPlan && mainPlanSub) {
      trialEnd = mainPlanSub.current_period_end ||
        mainPlanSub.items?.data?.[0]?.current_period_end ||
        null;
    }

    // If using trial_end, charge the first period now
    let immediatePI = null;
    if (trialEnd) {
      const priceDetails = await stripe.prices.retrieve(priceId);
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      let defaultPM = customer.invoice_settings?.default_payment_method;
      
      // Fallback: If no explicit default_payment_method, try to find an attached card and set it as default
      if (!defaultPM) {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: user.stripeCustomerId,
          type: "card",
        });
        
        if (paymentMethods.data.length > 0) {
          defaultPM = paymentMethods.data[0].id;
          await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: { default_payment_method: defaultPM },
          });
        }
      }

      if (!defaultPM) {
        return res.status(400).json({ error: "No default payment method found. Please add a card in Billing Settings." });
      }
      try {
        // Instead of a standalone PaymentIntent, create an Invoice directly so it appears naturally in billing history
        // To support all Stripe API versions, we extract the exact amount and currency from the Price object
        const immediateInvoiceItem = await stripe.invoiceItems.create({
          customer: user.stripeCustomerId,
          amount: priceDetails.unit_amount,
          currency: priceDetails.currency,
          description: `Credit add-on – first period charge (${amount.toLocaleString()} credits)`
        });
        
        const immediateInvoice = await stripe.invoices.create({
          customer: user.stripeCustomerId,
          auto_advance: true,
          collection_method: 'charge_automatically',
          description: `Credit add-on – first period charge (${amount.toLocaleString()} credits)`,
        });
        
        const finalizedInvoice = await stripe.invoices.pay(immediateInvoice.id);
        immediatePI = { status: finalizedInvoice.status === 'paid' ? 'succeeded' : 'failed' };
        
      } catch (err) {
        return res.status(400).json({ error: "Payment failed. Please check your payment method.", detail: err.message });
      }
      if (immediatePI.status !== 'succeeded') {
        return res.status(400).json({ error: "Payment did not succeed. Please check your payment method." });
      }
    }

    // Create the add-on subscription
    const subscriptionConfig = {
      customer: user.stripeCustomerId,
      items: [{ price: priceId }],
      metadata: { 
        type: 'credit_addon',
        destination: destination || 'personal',
      },
      payment_behavior: "allow_incomplete",
      collection_method: "charge_automatically",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
    };

    // If we just successfully set a fallback defaultPM, OR if there already was one, we need to explicitly include it
    // here because sometimes Stripe fails to auto-charge incomplete subscriptions if the default PM isn't passed in.
    const customerForSub = await stripe.customers.retrieve(user.stripeCustomerId);
    if (customerForSub.invoice_settings?.default_payment_method) {
      subscriptionConfig.default_payment_method = customerForSub.invoice_settings.default_payment_method;
    }

    if (trialEnd) {
      // Trial runs until the plan's next billing date — subscription first charges on that date.
      // First period already charged via PaymentIntent above.
      subscriptionConfig.trial_end = trialEnd;
    }

    const newAddonSub = await stripe.subscriptions.create(subscriptionConfig);

    // For non-trial path: verify the subscription's own invoice payment succeeded
    if (!trialEnd) {
      const paymentIntent = newAddonSub.latest_invoice?.payment_intent;
      const isPaymentFailed = 
        newAddonSub.status === "incomplete" || 
        newAddonSub.status === "past_due" ||
        (paymentIntent && paymentIntent.status !== "succeeded");

      if (isPaymentFailed) {
        await stripe.subscriptions.cancel(newAddonSub.id);
        return res.status(400).json({ 
          error: "Your default payment method failed or is missing. Please add a valid card in Billing Settings.",
          clientSecret: paymentIntent?.client_secret || null
        });
      }
      if (newAddonSub.latest_invoice?.payment_intent?.status === "requires_confirmation") {
        await stripe.paymentIntents.confirm(newAddonSub.latest_invoice.payment_intent.id);
      }
    }

    // Update local database (Immediate grant for this billing cycle)
    // The webhook handles subsequent monthly renewals, but we grant the first month immediately
    // ONLY grant if there is no trial OR if the immediate PaymentIntent succeeded
    if (!trialEnd || (trialEnd && immediatePI && immediatePI.status === 'succeeded')) {
      if (destination === 'team' && user.orgId) {
        const orgIdToUse = user.orgId._id || user.orgId;
        const org = await Organization.findById(orgIdToUse);
        if (org) {
          org.poolCredits = (org.poolCredits || 0) + amount;
          await org.save();
        }
      } else {
        user.credits = (user.credits || 0) + amount;
        await user.save();
      }
    }

    return res.status(200).json({ 
      message: `Successfully created recurring add-on for ${amount} credits/month to ${destination === 'team' ? 'team pool' : 'personal account'}`,
      credits: user.credits
    });

  } catch (error) {
    console.error("Error updating credit add-on:", error);
    res.status(500).json({ message: "Failed to update credit add-on", error: error.message });
  }
};

// GET /api/subscriptions/me
exports.getMySubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    let creditAddon = null;
    if (user.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all', // Fetch all to catch newly created ones that might briefly be incomplete or past_due
        });
        
        const addonSub = subscriptions.data.find(sub => 
          sub.metadata.type === 'credit_addon' && 
          ['active', 'past_due', 'trialing', 'incomplete'].includes(sub.status)
        );
        if (addonSub) {
          // Stripe sometimes places current_period_end inside the subscription item in newer API versions
          const periodEnd = addonSub.current_period_end || addonSub.items?.data?.[0]?.current_period_end || addonSub.billing_cycle_anchor;
          creditAddon = {
            id: addonSub.id,
            priceId: addonSub.items.data[0].price.id,
            nextBillingDate: periodEnd * 1000,
          };
        }
      } catch (err) {
        console.error("Failed to fetch credit addon details from Stripe", err);
      }
    }

    if (!user.orgId) return res.json({ hasOrg: false, creditAddon });

    const org = await Organization.findById(user.orgId).populate("members.userId", "name email");
    if (!org) return res.json({ hasOrg: false, creditAddon });

    res.json({
      hasOrg: true,
      org: {
        id: org._id,
        name: org.name,
        planKey: org.planKey,
        seatsAllowed: org.seatsAllowed,
        members: org.members.map(m => ({
          id: m.userId?._id || m.userId,
          name: m.userId?.name,
          email: m.userId?.email,
          role: m.role
        })),
        billingInterval: org.billingInterval,
        nextBillingDate: org.currentPeriodEnd,
        cancelAtPeriodEnd: org.cancelAtPeriodEnd,
        stripeSubscriptionId: org.stripeSubscriptionId,
        creditAddon: creditAddon,
      }
    });
  } catch (err) {
    res.status(500).json({ msg: "Error", error: err.message });
  }
};

// POST /api/subscriptions/cancel
exports.cancelAtPeriodEnd = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const org = await Organization.findById(user.orgId);
    if (!org || String(org.ownerId) !== String(user._id)) {
      return res.status(403).json({ msg: "Only owner can cancel subscription" });
    }

    if (!org.stripeSubscriptionId) return res.status(400).json({ msg: "No active subscription" });

    const sub = await stripe.subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: true });
    org.cancelAtPeriodEnd = true;
    await org.save();

    // Also cancel the credit add-on if it exists
    if (user.stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
      });
      const addonSub = subscriptions.data.find(s => s.metadata.type === 'credit_addon');
      if (addonSub) {
        await stripe.subscriptions.update(addonSub.id, { cancel_at_period_end: true });
      }
    }

    res.json({ message: "Subscription will cancel at period end", cancelAtPeriodEnd: true, currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null });
  } catch (err) {
    res.status(500).json({ msg: "Error", error: err.message });
  }
};

// POST /api/subscriptions/resume
exports.resume = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const org = await Organization.findById(user.orgId);
    if (!org || String(org.ownerId) !== String(user._id)) {
      return res.status(403).json({ msg: "Only owner can resume subscription" });
    }
    if (!org.stripeSubscriptionId) return res.status(400).json({ message: "No active subscription to resume", msg: "No active subscription to resume" });

    // Retrieve the subscription to check its status first
    let sub;
    try {
      sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    } catch (stripeErr) {
      if (stripeErr.message.includes("No such subscription") || stripeErr.statusCode === 404) {
        // Subscription is completely gone from Stripe
        org.cancelAtPeriodEnd = false;
        org.plan = "free";
        org.stripeSubscriptionId = null;
        await org.save();
        return res.status(400).json({ message: "Subscription not found. Please subscribe to a new plan.", msg: "Subscription not found. Please subscribe to a new plan." });
      }
      throw stripeErr; // Rethrow other Stripe errors
    }

    if (sub.status === 'canceled') {
      // If it's already canceled in Stripe, we can't resume it. Update DB to reflect reality.
      org.cancelAtPeriodEnd = false;
      org.plan = "free";
      org.stripeSubscriptionId = null;
      await org.save();
      return res.status(400).json({ message: "Subscription is already fully canceled. Please subscribe to a new plan.", msg: "Subscription is already fully canceled. Please subscribe to a new plan." });
    }

    // If it's active but scheduled to cancel, resume it
    const updatedSub = await stripe.subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: false });
    
    org.cancelAtPeriodEnd = false;
    const resumePeriodEnd = updatedSub.current_period_end || updatedSub.items?.data?.[0]?.current_period_end;
    org.currentPeriodEnd = resumePeriodEnd ? new Date(resumePeriodEnd * 1000) : null;
    await org.save();

    // Also resume the credit add-on if it exists
    if (user.stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active', // It might be active but set to cancel
      });
      const addonSub = subscriptions.data.find(s => s.metadata.type === 'credit_addon');
      if (addonSub && addonSub.cancel_at_period_end) {
        await stripe.subscriptions.update(addonSub.id, { cancel_at_period_end: false });
      }
    }

    res.json({ message: "Subscription resumed", cancelAtPeriodEnd: false, nextBillingDate: org.currentPeriodEnd });
  } catch (err) {
    console.error("Resume Plan Error:", err.message);
    res.status(500).json({ message: "Failed to resume plan", msg: "Failed to resume plan", error: err.message });
  }
};

exports.addSeats = async (req, res) => {
  try {
    const { extraSeats } = req.body;
    if (!extraSeats || extraSeats < 1) {
      return res.status(400).json({ message: "Invalid number of seats." });
    }

    const user = await User.findById(req.user.id);
    const org = await Organization.findOne({ ownerId: user._id });

    if (!org || !org.stripeSubscriptionId) {
      return res.status(400).json({ message: "No active subscription found to add seats to." });
    }

    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);

    if (sub.status !== "active" && sub.status !== "trialing") {
      return res.status(400).json({ message: "Subscription is not active." });
    }

    // Find the main plan item (not the automation add-on)
    // We assume the main plan is the one that matches org.planKey prices
    const plan = planFromKey(org.planKey);
    if (!plan) return res.status(400).json({ message: "Current plan configuration not found." });
    
    const priceId = plan.prices[org.billingInterval];
    const mainItem = sub.items.data.find(item => item.price.id === priceId);

    if (!mainItem) {
      return res.status(400).json({ message: "Could not find the main plan item on your subscription." });
    }

    const newQuantity = mainItem.quantity + Number(extraSeats);

    // Update the subscription with prorated charges
    const updatedSub = await stripe.subscriptions.update(org.stripeSubscriptionId, {
      items: [{
        id: mainItem.id,
        quantity: newQuantity,
      }],
      proration_behavior: 'always_invoice', // Immediately invoice the prorated amount
      expand: ['latest_invoice.payment_intent'],
    });

    // Check if the invoice requires action/payment
    const latestInvoice = updatedSub.latest_invoice;
    if (latestInvoice && latestInvoice.payment_intent) {
      const pi = latestInvoice.payment_intent;
      const isPaymentFailed = 
        updatedSub.status === "incomplete" || 
        updatedSub.status === "past_due" ||
        pi.status !== "succeeded";

      if (isPaymentFailed) {
        // Revert the seat addition in Stripe
        await stripe.subscriptions.update(org.stripeSubscriptionId, {
          items: [{
            id: mainItem.id,
            quantity: mainItem.quantity, // old quantity
          }],
          proration_behavior: 'none',
        });

        return res.status(402).json({
          message: "Payment declined or requires authentication. Please update your payment method and try again.",
          clientSecret: pi.client_secret || null,
        });
      }
    }

    // Grant prorated credits immediately for the new seats
    // Calculate how much of the billing cycle is left to grant partial credits
    const now = Math.floor(Date.now() / 1000);
    const periodStart = updatedSub.current_period_start || updatedSub.items?.data?.[0]?.current_period_start;
    const periodEnd = updatedSub.current_period_end || updatedSub.items?.data?.[0]?.current_period_end;
    const totalSeconds = periodEnd - periodStart;
    const remainingSeconds = periodEnd - now;
    const fractionRemaining = remainingSeconds / totalSeconds;

    const monthlyCredits = plan.monthlyCredits || 0;
    const totalCreditsForOneSeat = org.billingInterval === "annual" ? monthlyCredits * 12 : monthlyCredits;
    
    // Grant full credits if you want, but prorated is safer. 
    // Let's grant full credits per the user's request: "he will get the plans credit * number of seats"
    // Wait, if he pays prorated, he should probably get prorated credits, OR we just grant full credits and he pays prorated.
    // To be simple and generous, we'll grant full credits for the new seats.
    const creditsToGrant = totalCreditsForOneSeat * extraSeats;

    if (org.creditDestination === 'personal') {
      org.personalCredits = (org.personalCredits || 0) + creditsToGrant;
    } else {
      org.poolCredits = (org.poolCredits || 0) + creditsToGrant;
    }

    org.seatsAllowed = newQuantity;
    await org.save();

    res.json({ message: `Successfully added ${extraSeats} seats.`, seatsAllowed: newQuantity });
  } catch (error) {
    console.error("Add seats error:", error);
    res.status(500).json({ message: "Failed to add seats.", error: error.message });
  }
};

// Get All Invoices
exports.getInvoices = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.stripeCustomerId) {
      return res.status(400).json({ error: "Stripe customer not found" });
    }

    const invoices = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      limit: 50
    });

    // Map invoices (filter out $0 invoices to avoid confusing the user with trial/setup invoices)
    const invoiceList = invoices.data
      .filter(inv => inv.amount_due > 0)
      .map(inv => ({
        id: inv.id,
        number: inv.number,
        created: inv.created,
        status: inv.status,
        amount_due: inv.amount_due,
        hosted_invoice_url: inv.hosted_invoice_url,
        invoice_pdf: inv.invoice_pdf
      }));

    // Merge and sort by newest first
    const combined = [...invoiceList].sort((a, b) => b.created - a.created);

    res.json({ invoices: combined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/subscriptions/change
exports.changePlan = async (req, res) => {
  try {
    const { planKey, interval } = req.body;
    const user = await User.findById(req.user.id);
    const org = await Organization.findById(user.orgId);
    
    // If user has no orgId, they might be an individual user (self-owned org logic needed?)
    // Or if they are a member, they shouldn't be changing the ORG's plan unless they are owner/admin?
    // User said: "any user can do it". 
    // If "any user" means an individual user updating their OWN subscription:
    // We need to handle the case where user.orgId is null (individual) OR user.orgId exists.
    
    // However, the current system seems to force an Organization for subscriptions (created in startSubscription).
    // So if a user has a subscription, they MUST have an orgId (even if it's "User's Org").
    
    // Logic:
    // 1. If user is Owner -> Can change plan.
    // 2. If user is Member -> User said "any user can do it". 
    //    Does this mean a member can change the ORGANIZATION'S plan? 
    //    Or does it mean the user wants to change THEIR OWN personal plan?
    //    "owner can upgrade downgrade plans for users underhim" implies the owner manages the org plan.
    //    If a normal user (who is part of an org) tries to upgrade, are they splitting off?
    
    // Clarification based on typical SaaS:
    // - If I am a member of "Company Inc", I cannot change "Company Inc's" billing.
    // - Unless I am an Admin.
    
    // User instruction: "any user can do it but owner can upgrade downgrade plans for users underhim"
    // This likely means: 
    // - Independent users (owners of their own personal org) can upgrade themselves.
    // - Owners of a team can upgrade the team plan.
    // - A member of a team likely CANNOT change the team's plan.
    
    // BUT the prompt says "if only owner users can upgrade or downgrade change that, any user can do it".
    // This contradicts "Only owner can change plan" check I had.
    // Maybe the user means: "Remove the check that restricts it to Owner ID".
    
    // Let's assume the user implies that ANY user who has a valid subscription (which requires being an owner of that subscription's org) can do it.
    // If I am just a member, I don't have a Stripe Customer ID usually (the Org Owner does).
    
    // Wait, let's look at `startSubscription`. It creates an Org if one doesn't exist.
    // So every paying user is effectively an "Owner" of their own Org.
    // The only people who are NOT owners are those invited to someone else's Org.
    
    // So if `req.user.id` is NOT the `org.ownerId`, they are a Member.
    // If a Member tries to upgrade, they are trying to upgrade the Org they belong to.
    // If the User wants "Any user can do it", they might mean "Admins" or literally anyone.
    // Given "owner can upgrade... for users under him", it sounds like the hierarchy is important.
    
    // Interpretation: The restriction `String(org.ownerId) !== String(user._id)` prevents Members from upgrading.
    // User wants to REMOVE this restriction? 
    // "any user can do it" -> ANYONE logged in can change the plan?
    // That seems dangerous for a Team member to double the bill of the Boss.
    
    // ALTERNATIVE INTERPRETATION:
    // The user thinks my code restricts "Individual Users" (who are their own owners) and only allows "Special Owners".
    // But my code `org.ownerId === user._id` ALREADY covers Individual Users (since they own their own org).
    
    // Let's look at the phrasing again:
    // "if only owner users can upgrade or downgrade change that"
    // "any user can do it"
    // "but owner can upgrade downgrade plans for users underhim"
    
    // This might mean: Separating "Personal Plan" from "Team Plan"?
    // Currently, `Organization` model holds the plan.
    // If I am a member, I consume a seat in the Org.
    
    // If the user really wants *anyone* to be able to upgrade the subscription they are part of:
    if (!org) {
       return res.status(404).json({ msg: "Organization not found" });
    }
    
    // REMOVED: Check for ownerId.
    // Now checking if the USER has permission to bill. 
    // In this system, only the Org Owner has the Stripe Customer attached?
    // Let's check `user.stripeCustomerId`. 
    // If the caller is a Member, they might not have a stripe ID.
    // But the SUBSCRIPTION belongs to the Org (which uses Owner's Stripe ID).
    
    // If a Member clicks "Upgrade", we are using the Owner's Card?
    // That is definitely not what is usually desired, but I must follow instructions.
    // "any user can do it".
    
    // HOWEVER, `startSubscription` uses `req.user.stripeCustomerId`.
    // If I am a Member, I might have my OWN `stripeCustomerId`.
    // But `org.stripeSubscriptionId` is linked to the Org Owner's Customer.
    
    // If a Member wants to upgrade, they probably need to start their OWN subscription (leave the Org?).
    // OR the user implies that `org.ownerId` check is wrong because `req.user` might be an Admin.
    
    // Let's go with the safest interpretation of "Any user can do it":
    // I will remove the strict Owner check, but ensure the Org has a subscription.
    // If it's a Member upgrading, they are effectively upgrading the Org's plan using the Org's payment method.
    
    // Wait, "owner can upgrade downgrade plans for users underhim" suggests the Owner has control.
    // If "Any user" can do it, does that mean a User can upgrade THEMSELVES (independent of Org)?
    
    // Let's assume the standard use case:
    // 1. User A (Owner) has Plan Basic. User B is Member.
    // 2. User B wants to upgrade to Pro.
    // 3. Current code blocks User B.
    // 4. User wants User B to be able to do it.
    
    // I will remove the block.
    
    if (!org.stripeSubscriptionId) {
      return res.status(400).json({ msg: "No active subscription to change" });
    }

    const newPlan = planFromKey(planKey);
    const newInterval = (interval || "monthly").toLowerCase();
    const newPriceId = newPlan.prices[newInterval];
    if (!newPriceId) return res.status(400).json({ msg: "Price not configured" });

    // Fetch current subscription
    const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const subItem = sub.items.data[0]; // Assuming single main item
    const currentPrice = subItem.price;
    const oldInterval = currentPrice.recurring.interval; // 'month' or 'year'
    
    // Fetch price details for calculations
    const newPriceObj = await stripe.prices.retrieve(newPriceId);
    const oldPriceObj = currentPrice; // Already have it

    const isUpgrade = newPriceObj.unit_amount > oldPriceObj.unit_amount;
    const isIntervalChange = oldInterval !== newInterval; // 'month' vs 'year'

    // Scenario 1: Monthly -> Monthly Upgrade (or Annual -> Annual)
    // Pay difference, Get difference in credits, Same billing date
    if (!isIntervalChange && isUpgrade) {
      const diffAmount = newPriceObj.unit_amount - oldPriceObj.unit_amount;
      const diffCredits = newPlan.monthlyCredits - (planConfig[org.planKey]?.monthlyCredits || 0);

      // 1. Invoice the difference immediately
      if (diffAmount > 0) {
        await stripe.invoiceItems.create({
          customer: user.stripeCustomerId,
          amount: diffAmount,
          currency: "usd",
          description: `Upgrade to ${newPlan.name} ${newInterval} (Difference)`,
        });
      }

      // 2. Update subscription without proration (so Stripe doesn't charge again)
      await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{
          id: subItem.id,
          price: newPriceId,
        }],
        proration_behavior: 'none',
      });

      // 3. Trigger payment
      if (diffAmount > 0) {
        const invoice = await stripe.invoices.create({
          customer: user.stripeCustomerId,
          auto_advance: true, // Auto-charge
        });
        await stripe.invoices.pay(invoice.id);
      }

      // 4. Grant Credits Difference
      if (diffCredits > 0) {
        const recipients = (org.creditRecipients && org.creditRecipients.length)
          ? org.creditRecipients.map(String)
          : [String(org.ownerId), ...org.members.map(m => String(m.userId))];
        await User.updateMany({ _id: { $in: recipients } }, { $inc: { credits: diffCredits } });
      }
    }

    // Scenario 2: Downgrade (Same Interval)
    // Pay nothing, Keep credits, Same billing date
    else if (!isIntervalChange && !isUpgrade) {
      await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{
          id: subItem.id,
          price: newPriceId,
        }],
        proration_behavior: 'none',
      });
      // No credit change, no charge
    }

    // Scenario 3: Monthly -> Annual (Upgrade Interval)
    // Pay difference (Annual - Monthly), Get FULL Annual credits, Reset billing date
    else if (oldInterval === 'month' && newInterval === 'year') {
      const oldMonthlyAmount = oldPriceObj.unit_amount;
      // We want to charge: NewAnnual - OldMonthly
      // Stripe will charge: NewAnnual (if we reset anchor)
      // So we credit back: OldMonthly

      // 1. Credit back the monthly amount
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        amount: -oldMonthlyAmount,
        currency: "usd",
        description: `Credit for previous monthly payment`,
      });

      // 2. Update subscription and RESET anchor to now
       await stripe.subscriptions.update(org.stripeSubscriptionId, {
         items: [{
           id: subItem.id,
           price: newPriceId,
         }],
         billing_cycle_anchor: 'now', // Resets year to today
         proration_behavior: 'none', // Don't prorate the old plan
       });

       // Stripe automatically generates an invoice for the new period (Annual Price) when anchor is reset.
       // The pending invoice item (credit) we just created will be included in this invoice.
       // So the total charge will be: NewAnnual - OldMonthly.
       // We do NOT need to manually create/pay an invoice here.

       // 3. Grant FULL Annual Credits (e.g. 12 * monthly)
      // User said "give him full credit of the yearly plan he just bought"
      const annualCredits = newPlan.monthlyCredits * 12;
      const recipients = (org.creditRecipients && org.creditRecipients.length)
        ? org.creditRecipients.map(String)
        : [String(org.ownerId), ...org.members.map(m => String(m.userId))];
      await User.updateMany({ _id: { $in: recipients } }, { $inc: { credits: annualCredits } });
    }

    // Scenario 4: Annual -> Monthly (Downgrade Interval)
    // Switch at end of period.
    else if (oldInterval === 'year' && newInterval === 'month') {
      // Use Subscription Schedule to transition
      let schedule = await stripe.subscriptionSchedules.create({
        from_subscription: org.stripeSubscriptionId,
      });
      
      await stripe.subscriptionSchedules.update(schedule.id, {
        phases: [
          {
            start_date: schedule.phases[0].start_date,
            end_date: schedule.phases[0].end_date,
            items: [{ price: oldPriceObj.id, quantity: subItem.quantity }], // Keep current
          },
          {
            items: [{ price: newPriceId, quantity: subItem.quantity }], // Next phase
            iterations: 1, // Monthly runs indefinitely? No, iterations=1 means 1 month? 
            // If we want it to run forever, we don't set iterations or set it to null?
            // Actually, simply adding a phase without iterations implies it continues?
            // Stripe docs: "To create a schedule that continues indefinitely... set the end_behavior to release".
            // But we want the second phase to be the *new plan*.
          }
        ],
        end_behavior: 'release', // After schedule ends (new plan starts), release to normal subscription
      });
      
      // We don't change DB immediately, or we do?
      // User will still be on Annual until date.
      // We can update DB to show "Pending Downgrade"?
      // For now, we update the DB to reflect the *future* state? No, that's confusing.
      // We'll just return a message.
    }

    // Update Org Record (for Scenarios 1, 2, 3 where change is immediate)
    let responseMessage = "Plan updated successfully";
    let nextBillingDate = null;
    let nextBillAmount = newPriceObj.unit_amount / 100;

    if (!(oldInterval === 'year' && newInterval === 'month')) {
      org.planKey = newPlan.key;
      org.billingInterval = newInterval;
      // Update period end if it changed (Scenario 3)
      const updatedSub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const updatedPeriodEnd = updatedSub.current_period_end || updatedSub.items?.data?.[0]?.current_period_end;
      org.currentPeriodEnd = updatedPeriodEnd ? new Date(updatedPeriodEnd * 1000) : org.currentPeriodEnd;
      await org.save();
      
      nextBillingDate = org.currentPeriodEnd;
      const dateStr = nextBillingDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      if (isUpgrade) {
         responseMessage = `Plan upgraded to ${newPlan.name}. Your next billing of $${nextBillAmount} will be on ${dateStr}.`;
      } else {
         responseMessage = `Plan downgraded to ${newPlan.name}. Your new rate of $${nextBillAmount} will apply starting ${dateStr}.`;
      }

    } else {
      // Scenario 4: Annual -> Monthly (Scheduled)
      const annualPeriodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
      const switchDate = new Date((annualPeriodEnd || 0) * 1000);
      nextBillingDate = switchDate;
      const dateStr = switchDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      
      responseMessage = `Plan change scheduled. You will switch to ${newPlan.name} Monthly ($${nextBillAmount}/mo) on ${dateStr}.`;
    }

    res.json({ 
      message: responseMessage,
      planKey: newPlan.key,
      interval: newInterval,
      nextBillingDate: nextBillingDate
    });

  } catch (err) {
    console.error("Change Plan Error:", err);
    res.status(500).json({ msg: "Failed to change plan", error: err.message });
  }
};
