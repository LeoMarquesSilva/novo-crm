import type { Metadata } from "next";
import { Geist_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** URL pública do CRM: a prévia de link (WhatsApp, e-mail) precisa da imagem com endereço completo. */
function urlBase(): URL {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://localhost:3000";
  return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
}

const TITULO = "CRM Bismarchi | Pires";
const DESCRICAO = "Leads, due diligence, propostas e contratos do escritório em um só lugar.";

// Os links do CRM nos avisos (WhatsApp, e-mail) caem no login para quem não está logado: a prévia
// mostra este título, a descrição e `opengraph-image.png`, não o título da tela de login.
export const metadata: Metadata = {
  metadataBase: urlBase(),
  title: "CRM Jurídico",
  description: DESCRICAO,
  applicationName: TITULO,
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: TITULO,
    title: TITULO,
    description: DESCRICAO,
  },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
