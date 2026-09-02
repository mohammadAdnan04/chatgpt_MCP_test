"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";

const FilterContext = createContext();

export const useFilter = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used within a FilterProvider");
  return ctx;
};

const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

export const FilterProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [currentFilters, setCurrentFilters] = useState({});
  const [savedFilters, setSavedFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [filterName, setFilterName] = useState("");

  // Fetch saved filters when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedFilters();
    }
  }, [isAuthenticated]);

  const fetchSavedFilters = async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`${config.apiUrl}/api/filters/get-Filter`, {
        withCredentials: true
      });
      
      if (response.data && response.data.data && response.data.data.filters) {
        setSavedFilters(response.data.data.filters);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Just means no saved filters exist yet, completely normal
      } else {
        console.error("Error fetching saved filters:", err);
        setError(err.response?.data?.msg || "Failed to load saved filters");
      }
    } finally {
      setLoading(false);
    }
  };

  const updateCurrentFilters = (filters) => {
    setCurrentFilters(filters);
  };

  const openSaveFilterModal = () => {
    setFilterName("");
    setShowNameModal(true);
  };

  const closeSaveFilterModal = () => {
    setShowNameModal(false);
  };

  const saveFilter = async () => {
    if (!filterName.trim()) {
      setError("Filter name is required");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Create a structure where the key is the filter name
      const updatedFilters = {
        ...savedFilters,
        [filterName]: currentFilters
      };
      
      const response = await axios.post(
        `${config.apiUrl}/api/filters/save`,
        { filters: updatedFilters },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" }
        }
      );
      
      if (response.data && response.data.data) {
        setSavedFilters(response.data.data.filters);
        closeSaveFilterModal();
      }
    } catch (err) {
      console.error("Error saving filter:", err);
      setError(err.response?.data?.msg || "Failed to save filter");
    } finally {
      setLoading(false);
    }
  };

  // New method to create a filter (separate from saveFilter)
  const createFilter = async (name, filterData) => {
    if (!name || !name.trim()) {
      setError("Filter name is required");
      return false;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // For this endpoint, we're creating a new filter set
      const newFilters = {
        [name]: filterData || currentFilters
      };
      
      const response = await axios.post(
        `${config.apiUrl}/api/filters/create`,
        { filters: newFilters },
        {
          withCredentials: true,
          headers: { "Content-Type": "application/json" }
        }
      );
      
      if (response.data && response.data.data) {
        // Update local state with the new filters
        setSavedFilters(response.data.data.filters);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error creating filter:", err);
      setError(err.response?.data?.msg || "Failed to create filter");
      return false;
    } finally {
      setLoading(false);
    }
  };

  // New method to delete all filters
  const deleteAllFilters = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.delete(
        `${config.apiUrl}/api/filters/delete`,
        { withCredentials: true }
      );
      
      if (response.status === 200) {
        // Clear saved filters from state
        setSavedFilters({});
        return true;
      }
      return false;
    } catch (err) {
      console.error("Error deleting filters:", err);
      setError(err.response?.data?.msg || "Failed to delete filters");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = (filterName) => {
    if (savedFilters && savedFilters[filterName]) {
      setCurrentFilters(savedFilters[filterName]);
      return true;
    }
    return false;
  };

  const value = {
    currentFilters,
    savedFilters,
    loading,
    error,
    showNameModal,
    filterName,
    setFilterName,
    updateCurrentFilters,
    openSaveFilterModal,
    closeSaveFilterModal,
    saveFilter,
    applyFilter,
    fetchSavedFilters,
    // New methods
    createFilter,
    deleteAllFilters
  };

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};