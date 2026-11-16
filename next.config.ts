import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/crm/leads/*/document/*": ["./templates/proposta/*.docx", "./assets/proposta-pdf/**/*"],
    "/api/crm/due/modelos": ["./templates/due/*.pptx"],
  },
  async headers() {
    return [
      {
        // Service worker das notificações push: sempre a versão mais nova, só scripts do próprio site.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/crm/documentos",
        destination: "/crm/due-diligence",
        permanent: true,
      },
      {
        source: "/crm/admin/documentos",
        destination: "/crm/admin/modelo-proposta",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
