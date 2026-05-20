# Catalogo de campos do RD - etapas e regras atuais

## 1) Objetivo

Este documento consolida os campos atualmente usados no RD Station CRM, com:

- etapa/fase em que cada campo aparece;
- obrigatoriedade (fixa ou condicional);
- regras de validacao hoje aplicadas;
- observacoes operacionais importantes.

Fontes consolidadas:
- `src/data/salesFunnel.ts`
- `src/data/postFunnel.ts`
- `api/validar-sheets.js`
- `docs/n8n-rd-mapeamento-robusto.js`
- `rd-deal-68924d7526c1f50018dc039b.json`

---

## 2) Regras globais vigentes

- Datas: `DD/MM/AAAA`.
- Horarios: formato 24h (`HH:MM`), com aceite de `A definir` em cenarios especificos.
- E-mail: formato valido; em alguns pontos exige dominio corporativo.
- Link de proposta/contrato: deve ser `https://` e conter dominio oficial (`sharepoint`/`vios`).
- Campos financeiros de valor: numericos (sem texto/simbolo, conforme regra do campo).
- Rateio percentual: formato percentual (ex.: `50%`) onde aplicavel.
- `STATUS [CADASTRO]` e `STATUS [FINANCEIRO]` sao campos de automacao.

---

## 3) Funil de Vendas - etapas, campos e regras

## 3.1 Etapa: Cadastro do Lead

### Campos obrigatorios fixos

- **Solicitante**
  - Regra: nome preenchido; validacao atual cruza com lista de nomes validos cadastrados.
- **E-mail do Solicitante**
  - Regra: e-mail valido.
- **Cadastro realizado por (e-mail)**
  - Regra: e-mail valido.
- **Havera Due Diligence?**
  - Regra: selecionar `Sim` ou `Nao`.
- **Razao Social / Nome Completo**
  - Regra: obrigatorio.
- **CNPJ/CPF**
  - Regra: obrigatorio (formatacao pode variar conforme origem dos dados; validacao atualmente tolera cenarios legados).
- **Local da Reuniao**
  - Regra: obrigatorio.
- **Tipo de Lead**
  - Regra: obrigatorio.

### Campos condicionais

- **Prazo de Entrega da Due**
  - Obrigatorio quando `Havera Due Diligence = Sim`.
  - Pode aceitar `A definir` em alguns fluxos.
- **Horario de Entrega da Due**
  - Obrigatorio quando `Havera Due Diligence = Sim`.
  - Pode aceitar `A definir` em alguns fluxos.
- **Indicacao**
  - Obrigatorio quando `Tipo de Lead = Indicacao`.
- **Nome da Indicacao**
  - Obrigatorio quando `Tipo de Lead = Indicacao`.

### Campos de contexto (na etapa)

- Data da Reuniao
- Horario da Reuniao
- Areas de analise

Observacao:
- `areas_analise` aparece no processo e no RD, mas a validacao automatica atual esta desativada para esse campo.

---

## 3.2 Etapa: Levantamento de Dados (ADD)

Nao ha bloco de campos formais no codigo; etapa guiada por checklist operacional:
- pasta solicitada no VIOS;
- subpasta due criada;
- areas notificadas;
- pendencias registradas.

---

## 3.3 Etapa: Compilacao (MKT/COM.)

Etapa guiada por checklist:
- template oficial aplicado;
- versao com data;
- pendencias listadas;
- fontes por area.

---

## 3.4 Etapa: Revisao (ADD)

Etapa guiada por checklist:
- sem campos criticos em branco;
- padronizacao aplicada;
- links funcionais;
- pendencias claras.

---

## 3.5 Etapa: Due Diligence Finalizada (SOLICITANTE)

Campos:
- Data da Reuniao (obrigatorio)
- Horario (obrigatorio)
- Local (obrigatorio)

---

## 3.6 Etapa: Reuniao (SOLICITANTE)

Sem bloco tecnico de validacao especifico no endpoint atual; funciona como etapa de transicao para consolidacao da proposta.

---

## 3.7 Etapa: Confeccao de Proposta (SOLICITANTE) - bloco [CP]

