"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import DashboardContainer from "@/components/dashboardLayoutContainer";
import Button from "@/components/shared/Button";
import Sidebar from "@/views/setting/Sidebar";
import { Download01Icon, Delete01Icon } from "hugeicons-react";
import { ArrowDown01Icon } from "lucide-react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import Swal from "sweetalert2";

// ===== Axios base (Express/Node API) =====
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// ===== Nominatim API base =====
const NOMINATIM_API = "https://nominatim.openstreetmap.org";

// ===== Small helpers ======
const currency = (n) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);

const brandIcon = (brand) => {
  const b = String(brand || "").toLowerCase();
  if (b === "visa") return "/icons/visa.svg";
  if (b === "mastercard") return "/icons/mastercard.svg";
  return "/icons/card-generic.svg";
};

function downloadCSV(filename, rows) {
  if (!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (v) => {
    const s = String(v ?? "");
    if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== Debounce function for API calls =====
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// ===== Add Card =====
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
        if (typeof data === "string" && data.trim().startsWith("<")) {
          throw new Error(
            "SetupIntent endpoint returned HTML (likely 404/auth redirect). Check NEXT_PUBLIC_API_URL and /payment/create-setup-intent route."
          );
        }
        if (!data || !data.clientSecret) {
          throw new Error(
            "SetupIntent API did not return JSON with clientSecret."
          );
        }
        if (mounted) setClientSecret(data.clientSecret);
      } catch (e) {
        setError(
          e?.response?.data?.message ||
            e?.message ||
            "Failed to initialize payment setup"
        );
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveCard = useCallback(async () => {
    if (!stripe || !elements) {
      setError("Stripe is not initialized");
      return;
    }
    if (!clientSecret) {
      setError("Missing client secret — cannot confirm card.");
      return;
    }
    setLoading(true);
    setError(null);
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card element not ready.");
      setLoading(false);
      return;
    }
    const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });
    if (error) {
      setError(error.message || "Unable to save card");
      setLoading(false);
      return;
    }
    try {
      await api.post("/api/payment/set-default-payment-method", {
        paymentMethodId: setupIntent.payment_method,
      });
      onAdded && onAdded();
      onClose && onClose();
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Payment method saved but failed to set as default"
      );
    } finally {
      setLoading(false);
    }
  }, [clientSecret, elements, onAdded, onClose, stripe]);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="rounded-xl border border-[#E5E6E6] bg-white p-3">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: "#222",
                "::placeholder": { color: "#6B7271" },
              },
            },
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          className="w-fit !rounded-xl !bg-white !text-[#434343] border-[#434343]"
          onClick={onClose}
          disabled={loading}
          arrow={false}
        >
          Cancel
        </Button>
        <Button
          variant="small"
          className="w-fit !rounded-xl"
          onClick={handleSaveCard}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save Card"}
        </Button>
      </div>
    </div>
  );
};

