import type { MetadataRoute } from "next";

/** Lets people install the dashboard as an app, with its icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dev Dashboard", short_name: "Dev Dashboard", description: "Sprint, time, estimation and analytics for the dev team.",
    start_url: "/", display: "standalone", background_color: "#fafafc", theme_color: "#4f46e5",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
