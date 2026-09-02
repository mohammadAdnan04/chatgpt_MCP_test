import axios from "axios";

const axiosInstance = axios.create({
  // Use environment variable for flexibility. 
  // Ensure NEXT_PUBLIC_API_URL is set to your Backend API URL (e.g. http://c8wsoogkwg8skc80ks0sgk44.34.166.92.24.sslip.io)
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://api2.mawsool.tech",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false
});

export default axiosInstance;