# CRM change log técnico

Formato: data (ISO) | onda | resumo | validações.

## 2026-10-22 — Ajustes da varredura depois do 4º teste

- Reunião Kick-off passa a pedir data, horário, local ou link, participantes e observações (opcional) na transição: o pós-venda continua sem campos configuráveis no modal, com exceção dessa etapa (`stageUsesTransitionFields` em `compute-transition-requirements.ts`, usado em `transition-requirements` e `transition`). Os valores ficam em `field_values` da negociação e aparecem na ficha; o admin edita os campos em Admin → Campos → Pós-venda. Migration de dados `20261022160000_reuniao_kickoff_campos.sql` (5 campos, `on conflict do nothing`; aplicada no remoto em 22/10/2026).
- Campos de R$ no mesmo padrão: o passivo e os demais valores da Reestruturação (apresentação da DUE) passaram a encher pelos centavos como a proposta e o contrato (`maskBrlCurrencyFromInput`); antes aceitavam texto livre e só convertiam ao sair do campo.
- Aba Renovações do hub de contratos: uma requisição só (`GET /api/crm/contracts/renewals`, contratos ativos, capability `view`) no lugar de uma por contrato (27 requisições e 54 consultas, contando rascunhos). O `GET` por contrato em `[id]/renewals/[alertId]` saiu (sem uso); o `PATCH` não mudou.
- WhatsApp "Novo lead com Due Diligence": tipo de lead pelo rótulo ("Indicação", não "Indicacao"), Due Diligence "Não", horários sem segundos e as linhas que faltavam de Plataforma (Lead Digital) e Área do Cross-selling (`build-due-whatsapp-message.ts`). O e-mail do novo lead ganhou o mesmo rótulo e passou a mostrar datas em dd/mm/aaaa e horários em hh:mm (`lead-email-template-vars.ts`).
- WhatsApp da revisão da DUE: área que pede ajuste depois que a mensagem "Ajustes pedidos" do ciclo já saiu gera um complemento (modelo editável novo `due_revisao_ajuste_adicional`, "Ajuste a mais na revisão"; no máximo um por área e ciclo; `decideAjusteAdicional` em `due-messages.ts`). Envio que falhou deixa de travar a idempotência: o mesmo evento tenta de novo (atualização condicional, uma tentativa por vez), e erro de rede ou 5xx tem uma nova tentativa imediata (tempo esgotado e 4xx não repetem). Vale para a DUE e para o grupo do escopo da proposta (`send-log.ts`, `proposta-escopo-notify-channels.ts`). Sem migration (a tabela de modelos não restringe chaves).
- `POST /api/leads/new` confere o dígito do CPF/CNPJ de cada empresa e devolve 400 antes de gravar ("CNPJ inválido em "…" (…): o dígito verificador não confere."), como a tela já fazia (`invalidCompanyDocumentMessage` em `new-lead-payload.ts`).
- Due diligence (`/crm/due-diligence`): "Exibindo 4 negociações" (era "negociaçãoões") e datas sem segundos na página, nos modelos e na linha do tempo (também na ficha do lead).
- Assinar contratos: nome do documento sem a extensão que a D4Sign grava sem ponto ("… LUCIANO pdf"; `documentDisplayName`, também no painel técnico D4Sign); cliente pela oportunidade, pela pasta, pelo nome do arquivo ("CONTRATO DE HONORÁRIOS <cliente>", `clientFromDocumentName`) ou pelo primeiro signatário que não é sócio, contratada nem testemunha; sem nenhum, "Cliente não identificado".
- Painel `/crm`: o aviso "Can't perform a React state update on a component that hasn't mounted yet" vinha da recompilação do servidor de desenvolvimento (não reaparece com a página já compilada); nada mudou no código. O único formulário público (`/preencher/carteira/[token]`) não tem CPF/CNPJ, telefone, CEP nem data.
- Carteira de clientes (`/crm/clientes`): os captadores por grupo (`grupo-captador.ts`) liam clientes, intakes e oportunidades em sequência e em lotes; agora leem em paralelo, uma vez, e paginam (o banco devolve até 1000 linhas e já há 895 clientes com grupo). Dados da página de ~446 ms para ~190 ms; o "mais de 1 minuto" do teste era compilação do servidor de desenvolvimento.

## 2026-10-22 — Depois do 4º teste: rótulos sem siglas, pendências menores e visão do Financeiro

