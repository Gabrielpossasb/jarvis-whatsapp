# .memory/ — Memória de sessões do JARVIS

Texto no disco, consultável com grep. Leia antes de refazer uma decisão.

## Pastas

- **sessions/** — resumos de sessões de trabalho: o que foi feito, o que ficou pendente, próximos passos.
- **decisions/** — decisões arquiteturais com o porquê. Consulte aqui antes de mudar algo estrutural.
- **gotchas/** — pegadinhas e armadilhas descobertas. Consulte ao tocar em código crítico.
- **concepts/** — como as peças do sistema funcionam (fluxos, padrões recorrentes).

## Como consultar

```
# Ver todas as sessões recentes
ls .memory/sessions/

# Buscar uma decisão antes de mudar algo
grep -r "supabase" .memory/decisions/

# Checar pegadinhas antes de mexer em extrato
grep -r "extrato\|duplicat" .memory/gotchas/
```

## Regras

- Arquivo errado é pior que nenhum arquivo. Só registre o que você verificou no código.
- Um arquivo por assunto. Nomes descritivos e buscáveis por grep.
- Mantenha curto: contexto, decisão/pegadinha, porquê, referência.
