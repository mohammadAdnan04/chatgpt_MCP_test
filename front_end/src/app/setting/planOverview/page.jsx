"use client";

import DashboardContainer from "@/components/dashboardLayoutContainer";
import Button from "@/components/shared/Button";
import Sidebar from "@/views/setting/Sidebar";
import { ArrowDown01Icon } from "hugeicons-react";
import React, { useRef, useCallback, useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { CardElement, useStripe, useElements, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

// ===== Axios base (Express/Node API) =====
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// Stripe initialization
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "pk_test_51Ma0MMEPz0vy11heZ3hT4rTPl4I7yphI2zuPAxzz2kMav1Q9Hqw6cncuC7BMOTx51W5KBl4CkhCc8LrbMUrUrELU00ZtTk5G0D"
);

// Data for the plans - easy to add or modify plans in the future
const plansData = [
  {
    name: "Basic",
    planKey: "BASIC",
    maxExtraUsers: 9999,
    description:
      "Utilize essential Basic Filters to find your target audience and use unlimited Bulk Export to seamlessly integrate leads into your workflow.",
    monthlyPrice: 124,
    annualMonthlyPrice: 99,
    monthlyCredits: 3500,
    annualCredits: 42000,
    features: [
      "Phone Numbers",
      "Emails",
      "Real-Time/Live Data",
      "Money-Back Guarantee",
      "Bulk Exporting",
      "Chrome Extension",
      "Basic Filters",
      "AI Query / Mawsool Agent",
      "Chat Support",
      "GDPR / CCPA / PDPL Compliance",
    ],
  },
  {
    name: "Professional",
    planKey: "PRO",
    maxExtraUsers: 9999,
    description:
      "Elevate your targeting with Advanced Filters for more precise segmentation and efficiently enrich existing records with Bulk Data Enrichment.",
    monthlyPrice: 312,
    annualMonthlyPrice: 249,
    monthlyCredits: 10500,
    annualCredits: 126000,
    features: [
      "Phone Numbers",
      "Emails",
      "Real-Time/Live Data",
      "Money-Back Guarantee",
      "Bulk Exporting",
      "Chrome Extension",
      "Basic Filters",
      "AI Query / Mawsool Agent",
      "Advanced Filters",
      "Bulk Data Enrichment",
      "Technologies",
      "Chat Support",
      "GDPR / CCPA / PDLC Compliance",
    ],
  },
  {
    name: "Premium",
    planKey: "PREMIUM",
    maxExtraUsers: 9999,
    description:
      "Achieve strategic niche targeting with our most advanced AI tools and receive dedicated expert support to maximize your results.",
    monthlyPrice: 575,
    annualMonthlyPrice: 459,
    monthlyCredits: 21000,
    annualCredits: 252000,
    features: [
      "Phone Numbers",
      "Emails",
      "Real-Time/Live Data",
      "Money-Back Guarantee",
      "Bulk Exporting",
      "Chrome Extension",
      "Basic Filters",
      "AI Query / Mawsool Agent",
      "ICP AI Hunter",
      "Advanced Filters",
      "Bulk Data Enrichment",
      "Technologies",
      "Investment Data",
      "Geo-Smart Numbers",
      "Chat Support",
      "Dedicated Success Manager",
      "GDPR / CCPA / PDPL Compliance",
    ],
  },
];

// Credit pricing tiers with Stripe Price IDs from environment variables
const creditTiers = [
  { credits: 0, price: 0, perCredit: 0, priceId: null },
  { credits: 1000, price: 38, perCredit: 0.038, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_1_PRICE_ID || "price_1TKBZ7EPz0vy11he4aCZd7pX" },
  { credits: 5000, price: 175, perCredit: 0.035, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_2_PRICE_ID || "price_1TKBa1EPz0vy11he5zKIWI5m" },
  { credits: 10000, price: 320, perCredit: 0.032, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_3_PRICE_ID || "price_1TKBaUEPz0vy11heBE67Ic8n" },
  { credits: 25000, price: 725, perCredit: 0.029, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_4_PRICE_ID || "price_1TKBb1EPz0vy11he1i9AWSmZ" },
  { credits: 50000, price: 1300, perCredit: 0.026, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_5_PRICE_ID || "price_1TKBbeEPz0vy11hejCnpVdNv" },
  { credits: 100000, price: 2300, perCredit: 0.023, priceId: process.env.NEXT_PUBLIC_STRIPE_CREDIT_TIER_6_PRICE_ID || "price_1TKBcAEPz0vy11hegoDT8hDB" },
];

// Reusable component for info cards
const InfoCard = ({ icon, value, label }) => (
  <div className="w-full flex items-start gap-7 p-4 rounded-2xl border border-[#E5E6E6]">
    <div className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#C7F5FF]">
      <img src={icon} className="select-none" draggable={false} alt={label} />
    </div>
    <div className="flex flex-col gap-2.5">
      <p className="text-2xl font-bold text-[#222]">{value}</p>
      <p className="text-xs text-[#434343]">{label}</p>
    </div>
  </div>
);

// Reusable component for features in plan cards
const FeatureItem = ({ text }) => (
  <div className="flex items-center gap-1">
    <img
      src="/icons/doubleTick.svg"
      className="select-none"
      draggable={false}
      alt="feature"
    />
    <p className="text-xs text-[#434343]">{text}</p>
  </div>
);

// Interactive widget for transferring credits between personal and team pool
const CreditTransferWidget = ({ personalCredits, poolCredits, memberCreditLimit, memberCreditsUsed, onTransfer }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [personalInput, setPersonalInput] = useState(personalCredits);
  const [poolInput, setPoolInput] = useState(poolCredits);
  const [isTransferring, setIsTransferring] = useState(false);

  const totalCredits = personalCredits + poolCredits;

  const handlePersonalChange = (e) => {
    const val = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
    const boundedVal = Math.min(Math.max(val, 0), totalCredits);
    setPersonalInput(boundedVal);
    setPoolInput(totalCredits - boundedVal);
  };

  const handlePoolChange = (e) => {
    const val = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
    const boundedVal = Math.min(Math.max(val, 0), totalCredits);
    setPoolInput(boundedVal);
    setPersonalInput(totalCredits - boundedVal);
  };

  const handleSave = async () => {
    if (personalInput === personalCredits) {
      setIsEditing(false);
      return;
    }
    
    setIsTransferring(true);
    
    // Determine direction and amount
    let direction = "";
    let amount = 0;
    
    if (personalInput < personalCredits) {
      direction = "personal_to_team";
      amount = personalCredits - personalInput;
    } else {
      direction = "team_to_personal";
      amount = personalInput - personalCredits;
    }
    
    try {
      const response = await api.post("/api/credits/transfer", {
        amount,
        direction
      });
      
      Swal.fire({
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        title: "Transfer Successful",
        text: response.data.msg || "Credits have been moved successfully.",
        timer: 1500,
        showConfirmButton: false,
      });
      
      if (onTransfer) {
        onTransfer(response.data);
      }
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to transfer credits:", error);
      Swal.fire({
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        title: "Transfer Failed",
        text: error.response?.data?.msg || "An error occurred while transferring credits.",
      });
      // Revert inputs
      setPersonalInput(personalCredits);
      setPoolInput(poolCredits);
    } finally {
      setIsTransferring(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setPersonalInput(personalCredits);
    setPoolInput(poolCredits);
  };

  if (!isEditing) {
    return (
      <>
        <div className="w-full relative flex items-center justify-center h-full">
          <InfoCard
            icon="/icons/coin.svg"
            value={personalCredits.toLocaleString()}
            label="Personal Credits"
          />
          <button 
            onClick={() => setIsEditing(true)}
            className="absolute top-1/2 -right-4 md:-right-[18px] transform -translate-y-1/2 z-10 bg-white border border-[#E5E6E6] rounded-full p-2 shadow-sm hover:bg-[#F3F6FF] hover:border-[#00D2FF] hover:text-[#00D2FF] text-[#04145C] transition-all"
            title="Transfer credits between Personal and Team Pool"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4"></path><path d="M3 7h18"></path><path d="M7 21l-4-4 4-4"></path><path d="M21 17H3"></path></svg>
          </button>
        </div>
        <div className="w-full pl-0 md:pl-2">
          {memberCreditLimit !== null ? (
            <InfoCard
              icon="/icons/coin.svg"
              value={`${(memberCreditsUsed ?? 0).toLocaleString()} / ${memberCreditLimit.toLocaleString()}`}
              label="Team Credits Used"
            />
          ) : (
            <InfoCard
              icon="/icons/coin.svg"
              value={poolCredits.toLocaleString()}
              label="Team Pool Credits"
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="w-full md:col-span-2 lg:col-span-2 flex flex-col gap-3 p-4 rounded-2xl border-2 border-[#00D2FF] bg-[#F3F6FF] shrink-0" style={{ flex: '2 1 0%' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-bold text-[#04145C]">Transfer Credits</p>
        <div className="flex gap-2">
          <button onClick={cancelEdit} disabled={isTransferring} className="text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={isTransferring} className="text-xs px-3 py-1.5 bg-[#04145C] text-white hover:bg-[#052074] rounded-lg transition-colors flex items-center gap-1">
            {isTransferring ? (
              <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...</>
            ) : "Save Transfer"}
          </button>
        </div>
      </div>
      <div className="w-full flex flex-col md:flex-row items-center gap-4 relative">
        {/* Editable Personal */}
        <div className="w-full flex items-start gap-7 p-4 rounded-2xl border border-[#00D2FF] bg-white">
          <div className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#C7F5FF]">
            <img src="/icons/coin.svg" className="select-none" draggable={false} alt="Personal Credits" />
          </div>
          <div className="flex flex-col gap-1 w-full">
            <input 
              type="number" 
              step="100"
              value={personalInput} 
              onChange={handlePersonalChange}
              disabled={isTransferring}
              className="text-2xl font-bold text-[#222] w-full border-b border-dashed border-gray-300 focus:border-[#04145C] focus:outline-none pb-1 bg-transparent"
            />
            <p className="text-xs text-[#434343]">Personal Credits</p>
          </div>
        </div>
        
        {/* Link Icon */}
        <div className="hidden md:flex shrink-0 text-[#00D2FF]">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4"></path><path d="M3 7h18"></path><path d="M7 21l-4-4 4-4"></path><path d="M21 17H3"></path></svg>
        </div>
        
        {/* Editable Team */}
        <div className="w-full flex items-start gap-7 p-4 rounded-2xl border border-[#00D2FF] bg-white">
          <div className="flex items-center justify-between gap-2.5 p-2 rounded-lg bg-[#C7F5FF]">
            <img src="/icons/coin.svg" className="select-none" draggable={false} alt="Team Pool Credits" />
          </div>
          <div className="flex flex-col gap-1 w-full">
            <input 
              type="number" 
              step="100"
              value={poolInput} 
              onChange={handlePoolChange}
              disabled={isTransferring}
              className="text-2xl font-bold text-[#222] w-full border-b border-dashed border-gray-300 focus:border-[#04145C] focus:outline-none pb-1 bg-transparent"
            />
            <p className="text-xs text-[#434343]">Team Pool Credits</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-center text-[#6B7271] mt-1">Adjust one box to automatically move credits from the other.</p>
    </div>
  );
};

// Reusable component for plan cards
const PlanCard = ({ plan, isCurrent, isAnnual, onPlanPreview, disabled }) => {
  const [isPlanLoading, setIsPlanLoading] = useState(false);

  const displayedCredits = isAnnual ? plan.annualCredits : plan.monthlyCredits;
  const creditText = `${displayedCredits.toLocaleString()} Credits${isAnnual ? "/Year" : ""}`;

  const handleClick = () => {
    if (disabled) return;
    onPlanPreview(plan, isAnnual ? "annual" : "monthly");
  };

  return (
    <div
      className={`w-full flex flex-col items-center text-center gap-4 pt-[30px] px-4 pb-4 rounded-2xl border transition-all duration-300 ${
        isCurrent
          ? "border-[#00D2FF] bg-[#F3F6FF] shadow-[0_0_15px_rgba(0,210,255,0.4)]"
          : "border-[#E5E6E6] hover:bg-[#F8F9FA] cursor-pointer"
      }`}
      onClick={handleClick}
    >
      <h1 className="text-2xl font-medium text-[#222]">{plan.name}</h1>
      <p className="text-xs text-[#434343] max-w-[250px]">{plan.description}</p>
      <div>
        <h1 className="text-[34px] font-bold text-[#222]">
          ${isAnnual ? plan.annualMonthlyPrice : plan.monthlyPrice}
          <span className="text-sm font-normal text-[#434343]">/month</span>
        </h1>
        {isAnnual ? (
          <div className="text-xs">
            Billed annually at <b>${plan.annualMonthlyPrice * 12}</b>
          </div>
        ) : (
          ""
        )}
      </div>
      <div className="w-full h-[1px] bg-[#E5E6E6]"></div>
      <div className="w-full h-full flex flex-col gap-2.5 text-start">
        <FeatureItem text={creditText} />
        {plan.features.map((feature, index) => (
          <FeatureItem key={index} text={feature} />
        ))}
      </div>
      <button
        className={`group leading-[24px] gap-2.5 flex items-center justify-center rounded-full px-[38px] py-[15px] font-bold text-base w-full !rounded-xl !py-2 transition-colors ${
          isPlanLoading || disabled || (isCurrent && (plan.maxExtraUsers || 0) === 0)
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : isCurrent
            ? "bg-[#E8F1FF] text-[#04145C] border border-[#04145C] hover:bg-[#dce8ff] cursor-pointer"
            : "bg-[#04145C] text-white hover:bg-[#052074] cursor-pointer"
        }`}
        disabled={isPlanLoading || disabled || (isCurrent && (plan.maxExtraUsers || 0) === 0)}
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        {isPlanLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
            Processing...
          </div>
        ) : (
          isCurrent 
            ? ((plan.maxExtraUsers || 0) === 0 ? "Current Plan" : "Buy More Seats") 
            : "Upgrade Plan"
        )}
      </button>
    </div>
  );
};

const DestinationDropdown = ({ destination, setDestination, namePrefix = "destination" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', h, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', h, true); document.removeEventListener('keydown', onKey, true); };
  }, []);

  const labelText = destination === 'team' ? 'Team Pool' : 'Personal Account';

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg bg-white shadow-sm hover:bg-[#F8F9FA] active:bg-[#F0F1F1] focus:outline-none transition-colors border-[#E5E6E6] focus:ring-2 focus:ring-[#04145C]"
        onClick={() => setOpen((v)=> !v)}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        title="Select destination"
      >
        <svg className="w-5 h-5 text-[#222]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        <span className="text-sm text-[#222]">{labelText}</span>
        <svg className={`w-4 h-4 text-[#6B7271] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-2 w-[220px] bg-white rounded-xl shadow-lg border border-[#F0F1F1] overflow-hidden right-0" onClick={(e)=> e.stopPropagation()}>
          <ul className="py-1 max-h-64 overflow-auto" role="listbox" aria-label="Destination">
            <li>
              <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 active:bg-gray-200 cursor-pointer">
                <input type="radio" name={namePrefix} checked={destination === 'personal'} onChange={() => { setDestination('personal'); setOpen(false); }} />
                <span className="text-sm text-[#222]">Personal Account</span>
              </label>
            </li>
            <li>
              <label className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 active:bg-gray-200 cursor-pointer">
                <input type="radio" name={namePrefix} checked={destination === 'team'} onChange={() => { setDestination('team'); setOpen(false); }} />
                <span className="text-sm text-[#222]">Team Pool</span>
              </label>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

// ===== Add Card Component (Embedded from Billing) =====
const AddCard = ({ onClose, onAdded }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await api.post("api/payment/create-setup-intent");
        const data = res?.data;
        if (!data || !data.clientSecret) throw new Error("Missing clientSecret.");
        if (mounted) setClientSecret(data.clientSecret);
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || "Failed to initialize payment setup");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSaveCard = useCallback(async () => {
    if (!stripe || !elements) { setError("Stripe is not initialized"); return; }
    if (!clientSecret) { setError("Missing client secret"); return; }
    setLoading(true);
    setError(null);
    
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) { setError("Card element not ready."); setLoading(false); return; }
    
    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });
    
    if (error) { setError(error.message || "Unable to save card"); setLoading(false); return; }
    
    try {
      await api.post("/api/payment/set-default-payment-method", {
        paymentMethodId: setupIntent.payment_method,
      });
      onAdded && onAdded();
      onClose && onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to set card as default");
    } finally {
      setLoading(false);
    }
  }, [clientSecret, elements, onAdded, onClose, stripe]);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="rounded-xl border border-[#E5E6E6] bg-white p-3">
        <CardElement options={{ style: { base: { fontSize: "14px", color: "#222", "::placeholder": { color: "#6B7271" } } } }} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" className="w-fit !rounded-xl !bg-white !text-[#434343] border-[#434343]" onClick={onClose} disabled={loading} arrow={false}>Cancel</Button>
        <Button variant="small" className="w-fit !rounded-xl" onClick={handleSaveCard} disabled={loading}>{loading ? "Saving..." : "Save Card"}</Button>
      </div>
    </div>
  );
};

// Component for the upgrade summary (sticky)
const UpgradeSummary = ({
  selectedPlan,
  numSeats,
  setNumSeats,
  isAnnual,
  onUpgrade,
  canUpgrade,
  containerWidth,
  isProcessing,
  currentPlan,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomationChecked, setIsAutomationChecked] = useState(false);
  const [automationUsers, setAutomationUsers] = useState(1);

  const [isAddCardModalOpen, setIsAddCardModalOpen] = useState(false);

  if (!selectedPlan) return null;

  const baseMonthly = isAnnual
    ? selectedPlan.annualMonthlyPrice
    : selectedPlan.monthlyPrice;
  const totalMonthly = baseMonthly * numSeats;
  const totalAnnual = baseMonthly * 12 * numSeats;
  const automationCost = isAutomationChecked ? 149 * automationUsers : 0;
  const newTotalPrice = isAnnual
    ? totalAnnual + automationCost * 12
    : totalMonthly + automationCost;
  const billingLabel = isAnnual
    ? `${totalAnnual + automationCost * 12}/yr`
    : `${totalMonthly + automationCost}/mo`;

  // Compute how much is actually due today (difference for upgrades, $0 for downgrades)
  const currentPlanData = plansData.find(p => p.planKey === currentPlan?.planKey);
  const hasActivePlan = !!currentPlanData && currentPlan?.planKey !== 'FREE';
  const currentIsAnnual = currentPlan?.billingInterval === 'annual';
  const currentTotalPrice = hasActivePlan
    ? (currentIsAnnual ? currentPlanData.annualMonthlyPrice * 12 : currentPlanData.monthlyPrice) * (currentPlan?.seatsAllowed || 1)
    : 0;
  const priceDiff = newTotalPrice - currentTotalPrice;
  const isDowngrade = hasActivePlan && priceDiff < 0;
  const dueToday = isDowngrade ? 0 : (hasActivePlan ? Math.max(0, priceDiff) : newTotalPrice);

  return (
    <>
      <div className="p-10"></div>
      <div
        className="p-4 rounded border border-[#E5E6E6] bg-white shadow-lg z-10 relative"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1000px, calc(100vw - 2rem))",
          maxWidth: "calc(100vw - 2rem)",
        }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white border border-red-300 transition-colors text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 shrink-0 min-w-[200px]">
            <img
              src="/icons/multipleUsers.svg"
              className="w-8 h-8 select-none"
              draggable={false}
              alt="Summary"
            />
            <div>
              <p className="text-sm font-medium text-[#434343]">Summary</p>
              <p className="text-base font-semibold text-[#222]">
                {selectedPlan?.name || "Free"} Plan
              </p>
            </div>
          </div>
          <div className="flex flex-row items-center justify-end flex-wrap gap-y-4 text-right overflow-x-auto relative w-full ml-8">
            <div className="flex flex-col items-start gap-1 p-4 px-6 border-r border-[#E5E6E6] w-[260px] relative">
              <div 
                className="flex items-center justify-between w-full cursor-pointer group"
                onClick={() => setIsAutomationChecked(!isAutomationChecked)}
              >
                <div className="flex flex-col text-left mr-4">
                  <p className="text-sm font-semibold text-[#222]">Automation Add-on</p>
                  <p className="text-[11px] text-[#6B7271]">LinkedIn & Email sequences</p>
                </div>
                <div
                  className={`w-11 h-6 p-0.5 flex items-center rounded-full relative transition-colors duration-300 shrink-0 ${
                    isAutomationChecked ? "bg-[#00D2FF]" : "bg-[#E5E6E6] group-hover:bg-[#D1D1D1]"
                  }`}
                >
                  <div
                    className={`w-5 h-5 absolute top-0.5 bg-white shadow-sm rounded-full transition-transform duration-300 ${
                      isAutomationChecked ? "translate-x-5" : "translate-x-0"
                    }`}
                  ></div>
                </div>
              </div>
              
              <div className={`flex items-center justify-between w-full bg-[#FBFBFC] border border-[#E5E6E6] rounded-xl p-2 px-3 shadow-sm transition-all duration-300 overflow-hidden ${isAutomationChecked ? 'max-h-[50px] opacity-100 mt-2' : 'max-h-0 opacity-0 border-transparent m-0 py-0'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[#6B7271]">Seats:</span>
                  <select
                    value={automationUsers}
                    onChange={(e) => setAutomationUsers(Number(e.target.value))}
                    className="bg-white border border-[#E5E6E6] rounded-md text-xs font-semibold text-[#04145C] py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-[#00D2FF] cursor-pointer"
                  >
                    {[...Array(numSeats).keys()].map((i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col items-end">
                  <p className="text-sm font-bold text-[#04145C]">+${automationUsers * 149}</p>
                  <p className="text-[9px] text-[#6B7271]">{automationUsers} × $149/mo</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-row items-center justify-between flex-1 px-6">
              <div className="flex flex-col items-start gap-1">
                <p className="text-[11px] font-medium text-[#6B7271] uppercase tracking-wider">Seats</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setNumSeats(Math.max(1, numSeats - 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-[#F3F6FF] border border-[#00D2FF] text-[#04145C] font-bold text-base hover:bg-[#dce8ff] transition-colors select-none"
                  >−</button>
                  <span className="w-8 text-center text-[15px] font-bold text-[#04145C]">{numSeats}</span>
                  <button
                    onClick={() => {
                      const maxSeats = (selectedPlan.maxExtraUsers || 0) + 1;
                      if (numSeats < maxSeats) {
                        setNumSeats(numSeats + 1);
                      } else {
                        Swal.fire({
                          title: "Maximum Seats Reached",
                          text: `The ${selectedPlan.name} plan supports a maximum of ${maxSeats} seat(s). Please upgrade to a higher plan for more seats.`,
                          icon: "info",
                          timer: 4000,
                          showConfirmButton: false,
                        });
                      }
                    }}
                    className={`w-7 h-7 flex items-center justify-center rounded-md border font-bold text-base transition-colors select-none ${
                      numSeats >= ((selectedPlan.maxExtraUsers || 0) + 1) 
                        ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-[#F3F6FF] border-[#00D2FF] text-[#04145C] hover:bg-[#dce8ff]"
                    }`}
                  >+</button>
                </div>
              </div>
              <div className="flex flex-col items-start gap-1">
                <p className="text-[11px] font-medium text-[#6B7271] uppercase tracking-wider">Billed</p>
                <div className="text-[15px] font-bold text-[#222]">
                  {billingLabel}*
                </div>
              </div>
              <div className="flex flex-col items-start gap-1">
                <p className="text-[11px] font-medium text-[#6B7271] uppercase tracking-wider">Due Today</p>
                <div className="text-[18px] font-black text-[#04145C]">
                  ${dueToday}
                </div>
                {isDowngrade && (
                  <p className="text-[10px] text-[#6B7271]">No charge – new rate starts next billing date</p>
                )}
                {hasActivePlan && !isDowngrade && priceDiff > 0 && (
                  <p className="text-[10px] text-[#6B7271]">Upgrade difference only</p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center border-l border-[#E5E6E6] pl-6 ml-2 shrink-0">
              <Button
                arrow={false}
                className="w-full min-w-[140px] !rounded-xl !py-2.5 bg-[#04145C] hover:bg-[#052074] text-white shadow-md hover:shadow-lg transition-all active:scale-95 active:bg-[#030e42]"
                onClick={() => {
                  if (!canUpgrade || isLoading || isProcessing) return;
                  setIsLoading(true);
                  // First attempt to upgrade
                  onUpgrade({ 
                    isAutomationChecked, 
                    automationUsers, 
                    dueToday,
                    onNeedsPaymentMethod: () => {
                      setIsLoading(false);
                      setIsAddCardModalOpen(true);
                    },
                    onFinally: () => setIsLoading(false)
                  });
                }}
                disabled={isLoading || isProcessing || !canUpgrade}
              >
                {isLoading || isProcessing ? (
                  <div className="flex items-center justify-center gap-2 w-full">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  (canUpgrade
                    ? isDowngrade
                      ? "Switch Plan"
                      : dueToday === 0
                      ? "Confirm Change"
                      : `Confirm & Pay $${dueToday}`
                    : "Select Users First")
                )}
              </Button>
              <p className="text-[9px] text-[#6B7271] mt-2 text-center whitespace-nowrap">
                *Taxes calculated at checkout
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Add Card Modal */}
      {isAddCardModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-[#FBFBFC] rounded-2xl p-6 w-full max-w-md border border-[#E5E6E6] shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <p className="text-[#565656] text-[22px] font-bold">Add Payment Method</p>
              <button
                className="text-[#434343] hover:text-[#222]"
                onClick={() => {
                  setIsAddCardModalOpen(false);
                  setIsLoading(false);
                }}
                aria-label="Close modal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>
              </button>
            </div>
            <Elements stripe={stripePromise}>
              <AddCard
                onClose={() => {
                  setIsAddCardModalOpen(false);
                  setIsLoading(false);
                }}
                onAdded={() => {
                  setIsAddCardModalOpen(false);
                  setIsLoading(true);
                  // Automatically retry the upgrade after successfully adding card
                  onUpgrade({ 
                    isAutomationChecked, 
                    automationUsers,
                    dueToday,
                    onFinally: () => setIsLoading(false)
                  });
                }}
              />
            </Elements>
          </div>
        </div>
      )}

      {/* Full Page Processing Overlay */}
      {isProcessing && !isAddCardModalOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#04145C]/40 backdrop-blur-md transition-all duration-300">
          <div className="bg-white/95 p-8 rounded-3xl shadow-[0_0_40px_rgba(4,20,92,0.15)] border border-[#E5E6E6] flex flex-col items-center gap-6 transform scale-100 animate-in zoom-in-95 duration-300 min-w-[320px]">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-20 h-20 bg-[#00D2FF]/20 rounded-full animate-ping"></div>
              <div className="w-16 h-16 border-4 border-[#F3F6FF] border-t-[#00D2FF] border-r-[#04145C] rounded-full animate-spin z-10"></div>
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="w-6 h-6 bg-gradient-to-tr from-[#04145C] to-[#00D2FF] rounded-full animate-pulse shadow-inner"></div>
              </div>
            </div>
            <div className="text-center flex flex-col gap-1.5">
              <p className="text-[#04145C] font-black text-xl tracking-tight">Processing Upgrade</p>
              <p className="text-[#6B7271] text-[13px] font-medium max-w-[240px] leading-relaxed">
                Securely setting up your subscription.<br/>Please do not close this window.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Component for the credit purchase section
const CreditPurchase = ({ onCreditsUpdated, teamMembers, user, creditAddon, currentPlan, onRequirePaymentMethod, destination }) => {
  const [selectedTierIndex, setSelectedTierIndex] = useState(0); // Index of selected tier
  const [dragging, setDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();

  // Initialize slider with the user's active credit add-on tier
  useEffect(() => {
    if (creditAddon && creditAddon.priceId) {
      const activeIndex = creditTiers.findIndex(t => t.priceId === creditAddon.priceId);
      if (activeIndex !== -1) {
        setSelectedTierIndex(activeIndex);
      }
    } else {
      setSelectedTierIndex(0);
    }
  }, [creditAddon]);

  // Get current tier based on index
  const currentTier = creditTiers[selectedTierIndex];
  const { credits, price, perCredit } = currentTier;
  const maxTierIndex = creditTiers.length - 1;

  const handleSliderChange = (e) => {
    const newIndex = Number(e.target.value);
    setSelectedTierIndex(newIndex);
    // Clear messages when user changes tier
    setError("");
    setSuccessMessage("");
  };

  const handleBuyCredits = async () => {
    const result = await Swal.fire({
        imageUrl: "/icons/mawsool-warning.webp",
        imageHeight: 200,
        imageAlt: "Custom alert icon",
        title: credits === 0 ? "Cancel Credit Add-on?" : "Update Credit Add-on?",
        text: credits === 0 
          ? "Are you sure you want to stop receiving monthly extra credits?" 
          : `Do you want to add a recurring add-on of ${credits.toLocaleString()} credits for $${price}/month to your ${destination === 'team' ? 'Team Pool' : 'Personal Account'}?`,
        showCancelButton: true,
        confirmButtonText: credits === 0 ? "Yes, cancel it" : "Yes, update it",
        cancelButtonText: "No, go back",
        customClass: {
          confirmButton: "swal-confirm-button",
          cancelButton: "swal-cancel-button",
        },
      });

    if (result.isConfirmed) {
      try {
        setIsLoading(true);
        setError("");
        setSuccessMessage("");

        const amt = parseInt(credits);
        
        const response = await api.post("/api/subscriptions/update-credit-addon", {
          amount: amt,
          destination: destination,
          priceId: currentTier.priceId,
        });

        // Push payment_success event to Google Tag Manager Data Layer if purchasing an add-on
        if (credits > 0 && price > 0) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            'event': 'payment_success',
            'value': price,
            'currency': 'USD'
          });
        }

        Swal.fire({
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          title: "Success",
          text: response.data.message || (credits === 0 ? "Credit add-on canceled successfully" : "Credit add-on updated successfully"),
          timer: 1500,
          showConfirmButton: false,
        });

        // Update credits in parent component
        if (onCreditsUpdated && response.data.credits !== undefined) {
          // Pass back the new credits and the newly active priceId
          onCreditsUpdated(response.data.credits, credits === 0 ? null : currentTier.priceId);
        }

        // Keep slider at current position unless canceled
        if (credits === 0) {
          setSelectedTierIndex(0);
        }
      } catch (error) {
        console.error("Failed to create payment session:", error);
        let errorMessage = "Failed to initiate payment";
        if (error.response?.status === 401) {
          errorMessage = "Authentication failed. Please log in again.";
        } else if (error.response?.status === 400) {
          errorMessage = error.response.data?.error || "Invalid credit amount.";
          Swal.fire({
            title: "Payment Method Required",
            text: errorMessage,
            imageUrl: "/icons/mawsool-warning.webp",
            imageAlt: "Custom alert icon",
            confirmButtonText: "Add Payment Method",
            customClass: {
              confirmButton: "swal-confirm-button",
            },
          }).then((result) => {
            if (result.isConfirmed) {
              if (onRequirePaymentMethod) {
                onRequirePaymentMethod();
              } else {
                router.push("/setting/billing");
              }
            }
          });
          return;
        } else if (error.response?.status === 402) {
          errorMessage = "Payment processing failed. Please try again.";
        } else if (error.response?.status === 403) {
          errorMessage = "Access denied. Unable to process payment.";
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }

        setError(errorMessage);
        Swal.fire({
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          title: "Error",
          text: errorMessage,
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Calculate slider percentage based on current tier index
  const sliderPercentage = (selectedTierIndex / maxTierIndex) * 100;

  return (
    <div className="w-full flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-[#E5E6E6] self-stretch bg-[#FBFBFC]">
      {/* Error Message */}
      {error && (
        <div className="w-full p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 flex items-center justify-between mb-2">
          <span className="text-sm">{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="w-full p-3 bg-green-100 border border-green-300 rounded-lg text-green-700 flex items-center justify-between mb-2">
          <span className="text-sm">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage("")}
            className="ml-2 text-green-500 hover:text-green-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      <div className="w-full flex items-start gap-2.5 justify-between">
        <div className="flex flex-col gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/coinGradient.svg"
              className="w-[30px] select-none"
              draggable={false}
              alt="Buy Credits"
            />
            <p className="font-medium text-[#222]">Monthly Credit Add-on</p>
            <p className="text-xs text-[#434343]">
              Select the amount of monthly credits you need using the slider below, then
              click 'Update'. To cancel, drag the slider to 0.
            </p>
            {creditAddon && creditAddon.priceId && (() => {
              const activeTier = creditTiers.find(t => t.priceId === creditAddon.priceId);
              if (!activeTier) return null;
              return (
                <div className="mt-2 p-3 bg-[#F0F4FF] border border-[#BDE0FF] rounded-lg">
                  <p className="text-sm text-[#04145C] font-medium">
                    Active Add-on: {activeTier.credits.toLocaleString()} Credits/month
                  </p>
                  <p className="text-xs text-[#434343] mt-1">
                    {currentPlan?.cancelAtPeriodEnd ? (
                      <>This add-on will be canceled along with your main plan on <strong>{new Date(currentPlan.nextBillingDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</strong>.</>
                    ) : (
                      <>You will be billed for this add-on again on <strong>{new Date(creditAddon.nextBillingDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })}</strong>.</>
                    )}
                    {!currentPlan?.cancelAtPeriodEnd && " To cancel future billing, drag the slider to 0 and click Update."}
                  </p>
                </div>
              );
            })()}
          </div>
          <div className="flex flex-col justify-center items-center py-2 px-[30px] rounded-xl bg-[#C7F5FF]">
          <h2 className="text-[26px] font-bold text-[#222]">${price}</h2>
          <p className="text-xs text-[#434343]">
            {credits.toLocaleString()} Credits/mo
          </p>
          {credits > 0 && <p className="text-xs text-[#434343]">${perCredit.toFixed(3)} per credit</p>}
        </div>
      </div>
      <div className="w-full pt-10 flex items-center justify-between gap-5">
        <div className="w-full h-2 bg-[#E9E9E9] rounded-full relative mt-6">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-[#5D17D5] to-[#00D2FF]"
            style={{ width: `${sliderPercentage}%`, transition: 'width 200ms ease' }}
          ></div>
          <div
            className={`absolute -top-[10px] w-6 h-6 bg-white border-[#515151] border rounded-full shadow-md flex items-center justify-center ${dragging ? 'cursor-grabbing' : 'cursor-grab'} transition-all`}
            style={{ left: `calc(${sliderPercentage}% - 12px)`, transition: 'left 200ms ease' }}
          >
            {/* Dynamic Floating Tooltip */}
            <div 
              className="absolute -top-10 bg-[#04145C] text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg whitespace-nowrap pointer-events-none transform -translate-y-1"
            >
              {credits === 0 ? "0" : credits.toLocaleString()}
              {/* Tooltip Arrow */}
              <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#04145C]"></div>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={maxTierIndex}
            step={1}
            value={selectedTierIndex}
            onChange={handleSliderChange}
            onInput={handleSliderChange}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onTouchStart={() => setDragging(true)}
            onTouchEnd={() => setDragging(false)}
            className="w-full -translate-y-4 z-50 h-full opacity-0 cursor-grab"
            disabled={isLoading}
            aria-label="Select credit tier"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1 mr-2">
            <span className="text-[11px] text-[#6B7271]">Destination:</span>
            <div className="relative">
              <button
                className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg bg-white shadow-sm focus:outline-none transition-colors border-[#E5E6E6] cursor-default"
                title={destination === 'team' ? 'Team Pool' : 'Personal Account'}
                disabled
              >
                {destination === 'team' ? (
                  <>
                    <svg className="w-5 h-5 text-[#222]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m10-4a4 4 0 11-8 0 4 4 0 018 0zM6 7a4 4 0 108 0 4 4 0 00-8 0z"/>
                    </svg>
                    <span className="text-sm text-[#222]">Team Pool</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-[#222]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                    <span className="text-sm text-[#222]">Personal Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <Button
            arrow={false}
            className={`min-w-fit !py-2 !px-2.5 !rounded-xl font-normal ${
              isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={handleBuyCredits}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </div>
            ) : (
              credits === 0 ? "Cancel Add-on" : "Update"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

const PlanOverview = () => {
  const { user: authUserCtx, credits, personalCredits, poolCredits, memberCreditLimit, memberCreditsUsed, creditScope, updateCredits } = useAuth();
  const orgRole = authUserCtx?.orgRole;
  const isOwnerOrAdmin = !orgRole || orgRole === 'owner' || orgRole === 'admin';
  const [currentPlan, setCurrentPlan] = useState(null);
  const [isToggled, setIsToggled] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamSeatsCount, setTeamSeatsCount] = useState(1);
  const selfUserRow = authUserCtx && authUserCtx.user ? { id: authUserCtx.user.id || authUserCtx.user._id, email: authUserCtx.user.email, name: authUserCtx.user.name, balance: credits } : null;
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasOrg, setHasOrg] = useState(true);
  const router = useRouter();
  const planOverviewRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const subscriptionRes = await api.get("/api/subscriptions/me");
      setHasOrg(subscriptionRes.data.hasOrg);
      if (subscriptionRes.data.hasOrg) {
        setCurrentPlan({
            planKey: subscriptionRes.data.org.planKey,
            name: plansData.find((plan) => plan.planKey === subscriptionRes.data.org.planKey)
              ?.name || "Unknown",
            nextBillingDate: subscriptionRes.data.org.nextBillingDate
              ? new Date(subscriptionRes.data.org.nextBillingDate).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "N/A",
            cancelAtPeriodEnd: subscriptionRes.data.org.cancelAtPeriodEnd,
            stripeSubscriptionId: subscriptionRes.data.org.stripeSubscriptionId,
            seatsAllowed: subscriptionRes.data.org.seatsAllowed,
            billingInterval: subscriptionRes.data.org.billingInterval,
            creditAddon: subscriptionRes.data.org.creditAddon,
          });
        setIsToggled(subscriptionRes.data.org.billingInterval === "annual");
      } else {
        setCurrentPlan({
            planKey: "FREE",
            name: "Free",
            creditAddon: subscriptionRes.data.creditAddon,
        });
        setIsToggled(false);
      }
      setError("");
      await updateCredits();
    } catch (error) {
      console.error("Failed to fetch data:", error);
      setError("Failed to load subscription data. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [updateCredits]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Immediate selection if auth user is available
    if (authUserCtx) {
       // We default to "personal" but if they have a team, maybe "team"? 
       // Keeping default as "personal" since it's the safest.
    }
  }, [authUserCtx]);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        if (hasOrg) {
          const res = await api.get('/api/team/members');
          setTeamMembers(res.data?.members || []);
        } else {
          setTeamMembers([]);
        }
      } catch (e) {
        setTeamMembers([]);
      }
    };
    loadMembers();
  }, [hasOrg]);

  const handlePlanPreview = (plan, interval) => {
    setSelectedPlan({ plan, interval });
    const maxSeats = (plan.maxExtraUsers || 0) + 1;
    if (teamSeatsCount > maxSeats) {
      setTeamSeatsCount(maxSeats);
    }
  };

  const handleUpgrade = async ({ isAutomationChecked, automationUsers, dueToday, onNeedsPaymentMethod, onFinally }) => {
    if (!selectedPlan) return;
    setIsProcessingUpgrade(true);
    try {
      const computedDestination = teamSeatsCount > 1 ? 'team' : 'personal';

      const response = await api.post("/api/subscriptions/start", {
        planKey: selectedPlan.plan.planKey,
        interval: selectedPlan.interval,
        seats: teamSeatsCount,
        destination: computedDestination,
        automation: isAutomationChecked
          ? { users: automationUsers, pricePerUser: 149 }
          : null,
      });
      
      // Push payment_success event to Google Tag Manager Data Layer if money was actually charged
      if (dueToday > 0) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          'event': 'payment_success',
          'value': dueToday,
          'currency': 'USD'
        });
      }

      Swal.fire({
        title: "Plan Updated Successfully",
        text:
          response.data.message ||
          `Successfully updated to ${selectedPlan.plan.planKey} plan (${selectedPlan.interval})!`,
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        confirmButtonText: "Go to Dashboard",
        customClass: {
          confirmButton: "swal-confirm-button",
        },
      });
      setSelectedPlan(null);
      await fetchData();
      window.location.reload();
    } catch (error) {
      console.error("Failed to update subscription:", error);
      
      // If the error indicates missing payment method, show the modal instead of redirecting
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.response?.data?.msg || "";
      
      if (error.response?.status === 401) {
        Swal.fire({
          title: "Update Failed",
          text: errorMessage || "Please add a payment method before upgrading.",
          imageUrl: "/icons/mawsool-warning.webp",
          imageAlt: "Custom alert icon",
          confirmButtonText: "Add Payment Method",
          customClass: {
            confirmButton: "swal-confirm-button",
          },
        }).then(() => {
          router.push("/setting/billing");
        });
      } else if (
        (error.response?.status === 400 || error.response?.status === 402) && 
        (errorMessage.toLowerCase().includes("payment method") || errorMessage.toLowerCase().includes("card") || errorMessage.toLowerCase().includes("no payment methods"))
      ) {
        if (onNeedsPaymentMethod) {
          setIsProcessingUpgrade(false); // Stop loading to let the modal show properly
          onNeedsPaymentMethod();
          return;
        } else {
           Swal.fire({
            title: "Payment Failed",
            text: errorMessage || "Your payment method failed. Please update your billing information.",
            imageUrl: "/icons/mawsool-error.webp",
            imageAlt: "Custom alert icon",
            confirmButtonText: "Go to Billing",
            customClass: {
              confirmButton: "swal-confirm-button",
            },
          }).then(() => {
            router.push("/setting/billing");
          });
        }
      } else {
        Swal.fire({
          title: "Update Failed",
          text: errorMessage || "An error occurred while updating your plan.",
          imageUrl: "/icons/mawsool-warning.webp",
          imageAlt: "Custom alert icon",
          confirmButtonText: "Close",
          customClass: {
            confirmButton: "swal-confirm-button",
          },
        });
      }
    } finally {
      if (onFinally) onFinally();
      setIsProcessingUpgrade(false);
    }
  };

  const handleCreditsUpdated = async (newCredits, newPriceId) => {
    await updateCredits();
    
    // Optimistically update the active add-on state so it persists immediately
    if (newPriceId !== undefined) {
      setCurrentPlan(prev => ({
        ...prev,
        creditAddon: newPriceId ? {
          priceId: newPriceId,
          nextBillingDate: prev?.creditAddon?.nextBillingDate || new Date().getTime() + (30 * 24 * 60 * 60 * 1000)
        } : null
      }));
    }
    
    await fetchData(); // Refetch to update the creditAddon message and slider state from backend
  };

  const handleCancelPlan = async () => {
    const result = await Swal.fire({
      imageUrl: "/icons/mawsool-warning.webp",
      imageHeight: 200,
      imageAlt: "Custom alert icon",
      title: "Are you sure?",
      text: "Do you want to cancel your subscription? This action will take effect at the end of the current billing period.",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel it!",
      cancelButtonText: "No, keep it",
      customClass: {
        confirmButton: "swal-confirm-button",
        cancelButton: "swal-cancel-button",
      },
    });

    if (result.isConfirmed) {
      try {
        const response = await api.post("/api/subscriptions/cancel");
        Swal.fire({
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          title: "Success",
          text: response.data.message,
          timer: 1500,
          showConfirmButton: false,
        });
        await fetchData();
      } catch (error) {
        Swal.fire({
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          title: "Error",
          text:
            error.response?.data?.message ||
            "Failed to cancel subscription. Please try again.",
        });
      }
    }
  };

  const handleResumePlan = async () => {
    try {
      const response = await api.post("/api/subscriptions/resume");
      Swal.fire({
        imageUrl: "/icons/mawsool-success.webp",
        imageAlt: "Custom alert icon",
        title: "Success",
        text: response.data.message,
        timer: 1500,
        showConfirmButton: false,
      });
      await fetchData();
    } catch (error) {
      Swal.fire({
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        title: "Error",
        text:
          error.response?.data?.message ||
          "Failed to resume subscription. Please try again.",
      });
      // Re-fetch data to sync frontend state if backend updated the subscription status to fully canceled
      await fetchData();
    }
  };

  if (loading) {
    return (
      <DashboardContainer heading={"Setting"}>
        <div className="w-full h-full flex justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-sm text-gray-600">Loading Plan Overview...</p>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  const isAnnual = isToggled;

  return (
    <DashboardContainer heading={"Setting"}>
      <div className="flex items-start gap-6 h-full">
        <Sidebar />
        <div
          ref={planOverviewRef}
          className="relative w-full h-full p-4 flex flex-col gap-4 overflow-y-auto rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]"
        >
          <p className="text-[#222] text-xl font-semibold">Plan Overview</p>
          {error && (
            <div className="w-full p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 flex items-center justify-between mb-2">
              <span className="text-sm">{error}</span>
              <button
                onClick={() => setError("")}
                className="ml-2 text-red-500 hover:text-red-700 font-bold"
              >
                ×
              </button>
            </div>
          )}
          <div className={`w-full grid grid-cols-1 ${creditScope === "org" ? "md:grid-cols-3" : "md:grid-cols-2"} gap-4`}>
            {creditScope === "org" ? (
              <CreditTransferWidget 
                personalCredits={personalCredits} 
                poolCredits={poolCredits}
                memberCreditLimit={memberCreditLimit}
                memberCreditsUsed={memberCreditsUsed}
                onTransfer={handleCreditsUpdated} 
              />
            ) : (
              <InfoCard
                icon="/icons/coin.svg"
                value={credits.toLocaleString()}
                label="Personal Credits"
              />
            )}
            <div className="w-full h-full flex">
              <InfoCard
                icon="/icons/multipleUsers.svg"
                value={(((selfUserRow ? 1 : 0) + (Array.isArray(teamMembers) ? teamMembers.length : 0)) || 0).toLocaleString()}
                label="Number of users"
              />
            </div>
          </div>
          {hasOrg && isOwnerOrAdmin && currentPlan?.planKey && currentPlan.planKey !== "FREE" && (
            <div className="w-full flex items-start justify-between gap-7 p-4 rounded-2xl border border-[#E5E6E6]">
              <div className="flex flex-col gap-2.5">
                <p className="text-base font-medium text-[#222]">
                  {currentPlan?.name || "Unknown"} Plan
                </p>
                <p className="text-sm text-[#434343]">
                  {currentPlan?.cancelAtPeriodEnd
                    ? `You are on a ${currentPlan?.name || "Unknown"} plan which will be canceled on ${currentPlan?.nextBillingDate || "N/A"}.`
                    : `You are on a ${currentPlan?.name || "Unknown"} plan and your Next Billing Date will be ${currentPlan?.nextBillingDate || "N/A"}.`}
                </p>
                {currentPlan?.seatsAllowed > 0 && (
                  <p className="text-sm text-[#6B7271]">
                    You will be charged for <span className="font-semibold text-[#222]">{currentPlan.seatsAllowed} {currentPlan.seatsAllowed === 1 ? "seat" : "seats"}</span> each {currentPlan?.billingInterval === "annual" ? "year" : "month"}.
                  </p>
                )}
              </div>
              <div
                className={`w-fit px-2.5 py-2 text-xs text-white rounded-xl cursor-pointer transition-colors duration-200 ${
                  currentPlan?.cancelAtPeriodEnd
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-[#04145C] hover:bg-[#052074]"
                }`}
                onClick={
                  currentPlan?.cancelAtPeriodEnd
                    ? handleResumePlan
                    : handleCancelPlan
                }
              >
                {currentPlan?.cancelAtPeriodEnd ? "Resume Plan" : "Cancel Plan"}
              </div>
            </div>
          )}

          {isOwnerOrAdmin && <><div className="flex justify-between items-center">
          <div className="py-4 min-w-fit flex items-center gap-2 max-[650px]:justify-between max-[480px]:w-full">
              <p className="text-[16px] font-bold text-[#222222]">
                Pay monthly
              </p>
              <div
                className={`w-14 h-8 p-0.5 flex items-center justify-start rounded-full relative cursor-pointer transition-colors duration-300 ${
                  isToggled ? "bg-[#00D2FF]" : "bg-gray-300"
                }`}
                onClick={() => setIsToggled(!isToggled)}
              >
                <div
                  className={`min-w-fit w-7 h-7 absolute top-0.5 bg-white [filter:drop-shadow(0_3px_1px_rgba(0,0,0,0.06))_drop-shadow(0_3px_8px_rgba(0,0,0,0.15))] rounded-full transition-transform duration-300 ${
                    isToggled ? "translate-x-6" : "translate-x-0"
                  }`}
                ></div>
              </div>
              <p className="text-[16px] font-bold text-[#434343]">
                Pay annually -{" "}
                <span className="font-normal">Annual Billing (Save 20%)</span>
              </p>
            </div>
            
          </div>
          
          <div className="mt-2 p-2 text-xs flex items-center justify-between rounded-md bg-[#F3F6FF] border border-[#E5E6E6] text-[#04145C]">
            <span>
              {teamSeatsCount > 1 
                ? "Multiple seats selected. Credits will be shared among your team via the Team Pool." 
                : "Single seat selected. Credits will be available only to you via your Personal Account."}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {plansData.map((plan) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                isCurrent={plan.planKey === currentPlan?.planKey && !!currentPlan?.stripeSubscriptionId}
                isAnnual={isAnnual}
                onPlanPreview={handlePlanPreview}
                disabled={false}
              />
            ))}
          </div>
          </>}
          {!isOwnerOrAdmin && (
            <div className="p-4 rounded-xl border border-[#E5E6E6] bg-[#F3F6FF] text-sm text-[#04145C]">
              Plan management is handled by your team owner. Contact them to change seats or upgrade.
            </div>
          )}
          {hasOrg && isOwnerOrAdmin && currentPlan?.planKey && currentPlan.planKey !== "FREE" && (
              <CreditPurchase
                  onCreditsUpdated={handleCreditsUpdated}
                  teamMembers={teamMembers}
                  user={authUserCtx?.user}
                  creditAddon={currentPlan?.creditAddon}
                  currentPlan={currentPlan}
                  onRequirePaymentMethod={() => setIsAddCardModalOpen(true)}
                  destination={(currentPlan?.seatsAllowed ?? 1) > 1 ? 'team' : 'personal'}
                />
            )}
        </div>
      </div>
      {isOwnerOrAdmin && (
        <UpgradeSummary
          selectedPlan={selectedPlan?.plan}
          numSeats={teamSeatsCount}
          setNumSeats={setTeamSeatsCount}
          isAnnual={selectedPlan?.interval === "annual"}
          onUpgrade={handleUpgrade}
          canUpgrade={true}
          containerWidth={planOverviewRef.current?.offsetWidth}
          isProcessing={isProcessingUpgrade}
          currentPlan={currentPlan}
          onClose={() => setSelectedPlan(null)}
        />
      )}
    </DashboardContainer>
  );
};

export default PlanOverview;
