import "@/index.css";
import type { ReactNode } from "react";
import { useLayout } from "skybridge/web";

export default function Shell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { theme } = useLayout();
  return (
    <div className={`${theme === "dark" ? "dark" : ""} w-full bg-background text-foreground`}>
      <div className="mx-auto max-w-3xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Mawsool · ChatGPT MCP</p>
        <h1 className="mt-1 text-lg font-semibold">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
