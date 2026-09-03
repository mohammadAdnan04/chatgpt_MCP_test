import Shell from "./components/shell.js";
import { useToolInfo } from "../helpers.js";

export default function Profile() {
  const { output, input } = useToolInfo();
  return (
    <Shell title="Profile organization" subtitle={String(input?.url || "")}>
      {output?.error ? (
        <p className="text-sm text-destructive">{String(output.error)}</p>
      ) : (
        <pre className="overflow-auto rounded border border-border bg-muted/40 p-3 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </Shell>
  );
}
