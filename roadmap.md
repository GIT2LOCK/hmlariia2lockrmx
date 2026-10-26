# Cronograma
## Filas duplicadas no AriiaTalk
- [x] Excluir filas desativadas da seleção de abertura no AriiaTalk, sem alterar registros ou vínculos históricos.
- [x] Confirmar cinco filas ativas sem duplicação; teste da consulta passou e build OK.
- [ ] Conferir dentro de uma conversa real: bloqueado por ausência de sessão autenticada no Supabase externo.
## AriiaTalk: ações nas mensagens
- [x] Responder com citação e editar o próprio texto enviado pela Evolution, preservando autoria e assinatura.
- [x] Copiar e adicionar sinalizações, notas e marcações internas por técnico; nenhuma anotação vai ao WhatsApp.
- [x] 11 testes passaram; funções implantadas e fluxo visual conferido com respostas simuladas (responder, editar, notas/sinalização e copiar).
- [x] Pontinhos de ação só aparecem no hover, em ícone vertical no canto superior direito do balão (conferido em tela: invisível sem mouse, 4px das bordas ao passar o mouse).
- [ ] Validar resposta/edição real no WhatsApp: bloqueado por ausência de sessão autenticada no Supabase externo.
## AriiaTalk: pesquisa na conversa
- [x] Campo "Pesquisar na conversa" no painel do contato, abaixo das observações, com resultados acento-insensíveis.
- [x] Clique no resultado rola até a mensagem no chat e a destaca temporariamente.
- [x] Testes: 3 testes de pesquisa (acento, sem correspondência, mensagens sem texto) passaram; build OK.
- [ ] Validar busca com conversa real: bloqueado por ausência de sessão autenticada no Supabase externo.
## AriiaTalk: edição de contatos
- [x] Adicionar edição de nome, telefone, e-mail e categoria na lista.
- [x] Preservar vínculos e histórico e validar telefone sem máscara.
- [x] Testar e implantar: 3 testes de edição e 5 de regressão passaram; formulário conferido com resposta simulada.
- [ ] Validar edição real com retorno na lista: bloqueado por ausência de sessão autenticada no Supabase externo.

## AriiaTalk: máscara de telefone
- [x] Máscara progressiva nos campos de telefone de cadastro e edição (bloqueia letras, aceita "+" internacional, valida 10–15 dígitos).
- [x] 5 testes da máscara passaram; build OK.
## AriiaTalk: pastas pessoais e filtros
- [x] Restringir listagem, exclusão e associações de pastas ao criador.
- [x] Reorganizar filtros em painel amplo com campos identificados e pastas pessoais.
- [x] Verificar testes e implantação: 7 testes passaram; painel conferido com dados de teste, seleção GoodStorage e sem excesso de largura.
- [ ] Validar isolamento entre contas reais: bloqueado por ausência de sessões autenticadas no Supabase externo.
## AriiaTalk: fotos do WhatsApp
- [x] Consultar fotos pela Evolution com cache e fallback sem foto.
- [x] Exibir ao lado do nome em contatos, conversas ativas e cabeçalho.
- [x] Implantar e verificar testes: 8 passaram; página pública sem erros.
- [ ] Validar fotos reais nas três áreas: bloqueado por ausência de sessão autenticada no Supabase externo.
## AriiaTalk: contatos e reabertura
- [x] Criar aba de contatos com filtros adicionais.
- [x] Ocultar encerradas da lista ativa e preservar histórico ao enviar novamente.
- [x] Verificar testes e fluxo disponível; envio real não verificável sem sessão no Supabase externo.
## AriiaTalk: responsável e assinatura
- [x] Destacar responsável na conversa e na lista.
- [x] Configurar assinatura individual e enviá-la somente no WhatsApp.
- [x] Preservar texto limpo e identificar autor em cada mensagem interna.
- [x] Verificar testes e fluxo disponível: 9 testes passaram; sem sessão para validar envio real (Supabase externo, acesso protegido).

- [x] Restaurar Gantt com datas e status das atividades.
- [x] Ajustar o modal Nova Estrutura e incluir Nova Etapa na aba Etapas.
- [x] Verificar os controles e os testes.

## Cores e leitura do Gantt
- [x] Remover a legenda e colorir o fundo dos próprios eventos do calendário com a cor da etapa.
- [x] Salvar uma cor por etapa e permitir escolhê-la no formulário.
- [x] Aplicar as mesmas cores no calendário e no Gantt, preservando status e atraso.
- [x] Melhorar Gantt com escala ajustável, nomes e datas legíveis e etapas recolhíveis.
- [x] Verificar testes e apresentação do Gantt com dados de teste; sessão autenticada indisponível.- [x] Redesenhar a aba Inventário (painel em grade, chips de status com cor/ícone, filtros destacados, footer de contagem)
- [x] AriiaTalk: grupos registrados automaticamente como contatos (etiqueta Grupo, sem telefone) e reabertos pela lista de contatos
## AriiaTalk: visual do técnico responsável
- [x] Trocar a caixa com rótulo em maiúsculas e select nativo por pílula compacta com avatar de iniciais, nome, chevron e botão "Mim".
- [x] Dropdown com iniciais por técnico, marcação "(você)", item "Eu" quando fora da lista e separador acima de "Sem responsável".
- [x] Conferir em tela: 3 estados (sem responsável, outro técnico, você) com conteúdo centralizado dentro da pílula e mesma altura dos botões vizinhos; prévia temporária removida.
- [ ] Validar com conversa real: bloqueado por ausência de sessão autenticada no Supabase externo.
