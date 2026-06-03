## Fluxo Operacional de Atendimento — Módulo Chamados

Evolução incremental do módulo atual (`tickets`, `ticket_history`, `ticket_comments`, `ticket_attachments`, `ticket_filas`, `ticket_categorias`, `ChamadoDetalhe.tsx`, `TicketModal.tsx`, `tickets-api`). Sem criar módulo novo, sem duplicar tabelas, reaproveitando ao máximo o que já existe.

---

### Mapeamento do que já existe vs. o que falta

| Necessidade | Já existe? | Ação |
|---|---|---|
| Técnico responsável | `tickets.tecnico_id` | Reaproveitar |
| Fila operacional | `tickets.fila_id` → `ticket_filas` | Reaproveitar + semear filas operacionais |
| Status | `tickets.status` (enum `ticket_status`) | Manter |
| Histórico genérico | `ticket_history` (campo/valor_anterior/valor_novo/observação/autor) | Reaproveitar para TODOS os eventos operacionais (não criar `ticket_operational_logs` separado) |
| Comentários internos | `ticket_comments` | Reaproveitar |
| Equipes / grupos | Não existe | Criar `support_groups` + `support_group_members` |
| Nível de escalonamento (N1/N2/N3) | Não existe | Adicionar coluna `nivel_escalonamento` em `tickets` |
| Equipe responsável atual | Não existe | Adicionar `assigned_group_id` em `tickets` |
| Quem atribuiu / quando | Não existe | Adicionar `assigned_by` + `assigned_at` em `tickets` |
| Motivo "Aguardando cliente" | Não existe | Adicionar `aguardando_cliente_motivo` + `aguardando_cliente_desde` |
| Permissões finas | `usuarios.permissao` (SUPERADMIN/ADMIN/USER/VIEWER) | Estender no front (gestor/coord/N1/N2/N3 ficam como membership em `support_group_members.role_in_group`) |
| Notificações | Não há tabela própria | Criar `ticket_notifications` simples (in-app) |

### 1. Migração de banco (uma única, incremental)

```sql
-- enums
CREATE TYPE ticket_nivel AS ENUM ('N1','N2','N3');
CREATE TYPE support_group_role AS ENUM ('MEMBRO','COORDENADOR','GESTOR');

-- tickets: novas colunas (todas nullable, sem quebrar dados existentes)
ALTER TABLE tickets
  ADD COLUMN assigned_group_id int,
  ADD COLUMN assigned_by int,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN nivel_escalonamento ticket_nivel NOT NULL DEFAULT 'N1',
  ADD COLUMN aguardando_cliente_motivo text,
  ADD COLUMN aguardando_cliente_desde timestamptz;

-- grupos / equipes
CREATE TABLE support_groups (
  id serial PRIMARY KEY,
  nome varchar NOT NULL UNIQUE,
  descricao text,
  nivel ticket_nivel,           -- nível padrão da equipe (opcional)
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);
GRANT SELECT ON support_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON support_groups TO authenticated;
GRANT ALL ON support_groups TO service_role;
ALTER TABLE support_groups ENABLE ROW LEVEL SECURITY;
-- policies: anon/authenticated full access (segue padrão do projeto)

CREATE TABLE support_group_members (
  id serial PRIMARY KEY,
  group_id int NOT NULL,
  usuario_id int NOT NULL,
  role_in_group support_group_role NOT NULL DEFAULT 'MEMBRO',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(group_id, usuario_id)
);
-- mesmos GRANT/RLS

-- notificações internas
CREATE TABLE ticket_notifications (
  id serial PRIMARY KEY,
  ticket_id int NOT NULL,
  usuario_id int NOT NULL,         -- destinatário
  tipo varchar NOT NULL,           -- assigned, transferred, escalated, demoted, awaiting_client, client_replied, etc
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  criado_em timestamptz DEFAULT now()
);
-- mesmos GRANT/RLS
```

Filas operacionais (seed em `ticket_filas`, sem alterar schema): "Novos", "Em atendimento", "Aguardando cliente", "Escalados". Ações registradas em `ticket_history` com `campo` padronizado.

### 2. Convenção de eventos em `ticket_history`

Mantém a tabela atual. Novos valores de `campo`:

| campo | uso |
|---|---|
| `assigned` | atribuição inicial / assumir |
| `tecnico_id` | troca de responsável (já existe) |
| `assigned_group_id` | troca de equipe |
| `transferred_user` | transferência técnico→técnico |
| `transferred_group` | transferência equipe→equipe |
| `escalated` | N1→N2, N2→N3 |
| `demoted` | N3→N2, N2→N1 |
| `fila_id` | mudança de fila (já existe) |
| `aguardando_cliente` | entrou/saiu da fila aguardando cliente |
| `client_replied` | resposta do cliente registrada |

`observacao` carrega o motivo obrigatório. Reuso total — sem nova tabela de log.

### 3. Frontend — nova seção "Fluxo Operacional"

**Em `src/pages/ChamadoDetalhe.tsx`**, novo card acima do conteúdo atual:
- Técnico atual, Equipe atual, Fila atual, Status, Nível, Atribuído por/em.
- Estado vazio: "Sem técnico atribuído" + botão **Assumir** / **Atribuir**.
- Botões condicionados por permissão: Assumir, Atribuir, Alterar responsável, Transferir, Escalonar, Rebaixar, Mover fila, Aguardando cliente, Retomar atendimento.

