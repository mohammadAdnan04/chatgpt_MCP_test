const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Organization = require("../models/Organization");
const User = require("../models/User");
const StripeGrant = require("../models/StripeGrant");
const planConfig = require("../config/planConfig");

async function acquireGrantLock({ invoiceId, grantType, customerId, subscriptionId }) {
  try {
    await StripeGrant.create({
      invoiceId,
      grantType,
      customerId: customerId || null,
      subscriptionId: subscriptionId || null,
    });
    return true;
  } catch (err) {
    // Duplicate key => this invoice grant was already processed by another handler/instance
    if (err && err.code === 11000) return false;
    throw err;
  }
}

function maxSeatsForPlan(plan) {
  const includedSeats = Number(plan?.seats || 1);
  const maxExtraUsers = Number(plan?.maxExtraUsers || 0);
  return includedSeats + maxExtraUsers;
}


router.post("/webhooks/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Do not grant plan credits here.
        // Plan credits are granted in invoice.payment_succeeded only, which avoids double-crediting.
        if (session.mode === "subscription" && session.metadata && session.metadata.planKey) {
          try {
            const org = await Organization.findOne({ stripeCustomerId: session.customer });
            if (org) {
              const seats = parseInt(session.metadata.seats, 10) || 1;
              org.seatsAllowed = seats;
              org.subscriptionStatus = "active";
              await org.save();
              console.log(`[Webhook] Checkout completed: synced subscription metadata for ${seats} seats.`);
            }
          } catch (err) {
            console.error("Error processing checkout.session.completed:", err);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        
        // Ignore credit add-on subscriptions entirely so they don't mess with main plan dates
        if (sub.metadata && sub.metadata.type === 'credit_addon') {
          break;
        }

        const org = await Organization.findOne({ stripeSubscriptionId: sub.id }) 
                  || await Organization.findOne({ stripeCustomerId: sub.customer });
        if (org) {
          let periodEnd =
          sub.current_period_end ||
          (sub.items?.data?.[0]?.current_period_end ?? null);

          org.currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;
          // org.currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          org.cancelAtPeriodEnd = !!sub.cancel_at_period_end;
          // If not set earlier, set stripeSubscriptionId now
          if (!org.stripeSubscriptionId) org.stripeSubscriptionId = sub.id;
          await org.save();
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        // Ensure we don't accidentally process credit add-on invoices here 
        // if they somehow get tangled with the subscription cycle logic
        const subId = invoice.subscription;
        
        if (subId) {
          const subscriptionDetails = await stripe.subscriptions.retrieve(subId);
          if (subscriptionDetails.metadata && subscriptionDetails.metadata.type === 'credit_addon') {
            // It's a credit add-on! 
            // We ONLY automatically grant the credits for it on renewal cycles.
            // The initial purchase (subscription_create) is granted instantly by the controller.
            if (invoice.billing_reason === 'subscription_cycle') {
              const lockAcquired = await acquireGrantLock({
                invoiceId: invoice.id,
                grantType: "credit_addon",
                customerId: invoice.customer,
                subscriptionId: subId,
              });
              if (!lockAcquired) {
                console.log(`[Webhook] Skipping duplicate credit add-on grant for invoice ${invoice.id}.`);
                break;
              }

              const dest = subscriptionDetails.metadata.destination || 'personal';
              const priceId = subscriptionDetails.items.data[0].price.id;
              
              let amountToGrant = 0;
              if (priceId === process.env.STRIPE_CREDIT_TIER_1_PRICE_ID || priceId === "price_1TKBZ7EPz0vy11he4aCZd7pX") amountToGrant = 1000;
              else if (priceId === process.env.STRIPE_CREDIT_TIER_2_PRICE_ID || priceId === "price_1TKBa1EPz0vy11he5zKIWI5m") amountToGrant = 5000;
              else if (priceId === process.env.STRIPE_CREDIT_TIER_3_PRICE_ID || priceId === "price_1TKBaUEPz0vy11heBE67Ic8n") amountToGrant = 10000;
              else if (priceId === process.env.STRIPE_CREDIT_TIER_4_PRICE_ID || priceId === "price_1TKBb1EPz0vy11he1i9AWSmZ") amountToGrant = 25000;
              else if (priceId === process.env.STRIPE_CREDIT_TIER_5_PRICE_ID || priceId === "price_1TKBbeEPz0vy11hejCnpVdNv") amountToGrant = 50000;
              else if (priceId === process.env.STRIPE_CREDIT_TIER_6_PRICE_ID || priceId === "price_1TKBcAEPz0vy11hegoDT8hDB") amountToGrant = 100000;
              
              if (amountToGrant > 0) {
                const user = await User.findOne({ stripeCustomerId: invoice.customer });
                if (user) {
                  if (dest === 'team' && user.orgId) {
                    const org = await Organization.findById(user.orgId);
                    if (org) {
                      org.poolCredits = (org.poolCredits || 0) + amountToGrant;
                      await org.save();
                    }
                  } else {
                    user.credits = (user.credits || 0) + amountToGrant;
                    await user.save();
                  }
                }
              }
            }
            break; // Skip granting main plan credits for this invoice
          }
        }

        // Grant credits for initial purchases (subscription_create) and renewals (subscription_cycle).
        // For initial purchases, the controller already grants credits and creates the lock — the webhook
        // will hit a duplicate-key error in acquireGrantLock and skip gracefully.
        // Upgrades (subscription_update) and manual invoices are handled entirely by the controller.
        if (!["subscription_create", "subscription_cycle"].includes(invoice.billing_reason)) {
          break; 
        }

        // Guard against null subId returning a random org via stripeSubscriptionId:null match
        const baseOrg = (subId ? await Organization.findOne({ stripeSubscriptionId: subId }) : null)
                      || await Organization.findOne({ stripeCustomerId: invoice.customer });
        if (baseOrg && baseOrg.planKey && baseOrg.billingInterval) {
          const lockAcquired = await acquireGrantLock({
            invoiceId: invoice.id,
            grantType: "main_plan",
            customerId: invoice.customer,
            subscriptionId: subId,
          });
          if (!lockAcquired) {
            console.log(`[Webhook] Skipping duplicate main plan grant for invoice ${invoice.id}.`);
            break;
          }
          const org = baseOrg;

          const plan = planConfig[org.planKey];
          const monthly = plan.monthlyCredits;
          
          // Prefer Stripe subscription item quantity over local fallback values.
          const mainPlanPriceId = plan.prices[org.billingInterval];
          const mainPlanLine = invoice.lines?.data?.find(line => line.price.id === mainPlanPriceId);
          let quantity = mainPlanLine ? mainPlanLine.quantity : null;
          if (!quantity && subId) {
            try {
              const fullSub = await stripe.subscriptions.retrieve(subId);
              const mainItem = fullSub.items?.data?.find(item => item.price?.id === mainPlanPriceId);
              quantity = mainItem ? mainItem.quantity : null;
            } catch (subErr) {
              console.warn("[Webhook] Could not retrieve subscription quantity:", subErr.message);
            }
          }
          quantity = quantity || 1;
          const maxSeats = maxSeatsForPlan(plan);
          quantity = Math.min(Math.max(quantity, 1), maxSeats);
          
          const creditsToGrant = (org.billingInterval === "annual" ? monthly * 12 : monthly) * quantity;
          
          // Destination is derived strictly from paid seat quantity.
          const destination = quantity > 1 ? 'team' : 'personal';
          console.log(`[Webhook] Granting plan credits for invoice ${invoice.id}: qty=${quantity}, destination=${destination}, credits=${creditsToGrant}`);

          // Grant credits to either the personal or team pool based on preference
          if (destination === 'personal') {
            const user = await User.findOne({ stripeCustomerId: invoice.customer });
            if (user) {
              // RESET credits to exactly the plan amount (no rollover)
              user.credits = creditsToGrant;
              await user.save();
            }
          } else {
            // RESET team pool credits to exactly the plan amount (no rollover)
            org.poolCredits = creditsToGrant;
          }

          // Update seatsAllowed to match the paid quantity
          org.seatsAllowed = quantity;
          org.subscriptionStatus = "active";

          const invoicePeriodEnd = invoice.lines?.data?.[0]?.period?.end;
          if (invoicePeriodEnd) {
            org.currentPeriodEnd = new Date(invoicePeriodEnd * 1000);
          } else if (subId) {
            try {
              const fullSub = await stripe.subscriptions.retrieve(subId);
              const wPeriodEnd = fullSub.current_period_end || fullSub.items?.data?.[0]?.current_period_end;
              if (wPeriodEnd) org.currentPeriodEnd = new Date(wPeriodEnd * 1000);
            } catch (_) {}
          }

          // Reset all members' orgCreditsUsed back to 0 for the new billing cycle
          org.members.forEach(member => {
            member.orgCreditsUsed = 0;
          });

          await org.save();

          // On renewal: if paid seats dropped below current member count, evict excess members.
          // The owner always keeps their spot. Non-owner members added last are removed first.
          if (invoice.billing_reason === 'subscription_cycle' && org.members.length > quantity) {
            // Separate owner from non-owners
            const ownerRecord  = org.members.find(m => m.role === 'owner');
            const nonOwners    = org.members.filter(m => m.role !== 'owner');

            // How many non-owner seats are left after reserving 1 for the owner
            const nonOwnerSeats = Math.max(0, quantity - 1);
            const toKeep        = nonOwners.slice(0, nonOwnerSeats);
            const toEvict       = nonOwners.slice(nonOwnerSeats);

            if (toEvict.length > 0) {
              const evictedIds = toEvict.map(m => m.userId);
              // Rebuild members array with only the keeper records
              org.members = [ownerRecord, ...toKeep].filter(Boolean);
              await org.save();

              // Clear org references on the evicted users
              await User.updateMany(
                { _id: { $in: evictedIds } },
                { $set: { orgId: null, orgRole: null } }
              );
              console.log(`[Webhook] Evicted ${evictedIds.length} member(s) due to seat downgrade (paid seats: ${quantity}).`);
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;

        // Ignore credit add-on subscriptions entirely
        if (sub.metadata && sub.metadata.type === 'credit_addon') {
          break;
        }

        const org = await Organization.findOne({ stripeSubscriptionId: sub.id });
        if (org) {
          org.cancelAtPeriodEnd = true;
          org.subscriptionStatus = "canceled";
          await org.save();
          console.log(`[Webhook] Subscription deleted for org ${org._id}.`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          const org = await Organization.findOne({ stripeSubscriptionId: subId });
          if (org) {
            org.subscriptionStatus = "past_due";
            await org.save();
            console.log(`[Webhook] Payment failed for org ${org._id}. Status set to past_due.`);
          }
        }
        break;
      }

      case "customer.subscription.paused": {
        const sub = event.data.object;
        const org = await Organization.findOne({ stripeSubscriptionId: sub.id });
        if (org) {
          org.subscriptionStatus = "paused";
          await org.save();
          console.log(`[Webhook] Subscription paused for org ${org._id}.`);
        }
        break;
      }

      case "customer.subscription.resumed": {
        const sub = event.data.object;
        const org = await Organization.findOne({ stripeSubscriptionId: sub.id });
        if (org) {
          org.subscriptionStatus = "active";
          await org.save();
          console.log(`[Webhook] Subscription resumed for org ${org._id}.`);
        }
        break;
      }

      default:
        // ignore other events
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handling error:", err);
    res.status(500).send("Webhook handler failed");
  }
});

module.exports = router;
