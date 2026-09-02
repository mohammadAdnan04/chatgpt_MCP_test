
"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    // Add debugging to see what's happening
    // console.log("AdminRoute - Auth state:", { 
    //   isAuthenticated, 
    //   loading, 
    //   user,
    //   userRole: user?.role
    // });
    
    // Only check after auth state is fully loaded
    if (!loading) {
      setIsChecking(false);
      
      // Not authenticated at all
      if (!isAuthenticated) {
        // console.log("AdminRoute - Not authenticated, redirecting to signin");
        router.replace("/signin");
        return;
      }
      
      // Authenticated but not admin (case insensitive check)
      const userRole = (user?.role || "").toLowerCase();
      // console.log("AdminRoute - User role:", userRole);
      
      if (userRole !== "admin") {
        // console.log("AdminRoute - Not admin, redirecting to search");
        router.replace("/search");
      }
    }
  }, [loading, isAuthenticated, user, router]);

  // While checking auth, show spinner
  if (loading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2"></div>
      </div>
    );
  }

  // If auth check is complete and we're still here (not redirected),
  // then the user must be an authenticated admin
  if (!isAuthenticated || (user?.role || "").toLowerCase() !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600 font-medium">
          You don't have permission to access this page.
        </div>
      </div>
    );
  }

  // If we get here, the user is an authenticated admin
  return children;
};

export default AdminRoute;