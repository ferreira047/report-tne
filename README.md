# Report Backlog TNE

Painel para acompanhar o backlog diário de chamados de **Planta Interna – Manutenção Corretiva** da TNE. Você importa a planilha do dia e o painel mostra encerramentos, cancelamentos e pendenciamentos por bucket, grupo, estado e prioridade.

O projeto também tem a **Análise Diária de Técnicos** (`index.html`), que monta a situação de cada técnico da TNE1 e TNE2 a partir da extração do TOA. As páginas usam a mesma planilha: o que é importado numa já abre na outra. No cabeçalho, os botões **Análise de técnicos**, **Report Backlog** e **Chamados repetidos** ficam lado a lado para escolher a tela; a que está aberta fica destacada.

Tudo roda no navegador: a planilha não é enviada a nenhum servidor.

## Como usar

1. Abra o arquivo `backlog.html` no navegador (duplo clique já basta, não precisa de servidor).
2. Entre com seu usuário e senha na tela de login (veja **Login** abaixo).
3. Clique em **Escolher arquivo** ou arraste a planilha (`.xlsx`, `.xls` ou `.csv`) para a área indicada.
4. Se o arquivo tiver mais de uma aba, escolha a aba em **Aba para análise** (a aba `Page 1` da extração do TOA vem selecionada).
5. Use os cards **Encerradas** e **Pendenciamentos** para alternar o status analisado nos gráficos e tabelas.

É preciso estar conectado à internet, porque o Tailwind CSS e a biblioteca SheetJS (leitura e geração de Excel) são carregados por CDN.

## Login

As duas páginas exigem login (`login.html`). Só os usuários `adminTne`, `adminTmg` e `admin047` entram; a senha é combinada com a equipe e não fica escrita no projeto. O login vale para a aba do navegador; o botão de saída fica ao lado do botão de tema.

O login também protege o cadastro dos técnicos: ele é publicado só criptografado (`app/cadastro.enc.js`, AES-256-GCM) e cada usuário abre a chave com a própria senha, no navegador. O cadastro sem criptografia fica em `privado/cadastro.js`, que **não pode ser publicado** (está no `.gitignore`).

Para mudar o cadastro, os usuários (lista `USUARIOS`) ou a senha, edite `privado/cadastro.js` ou o script e gere de novo:

```
pip install cryptography
python ferramentas/criptografar_cadastro.py
```

O script pede a senha no terminal e regrava `app/cadastro.enc.js`.

## O que o painel mostra

- **Resumo**: total de TSKs do tipo analisado, encerradas, canceladas e pendenciamentos.
- **Encerradas por bucket**: tabela com a quantidade por bucket e grupo. O botão **Filtrar fila técnica** mostra só os técnicos, com opções de ordenação (mais encerradas, menos encerradas ou por CM/região) e o detalhamento por CM. Com o filtro ativo, o gráfico de volume também mostra só a fila técnica.
- **Por estado**: encerradas, canceladas e pendenciamentos agrupados pelo estado do CM, com filtro para Todas, Fila técnica ou Centralizado.
- **Contagem por status**: iniciada, cancelada, concluída, não iniciado e pendente.
- **Gráficos de rosca**: Centralizado x Fila de técnicos, TNE 1 x Centralizado, TNE 2 x Centralizado e TNE 1 x TNE 2.
- **Por prioridade**: P1 a P5.
- **Volume por bucket**: barras com a participação de cada bucket no total (azul para Centralizado, verde para técnicos).

## Ações

- **Copiar parcial**: copia para a área de transferência o texto da parcial de backlog, pronto para colar no chat. Preencha antes os campos **Entrantes** e **Backlog**: eles entram no texto e no cálculo de tickets analisados. A última linha, **SITES FORA COM FLAG 1**, é consultada no Genesis na hora do clique (veja abaixo); se o Genesis não responder, a linha fica fora do parcial e o painel avisa.
- **Copiar gráfico**: copia a imagem do gráfico **Encerradas por grupo** (no tema, claro ou escuro, em que a página está) para colar no report junto com o parcial. Onde o navegador não permite copiar imagem, ela é baixada em PNG.
- **Exportar técnicos por região**: gera um Excel `tecnicos-por-regiao-TNE-AAAA-MM-DD.xlsx` com uma aba geral ("Tec por região") e uma aba por estado, listando CM, técnico e TSKs encerradas.
- **Limpar**: descarta a planilha carregada.

