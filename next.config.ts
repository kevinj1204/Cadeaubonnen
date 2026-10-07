import type { NextConfig } from "next";

// Domeinen die de bestelpagina in een iframe mogen tonen (bijv. je WordPress-site).
const frameAncestors =
  process.env.ALLOWED_FRAME_ANCESTORS ||
  "'self' https://thelightportraits.nl https://*.thelightportraits.nl";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["pg", "pdf-lib", "@pdf-lib/fontkit", "nodemailer"],
  // Zorg dat de lettertypes voor de PDF meegaan naar Vercel
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      {
        source: "/:path*",
        headers: [...common, { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` }],
      },
      {
        // Backoffice en API nooit in een iframe en nooit cachen
        source: "/(admin|api)/:path*",
        headers: [
          ...common,
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
