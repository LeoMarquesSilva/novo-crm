import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/crm/leads/*/document/*": ["./templates/proposta/*.docx"],
  },
};

export default nextConfig;
