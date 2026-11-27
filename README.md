# Discadora LIFE

Painel que percorre a sua planilha de leads, um contato por vez, ligando pela **Api4Com**. Funciona de três jeitos, com as mesmas telas:

- **Planilha Google (recomendado):** a Discadora abre por um link do Google, no celular ou no PC, lê os leads direto da planilha e grava os registros nas colunas ao lado. Ramal e token ficam salvos na sua conta Google.
- **Site (Vercel):** abre pelo link do site; você importa a planilha (.xlsx/.csv) e exporta com os registros. É de uso pessoal: usa o token guardado na Vercel e o ramal 1204 como padrão. Para a equipe, use a Planilha Google.
- **Extensão do Chrome/Edge:** igual ao site, mas como painel na lateral do navegador.

**O que ela faz:**

1. Você importa a planilha com **Nome, Telefone, Etapa e Campanha** e vê a contagem de leads: total, da etapa escolhida e quantos faltam ligar.
2. Se quiser, filtra uma **etapa** para ligar só para os leads dela.
3. Você clica em **Ligar**: o painel mostra o lead (nome, telefone, etapa atual e campanha) e pede para a Api4Com **ligar do seu ramal para o lead**. A ligação acontece no seu **Webphone da Api4Com**, e a data/hora do disparo fica registrada.
4. A ligação fica em andamento. **A Discadora não desliga sozinha**: quem desliga é você no Webphone, ou a própria Api4Com (por exemplo, quando cai na caixa postal). A única exceção: a Api4Com só permite **uma ligação por vez**, então, quando você clica para ligar para o próximo (ou discar de novo), a Discadora encerra antes a ligação anterior, se ela ainda estiver ativa.
5. Ao terminar, você registra o resultado com um dos quatro botões:
   - **Não atendeu**: registra, encerra a ligação (se o lead ainda estiver chamando) e já liga para o próximo lead da etapa.
   - **Atendeu**: abre um campo para anotar o que foi falado.
   - **Agendou** (em destaque): pede a **data e a hora da reunião** e uma observação opcional.
   - **Descartar**: registra o lead como descartado e abre um campo para escrever o motivo.

   Em Atendeu, Agendou e Descartar, você escolhe **Salvar e ligar para o próximo** ou **Só salvar** (para pausar).
6. Nada é discado sem o seu clique. Os registros vão para as colunas **Data/hora da ligação, Resultado, Anotação e Reunião agendada** (na Planilha Google, direto na planilha; no site e na extensão, pelo botão **Exportar planilha**).
7. Abaixo das Configurações ficam duas tabelas simples: os **10 últimos registros** (nome, etapa, telefone e status colorido: Atendeu verde, Não atendeu vermelho, Agendou laranja, Descartado cinza) e os **10 próximos** da fila da etapa escolhida. Em tela larga elas ficam lado a lado; no celular, uma embaixo da outra.

> **Por que pela API e não colando o número na tela do Webphone?** O Webphone da Api4Com é uma extensão do Chrome, e o Chrome não permite que uma extensão mexa na tela de outra. A API da Api4Com faz o mesmo papel: a chamada sai do seu ramal e aparece no seu Webphone.

---

## Planilha Google (recomendado)

Configuração única, uns 5 minutos:

