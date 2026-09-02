"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

export interface SidebarNavProps {
  items: {
    title: string;
    items: {
      title: string;
      href: string;
      disabled?: boolean;
    }[];
  }[];
}

export function Sidebar({ items }: SidebarNavProps) {
  const [activeHref, setActiveHref] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find all intersecting entries
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // You might want to pick the top-most one or just the first one
          setActiveHref(`#${visibleEntries[0].target.id}`);
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px", // adjust this to control when an element is considered active
        threshold: 0,
      }
    );

    // Observe all elements that have an ID corresponding to a sidebar href
    items.forEach((section) => {
      section.items.forEach((item) => {
        if (item.href.startsWith("#")) {
          const elementId = item.href.substring(1);
          const element = document.getElementById(elementId);
          if (element) {
            observer.observe(element);
          }
        }
      });
    });

    return () => observer.disconnect();
  }, [items]);

  return (
    <div className="w-full">
      {items.map((item, index) => (
        <div key={index} className="pb-4">
          <h4 className="mb-1 rounded-md px-2 py-1 text-sm font-semibold">
            {item.title}
          </h4>
          {item.items?.length ? (
            <div className="grid grid-flow-row auto-rows-max text-sm">
              {item.items.map((subItem, index) => {
                const isActive = activeHref === subItem.href;
                return (
                  <Link
                    key={index}
                    href={subItem.disabled ? "#" : subItem.href}
                    className={cn(
                      "group flex w-full items-center rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-primary/5 hover:text-primary",
                      isActive
                        ? "font-medium text-foreground bg-muted"
                        : subItem.disabled
                        ? "cursor-not-allowed opacity-60 text-muted-foreground"
                        : "text-muted-foreground"
                    )}
                    target={subItem.disabled ? "_blank" : undefined}
                    rel={subItem.disabled ? "noreferrer" : undefined}
                  >
                    {subItem.title}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}

      <div className="mt-8 px-2 pb-8">
        <a
          href="https://portal.mawsool.tech/"
          target="_blank"
          rel="noreferrer"
          onMouseEnter={() => window.dispatchEvent(new CustomEvent('robotMessage', { detail: 'A proprietary system that continuously monitors and detects job changes and company transitions at large scale with extremely low monitoring cost.' }))}
          onMouseLeave={() => window.dispatchEvent(new CustomEvent('robotMessage', { detail: null }))}
          className="group flex w-full items-center justify-center gap-2 rounded-lg border border-blue-800/60 bg-gradient-to-r from-[#04145C] to-[#0a2394] px-4 py-3 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-blue-400/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] active:translate-y-0 active:scale-95"
        >
          <Activity className="h-4 w-4 text-blue-300 transition-colors group-hover:text-blue-200" />
          <h3 className="font-semibold text-sm tracking-tight text-white transition-colors">
            Job Intelligence Signals
          </h3>
        </a>
      </div>
    </div>
  );
}