### CRM (oportunidades internas): modal reuniao → confeccao de proposta

- **Razao Social** e **CNPJ** ja constam do cadastro do lead: nao aparecem no modal de transicao (validacao continua nos dados da oportunidade).
- **Areas objeto do contrato**: tipo multiselect com lista fixa (Trabalhista Consultivo … Tributario); valores guardados como lista em `field_values`.
- **Gestor do contrato** e **Captador**: tipo `user` (lista de utilizadores do CRM; valor = UUID de `app_users`).
- **Prazo para entrega** e **data do primeiro vencimento**: tipo `date_br` (interface em dd/mm/aaaa; persistencia ISO `YYYY-MM-DD` em `field_values`).
- Tipos de campo configuraveis: ver `FIELD_TYPE_LABELS` no admin de campos (`user`, `date_br`, etc.).

### Legado RD / folha (referencia historica)

- **Demais razoes sociais** era obrigatorio no fluxo RD importado por folha; no CRM atual o campo esta desativado nesta etapa (nao bloqueia a transicao).

### Campos obrigatorios (regras ativas de validacao)

- Qualificacao completa (endereco, CEP, endereco eletronico etc.) [CP]
- Areas Objeto do contrato [CP]
- Gestor do Contrato [CP]; Captador [CP] (no CRM: tipo `user`)
- Prazo para entrega [CP]; Data do primeiro vencimento [CP] (no CRM: tipo `date_br`, ver acima)
- Realizou Due Diligence? [CP] (`Sim`/`Nao`)
- Nome do ponto focal / Comercial [CP]
  - Regra: nome completo obrigatorio — pelo menos **dois** segmentos (nome e sobrenome); um unico token (ex.: so `João`) e rejeitado na validacao do CRM.
- E-mail do ponto focal / Comercial [CP]
  - Regra: e-mail valido.
- Telefone do ponto focal / Comercial [CP]
  - Regra: telefone valido com DDD.
- Tributacao [CP]
  - No CRM: selecao unica entre `Valor Liquido de Tributos` e `Valor Englobando Tributos`.
- Informacoes adicionais [CP]
  - **Opcional** no CRM (nao bloqueia a transicao se vazio).

### Campo relacionado (nao obrigatorio nesta etapa)

- Link da Proposta
  - Torna-se obrigatorio na etapa `Proposta Enviada`.

---

## 3.8 Etapa: Proposta Enviada (AGUARDA CLIENTE)

Campo validado:
- **Link da Proposta**
  - Obrigatorio nesta etapa.
  - Regra de dominio oficial (`https://` + `sharepoint`/`vios`).
  - Aceita marcador de proposta simples por telefone/WhatsApp quando informado no formato esperado.

---

## 3.9 Etapa: Confeccao de Contrato (CONTRATOS) - bloco [CC]

### Campos estruturais

- Tipo de Instrumento [CC] (ex.: Contrato, Aditivo, Acordo/Confissao)
- Limitacao de processos e valor adicional por processo [CC]
- Limitacao de horas (Consultivo) [CC]
- Objeto do Contrato [CC]
- Exito (descrever areas e percentuais) [CC]
- Valores (descrever tipo de pagamento, valores e vencimento) [CC]
- Tipo de pagamento [CC]
  - Regra: deve pertencer as opcoes validas do manual.
- Prazo para Confeccao do Contrato [CC]
  - Regra: data valida.

### Campos de valores [CC] (numericos)

- Mensal - Fixo Valor R$ [CC]
- Mensal - Preco Fechado Parcelado - Valor R$ [CC]
- Mensal - Escalonado - Valor R$ [CC]
- Mensal - Variavel - Valor R$ [CC]
- Mensal - Condicionado - Valor R$ [CC]
- SPOT - Valor R$ [CC]
- SPOT com Manutencao - Valor R$ [CC]
- SPOT - Parcelado - Valor R$ [CC]
- SPOT - Parcelado com manutencao - Valor R$ [CC]
- SPOT - Condicionado - Valor R$ [CC]
- Exito - Valor R$ [CC]

Regra:
- apenas numero (ex.: `1000` ou `1000.00`).

