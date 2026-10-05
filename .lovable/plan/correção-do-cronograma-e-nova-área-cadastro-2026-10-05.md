# Correção do Cronograma e nova área Cadastro

O Kanban não muda. Nenhuma unidade, elevador ou facial será duplicado.

## 1. Cronograma: Etapa → Atividade → Unidades
- A **atividade** passa a ter nome, data de início, data de fim, status, responsável e observações. Ela também tem as unidades associadas, que você escolhe em uma lista com várias seleções.
- As **unidades** ficam só associadas à atividade, sem data nem status próprios. A mesma unidade pode estar em várias atividades.
- A **etapa** tem só nome e descrição. O período dela vai da menor data de início à maior data de fim das suas atividades. O status também é calculado:
  - **Concluída:** todas as atividades estão concluídas.
  - **Não iniciada:** nenhuma atividade começou.
  - **Em andamento:** nos outros casos.
- Se a data de fim passar sem a atividade estar concluída, ela aparece como **Atraso**.

## 2. Seus dados atuais
- Na etapa **Instalação Facial**, cada loja vira uma atividade própria, com as datas que já existem. Por exemplo, "Instalação CELSO GARCIA" vai do dia X ao dia Y. As 10 lojas concluídas continuam concluídas.
- Os lotes ficam só **Lote 2026** e **Lote 2027**. Os lotes 1, 2 e 3 viram Lote 2026.
- O período da etapa vai do início do primeiro lote de 2026 até o fim do Lote 2027 e é calculado automaticamente.
- As outras 16 etapas mantêm a atividade atual. Ela fica com as unidades que já tem, o período delas e o status calculado como você escolheu.

## 3. Calendário (o mesmo de hoje)
- Cada evento mostra **só o nome da atividade**, com um selo pequeno da etapa e a cor do status. Ele ocupa todos os dias do período. Mais de uma atividade pode cair no mesmo dia.
- Ao clicar no evento, abre o detalhe com a atividade, a etapa, o período, o status, o responsável, as observações e todas as unidades.
- O calendário mostra a semana completa e identifica cada tipo de dia:
  - fins de semana;
  - feriados nacionais de 2026 e 2027;
  - feriado estadual de SP (09/07);
  - pontos facultativos (Carnaval, Quarta de Cinzas, Corpus Christi), que ficam separados dos feriados.
- Nenhuma data cadastrada muda. Quando uma atividade cai em feriado ou fim de semana, o calendário só avisa.

## 4. Cadastro (no lugar da aba Lojas)
- A aba "Lojas" sai do menu. Entra **Cadastro**, com as abas **Unidades | Elevadores | Faciais**.
- **Nova unidade:** cadastra a unidade e, se você quiser, vários elevadores e várias faciais (cada facial ligada a um elevador), tudo no mesmo formulário.
- **Novo elevador:** escolhe a unidade, preenche os dados e pode cadastrar vários elevadores e várias faciais de uma vez.
- **Nova facial:** cadastra várias faciais de uma vez, cada uma ligada a um único elevador.
- Cada facial só pode ter 1 elevador. Essa regra já existe no banco e continua valendo.
- No detalhe da unidade aparece a árvore Unidade → Elevadores → Faciais.
- As 36 faciais que já existem e ainda não têm elevador continuam assim até alguém ligá-las a um elevador.

## Detalhes técnicos
- `elev_cronograma_atividades` ganha `data_inicio`, `data_fim`, `status`, `observacoes` e `concluido_em`, com gatilho de validação de datas.
- `elev_cronograma_execucoes` passa a ser só o vínculo atividade ↔ unidade. As colunas de data e status deixam de ser usadas, mas os dados ficam guardados. `elev_cronograma_etapa_unidades` continua, porque o Kanban depende dela.
- A migração de dados é feita com SQL de dados. Na Instalação Facial são criadas 46 atividades (1 por loja), e as observações de lote são normalizadas.
- Feriados e pontos facultativos de 2026 e 2027 ficam em `cronogramaModel.ts`, calculados a partir da Páscoa. `elev_cronograma_bloqueios` continua guardando as pausas do projeto.
- Arquivos alterados:
  - `CronogramaConstrutor.tsx`: nova linha de atividade e diálogo com seleção de várias unidades.
  - `CronogramaCalendario.tsx`: eventos por atividade e diálogo de detalhe.
  - `CadastrosView.tsx`: aba Unidades e formulários em lote.
  - `Elevadores.tsx`: remove a visão Lojas e adapta a exportação para Excel.
- A regra de hierarquia em `AGENTS.md` será atualizada.
