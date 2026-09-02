"use client";

import DashboardContainer from "@/components/dashboardLayoutContainer";
import Button from "@/components/shared/Button";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/views/setting/Sidebar";
import Swal from "sweetalert2";

// Axios base configuration
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

const Setting = () => {
  const [userEmail, setUserEmail] = useState("");
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const { user, checkAuth } = useAuth();
  const pathname = usePathname();
  const fileInputRef = useRef(null);
  
  // Track if form has changes
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    avatar: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    isSocialLogin: false,
  });

  // Password regex for client-side validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{10,}$/;

  // Fetch user profile on component mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/user/profile`);

      if (response.data && response.data.profile) {
        const profile = response.data.profile;
        setUserProfile(profile);
        setUserEmail(profile.email);
        setFormData({
          name: profile.name || "",
          email: profile.email || "",
          avatar: profile.avatar || "",
          isSocialLogin: profile.isSocialLogin || false,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      }
    } catch (error) {
      console.error("❌ Failed to fetch user profile:", error);

      if (user) {
        setFormData({
          name: user.name || "",
          email: user.email || "",
          avatar: user.avatar || "",
          isSocialLogin: !!(user.googleId || user.microsoftId),
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
      }

      let errorMessage = "Failed to load profile data";
      if (error.response?.status === 404) {
        errorMessage = "Profile endpoint not found. Using cached user data.";
      } else if (error.response?.status === 401) {
        // errorMessage = "Authentication failed. Please log in again.";
        window.location.href = "/signin";
        return;
      }

      setMessage({ type: "error", text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  // Check if form has changes
  useEffect(() => {
    if (userProfile) {
      const isChanged =
        formData.name.trim() !== userProfile.name ||
        (editingEmail && formData.email.trim() !== userProfile.email) ||
        (editingPassword &&
          (formData.currentPassword || formData.newPassword || formData.confirmPassword)) ||
        formData.avatar !== userProfile.avatar;
      setHasChanges(isChanged);
    }
  }, [formData, userProfile, editingEmail, editingPassword]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear message when user starts typing
    if (message.text) {
      setMessage({ type: "", text: "" });
    }
  };

  // Handle file selection for avatar
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setMessage({
        type: "error",
        text: "Please select a valid image file (JPEG, PNG, GIF, or WebP)",
      });
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setMessage({ type: "error", text: "File size must be less than 5MB" });
      return;
    }

    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData((prev) => ({ ...prev, avatar: e.target.result }));
      setHasChanges(true); // Mark as changed
    };
    reader.readAsDataURL(file);

    // Clear any existing messages
    setMessage({ type: "", text: "" });
  };
  const handleEditEmail = async () => {
    console.log(userProfile.hasPassword,editingEmail);
      if (!userProfile.hasPassword) {
        setEditingPassword(true);
        setEditingEmail(false);
        Swal.fire({ 
            title: "Warning!",
            text: `You must set a password before changing your email.`,
            imageUrl: "/icons/mawsool-warning.webp",
            imageAlt: "Custom alert icon",
            confirmButtonText: "OK",
            customClass: {
              confirmButton: "swal-confirm-button",
            },
          });
        return;
      }else{
        setEditingEmail(!editingEmail);
      }
  }


  const handleSaveProfile = async () => {
    // Prevent execution if no changes or saving
    if (!hasChanges || saving) {
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      // Validate required fields
      if (!formData.name.trim()) {
        setMessage({ type: "error", text: "Name is required" });
        return;
      }

      // Validate email format if editing
      if (editingEmail && formData.email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email.trim())) {
          setMessage({ type: "error", text: "Invalid email format" });
          return;
        }
      }
      console.log(editingEmail, formData.isSocialLogin, userProfile.hasPassword);
      // Enforce password requirement for email change (non-social login users)
      if (editingEmail && !userProfile.hasPassword) {
        setEditingPassword(true);
        setEditingEmail(false);
        // setMessage({
        //   type: "error",
        //   text: "You must set a password before changing your email.",
        // });
        Swal.fire({
            title: "Warning!",
            text: `You must set a password before changing your email.`,
            imageUrl: "/icons/mawsool-warning.webp",
            imageAlt: "Custom alert icon",
            confirmButtonText: "OK",
            customClass: {
              confirmButton: "swal-confirm-button",
            },
          });
        return;
      }

      // Validate password fields if editing
      if (editingPassword) {
        if (!formData.isSocialLogin && !formData.currentPassword) {
          setMessage({ type: "error", text: "Current password is required" });
          return;
        }
        if (!formData.newPassword) {
          setMessage({ type: "error", text: "New password is required" });
          return;
        }
        if (formData.newPassword !== formData.confirmPassword) {
          setMessage({ type: "error", text: "New passwords do not match" });
          return;
        }
        // Client-side password regex validation
        if (!passwordRegex.test(formData.newPassword)) {
          setMessage({
            type: "error",
            text: "Password must be at least 10 characters with a special character, uppercase, lowercase, and a number.",
          });
          return;
        }
      }

      // Prepare update payload
      const updatePayload = {
        name: formData.name.trim(),
      };

      // Only include email if it's being edited
      let emailChanged = false;
      if (editingEmail && formData.email.trim()) {
        updatePayload.email = formData.email.trim();
        emailChanged = true;
      }

      // Only include password fields if being updated
      if (editingPassword) {
        if (!formData.isSocialLogin) {
          updatePayload.currentPassword = formData.currentPassword;
        }
        updatePayload.newPassword = formData.newPassword;
        updatePayload.confirmPassword = formData.confirmPassword;
      }

      const response = await api.put(`/api/user/update-profile`, updatePayload);

      if (response.data) {
        let successMsg = "Profile updated successfully!";
        if (emailChanged) {
          successMsg = "Verification email sent to your new address. Please check your inbox to complete the change.";
          setFormData((prev) => ({ ...prev, email: formData.email.trim() }));
        }

        setMessage({ type: "success", text: successMsg });

        // Reset editing states
        setEditingEmail(false);
        setEditingPassword(false);
        setHasChanges(false); // Reset changes

        // Clear password fields
        setFormData((prev) => ({
          ...prev,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));

        // Refresh profile data only if no email change
        if (!emailChanged) {
          await fetchUserProfile();
        }

        // Update auth context if needed
        await checkAuth();
      }
    } catch (error) {
      console.error("❌ Failed to update profile:", error);

      let errorMessage = "Failed to update profile";
      if (error.response?.status === 404) {
        errorMessage = "Update endpoint not found. Please contact support.";
      } else if (error.response?.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (error.response?.data?.msg) {
        errorMessage = error.response.data.msg;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      setMessage({ type: "error", text: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardContainer heading="Setting">
        <div className="w-full h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-sm text-gray-600">Loading profile...</p>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer heading="Setting">
      <div className="w-full h-full flex gap-4">
        <Sidebar />

        <div className="w-full h-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          <p className="text-[#222] text-xl font-semibold">Profile</p>

          {message.text && (
            <div
              className={`p-3 rounded-lg flex items-center justify-between ${
                message.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
              }`}
            >
              <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
                {message.text}
              </p>
              <button
                onClick={() => setMessage({ type: "", text: "" })}
                className={`cursor-pointer ml-2 font-bold ${
                  message.type === "success" ? "text-green-500 hover:text-green-700" : "text-red-500 hover:text-red-700"
                }`}
              >
                ×
              </button>
            </div>
          )}

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <div className="w-full flex flex-col gap-3">
                <p className="text-sm font-medium text-[#222]">Full Name</p>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className="input__field px-4 py-3.5 !text-[#434343] !font-medium placeholder:!font-medium placeholder:!text-[#434343]"
                />
              </div>

              <div className="w-full flex items-end gap-4">
                <div className="w-full flex flex-col gap-3">
                  <p className="text-sm font-medium text-[#222]">Email</p>
                  <div className="flex gap-4">
                    <input
                      type="email"
                      value={!editingEmail ? userEmail : formData.email}
                      // value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      disabled={!editingEmail}
                      className={`flex items-center gap-[6px] p-[12px] px-[14px] rounded-[8px] border border-[#E5E6E6] flex-[1_0_0] text-xs font-medium text-[#434343] placeholder:text-[#434343] ${
                        !editingEmail ? "bg-[#C2C2C2]" : "bg-white"
                      }`}
                      placeholder="Enter email address"
                    />
                  </div>
                </div>
                <div
                  className="w-fit flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#E5E6E6] cursor-pointer !h-[42px]"
                  onClick={handleEditEmail}
                >
                  <EditIcon />
                  <p className="text-sm text-[#434343]">{editingEmail ? "Cancel" : "Edit"}</p>
                </div>
              </div>

              <div className="w-full flex items-end gap-4">
                <div className="w-full flex flex-col gap-3">
                  <p className="text-sm font-medium text-[#222]">Password</p>
                  <div className="flex gap-4">
                    {!formData.isSocialLogin && (
                      <input
                        type="password"
                        value={editingPassword ? formData.currentPassword : "***********"}
                        onChange={(e) => handleInputChange("currentPassword", e.target.value)}
                        disabled={!editingPassword}
                        className={`flex items-center gap-[6px] p-[12px] px-[14px] rounded-[8px] border border-[#E5E6E6] flex-[1_0_0] text-xs font-medium text-[#434343] placeholder:text-[#434343] ${
                          !editingPassword ? "bg-[#C2C2C2]" : "bg-white"
                        }`}
                        placeholder={editingPassword ? "Enter current password" : "***********"}
                      />
                    )}
                    {formData.isSocialLogin && !editingPassword && (
                      <input
                        type="password"
                        value="***********"
                        disabled
                        className="flex items-center gap-[6px] p-[12px] px-[14px] rounded-[8px] border border-[#E5E6E6] flex-[1_0_0] text-xs font-medium text-[#434343] placeholder:text-[#434343] bg-[#C2C2C2]"
                        placeholder="***********"
                      />
                    )}
                  </div>
                </div>
                <div
                  className="w-fit flex items-center gap-1 px-2.5 py-2 rounded-xl border border-[#E5E6E6] cursor-pointer !h-[42px]"
                  onClick={() => {
                    setEditingPassword(!editingPassword);
                    if (editingPassword) {
                      setFormData((prev) => ({
                        ...prev,
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      }));
                    }
                  }}
                >
                  <EditIcon />
                  <p className="text-sm text-[#434343]">{editingPassword ? "Cancel" : "Edit"}</p>
                </div>
              </div>

              {editingPassword && (
                <>
                  <div className="w-full flex flex-col gap-3">
                    <p className="text-sm font-medium text-[#222]">New Password</p>
                    <input
                      type="password"
                      value={formData.newPassword}
                      onChange={(e) => handleInputChange("newPassword", e.target.value)}
                      placeholder="Enter new password"
                      className="input__field px-4 py-3.5 !text-[#434343] !font-medium placeholder:!font-medium placeholder:!text-[#434343]"
                    />
                  </div>
                  <div className="w-full flex flex-col gap-3">
                    <p className="text-sm font-medium text-[#222]">Confirm New Password</p>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      placeholder="Confirm new password"
                      className="input__field px-4 py-3.5 !text-[#434343] !font-medium placeholder:!font-medium placeholder:!text-[#434343]"
                    />
                  </div>
                </>
              )}
            </div>

            <Button
              arrow={false}
              variant="disabled"
              className={`w-fit !rounded-xl ${
                !hasChanges || saving
                  ? "!bg-gray-300 !text-gray-500 !cursor-not-allowed"
                  : "bg-button !text-white"
              }`}
              onClick={handleSaveProfile}
              disabled={!hasChanges || saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </DashboardContainer>
  );
};

export default Setting;

const EditIcon = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
    >
      <path
        d="M4.0502 13.95H5.00645L12.0377 6.9187L11.0814 5.96245L4.0502 12.9937V13.95ZM2.7002 15.3V12.4312L12.0377 3.0937C12.1752 2.9562 12.3242 2.8562 12.4847 2.7937C12.6451 2.7312 12.8138 2.69995 12.9909 2.69995C13.1679 2.69995 13.3377 2.7312 13.5002 2.7937C13.6627 2.8562 13.8127 2.9562 13.9502 3.0937L14.9064 4.04995C15.0439 4.18745 15.1439 4.33745 15.2064 4.49995C15.2689 4.66245 15.3002 4.82833 15.3002 4.99758C15.3002 5.1782 15.2688 5.35033 15.2061 5.51395C15.1433 5.67758 15.0434 5.82708 14.9064 5.96245L5.56895 15.3H2.7002ZM11.5511 6.44901L11.0814 5.96245L12.0377 6.9187L11.5511 6.44901Z"
        fill="#434343"
      />
    </svg>
  );
};