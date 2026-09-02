"use client";

import React, { useEffect, useState } from "react";

export function RobotAssistant() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleRobotMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      setMessage(customEvent.detail);
    };

    window.addEventListener("robotMessage", handleRobotMessage);
    return () => window.removeEventListener("robotMessage", handleRobotMessage);
  }, []);

  return (
    <>
      {/* Mobile/Tablet Assistant Image */}
      <div className="lg:hidden flex justify-center mt-10 mb-20 relative">
        {message && (
          <div className="absolute bottom-full mb-4 max-w-[280px] bg-slate-800 text-white text-xs p-3 rounded-2xl rounded-br-none shadow-lg animate-in fade-in zoom-in duration-200 border border-slate-700 z-50">
            <p dangerouslySetInnerHTML={{ __html: message.replace('extremely low monitoring cost', '<strong class="font-semibold text-blue-300">extremely low monitoring cost</strong>') }} />
          </div>
        )}
        <img 
          src="/robot-assistant-v3.png" 
          alt="Mawsool Assistant" 
          className="w-48 h-auto object-contain drop-shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000" 
        />
      </div>

      {/* Floating Robot Assistant Image */}
      <div className="hidden lg:block fixed bottom-0 right-0 z-50 pointer-events-none translate-x-[15px]">
        {message && (
          <div className="absolute bottom-full right-[100px] mb-4 w-[280px] bg-slate-800 text-white text-sm p-4 rounded-2xl rounded-br-none shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300 border border-slate-700 pointer-events-auto">
            <p dangerouslySetInnerHTML={{ __html: message.replace('extremely low monitoring cost', '<strong class="font-semibold text-blue-300">extremely low monitoring cost</strong>') }} />
            {/* Tail of the bubble */}
            <div className="absolute -bottom-2 right-4 w-4 h-4 bg-slate-800 border-b border-r border-slate-700 transform rotate-45"></div>
          </div>
        )}
        <img 
          src="/robot-assistant-v3.png" 
          alt="Mawsool Assistant" 
          className="w-[138px] h-[207px] box-content pb-[40px] object-contain drop-shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 pointer-events-auto" 
        />
      </div>
    </>
  );
}
