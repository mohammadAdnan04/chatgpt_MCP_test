"use client";

import DashboardContainer from "@/components/dashboardLayoutContainer";
import Modal from "@/components/shared/Modal";
import PaginationControls from "@/components/shared/PaginationControls";
import Tabs from "@/components/search/Tabs";
import { ChevronDown, MoreHorizontal, Plus, Eye, Loader2 } from "lucide-react";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { TickDouble01Icon } from "hugeicons-react";
import Swal from "sweetalert2";
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};
const api = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

// Status Badge Component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    pending: {
      bgColor: "bg-[#04145C]",
      textColor: "text-[#E2E2E2]",
      label: "Pending",
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M8.0001 14.4001C7.12543 14.4001 6.29876 14.2321 5.5201 13.8961C4.74143 13.5601 4.06143 13.1014 3.4801 12.5201C2.89876 11.9388 2.4401 11.2588 2.1041 10.4801C1.7681 9.70143 1.6001 8.87476 1.6001 8.0001C1.6001 7.11476 1.76799 6.28543 2.10376 5.5121C2.43943 4.73876 2.89771 4.06143 3.4786 3.4801C4.05949 2.89876 4.73893 2.4401 5.51693 2.1041C6.29504 1.7681 7.12104 1.6001 7.99493 1.6001C8.17615 1.6001 8.32232 1.65565 8.43343 1.76676C8.54454 1.87788 8.6001 2.0196 8.6001 2.19193C8.6001 2.36426 8.54454 2.50871 8.43343 2.62526C8.32232 2.74182 8.17788 2.8001 8.0001 2.8001C6.55932 2.8001 5.33243 3.30288 4.31943 4.30843C3.30654 5.31399 2.8001 6.54176 2.8001 7.99176C2.8001 9.44176 3.30654 10.6723 4.31943 11.6834C5.33243 12.6945 6.55932 13.2001 8.0001 13.2001C9.45565 13.2001 10.6862 12.6937 11.6918 11.6808C12.6973 10.6678 13.2001 9.44088 13.2001 8.0001C13.2001 7.82232 13.2584 7.67788 13.3749 7.56676C13.4915 7.45565 13.6359 7.4001 13.8083 7.4001C13.9806 7.4001 14.1223 7.45565 14.2334 7.56676C14.3445 7.67788 14.4001 7.82404 14.4001 8.00526C14.4001 8.87915 14.2321 9.70515 13.8961 10.4833C13.5601 11.2613 13.1014 11.9407 12.5201 12.5216C11.9388 13.1025 11.2614 13.5608 10.4881 13.8964C9.71476 14.2322 8.88543 14.4001 8.0001 14.4001Z"
            fill="currentColor"
          />
        </svg>
      ),
    },
    verified: {
      bgColor: "bg-[#00D2FF]",
      textColor: "text-[#222]",
      label: "Verified",
      icon: <TickDouble01Icon size={16} color="#222" />,
    },
    active: {
      bgColor: "bg-green-500",
      textColor: "text-white",
      label: "Active",
      icon: <img src="/icons/verified.svg" alt="verfied icons svg" />,
    },
  };

  const config = statusConfig[status] || statusConfig["pending"];

  return (
    <div
      className={`w-fit flex items-center gap-1 p-1 px-2 rounded-md ${config.bgColor}`}
    >
      <div className={config.textColor}>{config.icon}</div>
      <p className={`text-xs font-medium ${config.textColor}`}>
        {config.label}
      </p>
    </div>
  );
};

