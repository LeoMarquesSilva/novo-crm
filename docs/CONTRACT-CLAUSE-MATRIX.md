# Matriz de cláusulas — motor de contratos

Status de todas as cláusulas do seed: `pending_legal_review`.

| stable_key | Origem | Auditoria | Canal | Diagnóstico | Reclamada | Reclamante | Mensal Full | Igual? | Ação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| object_auditoria | Auditoria | sim | não | não | não | não | não | — | perfil |
| scope_auditoria | Auditoria | sim | não | não | não | não | não | — | perfil |
| object_canal | Canal | não | sim | não | não | não | não | — | perfil |
| scope_canal | Canal | não | sim | não | não | não | não | — | perfil |
| limitation_canal | Canal | não | sim | não | não | não | não | — | perfil |
| nature_canal | Canal | não | sim | não | não | não | não | — | perfil |
| object_diagnostico | Diagnóstico | não | não | sim | não | não | não | — | perfil |
| scope_diagnostico | Diagnóstico | não | não | sim | não | não | não | — | perfil |
| limitation_diagnostico | Diagnóstico | não | não | sim | não | não | não | — | perfil |
| object_contencioso_trabalhista | Reclamada / Mensal | não | não | não | sim | sim | sim | parcial | perfil |
| object_consultivo_trabalhista | Reclamada / Mensal | não | não | não | sim | não | sim | parcial | perfil |
| exclusion_geral_base | todos | sim | sim | sim | sim | sim | sim | quase | padrão; Mensal Full contradiz tributário/societário |
| exclusion_trabalhista_* | varia | sim | sim | sim | sim | parcial | parcial | não | filtrar por conflito |
| default_inadimplemento | todos | sim | sim | sim | sim | sim | sim | sim | REVISÃO JURÍDICA NECESSÁRIA |
| default_atraso_multa | todos | 20% | 20% | 20% | 20% | 20% | 20% | sim | REQUIRES LEGAL DECISION |
| termination_aviso | quase todos | 30 dias | 30 dias | 30 dias | 30 dias | regras próprias | 30 dias | não | Reclamante diverge |
| expense_km | todos | R$ 2,00/km | igual | igual | igual | igual | igual | sim | REQUIRES LEGAL DECISION |
| general_foro | todos | Campinas | Campinas | Campinas | Campinas | Campinas | Campinas | sim | padrão |
| general_tributos | todos | engloba | engloba | engloba | engloba | engloba | engloba | sim | pode contradizer proposta |
| payment_boleto | Canal / Diagnóstico | conta | boleto | boleto | conta | conta | cronograma | não | condicional |
| payment_conta | Auditoria / Reclamada | Santander | — | — | Santander | Santander | — | sim | condicional |

Perfil associado: ver `scope-profiles.ts`.

## Stable keys do Objeto (Object Resolution Engine)

Status: `pending_legal_review`. Não são cláusula oficial BP.

| stable_key | Tipo | Perfil | Placeholders obrigatórios |
| --- | --- | --- | --- |
| `object.trabalhista.contencioso.single_case` | paragraph | contencioso | numero_processo, parte_contraria, vara_tribunal |
| `object.trabalhista.contencioso.subscope` | subscope | contencioso (full service) | idem |
| `object.trabalhista.consultivo` | paragraph | consultivo | — |
| `object.trabalhista.consultivo.subscope` | subscope | consultivo (full service) | — |
| `object.trabalhista.auditoria` | paragraph | auditoria | — |
| `object.trabalhista.auditoria.scope` | paragraph | auditoria | — |
| `object.trabalhista.canal_denuncias` | paragraph | canal | — |
| `object.trabalhista.canal_denuncias.scope` | paragraph | canal | — |
| `object.trabalhista.canal_denuncias.limitation` | limitation | canal | — |
| `object.trabalhista.canal_denuncias.nature` | paragraph | canal | — |
| `object.trabalhista.diagnostico_nr1` | paragraph | diagnóstico | — |
| `object.trabalhista.diagnostico_nr1.scope` | paragraph | diagnóstico | — |
| `object.trabalhista.diagnostico_nr1.limitation` | limitation | diagnóstico | — |
| `object.trabalhista.full_service.general` | paragraph | composição explícita | — |
| `object.trabalhista.full_service.paragraph_unique` | paragraph_unique | composição explícita | — |

Composição `trabalhista_full_service`: só com evidência explícita. Sem evidência, contencioso e consultivo aparecem separados.
