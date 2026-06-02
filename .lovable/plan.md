
# Melhorias no Módulo de Chamados

Vou expandir o módulo existente (`src/pages/ChamadoDetalhe.tsx`, `TicketModal`, edge functions e tabelas `tickets` / `ticket_history` / `ticket_comments` / `ticket_attachments`) sem recriar nada que já funciona.

## 1. Header de Acompanhamento Avançado

No topo do `ChamadoDetalhe`, montar um painel de "status atual" mais informativo:
- Número do chamado em destaque (já existe, vira título principal).
- Badge colorido do status atual (já existe, ampliar).
- Data de abertura, última atualização, técnico responsável.
- Tempo total em atendimento (agora - data_abertura, descontando pausas).
- Tempo em cada status (agregado a partir de `ticket_history` para o campo `status`).

Tudo no client — sem nova tabela.

## 2. Histórico Completo de Alterações

Hoje o histórico só registra mudanças manuais de status/técnico. Vou padronizar o registro em `ticket_history` para todos os eventos:

| Evento | campo |
|---|---|
| Status alterado | `status` |
| Prioridade alterada | `prioridade` |
| Responsável alterado | `tecnico_id` |
| Comentário adicionado | `comentario` |
| Anexo adicionado | `anexo_add` |
| Anexo removido | `anexo_remove` |
| Edição de campos (titulo, descricao, fila, categoria, empresa, unidade, etc.) | nome do campo |
| Encerramento | `encerramento` |
| Reabertura | `reabertura` |

Para cada evento gravamos `valor_anterior`, `valor_novo`, `observacao` (descrição), `autor_id`, `autor_nome`, `criado_em` (já existem na tabela).

Implementação:
- Helper `logTicketEvent()` no front (ou no `TicketModal`) chamado em cada mutação.
- No upload/remoção de anexos e no `adicionarComentario`, inserir registro em `ticket_history`.
- No `TicketModal` (edição), comparar diff antes/depois e gerar uma linha por campo alterado.

## 3. Timeline Visual

Nova aba **Timeline** (ou substituindo "Histórico") no `ChamadoDetalhe`:
- Lista cronológica unificada de `ticket_history` + `ticket_comments` + `ticket_attachments`.
- Cada item: ícone (lucide) por tipo, data/hora, autor, descrição amigável.
- Tipos visuais: criado, comentário, status, prioridade, responsável, anexo+, anexo−, edição, encerrado, reaberto.
- Renderizada como vertical timeline com linha + bullets coloridos por tipo.

A aba "Histórico" tabular continua disponível para consulta administrativa.

## 4. Encerramento padronizado

Mudar a transição para `RESOLVIDO`/`FECHADO` para abrir um **modal de encerramento** obrigatório:

Campos obrigatórios:
- **Solução aplicada** (textarea com rótulos: Diagnóstico, Procedimentos, Correção, Resultado — um campo combinado com placeholder estruturado, ou 4 textareas pequenas).
- **Motivo do encerramento** (select): Problema resolvido, Solicitação atendida, Ajuste realizado, Cancelado, Duplicidade, Outro.
- Quando "Outro" → campo texto livre.

Ao confirmar:
- Update do ticket: `status = RESOLVIDO`, `data_solucao`, `motivo_encerramento`, `solucao_aplicada`.
- Insert em `ticket_history` (campo `encerramento`, valor_novo = motivo, observacao = solução).
- Insert em `ticket_comments` (tipo `INTERNO`) com a solução, para aparecer também na conversa/timeline.

## 5. Reabertura controlada

Quando o status atual é `RESOLVIDO`, `FECHADO` ou `CANCELADO`, mostrar botão **"Reabrir chamado"** que abre modal:
- Campo obrigatório **Motivo da reabertura**.

Ao confirmar:
- Update: `status = EM_ATENDIMENTO`, limpa `data_solucao` / `data_fechamento`.
- Insert em `ticket_history` (campo `reabertura`, valor_anterior = status anterior, valor_novo = EM_ATENDIMENTO, observacao = motivo, autor preenchido).
- Evento aparece automaticamente na timeline.

## 6. Auditoria completa

- Toda mutação no detalhe passa a registrar em `ticket_history` (item 2).
- Nada é deletado fisicamente: ao remover anexo, mantemos a entrada `anexo_remove` no histórico mesmo após apagar o arquivo do storage.
- Sem mudanças em RLS — `ticket_history` continua com policies existentes.

## Detalhes técnicos

**Migração SQL (mínima):**
```sql
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS solucao_aplicada text,
  ADD COLUMN IF NOT EXISTS motivo_encerramento varchar(50),
  ADD COLUMN IF NOT EXISTS motivo_encerramento_outro text;
```
Não criamos novas tabelas — `ticket_history` já cobre o requisito de auditoria.

**Arquivos a criar:**
- `src/components/tickets/EncerramentoModal.tsx`
- `src/components/tickets/ReaberturaModal.tsx`
- `src/components/tickets/TicketTimeline.tsx`
- `src/components/tickets/TicketHeaderInfo.tsx` (cards de tempos)
- `src/lib/ticketHistory.ts` — helper `logEvent(ticketId, campo, anterior, novo, observacao, user)` + utilitário `computeTimePerStatus(history)`.

**Arquivos a editar:**
- `src/pages/ChamadoDetalhe.tsx` — novo header, nova aba Timeline, integrar modais, usar `logEvent` em comentários/anexos.
- `src/components/TicketModal.tsx` — calcular diff no submit e gravar histórico por campo.
- `supabase/functions/tickets-api/index.ts` — registrar histórico nos endpoints `/status`, `/assign`, criação/edição (para manter API e UI consistentes).

**Sem mudanças** em autenticação, RLS, organizações Grafana, ou no fluxo de e-mail/N8N existente.

---

Confirma esse plano para eu prosseguir com a migração + implementação?