## NE ID fora (Genesis)

O número de NE IDs fora vem do Painel Online da TNE no Genesis (`painel_online_peso.php?regional=TNE`): NE IDs (coluna Site) distintos com **Flag 1**, o mesmo número que o Genesis mostra com o filtro "Flag 1" marcado. O Genesis não deixa outras páginas lerem os dados dele, então quem consulta é o **TrocaIP.exe** (projeto TrocaIP), o mesmo programa da troca de IP:

1. Conecte na VPN.
2. Abra o `TrocaIP.exe` (ícone TLP perto do relógio). Ele responde em `http://127.0.0.1:8765/genesis/ne-fora`.
3. Abra o `backlog.html` (pelo site ou com duplo clique) e use **Copiar parcial**.
4. No site publicado, o navegador pede na primeira vez para o site acessar **dispositivos na rede local**: clique em **Permitir**. Sem essa permissão a linha fica fora do parcial. Se tiver bloqueado, libere no ícone à esquerda do endereço → **Permissões do site** e recarregue a página.

O endereço do Genesis e a porta ficam no topo de `genesis_ne_fora.py`, no projeto TrocaIP. Se mudar a porta, ajuste também `GENESIS_NE_DOWN_URL` em `app/main.js`.

## Análise Diária de Técnicos (`index.html`)

- **Extração do TOA (Page 1)**: com as colunas `Provedor`, `Tipo da Atividade` e `Estado`, a contagem por técnico (`TLP-T…-NOME`) é montada como na tabela dinâmica. CMs, `COMMAND_CENTER` etc. ficam de fora.
- **Cadastro de técnicos**: CM, responsável, horário, região (TNE1/TNE2) e gerente (ERIC/ROBSON) vêm do cadastro padrão (aberto no login), pelo código do técnico. Técnicos fora do cadastro não entram na análise e aparecem no aviso após a importação. **Atualizar cadastro** aceita uma planilha com `Nome do recurso`, `Tempo de trabalho`, `Unidade organizacional`, `Coordenador`, `Regional` e `Gerente`; ela fica salva no navegador e tem prioridade. **Restaurar padrão** descarta o cadastro enviado.
- **Tipo de técnico**: corretiva ou preventiva, pelas TSKs em fila (Iniciado, Não iniciado, Pendente). Na visão de um tipo, a coluna Concluída soma as concluídas de qualquer tipo: quem concluiu uma preventiva e tem corretiva em fila conta como com conclusão. Do mesmo jeito, quem tem uma preventiva (ATSK) iniciada ou pendente não entra em **Não iniciaram**.
- **Situações**: com conclusão (concluída > 0), sem conclusão + com pendência e sem conclusão + sem pendência (crítico); card **Não iniciaram**.
- **Filtros** por gerente, responsável, região, CM, situação e técnico; resumos por região, gerente e responsável.
- **Exportações**: planilha de técnicos, relatório por gerente (`relatorio-gerente-TNE-AAAA-MM-DD.xlsx`: técnicos sem conclusão + sem pendência numa aba geral e numa aba por estado do CM), por responsável (`tecnicos-por-responsavel-TNE-AAAA-MM-DD.xlsx`: aba geral e uma aba por estado do CM), **Exportar** do Resumo por região (`tecnicos-por-regiao-TNE-AAAA-MM-DD.xlsx`, no mesmo formato do backlog: aba "Tec por região" e uma aba por estado do CM, com CM, nome do técnico e TSKs encerradas), técnicos por região (aba geral com região e estado, uma aba por TNE1/TNE2 e uma aba por estado do CM) e **Exportar report** (imagem da tabela, dividida em partes acima de 30 técnicos).
- Também aceita uma aba já consolidada (`Planilha2`) com as colunas Técnicos, Concluída e Pendente.

## Chamados Repetidos (`repetidos.html`)

Aberta pelo botão **Chamados repetidos** no cabeçalho. Tem dois campos de upload, **ONLINE** e **NÃO AGENDADAS** (extrações do TOA, com as mesmas colunas do backlog); dá para anexar só um deles.

