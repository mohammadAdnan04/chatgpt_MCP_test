module.exports = {
  BASIC: {
    name: "Basic",
    seats: 1, // Number of seats included for the owner
    maxExtraUsers: 9999, // Unlimited extra users, same as Pro and Premium
    monthlyCredits: 3500,
    prices: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      annual: process.env.STRIPE_PRICE_BASIC_ANNUAL,
    },
  },
  PRO: {
    name: "Pro",
    seats: 1,
    maxExtraUsers: 9999, // Unlimited extra users
    monthlyCredits: 10500,
    prices: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
  },
  PREMIUM: {
    name: "Premium",
    seats: 1,
    maxExtraUsers: 9999, // Unlimited extra users
    monthlyCredits: 21000,
    prices: {
      monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      annual: process.env.STRIPE_PRICE_PREMIUM_ANNUAL,
    },
  },
};
