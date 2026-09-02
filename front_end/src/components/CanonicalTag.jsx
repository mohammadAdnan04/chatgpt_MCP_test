"use client";

import { usePathname } from "next/navigation";

export default function CanonicalTag() {
  const pathname = usePathname();
  // Construct the absolute URL, removing trailing slashes if necessary
  const url = `https://mawsool.tech${pathname === "/" ? "" : pathname}`;
  
  return <link rel="canonical" href={url} />;
}