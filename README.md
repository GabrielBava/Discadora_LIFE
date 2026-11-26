# Discadora LIFE

Painel que percorre a sua planilha de leads, um contato por vez, ligando pela **Api4Com**. Funciona de dois jeitos, com as mesmas telas:

- **Site (Vercel):** é só abrir o link no navegador. Nada para instalar.
- **Extensão do Chrome/Edge:** abre como painel na lateral do navegador.

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

## Publicar como site na Vercel

O repositório já vem com o `vercel.json` pronto: não há etapa de build, o site é servido a partir da pasta `extensao/`, e as funções em `api/` repassam os pedidos para a Api4Com. Elas existem porque o navegador bloqueia chamadas diretas de um site para a API da Api4Com (CORS), e não guardam nada.

1. Na Vercel: **Add New → Project** e importe este repositório.
2. Não precisa escolher framework nem comando de build: o `vercel.json` define tudo (inclusive se o projeto tiver sido criado como Angular).
3. **Deploy.** O endereço do site abre direto na Discadora.

No site, a planilha, o ramal e o token ficam salvos no navegador de cada pessoa (não no servidor).

## Instalar como extensão (opcional, uma vez por computador)

1. Baixe este repositório: botão verde **Code → Download ZIP** no GitHub. Depois extraia o ZIP.
2. No Chrome, abra `chrome://extensions` (no Edge: `edge://extensions`).
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta **`extensao`**.
5. Clique no ícone de quebra-cabeça da barra do Chrome e **fixe** a "Discadora LIFE".

## Configuração (uma vez por pessoa)

Abra a Discadora (site ou ícone da extensão) e clique em **Configurações** no fim do painel:

- **Ramal:** o seu ramal da Api4Com. Ele aparece no topo do Webphone, ao lado de "Usuário".
- **Token da API:** clique em **Gerar o token com o e-mail e a senha da Api4Com**, preencha e clique em **Gerar token**. A senha vai só para a Api4Com e não fica salva. Se a sua empresa fornecer um token de API, também pode colar direto no campo.

Se o token vencer, a Discadora avisa: é só gerar de novo.

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
vercel.json            configuração do site na Vercel (sem build)
api/                   funções da Vercel que repassam login e ligação para a Api4Com
extensao/
  painel.html/css/js   a tela (planilha, filtro, contagens, ligação pela API, registros)
  planilha.js          leitura de .xlsx/.csv e geração do .xlsx exportado (sem bibliotecas externas)
  fontes/              fonte Montserrat (licença OFL)
  modelo/              modelo da planilha (.xlsx)
  manifest.json        configuração da extensão do Chrome
  background.js        abre o painel ao clicar no ícone da extensão
```