// Edit Modal Component
const EditListModal = ({ isOpen, onClose, list, onSave }) => {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (list) {
      setName(list.name || "");
      setStatus(list.status || "active");
    }
  }, [list]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await onSave(list._id, { name, status });
      onClose();
    } catch (error) {
      console.error("Failed to update list:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal heading="Edit List" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input__field w-full"
          placeholder="Enter list name"
          required
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input__field w-full"
        >
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
        </select>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 cursor-pointer text-sm border border-gray-300 rounded-xl hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="bg-button cursor-pointer text-[#E5E5E5] px-2.5 py-2 rounded-xl text-sm flex items-center gap-1"
          >
            {loading ? "Updating..." : "Update List"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Sort Arrow Component
const SortArrow = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="hover:bg-gray-100 rounded p-1 transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.85983 6.85983C4.00628 6.71339 4.24372 6.71339 4.39017 6.85983L6 8.46967L7.60984 6.85983C7.75628 6.71339 7.99372 6.71339 8.14016 6.85983C8.28661 7.00628 8.28661 7.24372 8.14016 7.39017L6.26516 9.26516C6.11872 9.41161 5.88128 9.41161 5.73484 9.26516L3.85983 7.39017C3.71339 7.24372 3.71339 7.00628 3.85983 6.85983Z"
          fill="#6B7271"
        />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M3.85983 5.14017C4.00628 5.28661 4.24372 5.28661 4.39017 5.14017L6 3.53033L7.60984 5.14017C7.75628 5.28661 7.99372 5.28661 8.14016 5.14017C8.28661 4.99372 8.28661 4.75628 8.14016 4.60983L6.26516 2.73484C6.11872 2.58839 5.88128 2.58839 5.73484 2.73484L3.85983 4.60983C3.71339 4.75628 3.71339 4.99372 3.85983 5.14017Z"
          fill="#6B7271"
        />
      </svg>
    </button>
  );
};

const ActionsMenu = ({ onEdit, onDelete, onView }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 hover:bg-gray-100 rounded transition-colors"
      >
        <MoreHorizontal size={18} className="text-[#434343] cursor-pointer" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          <div className="absolute right-0 top-8 z-20 w-32 bg-white border border-gray-200 rounded-md shadow-lg py-1">
            {/* <button
              onClick={() => {
                onEdit && onEdit();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors"
            >
              Edit
            </button> */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete && onDelete();
                setIsOpen(false);
              }}
              className="cursor-pointer w-full px-3 py-2 text-xs text-left hover:bg-gray-50 text-red-600 transition-colors"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const TableHeader = ({ onSort }) => {
  const columns = [
    { key: "select", label: "", width: "w-[5%]" },
    { key: "name", label: "List Name", width: "w-[40%]", align: "justify-center" },
    { key: "itemsCount", label: "Total Items", width: "w-[20%]", align: "justify-center" },
    { key: "status", label: "Status", width: "w-[15%]", align: "justify-center" },
    { key: "createdAt", label: "Created On", width: "w-[20%]", align: "justify-center" },
  ];

  return (
    <div className="w-full px-4 py-3 flex items-center border-b-[1px] border-[#E5E6E6] bg-gray-50/50">
      {columns.map((column) => (
        <div key={column.key} className={`${column.width} flex items-center ${column.align || ""} gap-1`}>
          <p className="text-[10px] text-[#6B7271] font-medium uppercase tracking-wide">
            {column.label}
          </p>
          {column.key !== "select" && (
            <SortArrow onClick={() => onSort && onSort(column.key)} />
          )}
        </div>
      ))}
    </div>
  );
};

const TableRow = ({ item, onView, onToggleSelect, checked, canSelect }) => {
  // Format date to be more user-friendly
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${diffInHours} hours ago`;
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onView && onView(item._id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView && onView(item._id);
        }
      }}
      className="w-full px-4 py-3.5 flex items-center border-b-[1px] border-[#E5E6E6] bg-white transition-all duration-200 ease-out group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#04145C] focus:ring-offset-1 hover:bg-gray-50 hover:shadow-sm hover:-translate-y-[0.5px]"
    >
      <div className="w-[5%] flex items-center">
        <input type="checkbox" disabled={!canSelect} checked={!!checked} onClick={(e)=>e.stopPropagation()} onChange={()=> onToggleSelect && onToggleSelect()} aria-label="Select list" />
      </div>
      <div className="w-[40%] flex justify-center px-4">
        <p className="text-sm text-[#434343] font-medium truncate text-center max-w-full">
          {item.name}
        </p>
      </div>
      <div className="w-[20%] flex justify-center items-center gap-2 flex-wrap">
        <p className="text-sm text-[#434343] font-medium text-center">
          {item.itemsCount}
        </p>
        {item.isSyncing && (
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" title="Saving leads..." />
        )}
        {item.revealStatus === 'running' && (
          <div className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full" title={`Revealing ${item.revealProgress?.type || 'data'}...`}>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{item.revealProgress?.current || 0} / {item.revealProgress?.total || 0}</span>
          </div>
        )}
      </div>
      <div className="w-[15%] flex justify-center">
        <StatusBadge status={item.status || "pending"} />
      </div>
      <div className="w-[20%] flex justify-center">
        <p className="text-sm text-[#434343] font-medium text-center">
          {formatDate(item.createdAt)}
        </p>
      </div>
    </div>
  );
};

const EmptyState = ({ onCreateNew }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <img className="mb-4 h-40" src="/icons/notFoundSearch.gif" alt="No lists found" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">No lists found</h3>
      <p className="text-gray-500 mb-6 max-w-sm">
        You haven't created any lists yet. Create your list to get started.
      </p>
    </div>
  );
};

const List = () => {
  const [listItems, setListItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [selected, setSelected] = useState({});
  const [activeTab, setActiveTab] = useState("people");

  const router = useRouter();

  // Fetch lists from API
  const fetchLists = async () => {
    try {
      setLoading(true);
      setError("");
      
      const response = await axios.get(`${config.apiUrl}/api/list`, {
        headers: {
          "Content-Type": "application/json",
        },
        withCredentials: true,
      });

      // console.log("✅ Lists fetched:", response.data);

      if (Array.isArray(response.data)) {
        let items = response.data.slice();
        items.sort((a,b)=>{
          const an = String(a.name||"").toLowerCase();
          const bn = String(b.name||"").toLowerCase();
          const aIsSpecial = an === "saved leads" || an === "revealed search results";
          const bIsSpecial = bn === "saved leads" || bn === "revealed search results";
          if (aIsSpecial && !bIsSpecial) return -1;
          if (bIsSpecial && !aIsSpecial) return 1;
          return 0;
        });
        setListItems(items);
      } else {
        setListItems([]);
      }
    } catch (error) {
      console.error("❌ Failed to fetch lists:", error);

      let errorMessage = "Failed to load lists";
      if (error.response?.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (error.response?.status === 404) {
        errorMessage = "Lists endpoint not found.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Load lists on component mount
  useEffect(() => {
    fetchLists();
  }, []);

  // Poll for updates if any list is currently syncing or revealing
  useEffect(() => {
    let interval;
    const hasSyncing = listItems.some(list => list.isSyncing || list.revealStatus === 'running');
    if (hasSyncing) {
      interval = setInterval(async () => {
        try {
          const response = await axios.get(`${config.apiUrl}/api/list`, {
            headers: { "Content-Type": "application/json" },
            withCredentials: true,
          });
          if (Array.isArray(response.data)) {
            let items = response.data.slice();
            items.sort((a,b)=>{
              const an = String(a.name||"").toLowerCase();
              const bn = String(b.name||"").toLowerCase();
              const aIsSpecial = an === "saved leads" || an === "revealed search results";
              const bIsSpecial = bn === "saved leads" || bn === "revealed search results";
              if (aIsSpecial && !bIsSpecial) return -1;
              if (bIsSpecial && !aIsSpecial) return 1;
              return 0;
            });
            setListItems(items);
          }
        } catch (error) {
          console.error("❌ Failed to poll lists:", error);
        }
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [listItems]);

  const handleSort = (column) => {
    setSortColumn(column);
    // console.log("Sorting by:", column);

    const sortedItems = [...listItems].sort((a, b) => {
      if (column === "name") {
        return a.name.localeCompare(b.name);
      } else if (column === "itemsCount") {
        return (b.itemsCount || 0) - (a.itemsCount || 0);
      } else if (column === "createdAt") {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return 0;
    });

    setListItems(sortedItems);
  };

  const handleView = (id) => {
    // console.log("View item:", id);
    router.push(`/lists/${id}`);
  };

  const handleEdit = (id) => {
    // console.log("Edit item:", id);
    const listToEdit = listItems.find((item) => item._id === id);
    setEditingList(listToEdit);
    setEditModalOpen(true);
  };

  const handleUpdateList = async (id, updateData) => {
    try {
      const token = getAuthToken();

      // console.log("🔄 Updating list:", id, updateData);

      await axios.put(`${config.apiUrl}/api/list/${id}`, updateData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        withCredentials: true,
      });

      // console.log("✅ List updated successfully");

      // Refresh the list
      await fetchLists();
    } catch (error) {
      console.error("❌ Failed to update list:", error);
      throw error;
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Confirm Deletion",
      text: "Are you sure you want to delete this list? This action is permanent and cannot be undone",
      imageUrl: "/icons/mawsool-warning.webp",
      imageHeight: 200,
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
      // console.log("🔄 Deleting list:", id);

      const res = await api.delete(`/api/list/${id}`);

      // console.log(res);

      // Refresh the list
      await fetchLists();
    } catch (error) {
      // console.error("❌ Failed to delete list:", error);
      Swal.fire({
        imageUrl: "/icons/mawsool-error.webp",
        imageHeight: 200,
        imageAlt: "Custom alert icon",
        title: "Failed to delete list",
        text: "Please try again.",
      });
    }
  };

  const handleCreateNew = () => {
    // console.log("Create new list");
    // Navigate to create page or open modal
    router.push("/dashboard/create-list");
  };

  const handlePageSizeChange = (size) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const isEligible = (item) => {
    const kind = String(item.kind || '').toLowerCase();
    const nameLower = String(item.name || '').toLowerCase();
    if (kind === 'revealed_search_results' || nameLower === 'revealed search results' || nameLower === 'saved leads') return false;
    if (String(item.status || '').toLowerCase() === 'pending') return false;
    return true;
  };
  const toggleSelect = (id, eligible) => {
    if (!eligible) return;
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const selectedIds = Object.entries(selected).filter(([id, v]) => v).map(([id]) => id);
  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return;
    const result = await Swal.fire({
      title: "Delete selected lists?",
      text: "This action is permanent and cannot be undone",
      imageUrl: "/icons/mawsool-warning.webp",
      imageAlt: "Warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      customClass: { confirmButton: "swal-confirm-button", cancelButton: "swal-cancel-button" }
    });
    if (!result.isConfirmed) return;
    try {
      await Promise.all(selectedIds.map((id) => api.delete(`/api/list/${id}`)));
      setSelected({});
      await fetchLists();
    } catch (e) {
      Swal.fire({ imageUrl: "/icons/mawsool-error.webp", imageAlt: "Error", title: "Failed to delete", text: "Please try again." });
    }
  };

  // Calculate pagination
  const filteredListItems = listItems.filter(item => {
    const type = item.listType || "people";
    return type === activeTab;
  });
  const totalItems = filteredListItems.length;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredListItems.slice(startIndex, endIndex);

  if (loading) {
    return (
      <DashboardContainer heading={"Lists"}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-sm text-gray-600">Loading lists...</p>
          </div>
        </div>
      </DashboardContainer>
    );
  }

  return (
    <DashboardContainer heading="Lists">
      <div className="w-full h-full flex flex-col rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC]">
        <div className="p-4 border-b border-[#E5E6E6] bg-white rounded-t-[24px] rounded-b-[0px]">
          <h2 className="text-lg font-semibold text-gray-900">Your Lists</h2>
          <p className="text-sm text-gray-500 mb-4">
            Manage and organize all your prospect lists with ease.
          </p>

          <Tabs activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setCurrentPage(1); }} />

          <div className="mt-3">
            <button
              onClick={selectedIds.length ? handleDeleteSelected : undefined}
              disabled={!selectedIds.length}
              className={`px-3 py-2 text-sm font-medium rounded-xl ${
                selectedIds.length
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-300 text-gray-600 cursor-not-allowed"
              }`}
              aria-disabled={!selectedIds.length}
              title={selectedIds.length ? "Delete selected lists" : "Select lists to enable delete"}
            >
              Delete Selected {selectedIds.length ? `(${selectedIds.length})` : ""}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={fetchLists}
              className="mt-2 text-red-600 text-xs underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Table Content */}
        {filteredListItems.length === 0 && !error ? (
          <EmptyState onCreateNew={handleCreateNew} />
        ) : (
          <>
            <div className="flex-1 flex flex-col p-3">
              <TableHeader onSort={handleSort} />
              <div className="flex-1 ">
                {paginatedItems.map((item) => (
                  <TableRow
                    key={item._id}
                    item={item}
                    onView={handleView}
                    onToggleSelect={() => toggleSelect(item._id, isEligible(item))}
                    checked={!!selected[item._id]}
                    canSelect={isEligible(item)}
                  />
                ))}
              </div>
            </div>

            {/* Pagination */}
            {totalItems > itemsPerPage && (
              <div className="p-4 border-t border-[#E5E6E6] bg-white/50">
                <PaginationControls
                  currentPage={currentPage}
                  totalItems={totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageSizeChange={handlePageSizeChange}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      <EditListModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingList(null);
        }}
        list={editingList}
        onSave={handleUpdateList}
      />
    </DashboardContainer>
  );
};

export default List;
