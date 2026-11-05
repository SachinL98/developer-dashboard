import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy: no third-party scripts; Google Fonts for the typeface; avatars may come from any https host.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`, // Next injects inline bootstrap scripts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" }, // microphone: live meeting capture
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Pages and API responses carry personal data: never cache them in shared caches.
      { source: "/((?!_next/static|_next/image|icon.svg).*)", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  serverExternalPackages: ["@prisma/client", "pdfkit", "pptxgenjs"],
  // pdfkit reads its font files from disk at runtime; make sure they are shipped with the report export functions.
  outputFileTracingIncludes: { "/api/reports/**": ["./node_modules/pdfkit/js/data/**"] },
  // Explicit alias so "@/..." resolves regardless of the TypeScript version's tsconfig handling.
  webpack(config) {
    config.resolve.alias["@"] = path.join(root, "src");
    return config;
  },
};
export default nextConfig;
