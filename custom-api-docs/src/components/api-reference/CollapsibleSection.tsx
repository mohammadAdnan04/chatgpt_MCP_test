"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CollapsibleSectionProps {
  id: string;
  method: string;
  title: string;
  description: string;
  badgeClass?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ 
  id, 
  method, 
  title, 
  description, 
  badgeClass = "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20",
  children,
  defaultOpen = false
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div id={id} className="scroll-mt-20 mb-12">
      <div 
        className={`border-b pb-6 cursor-pointer hover:bg-muted/30 transition-colors rounded-lg p-2 -ml-2 ${isOpen ? 'mb-8' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-2">
            <Badge className={`${badgeClass} uppercase tracking-wider text-sm rounded-md px-3 py-1`}>
              {method}
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="text-muted-foreground p-2">
            {isOpen ? <ChevronDown className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
          </div>
        </div>
        <p className="text-lg text-muted-foreground">
          {description}
        </p>
      </div>
      
      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
