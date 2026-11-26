// Painel da Discadora LIFE.
// Fluxo: importar planilha -> clicar em Próximo -> mostra o lead, cola o número na
// Api4Com e liga. A ligação nunca é encerrada por aqui: quem desliga é o usuário
// (ou a Api4Com, ex.: caixa postal). Só avança quando o usuário clica em Próximo.

const URL_API_DISCAR = 'https://api.api4com.com/api/v1/dialer';
const ABA_API4COM = /^https:\/\/([^/]+\.)?api4com\.com\//;

const CONFIG_PADRAO = {
  modo: 'pagina',
  prefixo: '',
  seletorCampo: '',
  seletorBotao: '',
  usarEnter: false,
  token: '',
  ramal: '',
};

let estado = { arquivo: '', contatos: [], indice: -1, ignoradas: 0, config: { ...CONFIG_PADRAO } };

const $ = (id) => document.getElementById(id);

// ---------- Planilha -> contatos ----------

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Regras em ordem de prioridade: "Nome da campanha" vira campanha, "Status do lead"
// vira etapa, "Telefone" ganha de "Contato", e e-mail/ID nunca viram telefone.
const REGRAS_COLUNAS = [
  ['campanha', /campanha|campaign/],
  ['etapa', /etapa|status|estagio|fase|stage|funil/],
  ['nome', /\bnome\b|\bname\b/],
  ['telefone', /telefone|fone|celular|phone|whats|\btel\b/],
  ['telefone', /numero|contato/, /e-?mail|\bid\b/],
  ['nome', /lead|cliente/, /e-?mail|\bid\b/],
];
const POSICAO_MODELO = { nome: 0, telefone: 1, etapa: 2, campanha: 3 };

function montarContatos(linhas) {
  if (!linhas.length) throw new Error('A planilha está vazia.');

  const titulos = linhas[0].map(semAcento);
  const colunas = {};
  const usadas = new Set();
  for (const [campo, re, exceto] of REGRAS_COLUNAS) {
    if (colunas[campo] !== undefined) continue;
    const i = titulos.findIndex((t, i) => !usadas.has(i) && re.test(t) && !exceto?.test(t));
    if (i >= 0) { colunas[campo] = i; usadas.add(i); }
  }

  const temCabecalho = Object.keys(colunas).length > 0;
  if (!temCabecalho) Object.assign(colunas, POSICAO_MODELO);
  if (colunas.telefone === undefined) {
    throw new Error('Não encontrei a coluna de telefone. Use o modelo: Nome, Telefone, Etapa, Campanha.');
  }

  const contatos = [];
  let ignoradas = 0;
  for (const linha of linhas.slice(temCabecalho ? 1 : 0)) {
    const pegar = (campo) => (colunas[campo] === undefined ? '' : linha[colunas[campo]] || '');
    const telefone = pegar('telefone');
    // Se a célula tiver mais de um telefone, usa o primeiro
    const numero = telefone.split(/[\/;|,]/)[0].replace(/\D/g, '');
    if (!numero) { ignoradas++; continue; }
    contatos.push({ nome: pegar('nome'), telefone, numero, etapa: pegar('etapa'), campanha: pegar('campanha') });
  }
  return { contatos, ignoradas };
}

// ---------- Discagem ----------

function numeroParaDiscar(contato) {
  return (estado.config.prefixo || '').trim() + contato.numero;
}

async function acharAbaApi4com() {
  const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (ativa && ABA_API4COM.test(ativa.url || '')) return ativa;
  const abas = await chrome.tabs.query({ url: 'https://*.api4com.com/*' });
  return abas.find((a) => a.windowId === ativa?.windowId) || abas[0] || null;
}

