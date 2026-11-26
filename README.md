# Discadora LIFE

Painel que percorre a sua planilha de leads, um contato por vez, ligando pela **Api4Com**. Funciona de três jeitos, com as mesmas telas:

- **Planilha Google (recomendado):** a Discadora abre por um link do Google, no celular ou no PC, lê os leads direto da planilha e grava os registros nas colunas ao lado. Ramal e token ficam salvos na sua conta Google.
- **Site (Vercel):** abre pelo link do site; você importa a planilha (.xlsx/.csv) e exporta com os registros.
- **Extensão do Chrome/Edge:** igual ao site, mas como painel na lateral do navegador.

**O que ela faz:**

1. Você importa a planilha com **Nome, Telefone, Etapa e Campanha** e vê a contagem de leads: total, da etapa escolhida e quantos faltam ligar.
2. Se quiser, filtra uma **etapa** para ligar só para os leads dela.
3. Você clica em **Ligar**: o painel mostra o lead (nome, telefone, etapa atual e campanha) e pede para a Api4Com **ligar do seu ramal para o lead**. A ligação acontece no seu **Webphone da Api4Com**, e a data/hora do disparo fica registrada.
4. A ligação fica em andamento. **A Discadora nunca desliga**: quem desliga é você no Webphone, ou a própria Api4Com (por exemplo, quando cai na caixa postal).
5. Ao terminar, você registra o resultado:
   - **Não atendeu**: registra e já liga para o próximo lead da etapa.
   - **Atendeu**: abre um campo para anotar o que foi falado. Depois, **Salvar e ligar para o próximo** ou **Só salvar** (para pausar).
6. Nada é discado sem o seu clique. **Exportar planilha** baixa a planilha com as colunas **Data/hora da ligação, Resultado e Anotação** preenchidas.

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
9. Na Discadora: **Configurações** → senha → cole o **token da Api4Com** → **Salvar**. O ramal já vem como `1204`. Ramal e token ficam salvos na sua conta Google e valem no celular e no PC. O token não aparece na planilha nem no código.

**No dia a dia:**

- Deixe o **Webphone da Api4Com aberto e Online no PC**: a ligação sai pelo ramal 1204, que toca nesse Webphone. Você pode disparar as ligações pelo celular.
- Lead novo: cole na planilha e clique em **Atualizar planilha** na Discadora.
- Na primeira ligação, a Discadora cria logo depois da última coluna: **Data/hora da ligação**, **Resultado** e **Anotação**. Se essas colunas já existirem, ela usa as que existem.
- Se a planilha mudar de ordem enquanto você liga, a Discadora encontra o lead pelo telefone antes de gravar.
- Fechou e abriu de novo (até em outro aparelho)? Ela continua no lead que estava em ligação, porque o andamento está na própria planilha.

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
- **Token da API:**
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

| Data/hora da ligação | Resultado | Anotação |
|---|---|---|
| 26/11/2026 14:20 | Atendeu | Pediu retorno na sexta às 10h |

O resultado pode ser `Atendeu`, `Não atendeu` ou `Pulado`. A data/hora é uma data de verdade no Excel (dá para filtrar e ordenar).

## Privacidade

A planilha, os registros das ligações, o ramal e o token ficam salvos **só neste navegador**. A Discadora só se comunica com a Api4Com (`api.api4com.com`; no site, passando pelas funções `api/` da Vercel), e só em dois momentos: ao gerar o token e ao pedir cada ligação. Junto com o pedido de ligação vão, como metadados, o nome, a etapa e a campanha do lead.

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
