import React from "react";
import Sidebar from "../shared/Sidebar";
import ProtectedRoute from "../ProtectedRoute.js";

const DashboardLayout = ({ children }) => {
  return (
    <ProtectedRoute>
      <div className="relative z-10 w-full h-screen flex gap-0">
        <Sidebar />
        {children}
      </div>
    </ProtectedRoute>
  );
};

export default DashboardLayout;
