"use client";

import Link from "next/link";
import React from "react";

const SidebarLink = ({ item, isActive }) => {
  return (
    <Link href={item.href}>
      <div
        className={`w-full flex items-center gap-[14px] p-[10px] rounded-[12px] cursor-pointer self-stretch transition-colors duration-200 ${
          isActive
            ? "bg-[#FBFBFC] border-[1px] border-[#D3D3D3]"
            : "bg-[#FBFBFC] hover:bg-[#f5f5f5] border-[1px] border-transparent"
        }`}
      >
        <div className="w-[30px] h-[30px] flex items-center justify-center bg-[#C7F5FF] rounded-full">
          <img
            src={item.icon}
            className="select-none"
            draggable="false"
            alt=""
          />
        </div>
        <p className="text-sm text-[#222] whitespace-nowrap">{item.name}</p>
      </div>
    </Link>
  );
};

export default SidebarLink;