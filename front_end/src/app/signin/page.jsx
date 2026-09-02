"use client";

import Image from "next/image";
import React, { useState, useEffect, Suspense } from "react";
import InputField from "@/components/shared/InputField";
import Button from "@/components/shared/Button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/shared/PasswordInput";
import axios from "axios";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// Create a separate component for the search params logic
const SignInForm = () => {
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status"); // 'new' | 'old'

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // Track which OAuth is loading
  const [error, setError] = useState("");
  const [userLoaded, setUserLoaded] = useState(false); // Track if user data is loaded

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const returnUrl = searchParams.get("returnUrl") || "/";
    const redirect = searchParams.get("redirect");

    // Set userLoaded to true when user data is available
    if (user && user.name) {
      setUserLoaded(true);
    }

    async function hydrateThenGo(next, isNewSignup = false) {
      try {
        const res = await api.get("api/auth/me");
        if (res.status !== 200) {
          localStorage.removeItem("user-data");
          return; // stay on signin
        }

        const u = res.data;
        localStorage.setItem("user-data", JSON.stringify(u));
        try { sessionStorage.setItem("justSignedIn", "true"); } catch {}

        // OAuth / explicit returnUrl wins over admin default
        const hasReturn =
          next &&
          next !== "/" &&
          next !== "/dashboard" &&
          !next.startsWith("/signin");

        if (hasReturn) {
          if (isNewSignup) {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({ event: "sign_up_success" });
            setTimeout(() => window.location.replace(next), 300);
          } else {
            window.location.replace(next);
          }
          return;
        }

        if (u.role === "admin") {
          window.location.replace("/userManagement");
          return;
        }

        if (isNewSignup) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: "sign_up_success" });
          setTimeout(() => window.location.replace(next || "/onBoarding"), 300);
        } else if (next) {
          window.location.replace(next);
        }
      } catch {
        localStorage.removeItem("user-data");
        // Not logged in — stay on signin form (do NOT bounce to returnUrl)
      }
    }

    const isOauthReturn =
      typeof returnUrl === "string" && returnUrl.includes("/oauth/authorize");

    if (status === "new" && !redirect) {
      hydrateThenGo("/onBoarding", true);
    } else if (status === "old" || redirect) {
      // OAuth: only auto-continue if a real cookie session exists.
      // Do not bounce in a loop when consent page cannot see the session yet.
      if (isOauthReturn) {
        const loopKey = "mawsool_oauth_signin_hops";
        const hops = Number(sessionStorage.getItem(loopKey) || "0");
        if (hops >= 2) {
          sessionStorage.removeItem(loopKey);
          // Stay on signin form so the user can log in explicitly
          return;
        }
        sessionStorage.setItem(loopKey, String(hops + 1));
      }
      hydrateThenGo(returnUrl, status === "new");
    } else if (oauthError) {
      setError(decodeURIComponent(oauthError));
    }
  }, [searchParams, user, status]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const handleSignIn = async () => {
    if (!form.email || !form.password) {
      setError("Please fill all fields.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // console.log("🔄 Attempting signin with:", { email: form.email });

      const next =
        searchParams.get("returnUrl") ||
        searchParams.get("redirect") ||
        null;
      const isOauthReturn =
        typeof next === "string" && next.includes("/oauth/authorize");

      // skipRedirect=true ONLY for OAuth or if there is a 'next' URL
      const result = await login(form.email, form.password, !!isOauthReturn || !!next);

      if (!result.success) {
        setError(result.message);
      } else {
        try {
          sessionStorage.removeItem("mawsool_oauth_signin_hops");
        } catch (_) {}

        // If there's a specific next URL (like OAuth returnUrl), handle it here
        if (next) {
          setTimeout(() => {
            window.location.href = next;
          }, 100);
        }
        // Otherwise, AuthContext.js will automatically router.push("/search") or "/userManagement"
      }
    } catch (error) {
      console.error("Unexpected signin error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading && !oauthLoading) {
      handleSignIn();
    }
  };

  const handleOAuthSignIn = (provider) => {
    try {
      setOauthLoading(provider);
      setError("");

      // console.log(`🔄 Initiating ${provider} OAuth...`);

      // Get current URL for return redirect
      const currentUrl = window.location.origin;
      const returnUrl = searchParams.get("returnUrl") || "/dashboard";

      // Construct OAuth URL with return parameters
      const oauthUrl = `${config.apiUrl
        }/api/auth/${provider}?returnUrl=${encodeURIComponent(
          currentUrl + "/signin?returnUrl=" + encodeURIComponent(returnUrl)
        )}&from=signin`; // Added &from=signin

      // Redirect to OAuth provider
      window.location.href = oauthUrl;
    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      setError(`Failed to initiate ${provider} sign in. Please try again.`);
      setOauthLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222] mb-2">
        {status === "new"
          ? "Welcome, Let’s Get Started."
          : status === "old"
            ? userLoaded && user?.name
              ? `Welcome back, ${user.name}.`
              : "Loading..."
            : "Sign in to your account"}
      </h1>

      {error && (
        <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {status === "new" ? (
        <p className="text-sm text-[#434343]">
          Your account has been created successfully using your Google/Microsoft login. You’ll now be guided through a quick tour to help you get started.
        </p>
      ) : status === "old" ? (
        <p className="text-sm text-[#434343]">
          Your authentication completed successfully. Redirecting to the dashboard screens...
        </p>
      ) : (
        <>
          {/* Show loading state during OAuth processing */}
          {loading && (
            <div className="w-full p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-blue-600 text-sm">
                  Completing authentication...
                </p>
              </div>
            </div>
          )}

          <InputField
            label="Email"
            type="email"
            placeholder="Enter Your Email Address"
            value={form.email}
            onChange={(e) => handleChange("email", e.target.value)}
            disabled={loading || oauthLoading}
            onKeyPress={handleKeyPress}

          />

          <PasswordInput
            label="Password"
            placeholder="Enter Your Password"
            value={form.password}
            onChange={(e) => handleChange("password", e.target.value)}
            onKeyPress={handleKeyPress}
          />

          <Button
            arrow={false}
            variant="small"
            className={"w-full !rounded-xl"}
            onClick={handleSignIn}
            disabled={loading || oauthLoading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          {/* Forgot Password Link */}
          <div className="w-full text-center mt-2">
            <Link
              href="/forgotPassword"
              className="text-sm text-[#0004ff] hover:underline font-medium"
            >
              Forgot your password?
            </Link>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-sm text-[#6B7271]">or</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          {/* OAuth Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
            {/* Google Sign In */}
            <button
              onClick={() => handleOAuthSignIn("google")}
              disabled={loading || oauthLoading}
              className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${loading || oauthLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
                }`}
            >
              {oauthLoading === "google" ? (
                <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <img src="/icons/google.png" className="w-6" alt="Google" />
              )}
              <span className="text-sm flex-1 text-start">
                {oauthLoading === "google"
                  ? "Connecting to Google..."
                  : "Sign in with Google"}
              </span>
            </button>

            {/* Microsoft Sign In */}
            <button
              onClick={() => handleOAuthSignIn("microsoft")}
              disabled={loading || oauthLoading}
              className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${loading || oauthLoading
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
                }`}
            >
              {oauthLoading === "microsoft" ? (
                <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-6 h-6" viewBox="0 0 23 23" fill="none">
                  <path d="M1 1h10v10H1z" fill="#f25022" />
                  <path d="M12 1h10v10H12z" fill="#00a4ef" />
                  <path d="M1 12h10v10H1z" fill="#ffb900" />
                  <path d="M12 12h10v10H12z" fill="#7fbb00" />
                </svg>
              )}
              <span className="text-sm flex-1 text-start">
                {oauthLoading === "microsoft"
                  ? "Connecting to Microsoft..."
                  : "Sign in with Microsoft"}
              </span>
            </button>
          </div>

          <div className="w-full text-center">
            <p className="text-sm text-[#434343]">
              Don't have an account?{" "}
              <Link
                href="/signup"
                className="text-[#0004ff] hover:underline font-medium"
              >
                Sign up
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// Loading fallback component
const SignInFormFallback = () => (
  <div className="flex flex-col items-start gap-5 w-full">
    <h1 className="text-2xl font-bold text-[#222222] mb-2">
      Sign in to your account
    </h1>
    <div className="w-full space-y-4">
      <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="h-12 bg-gray-200 rounded-xl animate-pulse"></div>
    </div>
  </div>
);

const SignIn = () => {
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-6 w-full max-w-[426px]">
          <Link href={process.env.NEXT_PUBLIC_LANDING_PAGE_URL || "/"}>
            <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />
          </Link>

          <Suspense fallback={<SignInFormFallback />}>
            <SignInForm />
          </Suspense>

          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-medium leading-[130%] text-[#222222]">
              Copyright © 2026 Mawsool
            </span>
            <div className="flex items-center gap-4">
              <a
                href="https://mawsool.tech/privacy-policy"
                target="_blank"
                className="text-[#434343] text-xs leading-[130%] cursor-pointer hover:underline hover:opacity-80 transition-all"
              >
                Privacy Policy
              </a>
              <a
                href="https://mawsool.tech/terms-of-service/"
                target="_blank"
                className="text-[#434343] text-xs leading-[130%] cursor-pointer hover:underline hover:opacity-80 transition-all"
              >
                Terms of Service
              </a>
            </div>
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
};

export default SignIn;