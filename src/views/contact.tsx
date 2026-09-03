import Shell from "./components/shell.js";
import { useToolInfo } from "../helpers.js";

export default function Contact() {
  const { output, input } = useToolInfo();
  return (
    <Shell title="Revealed contact" subtitle={String(input?.url || "")}>
      {output?.error ? (
        <p className="text-sm text-destructive">{String(output.error)}</p>
      ) : (
        <dl className="grid gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Fields</dt>
            <dd>{String(input?.fields || "")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Credits remaining</dt>
            <dd>
              {typeof output?.creditsRemaining === "number"
                ? output.creditsRemaining.toLocaleString()
                : "—"}
            </dd>
          </div>
          <pre className="mt-2 overflow-auto rounded border border-border bg-muted/40 p-3 text-xs">
            {JSON.stringify(output, null, 2)}
          </pre>
        </dl>
      )}
    </Shell>
  );
}
