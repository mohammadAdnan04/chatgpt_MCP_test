import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const PasswordInput = ({
  label = "Password",
  placeholder = "Enter Your Password",
  value = "",
  onChange,
  disabled = false,
  className = "",
  error = "",
  required = false,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className={`flex flex-col gap-2 w-full ${className}`}>
      {label && (
        <label className="text-sm font-medium text-gray-800">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={`outline-none w-full px-3.5 py-3 pr-12 border rounded-lg placeholder:text-gray-400 text-sm transition-colors ${
            error
              ? "border-red-300 focus:border-red-500"
              : disabled
              ? "border-gray-300 bg-gray-50 cursor-not-allowed"
              : "border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          }`}
          {...props}
        />
        
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 transition-colors cursor-pointer ${
            disabled
              ? "text-gray-400 cursor-not-allowed"
              : "text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700"
          }`}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>
      
      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
    </div>
  );
};

export default PasswordInput;