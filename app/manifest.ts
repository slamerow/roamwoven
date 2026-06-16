import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roamwoven",
    short_name: "Roamwoven",
    description: "Turn your trip details into your private travel app.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f2",
    theme_color: "#20211f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
