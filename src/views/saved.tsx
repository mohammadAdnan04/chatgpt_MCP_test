import Shell from "./components/shell.js";
import { useToolInfo } from "../helpers.js";

export default function Saved() {
  const { output, input } = useToolInfo();
  const count = Array.isArray(input?.profiles) ? input.profiles.length : 0;
  return (
    <Shell
      title="Saved to list"
      subtitle={String(input?.list_name || input?.list_id || "Mawsool list")}
    >
      <p className="text-sm text-muted-foreground">{count} profile(s) sent.</p>
      {output?.error ? (
        <p className="mt-2 text-sm text-destructive">{String(output.error)}</p>
      ) : (
        <pre className="mt-3 overflow-auto rounded border border-border bg-muted/40 p-3 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </Shell>
  );
}