- Rótulos dos campos sem as siglas do RD ("(DD)", "[CP]", "[CC]", "[CA]", "[CE]", "[FINANCEIRO]", "[CADASTRO]", "(JSON)") e com acento (Reunião, Horário, Início, Vigência…): `userFacingFieldLabel` (`src/lib/crm/user-facing-field-label.ts`) passou a cobrir esses casos e é usado também em Admin → Campos (lista e exclusão; a edição grava o texto digitado), no kanban, no montador do contrato, na migração do RD e no bloco da reunião. Migration de dados `20261022140000_field_definitions_labels_sem_siglas.sql` (134 rótulos, cada um protegido pelo texto antigo; aplicada no remoto em 22/10/2026).
- Etapa da ficha atualiza logo depois de enviar, devolver ou concluir o cadastro: os avisos (sino e e-mail) passaram a rodar depois da resposta (`notifyAfterResponse` em `client-onboarding/service.ts`).
- Acessibilidade: nome nos interruptores do checklist de Operações Legais e da condição do 1º faturamento, nas caixas de área do Novo lead (`TagSelectable.ariaLabel`) e rótulos ligados aos campos do investimento da proposta.
- Cadastro do cliente: CPF/CNPJ com dígito errado mostra "CPF inválido: confira os dígitos." (sem bloquear o envio).
- Escopo da proposta: depois de "Salvar esta área" o modal mostra quem preencheu e quando; datas sem segundos. Prazo da revisão do contrato sai "24/10/2026 · 2d restantes".
- Carteira de clientes: cabeçalho e indicadores sem nomes de tabela/coluna ("email_client_groups", "gestor_atividade").
- Acentos quebrados no banco: as funções `save_contract_configuration_atomic` e `create_contract_closing_revision` foram coladas no SQL Editor em 21/10 com a codificação errada e gravavam eventos como "Configura√ß√£o contratual salva". Migration `20261022150000_contract_functions_utf8.sql` recria as duas a partir de `20261018130000` (corpo conferido igual ao do banco, fora os acentos), refaz 5 comentários de coluna e corrige os 4 eventos gravados (aplicada no remoto em 22/10/2026).
- Visão do Financeiro (contratos): referência anual cai para mensal projetado × 12 quando não há valor gravado (nenhum contrato tinha `valor_anual_referencia`; o detalhe mostrava "—"), em `portfolio-annual-reference.ts`; aba Configuração de versão ativa fica somente leitura com aviso (a página mandava sempre "rascunho"); status com rótulo (`contract-status-labels.ts`: "Em revisão", "Ativo", "Assinado"…); competência do fechamento em mm/aaaa (`competency-month.ts`); "Carregando fechamentos…"; seções vazias com texto; carteira sem nome repetido (grupo igual ao cliente e partes iguais, como matriz e filial); KPIs do hub sem valor cortado; aba Fechamentos do hub com a última competência, o status e "Abrir fechamentos". Para o Financeiro (sem `approve_closing`/`manage_renewal`): "Aguardando aprovação da controladoria." no fechamento e Renovações somente leitura; justificativa por bloqueio e botões travados durante a ação.
- Dados: Renato Vallim passou para a área Recuperação de Créditos em `app_users` (a área estava sem responsável; o Trabalhista segue com Daniel Pressatto).

## 2026-10-22 — 4º teste ponta a ponta (LE BLOG de novo, com WhatsApp real): máscaras, datas e mensagens

- WhatsApp em teste: `WHATSAPP_REDIRECT_TO` (`applyWhatsappRedirect` em `evolution-whatsapp.ts`, usado também no envio ao grupo do escopo) manda todo envio a um número só, com o destino original na 1ª linha. O conector passou a codificar o nome da instância na URL (a de produção tem espaço: "COMERCIAL BP").
- Mensagens de WhatsApp consolidadas e editáveis (`src/lib/crm/whatsapp/`): 6 modelos (novo lead com DUE, levantamento concluído, DUE em revisão, revisão aprovada, ajustes pedidos, escopo da proposta), uma mensagem por ciclo em vez de uma por área, resultado da revisão só quando o ciclo fecha, escopo numa mensagem por pedido. Envio registrado em `lead_activity_events` (kind `whatsapp_enviado`) para não repetir. Tela em Integrações → WhatsApp → "Mensagens do WhatsApp". Migration `20261022130000_whatsapp_message_templates.sql` (aplicada no remoto em 22/10/2026).
- Área da DUE sem responsável (ninguém com `app_users.area`): avisa o responsável do lead no sino e por e-mail (`due_area_sem_responsavel`) e a mensagem de revisão diz qual área precisa de responsável. Antes a tarefa nascia sem aviso para ninguém.
- Máscaras e datas (auditoria em todos os formulários): `DateInputBr` e `TimeInputBr` digitáveis, com "Data inválida"/"Horário inválido" e `onInvalidChange`; CPF/CNPJ com dígito conferido no Novo lead e no bloco de empresa; telefone, CEP (com busca), UF, percentuais e R$ mascarados no cadastro do cliente, na proposta, no bloco da reunião, na apresentação da DUE e no fechamento mensal.
- Levantamento da DUE: o card da área mostra a planilha já gravada (sumia ao recarregar) e o botão de marcar como entregue; prazos sem segundos (`formatDateTimeMinutesBr`).
- Proposta: percentual de êxito só aceita número (o modelo já põe o "%"); com a tributação escolhida e modelo sem a frase dos tributos, sai "Os valores acima (não) incluem os tributos incidentes." (`applyTributacaoPhrase`).
- Cadastro do cliente: CEP pré-preenchido já sai com máscara.
- Conferido de novo no navegador (teste 4): todas as correções do teste 3, do nome de arquivo com acento à ativação do contrato sem conflito.
- Validações: `npx vitest run` (1283 testes), `npx tsc --noEmit` sem erro em `src/`, eslint nos arquivos alterados (só 2 avisos antigos em `new-demand-form.tsx`).

## 2026-10-22 — 3º teste ponta a ponta (LE BLOG, com DUE): correções do funil inteiro

- Contrato com duas contratantes saía "a CONTRATANTES prestará": cláusulas aceitam `{singular|plural}` (`resolvePartyAlternatives`), `[A_CONTRATANTE]` em início de frase sai com maiúscula e `[À_CONTRATANTE]` vira "à/às". Código corrigido; as cópias do banco mudam com a migration `20261022120000_contract_clause_party_grammar.sql` (aplicada no remoto em 22/10/2026 pela Management API, registrada em `schema_migrations`). Página de assinaturas lista cada contratante com o documento.
- Contratante com endereço próprio (`cp_proposta_empresas_json.enderecos`, botão "Endereço próprio" com busca de CEP): entra na qualificação e nas partes do contrato. Antes todas herdavam a sede da principal.
- Montador do contrato: o salvar parcial gravava o prazo e não criava a tarefa de revisão; agora decide a tarefa e confere o objeto antes de gravar.
- DUE: aprovação por ciclo (`isDueReviewApprovedForCycle`) e ajuste leva áreas `pendente` ao novo ciclo; concluir ajustes aceita o PPT já anexado depois do pedido (a tela exigia reenviar); avanço para Revisão sem PPT bloqueia; planilhas com outros nomes de coluna, cliente como terceiro e só o ano de distribuição; área sem planilha sai da apresentação com aviso.
- Transições: reunião e data de assinatura pré-preenchidas; avanço forçado pelo admin usa a data informada (`resolveManualSignedAt`).
- Faturamento: `prazo_indeterminado` e dia de vencimento lidos do lead; componentes com nome legível; mensagens do fechamento em português; salvar e ativar na mesma tela não dá mais conflito de versão (`updated_at` relido depois do RPC); encerramento pede a data.
- Cadastro: os demais contratantes entram no grupo ao concluir (`linkOtherContratantesToGroup`); consulta automatizada aceita CPF/CNPJ e acusa documento inválido.
- Novo lead: Esc no seletor de indicador não fecha mais o diálogo; "Ainda sem local" grava "A definir" em todas as telas.
- Validações: `npx vitest run` (1248 testes, mais `party-language.test.ts` e o caso da consulta automatizada), `npx tsc --noEmit` sem erro em `src/`, eslint nos arquivos alterados (só o aviso antigo de `<img>`); conferido no CRM local: data de encerramento, rótulo CPF/CNPJ e Esc no seletor de indicador.

