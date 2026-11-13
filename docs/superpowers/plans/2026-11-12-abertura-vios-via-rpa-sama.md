# Abertura no VIOS via RPA do SAMA (substitui a esteira do SharePoint)

**Objetivo:** quando um lead com due diligence é cadastrado, o CRM deixa de gravar um item na lista "AGENDAMENTOS / REAGENDAMENTOS" do SharePoint. Em vez disso, pede ao RPA do SAMA que:

1. localize ou cadastre o prospect como pessoa no VIOS;
2. abra a pasta de atendimento;
3. agende as tarefas da due.

O CRM acompanha o resultado do pedido e mostra o status na ficha do lead.

**Arquitetura em uma frase:** o CRM cria um job idempotente por oportunidade e o envia a uma Edge Function de entrada do SAMA. O SAMA enfileira o job em `vios_agendamentos` e o `sama-rpa` executa no VIOS com Playwright. O resultado (CI do cliente, CI da pasta e CIs das tarefas) volta ao CRM por callback, com reconciliação como plano B.

**Repositórios:**

| Repositório | Caminho | Observação |
|---|---|---|
| CRM | `C:\CRM novo` (`LeoMarquesSilva/novo-crm`) | — |
| SAMA, app Next | `C:\SAMA\SAMA` | — |
| RPA | `C:\SAMA\SAMA\sama-rpa` (`ViniciusSchmockel/sama-rpa`) | A cópia local está 33 commits atrás de `origin/main`. |

---

## 1. Como é hoje

### 1.1 CRM → SharePoint

Tudo acontece em `POST /api/leads/new` (`src/app/api/leads/new/route.ts:346-375`), **só quando o lead tem DUE**, de forma síncrona e dentro da própria requisição do cadastro.

- O item é montado por `build-due-sharepoint-agendamento-fields.ts`:
  - `CLIENTE` é fixo e aponta para o **próprio escritório**;
  - `PROCESSO` = `"DUE DILIGENCE - {razões sociais}"`;
  - a data de envio é a data de entrega da due;
  - o campo de observação leva áreas, indicação, empresas, prazo e solicitante, além de um bloco de responsáveis **fixo no código**.
- O retorno fica em `lead_intakes.sharepoint_agendamento_{id,url,created_at,error}`. Não há coluna de status, não há nova tentativa e o item **não guarda o `oportunidade_id`**.
- O CRM nunca fica sabendo se a pasta foi aberta.
- A DUE ligada depois, o prazo alterado e o lead perdido não chegam ao SharePoint.
- O e-mail de novo lead (`lead-email-branded-template.ts:10-12, 55-68`) tem o botão "Solicitar abertura de pasta", que leva ao Power Apps.

### 1.2 O que a esteira produz no VIOS

Exemplo: pasta CI 61356, cliente CI 61067.

**Pessoa (cliente CI 61067)**

| Campo | Valor |
|---|---|
| Nome | o prospect (não o escritório) |
| Tipo | PF ou PJ |
| CPF/CNPJ | preenchido |
| Categoria | **Prospecção** |
| Grupo de pessoas | **Grupo prospect** (`clientes_grupos_id=10`) |

**Pasta de atendimento (CI 61356)**

| Campo | Valor |
|---|---|
| Escritório | BISMARCHI PIRES (`11`) |
| Departamento | **Comercial** (`9`) |
| Área | **Comercial** (`22`) |
| Projeto/Agrupador | **Due Diligence Prospect** (`8`) |
| Cliente | o prospect |
| Demais partes | as outras pessoas/empresas do grupo, como envolvidos |
| Responsável | Operações Legais |
| Valor | R$ 0,00 |
| Pasta, Pasta cliente, Objeto | vazios |

**Tarefas da pasta**

| Tipo | Descrição curta | Para conclusão / limite | Responsáveis |
|---|---|---|---|
| ENVIAR | ENVIAR DUE DILLIGENCE PROSPECT | data do cadastro | **uma tarefa por responsável de área** |
| PROTOCOLO | PROTOCOLO DUE DILLIGENCE PROSPECT | **data de entrega da due** | **todos** os responsáveis de área numa tarefa só |
| PROVIDÊNCIA | CIÊNCIA DA ABERTURA DE PASTA | data do cadastro | responsável da pasta. **O próprio VIOS cria ao abrir a pasta** (confirmado em 13/11/2026) |

A descrição das tarefas ENVIAR e PROTOCOLO segue este modelo:

```
Tipo de Lead: … / Indicação: … / Nome da Indicação: …
Detalhes da Due Diligence: Prazo de Entrega: DD/MM/AAAA às HH:MM; Áreas de Análise: …
Detalhes da Reunião: Local, Data, Horário
```

### 1.3 O que o RPA do SAMA faz e o que falta

**O que já faz:**

