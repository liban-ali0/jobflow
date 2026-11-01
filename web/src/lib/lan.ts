import "server-only";
import http from "node:http";
import net from "node:net";
import os from "node:os";

// "Home network" (Settings → Other devices): a doorway on this computer's
// Wi-Fi/LAN addresses, on the app's port, for a phone on the same network.
//
// The app itself listens on 127.0.0.1 only, and its access gate (proxy.ts)
// lets in requests addressed to localhost. So the doorway:
// - answers only devices with a private (home network) address, read from
//   the connection itself, which a device cannot fake;
// - always names itself by the LAN address it was reached on (never
//   localhost), whatever Host the request claims, so the access gate always
//   asks for the pairing cookie;
// - drops forwarding headers a device could use to claim another name.
// Off by default; turning the setting off closes it.

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

// This computer's addresses on home networks (Wi-Fi or cable; not
// Tailscale's 100.x, not the loopback, not virtual adapters).
export function lanAddresses() {
  return Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([, items]) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address)
    .filter((address) => isPrivate(address));
}

const DROPPED = ["host", "x-forwarded-host", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-port", "x-real-ip", "forwarded"];

function headersFor(req: http.IncomingMessage, port: number) {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(req.headers)) if (!DROPPED.includes(name)) headers[name] = value;
  headers.host = `${plain(req.socket.localAddress)}:${port}`;
  return headers;
}

function gateway(port: number) {
  const server = http.createServer((req, res) => {
    if (!isPrivate(req.socket.remoteAddress)) {
      res.writeHead(403, { "Content-Type": "text/plain" }).end("Offerbound answers devices on your home network only.");
      return;
    }
    const upstream = http.request({ host: "127.0.0.1", port, method: req.method, path: req.url, headers: headersFor(req, port) }, (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("Offerbound is not answering. Is it running?");
    });
    req.pipe(upstream);
  });
  // Live updates (the development server's reload channel).
  server.on("upgrade", (req, socket, head) => {
    if (!isPrivate(req.socket.remoteAddress)) return socket.destroy();
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
  const addresses = enabled ? lanAddresses() : [];
  const current = holder.jobflowLan;
  if (current && current.addresses.join() === addresses.join()) return;
  for (const server of current?.servers ?? []) server.close();
  holder.jobflowLan = { servers: [], addresses };
  for (const address of addresses) {
    const server = gateway(port);
    // A busy address (another app) is left alone; the others still open.
    server.on("error", () => server.close());
    server.listen(port, address);
    holder.jobflowLan.servers.push(server);
  }
}

export const lanOpen = () => (holder.jobflowLan?.addresses.length ?? 0) > 0;
