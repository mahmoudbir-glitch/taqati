import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "طاقتي | Taqati",
    short_name: "طاقتي",
    description: "منصة ذكية لمراقبة وإدارة أنظمة الطاقة الشمسية",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    display: "standalone",
    background_color: "#dbeafe",
    theme_color: "#15a05a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