## 2026-10-22 — 3º teste ponta a ponta (LE BLOG, com DUE): nome de arquivo sem acento e perfil de Ajuizamento de Medida de Reestruturação

- Proposta e contrato não gravavam para lead com acento no nome: o Supabase Storage passou a recusar letra acentuada na chave ("Invalid key: …CONFECÇÕES…"); em 02/09 "QUÍMICA" ainda passava. `sanitizeFilenamePart` tira o acento (NFD sem marcas) e só deixa ASCII seguro.
- O subtipo "Ajuizamento de Medida de Reestruturação" não tinha perfil contratual e o contrato travava no objeto. Perfil novo em `scope-profiles.ts` reusando os blocos de Negociações Estratégicas, que batem com o contrato real do Grupo LE BLOG. Pendente de revisão jurídica.
- Sem DDL. Validações: `npx vitest run src/lib/crm/contract-engine src/lib/crm/proposta-document-data.test.ts src/lib/crm/proposta-document-flow.test.ts "src/app/api/crm/leads/[id]/contrato"`; conferido no CRM local com o lead do teste 3 (proposta PDF e contrato Word gerados e gravados).

## 2026-10-21 — Contrato: perfil de Recuperação de Crédito em Processos de Recuperação Judicial

- O subtipo não tinha perfil contratual e o contrato travava no objeto (2º teste ponta a ponta). Perfil novo em `scope-profiles.ts` + blocos em `object-catalog.ts`, tirados do contrato real (negócio do RD de Vinicius e André, assinado em 29/09/2026): texto genérico fixo, dados do caso como variáveis — credores pela gramática da parte, empresa/processo/vara dos campos da proposta, pontos do parecer opcionais. Pendente de revisão jurídica, como os demais perfis.
- Migrations `20261008183000`, `20261018120000`, `20261018130000` e `20261019120000` aplicadas no remoto em 21/10/2026 pelo SQL Editor (system-context atualizado).
- Validações: `npx vitest run src/lib/crm/contract-engine` (84 testes), conferido no CRM local: objeto completo, Word v1 gerado sem duplicatas.

## 2026-10-21 — Contrato: todas as pessoas do lead como contratantes

- Lead com mais de uma pessoa/empresa no cadastro: no avanço para a proposta as outras vêm marcadas como contratantes (`cp_proposta_empresas_json.contratantes`) e dá para desmarcar. Antes só a principal entrava; a 2ª pessoa precisava ser redigitada e, depois da proposta, não havia como incluí-la (achado no 2º teste ponta a ponta: Vinicius e André).
- Correção depois: seção Cliente do editor da proposta e seção Partes do montador do contrato (até o envio). A aba Contrato avisa quando a proposta mudou e atualiza o contrato.
- `initializeContractFromProposal` guarda só as cláusulas escolhidas à mão em `clausulas_selecionadas`.
- Sem DDL. Validações: `npx vitest run` (1181 testes), `npx tsc --noEmit` sem erro em `src/`; conferido no CRM local com o lead do teste 2 (prévia com as duas pessoas e "CONTRATANTES").

## 2026-10-21 — Contrato: defeitos achados no 2º teste ponta a ponta

- A aba Contrato devolvia 500 na primeira abertura. A tela pede o contrato duas vezes ao mesmo tempo, as duas tentam criar o rascunho e a segunda batia em `unique (oportunidade_id, template_id)` de `document_instances`. As quatro cópias de `ensureInstance` (rotas `document` e `contrato`, `contrato/generate-docx`, `generate-proposta-file`) viraram `ensureDocumentInstance` (`src/lib/crm/document-instance.ts`), que lê o rascunho da outra requisição quando a inserção dá 23505.
- O subtipo de escopo sem perfil contratual aparecia sem acento no montador ("Recuperacao de Credito Em Processos…"). O motor procurava o nome no catálogo fixo do código, que não tem os subtipos criados no admin. Agora usa os nomes do catálogo do banco (`scopeSubtypeLabelsFromCatalog` sobre `loadProposalCatalog`), passados por `scopeLabels` ao `buildCanonicalContract`, nas rotas e no montador.
- Manutenção saía "até até o encerramento…" quando a condição final já começava com "até". O `\b` do JavaScript não vê fim de palavra depois de letra acentuada; `renderManutencao` e o prazo do êxito valor fixo passaram a usar `(?![\p{L}\p{N}])` com a flag `u`.
- Sem DDL. Validações: `npx vitest run` (1168 testes), `npx tsc --noEmit` sem erro em `src/`, eslint nos arquivos alterados; conferido no CRM local com o lead do teste 2.

## 2026-10-21 — Usuários: foto de quem ainda não tem login e casamento pelo login do ORQESTRAI

