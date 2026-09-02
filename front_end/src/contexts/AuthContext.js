"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { useRouter, usePathname } from "next/navigation";

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

import Swal from "sweetalert2";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);
  const [personalCredits, setPersonalCredits] = useState(0);
  const [poolCredits, setPoolCredits] = useState(0);
  const [memberCreditLimit, setMemberCreditLimit] = useState(null);
  const [memberCreditsUsed, setMemberCreditsUsed] = useState(null);
  const [creditScope, setCreditScope] = useState("user");
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    checkAuth();
  }, []);

  // Refresh credit balance on every route change so stale values never linger
  useEffect(() => {
    if (user) {
      updateCredits();
    }
  }, [pathname]);

  // Also refresh when the tab regains focus and every 60 seconds while active
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user) {
        updateCredits();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const interval = setInterval(() => {
      if (user) updateCredits();
    }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [user]);

  // Global Axios Interceptor for 401 Unauthorized
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const errorCode = error.response.data?.code;
          const path =
            typeof window !== "undefined" ? window.location.pathname : pathname;
          // Never steal Claude OAuth consent / returnUrl with a bare /signin redirect
          const isOAuthFlow =
            path === "/oauth/authorize" ||
            path.startsWith("/oauth/") ||
            (path === "/signin" &&
              typeof window !== "undefined" &&
              (window.location.search.includes("returnUrl") ||
                window.location.search.includes("oauth")));

          if (errorCode === 'SESSION_CONFLICT') {
            Swal.fire({
              icon: 'warning',
              title: 'Session Expired',
              text: 'You have been logged out because this account was signed in on another device.',
              confirmButtonText: 'OK',
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then(() => {
              localStorage.removeItem("user-data");
              setUser(null);
              setCredits(0);
              setIsAuthenticated(false);
              if (!isOAuthFlow) router.replace("/signin");
            });
          } else {
             // Standard 401 — clear session, but let OAuth pages handle their own redirect
            localStorage.removeItem("user-data");
            setUser(null);
            setCredits(0);
            setIsAuthenticated(false);
            if (!isOAuthFlow) router.replace("/signin");
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [router]);

  // 🔴 FIXED: Converted from fetch to axios to ensure cookies are sent correctly
  const checkAuth = async () => {
    try {
      const res = await axios.get(`${config.apiUrl}/api/auth/me`, {
        headers: { "Content-Type": "application/json" },
        withCredentials: true, // This is crucial for your domain/cookie setup
        // 401 means logged out; treat it as a normal response so Next.js
        // does not overlay a Console AxiosError on every page load.
        validateStatus: (status) => status === 200 || status === 401,
      });

      if (res.status === 401) {
        localStorage.removeItem("user-data");
        setUser(null);
        setCredits(0);
        setIsAuthenticated(false);
        return;
      }

      const u = res.data; 
      
      // console.log("User data from checkAuth:", u);
      localStorage.setItem("user-data", JSON.stringify(u));
      setUser(u);
      await updateCredits();
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Auth check failed:", err?.response?.status || err.message);
      // If we get an error (like 401 Unauthorized), we clear the user data
      localStorage.removeItem("user-data");
      setUser(null);
      setCredits(0);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const updateCredits = async () => {
    try {
      const response = await axios.get(`${config.apiUrl}/api/credits`, {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      });

      if (response.data && response.data.balance !== undefined) {
        // Users can use both their pool balance and their personal balance.
        let effectiveBalance = response.data.scope === 'org' 
          ? response.data.balance + (response.data.personalCredits || 0)
          : response.data.balance;
          
        // Subtract in-flight credits from running reveals so they can't double-spend
        if (response.data.inFlightCredits) {
          effectiveBalance -= response.data.inFlightCredits;
        }
        effectiveBalance = Math.max(0, effectiveBalance);
          
        setCredits(effectiveBalance); // This is the total balance they can spend right now
        setPersonalCredits(response.data.personalCredits || 0);
        setPoolCredits(response.data.poolCredits || 0);
        setMemberCreditLimit(response.data.memberCreditLimit ?? null);
        setMemberCreditsUsed(response.data.memberCreditsUsed ?? null);
        setCreditScope(response.data.scope || "user");
        setMemberCount(response.data.memberCount || 0);
        return effectiveBalance; 
      } else {
        console.error("Invalid response format for credits:", response.data);
        setCredits(0);
        setPersonalCredits(0);
        setPoolCredits(0);
        setMemberCreditLimit(null);
        setMemberCreditsUsed(null);
        setCreditScope("user");
        setMemberCount(0);
        return 0;
      }
    } catch (error) {
      console.error("❌ Failed to fetch credits:", error);
      if (error.response?.status === 401) {
        console.error("Authentication failed - invalid or expired token");
      } else if (error.response?.status === 403) {
        console.error("Access forbidden - check permissions");
      }
      setCredits(0);
      setPersonalCredits(0);
      setPoolCredits(0);
      setMemberCreditLimit(null);
      setMemberCreditsUsed(null);
      setCreditScope("user");
      setMemberCount(0);
      return 0;
    }
  };

  const isAdmin = () => {
    return user?.role === "admin";
  };

  const login = async (email, password, skipRedirect = false) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/login`,
        { email, password },
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );

      if (resp.data?.msg === "Login successful") {
        if (typeof window !== "undefined") {
          try { sessionStorage.removeItem("hasSeenInitialSearchLoad"); } catch {}
          try { sessionStorage.removeItem("hasMadeRealSearch"); } catch {}
          try { sessionStorage.setItem("justSignedIn", "true"); } catch {}
        }
        await checkAuth();
        
        // console.log("User role:", resp.data?.data?.role);
        if (resp.data?.data?.role === "admin") {
          router.push("/userManagement");
        } else if (!skipRedirect && pathname !== "/firstSignin" && resp.data?.data?.role !== "admin") {
          router.push("/search");
        }
        
        return { success: true };
      }

      return { success: false, message: resp.data?.msg || "Login failed" };
    } catch (error) {
      console.error("❌ Login error:", error);
      let message = "Login failed. Please check your credentials.";
      if (error.response?.status === 404)
        message = "User not found. Please check your email address.";
      else if (error.response?.status === 401)
        message = "Invalid email or password.";
      else if (error.response?.status === 403)
        message = error.response.data.msg || "Please verify your email address.";
      else if (error.response?.data?.msg) message = error.response.data.msg;
      else if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK")
        message =
          `Cannot connect to server. Is your backend running on ${config.apiUrl}?`;
      return { success: false, message };
    }
  };

  const signup = async (userData) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/register`,
        userData,
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );

      if (resp.data?.requiresWhatsApp) {
        return {
          success: true,
          requiresWhatsApp: true,
          message: resp.data.msg,
        };
      }

      if (resp.data?.msg.includes("Please check your email")) {
        return {
          success: true,
          message:
            "Registration successful! Please check your email to verify your account.",
        };
      }

      return { success: false, message: resp.data?.msg || "Signup failed" };
    } catch (error) {
      console.error("❌ Signup error:", error);
      let message = "Signup failed. Please try again.";
      
      // Always extract the exact error message from the backend if it exists
      if (error.response?.data?.msg) {
        message = error.response.data.msg;
      } else if (error.response?.data?.error) {
        message = error.response.data.error;
      } else if (error.response?.status === 500) {
        message = "Server error. Please try again later.";
      } else if (error.code === "ECONNREFUSED") {
        message = "Cannot connect to server. Is your backend running on port 5000?";
      }
      
      return { success: false, message };
    }
  };

  const sendWhatsAppOtp = async (email, whatsappNumber) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/send-whatsapp-otp`,
        { email, whatsappNumber },
        { headers: { "Content-Type": "application/json" }, withCredentials: true }
      );
      return { success: true, message: resp.data?.msg };
    } catch (error) {
      console.error("❌ Send WhatsApp OTP error:", error);
      return { success: false, message: error.response?.data?.msg || "Failed to send WhatsApp verification code." };
    }
  };

  const verifyWhatsAppOtp = async (email, otp) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/verify-whatsapp-otp`,
        { email, otp },
        { headers: { "Content-Type": "application/json" }, withCredentials: true }
      );
      
      return { success: true, message: resp.data?.msg };
    } catch (error) {
      console.error("❌ Verify WhatsApp OTP error:", error);
      return { success: false, message: error.response?.data?.msg || "Failed to verify WhatsApp code." };
    }
  };

  const logout = async () => {
    try {
      await axios.post(
        `${config.apiUrl}/api/auth/logout`,
        {},
        { withCredentials: true }
      );
    } finally {
      localStorage.removeItem("user-data");
      if (typeof window !== "undefined") {
        try { sessionStorage.removeItem("mawsool:lastSearchFilters"); } catch {}
        try { sessionStorage.removeItem("mawsool:searchState"); } catch {}
        try { sessionStorage.removeItem("hasSeenInitialSearchLoad"); } catch {}
        try { sessionStorage.removeItem("hasMadeRealSearch"); } catch {}
        try { sessionStorage.removeItem("justSignedIn"); } catch {}
      }
      setUser(null);
      setCredits(0);
      setIsAuthenticated(false);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("justLoggedOut", "1");
      }
      router.replace("/signin");
    }
  };

  const forgotPassword = async (email) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/forgot-password`,
        { email },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (resp.data?.msg === "This Account is not associated. Please Enter your correct Email!") {
        return {
          success: false,
          message: resp.data.msg,
        };
      }

      if (resp.data?.isOAuthUser) {
        return {
          success: true,
          isOAuthUser: true,
          message: resp.data?.msg || "Please use Google or Microsoft to sign in",
        };
      }

      return {
        success: true,
        message: resp.data?.msg || "Password reset link sent to your email",
      };
    } catch (error) {
      console.error("❌ Forgot password error:", error);
      let message = "Failed to send reset link. Please try again.";
      
      if (error.response?.data?.msg) {
        message = error.response.data.msg;
      } else if (error.code === "ECONNREFUSED") {
        message = "Cannot connect to server. Is your backend running on port 5000?";
      }
      
      return { success: false, message };
    }
  };

  const resetPassword = async (token, password) => {
    try {
      const resp = await axios.post(
        `${config.apiUrl}/api/auth/reset-password`,
        { token, password },
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );

      if (resp.data?.msg === "Password reset successful") {
        await checkAuth();
        
        if (typeof window !== "undefined") {
          sessionStorage.setItem("justResetPassword", "1");
        }
        
        return { 
          success: true,
          message: "Password has been reset successfully"
        };
      }

      return { 
        success: false, 
        message: resp.data?.msg || "Failed to reset password" 
      };
    } catch (error) {
      console.error("❌ AuthContext Reset password error:", error);
      let message = "Failed to reset password. Please try again.";
      
      if (error.response?.status === 400) {
        message = error.response.data?.msg || "Invalid or expired token";
      } else if (error.response?.data?.msg) {
        message = error.response.data.msg;
      } else if (error.code === "ECONNREFUSED") {
        message = "Cannot connect to server. Is your backend running on port 5000?";
      }
      
      return { success: false, message };
    }
  };

  const getSubscriptions = async () => {
    try {
      const resp = await axios.get(
        `${config.apiUrl}/api/subscriptions/me`,
        {
          headers: { "Content-Type": "application/json" },
          withCredentials: true,
        }
      );
      // console.log("Subscriptions:", resp.data);
      return resp.data.org;
    } catch (error) {
      console.error("❌ Get Subscriptions error:", error);
    }
  };


  const value = {
    user,
    isAuthenticated,
    loading,
    credits, 
    personalCredits,
    poolCredits,
    memberCreditLimit,
    memberCreditsUsed,
    creditScope,
    memberCount,
    setCredits, 
    updateCredits,
    login,
    signup,
    sendWhatsAppOtp,
    verifyWhatsAppOtp,
    logout,
    checkAuth,
    forgotPassword,
    resetPassword,
    isAdmin,
    getSubscriptions,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};