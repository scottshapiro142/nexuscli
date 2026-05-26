/**
 * Wire a NexusMcpServer to either an HTTP or stdio transport.
 *
 * stdio uses a single server bound to the process's stdin/stdout — only one
 * client ever connects, so the lifetime maps 1:1 with the process.
 *
 * HTTP uses the canonical per-session pattern: each `initialize` request
 * builds a fresh transport + McpServer pair, keyed by the session id the
 * transport mints. Subsequent requests carry `mcp-session-id` and are routed
 * to the matching pair. This is required because (a) McpServer can only be
 * connected to one transport, and (b) its underlying Server rejects a second
 * `initialize` with "Server already initialized" — which clients (Claude
 * Code's /mcp reconnect, for one) surface as HTTP 400.
 */

import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { NexusMcpServer } from "./server";

export interface HttpServeOpts {
  port: number;
  host?: string;
  path?: string;
}

export interface HttpHandle {
  url: string;
  stop(): Promise<void>;
}

export async function serveOverStdio(server: NexusMcpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.mcp.connect(transport);
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: NexusMcpServer;
}

export async function serveOverHttp(
  factory: () => NexusMcpServer,
  opts: HttpServeOpts
): Promise<HttpHandle> {
  const path = opts.path ?? "/mcp";
  const host = opts.host ?? "127.0.0.1";

  const sessions = new Map<string, Session>();

  const httpServer = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === path) {
      try {
        const rawSid = req.headers["mcp-session-id"];
        const sid = typeof rawSid === "string" ? rawSid : undefined;

        // Body must be read here (not inside the SDK) so we can inspect the
        // method before dispatching, and so the SDK gets the parsed body via
        // its third arg rather than trying to re-read a consumed stream.
        const body = await readJsonBody(req);

        let transport: StreamableHTTPServerTransport;
        const existing = sid ? sessions.get(sid) : undefined;

        if (existing) {
          transport = existing.transport;
        } else if (!sid && isInitializeRequest(body)) {
          const server = factory();
          const newTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSid) => {
              sessions.set(newSid, { transport: newTransport, server });
            },
          });
          newTransport.onclose = () => {
            if (newTransport.sessionId) {
              sessions.delete(newTransport.sessionId);
            }
            try {
              server.dispose();
            } catch {
              // best-effort
            }
          };
          await server.mcp.connect(newTransport);
          transport = newTransport;
        } else {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message:
                  "Bad Request: missing or unknown session id, and request is not initialize",
              },
              id: null,
            })
          );
          return;
        }

        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: `MCP request failed: ${(err as Error).message}`,
              },
              id: null,
            })
          );
        }
      }
      return;
    }

    if (req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          server: "nexus",
          mcpEndpoint: `http://${host}:${opts.port}${path}`,
          activeSessions: sessions.size,
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end("Not Found");
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  return {
    url: `http://${host}:${opts.port}${path}`,
    async stop() {
      for (const { transport, server } of sessions.values()) {
        try {
          await transport.close();
        } catch {
          // ignore
        }
        try {
          server.dispose();
        } catch {
          // ignore
        }
      }
      sessions.clear();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "DELETE") return undefined;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