// Envia o pedido para a página da Api4Com: primeiro para a página principal,
// depois (se o campo não estiver lá) para os iframes dela.
async function pedirParaPagina(tipo, numero, config) {
  const aba = await acharAbaApi4com();
  if (!aba) throw new Error('Abra a página da Api4Com em uma aba deste navegador.');

  const msg = {
    tipo,
    numero,
    somenteTopo: true,
    config: { seletorCampo: config.seletorCampo, seletorBotao: config.seletorBotao, usarEnter: config.usarEnter },
  };
  let resposta;
  try {
    resposta = await chrome.tabs.sendMessage(aba.id, msg, { frameId: 0 });
  } catch {
    throw new Error('A página da Api4Com não respondeu. Recarregue a aba da Api4Com (F5) e tente de novo.');
  }
  if (resposta?.erro === 'seletor') throw new Error('Seletor inválido em Configurações. Confira o texto digitado.');
  if (!resposta?.ok) {
    try { resposta = await chrome.tabs.sendMessage(aba.id, { ...msg, somenteTopo: false }); } catch { resposta = null; }
  }
  if (!resposta?.ok) {
    throw new Error('Não encontrei o campo de número na página da Api4Com. Ajuste o seletor em Configurações.');
  }
  return resposta;
}

async function discarPelaApi(numero, contato) {
  const { token, ramal } = estado.config;
  if (!token || !ramal) throw new Error('Preencha o token e o ramal da Api4Com em Configurações.');
  const resposta = await fetch(URL_API_DISCAR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      extension: ramal,
      phone: numero,
      metadata: { nome: contato.nome, etapa: contato.etapa, campanha: contato.campanha },
    }),
  });
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => '')).slice(0, 200);
    throw new Error(`A Api4Com recusou a ligação (HTTP ${resposta.status}). ${detalhe}`);
  }
}

async function ligarContatoAtual() {
  const contato = estado.contatos[estado.indice];
  if (!contato) return;
  const numero = numeroParaDiscar(contato);

  $('proximo').disabled = true;
  $('discarDeNovo').hidden = true;
  mostrarStatus(`Discando ${numero}…`);
  try {
    if (estado.config.modo === 'api') await discarPelaApi(numero, contato);
    else await pedirParaPagina('discadora:discar', numero, estado.config);
    const ultimo = estado.indice === estado.contatos.length - 1;
    mostrarStatus(
      `Ligação iniciada para ${numero}. Quando a ligação terminar, clique em Próximo.` +
      (ultimo ? ' Este é o último contato da lista.' : ''),
      'ok'
    );
  } catch (erro) {
    mostrarStatus(erro.message, 'erro');
    $('discarDeNovo').hidden = false;
  } finally {
    atualizarBotaoProximo();
  }
}

async function proximo() {
  if (estado.indice + 1 >= estado.contatos.length) return;
  estado.indice++;
  await chrome.storage.local.set({ indice: estado.indice });
  mostrarContato();
  await ligarContatoAtual();
}

// ---------- Tela ----------

function mostrarStatus(texto, tipo = '') {
  $('status').textContent = texto;
  $('status').className = 'status ' + tipo;
}

function atualizarBotaoProximo() {
  const fim = estado.contatos.length > 0 && estado.indice >= estado.contatos.length - 1;
  $('proximo').disabled = !estado.contatos.length || fim;
  $('proximo').textContent = fim ? 'Fim da lista' : 'Próximo ▶';
}

function mostrarContato() {
  const total = estado.contatos.length;
  const contato = estado.contatos[estado.indice];
  $('nome').textContent = contato?.nome || '—';
  $('telefone').textContent = contato?.telefone || '—';
  $('etapa').textContent = contato?.etapa || '—';
  $('campanha').textContent = contato?.campanha || '—';

  if (!total) $('contador').textContent = '';
  else if (!contato) $('contador').textContent = `${total} contatos carregados. Clique em Próximo para ligar para o primeiro.`;
  else $('contador').textContent = `Contato ${estado.indice + 1} de ${total}`;

  $('infoLista').textContent = total
    ? `${estado.arquivo} — ${total} contatos` +
      (estado.ignoradas ? ` (${estado.ignoradas} linhas sem telefone foram ignoradas)` : '')
    : 'Nenhuma planilha importada.';
  atualizarBotaoProximo();
}

