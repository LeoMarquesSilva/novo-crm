import Image from "next/image";
import { EB_Garamond } from "next/font/google";
import { ShieldCheck } from "lucide-react";

// Serifa da marca (mesma família das propostas), só no título do painel institucional.
const brandSerif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/**
 * Moldura das telas de acesso (login, esqueci/redefinir/trocar senha, confirmar).
 * Desktop: painel institucional navy com a fachada do escritório + formulário em cartão branco.
 * Mobile: só o cartão, com o logo colorido acima (§29.1).
 */
export function AuthPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-dvh w-full bg-background lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-navy text-white lg:flex lg:flex-col">
        <Image
          src="/brand/fachada-escritorio.webp"
          alt=""
          fill
          preload
          sizes="(min-width: 1024px) 53vw, 0px"
          // Ampliada a partir da esquerda para a fênix da fachada ficar à direita, longe do texto.
          className="origin-[0%_42%] scale-[1.3] object-cover object-[50%_32%] opacity-90 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,30,46,0.9)_0%,rgba(13,30,46,0.6)_42%,rgba(13,30,46,0.05)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(13,30,46,0.45)_0%,rgba(13,30,46,0)_25%,rgba(13,30,46,0)_70%,rgba(13,30,46,0.7)_100%)]"
        />

        <div className="relative flex flex-1 flex-col p-12 xl:p-16">
          <Image
            src="/brand/logo-bismarchi-pires-claro.png"
            alt="Bismarchi | Pires Sociedade de Advogados"
            width={640}
            height={151}
            preload
            className="h-auto w-60 xl:w-[300px]"
          />

          <div className="my-auto max-w-xl py-12">
            <p className="text-v2-caption-medium uppercase tracking-[0.3em] text-brand-gold">
              CRM do escritório
            </p>
            <span aria-hidden className="mt-5 block h-px w-12 bg-brand-gold" />
            <h2
              className={`${brandSerif.className} mt-7 text-[44px] leading-[1.12] font-normal tracking-[-0.01em] text-white xl:text-[54px]`}
            >
              Gestão comercial com o padrão Bismarchi{" "}
              <span className="text-brand-gold">|</span> Pires<span className="text-brand-gold">.</span>
            </h2>
            <p className="mt-6 max-w-md text-v2-body-md text-white/75">
              Leads, propostas, contratos e relacionamento em um só lugar, com a excelência do nosso escritório.
            </p>
          </div>

          <p className="flex items-center gap-4 text-v2-caption text-white/65">
            <span aria-hidden className="h-px w-6 bg-brand-gold" />
            Campinas · SP &nbsp;·&nbsp; bismarchipires.com.br
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col items-center px-4 py-8 sm:px-8">
        <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <Image
            src="/brand/logo-bismarchi-pires.png"
            alt="Bismarchi | Pires Sociedade de Advogados"
            width={640}
            height={154}
            preload
            className="mx-auto mb-8 h-auto w-52 lg:hidden"
          />
          <section className="rounded-(--radius-v2-2xl) border border-neutral-200/80 bg-white px-6 py-8 shadow-(--shadow-v2-md) sm:px-12 sm:py-12">
            <div className="mb-8">
              <h1 className="text-[28px] leading-[1.15] font-bold tracking-[-0.025em] text-foreground sm:text-[32px]">
                {title}
              </h1>
              <div className="mt-2 text-v2-body-md text-muted-foreground">{description}</div>
            </div>
            {children}
            <p className="mt-8 flex items-center justify-center gap-2 text-v2-caption text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-brand-gold-text" aria-hidden />
              Acesso restrito a colaboradores autorizados.
            </p>
          </section>
        </div>

        <footer className="mt-8 text-center text-v2-caption text-muted-foreground">
          © {year} Bismarchi | Pires Sociedade de Advogados
        </footer>
      </main>
    </div>
  );
}
