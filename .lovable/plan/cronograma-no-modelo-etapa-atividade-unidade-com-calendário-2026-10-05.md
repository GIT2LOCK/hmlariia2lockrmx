# Cronograma no modelo Etapa → Atividade → Unidade, com calendário

Somente o Cronograma muda. Kanban, Lojas, Cadastros, elevadores e faciais ficam como estão.

## O que muda para você
- Cada etapa passa a ter uma ou mais **atividades** (ex.: "Validar unidade", "Confirmar acesso").
- Cada atividade é feita **loja por loja**, com data prevista, responsável e status próprios (Não iniciada, Em andamento, Concluída, Bloqueada). A ordem não obriga nada.
- **Progresso da etapa automático**: execuções concluídas ÷ (lojas × atividades). Ex.: 30 de 45 = 66,7%.
- **Status e datas da etapa automáticos**: o início é a menor data das atividades e o fim é a maior. Também vale para o Gantt.
- Dependências entre atividades só existem se você configurar.
- A mesma loja pode estar em várias etapas, cada uma com suas atividades.

## Novo calendário (inspirado no PDF)
- Uma nova visão **Calendário** dentro do Cronograma. Ela mostra uma grade semanal de segunda a sexta e linhas por semana, como na "Agenda semanal" do PDF.
- Cada dia lista **Etapa → Atividade → Lojas**, com selo de status, lote, responsável e % de progresso.
- Dias sem programação aparecem vazios. Pausas e feriados aparecem destacados.
- Há filtros por etapa, lote, status e responsável. Também há navegação por mês e a opção "lista diária", parecida com o "Cronograma detalhado" do PDF.

## Dados existentes e do PDF
- Cada uma das 17 etapas atuais ganha **uma atividade** com o mesmo nome. Ela herda as lojas, as datas e os status que já existem, então nada se perde.
- Na etapa **Instalação Facial**, cada loja recebe a data exata do PDF: de 13/10 a 24/11 em 2026 e de 04/01 a 08/01 no Lote 2027. O lote e as 10 lojas concluídas continuam.
- As pausas (19–23/10 e 09–13/11) e os feriados (02/11 Finados e 20/11 Consciência Negra) ficam guardados como dias bloqueados do projeto.
- Lojas do PDF que não existem no sistema não serão inventadas. São elas: Anhembi, Berrini, Campo Belo, Lapa III/4, Marginal Tietê, Santo André, Santos e outras sem correspondência. Vou listar todas para você confirmar.
- A planilha serve de base para a estrutura: fases, responsável e lotes 2026/2027.

## Acesso
As regras não mudam. Quem já vê o módulo consulta e atualiza as execuções. Admins e WCTech configuram etapas e atividades.

## Detalhes técnicos
- Nova tabela `elev_cronograma_atividades` (etapa_id, nome, descricao, ordem, responsavel) para as atividades da etapa.
- Nova tabela `elev_cronograma_execucoes` (atividade_id, etapa_unidade_id, data_inicio, data_fim, status, responsavel, observacoes). Ela é única por atividade e loja.
- Nova tabela `elev_cronograma_bloqueios` (projeto_id, data_inicio, data_fim, tipo PAUSA/FERIADO, descricao) para pausas e feriados.
- `elev_cronograma_dependencias` passa a aceitar dependência opcional entre atividades.
- As colunas de data e status da etapa ficam só como reserva. A tela usa os valores calculados.
- As novas tabelas seguem as mesmas regras de acesso, com leitura por `fn_elev_is_staff()` e escrita por `fn_elev_is_admin()`. As execuções também podem ser atualizadas pela equipe. Tudo tem índices, gatilho de timestamp, validação de datas e tempo real.
- No front: `CronogramaConstrutor.tsx` ganha a camada de atividades, e um novo `CronogramaCalendario.tsx` traz o calendário. A lógica de cálculo fica em `cronogramaModel.ts`. `CronogramaKanban.tsx` não muda.
- A exportação Excel ganha a aba "Atividades por loja".
- `AGENTS.md` terá a regra sobre a hierarquia atualizada.
