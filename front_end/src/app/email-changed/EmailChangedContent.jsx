"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

export default function EmailChangedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState({ type: "", text: "" });
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setMessage({ type: "error", text: "No verification token found." });
      router.push("/setting");
    }
  }, [token]);

  const verifyEmail = async (token) => {
    try {
      const response = await api.get(`/api/user/verify-email?token=${token}`);
      setMessage({ type: "success", text: response.data.msg });
      setTimeout(() => router.push("/setting"), 2000);
    } catch (error) {
      const errorMsg = error.response?.data?.msg || "Verification failed";
      setMessage({ type: "error", text: errorMsg });
      setTimeout(() => router.push("/setting"), 2000);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-sm text-gray-600">Verifying your email...</p>
        {message.text && (
          <div
            className={`p-3 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
