# Evolução do módulo Elevadores — Cadastro, Validação e Faciais físicos

## Análise da estrutura atual (resumo)

- `elev_elevadores` (82): unidade, tipo, marca, série, `status` (Pendente/Em andamento/Pausado/Instalado), datas de início/instalação, responsáveis, `checklist` jsonb (hoje sem uso). Nenhum campo de validação ou facial.
- `elev_cronograma_faciais` (82): pertencem a uma **loja dentro de uma etapa** (`etapa_unidade_id`), não à unidade nem ao elevador. Representam *execução planejada*, não o equipamento físico. Não conseguem existir sem etapa, nem ficar "sem elevador" — por isso não servem sozinhas para o cadastro físico.
- `elev_historico`: só aceita eventos de elevador e só registra mudança de `status`.
- `elev_lojas`, etapas, dependências, movimentações: continuam intactas.

Conclusão: a menor alteração correta é **uma única entidade nova para o facial físico** + campos de validação no elevador + um vínculo opcional do facial do cronograma com o facial físico. Nada é duplicado; cronograma continua igual.

## O que muda no banco

1. **`elev_elevadores` ganha campos de validação** (status separado do status do elevador):
   - validação: Não validado / Validado, validado por, validado em, observação da validação
   - situação do facial encontrada na validação: Não identificado / Encontrado / Não encontrado / Necessita compra
   - `checklist` passa a ser usado (Elevador identificado, Validado, Facial localizado, Facial instalado, Teste realizado)
2. **Nova tabela `elev_faciais` (facial físico)**: unidade (obrigatória), elevador (opcional), código, marca, modelo, nº de série, presença (Não identificado / Presente / Não encontrado), instalação (Não iniciada / Aguardando instalação / Instalada), instalado em/por, observação.
3. **`elev_cronograma_faciais` ganha `facial_id` opcional** ligando a execução do cronograma ao facial real (sem alterar os 82 existentes).
4. **`elev_historico` evolui**: `elevador_id` passa a opcional, novos campos `facial_id`, `acao`, `valor_anterior`, `valor_novo` — continua sendo o único histórico.
5. **Regras automáticas no banco** (gatilhos):
   - facial e elevador precisam ser da mesma unidade;
   - um facial só pode estar em um elevador ativo (mensagem "Este facial já está associado ao Elevador X");
   - facial "Instalada" exige elevador; elevador "Instalado" exige facial instalado (somente para novas transições — os 14 atuais são preservados);
   - todo evento gera histórico: elevador criado/validado, facial cadastrado/associado/encontrado/aguardando/instalado, pausado/retomado/reiniciado.
6. **Visões de contagem** calculadas do banco: situação por elevador e totais por unidade (validados, sem facial, faciais sem elevador, necessidade de compra etc.).
7. RLS idêntica às tabelas atuais: leitura para quem acessa Elevadores, escrita para Admin/Superadmin/WCTech. Realtime ligado.

## Dados existentes

- Os 82 elevadores ficam **"Não validado"** e facial **"Não identificado"** — nunca "Sem facial".
- Nenhum facial físico é inventado. Os 14 instalados continuam "Instalado" (status do elevador preservado), aguardando validação.
- Cronograma, Kanban e faciais do cronograma não são alterados.

## O que muda nas telas

- **Nova visão "Cadastros"** (abas Elevadores e Faciais) ao lado de Lojas / Kanban / Cronograma, com botões "Novo elevador" e "Novo facial".
- **Tabela de elevadores**: Elevador | Unidade | Validação | Facial | Instalação | Situação, com selos coloridos (Concluído, Instalar, Sem facial, Validar, Necessita compra).
- **Detalhe do elevador (painel lateral)**: Informações, Validação (botão Validar com situação encontrada e observação), Facial (selecionar existente da mesma unidade ou cadastrar novo), Checklist, Histórico em linha do tempo. Botões atuais Iniciar/Pausar/Retomar/Encerrar/Reiniciar preservados.
- **Visão Lojas**: cada loja mostra "Elevadores da unidade" e "Faciais da unidade" (incluindo os sem elevador) e contadores.
- **Indicadores no topo**: total, instalados, pendentes, validados, aguardando validação, faciais instalados, aguardando instalação, disponíveis, elevadores sem facial, faciais sem elevador, necessidade de compra.
- **Filtros**: unidade, elevador, status do elevador, validação, facial, instalação, responsável, pendências, período.
- **Excel**: mantém as 6 abas; aba Elevadores e aba Faciais recebem as novas colunas (validação, facial, encontrado, instalação, data, responsável, pendência); Resumo por Loja recebe os novos contadores.

## Detalhes técnicos

- Enums novos: `elev_validacao_status`, `elev_facial_situacao`, `elev_facial_presenca`, `elev_facial_instalacao`.
- Índice único parcial `elev_faciais(elevador_id) WHERE elevador_id IS NOT NULL`.
- Views `elev_v_elevador_situacao` e `elev_v_unidade_resumo` com `security_invoker = on` (respeitam RLS).
- Situação geral calculada: não validado → "Aguardando validação"; validado + facial instalado → "Concluído"; validado + facial associado não instalado → "Aguardando instalação"; validado + não encontrado/necessita compra → "Providência"; validado sem facial associado → "Sem facial".
- Novos componentes em `src/components/elevadores/` (CadastrosView, ElevadorDetalheDrawer, FacialFormDialog, indicadores) e ajustes pontuais em `src/pages/Elevadores.tsx`; AGENTS.md atualizado com a regra cadastro x cronograma.
- Verificação final: build, consultas de contagem e testes de transição via SQL.
