import { expect, it } from "vitest";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createForumMcpServer, MCP_TOOL_NAMES } from "@/lib/mcp";

async function request(message: unknown) {
  const server = createForumMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }));
    return response.json() as Promise<{ result?: { tools?: Array<{ name: string }> } }>;
  } finally {
    await server.close();
  }
}

it("MCP exposes the forum context, preview, and apply tools", async () => {
  const body = await request({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  expect(body.result?.tools?.map((tool) => tool.name)).toEqual([...MCP_TOOL_NAMES]);
});
