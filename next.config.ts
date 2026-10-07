import type { NextConfig } from "next";

// Domeinen die de bestelpagina in een iframe mogen tonen (bijv. je WordPress-site).
const frameAncestors =
  process.env.ALLOWED_FRAME_ANCESTORS ||
  "'self' https://thelightportraits.nl https://*.thelightportraits.nl";

// Waar de backoffice in een iframe mag staan (alleen je eigen hoofdsite)
const adminFrameAncestors =
  process.env.ADMIN_FRAME_ANCESTORS || "'self' https://thelightportraits.nl https://www.thelightportraits.nl";

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
        // Backoffice: alleen in een iframe op je eigen site (thelightportraits.nl), nooit cachen.
        // Inloggen in een iframe werkt alleen als de app op cadeaubon.thelightportraits.nl draait
        // (zelfde site); vanaf een .vercel.app-adres blokkeren browsers de inlog-cookie.
        source: "/admin/:path*",
        headers: [
          ...common,
          { key: "Content-Security-Policy", value: `frame-ancestors ${adminFrameAncestors}` },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // API nooit in een iframe en nooit cachen
        source: "/api/:path*",
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
