// Gera apps-script/Discadora.html (versão Planilhas Google) a partir da tela da extensão:
// junta painel.html + painel.css + planilha.js + painel.js num arquivo só, porque o
// Apps Script serve um único HTML. Rode depois de mudar a tela:
//   node ferramentas/gerar-apps-script.js
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(raiz, 'extensao', f), 'utf8');

// Fonte: no Apps Script não dá para servir os .woff2; usa a mesma Montserrat do Google Fonts
const css = ler('painel.css').replace(
  /(@font-face \{[^}]*\}\s*)+/,
  '@import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap");\n\n'
);
if (css.includes('@font-face')) throw new Error('Não consegui trocar as fontes do CSS.');

const trocas = [
  ['  <link rel="icon" href="icones/48.png">\n', ''],
  ['  <link rel="stylesheet" href="painel.css">', `  <style>\n${css}  </style>`],
  ['  <script src="planilha.js"></script>', `  <script>\n${ler('planilha.js')}  </script>`],
  ['  <script src="painel.js"></script>', `  <script>\n${ler('painel.js')}  </script>`],
];
let html = ler('painel.html');
for (const [de, para] of trocas) {
  if (!html.includes(de)) throw new Error('Trecho não encontrado em painel.html: ' + de);
  html = html.replace(de, () => para);
}
html = html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n<!-- ARQUIVO GERADO por ferramentas/gerar-apps-script.js. Não edite: edite extensao/ e gere de novo. -->\n');

const destino = path.join(raiz, 'apps-script', 'Discadora.html');
fs.writeFileSync(destino, html);
console.log(`Gerado ${path.relative(raiz, destino)} (${(html.length / 1024).toFixed(0)} KB)`);