- Fila `public.vios_agendamentos` no Supabase do SAMA.
- Um pg_cron a cada 2 minutos chama a Edge Function `disparar-rpa`, que faz `POST /agendar` no container `sama-rpa` (Playwright, Easypanel).
- A linha passa por `pendente → enviado → processando → concluido | erro`, e o resultado é gravado em `resultado` (jsonb).
- **Agendar tarefa em pasta que já existe (`operacao='criar'`) funciona em produção.** Em pasta de atendimento, a pasta é localizada **pelo número**, na busca de `pastas.php`, e precisa ser o único resultado (`rpa.js:842-904`). O `ci_pasta` é ignorado.

**O que falta:**

- **Cadastrar pessoa no VIOS:** não existe. Hoje o RPA só busca por nome exato (`/api/juridico/clientescpfcnpj`).
- **Abrir pasta de atendimento:** não existe. O `abrir_pasta` atual é para processo judicial (exige CNJ) e **só simula** (`rpa.js:4681`).
- **Entrada:** só por `INSERT` direto com a `service_role` do SAMA, porque o RLS está ligado e não há policies. Não existe endpoint de entrada validado.
- **Retorno:** não há callback. Quem pede precisa ler a linha.
- **Idempotência:** nenhuma no VIOS. Reenviar duplica cliente, pasta e tarefas.

---

## 2. Decisões

As recomendações abaixo foram aprovadas em 12/11/2026. A D7 continua dependendo de verificação.

| # | Decisão | Definição |
|---|---|---|
| D1 | **Momento.** Continua no cadastro do lead com DUE, como hoje? | Sim. Também disparar quando a DUE for ligada depois (`patch-lead-detail.ts:380-405`); a chave idempotente impede duplicar. |
| D2 | **Quem é o cliente da pasta** quando o lead tem várias empresas/pessoas? | A 1ª de `empresas[]` é o cliente e as demais entram como envolvidos (tipo "Cliente"), como na pasta 61356. |
| D3 | **Responsável da pasta**: fixo ou configurável? | Configurável no admin do CRM, com padrão = responsável atual de Operações Legais. |
| D4 | **Regra das tarefas**: um ENVIAR por responsável de área (prazo = dia do cadastro) e um PROTOCOLO com todos (prazo = entrega da due)? | Sim. Os responsáveis passam a vir de `due_area_tasks.responsavel_app_user_id`, e não mais do bloco fixo no código. |
| D5 | **Entrada no SAMA**: CRM grava direto na tabela com a `service_role` do SAMA, ou passa por uma Edge Function dedicada? | **Edge Function `enfileirar-abertura`** com segredo próprio. Não compartilhar a chave mestra do SAMA com o CRM. |
| D6 | **Retorno ao CRM**: callback ou consulta periódica? | **Callback** (trigger no SAMA → endpoint do CRM com segredo), mais um botão "Atualizar status" e uma reconciliação diária como plano B. |
| D7 | **API oficial do VIOS** tem escrita (pessoa/pasta)? Se tiver, é mais robusta que automação de tela. | Verificar na Fase 0. Se não tiver, seguir com Playwright, que é o padrão do `sama-rpa`. |

---

## 3. Fluxo alvo

```
CRM POST /api/leads/new (lead com DUE)
  └─ cria linha em crm.vios_aberturas (status=pendente, chave = oportunidade_id)
  └─ POST SAMA /functions/v1/enfileirar-abertura   (Bearer CRM_SAMA_SECRET)
        └─ valida payload, deduplica pela chave, INSERT vios_agendamentos
           (operacao='abrir_atendimento') + N linhas 'criar' dependentes
  └─ responde 201 ao usuário (nunca bloqueia o cadastro)

pg_cron disparar-rpa (2 min) → sama-rpa
  1. abrir_atendimento:
       busca pessoa por CPF/CNPJ → se não existir, cadastra (Prospecção, Grupo prospect)
       busca pasta ativa do cliente com agrupador "Due Diligence Prospect" → se não existir, abre
       grava resultado {clientes_id, processos_id}
  2. linhas 'criar' liberadas pela RPC de reserva só quando a linha-mãe estiver concluída;
       recebem ci_pasta da mãe → agenda ENVIAR (n) e PROTOCOLO (1)

Trigger no SAMA (mudança de status da linha-mãe ou de todas as filhas)
  └─ POST CRM /api/integrations/vios-rpa/callback (x-vios-rpa-secret)
        └─ atualiza crm.vios_aberturas: status, vios_cliente_ci, vios_pasta_ci, tarefas[], erro
Ficha do lead: card "Abertura no VIOS" com status, links para pessoa/pasta/tarefas e "Reenviar"
```

### 3.1 Contrato do pedido (CRM → SAMA)

