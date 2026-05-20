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

## Dia da virada
1. Freeze de escrita no sistema legado.
2. Executar import final incremental.
3. Validar totais por entidade:
   - oportunidades
   - clientes
   - contratos
   - aditivos
4. Habilitar apenas o CRM novo para operação diária.
5. Monitorar logs e erros por 4h pós-cutover.

## Rollback (se necessário)
- Critérios de rollback:
  - perda de dados em entidades críticas
  - indisponibilidade > 30 min sem workaround
- Passos:
  1. Reabrir escrita no legado.
  2. Invalidar entrada de novos dados no CRM novo.
  3. Publicar incidente com causa e plano corretivo.

## Pós-cutover
- Reunião de lições aprendidas em até 72h.
- Consolidar backlog de melhorias de onda 2.
