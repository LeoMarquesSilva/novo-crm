import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/crm/leads/*/document/*": ["./templates/proposta/*.docx", "./assets/proposta-pdf/**/*"],
    "/api/crm/due/modelos": ["./templates/due/*.pptx"],
    // Gerar o Word do contrato e enviar à D4Sign leem o modelo oficial; sem isto a Vercel não leva o arquivo
    // e o contrato não era gerado em produção ("Template oficial do contrato ausente", 16/11/2026).
    "/api/crm/leads/*/contrato/*": ["./templates/contrato/*.docx"],
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