```jsonc
{
  "chave_idempotencia": "crm:abertura_due:<oportunidade_id>",
  "origem": "crm",
  "oportunidade_id": "<uuid>",
  "crm_url": "https://<app>/crm/leads/<id>",
  "modo": "simular | ativo",
  "cliente": {
    "tipo_pessoa": "PF | PJ", "cpf_cnpj": "…", "nome": "…",
    "email": "…", "telefone": "…",
    "categoria": "Prospecção", "grupo": "Grupo prospect"
  },
  "envolvidos": [{ "nome": "…", "cpf_cnpj": "…", "tipo_parte": "Cliente" }],
  "pasta": {
    "escritorio": "BISMARCHI PIRES SOCIEDADE DE ADVOGADOS",
    "departamento": "Comercial", "area": "Comercial",
    "agrupador": "Due Diligence Prospect",
    "responsavel": "<nome exato no VIOS>",
    "data_cadastro": "DD/MM/AAAA",
    "descricao": "<texto com link do CRM>"
  },
  "tarefas": [
    { "tarefa": "ENVIAR", "descricao_curta": "ENVIAR DUE DILLIGENCE PROSPECT",
      "observacao": "<modelo §1.2>", "data": "DD/MM/AAAA", "responsavel": ["<nome VIOS>"] },
    { "tarefa": "PROTOCOLO", "descricao_curta": "PROTOCOLO DUE DILLIGENCE PROSPECT",
      "observacao": "<modelo §1.2>", "data": "<entrega da due>", "responsavel": ["<todos>"] }
  ]
}
```

### 3.2 Retorno (callback e consulta)

```jsonc
{
  "chave_idempotencia": "…",
  "status": "pendente | processando | concluido | erro | parcial",
  "vios_cliente_ci": "61067",
  "vios_cliente_criado": true,
  "vios_pasta_ci": "61356",
  "tarefas": [{ "tarefa": "ENVIAR", "responsavel": "…", "ci_vios": "937995", "status": "concluido" }],
  "erro": null,
  "evidencias_url": "…",
  "atualizado_em": "…"
}
```

**URLs montadas no CRM:**

| Item | URL |
|---|---|
| Pessoa | `https://bp.vios.com.br/index.php?pag=sys/clientes/clientes-vis.php&clientes_id={ci}` |
| Pasta | `…pag=sys/processos/pastas-vis.php&processos_id={ci}` |
| Tarefa | `…pag=sys/processos/pxe.php&pxe_id={ci}` |

---

## 4. Plano por fases

### Fase 0: Preparação (sem código em produção)

- [ ] `git pull` em `C:\SAMA\SAMA\sama-rpa`: a cópia local está 33 commits atrás, e `abrir-pasta.js`, `memoria.js` e as migrações 0012 a 0016 só existem em `origin/main`. Decidir o destino da branch `feat/catalogo-pelo-orquestra`.
- [x] Fechar as decisões D1 a D7 com o time (12/11/2026).
- [ ] D7: pedir ao suporte do VIOS se há endpoints de escrita para pessoa, pasta de atendimento e tarefa. Ver os achados abaixo.
- [x] Confirmar no VIOS (conferido em 12/11/2026):
  - **categoria "Prospecção":** é o id `23` (diferente de "Prospect", `2`);
  - **"Grupo de pessoas":** fica em Configurações da pessoa (`clientes_parm.php`), no campo `form[clientes_grupos_id]`; "Grupo prospect" é o `10`;
  - **"CIÊNCIA DA ABERTURA DE PASTA":** é um tipo de tarefa comum (PROVIDÊNCIA). ~~Nada indica que o VIOS a crie sozinho.~~ O teste gravando de 13/11/2026 mostrou que **o VIOS cria sozinho** ao abrir a pasta, e recusa uma segunda.
- [x] ~~**Pergunta em aberto:**~~ Respondida em 13/11/2026: o VIOS cria a ciência sozinho; o pedido do CRM não a leva. A pergunta era: a abertura deve agendar também a "CIÊNCIA DA ABERTURA DE PASTA" para o responsável da pasta, como fazia a central? Se sim, ela entra como uma terceira tarefa no pedido do CRM.
- [ ] Descobrir quem processa a lista do SharePoint hoje. Nenhum fluxo do n8n lê a lista, então é Power Automate ou a equipe da central de agendamentos.
- [ ] Confirmar se o formulário antigo ainda chama o webhook `cadastro-lead` do n8n. Ver os achados abaixo.
- [ ] Levantar o de-para dos usuários do CRM (responsáveis de área da DUE) para o **nome exato no VIOS**, conferido no catálogo `vios_catalogo_tarefas` do SAMA.

#### Achados da Fase 0 (12/11/2026)

