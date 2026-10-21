"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { newLeadModalFieldClass } from "./index";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Texto comparável na busca: sem acento, minúsculo e com espaços simples ("João" acha "joao"). */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type SearchablePickerA11yProps = {
  /** Id do botão; permite um `<Label htmlFor>` externo (ex.: `FormField`). */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

type SearchablePickerProps<T> = SearchablePickerA11yProps & {
  /** Sem label, o consumidor renderiza o próprio (associado via `id`). */
  label?: string;
  placeholder: string;
  disabled?: boolean;
  helperText?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: T[];
  value: string;
  onChange: (id: string) => void;
  getOptionId: (option: T) => string;
  filterOption: (option: T, query: string) => boolean;
  renderTrigger: (selected: T | null) => ReactNode;
  renderOption: (option: T) => ReactNode;
  /** Conteúdo do gatilho quando nenhuma opção da lista está escolhida, no lugar do placeholder. */
  triggerContent?: ReactNode;
  /** Ação fixa no fim da lista (ex.: "cadastrar novo"); recebe o texto buscado. */
  footerAction?: {
    label: (query: string) => ReactNode;
    onSelect: (query: string) => void;
  };
};

export function SearchablePicker<T>({
  label,
  placeholder,
  disabled = false,
  helperText,
  searchPlaceholder,
  emptyMessage,
  options,
  value,
  onChange,
  getOptionId,
  filterOption,
  renderTrigger,
  renderOption,
  triggerContent,
  footerAction,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: SearchablePickerProps<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);

  const selected = options.find((o) => getOptionId(o) === value) ?? null;
  const filtered = options.filter((o) => filterOption(o, query));
  // A ação do rodapé entra na navegação por setas como o último item.
  const itemCount = filtered.length + (footerAction ? 1 : 0);
  const optionDomId = (index: number) => `${listId}-option-${index}`;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 280);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    // Abre para cima quando não cabe embaixo (gatilho perto do pé da tela, ex.: no mobile).
    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    if (spaceBelow < panelHeight && spaceAbove > spaceBelow) {
      setPanelStyle({ bottom: window.innerHeight - rect.top + 6, left, width });
    } else {
      setPanelStyle({ top: rect.bottom + 6, left, width });
    }
  }, []);

  function openPanel() {
    const selectedIndex = options.findIndex((o) => getOptionId(o) === value);
    setActiveIndex(Math.max(selectedIndex, 0));
    setOpen(true);
  }

  function closePanel(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  }

  function chooseItem(index: number) {
    const option = filtered[index];
    if (option) {
      onChange(getOptionId(option));
      closePanel(true);
      return;
    }
    if (footerAction && index === filtered.length) {
      const typed = query;
      closePanel(true);
      footerAction.onSelect(typed);
    }
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // Remede com o painel já renderizado (altura real) e depois da animação de abertura do Dialog.
    const frame = requestAnimationFrame(() => updatePosition());
    const settle = window.setTimeout(updatePosition, 250);
    const onResize = () => updatePosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);

  const panel =
    open && panelStyle && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            data-new-lead-picker-panel=""
            className="fixed z-(--z-dialog-floating) overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white shadow-(--shadow-v2-sm)"
            style={{
              top: panelStyle.top,
              bottom: panelStyle.bottom,
              left: panelStyle.left,
              width: panelStyle.width,
            }}
          >
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  role="combobox"
                  aria-label={searchPlaceholder}
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={itemCount > 0 ? optionDomId(activeIndex) : undefined}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveIndex((prev) => Math.min(prev + 1, itemCount - 1));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveIndex((prev) => Math.max(prev - 1, 0));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (itemCount > 0) chooseItem(activeIndex);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  className={cn(newLeadModalFieldClass, "pl-9")}
                  autoFocus
                />
              </div>
            </div>
            <div
              id={listId}
              role="listbox"
              className="crm-scrollbar max-h-[min(280px,45dvh)] overflow-y-auto"
            >
              <div className="space-y-0.5 p-1.5">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>
                ) : (
                  filtered.map((option, index) => {
                    const optionId = getOptionId(option);
                    const isSelected = optionId === value;
                    return (
                      <button
                        key={optionId}
                        id={optionDomId(index)}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => chooseItem(index)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors",
                          isSelected
                            ? "bg-interactive-50 text-interactive-700"
                            : index === activeIndex
                              ? "bg-surface-hover text-foreground"
                              : "text-foreground",
                        )}
                      >
                        {renderOption(option)}
                      </button>
                    );
                  })
                )}
              </div>
              {footerAction ? (
                <div className="sticky bottom-0 border-t border-border bg-white p-1.5">
                  <button
                    id={optionDomId(filtered.length)}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={false}
                    onMouseMove={() => setActiveIndex(filtered.length)}
                    onClick={() => chooseItem(filtered.length)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm font-medium text-primary transition-colors",
                      activeIndex === filtered.length && "bg-interactive-50",
                    )}
                  >
                    <UserPlus className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{footerAction.label(query)}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={label ? "space-y-2" : undefined}>
      {label ? (
        <Label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </Label>
      ) : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        // Gatilho de seleção que abre uma listbox (padrão "select-only combobox"); o papel
        // combobox também é o que aceita `aria-invalid`.
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (disabled) return;
          if (open) closePanel(false);
          else openPanel();
        }}
        onKeyDown={(event) => {
          if (disabled || open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPanel();
          }
        }}
        className={cn(
          newLeadModalFieldClass,
          "flex items-center justify-between gap-2 text-left font-normal hover:bg-surface-hover aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          open && "border-primary ring-3 ring-ring/20",
        )}
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            renderTrigger(selected)
          ) : triggerContent ? (
            triggerContent
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {panel}
      {helperText ? <p className="text-xs leading-relaxed text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

export type SystemUserOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
};

export function UserPickerField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  ...a11y
}: SearchablePickerA11yProps & {
  label?: string;
  placeholder: string;
  options: SystemUserOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <SearchablePicker
      {...a11y}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      searchPlaceholder="Pesquisar por nome ou e-mail…"
      emptyMessage="Nenhum usuário encontrado."
      options={options}
      value={value}
      onChange={onChange}
      getOptionId={(o) => o.id}
      filterOption={(o, q) => normalizeSearch(`${o.name} ${o.email}`).includes(normalizeSearch(q))}
      renderTrigger={(user) =>
        user ? (
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarImage src={user.avatarUrl} alt="" className="object-cover" />
            <AvatarFallback className="text-[10px] font-bold">
              {initialsFromName(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate font-medium text-foreground">{user.name}</span>
        </span>
        ) : null
      }
      renderOption={(user) => (
        <>
          <Avatar className="h-8 w-8 shrink-0 border border-border">
            <AvatarImage src={user.avatarUrl} alt="" className="object-cover" />
            <AvatarFallback className="text-[10px] font-bold">
              {initialsFromName(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </>
      )}
    />
  );
}

export type ClientOption = {
  id: string;
  razao_social: string;
  documento: string;
};

export function ClientPickerField({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  helperText,
  ...a11y
}: SearchablePickerA11yProps & {
  label?: string;
  placeholder: string;
  options: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <SearchablePicker
      {...a11y}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      helperText={helperText}
      searchPlaceholder="Pesquisar por razão social ou documento…"
      emptyMessage="Nenhum cliente encontrado."
      options={options}
      value={value}
      onChange={onChange}
      getOptionId={(o) => o.id}
      filterOption={(o, q) =>
        normalizeSearch(`${o.razao_social} ${o.documento}`).includes(normalizeSearch(q))
      }
      renderTrigger={(client) =>
        client ? (
        <span className="flex min-w-0 items-baseline gap-2 text-left">
          <span className="truncate font-medium text-foreground">{client.razao_social}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{client.documento}</span>
        </span>
        ) : null
      }
      renderOption={(client) => (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{client.razao_social}</span>
          <span className="block truncate text-xs text-muted-foreground">{client.documento}</span>
        </span>
      )}
    />
  );
}

/**
 * Nome da indicação: busca na base de indicadores aprovados (sem acento/maiúscula) e, no fim
 * da lista, a ação de cadastrar um nome novo, que já leva o texto digitado.
 */
export function IndicatorPickerField({
  placeholder,
  options,
  value,
  isNew = false,
  onChange,
  onRegisterNew,
  disabled = false,
  ...a11y
}: SearchablePickerA11yProps & {
  placeholder: string;
  options: string[];
  value: string;
  /** Usuário escolheu cadastrar um nome novo (fora da base). */
  isNew?: boolean;
  onChange: (name: string) => void;
  /** Recebe o texto buscado quando ele ainda não existe na base; "" se não houver. */
  onRegisterNew: (typedName: string) => void;
  disabled?: boolean;
}) {
  const existsInBase = (typed: string) =>
    options.some((name) => normalizeSearch(name) === normalizeSearch(typed));

  return (
    <SearchablePicker<string>
      {...a11y}
      placeholder={placeholder}
      disabled={disabled}
      searchPlaceholder="Pesquisar pelo nome…"
      emptyMessage="Nenhum nome encontrado na base."
      options={options}
      value={isNew ? "" : value}
      onChange={onChange}
      getOptionId={(name) => name}
      filterOption={(name, query) => normalizeSearch(name).includes(normalizeSearch(query))}
      renderTrigger={(name) => (
        <span className="block truncate font-medium text-foreground">{name}</span>
      )}
      renderOption={(name) => <span className="min-w-0 flex-1 truncate">{name}</span>}
      triggerContent={
        isNew ? (
          <span className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground">
            <UserPlus className="size-4 shrink-0 text-interactive-700" aria-hidden />
            <span className="truncate">Nome novo, para aprovação</span>
          </span>
        ) : undefined
      }
      footerAction={{
        label: (query) => {
          const typed = query.trim();
          if (!typed || existsInBase(typed)) return "Não encontrei na base: cadastrar nome novo";
          return (
            <>
              Cadastrar <span className="font-semibold">“{typed}”</span> como nome novo
            </>
          );
        },
        onSelect: (query) => {
          const typed = query.trim();
          onRegisterNew(typed && !existsInBase(typed) ? typed : "");
        },
      }}
    />
  );
}
