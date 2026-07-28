"use client";

import { useMemo, useState } from "react";
import { BookOpenText, Loader2, Sparkles, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { cn } from "@/lib/utils";
import {
  buildInvestmentTree,
  buildScopeTree,
  findCreatedId,
  selectionStillValid,
} from "./scope-catalog-tree";

export type { ScopeTreeGroup, ScopeTreeItem, ScopeTreeSubtype } from "./scope-catalog-tree";
import { CatalogEmptyDetail } from "./catalog-empty-detail";
import { CatalogTypeEditor } from "./catalog-type-editor";
import { NewItemButton, NewItemDialog, type NewItemKind } from "./new-item-dialog";
import { ScopeEditor } from "./scope-editor";
import { ScopeTree, type ScopeTreeSelection } from "./scope-tree";

type Tab = "scope" | "investment";

type CreatedCatalogItem = {
  tab: Tab;
  level: "type" | "subtype";
  id: string;
};

function createdMetaFromKind(kind: NewItemKind, id: string): CreatedCatalogItem {
  switch (kind.type) {
    case "scope_type":
      return { tab: "scope", level: "type", id };
    case "scope_subtype":
      return { tab: "scope", level: "subtype", id };
    case "investment_type":
      return { tab: "investment", level: "type", id };
    case "investment_subtype":
      return { tab: "investment", level: "subtype", id };
  }
}

function selectionForCreatedItem(
  catalog: ProposalCatalogAdminData,
  created: CreatedCatalogItem,
): ScopeTreeSelection | null {
  if (created.level === "type") {
    if (created.tab === "scope") {
      const row = catalog.adminRows.scopeTypes.find((t) => t.id === created.id);
      if (!row) return null;
      return {
        level: "type",
        typeId: row.id,
        typeLabel: row.label,
        breadcrumb: [row.areaKey, row.label],
      };
    }
    const row = catalog.adminRows.investmentTypes.find((t) => t.id === created.id);
    if (!row) return null;
    return {
      level: "type",
      typeId: row.id,
      typeLabel: row.label,
      breadcrumb: [row.label],
    };
  }

  if (created.tab === "scope") {
    const row = catalog.adminRows.scopeSubtypes.find((s) => s.id === created.id);
    if (!row) return null;
    const parentType = catalog.adminRows.scopeTypes.find((t) => t.id === row.scopeTypeId);
    if (!parentType) return null;
    const parentBreadcrumb = [parentType.areaKey, parentType.label];
    return {
      level: "subtype",
      subtypeId: row.id,
      subtypeLabel: row.label,
      breadcrumb: [...parentBreadcrumb, row.label],
    };
  }

  const row = catalog.adminRows.investmentSubtypes.find((s) => s.id === created.id);
  if (!row) return null;
  const parentType = catalog.adminRows.investmentTypes.find((t) => t.id === row.investmentTypeId);
  if (!parentType) return null;
  return {
    level: "subtype",
    subtypeId: row.id,
    subtypeLabel: row.label,
    breadcrumb: [parentType.label, row.label],
  };
}

export function ScopeCatalogShell({ initialData }: { initialData: ProposalCatalogAdminData }) {
  const [data, setData] = useState<ProposalCatalogAdminData>(initialData);
  const [tab, setTab] = useState<Tab>("scope");
  const [newItem, setNewItem] = useState<NewItemKind | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [scopeSelection, setScopeSelection] = useState<ScopeTreeSelection | null>(null);
  const [investmentSelection, setInvestmentSelection] = useState<ScopeTreeSelection | null>(null);
  const [scopeAreaFilter, setScopeAreaFilter] = useState<string[]>([]);
  const [editorDirty, setEditorDirty] = useState(false);

  function applyCatalog(next: ProposalCatalogAdminData) {
    setData(next);
  }

  function confirmDiscardDirtyChanges(): boolean {
    if (!editorDirty) return true;
    return window.confirm("Descartar alterações não salvas?");
  }

  function applySelectionForTab(targetTab: Tab, next: ScopeTreeSelection | null) {
    if (!confirmDiscardDirtyChanges()) return;
    setEditorDirty(false);
    if (targetTab === "scope") {
      setScopeSelection(next);
    } else {
      setInvestmentSelection(next);
    }
  }

  function handleCreated(
    next: ProposalCatalogAdminData,
    created?: CreatedCatalogItem,
    kind?: NewItemKind | null,
  ) {
    const prev = data;
    applyCatalog(next);

    const resolved =
      created ??
      (kind
        ? (() => {
            const id = findCreatedId(prev, next, kind);
            return id ? createdMetaFromKind(kind, id) : null;
          })()
        : null);

    if (!resolved) return;

    const selection = selectionForCreatedItem(next, resolved);
    if (!selection) return;

    applySelectionForTab(resolved.tab, selection);
  }

  function handleCatalogDeleted(next: ProposalCatalogAdminData) {
    applyCatalog(next);
    if (tab === "scope") {
      if (!selectionStillValid(scopeSelection, next, "scope")) {
        setScopeSelection(null);
      }
    } else if (!selectionStillValid(investmentSelection, next, "investment")) {
      setInvestmentSelection(null);
    }
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
      applyCatalog(json.data);
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Erro ao popular catálogo.");
    } finally {
      setSeeding(false);
    }
  }

  const isEmpty =
    data.adminRows.scopeTypes.length === 0 && data.adminRows.investmentTypes.length === 0;

  const scopeTree = useMemo(() => buildScopeTree(data), [data]);
  const investmentTree = useMemo(() => buildInvestmentTree(data), [data]);

  const scopeAreaOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const t of data.adminRows.scopeTypes) keys.add(t.areaKey);
    return [...keys].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data.adminRows.scopeTypes]);

  const activeTree = tab === "scope" ? scopeTree : investmentTree;
  const activeSelection = tab === "scope" ? scopeSelection : investmentSelection;

  function requestSelect(next: ScopeTreeSelection | null) {
    applySelectionForTab(tab, next);
  }

  function requestTabSwitch(next: Tab) {
    if (next === tab) return;
    if (!confirmDiscardDirtyChanges()) return;
    setEditorDirty(false);
    setTab(next);
  }

  function handleEditorSaved(catalog: ProposalCatalogAdminData) {
    applyCatalog(catalog);
    setEditorDirty(false);
  }

  const selectedScopeSubtype = useMemo(() => {
    if (tab !== "scope" || scopeSelection?.level !== "subtype") return null;
    return data.adminRows.scopeSubtypes.find((s) => s.id === scopeSelection.subtypeId) ?? null;
  }, [tab, scopeSelection, data.adminRows.scopeSubtypes]);

  const selectedScopeType = useMemo(() => {
    if (tab !== "scope" || scopeSelection?.level !== "type") return null;
    return data.adminRows.scopeTypes.find((t) => t.id === scopeSelection.typeId) ?? null;
  }, [tab, scopeSelection, data.adminRows.scopeTypes]);

  const selectedInvestmentSubtype = useMemo(() => {
    if (tab !== "investment" || investmentSelection?.level !== "subtype") return null;
    return (
      data.adminRows.investmentSubtypes.find((s) => s.id === investmentSelection.subtypeId) ??
      null
    );
  }, [tab, investmentSelection, data.adminRows.investmentSubtypes]);

  const selectedInvestmentType = useMemo(() => {
    if (tab !== "investment" || investmentSelection?.level !== "type") return null;
    return data.adminRows.investmentTypes.find((t) => t.id === investmentSelection.typeId) ?? null;
  }, [tab, investmentSelection, data.adminRows.investmentTypes]);

  return (
    <section className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white shadow-sm">
      {/* ── Toolbar: Tabs + ação primária ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary-dark/10 bg-white px-4 py-2.5">
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-primary-dark/5 p-1">
          <TabButton
            active={tab === "scope"}
            onClick={() => requestTabSwitch("scope")}
            icon={BookOpenText}
            label="Escopos"
            count={data.scopeSubtypeCount}
          />
          <TabButton
            active={tab === "investment"}
            onClick={() => requestTabSwitch("investment")}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Sparkles className="size-3.5" aria-hidden />
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
      <div className="grid min-h-[640px] min-w-0 gap-0 lg:grid-cols-[minmax(13rem,20rem)_minmax(0,1fr)]">
        {/* Sidebar — árvore */}
        <aside className="flex min-w-0 max-h-[calc(100dvh-12rem)] flex-col border-b border-primary-dark/10 bg-white lg:border-b-0 lg:border-r">
          <ScopeTree
            key={tab}
            groups={activeTree}
            selection={activeSelection}
            onSelect={requestSelect}
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
            areaOptions={tab === "scope" ? scopeAreaOptions : undefined}
            areaFilterKeys={tab === "scope" ? scopeAreaFilter : null}
            onAreaFilterChange={tab === "scope" ? setScopeAreaFilter : undefined}
            collapseL1Above={3}
          />
        </aside>

        {/* Editor / empty state */}
        <main className="crm-scrollbar min-w-0 max-h-[calc(100dvh-12rem)] overflow-y-auto bg-white p-5 sm:p-6">
          {tab === "scope" && selectedScopeSubtype && scopeSelection?.level === "subtype" ? (
            <ScopeEditor
              key={selectedScopeSubtype.id}
              mode={{
                kind: "scope",
                row: selectedScopeSubtype,
                breadcrumb: scopeSelection.breadcrumb,
              }}
              onSaved={handleEditorSaved}
              onDeleted={handleCatalogDeleted}
              onDirtyChange={setEditorDirty}
            />
          ) : tab === "scope" && selectedScopeType && scopeSelection?.level === "type" ? (
            <CatalogTypeEditor
              key={selectedScopeType.id}
              mode={{
                kind: "scope",
                row: selectedScopeType,
                breadcrumb: scopeSelection.breadcrumb,
              }}
              subtypeCount={
                data.adminRows.scopeSubtypes.filter((s) => s.scopeTypeId === selectedScopeType.id)
                  .length
              }
              onAddSubtype={() =>
                setNewItem({
                  type: "scope_subtype",
                  scopeTypeId: selectedScopeType.id,
                  parentLabel: selectedScopeType.label,
                })
              }
              onSaved={handleEditorSaved}
              onDeleted={handleCatalogDeleted}
              onDirtyChange={setEditorDirty}
            />
          ) : tab === "investment" &&
            selectedInvestmentSubtype &&
            investmentSelection?.level === "subtype" ? (
            <ScopeEditor
              key={selectedInvestmentSubtype.id}
              mode={{
                kind: "investment",
                row: selectedInvestmentSubtype,
                breadcrumb: investmentSelection.breadcrumb,
              }}
              onSaved={handleEditorSaved}
              onDeleted={handleCatalogDeleted}
              onDirtyChange={setEditorDirty}
            />
          ) : tab === "investment" &&
            selectedInvestmentType &&
            investmentSelection?.level === "type" ? (
            <CatalogTypeEditor
              key={selectedInvestmentType.id}
              mode={{
                kind: "investment",
                row: selectedInvestmentType,
                breadcrumb: investmentSelection.breadcrumb,
              }}
              subtypeCount={
                data.adminRows.investmentSubtypes.filter(
                  (s) => s.investmentTypeId === selectedInvestmentType.id,
                ).length
              }
              onAddSubtype={() =>
                setNewItem({
                  type: "investment_subtype",
                  investmentTypeId: selectedInvestmentType.id,
                  parentLabel: selectedInvestmentType.label,
                })
              }
              onSaved={handleEditorSaved}
              onDeleted={handleCatalogDeleted}
              onDirtyChange={setEditorDirty}
            />
          ) : (
            <CatalogEmptyDetail
              tab={tab}
              onCreateType={() =>
                setNewItem({ type: tab === "scope" ? "scope_type" : "investment_type" })
              }
            />
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
          onCreated={(next) => handleCreated(next, undefined, newItem)}
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

