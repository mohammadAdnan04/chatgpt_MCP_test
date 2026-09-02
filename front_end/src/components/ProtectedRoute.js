
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      const fromLogout =
        typeof window !== "undefined" &&
        sessionStorage.getItem("justLoggedOut") === "1";

      if (fromLogout) {
        sessionStorage.removeItem("justLoggedOut"); // consume the flag
        router.replace("/signin");
      } else {
        router.replace("/signup");
      }
    }
  }, [loading, isAuthenticated, router]);

  // While checking or redirecting, show a minimal spinner (not a blank page)
  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2"></div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
