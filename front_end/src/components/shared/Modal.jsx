"use client";
import React from "react";

const Modal = ({heading, isOpen, onClose, children}) => {
  if (typeof isOpen !== "undefined" && !isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center z-40 justify-center" onClick={onClose}>
      <div className="flex flex-col items-center gap-4 p-4 bg-[#FBFBFC] rounded-2xl max-w-[546px] w-full" onClick={(e) => e.stopPropagation()}>
        {heading === "" ? null : <ModalHeader heading={heading} onClose={onClose} />}
        {children}
      </div>
    </div>
  );
};

const ModalHeader = ({heading, onClose}) =>{
    return(
        <div className="flex items-center justify-between w-full">
            <span className="text-lg font-medium text-[#222] leading-[120%]">
                {heading || "Modal Heading"}
            </span>
        
            <img src="/icons/closeBlack.svg" className="cursor-pointer hover:opacity-80 transition-all" onClick={onClose} alt="" />
        </div>
    )
}

export default Modal;