- **n8n, fluxo "CRM RD" (ativo):** um segundo caminho também grava na mesma lista "AGENDAMENTOS / REAGENDAMENTOS". O caminho é:

  `webhook cadastro-lead` → "Com Due Dilligence?" → "Cria negociação" (RD Station) → nó SharePoint "CRIAR DUE NA CENTRAL DE AGENDAMENTOS"

  Ele vem da época do formulário antigo com RD Station. Na virada, **desligar esse ramo** junto com o do CRM, ou a pasta pode ser pedida em dobro.
- **Os responsáveis fixos no código do CRM estão desatualizados.** O bloco de responsáveis do fluxo n8n bate com as tarefas reais da pasta 61356:
  - Cível: Giovani;
  - Rec. Créd.: Renato;
  - Trabalhista: Caroline e Daniel;
  - Tributário: Francisco;
  - Insolvência: Lucas.

  O texto fixo no CRM (`build-due-sharepoint-agendamento-fields.ts`) traz outros nomes. Isso reforça a D4: os responsáveis devem vir de `due_area_tasks`.
- **Ninguém no n8n lê a lista.** O único fluxo que mexe nela é "APAGAR ITENS SHAREPOINT", que está inativo. Não deu para confirmar se algum fluxo chama `POST /api/integrations/sharepoint/agendamentos`: a maior parte dos fluxos não está liberada para leitura pelo MCP do n8n.
- **D7, API do VIOS:** a única API em uso é um endpoint feito sob medida para a BP, `GET /api/integracoes/bp/tarefas`, só de leitura, com o JWT em `Authorization-Vios` (`C:\SAMA\SAMA\src\lib\vios.ts:106-124`). Não há documentação de escrita nos repositórios. Até o VIOS responder, o caminho é Playwright, o padrão do `sama-rpa`.

### Fase 1: SAMA / `sama-rpa`

Tudo nasce em `simular` e só grava no VIOS quando a linha vier com `modo=ativo`.

> **Andamento em 12/11/2026:** o código entrou no `main` do `sama-rpa` pelo PR #50 (merge `f85b75f`). A migração
> `20261112000018` foi aplicada no Supabase do SAMA (as 3 funções `vios_aberturas_*` existem).
> Em 13/11/2026:
> - **Segredo:** `CRM_SAMA_SECRET` cadastrado.
> - **Edge Functions publicadas:** `enfileirar-abertura` v1 e `disparar-rpa` v14, ambas com `verify_jwt=false`, como antes. As duas recusam chamadas sem segredo.
> - **Contêiner:** atualizado no Easypanel às 15:33 UTC. A rota `/abrir-atendimento` existe e responde 401 sem segredo.
>
> **Teste de ponta a ponta em simulação: OK** (13/11/2026, 15:52 → 15:56 UTC, chave `crm:teste_e2e:20261113-01`).
> O pedido entrou pela `enfileirar-abertura` e passou pela fila e pelo cron até o robô no VIOS. Usamos o prospect da
> pasta 61356 e o robô:
> - achou a pessoa (CI 61067) já no "Grupo prospect";
> - reaproveitou a pasta ativa 61356;
> - deu os 2 envolvidos como já presentes nas partes;
> - abriu a pasta pelo CI e simulou ENVIAR (etapa 708, etiqueta 1) e Protocolo (etapa 595, etiqueta 3), com datas e
>   responsáveis. Não clicou em Gravar.
>
> O callback para o CRM não foi testado: o segredo do Vault ainda não está configurado, porque a rota de callback é da
> Fase 2. **Fase 1 concluída** no escopo de simulação. Gravar no VIOS de verdade fica para antes da virada.
>
> **O que já existe:**
> - migração `20261112000018_vios_abertura_atendimento.sql`: colunas, `vios_aberturas_enfileirar`,
>   `vios_aberturas_resumo`, reserva com dependência e trigger de callback;
> - Edge Function `enfileirar-abertura`, com validação e testes;
> - rota `POST /abrir-atendimento` e `executarAbrirAtendimento`, só em simulação;
> - `abrir_por_ci` nas tarefas;
> - testes: 67 passando no `npm test`, e a validação da Edge Function à parte.
>
> **Mudanças em relação ao plano:**
> - a entrada grava por uma RPC atômica, e não por `INSERT` direto da Edge Function;
> - a reserva copia o CI da pasta para as tarefas;
> - em vez de `ci_pasta` valer sempre em Atendimento, só as tarefas da abertura (`abrir_por_ci`) abrem a pasta pelo
>   CI. As linhas do SAMA continuam como antes.
>
> **Mapeamento do VIOS concluído em 12/11/2026:**
> - **Validação:** é a do próprio VIOS (`VerificaFormCadastroPessoa` e `VerificaForm` da pasta).
> - **Grupo da pessoa:** fica em Configurações.
> - **Demais envolvidos:** entram depois, em Partes (`pastas-partes.php`), como "Cliente". Cada um precisa existir como
>   pessoa, como as 5 pessoas da pasta 61356.
> - **Teste na tela real, sem gravar:** o preenchimento dos cadastros de pasta e de pessoa passou na validação do VIOS.
>
> **Próximos passos:** a abertura de verdade (Gravar, cadastro dos envolvidos, inclusão em Partes e grupo) e um teste
> de simulação com o robô no ar.