- O campo **ONLINE** usa a mesma planilha compartilhada das outras páginas (`app/shared-file.js`): o que foi importado no backlog ou na análise de técnicos já abre ali, e o que é importado ali abre nas outras. A **NÃO AGENDADAS** não vai para as outras páginas, mas também fica guardada na sessão da aba: as duas continuam carregadas ao apertar F5, até usar **Limpar** ou fechar a aba.
- Só entram as linhas de `Planta Interna - Manutenção Corretiva` (coluna D) com `Repetido` na coluna **Critério** (GD).
- Card **Total de TSKs repetidas** (Online e Não agendadas juntas, cada TSK uma vez), ao lado do resumo por estado. A quantidade de cada planilha aparece no aviso abaixo dos campos de upload.
- Cada TSK conta uma vez por planilha, mesmo com várias atividades. As TSKs em `Não iniciado` (coluna E) em qualquer atividade de qualquer planilha vêm primeiro na tabela, têm filtro próprio e coluna no resumo por estado.
- **Resumo por estado**: Online, Não agendadas, Não iniciados e Total por estado do CM (coluna AK; sem CM reconhecido, pela UF), com filtro Todas, Fila técnica ou Centralizado. Os 8 estados da TNE aparecem sempre; **Outros** só quando há TSK.
- A tabela mostra TSK, planilha, provedor, estado, NE ID, CM, UF, prioridade (GI) e fim do SLA, com filtro por planilha e **Exportar Excel** (`chamados-repetidos-TNE-AAAA-MM-DD.xlsx`, com o filtro atual).
- Colunas, tipo e valor do critério ficam nas constantes `COLUMNS`, `TARGET_TYPE` e `REPEATED_CRITERION` no início de `app/repetidos.js`.

## Tema claro e escuro

As páginas abrem no tema claro. O botão de lua/sol no cabeçalho alterna para o escuro, e a escolha fica salva no navegador e vale para as duas páginas (`app/theme.css` e `app/theme.js`).

## Regras da análise

- Só entram as linhas cujo tipo de atividade é `Planta Interna - Manutenção Corretiva`.
- TSKs (coluna B) concluídas mais de 2 vezes (`MAX_COMPLETIONS_PER_TSK`) ficam fora do report de encerradas, com aviso listando as TSKs retiradas.
- Comparações de tipo e status ignoram acentos, maiúsculas/minúsculas e espaços extras.
- Buckets que começam com `TLP-T<número>` contam como **Fila de técnicos**; os demais, como **Centralizado** (Command Center).
- O estado de cada técnico é definido pelo CM (coluna AK), com base nas listas de CMs por estado em `app/main.js`.
- **TNE 1**: Alagoas, Bahia, Piauí e Sergipe. **TNE 2**: Ceará, Paraíba, Pernambuco e Rio Grande do Norte.
- O tipo do relatório (FMT, TMG, TNE ou TRJ), usado no texto da parcial, é detectado pelo nome do arquivo ou, se não houver, pelo conteúdo da planilha.

## Colunas esperadas na planilha

| Coluna | Conteúdo |
| --- | --- |
| A | Bucket |
| B | TSK |
| D | Tipo da atividade |
| E | Status |
| AK | CM |
| GI | Prioridade |

Se o layout da planilha mudar, ajuste as constantes no início de `app/main.js` (`COLUMN_BUCKET`, `COLUMN_TYPE`, `COLUMN_STATUS`, `COLUMN_CM`, `COLUMN_PRIORITY` e `TARGET_TYPE`). As listas de CMs de cada estado (`ALAGOAS_TECHNICIAN_CMS`, `BAHIA_TECHNICIAN_CMS` etc.) também ficam ali.

## Estrutura

```
login.html           Tela de login
backlog.html         Report Backlog TNE
repetidos.html       Chamados Repetidos TNE (planilhas ONLINE e NÃO AGENDADAS)
index.html           Análise Diária de Técnicos TNE
app/auth.js          Login, sessão e abertura do cadastro criptografado
app/cadastro.enc.js  Cadastro padrão dos técnicos TNE1/TNE2, criptografado (gerado pelo script)
app/main.js          Backlog: leitura da planilha, cálculos, gráficos, cópia da parcial e exportação
app/repetidos.js     Chamados repetidos: leitura das duas planilhas, filtro pela coluna Critério e exportação
app/app.js           Análise de técnicos: extração do TOA, situações, filtros e exportações
app/theme.css        Tokens de cor dos temas claro e escuro (compartilhados)
app/theme.js         Alternância e preferência de tema (compartilhada)
app/shared-file.js   Compartilha a planilha importada entre as páginas na sessão do navegador
ferramentas/criptografar_cadastro.py  Gera o app/cadastro.enc.js
privado/cadastro.js  Cadastro sem criptografia (NÃO publicar)
```
