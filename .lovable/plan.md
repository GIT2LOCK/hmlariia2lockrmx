Vou aplicar restrições ao perfil **CLIENTE** em duas camadas: **frontend** (esconder UI/ações) e **backend** (RLS/políticas/funções) para impedir bypass via API.

## 1. Helper único de perfil
Centralizar checagens em `src/lib/permissions.ts`:
- `isCliente(user)`, `isInternalStaff(user)` (USER/VIEWER/ADMIN/SUPERADMIN), `canManageTicketAssignment(user)`.
- Usar em todas as telas/componentes para evitar drift.

## 2. Tela de detalhes do chamado (`ChamadoDetalhe.tsx`, `TicketHeaderInfo.tsx`, `FluxoOperacionalCard.tsx`)
Para CLIENTE, ocultar:
- Status interno (mostrar status simplificado: Aberto / Em atendimento / Aguardando você / Resolvido / Encerrado)
- Prioridade, Fila, Categoria interna
- Operador, Quem deve analisar, Técnico de triagem, Técnico responsável
- Cards de roteamento/SLA interno/Fluxo operacional
- Histórico de mudanças de atribuição

Manter para CLIENTE: número/código, título, descrição, empresa, data abertura, status simplificado, comentários públicos, anexos, botão Responder, botão **Encerrar/Confirmar resolução** (somente se ticket pertence à empresa e status ∈ {RESOLVIDO, EM_ATENDIMENTO conforme regra}).

## 3. Lista de chamados (`Chamados.tsx`)
Para CLIENTE:
- Esconder colunas/filtros: Técnico, Fila, Responsável, Prioridade interna, Atribuir/Trocar técnico
- Esconder ações em lote (atribuição, troca de fila)
- Manter: código, título, status simplificado, empresa, data abertura, ações "Ver detalhes" e "Responder"

## 4. Tela de Senhas (`MeuPerfil.tsx` ou componente de senha)
- Validar via Supabase Auth `signInWithPassword` com a senha atual antes de trocar
- Comparar nova vs atual: se igual → erro `"A nova senha não pode ser igual à senha atual."`
- Manter validações de senha forte existentes

## 5. Assinatura de e-mail
- Ocultar a seção/aba para CLIENTE em `MeuPerfil.tsx` (ou onde estiver)
- `ProtectedRoute` bloqueia rota direta
- Bucket `email-signatures` — adicionar RLS para impedir upload/leitura por CLIENTE

## 6. Tokens da API do Zabbix
- Ocultar seção/aba para CLIENTE
- `ProtectedRoute` bloqueia rota direta
- Já estão em secrets (não em tabela), só preciso garantir que a UI não exponha

## 7. Sidebar/Menu (`AppSidebar.tsx`)
Para CLIENTE, mostrar apenas:
- Meus Chamados
- Abrir Chamado
- Meu Perfil (sem aba de assinatura)
Esconder: Dashboard interno, Unidades, Empresas (admin), Operadoras, Pessoas, Responsáveis, Equipes, Zabbix, Usuários, Permissões, Grafana, Base de Conhecimento (a menos que negócio queira manter).

## 8. Segurança backend (migração SQL)

### 8.1 Tickets — UPDATE seletivo
Substituir a policy atual de UPDATE em `tickets` por duas:
- **CLIENTE**: pode UPDATE somente se `empresa_id = sua empresa` E somente nas colunas funcionais via função RPC `fn_cliente_update_ticket(_id, _action, _payload)` que aceita apenas:
  - `responder` (insere comentário)
  - `encerrar` (muda status para FECHADO/CONFIRMADO quando status atual = RESOLVIDO)
- **Internos** (USER/ADMIN/SUPERADMIN/técnicos): policy ampla atual.

Bloquear no banco a alteração direta por CLIENTE de: `tecnico_id`, `assigned_by`, `assigned_group_id`, `fila_id`, `prioridade`, `operadora_id`, `categoria_id`, `status` (exceto via RPC controlada).

Implementação: trigger `BEFORE UPDATE` em `tickets` que, quando o usuário corrente é CLIENTE, rejeita qualquer alteração de campos restritos (`RAISE EXCEPTION 'cliente_cannot_modify_internal_fields'`).

### 8.2 RPC `fn_cliente_encerrar_ticket(_ticket_id)`
- Verifica que `auth.uid()` é CLIENTE da `empresa_id` do ticket
- Verifica status ∈ {RESOLVIDO}
- Atualiza status → FECHADO, `data_fechamento = now()`, registra em `ticket_history`

### 8.3 Comments
Manter policy atual de comments (CLIENTE pode inserir comentário em ticket da sua empresa).

### 8.4 Storage `email-signatures`
- Policy: somente perfis internos podem INSERT/UPDATE/DELETE/SELECT objetos

### 8.5 Confirmar `fn_can_view_ticket` (já restringe CLIENTE a `empresa_id`) — OK
### 8.6 Confirmar `fn_dashboard_ticket_ids` (já filtra por empresa para CLIENTE) — OK

## 9. Rotas protegidas (`App.tsx` / `ProtectedRoute.tsx`)
Adicionar `forbidRoles={['CLIENTE']}` (ou `requireRoles`) em:
- `/dashboard/usuarios`, `/permissoes`, `/grafana-controle`, `/operadoras`, `/equipes`, `/responsaveis`, `/pessoas`, `/unidades` (admin), `/empresas` (admin), `/zabbix-config`, rota de assinatura de e-mail.

Para CLIENTE que cair em rota proibida → redirect para `/dashboard/chamados`.

## 10. Validação
- Após migração: testar via supabase--read_query como CLIENTE (simulando) que UPDATE direto em `tecnico_id` falha.
- Testar via UI que CLIENTE não vê os elementos.
- Rodar `supabase--linter`.

---

### Pergunta antes de começar
1. Para **encerramento de chamado por CLIENTE**: só permitir quando status = `RESOLVIDO` (cliente "confirma resolução")? Ou também `EM_ATENDIMENTO` (cliente desiste)?
2. **Base de Conhecimento** — manter visível para CLIENTE ou esconder?
3. **Prioridade** — o CLIENTE deve poder *escolher* prioridade ao abrir chamado, mas não *ver* depois? Ou esconder em todos os fluxos?

Posso seguir com defaults (1: somente RESOLVIDO; 2: esconder; 3: esconder em todos os fluxos) se preferir.