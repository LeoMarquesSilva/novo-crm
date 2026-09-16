import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/crm/leads/*/document/*": ["./templates/proposta/*.docx"],
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
