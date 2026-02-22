import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kanon Knowledge Base",
    short_name: "Kanon KB",
    description: "Knowledge base from ingest, served with Fumadocs.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6366F1",
  };
}
