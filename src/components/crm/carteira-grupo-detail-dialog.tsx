"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { SelectField, TagSelectable } from "@/components/crm/new-lead-modal";
import { dialogSelectOutsideHandlers } from "@/lib/ui/base-ui-select-dialog";
import { AreaIconLabel, getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import {
  formatCarteiraDocumento,
  splitCarteiraGrupoMembros,
  type CarteiraGrupoMembro,
} from "@/lib/crm/carteira-grupo-membros";
import {
  describeGrupoAreaSources,
  mergeGrupoPracticeAreas,
  type GrupoAreaAtuacao,
} from "@/lib/crm/grupo-areas-atuacao";
import {
  formatGrupoIntakeIndication,
  GRUPO_INTAKE_INDICATION_TYPES,
  GRUPO_INTAKE_LEAD_TYPES,
  parseGrupoIntakeIndication,
} from "@/lib/crm/grupo-intake-indication";
import {
  CARTEIRA_CATEGORIA_BADGE_CLASS,
  CARTEIRA_CATEGORIA_LABEL,
  type CarteiraOrigemLinha,
} from "@/lib/crm/grupo-categoria";
import {
  CARTEIRA_CLIENTE_STATUS_LABEL,
  type CarteiraClienteStatus,
} from "@/lib/orqestrai/gestor-atividade";

const LEAD_TYPE_ITEMS = Object.fromEntries(GRUPO_INTAKE_LEAD_TYPES.map((item) => [item, item]));
const INDICATION_TYPE_ITEMS = Object.fromEntries(
  GRUPO_INTAKE_INDICATION_TYPES.map((item) => [item, item]),
);

export type CarteiraGrupoDetail = {
  id: string;
  nome: string;
  clienteStatus: CarteiraClienteStatus | null;
  origemLinha: CarteiraOrigemLinha;
  responsibleArea: string | null;
  tipoLead: string | null;
  tipoIndicacao: string | null;
  nomeIndicacao: string | null;
  areasAtuacao: unknown;
  membros: CarteiraGrupoMembro[];
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-v2-caption-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-v2-body-sm text-foreground">{children}</div>
    </div>
  );
}