- Colaborador do RH sem login aparecia só com as iniciais: a `official-photos-api` acha a pessoa pelo `app_users.id` vinculado, e quem não tem login não tem esse id. A tela de Usuários agora lê a view `official_system_photos` do ORQESTRAI e casa a foto pelo e-mail ou pelo local-part (`fetchOrqestraiPeopleIndex` em `src/lib/orqestrai/client.ts`, duas consultas em paralelo, prazo de 2,5 s). Usuário com login sem vínculo na API também usa essa foto. Ao conceder acesso, o card novo mantém a foto. Em 21/10, 59 dos 61 ativos ficam com foto (Fênix Agendador e Rafael Sampaio não têm foto no ORQESTRAI).
- Samuel aparecia duas vezes (com acesso como `controladoria@bismarchipires.com.br` e "sem acesso" como `samuel@bpplaw.com.br` do RH). O casamento usuário ↔ colaborador agora tenta também o e-mail de login no ORQESTRAI (`hr_employees.user_id` → `official_system_photos.normalized_email`, no caso dele `controladoria@bpplaw.com.br`). O e-mail do RH tem prioridade; o de login só ocupa chave livre.
- Sync de colaboradores: as variáveis `ORQESTRAI_SUPABASE_*` foram para a Vercel em 14/10 e o cron diário voltou a rodar. Em 21/10 o espelho tinha as mesmas 82 pessoas (61 ativas) de `hr_employees`.
- Sem DDL. Validações: `npx tsc --noEmit`, `eslint` nos arquivos alterados.

## 2026-10-20 — Apresentação automática da Due Diligence

- O CRM monta o PPT da DUE no modelo do escritório a partir das planilhas das áreas: capa (razão social, CNPJ, empresas, logo), metodologia com as esferas certas, áreas envolvidas (cards com link), slides por área, conclusão recalculada e sócios. Áreas fora da due somem do arquivo.
- Formatos por área: painel com gráficos, um slide por processo (automático até 5 processos ativos) e lista de processos. Reestruturação por formulário.
- Regras de cálculo em `docs/DUE-APRESENTACAO-AUTOMATICA.md`; conferidas contra os PPTs entregues (Cível Sul Fluminense R$ 2.342.866,93; Tributário R$ 283.889.754,52; Trabalhista ALEA R$ 14.806.368,15; crédito ALEA R$ 116.108,20).
- Planilha anexada na tarefa do levantamento; painel na ficha; card de modelos em `/crm/due-diligence`.
- Modelo do CRM em `templates/due/MODELO-DUE-CRM.pptx`, gerado por `scripts/due-ppt/prepare-due-template.py`.
- Migration `20261020120000_due_apresentacao_automatica.sql` (não aplicada).
- Reestruturação: **Preencher a partir do PDF** lê edital do art. 52, §1º, relatório do AJ e plano com IA (`POST /api/crm/leads/[id]/due-apresentacao/reestruturacao-pdf`, PDF por URL assinada, apagado depois da leitura). A sugestão aparece em azul para revisão; só entra no rascunho ao aplicar, e dá para desfazer.
- Trabalhista, regras confirmadas com o advogado da área: suspensos somam em "Ativos"; o gráfico de pedidos mostra os 10 de maior incidência (catálogo `PEDIDOS_TRABALHISTAS`, inclui vínculo de emprego), não mais 9 categorias fixas; verbas rescisórias contam também multa 477 e aviso prévio. Sedna: Ativos 18, verbas rescisórias 76.
- Cível, quadro "Processos por região": até 4 tribunais com a UF ("SP · TJSP"); com 5 ou mais, os 3 maiores + "Outros". Corrigido o 2º item de "Sócio no polo passivo", que repetia o 1º. Ops novas `columns` e `fontScale` em `pptx/build.ts`. Precisa do modelo novo (`templates/due/MODELO-DUE-CRM.pptx`) como modelo ativo; com o modelo antigo o quadro continua "maior tribunal + Outros".

Validações: `npx vitest run src/lib/due-ppt` (22 testes, inclui geração com o modelo do repositório), `npx tsc --noEmit`, eslint nos arquivos alterados; PPTs gerados com as planilhas reais abertos e renderizados no PowerPoint. Leitura do PDF: `npx vitest run src/lib/due-ppt src/components/crm/due-apresentacao` (50 testes; recorte, parse e mescla sem chamar a OpenAI), `npm run lint` sem erros; não testada com a OpenAI real.

## 2026-10-18 — Fechamento da competência do mês de início da vigência

- A versão vale na competência quando algum dia do mês está na vigência. Uma vigência desde 18/10 fecha outubro, e a 1ª parcela do preço fechado entra no fechamento da competência dela. Antes, `findApplicableVersion`, `calculateMonthlyBilling` e o RPC `create_contract_closing_revision` exigiam `vigente_de ≤ dia 1`. A mesma regra vale para consumos, referência anual e projeção (`competency.ts`).
- Mensalidade fixa que começa depois do dia 1: o Financeiro escolhe na configuração (etapa 1) entre cobrar o mês de início cheio e começar no mês seguinte. A escolha é gravada na versão (`cobranca_mes_inicio`) e é exigida ao salvar e ao ativar. Sem resposta, vale o mês seguinte, que é a regra anterior.
- Migration `20261018130000` versionada, não aplicada.

Validações: `npm test`, `npm run lint`, `npm run build`.

## 2026-10-15 — ICP: receita média por hora e colunas ordenáveis na Carteira

- Receita média por hora = receita ÷ horas lançadas, somando só quem tem horas no timesheet (`revenuePerHour`). Entra como indicador do escritório no topo da Carteira (R$ 362/h em 15/10), como coluna na tabela de faixas (com a linha "Escritório todo" no fim) e no comparativo dos blocos.
- Pastas ativas do cliente: processos do SIOE com `processo_encerrado = "Não"` e `situacao_processo = "Ativo"` (mesmo critério de `src/lib/sioe/usage.ts`), contados por grupo e por área (`activeFolders`, `folders` nas métricas por área). Aparecem na lista dos blocos (coluna ordenável e detalhe), na tabela de faixas (média por grupo e linha do escritório), no comparativo dos blocos, na aba Clientes (coluna, detalhe) e no CSV. Em 15/10: 5.673 pastas ativas no SIOE, 5.284 nos 199 grupos pagantes. Cache do cálculo renomeado (`crm-icp-data-v6`).
- Colunas ordenáveis pelo cabeçalho (primeiro clique do menor para o maior, segundo inverte, sem valor no fim) na tabela de faixas, na lista "Quem está em cada bloco" e na tabela de tipo de contrato (`icp-sort.tsx`). Tipo de contrato ordena pela parte da receita em HONORÁRIOS MENSAIS.