- [ ] **Entrada:** Edge Function `enfileirar-abertura`.
  - Autenticação por Bearer `CRM_SAMA_SECRET`.
  - Validação com zod do contrato §3.1.
  - Deduplicação por `chave_idempotencia` (índice único novo em `vios_agendamentos`).
  - `INSERT` da linha-mãe e das filhas.
  - Também expõe `GET ?chave=…` para consulta de status.
- [ ] **Migração:** colunas `chave_idempotencia` (unique), `depende_de` (FK para a própria tabela) e `origem_sistema`. Novo valor `abrir_atendimento` em `operacao`.
- [ ] **RPC `vios_agendamentos_reservar`:** só libera uma linha `criar` com `depende_de` quando a mãe estiver `concluido`, copiando `resultado.processos_id` para `ci_pasta`. Se a mãe der erro, as filhas vão para `erro`.
- [ ] **`criar` em pasta de Atendimento aceita `ci_pasta`:** abre direto `pastas-vis.php&processos_id=` em vez de buscar pelo número (`rpa.js:76-81, 842-904`). Isso tira a dependência de a busca devolver um único resultado.
- [ ] **Operação nova `abrir_atendimento`**, em `abrir-atendimento.js` + `rpa.js`, com rota `POST /abrir-atendimento` ou o roteamento atual por `operacao`:
  - [ ] Buscar a pessoa por **CPF/CNPJ**, não por nome (`/api/juridico/clientescpfcnpj?term=<doc>`). Se encontrar exatamente uma, usar o `clientes_id`.
  - [ ] Se não encontrar, cadastrar em `clientes.php&act=insert`: tipo de pessoa, CPF/CNPJ, nome, e-mail, telefone, categoria Prospecção e grupo prospect. Gravar e capturar o `clientes_id`.
  - [ ] Idempotência da pasta: antes de abrir, procurar pasta **ativa** do cliente com agrupador "Due Diligence Prospect" e reaproveitá-la.
  - [ ] Abrir em `pastas.php&clientes_id={ci}&act=insert`: escritório, departamento, área, agrupador, envolvidos, responsável, descrição e data. Gravar e capturar o `processos_id`.
  - [ ] Resultado: `{clientes_id, cliente_criado, processos_id, pasta_reaproveitada, avisos, evidencias}`.
- [ ] **Callback:** trigger `AFTER UPDATE OF status` com `pg_net`. Quando a linha-mãe ou a última filha chegar a um estado final, faz `POST` no CRM com o retorno §3.2. A URL e o segredo ficam no Vault (`crm_callback_url`, `crm_callback_secret`).
- [ ] Testes: unitários dos validadores e um teste de simulação no VIOS real (sem Gravar) com um lead fictício.
- [ ] Deploy no Easypanel. É manual: depois do push, clicar em "Implantar".

### Fase 2: CRM

Tudo atrás de `VIOS_ABERTURA_MODO = desligado | simular | ativo`. O padrão é `desligado`.

> **Decisão de 13/11/2026: o CRM não recebe nada de volta.** O CRM só manda o pedido. A pessoa, a pasta, as tarefas
> e os erros ficam no SAMA. Com isso saíram da Fase 2:
> - a tabela `vios_aberturas`;
> - o callback;
> - o reenviar e o atualizar;
> - a reconciliação;
> - o cartão "Abertura no VIOS" na ficha;
> - a aba do admin.
>
> O trigger de callback do SAMA fica inerte, porque `crm_callback_url` não foi cadastrada no Vault.
>
> **Andamento em 13/11/2026, código local, sem commit:**
> - **Montagem do pedido:** `build-vios-abertura-payload.ts`, que monta o contrato §3.1.
> - **Envio:** `solicitar-abertura-vios.ts` lê o lead no banco, resolve os responsáveis e envia. Nunca lança erro.
> - **Cliente HTTP:** `sama-rpa-client.ts`.
> - **Onde dispara:**
>   - `POST /api/leads/new`;
>   - `PATCH /api/crm/leads/[id]`, quando a DUE é ligada depois ou a data de entrega é preenchida, com `after()`.
> - **Testes:** 1445 passando, mais `tsc` e lint.
> - **Ensaio com um lead real:** montou o pedido sem enviar.
> - **Documentação:** `system-context.md` §14.14 e `change-log.md`.
>
> **Mudanças em relação ao plano:**
> - **De-para de usuários:** não há coluna nova. O nome no VIOS é o nome completo do RH espelhado no CRM
>   (`orqestrai_colaboradores`), casado pelo e-mail de login. Conferido para os 14 usuários com área: todos batem com o
>   catálogo do VIOS.
> - **Configuração da abertura:** não foi para o admin.
>   - O responsável da pasta é a variável `VIOS_ABERTURA_RESPONSAVEL_PASTA` (padrão "Ligia Gilberti Lopes", responsável da
>     pasta 61356).
>   - Os demais valores (escritório, departamento, área, agrupador, categoria, grupo, etapas e etiquetas) são constantes em
>     `VIOS_ABERTURA_PADRAO` e `VIOS_TAREFAS`.
> - **Ciência da abertura (revisto no mesmo dia):** saiu do pedido, porque o VIOS a cria ao abrir a pasta. Antes: a "CIÊNCIA DA ABERTURA DE PASTA" (etapa 496, etiqueta PROVIDÊNCIA 204) entrava como 3ª tarefa,
>   para o responsável da pasta, como a central fazia na pasta 61356.
> - **Modo `simular`:** o SharePoint continua e a falha do robô não aparece na tela.
> - **Modo `ativo`:** o SharePoint para e a falha de envio vira aviso no cadastro.
> - **Ficam para a virada (Fase 4):**
>   - o e-mail de novo lead, que ainda tem o botão do Power Apps;
>   - o diálogo de confirmação do formulário.

