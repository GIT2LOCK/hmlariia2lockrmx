# Cronograma
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
