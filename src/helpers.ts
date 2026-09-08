import { generateHelpers } from "skybridge/web";

export const { useToolInfo, useCallTool } = generateHelpers<any>();

/** ChatGPT Apps SDK host. Skybridge otherwise uses MCP Apps callServerTool. */
export async function callHostTool(name: string, args: Record<string, unknown>) {
  const openai = (globalThis as { openai?: { callTool?: Function } }).openai;
  if (typeof openai?.callTool === "function") {
    return openai.callTool(name, args);
  }
  throw new Error("ChatGPT widget host has no callTool");
}
