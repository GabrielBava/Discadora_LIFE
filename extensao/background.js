// Clicar no ícone da extensão abre o painel lateral da Discadora.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((erro) => console.error(erro));
