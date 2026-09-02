import Doc from "@/views/components/doc.js";
import DocLink from "@/views/components/doc-link.js";

export default function ToolOutput() {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <h1 className="type-display-xs font-mozilla font-semibold">
          Welcome to Mawsool MCP
        </h1>
        <p>
          This project started from the Skybridge template. The server has been
          customized for Mawsool tools, while the view is still a starter
          onboarding screen.
        </p>
        <p>
          Your production deployment mainly depends on the MCP backend in{" "}
          <code>src/server.ts</code>.
        </p>
      </div>
      <Doc>
        Use{" "}
        <DocLink href="https://docs.skybridge.tech/api-reference/use-tool-info">
          useToolInfo
        </DocLink>{" "}
        when you want a custom view to render live tool input, output, and
        metadata later.
      </Doc>
    </>
  );
}
