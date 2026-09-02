"use client";

import DashboardContainer from "@/components/dashboardLayoutContainer";
import Pagination from "@/components/shared/Pagination";
import Sidebar from "@/views/setting/Sidebar";
import { ArrowDown01Icon, Edit01Icon, Delete01Icon, UserAdd01Icon } from "hugeicons-react";
import React, { useState, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

// Axios base configuration
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

const Users = () => {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [seatsAllowed, setSeatsAllowed] = useState(0); // Admin override for extra seats
  const [maxExtraUsers, setMaxExtraUsers] = useState(0); // Default plan limit for extra seats
  const [poolCredits, setPoolCredits] = useState(0); // New state for org pool credits
  const [planKey, setPlanKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [totalUsers, setTotalUsers] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const router = useRouter();

  const orgRole = authUser?.orgRole;
  const isOwnerOrAdmin = orgRole === 'owner' || orgRole === 'admin';

  // Form state for adding/editing users
  const [formData, setFormData] = useState({
    email: "",
    role: "member",
    limit: "",
  });

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, [currentPage, itemsPerPage]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.get(`/api/team/members`);
      console.log("✅ Users fetched:", response.data);

      if (response.data.members && Array.isArray(response.data.members)) {
        setUsers(response.data.members);
        setSeatsAllowed(response.data.seatsAllowed || 0); 
        setMaxExtraUsers(response.data.maxExtraUsers || 0);
        setPlanKey(response.data.planKey || "");
        setPoolCredits(response.data.poolCredits || 0); 
        setTotalUsers(response.data.total || response.data.members.length);
      } else if (Array.isArray(response.data)) {
        setUsers(response.data);
        setSeatsAllowed(response.data.seatsAllowed || 0); 
        setMaxExtraUsers(response.data.maxExtraUsers || 0);
        setPlanKey(response.data.planKey || "");
        setPoolCredits(response.data.poolCredits || 0);
        setTotalUsers(response.data.length);
      } else {
        setUsers([]);
        setSeatsAllowed(0);
        setMaxExtraUsers(0);
        setPlanKey("");
        setPoolCredits(0);
        setTotalUsers(0);
      }
    } catch (error) {
      console.error("❌ Failed to fetch users:", error);

      let errorMessage = "Failed to load users";
      if (error.response?.status === 400) {
        errorMessage = error.response.data.msg;
      } else if (error.response?.data?.msg) {
        errorMessage = error.response.data.msg;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOrUpdateUser = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (editingUser) {
        // Update user role
        await api.put(`/api/team/member/${editingUser.id}/role`, {
          role: formData.role,
        });

        // Update user limit
        await api.put(`/api/team/member/${editingUser.id}/limit`, {
          limit: formData.limit === "" ? null : Number(formData.limit),
        });

        setUsers((prev) =>
          prev.map((user) =>
            user.id === editingUser.id
              ? {
                  ...user,
                  role: formData.role,
                  orgCreditLimit: formData.limit === "" ? null : Number(formData.limit),
                }
              : user
          )
        );

        Swal.fire({
          title: "Updated!",
          text: `User details have been updated.`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        // Add new user
        const response = await api.post("/api/team/add", {
          email: formData.email,
          role: formData.role,
        });

        const newId = response.data.id || response.data.member?.id || Date.now().toString();

        // Also set limit if provided
        if (formData.limit !== "") {
          await api.put(`/api/team/member/${newId}/limit`, {
            limit: Number(formData.limit),
          });
        }

        const newUser = {
          id: newId,
          email: formData.email,
          role: formData.role,
          avatar: response.data.avatar || "https://picsum.photos/id/870/200/300?grayscale&blur=2",
          name: response.data.name || formData.email.split("@")[0],
          balance: response.data.balance || 0,
          orgCreditLimit: formData.limit === "" ? null : Number(formData.limit),
          orgCreditsUsed: 0,
        };

        setUsers((prev) => [...prev, newUser]);
        setTotalUsers((prev) => prev + 1);
        await fetchUsers(); // Refresh to get updated seatsAllowed
        Swal.fire({
          title: "Added!",
          text: `User has been added.`,
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
      }

      setShowAddModal(false);
      resetForm();
      setError("");
    } catch (error) {
      console.error("❌ Failed to process user:", error);

      let errorMessage = editingUser ? "Failed to update user" : "Failed to add user";
      let errorTitle = editingUser ? "Update Error!" : "Add Error!";
      if (error.response?.status === 400) {
        Swal.fire({
          title: "Upgrade Your Plan",
          text: error.response.data?.msg,
          imageUrl: "/icons/mawsool-error.webp",
          imageAlt: "Custom alert icon",
          confirmButtonText: "Upgrade Plan",
          customClass: {
            confirmButton: "swal-confirm-button",
          },
        }).then((result) => {
          if (result.isConfirmed) {
            router.push("/setting/planOverview");
          }
        });
        return;
      } else if (error.response?.status === 403) {
        errorMessage = error.response.data?.msg;
      } else if (error.response?.status === 404) {
        errorMessage = error.response.data?.msg;
      } else if (error.response?.data?.msg) {
        errorMessage = error.response.data.msg;
      }

      setError(errorMessage);
      Swal.fire({
        title: errorTitle,
        text: errorMessage,
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "Are you sure you want to delete this item? This action is permanent and cannot be undone.",
      imageUrl: "/icons/mawsool-warning.webp",
      imageAlt: "Custom alert icon",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      customClass: {
        confirmButton: "swal-confirm-button",
        cancelButton: "swal-cancel-button",
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const response = await api.delete(`/api/team/member/${userId}`);

      if (response.data.msg === "Member removed") {
        setUsers((prev) => prev.filter((user) => user.id !== userId));
        setTotalUsers((prev) => prev - 1);
        await fetchUsers(); // Refresh to get updated seatsAllowed
        setError("");
        Swal.fire({
          title: "Deleted!",
          text: "Member has been removed.",
          imageUrl: "/icons/mawsool-success.webp",
          imageAlt: "Custom alert icon",
          timer: 1500,
          showConfirmButton: false,
        });
      }
    } catch (error) {
      console.error("❌ Failed to delete user:", error);

      let errorMessage = "Failed to delete user";
      if (error.response?.status === 404) {
        errorMessage = "User not found.";
      } else if (error.response?.data?.msg) {
        errorMessage = error.response.data.msg;
      }

      setError(errorMessage);
      Swal.fire({
        title: "Error!",
        text: errorMessage,
        imageUrl: "/icons/mawsool-error.webp",
        imageAlt: "Custom alert icon",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  };

  const resetForm = () => {
    setFormData({
      email: "",
      role: "member",
    });
    setEditingUser(null);
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });

    const sortedUsers = [...users].sort((a, b) => {
      if (a[key] < b[key]) return direction === "asc" ? -1 : 1;
      if (a[key] > b[key]) return direction === "asc" ? 1 : -1;
      return 0;
    });
    setUsers(sortedUsers);
  };

  // Determine if Add User button should be disabled
  const isFreePlan = !planKey || planKey.toLowerCase() === 'free';
  const actualLimit = isFreePlan ? 1 : (seatsAllowed || 1); // Default to 1 (the owner)
  
  // Disable if they are on a free plan OR if they've reached their paid seat limit
  const isAddUserDisabled = isFreePlan || (users.length >= actualLimit);

  // Members cannot manage the team — redirect them to plan overview
  if (!loading && authUser && !isOwnerOrAdmin && authUser.orgId) {
    router.replace('/setting/planOverview');
    return null;
  }

  if (loading) {
    return (
      <DashboardContainer heading={"Setting"}>
        <div className="flex items-start gap-6 h-full">
          <Sidebar />
          <div className="w-full h-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-[#04145C] border-t-transparent rounded-full animate-spin"></div>
                <div className="text-lg text-[#6B7271]">Loading users...</div>
              </div>
            </div>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer heading={"Setting"}>
      <div className="flex items-start gap-6 h-full">
        <Sidebar />
        <div className="w-full h-full p-4 flex flex-col gap-4 rounded-[16px] border border-[#E5E6E6] bg-[#FBFBFC]">
          {error && (
            <div className="w-full p-2 bg-red-100 border border-red-300 rounded-lg text-red-700 flex items-center justify-between">
              <span className="text-xs" dangerouslySetInnerHTML={{ __html: error }} />
              <button
                onClick={() => setError("")}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                ×
              </button>
            </div>
          )}

          <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <p className="text-[#222] text-xl font-semibold">
                Users ({users.length} / {actualLimit})
              </p>
              {planKey && (
                <div className="bg-[#F3F6FF] px-3 py-1 rounded-lg text-sm text-[#04145C] font-semibold border border-[#C7F5FF]">
                  {planKey} Plan
                </div>
              )}
              <div className="bg-[#E9E9E9] px-3 py-1 rounded-lg text-sm text-[#04145C] font-semibold">
                Team Pool: {poolCredits} Credits
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isAddUserDisabled && (
                <p className="text-xs text-red-500 font-medium">
                  {isFreePlan ? "Upgrade your plan to add users." : "You have reached your user limit. Buy more seats to add users."}
                </p>
              )}
              {!isFreePlan && planKey && (
                <button
                  onClick={() => router.push('/setting/planOverview')}
                  className="w-fit px-3 py-2 text-xs font-medium text-[#04145C] bg-[#F3F6FF] border border-[#C7F5FF] hover:bg-[#E5EEFF] flex items-center gap-1 rounded-lg transition-colors duration-200"
                >
                  Buy Seats
                </button>
              )}
              <button
                onClick={() => {
                  setEditingUser(null);
                  setFormData({ email: "", role: "member", limit: "" });
                  setShowAddModal(true);
                }}
                className={`w-fit px-3 py-2 text-xs font-medium text-white flex items-center gap-1 rounded-lg transition-colors duration-200 ${
                  isAddUserDisabled
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#04145C] hover:bg-[#052074] cursor-pointer"
                }`}
                disabled={isAddUserDisabled}
                title={isAddUserDisabled ? "No available seats. Upgrade your plan to add more users." : "Add a new user"}
              >
                <UserAdd01Icon size={16} />
                Add User
              </button>
            </div>
          </div>

          <div className="w-full h-fit gap-4 p-4 flex flex-col justify-between rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
            <div className="flex flex-col gap-0">
              {/* Table Header */}
              <div className="w-full px-2.5 py-1.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6]">
                <div
                  className="min-w-[140px] flex items-center gap-0 cursor-pointer hover:text-[#04145C]"
                  onClick={() => handleSort("name")}
                >
                  <p className="text-[10px] text-[#6B7271]">Name</p>
                  <ArrowDown01Icon
                    size={16}
                    className={`transform transition-transform ${
                      sortConfig.key === "name" && sortConfig.direction === "desc" ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div
                  className="min-w-[140px] flex items-center gap-0 cursor-pointer hover:text-[#04145C]"
                  onClick={() => handleSort("email")}
                >
                  <p className="text-[10px] text-[#6B7271]">Email</p>
                  <ArrowDown01Icon
                    size={16}
                    className={`transform transition-transform ${
                      sortConfig.key === "email" && sortConfig.direction === "desc" ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div
                  className="min-w-[100px] flex items-center gap-0 cursor-pointer hover:text-[#04145C]"
                  onClick={() => handleSort("role")}
                >
                  <p className="text-[10px] text-[#6B7271]">Role</p>
                  <ArrowDown01Icon
                    size={16}
                    className={`transform transition-transform ${
                      sortConfig.key === "role" && sortConfig.direction === "desc" ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div
                  className="min-w-[100px] flex items-center gap-0 cursor-pointer hover:text-[#04145C]"
                  onClick={() => handleSort("orgCreditLimit")}
                >
                  <p className="text-[10px] text-[#6B7271]">Limit & Usage</p>
                  <ArrowDown01Icon
                    size={16}
                    className={`transform transition-transform ${
                      sortConfig.key === "orgCreditLimit" && sortConfig.direction === "desc" ? "rotate-180" : ""
                    }`}
                  />
                </div>
                <div className="min-w-[100px] text-center">
                  <p className="text-[10px] text-[#6B7271]">Actions</p>
                </div>
              </div>

              {/* Table Rows */}
              {users.map((user) => (
                <div
                  key={user.id}
                  className="w-full px-2.5 py-3.5 flex items-center justify-between border-b-[1px] border-[#E5E6E6] hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-[140px] flex items-center gap-0">
                    <div className="flex items-center gap-1.5">
                      <img
                        src={
                          user.avatar ||
                          "https://picsum.photos/id/870/200/300?grayscale&blur=2"
                        }
                        referrerPolicy="no-referrer"
                        className="w-[22px] h-[22px] rounded-full select-none"
                        draggable={false}
                        alt=""
                        onError={(e) => {
                          e.target.src = "https://picsum.photos/id/870/200/300?grayscale&blur=2";
                        }}
                      />
                      <p className="text-xs text-[#222]">{user.name}</p>
                    </div>
                  </div>
                  <div className="min-w-[140px] text-[10px] text-[#434343]">
                    {user.email}
                  </div>
                  <div className="min-w-[100px] text-[12px] text-[#6B7271]">
                    {user.role}
                  </div>
                  <p className="min-w-[100px] text-[10px] text-[#6B7271]">
                    {user.orgCreditLimit === null || user.orgCreditLimit === undefined ? (
                      <span className="text-green-600">Unlimited (uses pool)</span>
                    ) : (
                      <span>{user.orgCreditsUsed || 0} / {user.orgCreditLimit} used</span>
                    )}
                  </p>
                  <div className="min-w-[100px] flex items-center justify-end gap-2">
                    {user.role !== "owner" && (
                      <>
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setFormData({
                              email: user.email,
                              role: user.role,
                              limit: user.orgCreditLimit === null || user.orgCreditLimit === undefined ? "" : user.orgCreditLimit,
                            });
                            setShowAddModal(true);
                          }}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title="Edit user"
                        >
                          <Edit01Icon size={16} className="text-[#6B7271]" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                          title="Delete user"
                        >
                          <Delete01Icon size={16} className="text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {users.length === 0 && (
                <div className="w-full py-8 text-center text-gray-500">
                  No users found
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-[#6B7271] leading-[130%]">
                  Showing
                </span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="flex cursor-pointer items-center rounded-[7px] gap-1 px-1.5 py-1.5 pl-2 text-[10px] text-[#717171] font-medium bg-[#E9E9E9]"
                >
                  <option value={12}>12</option>
                  <option value={24}>24</option>
                  <option value={48}>48</option>
                </select>
                <span className="text-xs text-[#6B7271] leading-[130%]">
                  out of {totalUsers}
                </span>
              </div>
              <Pagination
                className="!p-0"
                currentPage={currentPage}
                totalPages={Math.ceil(totalUsers / itemsPerPage)}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-96 max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">
              {editingUser ? "Edit User" : "Add New User"}
            </h2>

            <form onSubmit={handleAddOrUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#04145C] focus:border-transparent"
                  required
                  disabled={editingUser}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, role: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#04145C] focus:border-transparent"
                  required
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Credit Limit
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.limit}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, limit: e.target.value }))
                  }
                  placeholder="Leave empty for unlimited"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#04145C] focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">If left empty, this user can spend the entire team pool.</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className={`flex-1 px-4 py-2 bg-[#04145C] text-white rounded-lg transition-colors ${
                    formLoading
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-[#052074] cursor-pointer"
                  }`}
                >
                  {formLoading
                    ? "Processing..."
                    : editingUser
                    ? "Update User"
                    : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardContainer>
  );
};

export default Users;