# D4Sign API — Referência Completa do Projeto

> **Fonte**: documentação oficial https://docapi.d4sign.com.br (todas as 8 páginas de endpoints) + central de ajuda https://ajuda.d4sign.com.br + PHP SDK arquivado (d4sign/d4sign-php).
> Última verificação: 2026-05-11

---

## ⚠️ Rate Limit (CRÍTICO — verificado oficialmente)

**Default: 10 requisições/hora GLOBAL** (não por endpoint, não por grupo).

> Fonte: [Introdução à API D4Sign](https://ajuda.d4sign.com.br/introdu%C3%A7%C3%A3o-%C3%A0-api-d4sign-leia-antes-de-come%C3%A7ar):
> *"Por padrão, você tem um limite de 10 requisições por hora na API D4Sign."*

**Para aumentar**:
- Email **`comercial@d4sign.com.br`** (não `suporte@`) — é decisão comercial
- Plano **Premium API** disponível

**NÃO existe** "cota separada" para diferentes endpoints — toda chamada à API conta no mesmo balde de 10/h. Minha afirmação anterior estava ERRADA.

---

## Autenticação

Todos os endpoints exigem dois query params:

```
?tokenAPI=<D4SIGN_TOKEN>&cryptKey=<D4SIGN_CRYPT_KEY>
```

`cryptKey` é opcional pela API mas **recomendado** — inclua sempre. Header também necessário: `Content-Type: application/json` e `Accept: application/json`.

**Ambientes**:
- Produção: `https://secure.d4sign.com.br/api/v1` (validade jurídica)
- Sandbox: `https://sandbox.d4sign.com.br/api/v1` (só testes)

---

## Variáveis de Ambiente do Projeto

| Variável | Obrigatório | Descrição |
|---|---|---|
| `D4SIGN_TOKEN` | ✓ | Token da API |
| `D4SIGN_CRYPT_KEY` | — | Chave de criptografia |
| `D4SIGN_SAFE_UUID` | ✓ | UUID do cofre padrão |
| `D4SIGN_API_BASE_URL` | — | Base URL (default: produção) |
| `D4SIGN_FIRM_SIGNERS` | — | JSON array de sócios da CONTRATADA |
| `D4SIGN_WEBHOOK_HMAC_SECRET` | — | Segredo HMAC para verificar POSTbacks |

---

## ENDPOINTS COMPLETOS — Todos os 60+ endpoints da API

### 1. Cofres / Pastas / Geral — `/docs/endpoints`

| Método | URL | Função |
|---|---|---|
| GET | `/safes` | Lista cofres da conta |
| GET | `/documents/{UUID-SAFE}/safe` | Lista docs do cofre/pasta (500/pg) |
| GET | `/folders/{UUID-SAFE}/find` | Lista pastas do cofre |
| POST | `/folders/{UUID-SAFE}/create` | Cria pasta/subpasta |
| POST | `/folders/{UUID-SAFE}/rename` | Renomeia pasta |
| POST | `/batches` | Cria lote (até 25 docs) |
| GET | `/account/balance` | Saldo da conta |

### 2. Signatários — `/docs/endpoints-1`

| Método | URL | Função |
|---|---|---|
| **GET** | **`/documents/{UUID-DOCUMENT}/list`** | **Lista signatários do doc (★ usar este)** |
| POST | `/documents/{UUID-DOCUMENT}/createlist` | Cadastra signatários |
| POST | `/documents/{UUID-DOCUMENT}/changeemail` | Altera email do signatário |
| POST | `/documents/{UUID-DOCUMENT}/changesmsnumber` | Altera SMS do signatário |
| POST | `/documents/{UUID-DOCUMENT}/changepasswordcode` | Altera código de acesso |
| POST | `/documents/{UUID-DOCUMENT}/removeemaillist` | Remove signatário |
| POST | `/documents/{UUID-DOCUMENT}/addpins` | Adiciona pins de assinatura por coordenada |
| POST | `/documents/{UUID-DOCUMENT}/removepins` | Remove pins |
| GET | `/documents/{UUID-DOCUMENT}/listpins` | Lista pins posicionados |
| POST | `/documents/{UUID-DOCUMENT}/addpinswithreplics` | Replica pins em todas as páginas |
| POST | `/documents/{UUID-DOCUMENT}/removepinswithreplics` | Remove pins replicados |
| POST | `/documents/{UUID-DOCUMENT}/addinfo` | Cadastra dados (nome, CPF, nascimento) |
| POST | `/documents/{UUID-USUARIO}/addsignaturetype` | Cria tipo de assinatura customizado |
| GET | `/groups/{UUID-SAFE}` | Lista grupos de assinatura |
| GET | `/groups/{UUID-COFRE}/groupdetails/{UUID-GROUP}` | Detalhes do grupo |
| GET | `/documents/{UUID-DOC}/signaturelink/{ID_LINKASSINATURA}` | Link de assinatura |

### 3. Documentos — `/docs/endpoints-2`

| Método | URL | Função |
|---|---|---|
| GET | `/documents` | **Lista TODOS os docs (global, paginado 500/pg)** |
| GET | `/documents/{UUID-DOCUMENT}` | Detalhes do documento |
| GET | `/documents/{ID-FASE}/status` | Filtra por status/fase |
| GET | `/documents/{UUID-DOCUMENT}/dimensions` | Dimensões das páginas |
| POST | `/documents/{UUID-SAFE}/upload` | Upload normal (multipart/form-data) |
| POST | `/documents/{UUID-SAFE}/uploadbinary` | Upload base64 |
| POST | `/documents/{UUID-SAFE}/uploadbigfile` | Upload 20–500MB |
| POST | `/documents/{UUID-SAFE}/uploadhash` | Upload por hash SHA256/SHA512 |
| POST | `/documents/{UUID-DOC-PRINCIPAL}/uploadslave` | Anexo |
| POST | `/documents/{UUID-DOC-MASTER}/uploadslavebinary` | Anexo base64 |
| POST | `/documents/{UUID-DOCUMENT}/sendtosigner` | Envia para assinatura |
| POST | `/documents/{UUID-DOCUMENT}/cancel` | Cancela documento |
| POST | `/documents/{UUID-DOCUMENT}/download` | URL de download (PDF/PDF-A/ZIP/Base64) |
| POST | `/documents/{UUID-DOCUMENT}/resend` | Reenvia link de assinatura |
| POST | `/templates` | Lista templates |
| POST | `/templates/upload` | Upload de template Word |
| POST | `/documents/{UUID-SAFE}/makedocumentbytemplate` | Cria doc por template HTML |
| POST | `/documents/{UUID-SAFE}/makedocumentbytemplateword` | Cria doc por template Word |
| POST | `/documents/{UUID-DOCUMENT}/addhighlight` | Destaca cláusulas |
| POST | `/documents/{UUID-DOCUMENT}/generate-document-view` | URL temporária de visualização |
| POST | `/documents/{UUID-DOCUMENT}/scheduling` | Agenda envio |
| POST | `/documents/{UUID-DOCUMENT}/powerformresponses` | Respostas de Power Form |
| POST | `/documents/{UUID-DOCUMENT}/addtrustid` | Ativa Trust ID |
| POST | `/documents/{UUID-DOCUMENT}/removetrustid` | Remove Trust ID |
| GET | `/documents/{UUID-MAIN}/listslaves` | Lista anexos |
| POST | `/documents/{UUID-MAIN}/downloadlist` | Download múltiplo com certificados |

### 4. Tags — `/docs/endpoints-3`

| Método | URL | Função |
|---|---|---|
| GET | `/tags/{UUID-DOCUMENTO}` | Lista tags do doc |
| POST | `/tags/{UUID-DOCUMENTO}/add` | Adiciona tag |
| POST | `/tags/{UUID-DOCUMENTO}/remove` | Remove tag |
| POST | `/tags/{UUID-DOCUMENTO}/erase` | Remove todas as tags |
| POST | `/tags/{UUID-DOCUMENTO}/addurgent` | Marca como urgente |
| POST | `/tags/{UUID-DOCUMENTO}/removeurgent` | Remove urgente |

### 5. Certificado ICP-Brasil — `/docs/endpoints-4`

| Método | URL | Função |
|---|---|---|
| POST | `/certificate/{UUID-DOCUMENTO}/list` | Lista config de certificado |
| POST | `/certificate/{UUID-DOCUMENTO}/add` | Atribui tipo de certificado |

Tipos (`document_type`): `1`=qualquer, `2`=e-CPF, `3`=e-CNPJ
Padrão (`pades`): `1`=PAdES+CAdES, `0`=só CAdES

### 6. Observadores — `/docs/endpoints-5`

| Método | URL | Função |
|---|---|---|
| GET | `/watcher/{UUID-DOCUMENTO}` | Lista observadores |
| POST | `/watcher/{UUID-DOCUMENTO}/add` | Adiciona observador |
| POST | `/watcher/{UUID-DOCUMENTO}/remove` | Remove observador |
| POST | `/watcher/{UUID-DOCUMENTO}/erase` | Remove todos |

`permission`: `0`=básico c/ download, `1`=só visualização

### 7. Usuários — `/docs/usu%C3%A1rios`

| Método | URL | Função |
|---|---|---|
| GET | `/users/list` | Lista usuários do domínio |
| POST | `/users/check` | Verifica status (email_user) |
| POST | `/users/block` | Bloqueia usuário |
| POST | `/users/unblock` | Desbloqueia |

### 8. Webhooks (Postback)

| Método | URL | Função |
|---|---|---|
| POST | `/documents/{UUID-DOCUMENT}/webhooks` | Registra webhook |

---

## ★ `GET /documents/{uuid}/list` — Endpoint de Signatários (USAR)

Endpoint correto para listar signatários. **Diferente** de `GET /documents/{uuid}` (detalhes do doc).

**Response real**:
```json
{
  "uuidDoc": "...",
  "nameDoc": "...",
  "type": "application/pdf",
  "size": "...",
  "pages": "...",
  "uuidSafe": "...",
  "safeName": "...",
  "statusId": "3",
  "statusName": "Aguardando Assinaturas",
  "list": [
    {
      "key_signer": "abc123...",
      "user_name": "Nome Completo",
      "user_document": "12345678901",
      "email": "...",
      "signed": "1",
      "sign_info": {
        "ip": "200.180.10.5",
        "geolocation": "São Paulo, BR",
        "date_signed": "2025-03-10 14:22:00",
        "date_signed_atom": "2025-03-10T14:22:00-03:00"
      },
      "type": "...",
      "foreign": "0",
      "certificadoicpbr": "0",
      "assinatura_presencial": "0"
    }
  ]
}
```

> 💡 Este endpoint traz **MAIS info** que `GET /documents/{uuid}` — inclui `user_name`, `user_document` (CPF), `sign_info` (IP, geolocalização, data ATOM).

---

## Status IDs (statusId)

> ⚠️ Documentação oficial conflita em alguns IDs. Tabela abaixo é a inferida do uso real:

| statusId | statusName (D4Sign) | Nosso `d4sign_status` | Significado |
|---|---|---|---|
| 1 | Processando | `"processing"` | Doc subindo / processando |
| 2 | Aguardando Signatários | `"sent"` | Cadastrado, falta enviar |
| 3 | Aguardando Assinaturas / Em Assinatura | `"3"` | Enviado, esperando signers |
| 4 | Finalizado | `"1"` | **Todos assinaram** |
| 5 | Arquivado / Cancelado | `"4"` | Cancelado pelo titular |
| 6 | Cancelado / Lixeira | `"6"` | Lixeira / excluído |
| 7 | Edição / Recusado | `"7"` | Editado ou recusado |

> Fonte conflitante: a página `endpoints-2` lista "5-Archived, 6-Cancelled, 7-Editing" — mas o uso real do projeto e o webhook `type_post` (que tem só 4 valores) sugerem o mapeamento acima.

---

## Webhook (POSTback) — type_post

`POST` em form-data para a URL registrada. **Apenas 4 valores possíveis**:

| type_post | Evento | Campos no payload |
|---|---|---|
| `1` | Documento finalizado | `uuid`, `type_post`, `message` |
| `2` | E-mail não entregue | `uuid`, `type_post`, `message`, `email` |
| `3` | Documento cancelado | `uuid`, `type_post`, `message` |
| `4` | Signatário assinou | `uuid`, `type_post`, `message`, `email` |

**Retry**: 7 tentativas em até 27 horas (imediato → 1h ×3 → 6h ×2 → 12h).

---

## `POST /documents/{uuid}/createlist` — Cadastrar Signatários

**Campos completos do signatário** (confirmado):

| Campo | Valores | Descrição |
|---|---|---|
| `email` | string | E-mail do signatário (**obrigatório**) |
| `act` | `"1"`–`"13"` | Tipo de ação |
| `foreign` | `"0"` / `"1"` | `"0"`=CPF brasileiro, `"1"`=estrangeiro |
| `certificadoicpbr` | `"0"` / `"1"` | Exige certificado ICP-Brasil |
| `assinatura_presencial` | `"0"` / `"1"` | Assinatura presencial |
| `docauth` | `"0"` / `"1"` | Autenticação por documento (RG/CNH) |
| `docauthandselfie` | `"0"` / `"1"` | Doc + selfie |
| `embed_methodauth` | `"email"`/`"password"`/`"sms"`/`"whatse"` | Método de auth |
| `embed_smsnumber` | string | Telefone SMS (`"+5511..."`) |
| `whatsapp_number` | string | Telefone WhatsApp |
| `upload_allow` | `"0"` / `"1"` | Permite anexo do signatário |
| `upload_obs` | string | Instrução sobre o anexo |
| `uuid_grupo` | string | UUID do grupo (um do grupo assina) |
| `password_code` | string | Código de acesso manual |
| `videoselfie` | `"0"` / `"1"` | Exige vídeo selfie |

### Valores do `act` (13 ações)

| `act` | Descrição |
|---|---|
| `"1"` | Assinar ← **padrão** |
| `"2"` | Aprovar |
| `"3"` | Reconhecer |
| `"4"` | Assinar como parte |
| `"5"` | Assinar como testemunha |
| `"6"` | Assinar como interveniente |
| `"7"` | Acusar recebimento |
| `"8"` | Assinar como Emissor, Endossante e Avalista |
| `"9"` | Assinar como Emissor, Endossante, Avalista e Fiador |
| `"10"` | Assinar como fiador |
| `"11"` | Assinar como parte e fiador |
| `"12"` | Assinar como responsável solidário |
| `"13"` | Assinar como parte e responsável solidário |

---

## `POST /documents/{uuid}/sendtosigner`

Body:
| Campo | Valores | Descrição |
|---|---|---|
| `skip_email` | `"0"` / `"1"` | `"0"`=envia, `"1"`=não envia |
| `workflow` | `"0"` / `"1"` | `"0"`=simultâneo, `"1"`=sequencial |
| `message` | string | Mensagem do e-mail |
| `sign_limit_date` | DD-MM-YYYY | Prazo de cancelamento auto |

---

## `POST /documents/{safe}/upload`

| Campo | Valores | Descrição |
|---|---|---|
| `file` | Blob (multipart) | Arquivo |
| `uuid_folder` | UUID | Pasta destino |
| `workflow` | `"1"`/`"2"` | `"1"`=after_position, `"2"`=sem ordem |

---

## Tipos de Download

`POST /documents/{uuid}/download` aceita `type`:
- `"1"` = PDF (default)
- `"2"` = PDF/A
- `"3"` = ZIP (com certificados)
- `"4"` = Base64

---

## Fluxo Completo de Envio (atual no projeto)

```
1. uploadMainDocument()      → POST /documents/{safe}/upload     → uuid_doc
2. createSignersList()       → POST /documents/{uuid}/createlist → key_signer por signer
3. sendToSigner()            → POST /documents/{uuid}/sendtosigner
4. getSignatureLink() ×N     → GET  /documents/{uuid}/signaturelink/{key}
5. registerWebhook()         → POST /documents/{uuid}/webhooks
```

**Custo**: 4 + N reqs (N = qtd. de signatários). Com 3 signers = 7 reqs.

---

## Limitações Conhecidas

1. **`uuidFolder` na listagem**: campo existe mas vem vazio para a maioria dos docs.
2. **`parent_uuid` nas pastas**: NÃO existe — hierarquia identificada manualmente.
3. **Rate limit 10/h GLOBAL**: compartilhado entre TODOS os endpoints. Aumentar via comercial@d4sign.com.br.
4. **Listagem inconsistente**: `uuidDoc`/`nameDoc` (camelCase) vs detalhes `uuid_doc`/`name_document` (snake_case).
5. **1º elemento da listagem é metadata**: filtrar por presença de `uuidDoc`.
6. **NÃO existe endpoint bulk** para signatários — cada doc requer 1 req individual.
7. **SDK PHP arquivado** (jul/2022) — só serve como referência histórica.
8. **Listagem `/documents/{safe}/safe` NÃO retorna signers** — confirmado.

---

## Estrutura do Cofre (hardcoded no projeto)

```
Contratos de Honorários   ← D4SIGN_SAFE_UUID
├── Cível           [3cb77b83-2b9b-494c-88ae-4345f0baabfe]
├── Contratos       [ceb5d98d-24a5-484c-bcc5-954d8e34176f]
├── Geral           [eb116328-00d7-46f7-b12d-f87ac47ef1b5]
├── Reestruturação  [82aca827-e05f-4625-9799-03f8e7ef5104]
├── Trabalhista     [3c1b01fb-192a-493d-9332-f1993df3a46d]
└── Tributário      [17a2cc60-8dd6-4917-aae4-ab370f78df78]
```

49 pastas: 6 área + 43 cliente. Mapa em `AREA_FOLDER_MAP` (import/route.ts).

---

## Signatários da CONTRATADA (Firma)

Config em `src/lib/d4sign/firm-signers.ts`:

| Nome | E-mail | OAB |
|---|---|---|
| Gustavo Bismarchi Motta | gustavo@bpplaw.com.br | OAB/SP 275.477 |
| Ricardo Viscardi Pires | ricardo@bpplaw.com.br | OAB/SP 353.389 |

---

## Formato dos Signatários no Banco

Coluna `d4sign_documents.signers` (JSONB):

```json
[
  {
    "email": "gustavo@bpplaw.com.br",
    "key_signer": "abc...",
    "act": "1",
    "signed": true,
    "signed_at": "2025-03-10T14:22:00Z",
    "role": "CONTRATADA",
    "name": "Gustavo Bismarchi Motta"
  }
]
```

`role` e `name` são **nossos campos** (não vêm da D4Sign). `signed` é normalizado de `0/1` → boolean.

---

## Arquivos do Projeto

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/d4sign/env.ts` | Variáveis de ambiente |
| `src/lib/d4sign/firm-signers.ts` | Sócios da CONTRATADA |
| `src/modules/crm/infrastructure/integrations/d4sign-client.ts` | Connector HTTP (chamadas à API) |
| `src/app/api/crm/d4sign/import/route.ts` | Importa cofre → banco |
| `src/app/api/crm/d4sign/sync/route.ts` | Sincroniza status |
| `src/app/api/crm/d4sign/enrich-signers/route.ts` | Busca signatários (★ usa `/list`) |
| `src/app/api/crm/d4sign/folders/route.ts` | Lista pastas (diagnóstico) |
| `src/app/api/crm/leads/[id]/contrato/send-d4sign/route.ts` | Envia contrato p/ assinatura |
| `src/components/crm/d4sign-dashboard.tsx` | Dashboard contratos |
| `src/app/(crm)/crm/contratos/page.tsx` | Página /crm/contratos |