### Campos de rateio percentual [CC]

- RATEIO - PORCENTAGEM % (Reestruturacao e Insolvencia) - [CC]
- RATEIO - PORCENTAGEM % (Civel) - [CC]
- RATEIO - PORCENTAGEM % (Trabalhista) - [CC]
- RATEIO - PORCENTAGEM % (Tributario) - [CC]
- RATEIO - PORCENTAGEM % (Contratos / Societario) - [CC]
- RATEIO - PORCENTAGEM % (ADD) - [CC]

Regra:
- formato percentual (ex.: `50%`).

### Campo de link de contrato

- Link do Contrato
  - Regra de dominio oficial.
  - Cobranca automatica principal ocorre a partir de `Contrato Elaborado`.

---

## 3.10 Etapa: Contrato Elaborado (SOLICITANTE)

Campos relevantes:
- Link Contrato [CE]
- Responsavel pela Elaboracao [CE]

Regra:
- link de contrato passa a ser obrigatorio a partir desta etapa (e nas posteriores com contrato).

---

## 3.11 Etapa: Contrato Enviado (SOLICITANTE)

Sem bloco adicional de validacao em codigo; etapa de espera de assinatura.

---

## 3.12 Etapa: Contrato Assinado (SOLICITANTE)

Campo:
- Data de assinatura do contrato [CA]

Regra adicional de processo:
- acao operacional de marcacao de venda para transicao ao pos-venda (processo legado RD).

---

## 4) Funil de Pos-Venda - etapas, campos e regras

## 4.1 Etapa: Aguardando Cadastro (SOLICITANTE)

Etapa de espera/preparacao; sem bloco tecnico de validacao especifico.

---

## 4.2 Etapa: Cadastro de Novo Cliente (SOLICITANTE) - bloco [CADASTRO]

Campos obrigatorios:
- Razao Social Cliente Principal [CADASTRO]
- CNPJ / CPF Cliente Principal [CADASTRO]
- Endereco Cliente Principal [CADASTRO]
- Qualificacao dos Socios (...) [CADASTRO]
- Cadastrar na consulta automatizada de novas demandas? (...) [CADASTRO]
- Informacoes Adicionais [CADASTRO]
- STATUS [CADASTRO]

Regra operacional:
- `STATUS [CADASTRO]` inicia em `PENDENTE` e segue fluxo de automacao/correcao.

---

## 4.3 Etapa: Inclusao no Fluxo de Faturamento (FINANCEIRO) - bloco [FINANCEIRO]

Campos obrigatorios:
- Razao Social para Faturamento [FINANCEIRO]
- CPF/CNPJ para Faturamento [FINANCEIRO]
- Inicio da Vigencia do Contrato [FINANCEIRO]
- Primeiro Faturamento [FINANCEIRO]
- Responsavel Financeiro do Cliente [FINANCEIRO]
- Posicao do Responsavel (...) [FINANCEIRO]
- E-mail Responsavel Financeiro do Cliente [FINANCEIRO]
- Telefone Responsavel Financeiro do Cliente [FINANCEIRO]
- Repasse acordado % [FINANCEIRO]
- RATEIO - VALOR R$ (Reestruturacao e Insolvencia) - [FINANCEIRO]
- RATEIO - VALOR R$ (Civel) - [FINANCEIRO]
- RATEIO - VALOR R$ (Trabalhista) - [FINANCEIRO]
- RATEIO - VALOR R$ (Tributario) - [FINANCEIRO]
- RATEIO - VALOR R$ (Contratos / Societario) - [FINANCEIRO]
- RATEIO - VALOR R$ (ADD) - [FINANCEIRO]
- Indice de Reajuste - [FINANCEIRO]
- Periodicidade do Reajuste - [FINANCEIRO]
- Observacoes - [FINANCEIRO]
- STATUS [FINANCEIRO]

Campos auxiliares identificados:
- ID SHAREPOINT [FINANCEIRO]

Regra operacional:
- `STATUS [FINANCEIRO]` inicia em `PENDENTE` e avanca por automacao/validacao.

---

