import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return process.env.ALLOW_INDEXING === "true"
    ? { rules: { userAgent: "*", allow: "/", disallow: "/admin" } }
    : { rules: { userAgent: "*", disallow: "/" } };
}
