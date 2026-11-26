// Painel da Discadora LIFE.
// Fluxo: importar planilha -> (opcional) filtrar por etapa -> ligar para o próximo lead.
// Depois de cada ligação o usuário registra "Não atendeu" (já liga para o próximo) ou
// "Atendeu" (anota o que foi falado). A Discadora nunca desliga: quem desliga é o
// usuário no Webphone (ou a Api4Com, ex.: caixa postal). Só liga para o próximo quando
// o usuário clica. Data/hora, resultado e anotação vão para a planilha exportada.

// O mesmo painel roda como extensão do Chrome ou como site (Vercel).
// No site, as chamadas passam pelas funções /api/* da própria Vercel, porque o
// navegador bloqueia chamadas diretas de um site para a API da Api4Com (CORS).
const EH_EXTENSAO = Boolean(globalThis.chrome?.runtime?.id);
const API4COM = 'https://api.api4com.com/api/v1';
const URL_DISCAR = EH_EXTENSAO ? `${API4COM}/dialer` : '/api/discar';
const URL_LOGIN = EH_EXTENSAO ? `${API4COM}/users/login` : '/api/login';

// Onde a lista, a posição e a configuração ficam salvas (só neste navegador)
const armazenamento = EH_EXTENSAO ? chrome.storage.local : {
  async get(chaves) {
    const r = {};
    for (const k of chaves) {
      const v = localStorage.getItem('discadora:' + k);
      if (v !== null) r[k] = JSON.parse(v);
    }
    return r;
  },
  async set(valores) {
    for (const [k, v] of Object.entries(valores)) localStorage.setItem('discadora:' + k, JSON.stringify(v));
  },
};

const CONFIG_PADRAO = { ramal: '', token: '' };
const SEM_ETAPA = '(sem etapa)';
const TITULOS_REGISTRO = { ligadoEm: 'Data/hora da ligação', resultado: 'Resultado', anotacao: 'Anotação' };

// Dados salvos
const estado = {
  arquivo: '',
  cabecalho: null,           // títulos originais da planilha (ou null se ela não tinha)
  colRegistro: {},           // em que coluna da planilha original estavam os registros
  contatos: [],              // um por linha da planilha (inclusive linhas sem telefone)
  atual: -1,                 // índice do lead em atendimento
  filtroEtapa: '',           // '' = todas as etapas
  ignoradas: 0,
  config: { ...CONFIG_PADRAO },
};
// Estado só da tela
const tela = { discando: false, anotando: false, mensagem: null };

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
  const usadas = new Set();

  // Colunas de registro (vêm de uma planilha já exportada pela Discadora)
  const colRegistro = {};
  for (const [chave, titulo] of Object.entries(TITULOS_REGISTRO)) {
    const i = titulos.indexOf(semAcento(titulo));
    if (i >= 0) { colRegistro[chave] = i; usadas.add(i); }
  }

  const colunas = {};
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
    const pegar = (i) => (i === undefined ? '' : linha[i] || '');
    const telefone = pegar(colunas.telefone);
    // Se a célula tiver mais de um telefone, usa o primeiro
    const numero = telefone.split(/[\/;|,]/)[0].replace(/\D/g, '');
    if (!numero) ignoradas++;

    const ligadoEmBruto = pegar(colRegistro.ligadoEm);
    const data = ligadoEmBruto ? Planilha.excelParaData(ligadoEmBruto) : null;
    contatos.push({
      nome: pegar(colunas.nome),
      telefone,
      numero,
      etapa: pegar(colunas.etapa),
      campanha: pegar(colunas.campanha),
      linha,
      ligadoEm: data ? data.getTime() : null,
      ligadoEmTexto: data ? '' : ligadoEmBruto,
      resultado: pegar(colRegistro.resultado),
      anotacao: pegar(colRegistro.anotacao),
    });
  }
  return { cabecalho: temCabecalho ? linhas[0] : null, colRegistro, contatos, ignoradas };
}

// ---------- Fila de ligações ----------

const etapaDe = (c) => c.etapa || SEM_ETAPA;
const ligado = (c) => Boolean(c.ligadoEm || c.ligadoEmTexto);
const trabalhado = (c) => Boolean(c.resultado) || ligado(c);
const contatoAtual = () => estado.contatos[estado.atual];

// Índices dos leads com telefone da etapa escolhida, na ordem da planilha
function fila() {
  const r = [];
  estado.contatos.forEach((c, i) => {
    if (c.numero && (!estado.filtroEtapa || etapaDe(c) === estado.filtroEtapa)) r.push(i);
  });
  return r;
}

