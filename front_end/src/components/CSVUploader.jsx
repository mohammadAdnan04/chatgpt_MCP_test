"use client";

import { useState, useRef } from 'react';

// You can reuse the config object if it's defined elsewhere, or define it here.
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
};

/**
 * A reusable component for uploading a CSV file for a specific query.
 * @param {object} props
 * @param {string} props.queryId - The ID of the query to associate the upload with.
 * @param {function} props.onUploadSuccess - A callback function to run after a successful upload.
 */
const CSVUploader = ({ queryId, onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null); // To trigger the file input click programmatically

  // Handles the file selection from the input
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setMessage(`Selected: ${selectedFile.name}`);
      } else {
        setFile(null);
        setMessage('Error: Please select a valid CSV file.');
      }
    }
  };

  // Handles the actual file upload to the backend
  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file to upload first.');
      return;
    }

    setUploading(true);
    setMessage('Uploading, please wait...');

    const formData = new FormData();
    // 'leadsFile' must match the name expected by your backend's multer setup
    formData.append('leadsFile', file);
    formData.append('isAiQuery', 'true'); // Flag to tell backend this should be treated as AI Query list

    try {
      const res = await fetch(`${config.apiUrl}/api/admin/queries/${queryId}/upload`, {
        method: 'POST',
        credentials: 'include', // Important for sending auth cookies
        body: formData, // No 'Content-Type' header needed; the browser sets it for FormData
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'An unknown error occurred during upload.');
      }
      
      setMessage(data.message); // Show success message from the server
      
      // Call the success callback passed from the parent page to trigger a data refresh
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Reset the component state after successful upload
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = null; // Clear the file input
      }

    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ 
      border: '1px solid #e2e8f0', 
      borderRadius: '8px', 
      padding: '16px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '12px',
      fontFamily: 'sans-serif'
    }}>
      {/* Hidden file input that we trigger with our custom button */}
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        ref={fileInputRef}
        style={{ display: 'none' }}
      />
      
      {/* Custom "Choose File" button */}
      <button
        onClick={() => fileInputRef.current.click()}
        disabled={uploading}
        style={{
          padding: '8px 16px',
          border: '1px solid #cbd5e0',
          borderRadius: '6px',
          background: 'white',
          cursor: 'pointer',
        }}
      >
        Choose CSV File
      </button>
      
      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{
          padding: '8px 16px',
          border: 'none',
          borderRadius: '6px',
          background: '#1e3a8a', // Dark blue, similar to your design
          color: 'white',
          cursor: !file || uploading ? 'not-allowed' : 'pointer',
          opacity: !file || uploading ? 0.6 : 1,
        }}
      >
        {uploading ? 'Uploading...' : 'Upload CSV'}
      </button>
      
      {/* Display messages to the user */}
      {message && <p style={{ margin: 0, fontSize: '14px', color: message.startsWith('Error:') ? 'red' : 'green' }}>{message}</p>}
    </div>
  );
};

export default CSVUploader;