## 2026-10-15 — Segurança estrutural e fluxo contrato → pós-venda

Segurança:
- Papel e área só pelo admin: `/crm/perfil` grava nome e foto por `PATCH /api/crm/profile`; migration `20261015120000` (não aplicada) tira a escrita de `app_users` do navegador e barra troca de `role`/`area` pela sessão.
- Política única (`crm-access-policy.ts` + `stage-transition-rules.ts`): criar lead (admin/comercial), excluir (só admin), concluir revisão do contrato (admin, comercial, Societário, designado — avança pela RPC atômica com histórico), envio/operação D4Sign, matriz de etapas. Testes de negação por papel e de rota.
- Rotas 410: VIOS stub, `crm/d4sign/vault|sync|import`. Crons e SharePoint com segredo timing-safe. Erros genéricos com referência de log. Timeouts em SIOE, OrquestrAI e OpenAI. Aviso de indicador pendente ia para o id errado.
- Migration `20261015121000` (não aplicada): sem escrita do navegador nas tabelas de workflow.

Produto:
- Diálogo de envio para assinatura (sócios preenchidos, e-mails do cliente sugeridos), reenvio cancelando o pendente, etapa pela RPC `register_contract_sent_atomic`.
- Assinatura concluída (webhook ou sync, um só caminho): Contrato Assinado, venda ganha, pós-venda em Aguardando Cadastro, avisos no sino e por e-mail (equipe do lead, sócios, comercial, admin, Ops Legais, Financeiro), PDF assinado guardado.
- Cadastro do cliente (responsável) → Operações Legais (checklist VIOS/legados, grupo, devolver/concluir) → cliente, grupo e contatos criados/vinculados → Inclusão no Faturamento.
- Financeiro inclui o contrato no gerenciamento de contratos com pré-preenchimento do cadastro, proposta e leitura por IA do PDF assinado; configura e ativa (→ Boas-vindas).
- Migrations `20261015122000`–`20261015126000` versionadas, não aplicadas.

Validações: `npx vitest run` (todas as suítes), `npm run lint` (0 erros), `npx tsc --noEmit`, `npm run build`.

Correções do teste de telas (local, banco de produção, sem envio à D4Sign nem e-mail):
- Kanban (`GET /api/crm/leads`) dava 500 com ~430 leads: o filtro `.in()` com todos os ids ia na URL e a resposta do PostgREST passava de 16 KB de cabeçalho (`UND_ERR_HEADERS_OVERFLOW`). As consultas por lista de ids passam por `selectInChunks` (`src/lib/supabase/select-in-chunks.ts`, lotes de 150). Erro já existia em `main`.
- Ficha do lead não compilava no navegador: `api-errors.ts` importava `node:crypto` e chegava ao bundle do cliente via `due-area-tasks.ts`. Agora usa `globalThis.crypto` e `isDueAreaTaskDelivered` mora em `due-area-task-status.ts`.
- Reenvio para assinatura: sem o documento no cache `d4sign_documents`, o envio anterior não era tratado como pendente e não era cancelado. Usa o status gravado no lead e, sem status, trata Contrato Enviado como pendente.
- Lead do RD não mostra mais "Avançar para esta etapa" (a rota responde 403). Ficha do contrato aberta pelo lead volta para o lead. Texto da área no Perfil sem o espaço sobrando.
- Assinar contratos (sócios): o botão Assinar abria a janela da D4Sign deslocada para cima e para a esquerda, com o PDF fora da tela. O `DialogContent` centraliza com a propriedade `translate` (Tailwind 4) e o diálogo de tela cheia só zerava `transform`. `d4sign-embed-dialog.tsx` zera `translate` e o deslize da animação. Erro já existia em `main`.

## 2026-10-15 — Migrations de 15/10: conferência e correção antes de aplicar

- Conferência no remoto (só leitura): as 4 migrations da carteira de 18/09 já estavam aplicadas (docs corrigidos); `20261008183000` (plataforma, área de cross selling, decisor) continua não aplicada.
- `20261015123000`: o backfill lia `transicoes_etapa.created_at`, que não existe no remoto (a coluna é `criado_em`); a migration falharia. Corrigido.
- Ensaio das 7 migrations numa transação desfeita: sem erros; `plpgsql_check` sem problemas nas 6 funções.
- **Aplicadas no remoto em 15/10/2026** (com aprovação manual do usuário), na ordem, cada uma registrada em `supabase_migrations.schema_migrations`. Conferência: navegador só lê as tabelas de usuários e de workflow; RPCs novas só `service_role`; módulo `operacoes_legais` aceito; backfill 68 → 70 vendas ganhas.

## 2026-10-14 — ICP: custo por hora fora da tela e margem explicada

- Carteira: saiu o bloco "Custo por hora de cada área e horas consideradas" (critério do custo da hora ainda em definição).
- Marketing: sem `ORQESTRAI_SUPABASE_URL`/`_SERVICE_ROLE_KEY` no ambiente, o ICP calculava o resto e deixava NPS, LinkedIn, GA4 e WhatsApp vazios sem explicar. Agora o loader marca `marketingAvailable` e a aba Marketing (e o card de NPS do Resumo) avisam que falta a conexão. Em produção as duas variáveis não estão configuradas na Vercel: os syncs diários da carteira e dos colaboradores, que também usam o ORQESTRAI, não rodam desde setembro. Cache do cálculo renomeado (`crm-icp-data-v5`).
- No lugar, nota "Como calculamos a margem" no painel de maiores, médios e menores, e os tooltips de margem, margem do escritório e custo de entrega passam a dizer a conta e a origem: receita = honorários pagos em 12 meses (financeiro do VIOS); custo de entrega = horas do timesheet × custo da hora da área; custo da hora = custo de pessoal da área (remuneração, encargos e benefícios) ÷ horas lançadas pela área.

