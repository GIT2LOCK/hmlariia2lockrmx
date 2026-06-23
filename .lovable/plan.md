## Tela "Novo Chamado" — versão Cliente vs versão Interna

Hoje existe um único modal `TicketModal` (técnico) usado em Chamados, Unidades, Unidade Detalhe e Chamado Detalhe. Vamos criar uma versão **simplificada para CLIENTE** e manter a atual para SUPERADMIN/ADMIN/USER (técnicos).

---

### 1. Novo componente `ClienteAbrirChamadoModal`

Modal enxuto, exibido apenas para usuários com `permissao = 'CLIENTE'`. Campos, na ordem pedida:

1. **Título do chamado*** — "Ex: Internet lenta na unidade Jundiaí"
2. **Qual o tipo de problema?*** — select com 11 opções fixas (Internet/Rede, Wi-Fi, Câmeras, Computador/Notebook, Sistema/Aplicação, Impressora, Telefonia, Acesso/Login, Equipamento sem funcionar, Lentidão, Outro). Cada opção é mapeada para uma `ticket_categorias.id` (lookup por nome com fallback "Outro").
3. **Onde está acontecendo?** — só renderiza se a empresa do cliente tiver >1 unidade; com 1, preenche automaticamente e oculta; com 0, oculta.
4. **Equipamento afetado** — select com ativos da empresa/unidade + opção "Não sei informar"; opcional.
5. **Qual o impacto do problema?*** — radio cards (Baixo/Médio/Alto/Crítico) com defaults pedidos; default Médio. Mapeia para `prioridade`: BAIXO/MEDIO/ALTO/CRITICO.
6. **Descreva o problema*** — textarea com o placeholder pedido.
7. **Anexos** — drag-and-drop, máx 5MB/arquivo (mesmo upload do modal atual).
8. **Checkbox "Estou abrindo este chamado para outra pessoa"** — quando marcado, mostra Nome, Telefone/Ramal, E-mail.
9. **Botão "Abrir chamado"**.

Toda a linguagem evita termos técnicos (Ativo→Equipamento, Prioridade→Impacto, Unidade→Onde, Categoria→Tipo de problema). Sem Tipo do chamado, Status, Empresa, Operadora, Fila/Equipe, Técnico, SLA.

#### Preenchimento automático (frontend)

- `tipo_chamado = 'T'`, `status = 'NOVO'`, `origem = 'MANUAL'`
- `empresa_id = user.empresa_id`
- `unidade_id = a única / a selecionada`
- `ativo` = texto do equipamento escolhido, ou `null` se "Não sei informar"
- `criado_por = user.id`
- `solicitante_nome/email/telefone`: do próprio usuário, ou da pessoa afetada se o checkbox estiver marcado
- Categoria conforme mapeamento
- Fila/Operadora/SLA: deixados em branco — triggers `fn_ticket_apply_sla` e regras internas já preenchem (mantém comportamento atual).

### 2. Dispatcher no ponto de uso

Em `Chamados.tsx`, `Unidades.tsx`, `UnidadeDetalhe.tsx`, ao abrir o modal de criação (sem `ticketId`):

- Se `user.permissao === 'CLIENTE'` → renderiza `ClienteAbrirChamadoModal`.
- Caso contrário → mantém `TicketModal` atual sem alteração.

Edição (`ticketId` definido) continua sempre no `TicketModal` técnico — cliente não edita.

### 3. Segurança no backend (defesa em profundidade)

Hoje as policies de `tickets` permitem INSERT por usuário autenticado sem validar empresa. Vamos adicionar um **trigger BEFORE INSERT** `fn_ticket_cliente_guard` que, quando o autor é CLIENTE:

- Força `empresa_id = usuarios.empresa_id` do criador (rejeita divergência).
- Exige `unidade_id` pertencente à mesma empresa.
- Força `status = 'NOVO'`, `tipo_chamado = 'T'`.
- Zera `tecnico_id`, `assigned_by`, `assigned_group_id`, `fila_id` (apenas regras internas/triggers podem preencher).
- Bloqueia INSERT se `usuarios.empresa_id IS NULL` (cliente órfão não abre chamado).
- Valida que `ativo` (se informado) está associado a um equipamento da empresa/unidade — como hoje `ativo` é texto livre, esta validação fica como sanity-check (trim/length) e a checagem real fica no fetch do frontend.

Para listagem de ativos do cliente: lemos da tabela já existente que vincula ativos a unidades (uso a fonte usada hoje no modal técnico — investigarei e farei o filtro por `empresa_id`).

### 4. Mapeamento de categoria

Vamos criar/garantir, via migração de dados, registros em `ticket_categorias` para as 11 opções (idempotente, `ON CONFLICT DO NOTHING` por nome+parent NULL). O componente do cliente busca os ids por nome no carregamento.

---

### Detalhes técnicos

- Arquivo novo: `src/components/ClienteAbrirChamadoModal.tsx`.
- Arquivos editados: `src/pages/Chamados.tsx`, `src/pages/Unidades.tsx`, `src/pages/UnidadeDetalhe.tsx` (dispatcher condicional por permissão; sem mexer no `TicketModal`).
- Migração SQL: seed das 11 categorias + trigger `fn_ticket_cliente_guard` em `BEFORE INSERT ON public.tickets`.
- Reuso: upload de anexos copia a função `uploadAttachments` (mesmo bucket `ticket-attachments`, mesma tabela `ticket_attachments`).
- Após salvar, dispara `onSaved?.()` igual ao modal atual para atualizar a lista.

### Fora do escopo

- Não altero o fluxo de SLA (continua via triggers existentes).
- Não mexo na edição do chamado — cliente segue apenas com a tela "Encerrar" já existente.
- Não mexo no `AbrirChamadoModal` (modal usado em outro contexto para chamados Zabbix).