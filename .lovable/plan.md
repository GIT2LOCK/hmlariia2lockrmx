## Diagnóstico

### 1. "Organização sendo criada com o e-mail do usuário"
Nenhum código no projeto chama `POST /api/orgs` com o e-mail. A causa real é a configuração do **próprio Grafana**: quando um usuário entra via OAuth e `auto_assign_org=false` (ou o usuário não é atribuído a nenhuma org), o Grafana **cria automaticamente uma "personal organization"** com o nome = login/email do usuário. Esse é o comportamento padrão do Grafana, não do Ariia.

O `grafana-sync-organizations` já filtra essas orgs para não persistir no banco (`isPersonalOrganizationName`), mas elas continuam existindo dentro do Grafana.

### 2. "Alterações no painel não refletem"
- `handleSave` em `Permissoes.tsx` só salva `permissao / empresa_id / ativo / grupo`. **Não toca em `grafana_user_org_permissions` (acessos por organização) nem em `grafana_access_group_members` (grupos de acesso Grafana)** — o painel hoje não tem UI para editar esses vínculos individualmente.
- Em `syncUserToGrafana`, para usuário `CLIENTE/VIEWER+empresa`, a única org desejada é a da `empresas.grafana_organization_id`. Se a empresa não tem esse vínculo, o array `desired` fica vazio → o usuário é removido de tudo. Sem feedback de "empresa sem org vinculada".
- O laço de reconciliação **percorre apenas `grafana_organizations` ativas + Main Org**. As "personal orgs" criadas pelo Grafana não estão em `grafana_organizations`, então **nunca são limpas** — o usuário permanece como Admin da própria personal org.

### 3. Sucesso falso no frontend
`handleSave` chama `grafana-sync-user`, mas se a sync falhar, mostra **dois toasts** (um destrutivo + "Permissões atualizadas com sucesso"). O segundo deve ser suprimido em caso de falha.

---

## Mudanças

### A. Edge function `_shared/grafana.ts` — `syncUserToGrafana`
1. **Limpar personal orgs do usuário.** Após resolver `grafanaUserId`, chamar `GET /api/users/:id/orgs` e, para cada org cujo nome bate o padrão de e-mail (`isPersonalOrganizationName`) E onde o usuário é o único membro, executar:
   - `DELETE /api/orgs/:orgId/users/:grafanaUserId` (sai da org)
   - `DELETE /api/orgs/:orgId` (apaga a org órfã)
   Logar cada deleção no `trace`.
2. **Determinar `desired` para qualquer usuário com `empresa_id` (não só CLIENTE):** se a empresa tem `grafana_organization_id` válido, garantir presença como Viewer (ou role mais alta vinda do painel manual).
3. **Mesclar com permissões manuais** (`grafana_user_org_permissions`) e **grupos** (`grafana_access_groups → grafana_group_org_permissions`) via `grafana_effective_permissions`, escolhendo sempre a role mais alta por org.
4. **Reconciliação**: percorrer união de `(orgs em grafana_organizations ativas) ∪ (orgs onde o usuário está hoje no Grafana) ∪ Main Org`. Isso garante que orgs antigas sejam removidas mesmo se foram desativadas no banco.
5. **Sem permissões → remover de Main Org e de todas as orgs**, mas **não** desabilitar o usuário (a regra é "vê tela de sem acesso", não "conta bloqueada"). Manter `disable` apenas quando `ativo=false`.
6. Retornar `trace` no payload em caso de erro para o frontend mostrar.

### B. Edge function `grafana-sync-organizations`
- Já evita salvar personal orgs no banco. Adicionar opção `cleanup_personal_orgs=true` no body: lista todas as personal orgs e, para cada uma com **0 ou 1 membro**, executa `DELETE /api/orgs/:id`. Útil para limpeza histórica.

### C. Frontend — `src/pages/Permissoes.tsx`
1. **Suprimir toast de sucesso** quando `grafana-sync-user` retorna erro. Hoje os dois aparecem.
2. **Recarregar dados (`load()`) sempre antes de fechar o modal** mesmo em caminho de sucesso — já faz, mas garantir ordem.
3. **Nova seção no modal: "Acessos no Grafana"** com:
   - Lista de orgs vinculadas via `grafana_user_org_permissions` (org + role), com botões de adicionar/editar role/remover.
   - Lista de grupos de acesso Grafana (`grafana_access_group_members`), com adicionar/remover.
   - Combobox com busca para escolher org/grupo (lida bem com listas grandes).
4. **Filtro/busca na tabela de usuários** (já existe input? confirmar; se não, adicionar busca por nome/email/perfil).
5. **Indicador "Empresa sem org Grafana vinculada"** ao lado do select de empresa quando o cliente está sem `grafana_organization_id`, para o admin saber por que a sincronização ficaria vazia.

### D. Não alteramos
- Schema do banco: as tabelas `grafana_user_org_permissions`, `grafana_access_group_members`, `domain_rules`, `empresas.grafana_organization_id` já existem e estão corretas. Sem migration nova.
- Fluxo de signup/login: já chama `apply_domain_rule` + `syncUserToGrafana`.
- A constraint `permissao` aceita `CLIENTE/VIEWER/USER/ADMIN/SUPERADMIN`.

---

## Critérios de aceite cobertos
- Personal orgs com nome de e-mail são apagadas no Grafana durante a sync (A.1) + endpoint de limpeza histórica (B).
- Toda alteração no painel persiste no banco e dispara sync; falha de sync **suprime** o toast de sucesso (C.1).
- Acessos individuais e grupos passam a ser editáveis pelo painel (C.3).
- Empresa com `grafana_organization_id` vinculada → usuário entra naquela org como Viewer; sem vínculo, fica fora de todas (A.2/A.5).
- Mapeamento de roles `mapAriiaToGrafanaRole` já está correto e é aplicado em todos os caminhos.

---

## Fora de escopo
- CRUD de organizações Grafana pelo painel (mencionado no pedido como "quando essa função existir") — apenas o vínculo `empresa → org` continua editável em `Empresas`.
- Redesign visual amplo; foco em filtros/busca e responsividade do modal de permissões.