## 2026-10-13 — ICP: tipo de contrato (plano de contas do SIOE) na Carteira

- Tipo de contrato = plano de contas dos honorários pagos no SIOE em 12 meses, com o nome igual ao do SIOE e um plano por linha (sem reagrupar em recorrente/spot). Cada grupo ganha `revenueByPlan`; `planSummary` resume por plano; `src/modules/icp/domain/plano-contas.ts` só conserta acentuação.
- Aba Carteira: a coluna "Mensal" da tabela de faixas virou **Tipo de contrato** (receita da faixa por plano) e entrou o painel **Tipo de contrato** (grupos, receita, % e ticket por plano; recorte por faixa). Detalhe do grupo e CSV listam os planos. "Mensal" continua sendo só HONORÁRIOS MENSAIS. Cache do cálculo renomeado (`crm-icp-data-v3`).
- Maiores, médios e menores: cada cartão mostra a receita do bloco por plano de contas e o comparativo ganhou "Tipo de contrato principal". A lista "Quem está em cada bloco" ganhou a coluna de planos do grupo, a opção **Todos** (ranking completo, `rankedGroups`, com os 25 primeiros e botão para mostrar todos) e linhas expansíveis com o valor de cada plano e a receita por área. A posição mostrada é a do ranking geral. Grupo com mais de um plano: passar o mouse (ou focar) na lista abre um tooltip com o valor, a parte e o total de cada plano. Com filtro de área, planos, tooltip e cartões usam só os honorários da área (`revenueByPlanByArea`, `groupPlans`), então o total bate com a coluna "Receita 12 meses".
- Sem DDL: tudo é calculado no ICP a partir do SIOE.

## 2026-10-13 — ICP: módulo trazido do ORQESTRAI

- `/crm/icp` (grupo "Comercial" do menu) com as abas Resumo, Carteira, Clientes, Marketing e Pauta comercial, portadas de `marketing-system` (`/icp`) para o Design System V2. Cálculo copiado sem mudança de regra para `src/modules/icp/domain` (com os testes); leitura do SIOE e do ORQESTRAI em `src/modules/icp/infrastructure/icp-data-loader.ts`, com cache de 6 h e **Recalcular** (`POST /api/crm/icp/refresh`).
- Acesso: admin ou usuário com o switch **ICP** ligado em Usuários (`PATCH /api/admin/users/[id]/modules` → `app_user_module_access`). A liberação fica numa tabela própria para o usuário não conseguir se liberar pelo `/crm/perfil`.
- Tabelas `icp_cnpj_cadastro` e `icp_group_profiles` e bucket público `icp-logos` passam a morar no CRM (migrations `20261013120000` e `20261013120100`, aplicadas no remoto em 13/10/2026; cópia do ORQESTRAI: 1.483 CNPJs, 149 perfis, 100 logos). Cron semanal `icp-cnpj-sync` (Receita via OpenCNPJ/BrasilAPI). Scripts `icp:linkedin-sync` e `icp:copy-from-orqestrai` (cópia única dos dados e logos).
- NPS, público do LinkedIn, GA4 e WhatsApp continuam sendo lidos ao vivo do ORQESTRAI; sem `ORQESTRAI_SUPABASE_*` esses painéis ficam vazios e o resto do ICP é calculado.

## 2026-10-09 — D4Sign: assinatura concluída sai da lista e o quadro ocupa a tela

- O aviso `signed` do embed tira o contrato de Pendentes na hora. Abrir Assinar continua sem dar baixa. O quadro fica montado fora da linha, então a lista pode atualizar com ele aberto.
- O diálogo de assinatura ocupa a tela inteira, com uma barra fina e sem o rodapé jurídico, para o contrato usar o espaço.

## 2026-10-09 — D4Sign: pendente só sai quando a assinatura consta

- Abrir Assinar não tira o contrato da lista. Ele só sai de Pendentes quando a leitura dos signatários mostra a assinatura. O clique continua na frente da fila de atualização, e o quadro de assinatura permanece aberto.

## 2026-10-09 — D4Sign: controladoria testa a assinatura do Gustavo

- `controladoria@bismarchipires.com.br` é reconhecido como o Gustavo no botão Assinar. O modo sócio não se aplica a essa conta, então o restante do CRM continua disponível.

## 2026-10-09 — D4Sign: assinatura dentro do CRM

- A conta passou a aceitar o EMBED. O botão Assinar abre o documento no diálogo do CRM. `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=0` volta ao link externo.
- Conferido no contrato da Isabella: a página do embed mostra o PDF e o botão Assinar, e o mesmo conteúdo carrega dentro de um iframe.

## 2026-10-01 — Sync D4Sign: limite de tempo da rodada

- Rodada de 121s deu 504 na Vercel (`maxDuration` 120s): cada PDF baixado para ler o remetente leva ~30s. Download no sync tem prazo de 15s+25s e só começa se couber no orçamento da rodada. O orçamento de 95s deixava só 0–1 PDF por rodada (as etapas anteriores levam 50–70s); passou para 260s com `maxDuration` 300s na rota e no layout, e o workflow espera até 290s.

## 2026-10-01 — Modo sócio

- Gustavo e Ricardo (por e-mail ou alias) veem só "Assinar Contratos" e o perfil: `proxy.ts` redireciona as demais páginas `/crm/...`, o menu mostra só "Sócios" e a busca de leads some. Vale mesmo com papel `admin`.

## 2026-10-01 — D4Sign: cancelar contrato