async function importar() {
  const arquivo = $('arquivo').files[0];
  if (!arquivo) return;
  try {
    const { contatos, ignoradas } = montarContatos(await Planilha.lerArquivo(arquivo));
    if (!contatos.length) throw new Error('Nenhum contato com telefone foi encontrado na planilha.');
    Object.assign(estado, { arquivo: arquivo.name, contatos, ignoradas, indice: -1 });
    await chrome.storage.local.set({ arquivo: arquivo.name, contatos, ignoradas, indice: -1 });
    $('discarDeNovo').hidden = true;
    mostrarStatus('Planilha importada.', 'ok');
  } catch (erro) {
    mostrarStatus('Erro ao importar: ' + erro.message, 'erro');
  } finally {
    $('arquivo').value = '';
    mostrarContato();
  }
}

// ---------- Configurações ----------

function lerFormulario() {
  return {
    modo: document.querySelector('input[name=modo]:checked')?.value || 'pagina',
    prefixo: $('prefixo').value.trim(),
    seletorCampo: $('seletorCampo').value.trim(),
    seletorBotao: $('seletorBotao').value.trim(),
    usarEnter: $('usarEnter').checked,
    token: $('token').value.trim(),
    ramal: $('ramal').value.trim(),
  };
}

function preencherFormulario(c) {
  document.querySelector(`input[name=modo][value=${c.modo}]`).checked = true;
  $('prefixo').value = c.prefixo;
  $('seletorCampo').value = c.seletorCampo;
  $('seletorBotao').value = c.seletorBotao;
  $('usarEnter').checked = c.usarEnter;
  $('token').value = c.token;
  $('ramal').value = c.ramal;
  alternarModo();
}

function alternarModo() {
  const modo = lerFormulario().modo;
  $('cfgPagina').hidden = modo !== 'pagina';
  $('cfgApi').hidden = modo !== 'api';
}

async function salvarConfig() {
  estado.config = lerFormulario();
  await chrome.storage.local.set({ config: estado.config });
  $('statusConfig').textContent = 'Configurações salvas.';
}

async function testarPagina() {
  $('statusConfig').textContent = 'Procurando na página da Api4Com…';
  try {
    const r = await pedirParaPagina('discadora:testar', '', lerFormulario());
    $('statusConfig').textContent = 'Campo de número encontrado (destacado em laranja na página). ' +
      (r.usarEnter ? 'A ligação será feita apertando Enter.'
        : r.botao ? 'Botão Ligar encontrado (também destacado).'
          : 'Botão Ligar NÃO encontrado: será usado Enter. Se não funcionar, informe o seletor do botão.');
  } catch (erro) {
    $('statusConfig').textContent = erro.message;
  }
}

// ---------- Início ----------

async function iniciar() {
  const salvo = await chrome.storage.local.get(['arquivo', 'contatos', 'ignoradas', 'indice', 'config']);
  estado = {
    arquivo: salvo.arquivo || '',
    contatos: salvo.contatos || [],
    ignoradas: salvo.ignoradas || 0,
    indice: Number.isInteger(salvo.indice) ? salvo.indice : -1,
    config: { ...CONFIG_PADRAO, ...(salvo.config || {}) },
  };
  preencherFormulario(estado.config);
  mostrarContato();

  $('arquivo').addEventListener('change', importar);
  $('proximo').addEventListener('click', proximo);
  $('discarDeNovo').addEventListener('click', ligarContatoAtual);
  $('salvar').addEventListener('click', salvarConfig);
  $('testar').addEventListener('click', testarPagina);
  document.querySelectorAll('input[name=modo]').forEach((r) => r.addEventListener('change', alternarModo));
}

iniciar();