// ===== Payment Methods List =====
const PaymentMethods = ({ methods, onSetDefault, onDeleted }) => {
  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
        imageUrl: "/icons/mawsool-warning.webp",
        imageAlt: "Custom alert icon",
        title: "Are you sure?",
        text: `This card will be permanently deleted.`,
        showCancelButton: true,
        confirmButtonText: "Yes, Delete it!",
        cancelButtonText: "No, cancel",
        customClass: {
          confirmButton: "swal-confirm-button",
          cancelButton: "swal-cancel-button",
        },
      });
    if (!confirm.isConfirmed) return;
    try {
      const res = await api.delete(`/api/payment/payment-method/${id}`);
      if (res?.status === 200) {
        Swal.fire({
          title: "Deleted!",
          text: `Your payment method has been removed.`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
        onDeleted && onDeleted();
      } else {
        Swal.fire("Error", "Failed to delete the payment method.", "error");
      }
    } catch (e) {
      Swal.fire("Error", e?.response?.data?.message || e.message, "error");
    }
  };

  if (!methods?.length) {
    return (
      <p className="text-sm text-[#6B7271]">
        No cards yet. Add a payment method.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {methods.map((m) => (
        <div key={m.id} className="w-fit flex items-center gap-4 p-2.5 pr-4 rounded-xl border border-[#E5E6E6] bg-[#FBFBFC] hover:shadow-sm transition-all">
          <button
            type="button"
            onClick={() => onSetDefault(m.id)}
            className={`w-4 h-4 shrink-0 rounded-full cursor-pointer transition-colors ${
              m.isDefault
                ? "border-4 border-[#00D2FF]"
                : "border border-[#E5E6E6] hover:border-[#00D2FF]"
            } bg-white`}
            aria-label={m.isDefault ? "Default payment method" : "Make default"}
            title={m.isDefault ? "Default payment method" : "Make default"}
          />
          <div className="flex items-center gap-3">
            <div className="flex justify-center items-center shrink-0 w-[42px] py-1.5 px-2 rounded-lg border border-[#E5E6E6] bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandIcon(m.brand)}
                className="select-none w-full"
                draggable={false}
                alt={`${m.brand} logo`}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-[#222]">**** **** **** {m.last4}</p>
              <p className="text-xs text-[#6B7271]">
                Expiry {String(m.exp_month).padStart(2, "0")}/{m.exp_year}
              </p>
            </div>
          </div>
          <div className="w-px h-8 bg-[#E5E6E6] mx-1"></div>
          <button
            onClick={() => handleDelete(m.id)}
            className="text-[#6B7271] hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            aria-label="Delete payment method"
            title="Delete payment method"
          >
            <Delete01Icon size={18} />
          </button>
        </div>
      ))}
    </div>
  );
};

// ===== Invoices Table =====
const InvoicesTable = ({ invoices }) => {
  const [sortBy, setSortBy] = useState("date"); // 'date' | 'id' | 'status' | 'amount'
  const [sortDir, setSortDir] = useState("desc"); // 'asc' | 'desc'
  const sorted = useMemo(() => {
    const data = [...(invoices || [])];
    data.sort((a, b) => {
      let av = a[sortBy];
      let bv = b[sortBy];
      if (sortBy === "date") {
        av = new Date(a.date).getTime();
        bv = new Date(b.date).getTime();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [invoices, sortBy, sortDir]);
  const toggleSort = (k) => {
    if (sortBy === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(k);
      setSortDir("asc");
    }
  };
  return (
    <div className="flex flex-col gap-0 max-h-[450px] overflow-y-auto">
      <div className="w-full px-2.5 py-1.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6] sticky top-0 bg-white">
        {[
          ["date", "Invoice Date"],
          ["id", "Invoice ID"],
          ["status", "Status"],
          ["amount", "Amount"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className="flex items-center gap-1 text-left min-w-[220px] max-w-[220px]"
            aria-label={`Sort by ${label}`}
          >
            <p className="text-[10px] text-[#6B7271]">{label}</p>
            <ArrowDown01Icon size={16} color="#6B7271" />
          </button>
        ))}
        <div className="min-w-[220px] max-w-[220px]"></div>
      </div>
      {sorted.map((inv) => (
        <div
          key={inv.id}
          className="w-full px-2.5 py-3.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6]"
        >
          <p className="min-w-[220px] max-w-[220px] text-xs text-[#434343]">
            {new Date(inv.date).toLocaleDateString()}
          </p>
          <p className="min-w-[220px] max-w-[220px] text-xs text-[#434343]">{inv.id}</p>
          <p className="min-w-[220px] max-w-[220px] text-xs text-[#434343]">{inv.status}</p>
          <p className="min-w-[220px] max-w-[220px] text-xs text-[#434343]">
            {currency(inv.amount)}
          </p>
          <div className="min-w-[220px] max-w-[220px] flex justify-end">
            <a
              href={inv.url || `#/invoice/${inv.id}`}
              target={inv.url ? "_blank" : "_self"}
              rel="noreferrer"
              className="w-fit flex justify-center items-center gap-2 py-2 px-2.5 rounded-xl border border-[#04145C] text-[#04145C] text-xs font-medium"
            >
              <Download01Icon size={20} aria-hidden="true" />
              Download
            </a>
          </div>
        </div>
      ))}
    </div>
  );
};

// ===== Modal =====
const Modal = ({ title, isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#FBFBFC] rounded-2xl p-6 w-full max-w-md border border-[#E5E6E6]">
        <div className="flex justify-between items-center mb-4">
          <p className="text-[#565656] text-[22px] font-bold">{title}</p>
          <button
            className="text-[#434343] hover:text-[#222]"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// ===== Main Billing =====
const Billing = () => {
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [methods, setMethods] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [company, setCompany] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
  });
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isAddressLoading, setIsAddressLoading] = useState(false);

  // Debounced function to fetch address suggestions from Nominatim
  const fetchAddressSuggestions = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 3) {
        setAddressSuggestions([]);
        return;
      }
      try {
        setIsAddressLoading(true);
        const response = await axios.get(`${NOMINATIM_API}/search`, {
          params: {
            q: query,
            format: "json",
            addressdetails: 1,
            limit: 5,
          },
          headers: {
            "User-Agent": "mawsool/1.0 (Info@mawsool.tech)", // Replace with your app's details
          },
        });
        setAddressSuggestions(response.data || []);
      } catch (error) {
        console.error("Error fetching address suggestions:", error);
        setAddressSuggestions([]);
      } finally {
        setIsAddressLoading(false);
      }
    }, 500),
    []
  );

  // Handle address selection
  const handleAddressSelect = (suggestion) => {
    const addressDetails = suggestion.address || {};
    setCompany({
      ...company,
      address: suggestion.display_name,
      city: addressDetails.city || addressDetails.town || addressDetails.village || "",
      state: addressDetails.state || "",
      country: addressDetails.country || "",
      postalCode: addressDetails.postcode || "",
    });
    setAddressSuggestions([]);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // console.log("fetching data");
      const [paymentMethodsRes, defaultMethodRes, billingDetailsRes, invoicesRes, invoiceEmailRes] = await Promise.all([
        api.post("/api/payment/payment-methods"),
        api.get("/api/payment/get-default-payment-method").catch((e) => {
          if (e.response?.status === 400) {
            // console.log("No default payment method found, proceeding without default.");
            return { data: null };
          }
          throw e;
        }),
        api.get("/api/payment/billing-details"),
        api.get("/api/subscriptions/invoices"),
        api.get("/api/payment/invoice-email"),
      ]);

      const mData = paymentMethodsRes?.data;
      // console.log("mData is: ", mData);
      const rawPMs = Array.isArray(mData)
        ? mData
        : Array.isArray(mData?.data)
        ? mData.data
        : [];
      const defaultMethodData = defaultMethodRes?.data;
      // console.log("defaultMethodData is: ", defaultMethodData);
      const normalized = rawPMs.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand || "card",
        last4: pm.card?.last4 || "****",
        exp_month: pm.card?.exp_month || 1,
        exp_year: pm.card?.exp_year || 2099,
        isDefault: defaultMethodData?.id === pm.id,
      }));
      if (!defaultMethodData?.id && normalized.length) {
        normalized[0].isDefault = true;
      }
      setMethods(normalized);

      const billingData = billingDetailsRes?.data;
      // console.log("billingDetailsData is: ", billingData);
      if (billingData) {
        setCompany({
          name: billingData.companyName || "",
          address: billingData.address || "",
          city: billingData.city || "",
          state: billingData.state || "",
          country: billingData.country || "",
          postalCode: billingData.postalCode || "",
        });
      }

      const invoicesData = invoicesRes?.data?.invoices || [];
      // console.log("invoicesData is: ", invoicesData);
      const normalizedInvoices = Array.isArray(invoicesData)
        ? invoicesData.map((inv) => ({
            id: inv.id || inv.number || "INV-UNKNOWN",
            date: inv.created ? new Date(inv.created * 1000).toISOString() : new Date().toISOString(),
            status: inv.status || "Unknown",
            amount: inv.amount_due ? inv.amount_due / 100 : 0,
            url: inv.hosted_invoice_url || inv.invoice_pdf || `#/invoice/${inv.id}`,
          }))
        : [];
      setInvoices(normalizedInvoices);

      const emailData = invoiceEmailRes?.data;
      // console.log("invoiceEmailData is: ", emailData);
      if (emailData && emailData.invoiceEmail) {
        setInvoiceEmail(emailData.invoiceEmail);
      }
    } catch (e) {
      console.error("Error fetching data:", e);
      setMethods([]);
      setInvoiceEmail("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const setDefault = async (id) => {
    try {
      const result = await Swal.fire({
        title: "Are you sure?",
        text: "Are you sure you want to change the default payment method?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Yes",
      });
      if (result.isConfirmed) {
        await api.post("/api/payment/set-default-payment-method", {
          paymentMethodId: id,
        });
        fetchData();
      }
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e?.response?.data?.message || e.message, "error");
    }
  };

  const onCardAdded = () => {
    fetchData();
  };

  const onCardDeleted = () => {
    fetchData();
  };

  const saveCompany = async () => {
    // console.log(company);
    try {
      await api.post("/api/payment/billing-details", {
        companyName: company.name,
        address: company.address,
        city: company.city,
        state: company.state,
        country: company.country,
        postalCode: company.postalCode,
      });
      Swal.fire({
          title: "Success!",
          text: `Company details saved successfully.`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
    } catch (e) {
      console.error("Error saving company details:", e);
      Swal.fire(
        "Error",
        e?.response?.data?.message || "Failed to save company details",
        "error"
      );
    }
  };

  const exportInvoices = () => {
    downloadCSV(
      "invoices.csv",
      invoices.map((i) => ({
        date: new Date(i.date).toISOString().slice(0, 10),
        id: i.id,
        status: i.status,
        amount: i.amount,
        url: i.url ?? "",
      }))
    );
  };

  const saveInvoiceEmail = async () => {
    try {
      await api.post("/api/payment/invoice-email", { invoiceEmail });
      Swal.fire({
          title: "Success",
          text: `Invoice email saved successfully.`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
    } catch (e) {
      console.error("Error saving invoice email:", e);
      Swal.fire(
        "Error",
        e?.response?.data?.message || "Failed to save invoice email",
        "error"
      );
    }
  };

  if (loading) {
    return (
      <DashboardContainer heading={"Setting"}>
        <div className="w-full h-full flex justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-sm text-gray-600">Loading Billing...</p>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer heading={"Setting"}>
      <div className="flex items-start gap-6">
        <Sidebar />
        <div className="w-full h-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          <p className="text-[#222]">Billing</p>
          {/* Payment Methods */}
          <div className="w-full h-fit flex flex-col gap-5 p-4 rounded-2xl border border-[#E5E6E6] self-stretch">
            <p className="text-[#222]">Payment methods</p>
            <PaymentMethods
              methods={methods}
              onSetDefault={setDefault}
              onDeleted={onCardDeleted}
            />
            <button
              className="w-fit flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#434343] cursor-pointer"
              onClick={openModal}
              aria-label="Add new payment method"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8.325 9.675H4.5V8.325H8.325V4.5H9.675V8.325H13.5V9.675H9.675V13.5H8.325V9.675Z"
                  fill="#434343"
                />
              </svg>
              <p className="text-sm text-[#434343]">Add new payment method</p>
            </button>
          </div>
          {/* Company Details */}
          <div className="w-full h-fit p-4 flex flex-col gap-5 justify-between rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
            <p className="text-[#222]">Company Details</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Company Name"
                className="w-full input__field"
                value={company.name}
                onChange={(e) =>
                  setCompany({ ...company, name: e.target.value })
                }
              />
              <div className="relative">
                <input
                  type="text"
                  placeholder="Address"
                  className="w-full input__field"
                  value={company.address}
                  onChange={(e) => {
                    const newAddress = e.target.value;
                    setCompany({ ...company, address: newAddress });
                    fetchAddressSuggestions(newAddress);
                  }}
                />
                {isAddressLoading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
                {addressSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-[#E5E6E6] rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {addressSuggestions.map((suggestion) => (
                      <li
                        key={suggestion.place_id}
                        className="px-4 py-2 text-sm text-[#222] hover:bg-[#F1F2F2] cursor-pointer"
                        onClick={() => handleAddressSelect(suggestion)}
                      >
                        {suggestion.display_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input
                type="text"
                placeholder="City"
                className="w-full input__field"
                value={company.city}
                onChange={(e) =>
                  setCompany({ ...company, city: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="State"
                className="w-full input__field"
                value={company.state}
                onChange={(e) =>
                  setCompany({ ...company, state: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Country"
                className="w-full input__field"
                value={company.country}
                onChange={(e) =>
                  setCompany({ ...company, country: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Postal Code"
                className="w-full input__field"
                value={company.postalCode}
                onChange={(e) =>
                  setCompany({ ...company, postalCode: e.target.value })
                }
              />
            </div>
            <Button
              ArrowDown01Icon={false}
              variant="small"
              className="w-fit !rounded-xl"
              onClick={saveCompany}
            >
              Save
            </Button>
          </div>
          {/* Invoice history */}
          <div className="w-full h-fit p-4 flex flex-col gap-5 justify-between rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
            <div className="flex items-center justify-between">
              <p className="text-[#222]">Invoice History</p>
              <button
                onClick={exportInvoices}
                className="w-fit px-2.5 py-2 flex items-center gap-1 text-xs font-medium text-white bg-[#04145C] rounded-lg hover:bg-[#052074] transition-colors duration-200"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4.39553 14.4001C4.06531 14.4001 3.78353 14.2826 3.5502 14.0476C3.31686 13.8126 3.2002 13.5301 3.2002 13.2001V2.8001C3.2002 2.4701 3.3177 2.1876 3.5527 1.9526C3.7877 1.7176 4.0702 1.6001 4.4002 1.6001H9.60019L12.8002 4.8001V13.2001C12.8002 13.5301 12.6826 13.8126 12.4475 14.0476C12.2124 14.2826 11.9297 14.4001 11.5995 14.4001H4.39553ZM8.80019 5.6001V2.8001H4.4002V13.2001H11.6002V5.6001H8.80019Z"
                    fill="white"
                  />
                </svg>
                Export
              </button>
            </div>
            <InvoicesTable invoices={invoices} />
          </div>
          {/* Send invoice to */}
          <div className="w-full h-fit p-4 flex flex-col gap-5 justify-between rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
            <p className="text-[#222]">Send invoice to</p>
            <input
              type="email"
              placeholder="Email"
              className="w-full input__field"
              value={invoiceEmail}
              onChange={(e) => setInvoiceEmail(e.target.value)}
            />
            <Button
              ArrowDown01Icon={false}
              variant="small"
              className="w-fit !rounded-xl"
              onClick={saveInvoiceEmail}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
      <Modal
        title="Add Payment Method"
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      >
        <AddCard onClose={() => setIsModalOpen(false)} onAdded={onCardAdded} />
      </Modal>
    </DashboardContainer>
  );
};

export default Billing;