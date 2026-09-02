"use client";

import Image from "next/image";
import React, { useState, useEffect, Suspense } from "react";
import InputField from "@/components/shared/InputField";
import Button from "@/components/shared/Button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/components/shared/PasswordInput";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// Create a separate component for the search params logic
const SignInForm = () => {
  const { login } = useAuth(); // Only need login function
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null); // Track which OAuth is loading
  const [error, setError] = useState("");

  // Check for OAuth callback parameters and pre-fill email from URL
  useEffect(() => {
    const token = searchParams.get("token");
    const oauthError = searchParams.get("error");
    const email = searchParams.get("email");

    if (token) {
      // Handle successful OAuth callback
      handleOAuthCallback(token);
    } else if (oauthError) {
      // Handle OAuth error
      setError(decodeURIComponent(oauthError));
    }

    // Pre-fill email input if email query parameter exists
    if (email) {
      setForm((prev) => ({ ...prev, email: decodeURIComponent(email) }));
    }
  }, [searchParams]);

  const handleOAuthCallback = async (token) => {
    try {
      setLoading(true);
      // console.log("🔄 Processing OAuth callback with token");

      // Decode JWT to get user email (needed for your AuthContext)
      const tokenPayload = JSON.parse(atob(token.split(".")[1]));
      const userEmail = tokenPayload.email || "oauth-user@example.com";

      // console.log("📋 Token payload:", tokenPayload);
      // console.log("📧 User email from token:", userEmail);

      // Create user object (matching your AuthContext format)
      const user = {
        email: userEmail,
        name: tokenPayload.name || userEmail.split("@")[0],
        id: tokenPayload.id || tokenPayload.sub || "oauth-user-id",
      };

      // Store token in cookie (using your AuthContext pattern)
      const setCookie = (name, value, days) => {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const isSecure = window.location.protocol === "https:";
        document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Strict${
          isSecure ? "; Secure" : ""
        }`;
      };

      // Store auth data
      setCookie("auth-token", token, 7); // 7 days
      localStorage.setItem("user-data", JSON.stringify(user));

      // console.log("✅ OAuth data stored successfully");

      // Redirect to onboarding
      router.push("/onBoarding");
    } catch (error) {
      console.error("❌ OAuth callback error:", error);
      setError("Failed to complete authentication. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

      const result = await login(form.email, form.password);

      // console.log("📝 Login result:", result);

      if (result.success) {
        // Redirect to onboarding
        // console.log("🏠 Redirecting to onboarding...");
        router.push("/onBoarding");
      } else {
        setError(result.message);
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

      // Get current URL for return redirect - redirect to onboarding after OAuth
      const currentUrl = window.location.origin;
      const returnUrl = "/onBoarding"; // Always go to onboarding from firstSignin

      // Construct OAuth URL with return parameters
      const oauthUrl = `${
        config.apiUrl
      }/api/auth/${provider}?returnUrl=${encodeURIComponent(
        currentUrl + "/firstSignin?returnUrl=" + encodeURIComponent(returnUrl)
      )}`;

      // Redirect to OAuth provider
      window.location.href = oauthUrl;
    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      setError(`Failed to initiate ${provider} sign in. Please try again.`);
      setOauthLoading(null);
    }
  };

  // Alternative method using popup window (if you prefer this approach)
  const handleOAuthSignInPopup = async (provider) => {
    try {
      setOauthLoading(provider);
      setError("");

      // console.log(`🔄 Opening ${provider} OAuth popup...`);

      const oauthUrl = `${config.apiUrl}/api/auth/${provider}`;

      // Open popup window
      const popup = window.open(
        oauthUrl,
        `${provider}OAuth`,
        "width=500,height=600,scrollbars=yes,resizable=yes"
      );

      // Listen for popup completion
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setOauthLoading(null);

          
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!popup.closed) {
          popup.close();
          clearInterval(checkClosed);
          setOauthLoading(null);
          setError(`${provider} sign in timed out. Please try again.`);
        }
      }, 300000);
    } catch (error) {
      console.error(`${provider} OAuth popup error:`, error);
      setError(`Failed to open ${provider} sign in. Please try again.`);
      setOauthLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222] mb-2">
        Sign in to your account
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
      >
        {loading ? "Signing in..." : "Sign In"}
      </Button>

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
          className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${
            loading || oauthLoading
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
          className={`flex items-center w-full px-3 py-2.5 border border-gray-200 gap-2 rounded-2xl hover:bg-gray-50 transition-colors ${
            loading || oauthLoading
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

const FirstSignIn = () => {
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-6 w-full max-w-[426px]">
          <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />

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
        <img src="/user/signUp.png" alt="signin" className="h-[618px]" />
        <img
          src="/user/chromeExtention.svg"
          alt=""
          className="absolute top-2/3 animate-topBottom left-1/2"
        />
      </div>
    </div>
  );
};

export default FirstSignIn;