- Botão "Cancelar" (só admin, só em andamento) na área dos sócios e no painel técnico, com confirmação e motivo obrigatório. Rota `POST /api/crm/d4sign/documents/[uuid]/cancel` → `POST /documents/{uuid}/cancel` (motivo em `comment`); grava status cancelado no catálogo e na oportunidade.

## 2026-10-01 — D4Sign: quem enviou o contrato

- Contratos enviados direto na D4Sign: remetente e data real de envio lidos do log de eventos do PDF ("Assinaturas iniciadas por …"). A API não informa isso.
- Migration `20261001120000_d4sign_documents_sender_from_log`: `sent_by_name`, `sent_by_email`, `sent_at`, `log_parsed_at`.
- Etapa "remetente" no sync substitui o pré-cache: lê PDFs do bucket sem cota e baixa os demais (reserva humana de download 6→4/h); `/view` também lê o log. Envios pelo CRM gravam `sent_at`.
- Exibição: painel técnico e área dos sócios mostram "enviado em DATA por NOME" (usuário do CRM quando enviado pelo CRM ou quando o e-mail do log é de um usuário).
- Ajuste: fila do remetente lê os pendentes primeiro (área dos sócios) e a reserva humana de download caiu de 4 para 2/h. Gargalo é a cota de 10 downloads/h da D4Sign.

## 2026-10-01 — D4Sign: finalizado com signatário "pendente"

- 5 contratos finalizados mostravam sócio/cliente em amarelo/cinza: os signatários foram buscados quando ainda pendentes e o status virou "1" depois, pela listagem por fase.
- Exibição: `parseSigners(raw, status)` trata todos como assinados quando o status é finalizado (painel dos sócios e técnico).
- Dados: a listagem por fase zera `details_fetched_at` quando o documento sai de pendente para encerrado, e ele volta para a fila de signatários (datas reais).

## 2026-10-01 — D4Sign: sync resistente a erro da D4Sign

- 1ª execução agendada do GitHub (06:26 UTC) falhou: a D4Sign respondeu 500 vazio na fase 4 (que respondia 200 às 02:17) e a exceção derrubou a rodada inteira (500 no endpoint, e-mail de falha).
- Agora: 5xx numa fase pula para a próxima; cada etapa da rodada é isolada e o erro vai em `errors` (endpoint responde 200); o workflow imprime `errors`.

## 2026-10-01 — D4Sign: EMBED conforme a documentação, atrás de chave

- `D4SignSignButton`: `NEXT_PUBLIC_D4SIGN_EMBED_ENABLED=1` usa o EMBED; sem a variável, o link de assinatura. Basta ligar a variável (e redeploy) quando a D4Sign reativar o EMBED da conta.
- `EmbedSignDialog` ganhou a correção de Safari da página de instalação (`embed/safari_fix` + cookie `fixed`); URL, parâmetros e callback já seguiam a página.

## 2026-10-01 — D4Sign: botão Assinar sem EMBED

- A conta não tem EMBED ("Esse documento não pode ser exibido via EMBED"). "Assinar" (área dos sócios) e "Assinar agora" (painel técnico) abrem `/api/crm/d4sign/documents/[uuid]/sign`, que redireciona para o link de assinatura da D4Sign só quando o logado é o próprio sócio pendente; os demais caem no painel da D4Sign. Antes o painel técnico deixava qualquer admin abrir a assinatura de um sócio.

## 2026-10-01 — D4Sign: conta de assinatura digital do Gustavo

- `assinaturadigital@bismarchipires.com.br` e `assinaturadigital@bpplaw.com.br` são aliases do Gustavo (assina com o certificado dele no login de outro usuário).
- `normalizeFirmSigner`: signatário com e-mail de sócio aparece com o nome do sócio e papel CONTRATADA (busca de signatários, webhook e oportunidade). Antes aparecia o dono do login na D4Sign ("Felipe Soares De Camargo") e a oportunidade marcava os sócios como CONTRATANTE.
- Dados corrigidos: 74 documentos e 1 oportunidade.

## 2026-10-01 — D4Sign: Webhook 2.0

- Conta passou para o Webhook 2.0 (JSON). O endpoint aceitava só form-data e rejeitaria todo evento com 400. Agora lê JSON (2.0) e form-data (1.0).
- Webhook cadastrado no cofre inteiro (`POST /webhooks/v2/`, `type: "cofre"`) uma vez, pela rodada do sync ou pelo envio; acabou o cadastro por documento.
- Finalização do 2.0 traz os signatários completos e grava sem `GET /list`; assinatura/bounce acrescentam signatário ausente; documento fora do catálogo é criado na hora; evento atrasado não reabre documento encerrado.
- Sem `Content-Hmac`, o evento só reenfileira o documento (não altera dados).
- Pendentes com signatários: atualização periódica de 12h para 24h (o webhook cobre o tempo real).
- Migration `20260727170000_harden_webhooks` aplicada em produção (2026-10-01) só no trecho de webhooks: colunas de controle, check, índice único por (documento, tipo, e-mail) e índice de falhas. A `finalize_d4sign_opportunity` dela ficou de fora (a de `20260812122000` é mais nova).

## 2026-10-01 — D4Sign: coleta de documentos e signatários

- Cron: o workflow `d4sign-sync` nunca rodou pelo agendamento. Reforço: o layout de `/crm` dispara a rodada em `after()` se a última tiver mais de 4 min (`runD4SignSyncRoundIfStale`).
- Fases: o ciclo de `/documents/{fase}/status` cobre todas as fases (3, 2, 4, 1, 6, 5, 7). Antes só 3 e 2: finalizado em pasta ainda não varrida nunca entrava.
- Data: `created_at_d4sign` estimado por UUIDv7 ou prefixo `AAAA MM DD` do nome (320 de 321 estavam sem data), para a fila ir do mais recente ao mais antigo.
- Signatários: fila em 4 faixas; pendentes com signatários voltam a ser atualizados a cada 12h; documento que voltou vazio não é refeito antes de 6h.
- Dados: upserts em lote passam a mandar sempre as mesmas colunas (o supabase-js gravava NULL em `oportunidade_id`, pasta e datas); "Atualizar cofre" não apaga mais pasta/datas; listagens não marcam mais `details_fetched_at`.

