import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateAiRequest } from "@/lib/ai-admin";
import { createForumMcpServer } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, message: string, code?: number): Response {
  return new Response(JSON.stringify(code === undefined ? { error: message } : { jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}

function configuredSite(): URL | null {
  try {
    return new URL(process.env.SITE_URL ?? "");
  } catch {
    return null;
  }
}

function mcpAllowedHosts(): Set<string> {
  const hosts = new Set(["localhost", "localhost:3000", "localhost:3100", "localhost:3200", "127.0.0.1", "127.0.0.1:3000", "127.0.0.1:3100", "127.0.0.1:3200"]);
  const site = configuredSite();
  if (!site) return hosts;
  hosts.add(site.host.toLowerCase());
  const alternate = site.hostname.startsWith("www.") ? site.hostname.slice(4) : `www.${site.hostname}`;
  hosts.add(`${alternate}${site.port ? `:${site.port}` : ""}`.toLowerCase());
  return hosts;
}

function mcpAllowedOrigins(): Set<string> {
  const origins = new Set(["http://localhost:3000", "http://localhost:3100", "http://localhost:3200", "http://127.0.0.1:3000", "http://127.0.0.1:3100", "http://127.0.0.1:3200"]);
  const site = configuredSite();
  if (!site) return origins;
  origins.add(site.origin);
  const alternate = site.hostname.startsWith("www.") ? site.hostname.slice(4) : `www.${site.hostname}`;
  origins.add(`${site.protocol}//${alternate}${site.port ? `:${site.port}` : ""}`);
  return origins;
}

function securityError(req: Request): Response | null {
  const host = req.headers.get("host")?.trim().toLowerCase();
  if (!host || !mcpAllowedHosts().has(host)) return errorResponse(403, "MCP 请求来源无效");

  const origin = req.headers.get("origin")?.trim();
  if (origin) {
    try {
      if (!mcpAllowedOrigins().has(new URL(origin).origin)) return errorResponse(403, "MCP 请求来源无效");
    } catch {
      return errorResponse(403, "MCP 请求来源无效");
    }
  }
  return null;
}

function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function POST(req: Request): Promise<Response> {
  const blocked = securityError(req);
  if (blocked) return blocked;

  try {
    const auth = await authenticateAiRequest(req);
    if (!auth.ok) return errorResponse(auth.status, auth.error);

    const server = createForumMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return noStore(await transport.handleRequest(req));
    } finally {
      await server.close().catch(() => {});
    }
  } catch {
    return errorResponse(500, "MCP server error", -32603);
  }
}

export function GET(): Response {
  return errorResponse(405, "Method Not Allowed", -32000);
}

export function DELETE(): Response {
  return errorResponse(405, "Method Not Allowed", -32000);
}
