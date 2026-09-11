# Relatório — o que fizemos no motor de contratos

**Projeto:** CRM Jurídico — Bismarchi | Pires  
**Data:** 03/09/2026  
**Especificação de origem:** `crm/docs/ESPECIFICACAO-MOTOR-CONTRATOS-A-PARTIR-DA-PROPOSTA.md`  
**Idioma da interface e desta nota:** português do Brasil

Este arquivo não substitui a especificação. Ele registra o que entrou no código, o que ajustamos depois de usar no lead real e o que ainda falta para fechar os critérios de aceite (§90–§100).

**Atualização 03/09/2026 — Objeto automático:** ver `CONTRACT-OBJECT-ENGINE-IMPLEMENTATION.md`. O builder passou a abrir com Escopos Contratados e Objeto já redigido; toggles de área ficaram no legado.

---

## 1. Em uma frase

A etapa **Confecção do Contrato** deixa de começar vazia: ao abrir a aba Contrato, o CRM congela um snapshot da proposta aprovada, resolve perfis pelos `subtype_key` do catálogo e monta um `CanonicalContractData` único. O comercial não clica em “herdar”. O texto jurídico dos modelos **não** foi promovido a cláusula oficial BP.

---

## 2. Arquitetura escolhida

Seguimos o desenho da especificação:

```text
PROPOSTA APROVADA
        │
        ▼
SNAPSHOT (proposal_contract_snapshot)
        │
        ▼
CANONICAL CONTRACT DATA
        │
        ├── partes (CONTRATANTE / CONTRATANTES)
        ├── escopos + perfis por subtype_key
        ├── investimento / pagamento / vigência
        └── cláusulas + seções numeradas
        │
        ▼
document_instances.data_json
```

Regras que mantivemos:

- ligação por **ID de escopo** (`type_key` / `subtype_key`), nunca por label (“Auditoria Trabalhista”);
- um motor, não um `.docx` por serviço;
- redação jurídica em `pending_legal_review` / `REQUIRES LEGAL DECISION`;
- erros dos modelos (typo `R$ R$`, valor da Auditoria copiado no Canal, track changes) **não** viram regra.

O runtime ainda lê o **catálogo TypeScript** (`clause-catalog.ts` + `scope-profiles.ts`). As tabelas no Supabase existem para o admin/revisão futura.

---

## 3. Modelos Word que usamos

A spec citava 3 arquivos. Você colocou **6** em `C:\bkp\doc\new-crm\docs`:

| Arquivo | Uso |
| --- | --- |
| `MODELO DE CONTRATO TRABALHISTA - AUDITORIA.docx` | Melhor referência estrutural (2 contratantes) |
| `MODELO DE CONTRATO TRABALHISTA - CANAL DE DENÚNCIAS.docx` | Estrutura; **não** serve de master (revisões + valor copiado) |
| `MODELO DE CONTRATO TRABALHISTA - DIAGNÓSTICO.docx` | Entrada + parcelas; typo ignorado |
| `MODELO DE CONTRATO TRABALHISTA - RECLAMADA.docx` | Contencioso + consultivo, vigência indeterminada |
| `MODELO DE CONTRATO TRABALHISTA - RECLAMANTE.docx` | PF, extinção própria |
| `MODELO MENSAL FULL.docx` | Multiárea; exclusão geral contradiz o objeto |

Esqueleto comum extraído: Objeto → Excluídos → Preço → Inadimplemento → Vigência → Extinção → Obrigações → Despesas → Compliance → Disposições gerais.

Auditoria completa: `CONTRACT-SOURCE-MODELS-AUDIT.md`.  
Matriz de cláusulas: `CONTRACT-CLAUSE-MATRIX.md`.

---

## 4. O que o motor já faz

### Herança automática da proposta

Ao carregar `GET /api/crm/leads/:id/contrato`, se ainda não existir canônico:

1. lê cliente, empresas, `cp_areas_objeto`, `cp_escopo_detalhe_json`, investimento e tributação;
2. grava snapshot + `CanonicalContractData` em `document_instances.data_json`;
3. sincroniza `clausulas_selecionadas`;
4. marca as áreas do builder (`cc_incluir_*`) a partir da proposta.

Não há mais botão **Inicializar / Herdar da proposta**. O painel diagnóstico “Herdado da proposta” (pendências, mapeamento, alinhamento) foi **removido** — o trabalho acontece no modal **Elaborar Contrato**.

Snapshot congelado: se a proposta mudar depois, o contrato **não** atualiza em silêncio.

### Partes

- empresa principal da proposta = contratante;
- extras de `cp_proposta_empresas_json` = contratantes;
- demais empresas do intake = relacionadas;
- gramática única: CONTRATANTE / CONTRATANTES (`party-language.ts`).

### Escopos e perfis (5 trabalhistas)

Chaves reais do catálogo:

