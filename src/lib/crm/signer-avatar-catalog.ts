/** Avatares conhecidos por e-mail (firma + equipe). Ver `solicitantes-gestores-avatars.md`. */
const AVATAR_BY_EMAIL: Record<string, string> = {
  "gustavo@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/socios/gustavo-site.png",
  "gustavo@bismarchipires.com.br": "https://www.bismarchipires.com.br/img/team/socios/gustavo-site.png",
  "ricardo@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/ricardo-pires.jpg",
  "ricardo@bismarchipires.com.br": "https://www.bismarchipires.com.br/img/team/ricardo-pires.jpg",
  "gabriela.consul@bpplaw.com.br":
    "https://www.bismarchipires.com.br/img/team/civel/gabriela-consul.jpg",
  "gabriela.consul@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/civel/gabriela-consul.jpg",
  "giancarlo@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/civel/giancarlo.jpg",
  "giancarlo@bismarchipires.com.br": "https://www.bismarchipires.com.br/img/team/civel/giancarlo.jpg",
  "daniel@bpplaw.com.br":
    "https://www.bismarchipires.com.br/img/team/trabalhista/daniel-pressato-fernandes.jpg",
  "daniel@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/trabalhista/daniel-pressato-fernandes.jpg",
  "renato@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/trabalhista/renato-rossetti.jpg",
  "renato@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/trabalhista/renato-rossetti.jpg",
  "michel.malaquias@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/distressed-deals/michel.jpg",
  "michel.malaquias@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/distressed-deals/michel.jpg",
  "emanueli.lourenco@bpplaw.com.br":
    "https://www.bismarchipires.com.br/img/team/distressed-deals/emanueli-lourenco.png",
  "emanueli.lourenco@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/distressed-deals/emanueli-lourenco.png",
  "ariany.bispo@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/distressed-deals/ariany-bispo.png",
  "ariany.bispo@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/distressed-deals/ariany-bispo.png",
  "jorge@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/jorge-pecht-souza.jpg",
  "jorge@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/reestruturacao/jorge-pecht-souza.jpg",
  "leonardo@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/leo-loureiro.png",
  "leonardo@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/reestruturacao/leo-loureiro.png",
  "ligia@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/ligia-gilberti-lopes.jpg",
  "ligia@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/reestruturacao/ligia-gilberti-lopes.jpg",
  "wagner.armani@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/wagner.jpg",
  "wagner.armani@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/reestruturacao/wagner.jpg",
  "jansonn@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/jansonn.jpg",
  "jansonn@bismarchipires.com.br": "https://www.bismarchipires.com.br/img/team/reestruturacao/jansonn.jpg",
  "henrique.nascimento@bpplaw.com.br":
    "https://www.bismarchipires.com.br/blog/wp-content/uploads/2026/02/Henrique-Franco-Nascimento.jpeg",
  "henrique.nascimento@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/blog/wp-content/uploads/2026/02/Henrique-Franco-Nascimento.jpeg",
  "felipe@bpplaw.com.br": "https://www.bismarchipires.com.br/img/team/legal-ops/felipe-carmargo.jpg",
  "felipe@bismarchipires.com.br": "https://www.bismarchipires.com.br/img/team/legal-ops/felipe-carmargo.jpg",
  "lavinia.ferraz@bpplaw.com.br":
    "https://www.bismarchipires.com.br/img/team/legal-ops/lavinia-ferraz-crispim.jpg",
  "lavinia.ferraz@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/img/team/legal-ops/lavinia-ferraz-crispim.jpg",
  "francisco.zanin@bpplaw.com.br":
    "https://www.bismarchipires.com.br/blog/wp-content/uploads/2026/01/Captura-de-tela-2026-01-27-180946.png",
  "francisco.zanin@bismarchipires.com.br":
    "https://www.bismarchipires.com.br/blog/wp-content/uploads/2026/01/Captura-de-tela-2026-01-27-180946.png",
};

export type SignerAppUserLookup = Record<
  string,
  { avatarUrl: string | null; fullName: string }
>;

export function resolveSignerAvatarUrl(
  email: string | null | undefined,
  appUsersByEmail?: SignerAppUserLookup,
): string | null {
  if (!email?.trim()) return null;
  const key = email.trim().toLowerCase();
  const fromApp = appUsersByEmail?.[key]?.avatarUrl?.trim();
  if (fromApp) return fromApp;
  return AVATAR_BY_EMAIL[key] ?? null;
}

export function signerInitials(name: string | null | undefined, email: string | null | undefined): string {
  const fromName = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (fromName.length >= 2) {
    return `${fromName[0]![0]}${fromName[fromName.length - 1]![0]}`.toUpperCase();
  }
  if (fromName.length === 1) return fromName[0]!.slice(0, 2).toUpperCase();
  const local = (email ?? "").split("@")[0]?.slice(0, 2);
  return local ? local.toUpperCase() : "?";
}
