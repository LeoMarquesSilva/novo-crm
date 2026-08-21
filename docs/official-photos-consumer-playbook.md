# Playbook: consumir fotos oficiais do ORQESTRAI

Use este arquivo como padrão em **qualquer sistema** (Responsum, SIOE, novos projetos).
A fonte canônica das fotos oficiais é o ORQESTRAI. Os outros sistemas **só consultam**.

**Onde manter este texto:** `marketing-system/docs/official-photos-consumer-playbook.md`.
Copie para `docs/official-photos-consumer-playbook.md` de cada consumidor e não
reinvente o contrato.

Lições de produção (SIOE, ago/2026) estão marcadas com **(SIOE)**.

## O que já está pronto no ORQESTRAI

- Edge Function: `official-photos-api`
- Base URL:

```text
https://qwihfvagemzlyypeohpc.supabase.co/functions/v1/official-photos-api
```

- Consumidores já criados: `responsum` e `sioe`
- Autenticação por chave individual (hash no banco; texto puro só no secret manager)
- Limite padrão: **300 req/min por consumidor** (1 HTTP = 1 cota, mesmo no batch de 100 IDs)
- Batch: até 100 IDs por chamada
- `version` = hash de `photoUrl + updatedAt` — muda quando a pessoa troca a foto

## O que você precisa fazer agora

### 1) Guardar a chave do sistema

Cada sistema tem uma chave própria (`ofp_...`).

Coloque **somente no backend / secret manager do runtime que chama a API**:

| Variável | Obrigatória | Exemplo |
|---|---|---|
| `OFFICIAL_PHOTOS_API_KEY` | sim | `ofp_responsum_...` |
| `ORQESTRAI_PHOTOS_URL` | recomendada | `https://qwihfvagemzlyypeohpc.supabase.co/functions/v1/official-photos-api` |

Regras:

- Nunca use `NEXT_PUBLIC_*` / `VITE_*` / variável de browser
- Nunca compartilhe a mesma chave entre sistemas
- Se a chave vazar: rotacione no Marketing System e atualize o secret

**(SIOE)** Env da Vercel / `.env` do front **não** alimenta Edge Function do Supabase.
O que vale é `supabase secrets set` **no projeto que hospeda o proxy**. Secret vazio
vira 503 (`OFFICIAL_PHOTOS_API_KEY não configurada`). Confira com um invoke autenticado,
não só olhando o dashboard da Vercel.

### 2) Escolher a estratégia de identidade

| Prioridade | Método | Quando usar |
|---|---|---|
| 1 | `GET /v1/photos/{externalUserId}` | Uma pessoa (perfil, sidebar) |
| 1 | `POST /v1/photos/batch` | Listas / catálogo do app |
| 2 | `GET /v1/photos?email=...` | Temporário, só quem ainda não tem vínculo |

`externalUserId` = ID da pessoa **no seu sistema** (Responsum: UUID da pessoa lá;
SIOE: `colaboradores.id`).

O ORQESTRAI precisa ter o vínculo em `official_photo_system_links`:

```text
(consumer_id, external_user_id) → user_id do ORQESTRAI
```

Sem vínculo, a API responde `404` no lookup por ID.
Fallback por e-mail pode responder `409` se o e-mail estiver duplicado.

**E-mail no escritório:** a mesma pessoa pode ter `@bpplaw.com.br` num sistema e
`@bismarchipires.com.br` no ORQESTRAI. Faça match também pelo **local-part**
(`gustavo@…` → `gustavo`) e indexe a foto pelos e-mails **do seu sistema**, não
só pelo `email` que a API devolve.

### 3) Implementar um client server-side

O browser **nunca** fala com o ORQESTRAI. Padrão:

```text
UI autenticada → proxy do seu sistema (Edge / Route Handler / BFF)
              → official-photos-api (x-api-key)
```

Exemplo TypeScript (Next.js / Node / Edge) — este código roda **só no servidor**:

