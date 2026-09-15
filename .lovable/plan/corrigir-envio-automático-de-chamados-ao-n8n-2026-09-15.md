# Corrigir envio automático de chamados ao n8n

## Implementação
- Fazer a abertura por equipe interna e por cliente aguardar a confirmação do envio ao webhook `mail2lock`.
- Tratar corretamente respostas de erro que hoje são ignoradas.
- Tentar novamente automaticamente em falhas temporárias.
- Registrar nos logs o chamado, a tentativa e o erro sem expor dados sensíveis.
- Manter o chamado criado e devolver ao sistema o estado real da notificação, evitando perda silenciosa.

## Validação
- Publicar as funções alteradas.
- Testar o envio real em um chamado existente sem criar dados duplicados.
- Conferir resposta do n8n e logs das funções.
