# PowerShell 5.1 corrompe acentos e emojis dos arquivos

**Nunca** editar arquivo deste repo com `Get-Content` + `Set-Content` no
Windows PowerShell 5.1 (o daqui). Todo o projeto é em português e cheio de
emoji — o estrago é garantido e silencioso.

## Por quê

`Get-Content -Raw` lê usando a **codepage ANSI do sistema**, não UTF-8. Os
arquivos estão em UTF-8, então "Transferência" já vira `TransferÃªncia` na
memória. Gravar de volta com `Set-Content -Encoding utf8` codifica esse lixo
outra vez, e o resultado fica `TransferÃƒÂªncia`. Passa no lint, passa no
build, e só aparece na tela do usuário.

Aconteceu em 17/08/2026 numa troca de `px-5` por `px-4 sm:px-5` em 7 modais
de `pages/Estoque/`: o `git diff --stat` denunciou (ModalFaltantes.jsx
mostrou 22 linhas alteradas para 3 substituições). Recuperado com
`git checkout --` nos arquivos.

## O que fazer

Usar a ferramenta **Edit** para qualquer alteração de texto. Se for
inevitável usar script, `-Encoding utf8` na LEITURA também
(`Get-Content -Raw -Encoding utf8`), nunca só na escrita.

## Sinal de alerta

`git diff --stat` com muito mais linhas que o esperado para a substituição
feita. Confirmar com `grep -l 'Ã.\|â€\|ðŸ'` nos arquivos tocados — mas
cuidado com falso positivo: "DESCRIÇÃO" casa com `Ã.` legitimamente.

## Armadilha vizinha

`Edit` com `replace_all` em `"px-5 "` (com espaço no fim) devolve
`px-4 sm:px-5py-4` — as classes colam e o Tailwind ignora as duas. Conferir
com `grep 'px-5[a-z]'` depois de substituições que envolvam espaços.