```ts
const BASE =
  process.env.ORQESTRAI_PHOTOS_URL ??
  "https://qwihfvagemzlyypeohpc.supabase.co/functions/v1/official-photos-api";

const API_KEY = process.env.OFFICIAL_PHOTOS_API_KEY;

if (!API_KEY) {
  throw new Error("OFFICIAL_PHOTOS_API_KEY não configurada.");
}

export type OfficialPhoto = {
  externalUserId: string | null;
  userId: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  source: "selected" | "legacy_avatar" | "none";
  version: string;
  updatedAt: string;
};

export async function getOfficialPhoto(externalUserId: string): Promise<OfficialPhoto | null> {
  const response = await fetch(
    `${BASE}/v1/photos/${encodeURIComponent(externalUserId)}`,
    {
      headers: { "x-api-key": API_KEY },
      cache: "no-store",
    }
  );

  if (response.status === 404) return null;
  if (response.status === 429) throw new Error("Rate limit da API de fotos.");
  if (!response.ok) throw new Error(`Fotos oficiais: HTTP ${response.status}`);

  const payload = (await response.json()) as { data: OfficialPhoto };
  return payload.data;
}

export async function getOfficialPhotosBatch(externalUserIds: string[]) {
  const response = await fetch(`${BASE}/v1/photos/batch`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ externalUserIds }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Fotos oficiais batch: HTTP ${response.status}`);

  return (await response.json()) as {
    data: OfficialPhoto[];
    notFound: string[];
  };
}
```

**(SIOE)** Regras do proxy que evitam 502 e cota:

1. Lookup **por ID primeiro**. E-mail só para quem não tem `externalUserId`.
2. Não mande N e-mails depois do batch “por garantia” — cada GET de e-mail é
   **+1 cota** e um 404/409 **não pode derrubar o lote inteiro**.
3. 502/503/429: responda `{ unavailable: true }` e **mantenha o cache local**.
   Não limpe o catálogo nem faça retry em loop no React Query.
4. O proxy exige JWT do usuário do **seu** sistema. A `ofp_…` nunca sai da função.

### 4) Cache no app (obrigatório em sistema com várias pessoas)

Objetivo: pintar na hora, sincronizar em background, não estourar cota.

| Fazer | Não fazer |
|---|---|
| Guardar **metadados** (URL, `version`, `updatedAt`) em `localStorage` / cache do servidor | Gravar o blob no Storage do seu sistema como fonte da verdade |
| Primeira pintura = cache; abertura da página = 1 batch | `initialData` + `staleTime` com timestamp recente — o React Query **não chama a API** |
| Usar `placeholderData` (mostra cache, fetch em background) | Tratar o cache persistido como dado “fresco” |
| `refetchOnWindowFocus` só se passou o `staleTime` (5–10 min) | `refetchOnWindowFocus: 'always'` — 40 abas estouram a cota |
| Trocar a UI só se `version` / `updatedAt` / URL mudou | Invalidar o catálogo inteiro a cada fetch idêntico |
| Exibir `photoUrl` com `?v={version}` | `<img src={photoUrl}>` cru — o browser reusa o arquivo antigo |

Cota (conta mental):

```text
1 abertura de página = 1 request (batch)
1 foco de aba após 5 min = 1 request
50 pessoas abrindo de manhã ≈ 50/min   (limite 300/min)
50 pessoas alternando aba o dia todo com always ≈ risco real
```

### 5) Usar a URL no seu app

- Prefira `photoUrl` da API. Se `source === "none"` ou URL vazia, placeholder local.
- Sidebar, header e “meu perfil” **também** usam a foto oficial (não só a lista
  de colaboradores). Cadastro local (`avatar_url` do seu banco) é fallback.
- Avatar circular: `object-cover` (ou `preserveAspectRatio="xMidYMid slice"` no SVG).
  Sem isso a foto retrato achata.

```tsx
const src = photo?.photoUrl
  ? `${photo.photoUrl}${photo.photoUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(photo.version)}`
  : "/avatar-placeholder.svg";

<img src={src} alt={photo?.name ?? "Colaborador"} className="h-full w-full object-cover object-center" />
```

## Checklist por tipo de sistema

### Sistemas já existentes (Responsum / SIOE)

1. [ ] `OFFICIAL_PHOTOS_API_KEY` no secret do **runtime do proxy** (não só Vercel/front)
2. [ ] Proxy server-side autenticado (sem expor chave no front)
3. [ ] Vínculos `(external_user_id → user_id ORQESTRAI)` cadastrados
4. [ ] Catálogo por **batch de IDs**; e-mail só residual
5. [ ] Alias de e-mail do seu sistema + local-part (`@bpplaw` ↔ `@bismarchipires`)
6. [ ] Cache de metadados + `?v=version` + refetch só se stale (≥ 5 min)
7. [ ] 502/503 não apagam o cache; falha de e-mail não vira 502 do lote
8. [ ] Sidebar / perfil / listas usam a mesma resolução de foto
9. [ ] Smoke test: health, 401 sem chave, 404 ID inexistente, batch de 2–3 IDs
10. [ ] Trocar a foto no ORQESTRAI → após F5 (ou 5 min) o consumidor atualiza

### Sistemas novos (padrão obrigatório)

1. [ ] Solicitar cadastro do consumidor no ORQESTRAI (`slug` estável, ex.: `crm-bp`)
2. [ ] Receber chave uma única vez e guardar no secret manager do proxy
3. [ ] Copiar este playbook para `docs/official-photos-consumer-playbook.md`
4. [ ] Implementar proxy + cache no bootstrap (não deixar “só o fetch”)
5. [ ] Definir desde o dia 1 o `externalUserId` (UUID interno do sistema)
6. [ ] Enviar mapa inicial de vínculos ao time do Marketing/ORQESTRAI
7. [ ] Nunca criar pipeline paralelo de “foto oficial” no próprio banco

## Contrato rápido da API

### Health

```http
GET /health
```

```json
{ "ok": true, "service": "official-photos-api", "version": "v1" }
```

### Unitário

```http
GET /v1/photos/{externalUserId}
x-api-key: {OFFICIAL_PHOTOS_API_KEY}
```

### Batch

```http
POST /v1/photos/batch
Content-Type: application/json
x-api-key: {OFFICIAL_PHOTOS_API_KEY}