## 4.4 Etapa: Boas-vindas (RECEP.)

Sem bloco tecnico de campos obrigatorios na validacao atual.

---

## 4.5 Etapa: Reuniao Kick-off (ALINH.)

Etapa guiada por checklist:
- escopo confirmado;
- responsaveis definidos;
- pendencias registradas.

---

## 5) Campos transversais e tecnicos usados no ecossistema atual

- deal_id
- stage_name / stage_id
- funil
- status / estado
- motivo_perda
- created_at / updated_at
- follow_up / follow_up_anotacao
- email_notificar / telefone_notificar
- id_registro

Uso:
- suporte a validacao em lote, SLA e notificacoes.

---

## 6) Stages ignorados na validacao automatica atual

As linhas nessas etapas podem ser ignoradas no endpoint de validacao:
- Contato Inicial
- Contato feito
- Contato Trimestral
- Descartados
- Mensagem Enviada
- Suspenso
- Lead Quente
- Contato Mensal
- Lead Capturado
- Reuniao Realizada
- Contatos
- Novos Contatos
- Execucao do Servico

---

## 7) Mapa resumido de regras por etapa (motor atual)

- Em `Funil de vendas`:
  - sempre roda base de `Cadastro do Lead`;
  - se etapa parecer `Confeccao de Proposta`, adiciona validacoes [CP];
  - se etapa parecer `Proposta Enviada`, exige `Link da Proposta`;
  - se etapa parecer `Confeccao de Contrato`, valida bloco [CC];
  - se etapa parecer `Contrato Elaborado` ou `Contrato Assinado`, exige `Link do Contrato`.

- Em outros funis:
  - validacao automatica atual e mais leve e fortemente dependente do fluxo operacional/manual.

---

## 8) Observacoes importantes para migracao

- O inventario de labels RD esta sujeito a variacoes de acento/espaco, por isso o sistema atual usa normalizacao forte.
- Ha aliases legados para os mesmos campos (planilha, RD e webhook), especialmente em financeiro/rateio.
- Este catalogo representa o **estado atual em producao**; para o novo CRM, recomenda-se transformar em dicionario canonico com `id tecnico` fixo por campo.

---

## 9) Novo CRM: campos dinamicos vs cadastro interno

### Origens de dados

| Origem | Onde fica | Uso na UI |
|--------|-----------|-----------|
| Seed / migrations SQL | `field_definitions` com `field_code` prefixado (ex.: `cp_*`) | Modal de transicao de etapa, `field_values` por oportunidade |
| Admin Campos | Novas linhas em `field_definitions` (`field_code` gerado a partir do label) | Mesmo fluxo; evitar duplicar o **mesmo** conceito com labels so diferentes por acento |
| Formulario Nova demanda | `oportunidades` + `lead_intakes` (JSON empresas, areas, reunião, etc.) | Ficha do lead: cartao **Cadastro inicial**; nao depende do RD |
| Integracao RD | `rd_deal_reconciliacao.detalhes` | Ficha: **Campos preenchidos no RD** |

### Regras operacionais

- **entity_name** em `field_definitions` deve ser **`oportunidade`** (singular), alinhado ao insert de `field_values` nas APIs de transicao.
- **Dedupe de label no admin:** comparacao usa `normalizeLabelKey` (remove acentos, colapsa espacos). Dois labels que diferem apenas em acentuacao entram em conflito 409 ao criar campo no mesmo funil.
- **Rotas de transicao usadas pelo pipeline:** `GET/POST /api/crm/leads/transition-requirements` e `/api/crm/leads/transition`. A rota `/api/workflow/transition` valida apenas regras de dominio; nao persiste no Supabase.

### Checklist manual apos alteracoes em leads

1. Criar lead pelo formulario: resposta 201 e linha em `lead_intakes`.
2. Abrir `/crm/leads/[id]`: cartao Cadastro inicial com empresas e areas.
3. Arrastar no pipeline para etapa com campos dinamicos: modal coerente; confirmar etapa sem 422 indevido.
4. Admin: tentar criar campo com label semanticamente igual a um existente (ex.: mesma frase com/sem acento): deve bloquear duplicata.
