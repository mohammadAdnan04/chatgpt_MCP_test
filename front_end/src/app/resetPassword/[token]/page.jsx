"use client";

import Image from "next/image";
import React, { useState, useEffect, Suspense } from "react";
import Button from "@/components/shared/Button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import PasswordInput from "@/components/shared/PasswordInput";

// Create a separate component for the reset password form
const ResetPasswordForm = () => {
  const { resetPassword } = useAuth(); // Use resetPassword function
  const router = useRouter();
  const params = useParams();
  const token = params?.token;
  
  // DEBUGGING: Log params and token
  // console.log("ResetPasswordForm PARAMS:", params);
  // console.log("ResetPasswordForm TOKEN:", token);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
  
  if (token === undefined) {
    // Still loading params, don't error yet
    return;
  }
  
  if (!token || token === '') {
    console.error("No token found in params");
    setError("Invalid or missing reset token. Please request a new password reset link.");
  } else {
    // Clear any previous errors when we get a valid token
    setError("");
  }
}, [token]);

  const handleResetPassword = async () => {
    // DEBUGGING: Log reset attempt
    // console.log("Reset password attempt with token:", token);
    
    // Validate passwords
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      // console.log("🔄 Attempting password reset with token:", token);

      const result = await resetPassword(token, password);
      // console.log("Reset password API response:", result);

      if (result.success) {
        setSuccess(result.message || "Password reset successful!");
        
        // Redirect after successful reset
        setTimeout(() => {
          router.push("/search");
        }, 2000);
      } else {
        setError(result.message || "Failed to reset password");
      }
    } catch (error) {
      console.error("Unexpected reset password error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222] mb-2">
        Reset Your Password
      </h1>

      <p className="text-sm text-[#434343]">
        Enter and confirm your new password below.
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

      <PasswordInput
        label="New Password"
        placeholder="Enter New Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
      />
      
      <PasswordInput
        label="Confirm Password"
        placeholder="Confirm New Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        disabled={loading}
      />

      <Button
        arrow={false}
        variant="small"
        className={"w-full !rounded-xl"}
        onClick={handleResetPassword}
        disabled={loading || !token}
      >
        {loading ? "Resetting Password..." : "Reset Password"}
      </Button>

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
const ResetPasswordFallback = () => (
  <div className="flex flex-col items-start gap-5 w-full">
    <h1 className="text-2xl font-bold text-[#222222] mb-2">
      Reset Your Password
    </h1>
    <div className="w-full space-y-4">
      <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="h-16 bg-gray-200 rounded-lg animate-pulse"></div>
      <div className="h-12 bg-gray-200 rounded-xl animate-pulse"></div>
    </div>
  </div>
);

const ResetPassword = ({ params }) => {
  // DEBUGGING: Log the page component params
  // console.log("ResetPassword PAGE PARAMS:", params);
  
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-6 w-full max-w-[426px]">
          <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />

          <Suspense fallback={<ResetPasswordFallback />}>
            <ResetPasswordForm />
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

export default ResetPassword;