{ "externalUserIds": ["id-1", "id-2"] }
```

### Códigos

| Status | Significado | Ação no consumidor |
|---|---|---|
| 200 | ok | usar `data` |
| 400 | payload inválido | corrigir request |
| 401 | chave inválida/ausente | checar secret **do proxy** |
| 404 | pessoa não vinculada/não encontrada | fallback local / cadastrar vínculo |
| 409 | e-mail ambíguo | parar fallback; usar ID |
| 429 | quota | backoff; não retry em loop no client |
| 500 / 502 / 503 | erro / gateway | manter cache; não esvaziar a UI |

## Como pedir cadastro / vínculo

Envie para o time do ORQESTRAI:

```text
Sistema: <nome>
Slug sugerido: <slug-kebab-case>
Responsável técnico: <email>
IDs para vincular:
- external_user_id=<uuid-no-seu-sistema>, email=<opcional>, name=<opcional>
```

Se o sistema já tiver usuários espelhados no ORQESTRAI com o mesmo UUID, o vínculo pode ser:

```text
external_user_id = id do seu sistema
user_id = mesmo id no ORQESTRAI
```

## Anti-padrões (não fazer)

- Chamar a API do browser / colocar `ofp_…` em `VITE_*` ou `NEXT_PUBLIC_*`
- Replicar `service_role` do ORQESTRAI no seu projeto
- Usar e-mail como chave permanente
- Batch + dezenas de GET por e-mail na mesma hidratação
- `throw` no proxy quando um e-mail dá 404 — isso vira 502 e some com o lote
- `initialData` persistido com `staleTime` alto (foto nova no ORQESTRAI não aparece)
- `refetchOnWindowFocus: 'always'` em sistema com dezenas de usuários
- Cache eterno sem `version` / `updatedAt`
- Upload/overwrite da foto oficial no seu Storage como fonte da verdade
- Compartilhar chave entre ambientes/produtos
- Trocar só a lista de colaboradores e esquecer sidebar / perfil

## Smoke test mínimo (cole no README do sistema)

```bash
# 1) health
curl -s "$ORQESTRAI_PHOTOS_URL/health"

# 2) sem chave => 401
curl -s -o /dev/null -w "%{http_code}\n" "$ORQESTRAI_PHOTOS_URL/v1/photos/teste"

# 3) com chave (unitário)
curl -s -H "x-api-key: $OFFICIAL_PHOTOS_API_KEY" \
  "$ORQESTRAI_PHOTOS_URL/v1/photos/<EXTERNAL_USER_ID>"

# 4) batch
curl -s -X POST -H "x-api-key: $OFFICIAL_PHOTOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalUserIds":["id-1","id-2"]}' \
  "$ORQESTRAI_PHOTOS_URL/v1/photos/batch"
```

No app, depois do proxy no ar:

1. Abrir logado → fotos aparecem (ou fallback), sem 401/502 no console.
2. Recarregar → primeira pintura vem do cache; a rede faz **um** batch.
3. Alternar de aba várias vezes em 1 min → **sem** novo batch.
4. Trocar a foto no ORQESTRAI → F5 (ou esperar o stale) atualiza; a URL tem `?v=`.

## Referência operacional no Marketing System

- Contrato detalhado: `docs/official-photos-api.md`
- Rotação de chave (admin autenticado):

```http
POST /api/admin/official-photo-consumers/{slug}/rotate-key
```

Após rotacionar, atualize imediatamente o secret do **proxy** do sistema consumidor
(`responsum`, `sioe`, …).