**Novos componentes em `src/components/tickets/`:**
- `FluxoOperacionalCard.tsx` — header com infos + botões.
- `AssumirAtribuirModal.tsx` — assumir ou atribuir técnico/equipe.
- `AlterarResponsavelModal.tsx` — motivo obrigatório (select + "Outro").
- `TransferirChamadoModal.tsx` — origem/destino técnico, motivo, manter ou trocar fila, notificar.
- `TransferirEquipeModal.tsx` — equipe destino, técnico opcional, motivo.
- `EscalonarModal.tsx` — escalonar/rebaixar + motivo + equipe/técnico destino opcional.
- `AguardandoClienteModal.tsx` — entra na fila com motivo; **Retomar atendimento** limpa motivo e volta status.

**Helpers em `src/lib/ticketWorkflow.ts`:**
- `assumirChamado`, `atribuirResponsavel`, `alterarResponsavel`, `transferirTecnico`, `transferirGrupo`, `escalonar`, `rebaixar`, `moverFila`, `marcarAguardandoCliente`, `retomarAtendimento`.
- Cada função: update em `tickets`, insert em `ticket_history`, insert em `ticket_notifications` para destinatário(s).
- `canPerformAction(user, ticket, action)` — regras de permissão (Superadmin/Admin tudo; Gestor/Coordenador na própria equipe; N1/N2/N3 conforme nível; Viewer leitura).

**Listagem `src/pages/Chamados.tsx`:**
- Adicionar filtros: Responsável, Equipe, Fila, Status, Nível, "Sem responsável", "Aguardando cliente", "Escalados".
- Adicionar colunas: Equipe, Fila, Nível (responsável/status/prioridade/última atualização já existem ou serão garantidas).

**Timeline (`TicketTimeline.tsx`):** mapear os novos `campo` para ícones/labels amigáveis em `ticketHistory.ts → fieldLabel/formatValue`.

### 4. Gestão de equipes

Tela simples nova `src/pages/SupportGroups.tsx` (admin only) para CRUD de `support_groups` + membros. Linkada no sidebar dentro da seção Chamados. Mantém o estilo do projeto (navy/light blue).

### 5. Notificações

- `useTicketNotifications` hook + indicador no header (badge). Realtime via canal Supabase em `ticket_notifications` para o `usuario_id` logado.
- Gatilhos disparados pelos helpers de workflow.

### 6. Regras de negócio aplicadas

Validadas no helper antes de salvar:
- "Em atendimento" exige `tecnico_id`.
- "Aguardando cliente" exige motivo.
- Transferência/Escalonamento/Alteração de responsável exigem motivo.
- N1 não assume chamado nível ≠ N1 sem ser ADMIN/SUPERADMIN ou gestor/coord da equipe destino.
- Viewer/Cliente: somente leitura nas ações.
- Histórico sempre preserva responsável anterior (já garantido pelo `valor_anterior`).

### 7. Edge function `tickets-api`

Apenas estender com endpoints opcionais (`/transfer`, `/escalate`, `/awaiting-client`) usados pelo n8n/integrations. Front pode operar direto via `supabase-js` (RLS atual já permite). Sem refatorar fluxos existentes.

### 8. Entregáveis

**Migração:** 1 arquivo SQL conforme item 1.
**Novos arquivos:**
- `src/lib/ticketWorkflow.ts`
- `src/lib/ticketPermissions.ts`
- `src/components/tickets/FluxoOperacionalCard.tsx`
- `src/components/tickets/AssumirAtribuirModal.tsx`
- `src/components/tickets/AlterarResponsavelModal.tsx`
- `src/components/tickets/TransferirChamadoModal.tsx`
- `src/components/tickets/TransferirEquipeModal.tsx`
- `src/components/tickets/EscalonarModal.tsx`
- `src/components/tickets/AguardandoClienteModal.tsx`
- `src/pages/SupportGroups.tsx`
- `src/hooks/useTicketNotifications.ts`
- `src/components/NotificationsBell.tsx`

**Arquivos editados:**
- `src/pages/ChamadoDetalhe.tsx` — integrar card + modais.
- `src/pages/Chamados.tsx` — filtros + colunas.
- `src/components/tickets/TicketTimeline.tsx` + `src/lib/ticketHistory.ts` — novos rótulos.
- `src/components/AppSidebar.tsx` — link "Equipes".
- `src/components/DashboardLayout.tsx` — sino de notificações.
- `supabase/functions/tickets-api/index.ts` — endpoints adicionais (opcional).

### O que NÃO vou mudar

- Não substituo o enum `ticket_status` atual.
- Não removo/renomeio colunas existentes.
- Não mexo no fluxo de e-mail/N8N/SmartSigma existente.
- Não toco em RLS atuais (mantém o padrão `Anon/Authenticated full access`).

---

Confirma que posso seguir com a migração + implementação nesses moldes? Se quiser, posso fatiar a entrega em ondas (Onda 1: migração + Fluxo Operacional básico no detalhe; Onda 2: equipes/grupos + transferência por equipe; Onda 3: filtros na listagem + notificações). Me diz a preferência.