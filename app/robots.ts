import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/history"],
      },
    ],
    sitemap: "https://gitrelay.xyz/sitemap.xml",
  };
}
