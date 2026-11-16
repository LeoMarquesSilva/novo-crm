import type { MetadataRoute } from "next";

/**
 * Manifesto do app (16/11/2026): permite instalar o CRM (Chrome/Edge "Instalar app",
 * iPhone "Adicionar à Tela de Início"). No iPhone o push só funciona com o CRM instalado.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Bismarchi | Pires",
    short_name: "CRM BP",
    description: "CRM jurídico do Bismarchi | Pires Sociedade de Advogados.",
    id: "/crm",
    start_url: "/crm",
    scope: "/",
    display: "standalone",
    background_color: "#F8F9FB",
    theme_color: "#16263B",
    lang: "pt-BR",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
