# Discadora LIFE

Extensão do Google Chrome (também funciona no Microsoft Edge) que abre um painel lateral e percorre a sua planilha de leads, um contato por vez, ligando pela **Api4Com**.

**O que ela faz, e só isso:**

1. Você importa a planilha com **Nome, Telefone, Etapa e Campanha**.
2. Você clica em **Próximo**: o painel mostra o lead (nome, telefone, etapa atual e campanha) e pede para a Api4Com **ligar do seu ramal para o lead**. A ligação acontece no seu **Webphone da Api4Com**.
3. A ligação fica em andamento. **A Discadora nunca desliga**: quem desliga é você no Webphone, ou a própria Api4Com (por exemplo, quando cai na caixa postal).
4. Nada mais acontece até você clicar em **Próximo** de novo. Aí ela passa para a próxima linha e repete.

> **Por que pela API e não colando o número na tela do Webphone?** O Webphone da Api4Com é uma extensão do Chrome, e o Chrome não permite que uma extensão mexa na tela de outra. A API da Api4Com faz o mesmo papel: a chamada sai do seu ramal e aparece no seu Webphone.

---

## Instalação (uma vez por computador)

1. Baixe este repositório: botão verde **Code → Download ZIP** no GitHub. Depois extraia o ZIP.
2. No Chrome, abra `chrome://extensions` (no Edge: `edge://extensions`).
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta **`extensao`**.
5. Clique no ícone de quebra-cabeça da barra do Chrome e **fixe** a "Discadora LIFE".

## Configuração (uma vez por pessoa)

Clique no ícone da Discadora LIFE e abra **Configurações** no fim do painel:

- **Ramal:** o seu ramal da Api4Com. Ele aparece no topo do Webphone, ao lado de "Usuário".
- **Token da API:** clique em **Gerar o token com o e-mail e a senha da Api4Com**, preencha e clique em **Gerar token**. A senha vai só para a Api4Com e não fica salva. Se a sua empresa fornecer um token de API, também pode colar direto no campo.

Se o token vencer, a Discadora avisa: é só gerar de novo.

**Sem token configurado**, a Discadora ainda funciona no modo manual: o Próximo mostra o lead e **copia o número**; você cola no Webphone (Ctrl+V) e clica em Discar.

## Como usar

1. Deixe o Webphone da Api4Com logado e **Online**.
2. Clique no ícone da **Discadora LIFE**. O painel abre na lateral direita.
3. **Baixar modelo**: baixa `modelo_discadora.xlsx` com as 4 colunas.
4. Preencha o modelo, ou exporte do CRM uma base com essas 4 informações.
5. **Importar planilha**: escolha o arquivo `.xlsx` ou `.csv`.
6. Clique em **Próximo** para ligar para o primeiro contato. Se o Webphone tocar, atenda: a Api4Com completa a ligação para o lead.
7. Quando terminar a ligação e desligar no Webphone, clique em **Próximo** para ir ao seguinte.

Se der algum erro na ligação, aparece o botão **Discar este contato de novo**.

A lista e a posição ficam salvas: se fechar o painel ou o navegador, ao abrir de novo você continua do mesmo contato. Para recomeçar, importe a planilha de novo.

## Modelo da planilha

| Nome | Telefone | Etapa | Campanha |
|---|---|---|---|
| Maria Souza | (11) 98888-7777 | Proposta enviada | Black Friday |

- A extensão lê apenas a **primeira aba**.
- O telefone pode ter parênteses, espaços e traço. Números com DDD (10 ou 11 dígitos) recebem o +55 automaticamente. Linhas sem telefone são ignoradas (o painel informa quantas).
- Se a célula tiver dois telefones (`11 3333-2222 / 11 97777-6666`), usa o primeiro.
- Exportações do CRM com outros títulos também funcionam: `Nome do lead`, `Celular`, `Contato`, `WhatsApp`, `Status do lead`, `Estágio`, `Nome da campanha` etc. Colunas a mais (e-mail, ID...) são ignoradas.

## Privacidade

A planilha, o ramal e o token ficam salvos **só neste navegador**. A Discadora só se comunica com a Api4Com (`api.api4com.com`), e só em dois momentos: ao gerar o token e ao pedir cada ligação. Junto com o pedido de ligação vão, como metadados, o nome, a etapa e a campanha do lead.

## Arquivos

```
extensao/
  manifest.json        configuração da extensão
  painel.html/css/js   painel lateral (tela, planilha, botão Próximo, ligação pela API)
  planilha.js          leitura de .xlsx e .csv (sem bibliotecas externas)
  background.js        abre o painel ao clicar no ícone
  modelo/              modelo da planilha (.xlsx)
```
