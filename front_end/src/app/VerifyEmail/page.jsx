"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Button from "@/components/shared/Button";
import axios from "axios";

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

// Separate client component for useSearchParams
function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = React.useState("verifying");
  const [message, setMessage] = React.useState("Verifying your email...");

  React.useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token");
      const email = searchParams.get("email");

      // console.log("VerifyEmail - Query Params:", { token, email }); // Debug

      if (!token || !email) {
        setStatus("error");
        setMessage("Invalid verification link");
        return;
      }

      try {
        const response = await axios.get(
          `${config.apiUrl}/api/auth/verify-email`,
          {
            params: { token, email: decodeURIComponent(email) },
            headers: { "Content-Type": "application/json" },
          }
        );

        if (response.data.msg === "Email verified successfully") {
          setStatus("success");
          setMessage("Your email has been verified! Redirecting to sign in...");
          // Automatically redirect to /firstSignin with email as query parameter
          router.push(`/firstSignin?email=${encodeURIComponent(decodeURIComponent(email))}`);
        } else {
          setStatus("error");
          setMessage(response.data.msg || "Failed to verify email");
        }
      } catch (err) {
        setStatus("error");
        setMessage(
          err.response?.data?.msg ||
            "An error occurred while verifying your email. Please try signing up again."
        );
      }
    };

    verifyEmail();
  }, [searchParams, router]);

  const handleRedirect = () => {
    router.push(status === "success" ? "/firstSignin" : "/signup");
  };

  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222]">
        Email Verification
      </h1>
      <div
        className={`w-full p-3 border rounded-lg ${
          status === "success"
            ? "bg-green-50 border-green-200"
            : status === "error"
              ? "bg-red-50 border-red-200"
              : "bg-blue-50 border-blue-200"
        }`}
      >
        <p
          className={`text-sm ${
            status === "success"
              ? "text-green-600"
              : status === "error"
                ? "text-red-600"
                : "text-blue-600"
          }`}
        >
          {message}
        </p>
      </div>
      {status !== "verifying" && (
        <Button
          arrow={false}
          variant="small"
          className="w-full !rounded-xl"
          onClick={handleRedirect}
        >
          {status === "success" ? "Go to Sign In" : "Try Again"}
        </Button>
      )}
    </div>
  );
}

// Fallback component for Suspense
function VerifyEmailFallback() {
  return (
    <div className="flex flex-col items-start gap-5 w-full">
      <h1 className="text-2xl font-bold text-[#222222]">
        Email Verification
      </h1>
      <div className="w-full p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-600 text-sm">Verifying your email...</p>
      </div>
    </div>
  );
}

export default function VerifyEmail() {
  return (
    <div className="p-4 flex items-center w-full h-screen">
      <div className="flex flex-col items-center w-full h-full justify-center">
        <div className="flex flex-col items-start gap-10 w-full max-w-[426px]">
          <Image src={"/basic/logo.png"} alt="logo" width={145} height={26} />
          <Suspense fallback={<VerifyEmailFallback />}>
            <VerifyEmailContent />
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
    </div>
  );
}