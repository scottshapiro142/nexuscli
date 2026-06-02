/**
 * Local-loopback HTTP server that captures the OAuth redirect from Google.
 * Binds 127.0.0.1 on an ephemeral port — Desktop-type OAuth clients accept any.
 */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface LoopbackResult {
  code: string;
  state: string;
}

export interface LoopbackHandle {
  port: number;
  waitForCode(): Promise<LoopbackResult>;
  close(): void;
}

export interface LoopbackOptions {
  expectedState: string;
  timeoutMs?: number;
}

export async function startLoopback(opts: LoopbackOptions): Promise<LoopbackHandle> {
  return new Promise((resolve, reject) => {
    let resolveCode: (r: LoopbackResult) => void = () => {};
    let rejectCode: (e: Error) => void = () => {};
    const codePromise = new Promise<LoopbackResult>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") {
        res.statusCode = 404;
        res.end();
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(failureHtml(error));
        rejectCode(new Error(`Google returned: ${error}`));
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(failureHtml("missing_code"));
        rejectCode(new Error("Missing code or state in redirect."));
        return;
      }
      if (state !== opts.expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(failureHtml("state_mismatch"));
        rejectCode(new Error("OAuth state mismatch — refusing."));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(SUCCESS_HTML);
      resolveCode({ code, state });
    });

    const timer = setTimeout(() => {
      rejectCode(
        new Error(
          `Timed out waiting for browser callback (${(opts.timeoutMs ?? 300_000) / 1000}s).`
        )
      );
    }, opts.timeoutMs ?? 300_000);

    server.on("error", (err) => reject(err));

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        waitForCode: async () => {
          try {
            return await codePromise;
          } finally {
            clearTimeout(timer);
            server.close();
          }
        },
        close: () => {
          clearTimeout(timer);
          server.close();
        },
      });
    });
  });
}

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Nexus — signed in</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fafafa}main{text-align:center;max-width:30rem;padding:2rem}h1{font-size:1.5rem;margin:0 0 0.5rem;font-weight:600}p{margin:0;color:#a3a3a3}</style>
</head><body><main>
<h1>Signed in.</h1>
<p>You can close this tab and return to the Nexus CLI.</p>
</main></body></html>`;

function failureHtml(error: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Nexus — sign-in failed</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:36rem;margin:auto;background:#0a0a0a;color:#fafafa">
<h1>Sign-in failed</h1>
<p>Reason: <code>${escapeHtml(error)}</code></p>
<p>Close this tab and try <code>nexus auth login google</code> again.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
