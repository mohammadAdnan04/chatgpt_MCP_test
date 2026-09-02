"use client";

import Image from "next/image";
import React, { useState, Suspense } from "react";
import InputField from "@/components/shared/InputField";
import Button from "@/components/shared/Button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

// Form component for forgot password
const ForgotPasswordForm = () => {
  const { forgotPassword } = useAuth(); // Use forgotPassword function
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isOAuthUser, setIsOAuthUser] = useState(false);

  const handleChange = (value) => {
    setEmail(value);
    if (error) setError("");
    if (success) setSuccess("");
    if (isOAuthUser) setIsOAuthUser(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");
      setIsOAuthUser(false);

      // console.log("🔄 Requesting password reset for:", email);

      const result = await forgotPassword(email);

      // console.log("📝 Forgot password result:", result);

      if (result.success) {
        if (result.isOAuthUser) {
          setIsOAuthUser(true);
          setSuccess(result.message || "This account uses Google or Microsoft to sign in");
        } else {
          setSuccess(result.message || "Password reset link sent to your email");
        }
      } else {
        setError(result.message || "Failed to send reset link");
      }
    } catch (error) {
      console.error("Unexpected forgot password error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222] mb-2">
        Forgot Password?
      </h1>
      
      <p className="text-sm text-[#434343]">
        Enter your email address and we'll send you a link to reset your password.
      </p>

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

      {success && (
        <div className="w-full p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm">{success}</p>
        </div>
      )}

      {isOAuthUser ? (
        ''
      ) : (
        <>
          <InputField
            label="Email"
            type="email"
            placeholder="Enter Your Email Address"
            value={email}
            onChange={(e) => handleChange(e.target.value)}
            disabled={loading}
          />

          <Button
            arrow={false}
            variant="small"
            className={"w-full !rounded-xl"}
            onClick={handleForgotPassword}
            disabled={loading}
          >
            {loading ? "Sending Reset Link..." : "Send Reset Link"}
          </Button>
        </>
      )}

      <div className="w-full text-center mt-2">
        <Link
          href="/signin"
          className="text-sm text-[#0004ff] hover:underline font-medium"
        >
          Back to Sign In
        </Link>
      </div>
    </div>
  );
};

// Loading fallback component
const ForgotPasswordFallback = () => (
  <div className="flex flex-col items-start gap-5 w-full">
    <h1 className="text-2xl font-bold text-[#222222] mb-2">
      Forgot Password?
    </h1>
    <div className="w-full space-y-4">
      <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="h-12 bg-gray-200 rounded-xl animate-pulse"></div>
    </div>
  </div>
);

const ForgotPassword = () => {
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-6 w-full max-w-[426px]">
          <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />

          <Suspense fallback={<ForgotPasswordFallback />}>
            <ForgotPasswordForm />
          </Suspense>

          <div className="flex items-center justify-between w-full">
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

export default ForgotPassword;