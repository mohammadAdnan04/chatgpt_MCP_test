"use client";

import { useEffect } from "react";
import axios from "axios";

export default function AxiosConfig() {
  useEffect(() => {
    // This forces every axios request to include the auth cookie
    axios.defaults.withCredentials = true;
  }, []);

  return null;
}