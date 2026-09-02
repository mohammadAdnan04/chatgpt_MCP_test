"use client";
import { useState, useRef, useEffect } from "react";

export default function CustomDropdown({ title, suggestionsList, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState("bottom"); // Track if dropdown should be above or below
  const buttonRef = useRef(null); // Reference to the button
  const dropdownRef = useRef(null); // Reference to the dropdown

  // Function to calculate dropdown position
  const calculateDropdownPosition = () => {
    if (!buttonRef.current || !dropdownRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const maxDropdownHeight = 320; 
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    if (spaceBelow < maxDropdownHeight && spaceAbove >= maxDropdownHeight) {
      setDropdownPosition("top");
    } else {
      setDropdownPosition("bottom");
    }
  };

  // Recalculate position when dropdown opens, window resizes, or scrolls
  useEffect(() => {
    if (isOpen) {
      calculateDropdownPosition();
      window.addEventListener("resize", calculateDropdownPosition);
      window.addEventListener("scroll", calculateDropdownPosition);
    }
    return () => {
      window.removeEventListener("resize", calculateDropdownPosition);
      window.removeEventListener("scroll", calculateDropdownPosition);
    };
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        buttonRef.current &&
        dropdownRef.current &&
        !buttonRef.current.contains(event.target) &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (item) => {
    setSelected(item);
    setIsOpen(false);

    // Trigger parent callback
    if (onChange) {
      onChange(item);
    }
  };

  return (
    <div className="relative">
      {/* Dropdown Button */}
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="input__field !bg-transparent w-full"
      >
        {title ? title : "Choose Option"}
      </button>

      {/* Options */}
      {isOpen && (
        <ul
          ref={dropdownRef}
          className={`absolute z-20 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto ${
            dropdownPosition === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {suggestionsList.map((item) => (
            <li
              key={item.id}
              onClick={() => handleSelect(item)}
              className="px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
            >
              {item.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}