| `subtype_key` | Vigência default | Início |
| --- | --- | --- |
| `auditoria_trabalhista` | até entregável + estimativa | assinatura |
| `canal_de_denuncias_gestao_e_triagem` | 12 meses | primeiro pagamento |
| `diagnostico_organizacional_de_riscos_psicossociais_nr_1` | até laudo + 30 dias | primeiro pagamento |
| `contencioso_acompanhamento_de_acao_judicial` | indeterminado | assinatura |
| `consultivo` | indeterminado | assinatura |

Vários escopos no mesmo contrato. Exclusão que contradiz um serviço contratado é **filtrada** (ex.: Auditoria + NR-1 não exclui Auditoria).

Escopos Cível / Societário / Tributário / Rec. Créditos / Reestruturação ficam **sem perfil** (pendente). Não inventamos redação.

### Áreas de atuação no builder

Herdadas de `cp_areas_objeto` + chaves do JSON de escopo:

- Trabalhista → `cc_incluir_trabalhista`
- Cível → `cc_incluir_civel`
- Societário e Contratos → `cc_incluir_contratual`
- Tributário → `cc_incluir_tributario`

Só preenche toggle vazio. Se o comercial já marcou Sim/Não, não sobrescreve.

No lead INGEVITY a proposta tinha Trabalhista, Cível e Societário — essas três entram. Tributário no cadastro do lead, mas **não** no objeto da proposta, fica desmarcado.

### Êxito

Êxito **não é área de atuação**. Saiu da seção 3 e foi para **Valores e Pagamento**. Continua herdando se o investimento da proposta tiver êxito.

### Pagamento e vigência

Derivados do investimento canônico da proposta:

- mensal, preço fechado, parcelado, entrada + parcelas, êxito;
- valor por extenso;
- primeiro vencimento a partir dos placeholders;
- boleto / PIX / transferência / combinado / indefinido;
- vigência e início por perfil, com merge se os escopos divergirem.

### Cláusulas

Catálogo versionado no TypeScript (`stable_key`, `version`, `status`, `conflictsWithSubtypeIds`). Numeração automática de seções. Status: `pending_legal_review`.

### Aba Contrato

Permanece em `confeccao_contrato`, `contrato_elaborado`, `contrato_enviado` e `contrato_assinado`.

---

## 5. Ajustes depois de usar no CRM (não estavam no MD original)

| Problema | O que fizemos |
| --- | --- |
| `opportunityId is not defined` (500 ao herdar) | Variável errada no route; extraímos `initializeContractFromProposal` e passamos `oportunidadeId` |
| Botão “Herdar da proposta” | Removido; herança no GET do contrato |
| Painel enorme de pendências do motor | Removido; o builder já tem o dado comercial |
| Áreas do contrato vazias | Herança automática dos toggles `cc_incluir_*` |
| Êxito listado em Áreas de Atuação | Movido para Valores e Pagamento |
| Textos em português de Portugal | Interface e mensagens em pt-BR |
| `POST sync-contract-signers` 429 em loop | Cooldown no hook (Fast Refresh / remount não dispara de novo na hora) |
| Modal sem `DialogDescription` | Descrição só para leitores de tela |
| Transição para proposta enviada pedia link | Já tinha sido removido antes desta fatia (link de **contrato** segue obrigatório) |

Validação visual no lead **INGEVITY QUÍMICA LTDA** (`434b4b65-44a6-4eda-91dc-c1a03f1e3a52`): herança automática, 1 contratante, escopos trabalhistas com perfil, áreas marcadas, êxito no pagamento.

---

## 6. Arquivos principais

### Criados

- `crm/src/lib/crm/contract-engine/` (domínio: types, snapshot, perfis, cláusulas, pagamento, vigência, alinhamento, herança de áreas, persistência)
- `crm/src/lib/crm/contract-engine/contract-engine.test.ts`
- `crm/src/app/api/crm/leads/[id]/contrato/initialize-from-proposal/route.ts`
- `crm/supabase/migrations/20260902180000_contract_engine_from_proposal.sql`
- `crm/docs/CONTRACT-DOCUMENT-ENGINE.md`
- `crm/docs/CONTRACT-CLAUSE-MATRIX.md`
- `crm/docs/CONTRACT-SOURCE-MODELS-AUDIT.md`
- este relatório

### Alterados

- `GET/PATCH /api/crm/leads/[id]/contrato`
- `generate-docx` (usa canônico quando existe; bloqueia se alinhamento/pendências duras falharem)
- `contrato-document-builder.tsx` (herança, áreas, êxito no pagamento, aba após revisão)
- `lead-detail-view.tsx` (aba Contrato nas etapas seguintes)
- `use-pipeline-contract-signers-sync.ts` (429)
- `workflow-rules.ts` (link da proposta não é mais obrigatório na transição)

### Removidos

- `contrato-from-proposal-panel.tsx` (painel de diagnóstico)

Nenhum contrato legado de produção foi apagado. O builder antigo (toggles `cc_*`, preview React) ainda existe por baixo; o motor passa a alimentar cláusulas e dados.

---

## 7. Banco (Supabase CRM)

Migration aplicada no remoto: `contract_engine_from_proposal`.

