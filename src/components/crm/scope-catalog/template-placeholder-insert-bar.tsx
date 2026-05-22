"use client";

import { useMemo, useState } from "react";
import { Braces, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatPropostaPlaceholderToken,
  PROPOSTA_INVESTMENT_TEMPLATE_PLACEHOLDERS,
  PROPOSTA_SCOPE_TEMPLATE_PLACEHOLDERS,
  type PropostaTemplatePlaceholderOption,
} from "@/lib/crm/proposta-placeholder-labels";
import { cn } from "@/lib/utils";

export type TemplatePlaceholderKind = "scope" | "investment";

type Props = {
  kind: TemplatePlaceholderKind;
  disabled?: boolean;
  onInsert: (key: string) => void;
};

const QUICK_SCOPE_KEYS = new Set(["NOME EMPRESA", "CNPJ", "CIDADE", "VALOR_CAUSA"]);
const QUICK_INVESTMENT_KEYS = new Set(["VALORMENSAL", "VALORHORA", "VALOREXITO"]);

function optionsForKind(kind: TemplatePlaceholderKind): PropostaTemplatePlaceholderOption[] {
  return kind === "scope"
    ? PROPOSTA_SCOPE_TEMPLATE_PLACEHOLDERS
    : PROPOSTA_INVESTMENT_TEMPLATE_PLACEHOLDERS;
}

function quickOptions(kind: TemplatePlaceholderKind): PropostaTemplatePlaceholderOption[] {
  const quick = kind === "scope" ? QUICK_SCOPE_KEYS : QUICK_INVESTMENT_KEYS;
  return optionsForKind(kind).filter((o) => quick.has(o.key));
}

export function TemplatePlaceholderInsertBar({ kind, disabled, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const all = useMemo(() => optionsForKind(kind), [kind]);
  const quick = useMemo(() => quickOptions(kind), [kind]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (o) =>
        o.key.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        formatPropostaPlaceholderToken(o.key).toLowerCase().includes(q),
    );
  }, [all, query]);

  function pick(key: string) {
    onInsert(key);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-7 gap-1 border-primary-dark/15 px-2 text-[11px] font-semibold text-primary-dark"
            >
              <Braces className="size-3 shrink-0" aria-hidden />
              Inserir variável
              <ChevronDown className="size-3 opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            className="w-[min(100vw-2rem,20rem)] p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="border-b border-primary-dark/10 p-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar variável..."
                  className="h-8 border-primary-dark/15 bg-white pl-7 text-xs"
                  autoFocus
                />
              </div>
            </div>
            <ul className="crm-scrollbar max-h-[min(280px,50dvh)] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma variável.</li>
              ) : (
                filtered.map((opt) => (
                  <li key={opt.key}>
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-primary-dark/5"
                      onClick={() => pick(opt.key)}
                    >
                      <span className="text-xs font-semibold text-primary-dark">{opt.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatPropostaPlaceholderToken(opt.key)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </PopoverContent>
        </Popover>

        {quick.map((opt) => (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            title={`Inserir ${formatPropostaPlaceholderToken(opt.key)}`}
            onClick={() => onInsert(opt.key)}
            className={cn(
              "inline-flex max-w-[9rem] items-center rounded-full border border-primary-dark/12 bg-white px-2 py-0.5",
              "text-[10px] font-semibold text-primary-dark transition-colors hover:border-accent-teal/40 hover:bg-accent-teal/8",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <span className="truncate">{opt.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Clique para inserir no cursor do texto. O comercial preenche o valor ao montar a proposta.
      </p>
    </div>
  );
}
