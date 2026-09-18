import { GrupoIntakePublicGrid } from "@/components/crm/grupo-intake-public-grid";
import { loadGrupoIntakeGrid } from "@/lib/crm/grupo-intake-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preenchimento da carteira",
  description: "Grade pública para gestores preencherem origem e áreas dos grupos econômicos.",
};

export default async function PreencherCarteiraPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let result: Awaited<ReturnType<typeof loadGrupoIntakeGrid>>;
  try {
    result = await loadGrupoIntakeGrid(token);
  } catch {
    result = { ok: false, status: 404, error: "Não foi possível abrir este link agora." };
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 py-8 md:px-6">
      <div className="mx-auto w-full max-w-[1400px]">
        <p className="mb-3 text-v2-caption-medium uppercase tracking-[0.18em] text-muted-foreground">
          CRM Jurídico
        </p>
        <h1 className="text-v2-heading-xl text-foreground">Preenchimento da carteira</h1>
        {result.ok ? (
          <>
            <p className="mt-2 max-w-3xl text-v2-body-md text-muted-foreground">
              Escolha o grupo na lista e preencha origem/indicação e áreas na própria grade. Não é
              preciso login. O link único permanece válido até expirar.
            </p>
            <div className="mt-6">
              <GrupoIntakePublicGrid token={token} initial={result.data} />
            </div>
          </>
        ) : (
          <p
            className="mt-6 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-v2-body-sm text-warning-text"
            role="status"
          >
            {result.error}
          </p>
        )}
      </div>
    </div>
  );
}
