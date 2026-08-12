# Runbook do gerenciador de contratos

## Escopo e estado de liberação

Este runbook cobre a preparação operacional do módulo de contratos, fechamentos, renovações e aditivos. Em 12/08/2026, as validações locais podem ser executadas, mas **a aplicação das migrations, o backfill e o smoke em qualquer Supabase remoto estão PENDENTES e exigem autorização explícita**.

O VIOS continua responsável por emissão, contas a receber e pagamentos. O CRM registra somente a referência manual do lançamento. O painel D4Sign existente deve permanecer funcional durante todo o cutover.

## 1. Pré-requisitos

- Branch/commit de release identificado e todas as validações locais aprovadas.
- Backup/PITR do banco confirmado antes de qualquer DDL remoto.
- Janela de mudança, operador e aprovador registrados.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` configurados no ambiente alvo.
- CLI Supabase autenticada e vinculada ao projeto correto, quando a aplicação remota for autorizada.
- Cron `contracts-daily` mantido desabilitado até o schema e o backfill estarem validados.

## 2. Ordem das migrations

Aplicar estritamente nesta ordem, depois das migrations históricas já existentes:

1. `supabase/migrations/20260812120000_contract_management_schema.sql` — enums, expansão de `contratos`/`aditivos`, tabelas relacionais, índices, constraints e guardas de imutabilidade.
2. `supabase/migrations/20260812121000_contract_management_rls.sql` — RLS de leitura autenticada e bloqueio de escrita direta nas tabelas financeiras.
3. `supabase/migrations/20260812122000_contract_management_workflow.sql` — RPCs transacionais, integração com assinatura/workflow, fechamentos, consumos, alertas e gestão de versões/ciclo de vida.

Validação local sugerida, em um banco descartável:

```powershell
npx.cmd supabase db reset
npm.cmd test -- src/modules/contracts src/modules/crm/application/services/transition-opportunity.test.ts src/lib/auth/crm-access-policy.test.ts
npm.cmd run lint
npm.cmd test
npm.cmd run build
git diff --check
```

Após o reset, conferir que as três migrations aparecem em `npx.cmd supabase migration list` e inspecionar os logs do PostgreSQL. Não usar um banco compartilhado para essa validação.

> **PAUSA OBRIGATÓRIA — REMOTO:** não executar `supabase db push`, SQL Editor, backfill ou smoke remoto sem autorização explícita para o projeto e a janela indicados. Esta tarefa não concede essa autorização.

## 3. Dry-run do backfill

O dry-run é somente leitura e lista oportunidades exatamente em `contrato_assinado`. Execute primeiro e registre as três contagens.

```sql
select
  count(*) filter (where c.id is null) as pendentes,
  count(*) filter (where c.id is not null) as ja_vinculadas,
  count(*) as total_contrato_assinado
from public.oportunidades o
left join public.contratos c on c.oportunidade_id = o.id
where o.etapa = 'contrato_assinado';
```

Para diagnóstico, sem expor dados pessoais além do necessário:

```sql
select o.id as oportunidade_id, c.id as contrato_id
from public.oportunidades o
left join public.contratos c on c.oportunidade_id = o.id
where o.etapa = 'contrato_assinado'
order by o.id;
```

Critério para avançar: `total_contrato_assinado = pendentes + ja_vinculadas`, sem duplicidade de `oportunidade_id` em `contratos`.

## 4. Backfill idempotente

Executar somente após a pausa/aprovação remota. A RPC retorna sempre o mesmo contrato lógico e o índice único parcial `contratos_oportunidade_unique` impede dois contratos para a mesma oportunidade. Repetir o bloco é seguro: oportunidades já vinculadas permanecem vinculadas ao mesmo contrato.

```sql
begin;

create temporary table contract_backfill_result (
  oportunidade_id uuid primary key,
  contrato_id uuid not null
) on commit drop;

insert into contract_backfill_result (oportunidade_id, contrato_id)
select
  o.id,
  public.ensure_contract_draft_for_opportunity(o.id, clock_timestamp())
from public.oportunidades o
where o.etapa = 'contrato_assinado';

select
  count(*) as oportunidades_processadas,
  count(distinct oportunidade_id) as oportunidades_distintas,
  count(distinct contrato_id) as contratos_distintos
from contract_backfill_result;

select
  count(*) filter (where c.id is null) as pendentes_apos_backfill,
  count(*) filter (where c.id is not null) as vinculadas_apos_backfill,
  count(*) as total_contrato_assinado
from public.oportunidades o
left join public.contratos c on c.oportunidade_id = o.id
where o.etapa = 'contrato_assinado';

