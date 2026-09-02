"use client";

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ExtensionThankYou() {
  useEffect(() => {
    // Optional: Push installation success to Google Tag Manager
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'extension_installed'
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#FBFBFC] flex flex-col items-center justify-center p-4 font-sans text-[#222]">
      <div className="bg-white max-w-2xl w-full rounded-[20px] shadow-[0_4px_30px_rgba(0,0,0,0.05)] border border-[#E5E6E6] p-8 md:p-12 flex flex-col items-center text-center relative overflow-hidden">
        
        {/* Decorative Background Blob */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-[#00D2FF] opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-[#04145C] opacity-10 rounded-full blur-3xl"></div>

        {/* Logo */}
        <div className="mb-8 z-10">
          <Image src="/basic/logo.png" alt="Mawsool Logo" width={180} height={32} />
        </div>

        {/* Header */}
        <h1 className="text-3xl md:text-4xl font-bold text-[#04145C] mb-4 z-10 tracking-tight">
          You're all set! Mawsool is now installed.
        </h1>
        <p className="text-[#6B7271] text-lg mb-10 max-w-lg z-10">
          Get ready to find verified B2B contact data in seconds. Follow these quick steps to get started:
        </p>

        {/* Steps */}
        <div className="flex flex-col gap-8 w-full max-w-md text-left mb-10 z-10">
          
          <div className="flex items-start gap-5 p-4 rounded-2xl bg-[#F3F6FF] border border-[#C7F5FF] transition-transform hover:-translate-y-1 duration-300">
            <div className="w-10 h-10 rounded-full bg-[#00D2FF] text-[#04145C] font-black text-lg flex items-center justify-center shrink-0 shadow-sm">1</div>
            <div className="flex flex-col gap-1 mt-1">
              <h3 className="text-lg font-bold text-[#222]">Pin the extension</h3>
              <p className="text-[#6B7271] text-sm">Click the puzzle icon in your browser toolbar and pin Mawsool for easy access.</p>
            </div>
          </div>

          <div className="flex items-start gap-5 p-4 rounded-2xl bg-white border border-[#E5E6E6] transition-transform hover:-translate-y-1 duration-300">
            <div className="w-10 h-10 rounded-full bg-[#F3F6FF] text-[#04145C] border border-[#00D2FF] font-black text-lg flex items-center justify-center shrink-0 shadow-sm">2</div>
            <div className="flex flex-col gap-1 mt-1">
              <h3 className="text-lg font-bold text-[#222]">Log in to your account</h3>
              <p className="text-[#6B7271] text-sm">Open the extension and log in using your Mawsool credentials.</p>
            </div>
          </div>

          <div className="flex items-start gap-5 p-4 rounded-2xl bg-white border border-[#E5E6E6] transition-transform hover:-translate-y-1 duration-300">
            <div className="w-10 h-10 rounded-full bg-[#F3F6FF] text-[#04145C] border border-[#00D2FF] font-black text-lg flex items-center justify-center shrink-0 shadow-sm">3</div>
            <div className="flex flex-col gap-1 mt-1">
              <h3 className="text-lg font-bold text-[#222]">Start finding leads</h3>
              <p className="text-[#6B7271] text-sm">Visit any LinkedIn profile or company website to reveal verified contact data.</p>
            </div>
          </div>

        </div>

        {/* CTA */}
        <Link 
          href="/" 
          className="bg-[#04145C] text-white font-bold text-lg px-8 py-4 rounded-xl hover:bg-[#052074] transition-all shadow-md hover:shadow-xl w-full max-w-sm z-10 flex items-center justify-center gap-2"
        >
          Go to Dashboard
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
        </Link>
      </div>
    </div>
  );
}