1. **Converta a planilha.** Abra o arquivo no Google Drive. Se ele for um Excel (`.xlsx`), clique em **Arquivo → Salvar como Planilhas Google** e use a planilha nova daqui para frente. Os leads ficam na **primeira aba**, com os títulos na **linha 1** (Nome, Telefone, Etapa, Campanha; outros títulos de CRM também funcionam).
2. Na planilha: **Extensões → Apps Script**.
3. No arquivo `Código.gs`, apague tudo e cole o conteúdo de [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
4. Clique no **+** ao lado de "Arquivos" → **HTML**, dê o nome `Discadora` (exatamente assim), apague tudo e cole o conteúdo de [`apps-script/Discadora.html`](apps-script/Discadora.html).
5. Salve (ícone de disquete).
6. **Implantar → Nova implantação →** engrenagem **→ App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
   - **Implantar**
7. Autorize: escolha sua conta. Se aparecer "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)** e depois em **Permitir**. É o seu próprio script, por isso o aviso.
8. Copie o **URL do app da Web** (termina em `/exec`). Abra no celular e no PC, logado na mesma conta Google. No celular, use **Adicionar à tela inicial**.
9. Na Discadora: **Configurações** → senha → cole o **seu token da Api4Com** → **Salvar**. O **ramal é descoberto sozinho pelo token** e aparece no campo Ramal. Token e ramal ficam salvos na sua conta Google e valem no celular e no PC. O token não aparece na planilha nem no código.

**No dia a dia:**

- Deixe o **Webphone da Api4Com aberto e Online no PC**, em **um navegador só**. A Api4Com liga primeiro para o seu ramal (o Webphone atende sozinho) e depois para o lead. Você pode disparar as ligações pelo celular. Com o Webphone fechado ou offline, a Discadora avisa: "O Webphone não atendeu".
- Lead novo: cole na planilha e clique em **Atualizar planilha** na Discadora.
- Na primeira ligação, a Discadora cria logo depois da última coluna: **Data/hora da ligação**, **Resultado**, **Anotação** e **Reunião agendada**. Se essas colunas já existirem, ela usa as que existem (numa planilha que já tinha as três primeiras, a "Reunião agendada" é criada ao lado).
- Se a planilha mudar de ordem enquanto você liga, a Discadora encontra o lead pelo telefone antes de gravar.
- Fechou e abriu de novo (até em outro aparelho)? Ela continua no lead que estava em ligação, porque o andamento está na própria planilha.

**Ramal que muda:** ninguém precisa digitar ramal. A Discadora descobre o ramal pelo token. Se a Api4Com responder que o ramal não existe mais, ela busca o ramal atual do usuário e refaz a ligação sozinha. Isso segue a orientação da documentação da Api4Com.

### Replicar para outros colaboradores

A Api4Com exige que **cada pessoa ligue com o próprio token**, e o token define o ramal. Por isso cada colaborador tem **a sua cópia** da planilha, com o código junto e a lista de leads dele.

**Uma vez (quem já usa a Discadora):**

1. Na sua planilha da Discadora: **Arquivo → Fazer uma cópia**, com o nome "Discadora LIFE – Modelo". A cópia leva o código junto. Seu token **não** vai junto, porque ele fica na sua conta Google, não na planilha.
2. No modelo, apague os leads (deixe só a linha 1 com os títulos) e as colunas de registro (Data/hora da ligação, Resultado, Anotação, Reunião agendada).
3. **Compartilhar** o modelo com os colaboradores como **Leitor**.

**Cada colaborador (uns 5 minutos):**

1. **Webphone:** instalado no Chrome e logado com o **próprio usuário** da Api4Com, com status "Online".
2. **Token:** no Portal da Api4Com, **Tokens de acesso → Novo Token de Acesso → validade "Nunca expira"** → copiar. Ou use depois o botão "Gerar o token com o e-mail e a senha", na Discadora.
3. Abrir o link do modelo e clicar em **Arquivo → Fazer uma cópia**. A cópia fica no Drive dele, já com o código.
4. Colar os leads dele na cópia (primeira aba, títulos na linha 1).
5. Na cópia: **Extensões → Apps Script → Implantar → Nova implantação →** engrenagem **→ App da Web**. "Executar como": **Eu**; "Quem pode acessar": **Somente eu**. **Implantar** e autorizar ("Avançado → Acessar" se aparecer o aviso).
6. Abrir o link que termina em `/exec` (no PC e no celular) → **Configurações** → senha → colar **o token dele** → **Salvar**. O ramal dele aparece sozinho.

Pronto: cada um liga com o próprio token e ramal, e os registros vão para a planilha de cada um.

**Quando a Discadora for atualizada:** cole de novo os dois arquivos (passos 3 e 4), salve e vá em **Implantar → Gerenciar implantações →** lápis **→ Versão: Nova versão → Implantar**. O link continua o mesmo.

**Problema comum:** "Não foi possível abrir o arquivo" aparece quando o navegador tem várias contas Google logadas. Abra o link numa janela anônima (ou num perfil) só com a conta dona da planilha.

## Publicar como site na Vercel

O repositório já vem com o `vercel.json` pronto: não há etapa de build, o site é servido a partir da pasta `extensao/`, e as funções em `api/` repassam os pedidos para a Api4Com. Elas existem porque o navegador bloqueia chamadas diretas de um site para a API da Api4Com (CORS), e não guardam nada.

1. Na Vercel: **Add New → Project** e importe este repositório.
2. Não precisa escolher framework nem comando de build: o `vercel.json` define tudo (inclusive se o projeto tiver sido criado como Angular).
3. **Token padrão (recomendado):** em **Settings → Environment Variables**, crie a variável `API4COM_TOKEN` com o token da API da Api4Com, marcada para **Production** e **Preview**. Assim o site liga sem ninguém precisar digitar token, e o token fica só no servidor: não aparece no código nem no navegador.
4. **Deploy** (ou **Redeploy**, se o projeto já existia: variáveis novas só valem depois de um novo deploy). O endereço do site abre direto na Discadora.

> **Nunca coloque o token ou a senha da Api4Com no código.** Este repositório é público.

No site, a planilha e os registros ficam salvos no navegador de cada pessoa (não no servidor).

## Instalar como extensão (opcional, uma vez por computador)

1. Baixe este repositório: botão verde **Code → Download ZIP** no GitHub. Depois extraia o ZIP.
2. No Chrome, abra `chrome://extensions` (no Edge: `edge://extensions`).
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta **`extensao`**.
5. Clique no ícone de quebra-cabeça da barra do Chrome e **fixe** a "Discadora LIFE".

## Configuração (uma vez por pessoa)

As **Configurações** ficam no fim do painel e são **protegidas por senha** (peça ao administrador). Elas voltam a trancar ao recarregar a página ou ao clicar em **Trancar**.

- **Ramal:** já vem com o ramal padrão (`1204`). Quem usar outro ramal troca aqui. Ele aparece no topo do Webphone, ao lado de "Usuário".
- **Token da API:** de preferência um token que **nunca expira**. No Portal da Api4Com, ele fica em **Tokens de acesso → Novo Token de Acesso → validade "Nunca expira"**. O botão **Gerar o token com o e-mail e a senha** também já cria um token sem validade.
  - **No site**, se o `API4COM_TOKEN` estiver configurado na Vercel, não precisa preencher (o painel avisa).
  - **Na extensão**, ou para usar um token próprio no site, cole o token ou clique em **Gerar o token com o e-mail e a senha da Api4Com**. A senha vai só para a Api4Com e não fica salva.

Se o token vencer, a Discadora avisa: atualize o `API4COM_TOKEN` na Vercel (e faça um Redeploy) ou gere um novo em Configurações.

A senha das Configurações é uma trava simples contra mudanças por engano. Ela não protege o site: quem tiver o endereço do site consegue usar a Discadora.

**Sem token configurado**, a Discadora ainda funciona no modo manual: o botão de ligar mostra o lead e **copia o número**; você cola no Webphone (Ctrl+V) e clica em Discar. A data/hora registrada é a da cópia.

## Como usar

1. Deixe o Webphone da Api4Com logado e **Online**.
2. Abra a Discadora: o link do site, ou o ícone da extensão (o painel abre na lateral direita).
3. **Baixar modelo**: baixa `modelo_discadora.xlsx` com as 4 colunas.
4. Preencha o modelo, ou exporte do CRM uma base com essas 4 informações.
5. **Importar planilha**: escolha o arquivo `.xlsx` ou `.csv`.
6. (Opcional) Escolha a **Etapa** no filtro. Os números mostram o total de leads, quantos há na etapa e quantos faltam ligar.
7. Clique em **Ligar para o primeiro lead**. Se o Webphone tocar, atenda: a Api4Com completa a ligação para o lead.
8. Quando terminar e desligar no Webphone, clique em **Não atendeu** (vai direto para o próximo) ou **Atendeu** (anote o que foi falado e salve).
9. Ao final, clique em **Exportar planilha** para baixar `<nome-da-planilha>_ligacoes.xlsx` com os registros.

Se der erro ao ligar, aparecem **Discar de novo** e **Pular lead**. Para ligar de novo para o lead em andamento, use **Discar este lead de novo**.

**Continuar depois:** a lista, os registros e o lead em andamento ficam salvos no navegador. Se fechar e abrir de novo, você continua de onde parou. Também dá para importar a planilha exportada: os leads já trabalhados (com data/hora ou resultado) não são chamados de novo.

**Nova rodada** (por exemplo, ligar de novo para quem não atendeu): importe uma planilha sem as colunas de registro, como a exportação original do CRM.

## Modelo da planilha

| Nome | Telefone | Etapa | Campanha |
|---|---|---|---|
| Maria Souza | (11) 98888-7777 | Proposta enviada | Black Friday |

- A extensão lê apenas a **primeira aba**.
- O telefone pode ter parênteses, espaços e traço. Números com DDD (10 ou 11 dígitos) recebem o +55 automaticamente. Linhas sem telefone são ignoradas (o painel informa quantas).
- Se a célula tiver dois telefones (`11 3333-2222 / 11 97777-6666`), usa o primeiro.
- Exportações do CRM com outros títulos também funcionam: `Nome do lead`, `Celular`, `Contato`, `WhatsApp`, `Status do lead`, `Estágio`, `Nome da campanha` etc.
- Colunas a mais (e-mail, ID...) não atrapalham e voltam intactas na planilha exportada, junto com as linhas sem telefone.

**Planilha exportada:** as mesmas colunas da planilha importada, mais:

| Data/hora da ligação | Resultado | Anotação | Reunião agendada |
|---|---|---|---|
| 26/11/2026 14:20 | Agendou | Reunião por vídeo | 02/12/2026 15:30 |
| 26/11/2026 14:31 | Descartado | Sem interesse, já tem consórcio | |

O resultado pode ser `Atendeu`, `Não atendeu`, `Agendou`, `Descartado` ou `Pulado`. As datas são datas de verdade no Excel/Planilhas (dá para filtrar e ordenar).

## Como a Discadora fala com a Api4Com

Segue a documentação oficial ("Integração utilizando Webphone API4COM", em developers.api4com.com):

- **Ligar:** `POST /calls` com `extension` e `caller` (o ramal) e `called` (o número em `+55DDDNÚMERO`). A rota antiga `/dialer` foi descontinuada pela Api4Com e não é mais usada.
- **Encerrar a anterior:** `POST /calls/{id}/hangup`, só quando você pede a próxima ligação e a anterior ainda está ativa.
- **Dados enviados:** no `metadata` da ligação vão só um identificador da Discadora e um código da tentativa. A Api4Com orienta não mandar dados pessoais ali (nome, telefone).
- **Limite da Api4Com:** 15 ligações por minuto por ramal.

## Privacidade

A planilha, os registros das ligações, o ramal e o token ficam salvos **só neste navegador**. A Discadora só se comunica com a Api4Com (`api.api4com.com`; no site, passando pelas funções `api/` da Vercel), e só em dois momentos: ao gerar o token e ao pedir cada ligação. Junto com o pedido de ligação vão só o ramal e o número do lead (sem nome, etapa ou campanha).

## Arquivos

```
apps-script/
  Codigo.gs            versão Planilha Google: lê/grava a planilha e liga pela Api4Com
  Discadora.html       a tela para o Apps Script (GERADO: node ferramentas/gerar-apps-script.js)
ferramentas/           gerador do Discadora.html a partir de extensao/
vercel.json            configuração do site na Vercel (sem build)
api/                   funções da Vercel: repassam login e ligação para a Api4Com e informam se há token no servidor
extensao/
  painel.html/css/js   a tela (planilha, filtro, contagens, ligação pela API, registros)
  planilha.js          leitura de .xlsx/.csv e geração do .xlsx exportado (sem bibliotecas externas)
  fontes/              fonte Montserrat (licença OFL)
  modelo/              modelo da planilha (.xlsx)
  manifest.json        configuração da extensão do Chrome
  background.js        abre o painel ao clicar no ícone da extensão
```
