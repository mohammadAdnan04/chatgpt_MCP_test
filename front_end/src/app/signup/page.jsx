"use client";

import Image from "next/image";
import React, { Suspense } from "react";
import InputField from "@/components/shared/InputField";
import Button from "@/components/shared/Button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import PasswordInput from "@/components/shared/PasswordInput";
import Swal from 'sweetalert2';

import { Country } from 'country-state-city';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// Separate client component for useSearchParams
function SignUpContent() {
  const { signup, sendWhatsAppOtp, verifyWhatsAppOtp } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [oauthLoading, setOauthLoading] = React.useState(null);
  const [form, setForm] = React.useState({ name: "", email: "", password: "", repeatPassword: "" });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [turnstileToken, setTurnstileToken] = React.useState(null);
  const [step, setStep] = React.useState('register');
  const [whatsappNumber, setWhatsappNumber] = React.useState('');
  const [otp, setOtp] = React.useState('');

  React.useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!window.turnstile || typeof sitekey !== "string" || !sitekey) {
      return;
    }
    try {
      window.turnstile.render("#turnstile-widget", {
        sitekey,
        callback: function (token) {
          setTurnstileToken(token);
        },
      });
    } catch (err) {
      console.error("Turnstile failed to render:", err);
    }
  }, []);

  React.useEffect(() => {
    const email = searchParams.get("email");
    const from = searchParams.get("from");
    const error = searchParams.get("error");

    // console.log("Query email:", email); // Debug
    if (email) {
      const decodedEmail = decodeURIComponent(email);
      // console.log("Decoded email:", decodedEmail); // Debug
      setForm((prev) => ({ ...prev, email: decodedEmail }));
    }

    if (from === "signin" && error) {
      const decodedError = decodeURIComponent(error);
      Swal.fire({
        title: 'Let’s Create Your Account',
        text: decodedError,
        imageUrl: '/icons/mawsool-warning.webp',
        imageAlt: 'Custom alert icon',
        confirmButtonText: 'Sign Up Now',
        customClass: {
          confirmButton: 'swal-confirm-button',
        },
      });
    }

  }, [searchParams]);

  const handleChange = (field, value) => {
    // console.log(`Changing ${field} to:`, value); // Debug
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const handleOAuthSignIn = (provider) => {
    try {
      setOauthLoading(provider);
      setError("");
      setSuccess("");

      let desiredAfterLogin = "/";
      let redirectToPlan = "";
      try {
        const sp = new URLSearchParams(window.location.search);
        desiredAfterLogin = sp.get("returnUrl") || "/";
      } catch { }
      const redirect = searchParams.get("redirect");
      const plan = searchParams.get("plan");
      const interval = searchParams.get("interval");
      if (redirect && plan && interval) {
        redirectToPlan = `&redirect=${encodeURIComponent(redirect)}&plan=${encodeURIComponent(plan)}&interval=${encodeURIComponent(interval)}`;
      }


      const origin = window.location.origin;
      const oauthUrl = `${config.apiUrl
        }/api/auth/${provider}?returnUrl=${encodeURIComponent(
          `${origin}/signin?returnUrl=${encodeURIComponent(desiredAfterLogin)}`
        )}&from=signup${redirectToPlan}`;

      window.location.href = oauthUrl;
    } catch (e) {
      console.error(`${provider} OAuth error:`, e);
      setError(`Failed to initiate ${provider} sign in. Please try again.`);
      setOauthLoading(null);
    }
  };

  const handleSignUp = async () => {
    // Prevent double submissions immediately
    if (loading) return;

    setError("");
    setSuccess("");

    if (!form.name || !form.email || !form.password || !form.repeatPassword) {
      setError("Please fill all fields.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.password !== form.repeatPassword) {
      setError("Passwords do not match.");
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/;
    if (!passwordRegex.test(form.password)) {
      setError("Password must be at least 10 characters with a character, uppercase, lowercase, and a number.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    try {
      setLoading(true);

      // Extract UTMs from localStorage
      let utmData = {};
      try {
        const storedUtms = localStorage.getItem('mawsool_utm_data');
        if (storedUtms) {
          utmData = JSON.parse(storedUtms);
        }
      } catch (e) {
        console.error("Failed to parse UTMs", e);
      }

      const result = await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        turnstileToken: turnstileToken,
        utmSource: utmData.utm_source || "",
        utmMedium: utmData.utm_medium || "",
        utmCampaign: utmData.utm_campaign || "",
        utmTerm: utmData.utm_term || "",
        utmContent: utmData.utm_content || "",
      });
      if (!result.success) {
        setError(result.message);
        // Reset Turnstile token on failure so they can try again
        if (window.turnstile) {
            window.turnstile.reset();
            setTurnstileToken(null);
        }
      } else if (result.requiresWhatsApp) {
        setStep('whatsapp-number');
        setSuccess(""); // Clear success state to show form clean
      } else {
        setSuccess("Registration successful! Please check your email to verify your account.");
        // Push sign_up_success event to Google Tag Manager Data Layer
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          'event': 'sign_up_success'
        });
        // router.push("/verify-email-confirmation"); // Optional
      }
    } catch (e) {
      console.error("Unexpected signup error:", e);
      setError("An unexpected error occurred. Please try again.");
      // Reset Turnstile token on failure so they can try again
      if (window.turnstile) {
          window.turnstile.reset();
          setTurnstileToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!whatsappNumber) {
      setError("Please enter your WhatsApp number.");
      return;
    }

    if (!isValidPhoneNumber(whatsappNumber)) {
      setError("Please enter a valid WhatsApp number.");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await sendWhatsAppOtp(form.email, whatsappNumber);
    if (res.success) {
      setStep('whatsapp-otp');
      setSuccess("Verification code sent to your WhatsApp!");
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await verifyWhatsAppOtp(form.email, otp);
    if (res.success) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'event': 'sign_up_success' });
      setStep('success-done');
    } else {
      setError(res.message);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-start gap-10 w-full max-w-[426px]">
      <Link href={process.env.NEXT_PUBLIC_LANDING_PAGE_URL || "/"}>
        <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />
      </Link>
      <div className="flex flex-col items-start gap-5 w-full">
        <div className="flex flex-col items-start gap-3">
          <h1 className="text-2xl font-bold text-[#222222]">
            Create Account
          </h1>
          <p className="text-sm text-[#666666]">
            Use your work email to get started with Mawsool
          </p>
        </div>

        {error && (
          <div className="w-full p-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <p className="text-red-600 text-xs">{error}</p>
            <button
              onClick={() => setError("")}
              className="ml-2 text-red-500 hover:text-red-700 font-bold"
            >
              ×
            </button>
          </div>
        )}
        {success && (
          <div className="w-full p-2 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <p className="text-green-600 text-xs">{success}</p>
            <button
              onClick={() => setSuccess("")}
              className="ml-2 text-green-500 hover:text-green-700 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {step === 'register' && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); handleSignUp(); }} className="w-full flex flex-col gap-0">
              <InputField
                label="Name"
                type="text"
                placeholder="Enter Your Full Name"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
              />
              <div className="w-full">
                <InputField
                  label="Work Email"
                  type="email"
                  placeholder="Enter Your Work Email Address"
                  value={form.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  autoComplete="off"
                />
              </div>
              <PasswordInput
                label="Password"
                placeholder="Enter Your Password (min. 10 characters)"
                value={form.password}
                onChange={(e) => handleChange("password", e.target.value)}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Repeat Password"
                placeholder="Re-Enter Your Password"
                value={form.repeatPassword}
                onChange={(e) => handleChange("repeatPassword", e.target.value)}
                autoComplete="new-password"
              />
              <div id="turnstile-widget" className="mt-4 flex justify-center w-full min-h-[65px]"></div>
            </form>

            <Button
              arrow={false}
              variant="small"
              className={"w-full !rounded-xl"}
              onClick={handleSignUp}
              disabled={loading || !!oauthLoading}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </Button>

            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-sm text-[#6B7271]">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <button
                onClick={() => handleOAuthSignIn("google")}
                disabled={loading || !!oauthLoading}
                className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${loading || oauthLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
                  }`}
              >
                {oauthLoading === "google" ? (
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <img src="/icons/google.png" className="w-6" alt="Google" />
                )}
                <span className="text-sm flex-1 text-start">
                  {oauthLoading === "google"
                    ? "Connecting to Google..."
                    : "Signup with Google"}
                </span>
              </button>

              <button
                onClick={() => handleOAuthSignIn("microsoft")}
                disabled={loading || !!oauthLoading}
                className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${loading || oauthLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
                  }`}
              >
                {oauthLoading === "microsoft" ? (
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 23 23"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M1 1h10v10H1z" fill="#f25022" />
                    <path d="M12 1h10v10H12z" fill="#00a4ef" />
                    <path d="M1 12h10v10H1z" fill="#ffb900" />
                    <path d="M12 12h10v10H12z" fill="#7fbb00" />
                  </svg>
                )}
                <span className="text-sm flex-1 text-start">
                  {oauthLoading === "microsoft"
                    ? "Connecting to Microsoft..."
                    : "Signup with Microsoft"}
                </span>
              </button>
            </div>
          </>
        )}

        {step === 'whatsapp-number' && (
          <div className="w-full flex flex-col gap-4">
            <p className="text-sm text-[#666666]">
              To keep our platform secure, we require a quick WhatsApp verification for new company domains.
            </p>
            <div className="flex flex-col gap-3 w-full">
              <label className="text-sm font-medium text-[#222222] leading-[125%]">
                WhatsApp Number
              </label>
              <div className="phone-input-container">
                <PhoneInput
                  international
                  defaultCountry="SA"
                  value={whatsappNumber}
                  onChange={(val) => {
                    setWhatsappNumber(val);
                    setError("");
                  }}
                  className="w-full"
                />
              </div>
            </div>
            <style jsx global>{`
              .phone-input-container .PhoneInput {
                display: flex;
                align-items: center;
                gap: 8px;
              }
              .phone-input-container .PhoneInputCountry {
                padding: 12px;
                border: 1px solid #E5E6E6;
                border-radius: 8px;
                background: white;
                height: 42px;
                display: flex;
                align-items: center;
              }
              .phone-input-container .PhoneInputInput {
                flex: 1;
                height: 42px;
                padding: 0 14px;
                border: 1px solid #E5E6E6;
                border-radius: 8px;
                font-size: 12px;
                outline: none;
                transition: all 0.2s;
              }
              .phone-input-container .PhoneInputInput:focus {
                border-color: #04145C;
                box-shadow: 0 0 0 1px rgba(4, 20, 92, 0.2);
              }
            `}</style>
            <Button
              arrow={false}
              variant="small"
              className={"w-full !rounded-xl"}
              onClick={handleSendOtp}
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Verification Code"}
            </Button>
            <button 
              onClick={() => { setStep('register'); setError(""); setSuccess(""); }} 
              className="text-sm text-[#04145C] mt-2 hover:underline"
            >
              Back to Registration
            </button>
          </div>
        )}

        {step === 'whatsapp-otp' && (
          <div className="w-full flex flex-col gap-4">
            <p className="text-sm text-[#666666]">
              We sent a 6-digit code to <strong>{whatsappNumber}</strong> via WhatsApp.
            </p>
            <InputField
              label="Verification Code"
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value);
                setError("");
              }}
            />
            <Button
              arrow={false}
              variant="small"
              className={"w-full !rounded-xl"}
              onClick={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify & Create Account"}
            </Button>
            <button 
              onClick={() => { setStep('whatsapp-number'); setError(""); setSuccess(""); }} 
              className="text-sm text-[#04145C] mt-2 hover:underline"
            >
              Change WhatsApp Number
            </button>
          </div>
        )}

        {step === 'success-done' && (
          <div className="w-full flex flex-col gap-4 text-center py-6">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Account Created!</h3>
            <p className="text-sm text-[#666666]">
              Your WhatsApp was verified successfully. Please check your email inbox to complete the final verification step.
            </p>
          </div>
        )}

        <div className="w-full text-center">
          <p className="text-sm text-[#434343]">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="text-[#04145C] hover:underline font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Fallback component for Suspense
function SignUpFallback() {
  return (
    <div className="flex flex-col items-start gap-10 w-full max-w-[426px]">
      <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />
      <div className="flex flex-col items-start gap-5 w-full">
        <div className="flex flex-col items-start gap-3">
          <h1 className="text-2xl font-bold text-[#222222]">
            Create Account
          </h1>
          <p className="text-sm text-[#666666]">
            Use your work email to get started with Mawsool
          </p>
        </div>
        <div className="w-full h-16 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="w-full h-16 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="w-full h-16 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="w-full h-16 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="w-full h-12 bg-gray-200 rounded-xl animate-pulse"></div>
      </div>
    </div>
  );
}

export default function SignUp() {
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <Suspense fallback={<SignUpFallback />}>
          <SignUpContent />
        </Suspense>
        <div className="flex items-center justify-between  w-full max-w-[426px] mt-4">
          <span className="text-xs font-medium leading-[130%] text-[#222222]">
            Copyright © 2026 Mawsool
          </span>
          <div className="flex items-center gap-4">
            <a href="https://mawsool.tech/privacy-policy" target="_blank" className="text-[#434343] text-xs leading-[130%] cursor-pointer hover:underline hover:opacity-80 transition-all">
              Privacy Policy
            </a>
            <a href="https://mawsool.tech/terms-of-service/" target="_blank" className="text-[#434343] text-xs leading-[130%] cursor-pointer hover:underline hover:opacity-80 transition-all">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
      <div className="hidden lg:flex flex-col items-center w-full h-full justify-center relative bg-signup rounded-2xl">

        <Image src="/user/signUp.png" alt="signin" width={618} height={618} className="h-[618px] w-auto" />
        <Image
          src="/user/chromeExtention.svg"
          alt=""
          width={100}
          height={100}
          className="absolute top-2/3 animate-topBottom left-1/2"
        />
      </div>
    </div>
  );
}