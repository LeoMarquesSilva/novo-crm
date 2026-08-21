import Link from "next/link";
import { ClipboardList, ExternalLink } from "lucide-react";

import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-static";

const SIMULATION_CONTRACT_ID = "416bc750-45df-4c0f-ab7e-73754a026b26";
const SIMULATION_OPPORTUNITY_ID = "7704666a-651c-4b2c-a537-b7d88cd70a61";
const SIMULATION_CLIENT_ID = "894f0a5c-d2a0-47c7-a715-01acc0c562b7";

type StepField = { label: string; value: string };
type Step = {
  number: number;
  title: string;
  note?: string;
  fields: StepField[];
};

const steps: Step[] = [
  {
    number: 1,
    title: "Identificação e vigência",
    fields: [
      { label: "Cliente", value: "[SIMULAÇÃO] Cliente Teste 21-08-2026" },
      { label: "Início da vigência", value: "21/08/2026" },
      { label: "Fim da vigência", value: "21/08/2027 (não marcar “Prazo indeterminado”)" },
      { label: "Dia de vencimento", value: "10" },
      { label: "Data-base de renovação", value: "21/07/2027" },
      { label: "Data do alerta de renovação", value: "21/05/2027" },
      { label: "Índice de reajuste", value: "IPCA" },
      { label: "Primeiro vencimento", value: "10/09/2026 (não marcar “Vencimento condicionado”)" },
      {
        label: "Responsáveis",
        value:
          "Adicionar Leonardo Marques como “Gestor” e mais uma pessoa como “Operacional” (ex.: Leonardo Loureiro Basso)",
      },
    ],
  },
  {
    number: 2,
    title: "Áreas e preços",
    note: "Clique em “Adicionar área” e escolha Cível.",
    fields: [
      { label: "Processos inclusos", value: "5" },
      { label: "Horas inclusas", value: "10" },
      { label: "Excedente processo", value: "R$ 300,00" },
      { label: "Excedente hora", value: "R$ 250,00" },
    ],
  },
  {
    number: 3,
    title: "Componentes e condições",
    note: "Adicione dois componentes para ver os dois comportamentos do faturamento.",
    fields: [
      { label: "Componente 1 — Tipo", value: "Mensal fixo" },
      { label: "Componente 1 — Área / Descrição", value: "Cível / “Honorários mensais”" },
      { label: "Componente 1 — Início da vigência / Valor", value: "21/08/2026 / R$ 3.500,00" },
      { label: "Componente 2 — Tipo", value: "Êxito percentual (marcar “Exige liberação manual”)" },
      { label: "Componente 2 — Área / Descrição", value: "Cível / “Êxito sobre recuperação”" },
      { label: "Componente 2 — Percentual / Condição do gatilho", value: "10% / “Liberar após trânsito em julgado”" },
    ],
  },
  {
    number: 4,
    title: "Rateios por área",
    note: "Adicione um rateio ligando o componente recorrente à área.",
    fields: [
      { label: "Área", value: "Cível" },
      { label: "Componente", value: "Honorários mensais" },
      { label: "Modo / Percentual", value: "Percentual / 100%" },
    ],
  },
  {
    number: 5,
    title: "Origem e comissões",
    fields: [
      { label: "Participação de sócio", value: "Leonardo Marques — 5%" },
      { label: "Comissão", value: "Leonardo Loureiro Basso — Percentual — 3%" },
    ],
  },
  {
    number: 6,
    title: "Projeção e ativação",
    fields: [
      { label: "Projeção mensal esperada", value: "R$ 3.500,00 (só o componente recorrente entra; o êxito fica fora até liberação)" },
      { label: "Gatilhos listados", value: "1 — “Êxito sobre recuperação”, 10%, condicionado" },
      { label: "Ação final", value: "Clicar em “Ativar contrato e avançar etapa”" },
    ],
  },
];

function StepCard({ step }: { step: Step }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-dark text-sm font-bold text-white">
          {step.number}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-zinc-900">{step.title}</h3>
          {step.note ? <p className="mt-1 text-sm text-zinc-500">{step.note}</p> : null}
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {step.fields.map((field) => (
              <div key={field.label} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{field.label}</dt>
                <dd className="mt-1 text-sm font-medium text-zinc-800">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </article>
  );
}

export default function ContractSimulationPage() {
  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Material para reunião de projetos"
        title="Simulação de contrato — 21/08/2026"
        description="Roteiro guiado para preencher, do zero, um contrato de teste no assistente de configuração e entender o processo certinho: cadastro-base → áreas → componentes → rateios → sócios/comissões → ativação."
        icon={ClipboardList}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-zinc-900">Cadastro-base já criado</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Cliente, oportunidade e contrato-rascunho de teste já existem no banco — abra o link abaixo e siga o
              roteiro dos 6 passos do assistente.
            </p>
          </div>
          <Link
            href={`/crm/contratos/${SIMULATION_CONTRACT_ID}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-dark px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark/90"
          >
            Abrir contrato de simulação
            <ExternalLink className="size-4" />
          </Link>
        </div>
        <dl className="mt-4 grid gap-3 text-xs text-zinc-500 sm:grid-cols-3">
          <div>
            <dt className="font-semibold uppercase tracking-wide">Cliente</dt>
            <dd className="mt-1 font-mono text-[11px] text-zinc-600">{SIMULATION_CLIENT_ID}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Oportunidade</dt>
            <dd className="mt-1 font-mono text-[11px] text-zinc-600">{SIMULATION_OPPORTUNITY_ID}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">Contrato (rascunho)</dt>
            <dd className="mt-1 font-mono text-[11px] text-zinc-600">{SIMULATION_CONTRACT_ID}</dd>
          </div>
        </dl>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          O link “Abrir contrato” cai na aba <strong>Visão geral</strong> — clique manualmente na aba{" "}
          <strong>Configuração</strong> para chegar no assistente. O parâmetro <code>?setup=1</code>, usado tanto
          no banner de cadastro-base quanto no bloqueio de transição do lead, não é lido por{" "}
          <code>contract-detail-shell.tsx</code> (só <code>?tab=closings</code> funciona hoje) — vale corrigir isso
          depois da reunião.
        </div>
      </section>

      <div className="space-y-4">
        {steps.map((step) => (
          <StepCard key={step.number} step={step} />
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-zinc-900">Depois de ativar</h2>
          <Badge variant="outline">opcional</Badge>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          Com o contrato ativo, dá pra continuar a simulação na aba <strong>Fechamentos</strong>: clique em
          “Preparar / recalcular” com a competência de 08/2026 para ver o fluxo de fechamento mensal (memória de
          cálculo, rateios, participações e comissões) usando os dados preenchidos acima.
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-[#f8f9fb] p-5 text-sm text-zinc-500">
        Cliente, oportunidade e contrato desta simulação estão marcados com “[SIMULAÇÃO]” para ficarem fáceis de
        achar e remover depois da reunião — é só pedir.
      </section>
    </div>
  );
}
