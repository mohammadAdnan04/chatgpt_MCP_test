import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

import Image from "next/image";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 hidden md:flex">
          <a href="https://mawsool.tech" className="mr-6 flex items-center">
            <Image 
              src="/icon128.png" 
              alt="Mawsool Logo" 
              width={75} 
              height={75} 
              className="object-contain"
              priority
            />
            <span className="font-bold text-xl tracking-tight hidden sm:inline-block -ml-2 mt-1.5 pt-[7px] pb-[7px]">
              Mawsool
            </span>
          </a>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <nav className="flex items-center">
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>
  );
}
