# Discadora LIFE

Extensão do Google Chrome (também funciona no Microsoft Edge) que abre um painel ao lado da Api4Com e percorre a sua planilha de leads, um contato por vez.

**O que ela faz, e só isso:**

1. Você importa a planilha com **Nome, Telefone, Etapa e Campanha**.
2. Você clica em **Próximo**: o painel mostra o lead (nome, telefone, etapa atual e campanha), **cola o número no campo da Api4Com e clica em ligar**.
3. A ligação fica em andamento. **A extensão nunca desliga**: quem desliga é você na Api4Com, ou a própria Api4Com (por exemplo, quando cai na caixa postal).
4. Nada mais acontece até você clicar em **Próximo** de novo. Aí ela passa para a próxima linha e repete.

---

## Instalação (uma vez por computador)

1. Baixe este repositório: botão verde **Code → Download ZIP** no GitHub. Depois extraia o ZIP.
2. No Chrome, abra `chrome://extensions` (no Edge: `edge://extensions`).
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta **`extensao`**.
5. Clique no ícone de quebra-cabeça da barra do Chrome e **fixe** a "Discadora LIFE".

> Se a aba da Api4Com já estava aberta antes de instalar, aperte **F5** nela uma vez.

## Como usar

1. Abra a Api4Com no navegador e faça login normalmente.
2. Clique no ícone da **Discadora LIFE**. O painel abre na lateral direita.
3. **Baixar modelo**: baixa `modelo_discadora.xlsx` com as 4 colunas.
4. Preencha o modelo, ou exporte do CRM uma base com essas 4 informações.
5. **Importar planilha**: escolha o arquivo `.xlsx` ou `.csv`.
6. Clique em **Próximo** para ligar para o primeiro contato. Quando terminar a ligação, clique em **Próximo** de novo para ir ao seguinte.

A lista e a posição ficam salvas: se fechar o painel ou o navegador, ao abrir de novo você continua do mesmo contato. Para recomeçar, importe a planilha de novo.

## Modelo da planilha

| Nome | Telefone | Etapa | Campanha |
|---|---|---|---|
| Maria Souza | (11) 98888-7777 | Proposta enviada | Black Friday |

- A extensão lê apenas a **primeira aba**.
- O telefone pode ter parênteses, espaços e traço. Linhas sem telefone são ignoradas (o painel informa quantas).
- Se a célula tiver dois telefones (`11 3333-2222 / 11 97777-6666`), usa o primeiro.
- Exportações do CRM com outros títulos também funcionam: `Nome do lead`, `Celular`, `Contato`, `WhatsApp`, `Status do lead`, `Estágio`, `Nome da campanha` etc. Colunas a mais (e-mail, ID...) são ignoradas.

## Configurações (no fim do painel)

**Prefixo antes do número.** Use quando a Api4Com exigir algo antes do número (ex.: `0`, `55` ou `+55`). Deixe vazio se a planilha já vier no formato certo.

**Como ligar.** Há duas opções:

- **Colar o número na página da Api4Com e clicar em ligar** (padrão). A extensão procura sozinha o campo de número e o botão "Ligar" na aba da Api4Com.
  - Use **Testar** para conferir: o campo e o botão encontrados ficam contornados em laranja por 3 segundos. O teste **não liga**.
  - Se ela não achar o campo ou o botão certo, informe os **seletores**. Para pegar um seletor: clique com o botão direito no campo, depois em **Inspecionar**, depois botão direito na linha destacada, **Copiar → Copiar seletor**, e cole na configuração.
  - Se na Api4Com você liga apertando Enter, marque **Ligar apertando Enter**.
- **Usar a API da Api4Com.** Não precisa da página aberta: a extensão chama a API de discagem da Api4Com (`POST https://api.api4com.com/api/v1/dialer`) com o seu **token** e **ramal**. O seu ramal toca primeiro e, ao atender, a Api4Com liga para o lead. Normalmente é preciso usar o prefixo `+55`.

As configurações, a planilha e o token ficam salvos **só neste navegador**. Nada é enviado para outro lugar além da Api4Com.

## Se a sua Api4Com não estiver em `api4com.com`

A extensão só atua em páginas `https://*.api4com.com/`. Se o seu discador abre em outro endereço, troque o endereço nas duas linhas `api4com.com` do arquivo `extensao/manifest.json` (em `host_permissions` e `matches`) e clique em **Recarregar** a extensão em `chrome://extensions`.

## Arquivos

```
extensao/
  manifest.json        configuração da extensão
  painel.html/css/js   painel lateral (tela, planilha, botão Próximo)
  planilha.js          leitura de .xlsx e .csv (sem bibliotecas externas)
  discar.js            roda na página da Api4Com: cola o número e liga
  background.js        abre o painel ao clicar no ícone
  modelo/              modelo da planilha (.xlsx)
```
