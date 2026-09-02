"use client";

import { Suspense } from "react";
import EmailChangedContent from "./EmailChangedContent";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmailChangedContent />
    </Suspense>
  );
}