- [ ] Atualizar `docs/system-context.md` antes da primeira mudança de comportamento.
- [ ] **Migration** `crm.vios_aberturas`:

  | Coluna | Detalhe |
  |---|---|
  | `id` | — |
  | `oportunidade_id` | unique |
  | `chave_idempotencia` | — |
  | `modo` | — |
  | `status` | `pendente / enviado / processando / concluido / parcial / erro` |
  | `payload` | jsonb |
  | `resultado` | jsonb |
  | `vios_cliente_ci` | — |
  | `vios_pasta_ci` | — |
  | `erro` | — |
  | `tentativas_envio` | — |
  | `enviado_em`, `concluido_em`, `created_at`, `updated_at` | — |

  RLS igual à de `lead_intakes`.
- [ ] **De-para de usuários:** coluna `vios_usuario_nome` na tabela de usuários do CRM (a referenciada por `due_area_tasks.responsavel_app_user_id`), editável no admin.
- [ ] **Configuração da abertura** no admin: responsável da pasta, departamento, área, agrupador, categoria, grupo e nomes dos tipos de tarefa. Fica numa tabela singleton ou em `app_settings`, se já existir.
- [ ] **Serviço** `src/modules/crm/application/services/build-vios-abertura-payload.ts`, que substitui `build-due-sharepoint-agendamento-fields.ts`:
  - monta o contrato §3.1 a partir de `lead_intakes`, `empresas[]`, `due_area_tasks` e da configuração;
  - falha de forma explícita se algum responsável não tiver `vios_usuario_nome`.
- [ ] **Cliente HTTP** `src/modules/crm/infrastructure/integrations/sama-rpa-client.ts`:
  - `enfileirar(payload)` e `consultar(chave)`;
  - usa `fetchWithTimeout`, as variáveis `SAMA_RPA_ENQUEUE_URL` e `CRM_SAMA_SECRET`, e `IntegrationError("vios_rpa", …)`.
- [ ] **`POST /api/leads/new`:** trocar o bloco `route.ts:346-375` por:
  1. criar a linha em `vios_aberturas`;
  2. chamar `enfileirar`;
  3. em caso de falha, gravar o erro e devolver `warning`, sem bloquear o cadastro.

  Enquanto o modo for `desligado`, o SharePoint continua como está.
- [ ] **DUE ligada depois** (D1): chamar o mesmo serviço em `patch-lead-detail.ts`.
- [ ] **Callback** `POST /api/integrations/vios-rpa/callback`:
  - valida o segredo com `verifySharedSecret` (o mesmo padrão da rota do SharePoint);
  - é idempotente: ignora um retorno mais velho que `updated_at`.
- [ ] **Reenviar e atualizar:** `POST /api/crm/leads/[id]/vios-abertura` com as ações `reenviar` e `atualizar`.
  - Reenviar só é permitido em `erro`. Usa a mesma chave, e o SAMA reaproveita o cliente e a pasta que já existirem.
  - Permissão: admin ou Operações Legais.
- [ ] **Reconciliação:** cron diário em `vercel.json` (`/api/cron/vios-aberturas-reconcile`) que consulta as aberturas presas há mais de 30 minutos.
- [ ] **Ficha do lead:** em `lead-detail-overview.tsx:654-723`, `IntegrationSummary` vira o card "Abertura no VIOS", com status, links para pessoa, pasta e tarefas, erro e os botões. Também corrigir o bug de campos de integração aparecendo como editáveis (`patch-lead-detail.ts:862`).
- [ ] **Admin:** em `integracoes-admin-tabs.tsx` e `admin/integracoes/page.tsx:77`, a aba "SharePoint" vira "VIOS (RPA)", com:
  - teste de conexão com a Edge Function;
  - configuração da abertura;
  - de-para de usuários, com alerta para nome sem correspondência no catálogo.
