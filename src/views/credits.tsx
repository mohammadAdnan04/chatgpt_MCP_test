import Shell from "./components/shell.js";
import { useToolInfo } from "../helpers.js";

export default function Credits() {
  const { output } = useToolInfo();
  const credits =
    typeof output?.creditsRemaining === "number" ? output.creditsRemaining : null;

  return (
    <Shell title="Account credits" subtitle="API credit balance from Apicool.">
      {output?.error ? (
        <p className="text-sm text-destructive">{String(output.error)}</p>
      ) : (
        <p className="text-3xl font-semibold tabular-nums">
          {credits === null ? "—" : credits.toLocaleString()}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        Source: {String(output?.creditsSource || output?.source || "mawsool_account")}
      </p>
    </Shell>
  );
}
