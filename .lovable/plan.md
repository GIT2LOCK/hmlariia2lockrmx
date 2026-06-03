# Sistema de SLA — Módulo de Chamados Ariia

Implementação incremental do controle de SLA reaproveitando a estrutura atual de `tickets`, `ticket_filas`, `ticket_history`, `ticket_notifications` e permissões existentes.

## Escopo

Adicionar controle automático de:
- SLA de Primeiro Atendimento
- SLA de Solução (com pausas)
- Alertas progressivos (50%, 75%, 90%, estourado)
- Histórico de eventos de SLA
- Configuração de políticas por prioridade/tipo/categoria/cliente/equipe
- Horário comercial / calendário útil

Não cria novo módulo. Não duplica telas. Reaproveita `ticket_history` para eventos.

## Fase 1 — Banco de dados (migração única)

### Novas colunas em `tickets`
```
first_response_due_at        timestamptz
first_response_at            timestamptz
first_response_by            uuid
first_response_sla_status    text  -- pending|in_progress|paused|met|breached
first_response_sla_target_minutes  int
first_response_sla_elapsed_minutes int

resolution_due_at            timestamptz
resolved_at                  timestamptz
resolved_by                  uuid
resolution_sla_status        text
resolution_sla_target_minutes  int
resolution_sla_elapsed_minutes int
resolution_sla_paused_minutes  int default 0

sla_paused_at                timestamptz
sla_pause_reason             text
sla_policy_id                uuid
```

### Novas tabelas
- `ticket_sla_policies` — regras configuráveis (prioridade, tipo, categoria, cliente, organização, equipe, minutos primeiro atendimento, minutos solução, horário comercial sim/não, ativa)
- `ticket_sla_business_hours` — calendário (dias úteis, horário início/fim, fuso, feriados em JSON)
- `ticket_sla_pauses` — histórico de pausas (ticket, tipo SLA, motivo, status/fila, início, fim, duração, usuário)
- `ticket_sla_alerts` — alertas disparados (ticket, sla_type, threshold, sent_at, sent_to) com UNIQUE(ticket, sla_type, threshold) para evitar duplicação

### Triggers / funções
- `fn_apply_sla_policy(ticket)` — na criação aplica política e calcula `*_due_at`
- `fn_ticket_sla_on_status_change` — pausa/retoma SLA conforme fila (Aguardando cliente/fornecedor/terceiros)
- `fn_ticket_sla_on_first_response` — marca first_response_at na primeira mensagem/atribuição válida
- `fn_ticket_sla_on_resolve` — marca resolved_at quando fila/status = resolvido/fechado
- Inserção em `ticket_history` em cada evento (sla_paused, sla_resumed, sla_first_response_met, sla_resolution_breached, etc.)

### RLS e GRANTs
- Policies: leitura para authenticated; escrita de políticas restrita a ADMIN/SUPERADMIN via `is_ariia_admin()`
- `ticket_sla_pauses` e `ticket_sla_alerts` graváveis apenas via triggers (service_role) + leitura por authenticated

## Fase 2 — Edge function de monitoramento (cron)

`sla-monitor` invocada via `pg_cron` a cada minuto:
- Recalcula `*_elapsed_minutes` e percentual consumido
- Dispara alertas 50/75/90/breached gravando em `ticket_sla_alerts` (UNIQUE evita repetição) e em `ticket_notifications`
- Notifica responsável, equipe, gestor conforme threshold

## Fase 3 — Frontend

### Configuração (nova aba dentro de Configurações de Chamados)
- `src/pages/configuracoes/SlaPolicies.tsx` — CRUD de políticas
- `src/pages/configuracoes/SlaBusinessHours.tsx` — horário comercial e feriados

### Listagem de chamados (`src/pages/Chamados.tsx` ou equivalente)
- Coluna "SLA 1º Atend." e "SLA Solução" com badge colorido
- Tempo restante / % consumido
- Filtros: dentro do prazo / atenção / crítico / estourado / pausado

### Detalhes do chamado
- Novo componente `src/components/tickets/SlaCard.tsx`
  - Seção Primeiro Atendimento (status, prazo, tempo restante, %, cumprido por/quando)
  - Seção Solução (status, prazo, %, tempo pausado, resolvido por/quando)
  - Seção Pausas (lista do histórico de `ticket_sla_pauses`)
- Botão "Recalcular SLA" (ADMIN/SUPERADMIN) chamando edge function `sla-recalculate`

### Hooks
- `src/hooks/useTicketSla.ts` — busca dados de SLA do ticket + realtime
- `src/lib/sla.ts` — helpers de cálculo (cor por %, formato HH:MM, status visual)

## Fase 4 — Permissões

Reaproveitar enum `permissao` em `usuarios`:
- SUPERADMIN/ADMIN: configurar políticas, recalcular
- Demais: leitura conforme RLS existente de tickets

## Detalhes técnicos

- Cálculo de "horas úteis": função SQL `fn_business_minutes_between(start, end, policy_id)` percorre intervalos do calendário descontando finais de semana e feriados
- Pausa de SLA: ao entrar em fila configurada como pausa (flag `pausa_sla` em `ticket_filas`), grava `sla_paused_at` + linha em `ticket_sla_pauses`; ao sair, calcula duração e soma a `resolution_sla_paused_minutes`, recalcula `resolution_due_at = resolution_due_at + duracao`
- Primeira resposta válida: primeira inserção em `ticket_comments` por usuário não-cliente OU mudança para fila "Em atendimento"
- Realtime: tickets já usa Supabase Realtime, o SlaCard reage automaticamente
- Idempotência dos alertas garantida por `UNIQUE(ticket_id, sla_type, threshold)` em `ticket_sla_alerts`

## Entrega incremental

1. Migração de schema + triggers básicos
2. Hook + SlaCard nos detalhes
3. Indicadores na listagem + filtros
4. Configuração de políticas e horário comercial
5. Edge function de monitoramento + alertas
6. Ação "Recalcular SLA"

Confirma para eu começar pela Fase 1 (migração do banco)?