- `contract_clause_templates`: `stable_key`, `version`, `status`, `role`, `conflicts_json`, …
- `contract_review_tasks`: `document_version_id`, `document_hash`, `approved_by`
- `document_versions`: `sha256`, `file_size`, `mime_type`
- tabelas novas: `contract_scope_profiles`, `contract_scope_profile_clauses` + RLS
- seed dos 5 perfis em `pending_legal_review`

---

## 8. APIs

| Método | Rota | Papel |
| --- | --- | --- |
| POST | `/api/crm/leads/:id/contrato/initialize-from-proposal` | Recalcula (uso interno / `force`). A tela não depende mais deste clique |
| GET | `/api/crm/leads/:id/contrato` | Garante instância, herda proposta + áreas, devolve engine |
| PATCH | `/api/crm/leads/:id/contrato` | Rascunho; `expectedUpdatedAt` → `409 CONTRACT_DRAFT_CHANGED` |
| POST | `.../contrato/generate-docx` | Word a partir do canônico, se houver |

---

## 9. Testes

`vitest` do motor: **13** passando.

Cobre: gramática de partes, Auditoria, Canal, Diagnóstico, combinação Auditoria + NR-1 sem exclusão contraditória, 2 empresas no plural, pagamento (mensal / parcelado / entrada / êxito), perfil em falta, placeholders, herança de áreas e êxito, não sobrescrever Sim/Não já escolhido.

A spec §95 pedia também `npm run lint`, `tsc` e `build` completos da app — **não rodamos essa suíte inteira** nesta fatia.

---

## 10. Critérios da spec (§90 / §100) — estado honesto

| Critério | Status |
| --- | --- |
| Herda cliente da proposta | Sim |
| Herda escopos por ID | Sim |
| Herda investimento estruturado | Sim |
| Cada escopo resolve perfil (quando existe no catálogo trabalhista) | Sim; demais áreas ficam pendentes |
| Exclusões contraditórias bloqueadas | Sim |
| Vários escopos | Sim |
| Várias contratantes | Sim |
| Pagamento derivado da proposta | Sim |
| Vigência varia por perfil | Sim |
| Cláusulas versionadas (catálogo) | Sim no TS; admin na BD ainda não |
| Preview e Word = mesma fonte | **Não.** Preview do builder ainda é React legado; Word já pode usar o canônico |
| Revisão amarrada à versão | Colunas no banco; **UI ainda não** |
| D4Sign envia o arquivo aprovado | **Não.** O envio ainda pode regenerar o DOCX |
| Placeholders resolvidos / sem track changes no master | Motor lista pendência; **master Word institucional ainda não existe** |
| Reconstruir o que foi contratado | Snapshot + canônico no `data_json` |

---

## 11. O que ainda não fizemos (próximas fatias)

1. Master Word `CONTRATO-BP-MASTER-V1.docx` (visual da Auditoria, sem `w:ins` / `w:del`).
2. Preview = esse Word (acabar com preview React paralelo).
3. Freeze SHA-256 + upload Storage `contract-documents/{opp}/{instance}/vN.docx`.
4. D4Sign enviar **bytes congelados**, sem regenerar.
5. UI de revisão ligada a `document_version_id` + hash.
6. Admin de perfis e cláusulas (as tabelas já existem).
7. Perfis Cível, Contratual, Tributário, Mensal Full, Reclamante vs Reclamada.
8. Override comercial com justificativa + eventos de histórico.
9. Regenerar `database.types.ts`.
10. `npm test` / `lint` / `tsc` / `build` completos da spec §95.

---

## 12. O que o Societário ainda precisa decidir

Nada disto foi “oficializado” pelo código:

- redação das cláusulas extraídas dos modelos;
- multa de mora (20% nos modelos);
- KM (R$ 2,00);
- textos de extinção do Reclamante;
- se exclusões gerais do Mensal Full valem quando o objeto inclui tributário/contratual.

Status: `REQUIRES LEGAL DECISION` / `pending_legal_review`.

---

## 13. Como experimentar

1. Lead em **Elaboração do Contrato** (ex.: INGEVITY).
2. Aba **Contrato** — a herança já correu.
3. **Elaborar Contrato** / **Continuar Elaboração**.
4. Conferir Partes, Áreas (sem êxito nessa lista) e Valores e Pagamento (êxito, se a proposta tiver).
5. Salvar / Gerar Word.

---

## 14. Documentos irmãos

| Arquivo | Função |
| --- | --- |
| `ESPECIFICACAO-MOTOR-CONTRATOS-A-PARTIR-DA-PROPOSTA.md` | Spec completa (o “o que deve ser”) |
| `CONTRACT-DOCUMENT-ENGINE.md` | Nota técnica curta do motor |
| `CONTRACT-CLAUSE-MATRIX.md` | Matriz das cláusulas draft |
| `CONTRACT-SOURCE-MODELS-AUDIT.md` | Auditoria dos 6 `.docx` |
| `AUDITORIA-PROPOSTAS-CONTRATOS-PREVIEW.md` | Auditoria anterior do módulo documental |
| **este arquivo** | O que de fato entregamos e o que falta |
