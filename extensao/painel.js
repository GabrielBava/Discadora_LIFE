// Painel da Discadora LIFE.
// Fluxo: importar planilha -> clicar em Próximo -> mostra o lead e pede para a Api4Com
// ligar do ramal do usuário para o lead. A ligação nunca é encerrada por aqui: quem
// desliga é o usuário no Webphone (ou a Api4Com, ex.: caixa postal). Só avança quando
// o usuário clica em Próximo.

const API4COM = 'https://api.api4com.com/api/v1';

const CONFIG_PADRAO = { ramal: '', token: '' };

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

// Formato internacional que a Api4Com usa: (11) 99999-8888 -> +5511999998888
function numeroInternacional(digitos) {
  let d = digitos.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // só DDD + número: é do Brasil
  return '+' + d;
}

async function discarPelaApi(numero, contato) {
  const { token, ramal } = estado.config;
  const resposta = await fetch(`${API4COM}/dialer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({
      extension: ramal,
      phone: numero,
      metadata: { nome: contato.nome, etapa: contato.etapa, campanha: contato.campanha },
    }),
  });
  if (resposta.status === 401) {
    throw new Error('A Api4Com recusou o token (expirado ou inválido). Gere um novo em Configurações.');
  }
  if (!resposta.ok) {
    const detalhe = (await resposta.text().catch(() => '')).slice(0, 200);
    throw new Error(`A Api4Com recusou a ligação (HTTP ${resposta.status}). ${detalhe}`);
  }
}

async function ligarContatoAtual() {
  const contato = estado.contatos[estado.indice];
  if (!contato) return;
  const numero = numeroInternacional(contato.numero);
  const ultimo = estado.indice === estado.contatos.length - 1 ? ' Este é o último contato da lista.' : '';
  const { token, ramal } = estado.config;

  $('proximo').disabled = true;
  $('discarDeNovo').hidden = true;
  try {
    if (!token || !ramal) {
      await navigator.clipboard.writeText(contato.numero);
      mostrarStatus(
        `Número ${contato.numero} copiado. Cole no Webphone (Ctrl+V) e clique em Discar. ` +
        'Para a Discadora ligar sozinha, preencha o ramal e o token em Configurações.' + ultimo
      );
      return;
    }
    mostrarStatus(`Pedindo à Api4Com para ligar para ${numero}…`);
    await discarPelaApi(numero, contato);
    mostrarStatus(
      `Ligação para ${numero} enviada à Api4Com pelo ramal ${ramal}. Se o Webphone tocar, atenda. ` +
      'Quando terminar e desligar, clique em Próximo.' + ultimo,
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
  return { ramal: $('ramal').value.trim(), token: $('token').value.trim() };
}

function preencherFormulario(c) {
  $('ramal').value = c.ramal;
  $('token').value = c.token;
}

async function salvarConfig() {
  estado.config = lerFormulario();
  await chrome.storage.local.set({ config: estado.config });
  $('statusConfig').textContent = 'Configurações salvas.';
}

// Login da Api4Com: devolve o token de acesso (campo "id" da resposta)
async function gerarToken() {
  const email = $('email').value.trim();
  const senha = $('senha').value;
  if (!email || !senha) { $('statusConfig').textContent = 'Preencha o e-mail e a senha.'; return; }
  $('statusConfig').textContent = 'Gerando token…';
  try {
    const resposta = await fetch(`${API4COM}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.id) throw new Error(`HTTP ${resposta.status}`);
    $('token').value = dados.id;
    $('senha').value = '';
    await salvarConfig();
    $('statusConfig').textContent = 'Token gerado e salvo.';
  } catch (erro) {
    $('statusConfig').textContent = `Não consegui gerar o token (${erro.message}). ` +
      'Confira e-mail e senha, ou peça o token de API ao administrador da Api4Com e cole no campo Token.';
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
  $('gerarToken').addEventListener('click', gerarToken);
  $('ramal').addEventListener('change', salvarConfig);
  $('token').addEventListener('change', salvarConfig);
}

iniciar();
