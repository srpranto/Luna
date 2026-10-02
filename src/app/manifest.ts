import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "Luna — Late-Night Anonymous Chat",
    short_name: "Luna",
    description:
      "A quiet late-night sanctuary for honest, encrypted conversations with strangers under the moon.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    background_color: "#09090b",
    theme_color: "#09090b",
    orientation: "any",
    categories: ["social", "entertainment", "communication"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Start Chat",
        short_name: "Chat",
        description: "Find an anonymous stranger to chat with",
        url: "/?action=chat&source=shortcut",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
          },
        ],
      },
      {
        name: "The Void Letters",
        short_name: "The Void",
        description: "Read and release anonymous late-night thoughts",
        url: "/?action=void&source=shortcut",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
          },
        ],
      },
    ],
  };
}