commit;
```

Critérios de sucesso: zero pendências após o backfill; oportunidades processadas = oportunidades distintas = contratos distintos; nenhuma configuração financeira completa foi ativada automaticamente. Em caso de erro, executar `rollback;`, preservar o log e investigar antes de repetir.

## 5. Cron diário

O deploy registra `/api/cron/contracts-daily` às `0 13 * * *` (13:00 UTC). A rota aceita `GET` ou `POST`, exige `CRON_SECRET` por Bearer ou `x-cron-secret`, usa a data de `America/Sao_Paulo` e responde com contagens e erros por contrato.

Invocação manual autorizada:

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Method Post -Uri "https://SEU_HOST/api/cron/contracts-daily" -Headers $headers
```

Esperado: HTTP 200 sem erros ou 207 com erros parciais detalhados. Repetir no mesmo dia não deve duplicar alertas, notificações ou fechamentos, pois as chaves de idempotência e índices únicos são estáveis.

## 6. Matriz de smoke por papel

| Ação | admin | controladoria | financeiro | comercial |
|---|---:|---:|---:|---:|
| Consultar carteira, ficha e memória | sim | sim | sim | sim |
| Criar/reparar rascunho vinculado | sim | sim | não | sim |
| Configurar, ativar, versionar e alterar ciclo | sim | sim | não | não |
| Informar consumo e preparar fechamento | sim | sim | sim | não |
| Aprovar fechamento | sim | sim | não | não |
| Registrar referência VIOS | sim | sim | sim | não |
| Concluir renovação/aditivo | sim | sim | não | não |
| Ver documentos D4Sign vinculados | sim | sim | sim | sim |
| Ver documentos D4Sign órfãos | sim | não | não | não |

Para cada papel, confirmar também que uma chamada direta à API negada retorna 403; esconder controles na interface não substitui essa verificação.

## 7. Smoke funcional remoto

**Estado: PENDENTE — NÃO AUTORIZADO nesta tarefa.** Só executar em banco no qual as três migrations tenham sido explicitamente autorizadas e aplicadas.

- Assinar/finalizar uma oportunidade cria exatamente um rascunho; repetir os caminhos manual, webhook e reconciliação não duplica.
- Entrar em `inclusao_faturamento` exibe a configuração; configuração inválida não avança.
- Ativação válida muda contrato/versão e avança para `boas_vindas` atomicamente.
- Cenário Ingevity resulta em R$ 14.680,00 e dois bloqueios de excedente sem preço.
- Aprovar congela a revisão; correção cria a revisão seguinte sem alterar o snapshot aprovado.
- Registrar VIOS exige revisão aprovada e persiste somente referência, URL opcional, data e autor.
- Cron cria tarefa de renovação na antecedência padrão de 30 dias e não duplica ao repetir.
- Aditivo/nova versão afeta apenas competências cobertas pela nova vigência.

## 8. Não regressão VIOS e D4Sign

VIOS:

- Confirmar que nenhuma rota cria título, fatura, nota, recebível ou pagamento no VIOS.
- Registrar uma referência manual em fechamento aprovado e confirmar que os valores/histórico não são reescritos.
- Confirmar que o conector de consulta de cliente continua stub; isso não bloqueia o registro manual.

D4Sign:

- Abrir `Assinaturas D4Sign` no hub e conferir documentos vinculados e órfãos, quota, signatários do escritório, filtros e atualização do cofre.
- Confirmar envio e webhook em ambiente autorizado, inclusive assinatura parcial e finalização idempotente.
- Confirmar que documento órfão continua visível somente a administrador e que o detalhe do lead mantém o painel D4Sign.

## 9. Limites de rollback

- Antes do DDL remoto: rollback é somente da aplicação; mantenha o cron desabilitado.
- Após o DDL e antes do backfill: preferir correção forward. Remover enums/tabelas/colunas não é rollback seguro e exige restauração testada do backup.
- Após o backfill: os rascunhos são dados auditáveis e idempotentes. Não os apagar em massa; uma limpeza exige aprovação específica, seleção por `oportunidade_id` e backup.
- Após ativações ou fechamentos: não reverter snapshots ativos/aprovados por `UPDATE`. Usar nova versão, nova revisão ou mudança de ciclo auditada.
- Se o deploy da aplicação falhar após migrations compatíveis, reverter somente o código e desabilitar `/api/cron/contracts-daily`; preservar schema e dados para correção forward.
- Se integridade ou RLS estiver comprometida, interromper writes, desabilitar cron e APIs de mutação, coletar evidências e restaurar o banco somente pelo plano de recuperação aprovado.

## 10. Registro da execução

Guardar no ticket de mudança: commit/deploy, projeto Supabase, operador/aprovador, timestamps, resultado de cada migration, contagens do dry-run e backfill, resposta do cron, matriz de papéis, smoke VIOS/D4Sign e decisão final de liberar ou reverter.