## 2026-09-30 — D4Sign: cota por método, PDF e "Abrir no D4Sign"

- Cota: a D4Sign limita 10 req/h **por método**, não global. `getD4SignQuotaStatus(método)` conta só o método; o cron (`planD4SignSyncBudget`) usa a cota de cada etapa e preserva `D4SIGN_HUMAN_RESERVE`. Antes, 10 listagens de pasta do cron bloqueavam a visualização de PDF por 1 hora.
- PDF: `download-document.ts` aceita URL temporária em `*.d4sign.com.br`/`*.amazonaws.com`/`*.cloudfront.net`, segue `Refresh`/meta refresh, decodifica Base64 e devolve `stage` do erro; o dialog mostra o motivo real. Diagnóstico: 5 `POST /download` com 200 em 24h e bucket `d4sign-contracts` vazio.
- "Abrir no D4Sign": nova rota `GET /api/crm/d4sign/documents/[uuid]/open` (`generate-document-view`, sem login), com `/desk/viewblob` como reserva. Card do lead usa a rota quando há `d4sign_document_uuid` (antes abria o link de assinatura do 1º signatário).
- Validações: `npx tsc --noEmit` ok; `npx vitest run` 114 arquivos / 719 testes ok; eslint sem novos avisos.
- Ajuste pós-teste: `generate-document-view` abre o original **sem assinaturas**. `/open` passa a redirecionar para `/desk/viewblob/{uuid}` (versão assinada). Cache e pré-cache só para contrato finalizado. Busca do arquivo do `/download` com redirecionamento manual + cookies, 45s e erro com host/motivo; `generate-document-view` vira 2ª via só para pendentes.

## 2026-07-28 — Onda 1 (fechada)

- Spec: `docs/superpowers/specs/2026-07-28-crm-ajuste-completo-design.md`
- Plan de fecho: `docs/superpowers/plans/2026-07-28-onda-1-fecho-hardening.md`
- Docs (Task 4): `AGENTS.md`, `docs/system-context.md`, `docs/change-log.md`
- CI (Task 2): `.github/workflows/ci.yml`
- Deps (Task 3): `shadcn` movido para `devDependencies`
- Lint (Task 5): 43→3 warnings; 0 errors; `no-img-element` adiados Onda 5

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test` | 0 — 24 files, 113 tests |
| `npm run lint` | 0 — 0 errors, 3 warnings (`no-img-element`) |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 0 — env placeholder Supabase (igual CI) |
| `npm audit` | 1 — 5 vulns (2 low, 3 high); ver abaixo |

**Audit:** `@babel/core` (low), `brace-expansion` (high, fixável), `esbuild` (low, fixável), `js-yaml` (high, fixável), `xlsx` (high, sem fix upstream). Nenhuma critical.

**Lint adiado Onda 5:** `@next/next/no-img-element` em `d4sign-dashboard.tsx`, `contrato-document-builder.tsx`.

### Fecho de revisão final — 2026-07-28

- Segurança P1: autorização explícita de visualização de PDF D4Sign por role, regra de documento órfão exclusiva para admin e validação da oportunidade vinculada.
- Segurança P1: RPCs `admin_change_user_role` e `admin_delete_user` serializam a contagem de admins e eliminam a corrida de último administrador; essas correções fecham as lacunas de segurança restantes da revisão final da Onda 1.
- Adiado: bump advisory de Next.js/eslint-config-next (Task 7 Step 1), pois exige janela de compatibilidade dedicada.
- Adiado: padrões React 19 de refs/ícones/estado derivado (Task 8 Steps 2–4), pois exigem regressão visual e funcional transversal.

**Onda 1 fechada — próximo: Onda 2 autorização fina.**

## 2026-07-28 — Catálogo de escopos (admin) — redesign

- Spec: `docs/superpowers/specs/2026-07-28-catalogo-escopos-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-07-28-catalogo-escopos-redesign.md`
- Branch: `catalogo-escopos-redesign` (sem commit automático)
- Rota: `/crm/admin/proposta-escopo` — fora de escopo: `proposta-escopo-por-area` (lead)

### Bugs corrigidos (B1–B8)

| ID | Correção |
|----|----------|
| B1 | Removido `router.refresh()` dos handlers CRUD do catálogo |
| B2 | Investimentos sem L1 fantasma (`hideLabel`, lista plana) |
| B3 | Seleção órfã limpa via `selectionStillValid` pós-delete |
| B4 | Seleções separadas por aba + empty detail coerente |
| B5 | **Ignorado intencionalmente** — `NewItemDialog` mantém `<select>` nativo (sem Base UI Select); padrão `modal-select-safety` não aplicável |
| B6 | Contagens da UI lidas do `data` devolvido pela API |
| B7 | `catalog-empty-detail.tsx` com CTAs |
| B8 | Dirty-guard (`window.confirm`) ao trocar seleção/aba |

### Testes

- `scope-catalog-tree.test.ts`: 14 testes (builders, filtro, seleção pós-CRUD, `findCreatedId`)

### Gate final (Task 6) — 2026-07-28

| Comando | Exit |
|---------|-----:|
| `npm test -- src/components/crm/scope-catalog` | 0 — 1 file, 14 tests |
| `npm test` | 0 — 25 files, 134 tests |
| `npx tsc --noEmit` | 0 |
| `npm run lint` | 0 — 0 errors, 4 warnings pré-existentes (`no-img-element` ×3, `no-unused-vars` ×1) |
| `git diff --name-only -- src/app/(crm)/crm/leads/` | 0 — sem alterações em leads |

**Smoke manual (browser): pendente** — seed → criar tipo/subtipo → editar/salvar → trocar aba → delete → busca/filtro área.
