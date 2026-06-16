# JARVIS — Assistente Pessoal via WhatsApp 🤖

Servidor Node.js que recebe mensagens do WhatsApp, processa com IA e gerencia gastos e tarefas automaticamente.

---

## Stack
- **Node.js** + Express — servidor webhook
- **OpenAI GPT-4o-mini** — interpretação de mensagens
- **OpenAI Whisper** — transcrição de áudios
- **Evolution API** — integração WhatsApp
- **Supabase** — banco de dados (tarefas, gastos, categorias)
- **Railway** — hospedagem

---

## Funcionalidades

### 💰 Gastos
- Registra despesas fixas e variáveis automaticamente
- Salva na planilha financeira na aba do mês atual
- Suporta texto, áudio, foto e PDF

### ✅ Tarefas
- Cria tarefas com ou sem data/horário
- Backlog para tarefas sem prazo definido
- Tarefas recorrentes (ex: "toda segunda e sexta")
- Categorias dinâmicas (Casa, Trabalho, Faculdade...)
- Concluir e excluir tarefas por mensagem

### 🔔 Lembretes automáticos
- **7h** — resumo diário agrupado por categoria
- **A cada 15min** — lembrete 1h antes de tarefas com horário
- **20h** — alerta de tarefas vencidas
- **Segunda 9h** — alerta de tarefas esquecidas há +7 dias
- Lembretes independentes por dias/hora específicos

---

## Variáveis de ambiente (Railway)

| Variável | Descrição |
|---|---|
| `OPENAI_API_KEY` | Chave da OpenAI |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Token da instância |
| `EVOLUTION_INSTANCE` | Nome da instância (ex: JARVIS) |
| `NUMERO_AUTORIZADO` | Número autorizado (ex: 5567...@s.whatsapp.net) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Chave anon/service do Supabase |

---

## Estrutura

```
jarvis/
├── index.js              ← inicialização do servidor
├── config.js             ← configurações e constantes
├── state.js              ← estado em memória (revisões pendentes)
├── services/
│   ├── evolution.js      ← envio de mensagens WhatsApp
│   ├── openai.js         ← GPT, Whisper e Vision
│   ├── sheets.js         ← leitura e escrita no Google Sheets
│   └── categorias.js     ← categorias dinâmicas com cache
├── handlers/
│   └── webhook.js        ← lógica principal de cada mensagem
├── cron/
│   └── jobs.js           ← resumo diário e lembretes
└── utils/
    └── date.js           ← funções de data/hora (GMT-4)
```

---

## Exemplos de uso

```
"gastei 40 no almoço"
"paguei 179 no Nubank"
"comprar remédio às 16h"
"tenho prova sexta de manhã"
"toda segunda e quinta jogar lixo às 22h"
"trabalho da faculdade pra entregar dia 30/jun, lembrete toda segunda e quinta às 9h"
"quais tarefas tenho hoje?"
"tarefas da faculdade"
"concluí comprar remédio"
"muda a data do trabalho para 28/jun"
"muda o lembrete do trabalho para toda sexta às 10h"
"revisa as categorias"
"aprovar tudo"
"adicionar categoria Animais 🐾"
```

---

## Manutenção

**Servidor sempre ativo**: configurar UptimeRobot em https://uptimerobot.com
- Monitor Type: `HTTP(s)`
- URL: `https://sua-url.up.railway.app`
- Intervalo: `5 minutos`

**Logs**: Railway → serviço → Deploy Logs / HTTP Logs
