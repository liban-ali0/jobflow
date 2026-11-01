import type { MetadataRoute } from "next";

// Lets the browser install Offerbound as an app (Chrome or Edge: the install
// button in the address bar, or Settings → This computer): its own window, a
// taskbar icon and a Start menu entry. The app still runs on this computer.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Offerbound",
    short_name: "Offerbound",
    description: "Find, rank, research, and track job applications",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef1f5",
    theme_color: "#12203a",
    icons: [
      { src: "/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jobs", url: "/jobs" },
      { name: "Board", url: "/board" },
      { name: "Settings", url: "/settings" },
    ],
  };
}
