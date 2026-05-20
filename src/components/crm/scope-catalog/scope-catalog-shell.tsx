"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Loader2, Sparkles, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { cn } from "@/lib/utils";
import { NewItemButton, NewItemDialog, type NewItemKind } from "./new-item-dialog";
import { ScopeEditor } from "./scope-editor";
import { ScopeTree, type ScopeTreeSelection } from "./scope-tree";

type Tab = "scope" | "investment";

export function ScopeCatalogShell({ initialData }: { initialData: ProposalCatalogAdminData }) {
  const router = useRouter();
  const [data, setData] = useState<ProposalCatalogAdminData>(initialData);
  const [tab, setTab] = useState<Tab>("scope");
  const [newItem, setNewItem] = useState<NewItemKind | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  function handleCreated(next: ProposalCatalogAdminData) {
    setData(next);
    router.refresh();
  }

  async function seedDefaults() {
    setSeeding(true);
    setSeedError(null);
    try {
      const res = await fetch("/api/admin/proposal-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "seed_defaults" }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ProposalCatalogAdminData;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao popular padrões.");
      }
      setData(json.data);
      router.refresh();
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Erro ao popular catálogo.");
    } finally {
      setSeeding(false);
    }
  }

  const isEmpty =
    data.adminRows.scopeTypes.length === 0 && data.adminRows.investmentTypes.length === 0;

  const [scopeSelection, setScopeSelection] = useState<ScopeTreeSelection | null>(null);
  const [investmentSelection, setInvestmentSelection] = useState<ScopeTreeSelection | null>(null);

  const scopeTree = useMemo(() => buildScopeTree(data), [data]);
  const investmentTree = useMemo(() => buildInvestmentTree(data), [data]);

  const activeTree = tab === "scope" ? scopeTree : investmentTree;
  const activeSelection = tab === "scope" ? scopeSelection : investmentSelection;
  const setActiveSelection = tab === "scope" ? setScopeSelection : setInvestmentSelection;

  const selectedScopeRow = useMemo(() => {
    if (tab !== "scope" || !scopeSelection) return null;
    return data.adminRows.scopeSubtypes.find((s) => s.id === scopeSelection.subtypeId) ?? null;
  }, [tab, scopeSelection, data.adminRows.scopeSubtypes]);

  const selectedInvestmentRow = useMemo(() => {
    if (tab !== "investment" || !investmentSelection) return null;
    return (
      data.adminRows.investmentSubtypes.find((s) => s.id === investmentSelection.subtypeId) ?? null
    );
  }, [tab, investmentSelection, data.adminRows.investmentSubtypes]);

  return (
    <section className="overflow-hidden rounded-[24px] border border-white/55 bg-white/72 shadow-sm shadow-primary-dark/10">
      {/* ── Toolbar: Tabs + ação primária ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary-dark/10 bg-white/70 px-4 py-2.5">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-primary-dark/5 p-1">
          <TabButton
            active={tab === "scope"}
            onClick={() => setTab("scope")}
            icon={BookOpenText}
            label="Escopos"
            count={data.scopeSubtypeCount}
          />
          <TabButton
            active={tab === "investment"}
            onClick={() => setTab("investment")}
            icon={WalletCards}
            label="Investimentos"
            count={data.investmentSubtypeCount}
          />
        </div>

        {/* CTA */}
        <NewItemButton
          label={tab === "scope" ? "Novo tipo de escopo" : "Novo tipo de investimento"}
          onClick={() =>
            setNewItem({ type: tab === "scope" ? "scope_type" : "investment_type" })
          }
        />
      </div>

      {/* ── Banner: catálogo vazio ── */}
      {isEmpty ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/40 px-5 py-3.5">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-900">Catálogo vazio</p>
              <p className="text-xs text-amber-800/80">
                Importe os modelos padrão para começar — pode editar ou desativar qualquer item depois.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {seedError ? (
              <span className="text-xs text-rose-700">{seedError}</span>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="teal"
              className="h-9 gap-1.5"
              disabled={seeding}
              onClick={() => void seedDefaults()}
            >
              {seeding ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-3.5" aria-hidden />
              )}
              Importar padrões
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Master-detail ── */}
      <div className="grid min-h-[640px] gap-0 lg:grid-cols-[20rem_1fr]">
        {/* Sidebar — árvore */}
        <aside className="border-b border-primary-dark/10 bg-white/30 lg:border-b-0 lg:border-r">
          <ScopeTree
            groups={activeTree}
            selection={activeSelection}
            onSelect={setActiveSelection}
            onCreateSubtype={(typeId, parentLabel) =>
              setNewItem(
                tab === "scope"
                  ? { type: "scope_subtype", scopeTypeId: typeId, parentLabel }
                  : { type: "investment_subtype", investmentTypeId: typeId, parentLabel },
              )
            }
            emptyHint={
              tab === "scope"
                ? "Nenhum tipo de escopo cadastrado."
                : "Nenhum tipo de investimento cadastrado."
            }
          />
        </aside>

        {/* Editor / empty state */}
        <main className="bg-white/40 p-5 sm:p-6">
          {tab === "scope" && selectedScopeRow && scopeSelection ? (
            <ScopeEditor
              key={selectedScopeRow.id}
              mode={{
                kind: "scope",
                row: selectedScopeRow,
                breadcrumb: scopeSelection.breadcrumb,
              }}
              onSaved={setData}
            />
          ) : tab === "investment" && selectedInvestmentRow && investmentSelection ? (
            <ScopeEditor
              key={selectedInvestmentRow.id}
              mode={{
                kind: "investment",
                row: selectedInvestmentRow,
                breadcrumb: investmentSelection.breadcrumb,
              }}
              onSaved={setData}
            />
          ) : (
            <EmptyState tab={tab} />
          )}
        </main>
      </div>

      {/* Dialog de criação */}
      {newItem ? (
        <NewItemDialog
          open
          onOpenChange={(v) => {
            if (!v) setNewItem(null);
          }}
          kind={newItem}
          onCreated={handleCreated}
        />
      ) : null}
    </section>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-bold transition-all",
        active
          ? "bg-primary-dark text-white shadow-sm"
          : "text-primary-dark/60 hover:bg-primary-dark/8 hover:text-primary-dark",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
      <span
        className={cn(
          "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-black tabular-nums",
          active ? "bg-white/20 text-white" : "bg-primary-dark/10 text-primary-dark",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary-dark/15 bg-white/40 p-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-dark/8 text-primary-dark">
        {tab === "scope" ? (
          <BookOpenText className="size-6" aria-hidden />
        ) : (
          <WalletCards className="size-6" aria-hidden />
        )}
      </div>
      <div className="max-w-xs">
        <h3 className="text-base font-bold text-primary-dark">
          Selecione um {tab === "scope" ? "escopo" : "investimento"}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Clique em qualquer item da árvore à esquerda para editar o texto, placeholders e
          visualizar o preview ao vivo.
        </p>
      </div>
    </div>
  );
}

// ─── Tree builders ────────────────────────────────────────────────────────────

function buildScopeTree(data: ProposalCatalogAdminData): ScopeTreeGroup[] {
  const typeById = new Map(data.adminRows.scopeTypes.map((t) => [t.id, t]));
  const groups = new Map<string, ScopeTreeGroup>();
  for (const t of data.adminRows.scopeTypes) {
    if (!groups.has(t.areaKey)) {
      groups.set(t.areaKey, { key: t.areaKey, label: t.areaKey, items: [] });
    }
    const g = groups.get(t.areaKey)!;
    g.items.push({
      key: t.id,
      label: t.label,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      subtypes: [],
    });
  }
  for (const s of data.adminRows.scopeSubtypes) {
    const parentType = typeById.get(s.scopeTypeId);
    if (!parentType) continue;
    const g = groups.get(parentType.areaKey);
    if (!g) continue;
    const item = g.items.find((i) => i.key === parentType.id);
    if (!item) continue;
    item.subtypes.push({
      key: s.id,
      label: s.label,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      parentBreadcrumb: [g.label, item.label],
    });
  }
  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    .map((g) => ({
      ...g,
      items: g.items
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"))
        .map((i) => ({
          ...i,
          subtypes: i.subtypes.sort(
            (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"),
          ),
        })),
    }));
}

function buildInvestmentTree(data: ProposalCatalogAdminData): ScopeTreeGroup[] {
  const items = data.adminRows.investmentTypes.map((t) => ({
    key: t.id,
    label: t.label,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    subtypes: data.adminRows.investmentSubtypes
      .filter((s) => s.investmentTypeId === t.id)
      .map((s) => ({
        key: s.id,
        label: s.label,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        parentBreadcrumb: [t.label],
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR")),
  }));
  return [
    {
      key: "__all__",
      label: "Tipos",
      items: items.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"),
      ),
    },
  ];
}

// ─── Tree types ───────────────────────────────────────────────────────────────

export type ScopeTreeGroup = {
  key: string;
  label: string;
  items: ScopeTreeItem[];
};

export type ScopeTreeItem = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  subtypes: ScopeTreeSubtype[];
};

export type ScopeTreeSubtype = {
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  parentBreadcrumb: string[];
};