- [ ] **Textos:**
  - diálogo de confirmação em `new-demand-form.tsx:2441-2444`;
  - e-mail de novo lead (`lead-email-branded-template.ts:10-12, 55-68`): trocar o botão do Power Apps por "Abertura no VIOS automática, acompanhe na ficha do lead";
  - revisar HTML personalizado gravado em `lead_email_notification_template`.
- [ ] **Testes** (Vitest):
  - builder do payload (substitui o teste do builder do SharePoint);
  - `route-whatsapp.test.ts` (trocar os mocks do SharePoint);
  - rota do callback (segredo, idempotência, retorno velho);
  - `lead-detail-overview.test.ts` e `lead-intake-to-fields.test.ts`.
- [ ] `npm run lint`, `npm run test` e `npm run build`.

### Virada antecipada (13/11/2026)

> **Mudança de rumo:** este CRM ainda está em desenvolvimento e a lista do SharePoint era do **CRM antigo**. Por
> isso as Fases 3 a 5 foram encurtadas, a pedido do usuário. O cadastro deixou de gravar no SharePoint e a produção
> do CRM foi para `VIOS_ABERTURA_MODO=ativo`. O que o robô cria nos testes é apagado à mão no VIOS. O n8n não foi
> mexido.
>
> - **Robô (sama-rpa #52, `c447251`):** grava pessoa, grupo, pasta e envolvidos, conferindo cada passo relendo o
>   VIOS. Implantado no Easypanel às 20:09 UTC, com a fila livre.
> - **CRM (#31):** cadastro sem SharePoint e e-mail sem o botão do Power Apps. Na Vercel, `ativo` e republicado.
> - **Teste gravando** (chave `crm:teste_ativo:20261113201333`, prospect e envolvido fictícios, 20:14 → 20:28 UTC):
>   - pessoa nova CI 61132, posta no Grupo prospect;
>   - envolvido novo CI 61133, incluído em Partes;
>   - pasta nova CI 61484;
>   - ENVIAR CI 941487 e Protocolo CI 941485.
>
>   A ciência que o CRM mandava foi recusada ("Já existe outra tarefa cadastrada no processo para este mesmo
>   tipo"), porque o VIOS já a tinha criado. Ela saiu do pedido. **A apagar no VIOS:** pessoas 61132 e 61133, a
>   pasta 61484 e as tarefas dela.
> - **Ainda vale das fases seguintes:**
>   - acompanhar os primeiros leads reais;
>   - a limpeza do código do SharePoint (Fase 5).

### Fase 3: Execução em paralelo (simulação)

- [ ] Deploy do CRM com `VIOS_ABERTURA_MODO=simular`. O SharePoint **continua ativo**, e a esteira atual segue abrindo as pastas.
- [ ] Para cada lead com DUE, comparar o que o RPA *teria* preenchido (`resultado.preenchidos`, `nao_encontrados`) com a pasta que a esteira abriu de verdade.
- [ ] Critério de saída: 10 leads seguidos sem divergência e sem `nao_encontrados`.

### Fase 4: Virada

- [ ] Combinar a data com a equipe que opera a lista do SharePoint.
- [ ] Mudar para `VIOS_ABERTURA_MODO=ativo` e, **no mesmo deploy**, parar de gravar no SharePoint (remover o bloco ou desligar por flag).
- [ ] Desligar no n8n o ramo `cadastro-lead` → "CRIAR DUE NA CENTRAL DE AGENDAMENTOS" do fluxo "CRM RD".
- [ ] Combinar com quem processa a lista que nenhum item novo deve chegar a partir da data da virada. Os itens já pendentes são concluídos pela esteira antiga.
- [ ] Acompanhar os primeiros 5 leads reais no VIOS (pessoa, pasta e tarefas) e as aberturas em `erro` no admin.
- [ ] Plano de volta: `VIOS_ABERTURA_MODO=desligado` reativa o caminho do SharePoint, enquanto a Fase 5 não tiver rodado.

### Fase 5: Limpeza (2 a 4 semanas depois da virada)

- [ ] **Remover:**
  - `sharepoint-graph.ts`;
  - `build-due-sharepoint-agendamento-fields.ts` e o teste;
  - `api/integrations/sharepoint/agendamentos/` (rota e teste), depois de confirmar na Fase 0 que ninguém a chama;
  - `api/admin/sharepoint-config/route.ts`;
  - `sharepoint-config-panel.tsx`.
- [ ] Remover `"sharepoint"` de `IntegrationName` (`api-errors.ts:15`). Ajustar `lead-intake-to-fields.ts:109-121`.
- [ ] Migration para arquivar e remover `lead_intakes.sharepoint_agendamento_*`: copiar para `vios_aberturas.resultado.legado_sharepoint` antes de remover. Regenerar `database.types.ts`.
- [ ] **Variáveis de ambiente:**
  - remover `SHAREPOINT_SITE_ID`, `SHAREPOINT_AGENDAMENTOS_LIST_ID` e `SHAREPOINT_INTEGRATION_SECRET` (`.env.example`, Vercel e `.env.local`);
  - **manter** `MICROSOFT_TENANT_ID`, `SHAREPOINT_CLIENT_ID` e `SHAREPOINT_CLIENT_SECRET`, que também são usadas pelo e-mail Outlook/Graph.
- [ ] Retirar `Sites.ReadWrite.All` do app no Azure, se o e-mail não precisar dela.
- [ ] Atualizar a documentação:
  - `docs/SISTEMA-TECNICO-COMPLETO.md` (l.109, 148, 287, 504-510, 672-674, 914, 934, 959, 1083, 1102, 1217-1224);
  - `docs/system-context.md` (l.557-558, 636, 669);
  - `docs/change-log.md`.
- [ ] **Manter**: estes usam o nome SharePoint, mas não fazem parte do agendamento:
  - links de proposta e contrato da migração RD (`rd-migration/*`, `workflow-transition-evidence.ts:220`);
  - `lead-rd-field-labels.ts`;
  - `contratos.sharepoint_referencia` e `sharepoint_url`.

### Fase 6: Depois (fora do escopo desta troca)

- Propagar mudanças: prazo da DUE alterado vira `prorrogar` no PROTOCOLO, e lead perdido ou excluído vira `cancelar` das tarefas abertas. As duas operações já existem no RPA.
- Ligar `vios_aberturas.vios_cliente_ci` ao onboarding pós-venda (`lead_client_onboarding.vios_referencia`): a pessoa já existe no VIOS como prospect, e Operações Legais só a atualiza para cliente.

---

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| RPA é ponto único de falha: um container, fila em memória, quedas por falta de memória em 10 e 11/11, certificado do VIOS vencido | O cadastro no CRM nunca depende do RPA. Status visível, "Reenviar" e reconciliação diária. Alerta no admin para abertura em `erro` ou presa. |
| Duplicar pessoa, pasta ou tarefas no VIOS ao reenviar | Chave idempotente na entrada. Busca de pessoa por CPF/CNPJ e reaproveitamento de pasta ativa do mesmo agrupador. Filhas só rodam depois de a mãe concluir. |
| Responsáveis comparados por nome | De-para explícito no CRM, validado contra o catálogo do SAMA. O payload é recusado antes de enviar se faltar um nome. |
| Mudança de tela do VIOS quebra os seletores | Fase 3 em simulação. Evidências (print e HTML) nos erros. D7: preferir a API se ela tiver escrita. |
| Tempo limite de 180 s por job | Abertura e tarefas em jobs separados (mãe e filhas), em vez de um job único longo. |
| Acoplamento entre bancos e chave mestra | O CRM só conhece a URL da Edge Function e um segredo próprio. O SAMA só conhece a URL de callback e outro segredo. |
| Cópias locais desatualizadas, deploy manual | Fase 0 (pull) e checklist de deploy no Easypanel. |
| Segredos em disco no SAMA (`sama-rpa/.env.graph` com o segredo do app Graph em texto puro) | Apagar o arquivo, como ele próprio pede, e rotacionar o segredo se ele já tiver circulado. |

## 6. Referências

**CRM (mapeamento completo):**
- `src/app/api/leads/new/route.ts:31-49, 346-375`
- `src/modules/crm/application/services/build-due-sharepoint-agendamento-fields.ts:41-91`
- `src/app/(crm)/crm/leads/[id]/lead-detail-overview.tsx:654-723`
- `src/lib/crm/due-area-tasks.ts:297-349`

**SAMA:**
- `sama-rpa/index.js:378-461` (`/agendar` e validação)
- `sama-rpa/rpa.js:33-125, 842-904, 1063-1468` (agendamento)
- `sama-rpa/rpa.js:4677-4746` e `abrir-pasta.js` (abertura de processo, só simulação)
- `sama-rpa/supabase/functions/disparar-rpa/index.ts`
- migração `20261110000015_vios_abrir_pasta.sql` (RPC de reserva)
- `src/lib/vios-fila.ts:62-101` (exemplo de quem enfileira)

**VIOS:**

| Tela | URL |
|---|---|
| Pessoa | `clientes.php&act=insert` |
| Pasta de atendimento | `pastas.php&clientes_id={ci}&act=insert` |
| Tarefa | `pxe.php&processos_id={ci}&act=insert` |
| Exemplos | pasta `pastas-vis.php&processos_id=61356`, pessoa `clientes-vis.php&clientes_id=61067` |
