# Cutover Runbook - CRM Next

## Objetivo
Executar a virada controlada do CRM legado para o novo CRM com janela curta de rollback.

## Pré-cutover
- Confirmar migração final de dados e relatório de reconciliação sem erros críticos.
- Executar checklist de smoke:
  - abertura de novo lead
  - abertura de novo contrato
  - abertura de aditivo
  - transição de etapa com validação
- Confirmar tokens/integrações em produção: RD, VIOS, D4Sign, Supabase.
- Comunicar janela de virada para Comercial, Controladoria e Financeiro.

## Shadow mode (2 a 5 dias)
- Rodar operação no CRM novo com conferência paralela.
- Registrar divergências por lote e classificar por severidade.
- Aplicar correções e repetir reconciliação.

## Antes da virada: fila "Migrar do RD"
- Migration `supabase/migrations/20261019120000_rd_migracao.sql` aplicada no remoto em 21/10/2026 (SQL Editor, fora de `supabase_migrations`). Sem ela a fila só mostra o RD.
- Abrir `/crm/migracao-rd` para o time: cada responsável (Solicitante do RD casado pelo e-mail) preenche, nos seus negócios, o que o CRM pede e o RD não tem. O admin atribui os negócios "sem responsável" e tira da fila os parados ("Fora da migração").
- Piloto: "Converter agora" em um ou dois negócios e conferir ficha, kanban e próxima etapa no CRM.
- Meta: zerar "A preencher". O que só se faz depois da virada (investimento da proposta pelo catálogo) aparece como pendência "depois da virada".

## Dia da virada
1. Freeze de escrita no sistema legado (o time para de mexer no RD).
2. Em `/crm/migracao-rd`, painel **Dia da virada**: **Importar do RD** (import final), depois **Congelar o RD** (webhook e importação diária passam a ignorar tudo).
3. **Converter negócios**. Se a resposta disser que ainda faltam negócios (prazo de 240 s por chamada), clicar de novo até zerar. Conferir a linha "Última conversão" (convertidos, completos, com pendências, com erro).
4. Validar totais por entidade:
   - oportunidades (convertidas na fila × negócios em escopo)
   - clientes
   - contratos
   - aditivos
5. Habilitar apenas o CRM novo para operação diária. Leads convertidos com pendências aparecem com o selo "Migrar do RD" e não mudam de etapa até o responsável completar.
6. Monitorar logs e erros por 4h pós-cutover.

## Rollback (se necessário)
- Critérios de rollback:
  - perda de dados em entidades críticas
  - indisponibilidade > 30 min sem workaround
- Passos:
  1. Reabrir escrita no legado.
  2. Em `/crm/migracao-rd`, **Desfazer** a virada: os leads convertidos voltam a ser do RD (só leitura) e o sync do RD é reaberto. O que foi gravado no CRM depois da conversão fica, mas o RD volta a mandar na etapa (a próxima importação acerta).
  3. Invalidar entrada de novos dados no CRM novo.
  4. Publicar incidente com causa e plano corretivo.

## Pós-cutover
- Reunião de lições aprendidas em até 72h.
- Consolidar backlog de melhorias de onda 2.
