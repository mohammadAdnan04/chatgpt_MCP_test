import { Badge } from "@alpic-ai/ui/components/badge";
import Doc from "@/views/components/doc.js";
import DocLink from "@/views/components/doc-link.js";

export default function ToolCall() {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <p>
          This app exposes server tools for Mawsool account checks, B2B search,
          and LinkedIn enrichment workflows.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">check-credits</Badge>
          <Badge variant="secondary">search</Badge>
          <Badge variant="secondary">contact-only</Badge>
          <Badge variant="secondary">full-info-without-contact</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          The current view is still the starter onboarding UI, but the backend
          tools are already wired to your Mawsool APIs.
        </p>
      </div>
      <Doc>
        Replace this starter screen with a custom app UI when you're ready. See{" "}
        <DocLink href="https://docs.skybridge.tech/api-reference/register-tool">
          registerTool
        </DocLink>{" "}
        and the Skybridge view docs for the next step.
      </Doc>
    </>
  );
}