// Próximo lead da etapa que ainda não foi trabalhado
function proximoDaFila() {
  return fila().find((i) => i !== estado.atual && !trabalhado(estado.contatos[i]));
}

function etapas() {
  const contagem = new Map();
  for (const c of estado.contatos) {
    if (c.numero) contagem.set(etapaDe(c), (contagem.get(etapaDe(c)) || 0) + 1);
  }
  return contagem;
}

// ---------- Telefone ----------

// Formato internacional que a Api4Com usa: (11) 99999-8888 -> +5511999998888
function numeroInternacional(digitos) {
  let d = digitos.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d; // só DDD + número: é do Brasil
  return '+' + d;
}

// Para exibir: 51981494541 -> (51) 98149-4541
function telefoneLegivel(c) {
  let d = c.numero.replace(/^0+/, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return c.telefone;
}

const dataHora = (ms) => new Date(ms).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// ---------- Ligação ----------

async function discarPelaApi(numero, contato) {
  const { token, ramal } = estado.config;
  const resposta = await fetch(URL_DISCAR, {
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

// Dispara a ligação do lead atual e registra a data/hora do disparo
async function discarAtual() {
  const contato = contatoAtual();
  if (!contato || tela.discando) return;
  const { token, ramal } = estado.config;
  const numero = numeroInternacional(contato.numero);

  tela.discando = true;
  tela.anotando = false;
  tela.mensagem = { texto: `Discando ${telefoneLegivel(contato)}…` };
  render();
  try {
    if (!token || !ramal) {
      await navigator.clipboard.writeText(contato.numero);
      tela.mensagem = {
        texto: 'Número copiado. Cole no Webphone (Ctrl+V) e clique em Discar. ' +
          'Para ligar sozinha, configure o ramal e o token em Configurações.',
        tipo: 'aviso',
      };
    } else {
      await discarPelaApi(numero, contato);
      tela.mensagem = {
        texto: `Ligação enviada à Api4Com pelo ramal ${ramal} às ${hora(Date.now())}. ` +
          'Se o Webphone tocar, atenda. Ao terminar, registre o resultado.',
        tipo: 'ok',
      };
    }
    contato.ligadoEm = Date.now();
    contato.ligadoEmTexto = '';
    await salvar();
  } catch (erro) {
    tela.mensagem = { texto: erro.message, tipo: 'erro' };
  } finally {
    tela.discando = false;
    render();
  }
}

// Só é chamada por clique do usuário
async function ligarParaProximo() {
  const proximo = proximoDaFila();
  if (proximo === undefined) { render(); return; }
  estado.atual = proximo;
  tela.mensagem = null;
  await salvar();
  await discarAtual();
}

async function registrar(resultado, anotacao) {
  const contato = contatoAtual();
  if (!contato) return;
  contato.resultado = resultado;
  if (anotacao !== undefined) contato.anotacao = anotacao;
  tela.anotando = false;
  tela.mensagem = null;
  await salvar();
}

async function naoAtendeu() {
  await registrar('Não atendeu');
  await ligarParaProximo();
}

function abrirAnotacao() {
  tela.anotando = true;
  $('anotacao').value = contatoAtual()?.anotacao || '';
  render();
  $('anotacao').focus();
}

async function salvarAnotacao(ligarDepois) {
  await registrar('Atendeu', $('anotacao').value.trim());
  if (ligarDepois) await ligarParaProximo();
  else render();
}

async function pular() {
  await registrar('Pulado');
  await ligarParaProximo();
}

// ---------- Planilha: importar e exportar ----------

async function importar() {
  const arquivo = $('arquivo').files[0];
  if (!arquivo) return;
  try {
    const dados = montarContatos(await Planilha.lerArquivo(arquivo));
    if (!dados.contatos.some((c) => c.numero)) throw new Error('Nenhum contato com telefone foi encontrado na planilha.');
    Object.assign(estado, dados, { arquivo: arquivo.name, atual: -1, filtroEtapa: '' });
    Object.assign(tela, { anotando: false, mensagem: null });
    await salvar();
  } catch (erro) {
    tela.mensagem = { texto: 'Erro ao importar: ' + erro.message, tipo: 'erro' };
  } finally {
    $('arquivo').value = '';
    render();
  }
}

function exportar() {
  const base = estado.cabecalho ? [...estado.cabecalho] : ['Nome', 'Telefone', 'Etapa', 'Campanha'];
  const largura = Math.max(base.length, ...estado.contatos.map((c) => c.linha.length));
  while (base.length < largura) base.push(`Coluna ${base.length + 1}`);

  const col = { ...estado.colRegistro };
  for (const [chave, titulo] of Object.entries(TITULOS_REGISTRO)) {
    if (col[chave] === undefined) { col[chave] = base.length; base.push(titulo); }
  }

  const linhas = [base];
  for (const c of estado.contatos) {
    const linha = Array.from({ length: base.length }, (_, i) => c.linha[i] ?? '');
    linha[col.ligadoEm] = c.ligadoEm ? new Date(c.ligadoEm) : c.ligadoEmTexto;
    linha[col.resultado] = c.resultado;
    linha[col.anotacao] = c.anotacao;
    linhas.push(linha);
  }

  const nome = estado.arquivo.replace(/\.(xlsx|csv|txt)$/i, '').replace(/_ligacoes$/, '') + '_ligacoes.xlsx';
  const url = URL.createObjectURL(Planilha.escreverXlsx(linhas));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function salvar() {
  const { config, ...dados } = estado;
  try {
    await armazenamento.set(dados);
  } catch {
    tela.mensagem = {
      texto: 'Não consegui salvar no navegador (planilha grande demais). Exporte a planilha para não perder os registros.',
      tipo: 'erro',
    };
  }
}

// ---------- Tela ----------

function mostrar(id, visivel) { $(id).hidden = !visivel; }
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function render() {
  const validos = estado.contatos.filter((c) => c.numero);
  const comLista = validos.length > 0;
  const contato = contatoAtual();
  const contagem = etapas();
  if (estado.filtroEtapa && !contagem.has(estado.filtroEtapa)) estado.filtroEtapa = '';
  const indices = fila();
  const naFila = indices.map((i) => estado.contatos[i]);
  const feitos = naFila.filter(trabalhado).length;
  const faltam = naFila.length - feitos;

  // Planilha
  $('infoLista').textContent = comLista
    ? `${estado.arquivo} · ${validos.length} leads` +
      (estado.ignoradas ? ` · ${plural(estado.ignoradas, 'linha sem telefone ignorada', 'linhas sem telefone ignoradas')}` : '')
    : 'Nenhuma planilha importada.';
  $('exportar').disabled = !comLista;

  // Números e filtro
  mostrar('numeros', comLista);
  if (comLista) {
    const opcoes = [['', `Todas as etapas (${validos.length})`], ...[...contagem].map(([e, n]) => [e, `${e} (${n})`])];
    $('filtroEtapa').replaceChildren(...opcoes.map(([valor, texto]) => new Option(texto, valor)));
    $('filtroEtapa').value = estado.filtroEtapa;

    $('numTotal').textContent = validos.length;
    $('numEtapa').textContent = naFila.length;
    $('legEtapa').textContent = estado.filtroEtapa ? 'Nesta etapa' : 'Todas as etapas';
    $('numFaltam').textContent = faltam;
    $('barra').style.width = naFila.length ? `${(feitos / naFila.length) * 100}%` : '0';
    const atenderam = naFila.filter((c) => c.resultado === 'Atendeu').length;
    const naoAtenderam = naFila.filter((c) => c.resultado === 'Não atendeu').length;
    $('resumo').textContent = [
      plural(feitos, 'trabalhado', 'trabalhados'),
      plural(atenderam, 'atendeu', 'atenderam'),
      plural(naoAtenderam, 'não atendeu', 'não atenderam'),
    ].join(' · ');
  }

  // Cartão do lead
  const posicao = contato ? indices.indexOf(estado.atual) : -1;
  $('posicao').textContent = !comLista ? '' : !contato ? 'Pronto para começar'
    : posicao >= 0 ? `Lead ${posicao + 1} de ${indices.length}` : 'Lead atual (fora da etapa selecionada)';
  $('nome').textContent = !comLista ? 'Importe a planilha para começar'
    : contato ? (contato.nome || 'Lead sem nome') : `${naFila.length} leads na fila`;
  mostrar('frase', Boolean(contato));
  mostrar('blocoTelefone', Boolean(contato));
  mostrar('linhaCampanha', Boolean(contato?.campanha));
  if (contato) {
    $('etapa').textContent = etapaDe(contato);
    $('telefone').textContent = telefoneLegivel(contato);
    $('campanha').textContent = contato.campanha;
  }

  let status = tela.mensagem;
  if (!status && contato) {
    const quando = contato.ligadoEm ? ` · ligação em ${dataHora(contato.ligadoEm)}` : '';
    if (contato.resultado === 'Atendeu') {
      status = { texto: 'Atendeu' + quando + (contato.anotacao ? `. "${contato.anotacao}"` : ''), tipo: 'atendeu' };
    } else if (contato.resultado) {
      status = { texto: contato.resultado + quando, tipo: 'aviso' };
    } else if (contato.ligadoEm) {
      status = { texto: `Ligação disparada em ${dataHora(contato.ligadoEm)}. Ao terminar, registre o resultado.`, tipo: 'ok' };
    } else {
      status = { texto: 'Ligação ainda não disparada.', tipo: 'aviso' };
    }
  }
  mostrar('status', Boolean(status));
  if (status) {
    $('status').textContent = status.texto;
    $('status').className = 'status ' + (status.tipo || '');
  }

  // Botões: o que aparece depende de onde o lead atual está
  const emLigacao = Boolean(contato && ligado(contato) && !contato.resultado);
  const semDisparo = Boolean(contato && !ligado(contato) && !contato.resultado);
  const livre = comLista && (!contato || Boolean(contato.resultado));
  const acabou = livre && faltam === 0;

  mostrar('btnIniciar', livre && !acabou);
  $('txtIniciar').textContent = feitos === 0 && !contato ? 'Ligar para o primeiro lead' : 'Ligar para o próximo';
  mostrar('caixaResultado', emLigacao && !tela.anotando);
  mostrar('caixaAnotacao', emLigacao && tela.anotando);
  mostrar('lnkDiscarDeNovo', emLigacao && !tela.anotando);
  mostrar('caixaErro', semDisparo && !tela.discando);
  mostrar('caixaFim', acabou);

  for (const id of ['btnIniciar', 'btnNaoAtendeu', 'btnAtendeu', 'btnDiscarDeNovo', 'btnPular', 'lnkDiscarDeNovo']) {
    $(id).disabled = tela.discando;
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
  await armazenamento.set({ config: estado.config });
  $('statusConfig').textContent = 'Configurações salvas.';
}

// Login da Api4Com: devolve o token de acesso (campo "id" da resposta)
async function gerarToken() {
  const email = $('email').value.trim();
  const senha = $('senha').value;
  if (!email || !senha) { $('statusConfig').textContent = 'Preencha o e-mail e a senha.'; return; }
  $('statusConfig').textContent = 'Gerando token…';
  try {
    const resposta = await fetch(URL_LOGIN, {
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
  const chaves = ['arquivo', 'cabecalho', 'colRegistro', 'contatos', 'atual', 'filtroEtapa', 'ignoradas', 'config'];
  const salvo = await armazenamento.get(chaves);
  // Listas salvas pela versão anterior não tinham estes campos
  const contatos = (salvo.contatos || []).map((c) => ({
    linha: [c.nome, c.telefone, c.etapa, c.campanha], ligadoEm: null, ligadoEmTexto: '', resultado: '', anotacao: '', ...c,
  }));
  Object.assign(estado, {
    arquivo: salvo.arquivo || '',
    cabecalho: salvo.cabecalho || (salvo.contatos ? ['Nome', 'Telefone', 'Etapa', 'Campanha'] : null),
    colRegistro: salvo.colRegistro || {},
    contatos,
    atual: Number.isInteger(salvo.atual) ? salvo.atual : -1,
    filtroEtapa: salvo.filtroEtapa || '',
    ignoradas: salvo.ignoradas || 0,
    config: { ...CONFIG_PADRAO, ...(salvo.config || {}) },
  });
  preencherFormulario(estado.config);
  render();

  $('arquivo').addEventListener('change', importar);
  $('exportar').addEventListener('click', exportar);
  $('btnExportarFim').addEventListener('click', exportar);
  $('filtroEtapa').addEventListener('change', async (e) => {
    estado.filtroEtapa = e.target.value;
    await salvar();
    render();
  });
  $('btnIniciar').addEventListener('click', ligarParaProximo);
  $('btnNaoAtendeu').addEventListener('click', naoAtendeu);
  $('btnAtendeu').addEventListener('click', abrirAnotacao);
  $('btnSalvarProximo').addEventListener('click', () => salvarAnotacao(true));
  $('btnSoSalvar').addEventListener('click', () => salvarAnotacao(false));
  $('btnCancelarAnotacao').addEventListener('click', () => { tela.anotando = false; render(); });
  $('btnDiscarDeNovo').addEventListener('click', discarAtual);
  $('lnkDiscarDeNovo').addEventListener('click', discarAtual);
  $('btnPular').addEventListener('click', pular);
  $('salvar').addEventListener('click', salvarConfig);
  $('gerarToken').addEventListener('click', gerarToken);
  $('ramal').addEventListener('change', salvarConfig);
  $('token').addEventListener('change', salvarConfig);
}

iniciar();
