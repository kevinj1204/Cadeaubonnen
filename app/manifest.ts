import type { MetadataRoute } from "next";

// App-icoon en naam als iemand de pagina op het beginscherm zet (iPhone/Android)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Light Portraits – Cadeaubonnen",
    short_name: "Cadeaubonnen",
    description: "Bestel een cadeaubon van The Light Portraits.",
    start_url: "/",
    display: "standalone",
    background_color: "#131315",
    theme_color: "#131315",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
