# Evoluir o cronograma de elevadores para um construtor flexível

## Objetivo
Transformar o cronograma rígido da página de Elevadores em um construtor configurável, preservando lojas, elevadores, Kanban, checklist, relatório e regras já existentes.

## O que será construído
- Um projeto inicial para o cronograma GoodStorage, preparado para outros projetos futuros.
- Etapas livres, com nome, descrição, período, ordem, status e operações de criar, editar, duplicar, excluir e reordenar.
- Datas sobrepostas permitidas; ordem será apenas visual e não criará dependência automática.
- Dependências opcionais entre etapas, sem bloquear etapas independentes.
- Associação de uma ou várias lojas já cadastradas a cada etapa, com status, progresso, período e observações próprios.
- Faciais configuráveis dentro de cada loja em cada etapa, com nome, status, observações e pendências.
- Progresso calculado e exibido nos níveis de projeto, etapa e loja, a partir das faciais e participações concluídas.
- Visões de cronograma/Gantt e estrutura expansível Etapa → Loja → Faciais, integradas à página existente.
- Atualização do relatório Excel para exportar projetos, etapas, participações de lojas e faciais em abas separadas, mantendo as abas atuais de elevadores.
- Atualizações em tempo real nas novas estruturas.

## Preservação do módulo atual
- Manter as visões Lojas e Kanban, cadastro de elevadores, checklist de pré-instalação e fluxo Iniciar/Pausar/Encerrar/Reiniciar.
- Reutilizar `unidades` como lojas e manter `elev_lojas`, `elev_elevadores` e `elev_historico` sem duplicar seus dados.
- Não alterar autenticação, navegação geral ou o visual global do sistema.

## Regras de acesso
- Técnicos e demais usuários autorizados poderão consultar o cronograma e atualizar o acompanhamento permitido.
- Administradores e superadministradores poderão configurar projetos, etapas, lojas, faciais e dependências.
- Todas as novas tabelas terão acesso autenticado, RLS e validação vinculada às regras já existentes do módulo.

## Detalhes técnicos
- Criar tabelas relacionais para projetos, etapas, participação da unidade na etapa, faciais e dependências opcionais.
- Adicionar índices, atualização automática de timestamps, validação de datas, unicidade por relação e histórico compatível.
- Adaptar `Elevadores.tsx` em componentes focados para evitar ampliar o arquivo monolítico.
- Usar cálculos derivados no frontend para progresso e posicionamento temporal do Gantt, sem etapas codificadas no código.
- Atualizar os tipos gerados automaticamente após a migração e registrar a decisão estrutural do módulo.

## Validação
- Conferir criação, edição, duplicação, exclusão e reordenação de etapas.
- Conferir associação em massa de lojas e a mesma loja em várias etapas.
- Conferir cadastro e alteração de faciais, status, pendências e progresso.
- Conferir sobreposição de datas e dependências opcionais.
- Conferir exportação Excel sem erros e funcionamento das funções atuais de Elevadores.
- Validar compilação, erros do preview e comportamento em desktop e celular.
