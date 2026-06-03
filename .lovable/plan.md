# Dashboard de Atendimento

Nova rota `/dashboard/atendimento` consumindo os dados já existentes em `tickets`, `ticket_filas`, `ticket_sla_*`, `support_groups`, `usuarios`. Sem novas tabelas — apenas **views/RPCs** para consolidar métricas e respeitar RLS.

## Fases

### Fase 1 — Backend (SQL)
Criar funções SECURITY DEFINER que aplicam o escopo de permissão do usuário logado (via `auth.uid()` → `usuarios`):

- `fn_dashboard_scope_tickets(_from, _to)` — retorna IDs de tickets visíveis ao usuário conforme role:
  - SUPERADMIN/ADMIN → todos
  - Gestor/Coordenador → tickets da(s) equipe(s) (`support_group_members`)
  - USER (técnico) → `tecnico_id = self` (+ equipe se membro)
  - VIEWER → leitura conforme regra atual
- `fn_dashboard_kpis(_from, _to, _filtros jsonb)` → JSON com:
  - abertos, em_atendimento, aguardando_cliente, fechados_hoje
  - sla_cumprido / sla_violado (primeiro atendimento + solução)
  - variação vs período anterior
  - tempo_medio_atendimento, tempo_medio_solucao
- `fn_dashboard_by_status(...)`, `fn_dashboard_by_fila(...)`, `fn_dashboard_by_prioridade(...)`
- `fn_dashboard_tecnicos(...)` → linha por técnico (abertos, em atendimento, aguardando, fechados, SLA cumprido/violado, TMA, TMS)
- `fn_dashboard_serie_diaria(_from, _to)` → abertos x fechados por dia
- `fn_dashboard_pontos_atencao()` → SLA >90%, SLA violado, sem responsável, aguardando cliente há muito tempo, parados, críticos

Todas as funções filtram via `fn_dashboard_scope_tickets` para herdar permissão.

### Fase 2 — Frontend
- `src/pages/DashboardAtendimento.tsx` — página principal
- `src/components/dashboard/`
  - `FiltrosGlobais.tsx` (período, técnico, equipe, empresa, prioridade, tipo, categoria, status, fila, SLA)
  - `KpiCards.tsx` (6 cards: abertos, em atendimento, aguardando cliente, fechados hoje, SLA cumprido, SLA violado) com ícone, variação, click → `/dashboard/chamados?<filtro>`
  - `GraficoStatus.tsx`, `GraficoFila.tsx`, `GraficoTecnicos.tsx`, `GraficoSlaDonut.tsx`, `GraficoSerieDiaria.tsx` (recharts)
  - `TabelaTecnicos.tsx` — desempenho por técnico, clique abre lista filtrada
  - `PontosAtencao.tsx` — lista compacta com link para o chamado
- Hook `useDashboardData` com `react-query`, refetch a cada 60s + botão "Atualizar".
- Rota em `App.tsx` + item no `AppSidebar` (oculto para CLIENTE/TV_VIEW).

### Fase 3 — Integração
- Filtros refletem em querystring para deep-link com `Chamados.tsx`.
- `Chamados.tsx` aceita parâmetros (`status`, `fila`, `tecnico`, `sla`, `periodo`) para abrir já filtrado.
- Realtime: assinar canal `tickets` e invalidar `react-query` dos KPIs (debounce 2s).

## Detalhes técnicos
- Fuso `America/Sao_Paulo` em todas as agregações de "hoje" (`AT TIME ZONE`).
- Status finais: `RESOLVIDO`, `FECHADO`, `CANCELADO`.
- Status pausa SLA: `AGUARDANDO_CLIENTE`, `AGUARDANDO_OPERADORA`, `AGUARDANDO_TERCEIRO`.
- TMA = avg(`data_primeiro_atendimento - data_abertura`) onde primeiro atendimento existe.
- TMS = avg(`data_solucao - data_abertura - sla_pausa_total_segundos`) dos fechados no período.
- SLA cumprido/violado lê `first_response_sla_status` e `resolution_sla_status`.
- GRANTs: `EXECUTE` para `authenticated` em todas as funções.

## Entrega incremental
1. Migration com `fn_dashboard_scope_tickets` + `fn_dashboard_kpis` + `fn_dashboard_tecnicos` + `fn_dashboard_pontos_atencao` + séries.
2. Página + KPI cards + filtros básicos (período + escopo).
3. Gráficos e tabela de técnicos.
4. Pontos de atenção + realtime + deep-link com Chamados.
5. Item no sidebar e ajustes finais de permissão.

Confirma para eu começar pela Fase 1 (migration das funções)?