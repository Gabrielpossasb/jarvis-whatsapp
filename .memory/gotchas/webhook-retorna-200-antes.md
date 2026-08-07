# Webhook responde 200 antes de processar a mensagem

**Contexto:** `handleWebhook` recebe eventos da Evolution API via `POST /webhook`.

**Pegadinha:** a primeira linha do handler é `res.sendStatus(200)` (`handlers/webhook.js:720`), antes de qualquer await ou lógica. Todo o processamento acontece dentro de um `try` que começa na linha seguinte.

**Por quê:** a Evolution API tem timeout curto e reenvia o evento se não receber 200 rapidamente. Sem o 200 imediato, mensagens longas (transcrição de áudio, análise de PDF) causam reenvio duplicado — o bot processa a mesma mensagem duas vezes.

**Consequência de quebrar:** nunca coloque lógica de validação *antes* do `res.sendStatus(200)` nessa rota, ou retornos antecipados de erro. Qualquer filtro (número autorizado, tipo de evento) deve ficar dentro do try, depois do 200.

**Referências:** `handlers/webhook.js:719-724`
