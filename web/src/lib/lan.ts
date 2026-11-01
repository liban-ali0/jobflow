import "server-only";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { ACCESS_COOKIE, keyMatches } from "./access";

// "Home network" (Settings → Other devices): a doorway on this computer's
// Wi-Fi/LAN address, on the app's port, for a phone on the same network.
//
// The app itself listens on 127.0.0.1 only, and its access gate (proxy.ts)
// lets in requests addressed to localhost. So the doorway does not rely on
// the gate alone:
// - it answers only devices on the same subnet as the address it opened on,
//   read from the connection itself, which a device cannot fake;
// - it asks for the pairing cookie itself, on every request and every
//   live-update connection; only the pairing link (/pair) passes without it,
//   and the gate checks that link's key;
// - it always names itself by its LAN address (never localhost), whatever
//   Host the request claims, and drops forwarding headers, so the gate
//   never takes a request for one from this computer.
// The connection is plain http: fine on a home Wi-Fi, which is why it is
// off by default and Windows is asked to allow it on private networks only.

type Holder = { jobflowLan?: { servers: http.Server[]; addresses: string[] } };
const holder = globalThis as unknown as Holder;

const PRIVATE_V4 = new net.BlockList();
for (const [network, prefix] of [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const) {
  PRIVATE_V4.addSubnet(network, prefix, "ipv4");
}
const plain = (address: string | undefined) => (address ?? "").replace(/^::ffff:/, "");
const isPrivate = (address: string | undefined) => net.isIPv4(plain(address)) && PRIVATE_V4.check(plain(address), "ipv4");

// Adapters a phone cannot reach: Windows' own virtual networks (WSL,
// Hyper-V), virtual machines and containers.
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|br-|veth|Default Switch/i;

// This computer's home-network addresses (Wi-Fi or cable; not Tailscale's
// 100.x, not the loopback, not virtual adapters), with their subnets.
function lanInterfaces() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([, items]) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal && isPrivate(item.address) && item.cidr)
    .map((item) => ({ address: item.address, cidr: item.cidr! }));
}

export const lanAddresses = () => lanInterfaces().map((item) => item.address);

const DROPPED = ["host", "x-forwarded-host", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-port", "x-real-ip", "forwarded"];

function headersFor(req: http.IncomingMessage, port: number) {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) if (!DROPPED.includes(name)) headers[name] = value;
  headers.host = `${plain(req.socket.localAddress)}:${port}`;
  return headers;
}

function cookieOf(req: http.IncomingMessage) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== ACCESS_COOKIE) continue;
    // A malformed value (a stray "%") must not throw: that would take the
    // whole app down for anyone on the Wi-Fi.
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

// Whether this request may go in: from this subnet, and paired (or pairing).
function allowed(req: http.IncomingMessage, subnet: net.BlockList) {
  const remote = plain(req.socket.remoteAddress);
  if (!net.isIPv4(remote) || !subnet.check(remote, "ipv4")) return "network";
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/pair" || keyMatches(cookieOf(req))) return null;
  return "pairing";
}

const PRIVATE_PAGE =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offerbound is private</title>' +
  '<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 20px;color:#12203a;background:#eef1f5">' +
  '<h1 style="font-size:22px">Offerbound is private</h1><p>To open it on this device, scan the code in Settings → Other devices on your computer.</p></body>';

function gateway(port: number, cidr: string) {
  const subnet = new net.BlockList();
  const [network, prefix] = cidr.split("/");
  subnet.addSubnet(network, Number(prefix), "ipv4");

  // Nothing a device sends may throw out of here: an error escaping a
  // handler, or an unhandled stream error, would stop the whole app.
  const server = http.createServer((req, res) => {
    req.on("error", () => res.destroy());
    res.on("error", () => req.destroy());
    try {
      const refused = allowed(req, subnet);
      if (refused === "network") {
        res.writeHead(403, { "Content-Type": "text/plain" }).end("Offerbound answers devices on this computer's home network only.");
        return;
      }
      if (refused) {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }).end(PRIVATE_PAGE);
        return;
      }
      const upstream = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: headersFor(req, port) }, (reply) => {
        reply.on("error", () => res.destroy());
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      });
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("Offerbound is not answering. Is it running?");
      });
      req.pipe(upstream);
    } catch {
      if (!res.headersSent) res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Bad request.");
    }
  });
  server.on("clientError", (_error, socket) => socket.destroy());
  // Live updates (the development server's reload channel), same checks.
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    let refused: string | null = "pairing";
    try {
      refused = allowed(req, subnet);
    } catch {
      // Read as refused.
    }
    if (refused) return socket.destroy();
    const upstream = net.connect(port, "127.0.0.1", () => {
      const headers = headersFor(req, port);
      const lines = Object.entries(headers).flatMap(([name, value]) => (Array.isArray(value) ? value : [value]).map((one) => `${name}: ${one}`));
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return server;
}

// Opens or closes the doorway to match the setting. Called every minute by
// the schedule clock and right after Settings are saved.
export function ensureLan(enabled: boolean) {
  const port = Number(process.env.PORT ?? "3000");
  const interfaces = enabled ? lanInterfaces() : [];
  const addresses = interfaces.map((item) => item.cidr);
  const current = holder.jobflowLan;
  if (current && current.addresses.join() === addresses.join()) return;
  for (const server of current?.servers ?? []) server.close();
  holder.jobflowLan = { servers: [], addresses };
  for (const { address, cidr } of interfaces) {
    const server = gateway(port, cidr);
    // A busy address (another app) is left alone; the others still open.
    server.on("error", () => server.close());
    server.listen(port, address);
    holder.jobflowLan.servers.push(server);
  }
}

export const lanOpen = () => (holder.jobflowLan?.addresses.length ?? 0) > 0;
