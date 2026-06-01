## Objetivo

Nova aba **Automações** dentro de Controle Grafana com um canvas visual de nós (estilo n8n) para criar regras que atribuem usuários a organizações Grafana automaticamente, com base em condições granulares (domínio, regex no email/nome, permissão Ariia, etc.).

## Comportamento

- Regras rodam **apenas na criação/primeira sincronização** de cada usuário (novos usuários).
- **Permissões manuais sempre vencem**: se já existir uma permissão direta em `grafana_user_org_permissions` para o par usuário+org, a regra não sobrescreve.
- Múltiplas regras podem disparar — o resultado é unido (maior role por org).
- Cada regra é um grafo: **Trigger → (Condições encadeadas com AND/OR/NOT) → Ações**.

## UI — Builder visual (React Flow)

Lib: `@xyflow/react` (React Flow v12) — canvas com pan/zoom, snap-to-grid, mini-mapa.

Tipos de nó:

1. **Trigger** (1 por regra, fixo no início)
   - "Novo usuário sincronizado"

2. **Condition** (qualquer quantidade, encadeáveis)
   - Campo: `email`, `email_domain`, `nome`, `permissao_ariia`
   - Operador: `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `regex`, `in_list`
   - Valor: texto livre / lista
   - Conectores lógicos via portas: cada nó condição tem saída **TRUE** e **FALSE**

3. **Logic** (opcional)
   - AND / OR / NOT — combina múltiplas condições antes de uma ação

4. **Action** (uma ou mais no final)
   - "Adicionar à organização X com role Y"
   - "Adicionar ao grupo de acesso Z"
   - "Parar execução" (early exit)

Painel lateral direito: editor de propriedades do nó selecionado.
Topo: nome da regra, toggle ativo/inativo, botão **Salvar**, **Testar com usuário…** (simula contra um usuário existente e mostra quais ações disparariam, sem aplicar).

Lista de regras (lado esquerdo ou tab interna): criar nova, duplicar, deletar, ativar/desativar, reordenar prioridade.

## Banco de dados

Nova tabela `grafana_automation_rules`:
- `id`, `name`, `description`, `active`, `priority` (int), `graph` (jsonb — nós e arestas do React Flow), `criado_em`, `atualizado_em`, `criado_por`
- RLS: somente admins (`is_ariia_admin()`)

Função SQL `grafana_evaluate_automations(_usuario_id int)` retorna `jsonb` com lista de ações `[{grafana_organization_id, role}, ...]` — avalia o grafo no Postgres percorrendo nós/arestas armazenados no JSON.

## Edge function / sync

`supabase/functions/_shared/grafana.ts` — em `syncUserToGrafana`:
1. Detectar se é **primeiro sync** (sem registro em `grafana_user_links`).
2. Se sim: chamar `grafana_evaluate_automations(usuario_id)` e fazer **upsert** em `grafana_user_org_permissions` (somente onde não houver registro prévio — manual vence).
3. Continuar com o cálculo de permissões efetivas e sync com Grafana normalmente.

Nova edge function `grafana-test-automation`: recebe `usuario_id` + opcionalmente `graph` (regra ainda não salva) e devolve as ações que dispararíam — alimenta o botão **Testar**.

## Arquivos

- `supabase/migrations/...sql` — tabela + função de avaliação + RLS/GRANTs
- `supabase/functions/_shared/grafana.ts` — hook de avaliação no first-sync
- `supabase/functions/grafana-test-automation/index.ts` — simulação
- `src/pages/GrafanaControle.tsx` — adicionar tab **Automações**
- `src/components/grafana/AutomationsTab.tsx` — lista de regras + editor
- `src/components/grafana/AutomationCanvas.tsx` — React Flow
- `src/components/grafana/nodes/*` — componentes dos nós (Trigger, Condition, Logic, Action)
- `package.json` — adicionar `@xyflow/react`

## Fora do escopo desta entrega

- Reaplicar regras em usuários antigos em massa (pode ser adicionado depois como botão "Aplicar regras agora").
- Triggers além de "novo usuário" (ex: agendado, ao mudar permissão).
- Versionamento/histórico de regras.

Confirma que posso seguir com essa estrutura?