function MemberList({
  title,
  empty,
  members,
}: {
  title: string;
  empty: string;
  members: CarteiraGrupoMembro[];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-v2-heading-md text-foreground">
        {title}{" "}
        <span className="text-v2-caption font-normal text-muted-foreground">({members.length})</span>
      </h3>
      {members.length === 0 ? (
        <p className="text-v2-body-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {members.map((membro) => (
            <li
              key={membro.id}
              className="rounded-(--radius-v2-md) border border-border px-3 py-2"
            >
              <p className="font-medium text-foreground">{membro.nome}</p>
              <p className="mt-0.5 tabular-nums text-v2-caption text-muted-foreground">
                {formatCarteiraDocumento(membro.documento)}
              </p>
              {membro.email ? (
                <p className="mt-0.5 break-all text-v2-caption text-muted-foreground">{membro.email}</p>
              ) : null}
              {membro.telefone ? (
                <p className="text-v2-caption text-muted-foreground">{membro.telefone}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CarteiraGrupoDetailDialog({
  grupo,
  canEdit,
  onOpenChange,
  onSaved,
}: {
  grupo: CarteiraGrupoDetail | null;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (patch: {
    id: string;
    tipoLead: string;
    tipoIndicacao: string | null;
    nomeIndicacao: string | null;
    areasAtuacao: unknown;
  }) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipoLead, setTipoLead] = useState("");
  const [tipoIndicacao, setTipoIndicacao] = useState("");
  const [nomeIndicacao, setNomeIndicacao] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [derivedAreas, setDerivedAreas] = useState<GrupoAreaAtuacao[]>([]);

  const indication = grupo
    ? parseGrupoIntakeIndication({
        tipoLead: grupo.tipoLead,
        tipoIndicacao: grupo.tipoIndicacao,
        nomeIndicacao: grupo.nomeIndicacao,
      })
    : null;
  const areas = grupo
    ? mergeGrupoPracticeAreas({
        responsibleArea: grupo.responsibleArea,
        areasAtuacao: grupo.areasAtuacao,
      })
    : [];
  const { empresas, pessoas } = splitCarteiraGrupoMembros(grupo?.membros ?? []);
  const derivedByArea = useMemo(
    () => new Map(derivedAreas.map((row) => [row.areaKey, row])),
    [derivedAreas],
  );
  const isIndicacao = tipoLead === "Indicacao";

  useEffect(() => {
    setEditing(false);
    setError(null);
    setDerivedAreas([]);
  }, [grupo?.id]);

  function startEdit() {
    if (!grupo) return;
    setTipoLead(grupo.tipoLead ?? "");
    setTipoIndicacao(grupo.tipoIndicacao ?? "");
    setNomeIndicacao(grupo.nomeIndicacao ?? "");
    setSelected(
      mergeGrupoPracticeAreas({
        responsibleArea: grupo.responsibleArea,
        areasAtuacao: grupo.areasAtuacao,
      }),
    );
    setError(null);
    setEditing(true);
    void loadDerived(grupo.id);
  }

  async function loadDerived(grupoId: string) {
    try {
      const res = await fetch(`/api/crm/carteira/grupos/${grupoId}`);
      const json = (await res.json()) as
        | { ok: true; data: { derivedAreas?: GrupoAreaAtuacao[] } }
        | { ok?: false; error?: string };
      if (res.ok && json.ok === true) {
        setDerivedAreas(json.data.derivedAreas ?? []);
      }
    } catch {
      setDerivedAreas([]);
    }
  }

  function toggleArea(areaKey: string) {
    setSelected((current) =>
      current.includes(areaKey) ? current.filter((item) => item !== areaKey) : [...current, areaKey],
    );
  }

  async function onSave() {
    if (!grupo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/carteira/grupos/${grupo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoLead,
          tipoIndicacao: isIndicacao ? tipoIndicacao : null,
          nomeIndicacao: isIndicacao ? nomeIndicacao : null,
          selectedAreaKeys: selected,
        }),
      });
      const json = (await res.json()) as
        | {
            ok: true;
            data: {
              tipoLead: string;
              tipoIndicacao: string | null;
              nomeIndicacao: string | null;
              areasAtuacao: unknown;
            };
          }
        | { ok?: false; error?: string };
      if (!res.ok || json.ok !== true) {
        throw new Error(("error" in json && json.error) || "Não foi possível gravar o grupo.");
      }
      onSaved?.({
        id: grupo.id,
        tipoLead: json.data.tipoLead,
        tipoIndicacao: json.data.tipoIndicacao,
        nomeIndicacao: json.data.nomeIndicacao,
        areasAtuacao: json.data.areasAtuacao,
      });
      setEditing(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gravar o grupo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      modal={false}
      open={Boolean(grupo)}
      onOpenChange={(open) => {
        if (!open) setEditing(false);
        onOpenChange(open);
      }}
    >
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        {...dialogSelectOutsideHandlers()}
      >
        {grupo ? (
          <>
            <DialogHeader className="pr-8">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-v2-heading-lg">{grupo.nome}</DialogTitle>
                  <DialogDescription>
                    Identidade do grupo econômico, categoria (Cliente ou Lead), indicação, áreas e
                    pessoas/CNPJs.
                  </DialogDescription>
                </div>
                {canEdit && !editing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={startEdit}
                  >
                    <Pencil />
                    Editar
                  </Button>
                ) : null}
              </div>
            </DialogHeader>

            {editing ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Status">
                    {grupo.clienteStatus ? (
                      <Badge
                        variant="outline"
                        className={
                          grupo.clienteStatus === "ativo"
                            ? "border-success-border bg-success-bg text-success-text"
                            : "border-neutral-200 bg-neutral-50 text-neutral-600"
                        }
                      >
                        {CARTEIRA_CLIENTE_STATUS_LABEL[grupo.clienteStatus]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Field>
                  <Field label="Categoria">
                    <Badge
                      variant="outline"
                      className={CARTEIRA_CATEGORIA_BADGE_CLASS[grupo.origemLinha]}
                    >
                      {CARTEIRA_CATEGORIA_LABEL[grupo.origemLinha]}
                    </Badge>
                    <p className="mt-1 text-v2-caption text-muted-foreground">
                      Não é área jurídica. Cliente vem da carteira; Lead virá de oportunidade.
                    </p>
                  </Field>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField label="Indicação *">
                    <Select
                      modal={false}
                      items={LEAD_TYPE_ITEMS}
                      value={tipoLead}
                      onValueChange={(value) => {
                        const next = value ?? "";
                        setTipoLead(next);
                        if (next !== "Indicacao") {
                          setTipoIndicacao("");
                          setNomeIndicacao("");
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 w-full justify-between font-normal">
                        <CrmSelectValue
                          value={tipoLead}
                          labels={LEAD_TYPE_ITEMS}
                          placeholder="Selecione"
                        />
                      </SelectTrigger>
                      <CrmSelectContent inModal>
                        {GRUPO_INTAKE_LEAD_TYPES.map((item) => (
                          <CrmSelectItem key={item} value={item}>
                            {item}
                          </CrmSelectItem>
                        ))}
                      </CrmSelectContent>
                    </Select>
                  </SelectField>
                  {isIndicacao ? (
                    <SelectField label="Tipo de indicação *">
                      <Select
                        modal={false}
                        items={INDICATION_TYPE_ITEMS}
                        value={tipoIndicacao}
                        onValueChange={(value) => setTipoIndicacao(value ?? "")}
                      >
                        <SelectTrigger className="h-10 w-full justify-between font-normal">
                          <CrmSelectValue
                            value={tipoIndicacao}
                            labels={INDICATION_TYPE_ITEMS}
                            placeholder="Selecione"
                          />
                        </SelectTrigger>
                        <CrmSelectContent inModal>
                          {GRUPO_INTAKE_INDICATION_TYPES.map((item) => (
                            <CrmSelectItem key={item} value={item}>
                              {item}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </SelectField>
                  ) : null}
                </div>
                {isIndicacao ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo-nome-indicacao" className="text-xs font-medium text-muted-foreground">
                      Nome de quem indicou *
                    </Label>
                    <Input
                      id="grupo-nome-indicacao"
                      value={nomeIndicacao}
                      onChange={(event) => setNomeIndicacao(event.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                ) : null}

                <div className="relative z-[1] space-y-2">
                  <p className="select-none text-v2-caption-medium text-muted-foreground">Áreas</p>
                  <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Áreas de atuação">
                    {CRM_PRACTICE_AREAS.map((area) => {
                      const derived = derivedByArea.get(area);
                      return (
                        <TagSelectable
                          key={area}
                          checked={selected.includes(area)}
                          onToggle={() => toggleArea(area)}
                          icon={getAreaLucideIcon(area)}
                          hint={derived ? describeGrupoAreaSources(derived.sources) : "Manual, se marcada"}
                        >
                          {area}
                        </TagSelectable>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  {grupo.clienteStatus ? (
                    <Badge
                      variant="outline"
                      className={
                        grupo.clienteStatus === "ativo"
                          ? "border-success-border bg-success-bg text-success-text"
                          : "border-neutral-200 bg-neutral-50 text-neutral-600"
                      }
                    >
                      {CARTEIRA_CLIENTE_STATUS_LABEL[grupo.clienteStatus]}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Field>
                <Field label="Categoria">
                  <Badge
                    variant="outline"
                    className={CARTEIRA_CATEGORIA_BADGE_CLASS[grupo.origemLinha]}
                  >
                    {CARTEIRA_CATEGORIA_LABEL[grupo.origemLinha]}
                  </Badge>
                </Field>
                <Field label="Indicação">
                  {indication?.ok ? formatGrupoIntakeIndication(indication.value) : "—"}
                </Field>
                <Field label="Áreas">
                  {areas.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {areas.map((area) => (
                        <AreaIconLabel key={area} area={area} size="xs" />
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Field>
              </div>
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {editing ? (
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="button" disabled={busy} onClick={() => void onSave()}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy ? "Gravando…" : "Salvar"}
                </Button>
              </DialogFooter>
            ) : null}

            <MemberList
              title="Empresas"
              empty="Nenhuma empresa/CNPJ neste grupo."
              members={empresas}
            />
            <MemberList
              title="Pessoas"
              empty="Nenhuma pessoa neste grupo."
              members={pessoas}
            />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
