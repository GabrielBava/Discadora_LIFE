// Painel da Discadora LIFE.
// Fluxo: importar planilha -> (opcional) filtrar por etapa -> ligar para o próximo lead.
// Depois de cada ligação o usuário registra "Não atendeu" (já liga para o próximo) ou
// "Atendeu" (anota o que foi falado). A Discadora nunca desliga: quem desliga é o
// usuário no Webphone (ou a Api4Com, ex.: caixa postal). Só liga para o próximo quando
// o usuário clica. Data/hora, resultado e anotação vão para a planilha exportada.

// O mesmo painel roda de três jeitos:
// - Planilhas Google (Apps Script): lê os leads da planilha, grava os registros nas
//   colunas ao lado e liga pelo servidor do Google (google.script.run).
// - Site (Vercel): importa .xlsx/.csv; as ligações passam pelas funções /api/*,
//   porque o navegador bloqueia chamadas diretas para a API da Api4Com (CORS).
// - Extensão do Chrome: importa .xlsx/.csv e chama a Api4Com direto.
const MODO_GOOGLE = Boolean(globalThis.google?.script?.run);
const EH_EXTENSAO = !MODO_GOOGLE && Boolean(globalThis.chrome?.runtime?.id);
const API4COM = 'https://api.api4com.com/api/v1';
const URL_DISCAR = '/api/discar'; // só no site; a extensão chama a Api4Com direto
const URL_LOGIN = EH_EXTENSAO ? `${API4COM}/users/login` : '/api/login';

// Chama uma função do Codigo.gs (só no modo Planilhas Google)
function servidor(funcao, ...args) {
  return new Promise((ok, falha) => {
    google.script.run.withSuccessHandler(ok).withFailureHandler(falha)[funcao](...args);
  });
}

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

// Ramal padrão. O token padrão NÃO fica aqui: no site ele está na variável de
// ambiente API4COM_TOKEN da Vercel e é usado pela função /api/discar.
const CONFIG_PADRAO = { ramal: '1204', token: '' };
// Senha que libera as Configurações (guardada só como SHA-256)
const HASH_SENHA_CONFIG = 'e68adee72e4d3c421f15cc33523be1c38208e4489b91d5e426503d99c5a7d790';
const SEM_ETAPA = '(sem etapa)';
const TITULOS_REGISTRO = {
  ligadoEm: 'Data/hora da ligação', resultado: 'Resultado', anotacao: 'Anotação', agendamento: 'Reunião agendada',
};
// Como cada resultado abre a caixa de anotação
const MODOS_ANOTACAO = {
  Atendeu: { titulo: 'Atendeu', rotulo: 'O que foi falado?', exemplo: 'Ex.: tem interesse, pediu retorno na sexta às 10h.' },
  Agendou: { titulo: 'Agendou reunião', rotulo: 'Observação (opcional)', exemplo: 'Ex.: reunião por vídeo com o casal.' },
  Descartado: { titulo: 'Descartar lead', rotulo: 'Por que foi descartado?', exemplo: 'Ex.: não tem interesse; número errado.' },
};

// Dados salvos
const estado = {
  arquivo: '',
  cabecalho: null,           // títulos originais da planilha (ou null se ela não tinha)
  colRegistro: {},           // em que coluna da planilha original estavam os registros
  contatos: [],              // um por linha da planilha (inclusive linhas sem telefone)
  atual: -1,                 // índice do lead em atendimento
  ultimaChamada: '',         // id da última ligação (para encerrar antes da próxima)
  filtroEtapa: '',           // '' = todas as etapas
  ignoradas: 0,
  config: { ...CONFIG_PADRAO },
};
// Estado só da tela
const tela = { discando: false, anotando: false, mensagem: null, tokenNoServidor: false, configLiberada: false };

const $ = (id) => document.getElementById(id);

// ---------- Planilha -> contatos ----------

const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

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
  linhas.slice(temCabecalho ? 1 : 0).forEach((linha, posicao) => {
    const pegar = (i) => (i === undefined ? '' : linha[i] || '');
    const telefone = pegar(colunas.telefone);
    // Se a célula tiver mais de um telefone, usa o primeiro
    const numero = telefone.split(/[\/;|,]/)[0].replace(/\D/g, '');
    if (!numero) ignoradas++;

    const ligadoEmBruto = pegar(colRegistro.ligadoEm);
    const data = ligadoEmBruto ? Planilha.excelParaData(ligadoEmBruto) : null;
    const agendamentoBruto = pegar(colRegistro.agendamento);
    const reuniao = agendamentoBruto ? Planilha.excelParaData(agendamentoBruto) : null;
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
      agendamento: reuniao ? reuniao.getTime() : null,
      agendamentoTexto: reuniao ? '' : agendamentoBruto,
      posicao, // linha de dados (0 = primeira depois do cabeçalho)
    });
  });
  return { cabecalho: temCabecalho ? linhas[0] : null, colRegistro, colTelefone: colunas.telefone, contatos, ignoradas };
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

// Respostas de POST /calls, conforme a documentação da Api4Com
function mensagemErroApi4com(status, detalhe = '') {
  const mensagens = {
    401: 'A Api4Com recusou o token (inválido, removido ou vencido). Atualize o token em Configurações.',
    402: 'O plano ou a situação do seu usuário na Api4Com não permite ligar agora. Fale com o administrador da conta.',
    403: 'O plano ou a situação do seu usuário na Api4Com não permite ligar agora. Fale com o administrador da conta.',
    404: 'Ramal não encontrado na Api4Com. Confira o ramal em Configurações.',
    422: 'A Api4Com não aceitou o número. Confira o telefone deste lead na planilha.',
    424: 'O Webphone não atendeu. Deixe o Webphone da Api4Com aberto e "Online" no PC (em um navegador só) e tente de novo.',
    429: 'Muitas ligações em pouco tempo (limite da Api4Com: 15 por minuto). Espere um pouco e tente de novo.',
    503: 'A Api4Com está temporariamente indisponível. Tente de novo em alguns segundos.',
  };
  return mensagens[status] || `A Api4Com recusou a ligação (HTTP ${status}). ${String(detalhe).slice(0, 200)}`;
}

// POST /calls: a Api4Com liga para o ramal (o Webphone atende sozinho) e depois para o lead.
// Uma ligação por vez: a anterior, se ainda estiver ativa, é encerrada antes.
async function discarPelaApi(numero) {
  const { token, ramal } = estado.config;
  let resposta;
  if (EH_EXTENSAO) {
    const cabecalhos = { 'Content-Type': 'application/json', Authorization: token };
    if (estado.ultimaChamada) {
      const fim = await fetch(`${API4COM}/calls/${encodeURIComponent(estado.ultimaChamada)}/hangup`, { method: 'POST', headers: cabecalhos }).catch(() => null);
      if (fim?.ok) await new Promise((r) => setTimeout(r, 1500));
    }
    resposta = await fetch(`${API4COM}/calls`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        extension: ramal, caller: ramal, called: numero,
        metadata: { gateway: 'discadora-life', callRef: `dl-${Date.now()}` },
      }),
    });
  } else {
    resposta = await fetch(URL_DISCAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify({ extension: ramal, called: numero, encerrar: estado.ultimaChamada || undefined }),
    });
  }
  estado.ultimaChamada = '';
  const texto = await resposta.text().catch(() => '');
  if (!resposta.ok) throw new Error(mensagemErroApi4com(resposta.status, texto));
  try { estado.ultimaChamada = JSON.parse(texto).id || ''; } catch { /* sem id */ }
}

// Dispara a ligação do lead atual e registra a data/hora do disparo
async function discarAtual() {
  const contato = contatoAtual();
  if (!contato || tela.discando) return;
  const { token, ramal } = estado.config;
  const temToken = Boolean(token) || (!EH_EXTENSAO && tela.tokenNoServidor);
  const numero = numeroInternacional(contato.numero);

  tela.discando = true;
  tela.anotando = false;
  tela.mensagem = { texto: `Discando ${telefoneLegivel(contato)}…` };
  render();
  const enviada = (ramalUsado, quando) => ({
    texto: `Ligação enviada à Api4Com pelo ramal ${ramalUsado} às ${hora(quando)}. ` +
      'Se o Webphone tocar, atenda. Ao terminar, registre o resultado.',
    tipo: 'ok',
  });
  try {
    if (MODO_GOOGLE) {
      // O servidor liga e já grava a data/hora na planilha
      const r = await servidor('discar', refPlanilha(contato), {
        telefone: numero, nome: contato.nome, etapa: contato.etapa, campanha: contato.campanha,
      });
      if (r.erro) throw new Error(r.erro);
      contato.ligadoEm = r.ligadoEm;
      tela.mensagem = enviada(r.ramal, r.ligadoEm);
    } else if (!temToken || !ramal) {
      await navigator.clipboard.writeText(contato.numero);
      tela.mensagem = {
        texto: 'Número copiado. Cole no Webphone (Ctrl+V) e clique em Discar. ' +
          'Para ligar sozinha, configure o ramal e o token em Configurações.',
        tipo: 'aviso',
      };
      contato.ligadoEm = Date.now();
    } else {
      await discarPelaApi(numero);
      contato.ligadoEm = Date.now();
      tela.mensagem = enviada(ramal, contato.ligadoEm);
    }
    contato.ligadoEmTexto = '';
    await salvar();
  } catch (erro) {
    tela.mensagem = { texto: erro.message, tipo: 'erro' };
  } finally {
    tela.discando = false;
    render();
  }
}

// Onde o lead está na planilha Google (o servidor confere pelo telefone)
const refPlanilha = (c) => ({ linha: c.posicao + 2, numero: c.numero, colTelefone: estado.colTelefone });

// Só é chamada por clique do usuário
async function ligarParaProximo() {
  const proximo = proximoDaFila();
  if (proximo === undefined) { render(); return; }
  estado.atual = proximo;
  tela.mensagem = null;
  await salvar();
  await discarAtual();
}

// Grava o resultado do lead atual. campos = { resultado, anotacao?, agendamento? (ms) }
// Devolve false se não conseguiu gravar (aí não avança para o próximo)
async function registrar(campos) {
  const contato = contatoAtual();
  if (!contato) return false;
  if (MODO_GOOGLE) {
    $('btnSalvarProximo').disabled = $('btnSoSalvar').disabled = true;
    try {
      await servidor('registrar', refPlanilha(contato), campos);
    } catch (erro) {
      tela.mensagem = { texto: 'Não consegui gravar na planilha: ' + (erro.message || erro), tipo: 'erro' };
      render();
      return false;
    } finally {
      $('btnSalvarProximo').disabled = $('btnSoSalvar').disabled = false;
    }
  }
  Object.assign(contato, campos);
  if ('agendamento' in campos) contato.agendamentoTexto = '';
  tela.anotando = false;
  tela.mensagem = null;
  await salvar();
  return true;
}

async function naoAtendeu() {
  if (await registrar({ resultado: 'Não atendeu' })) await ligarParaProximo();
}

// Atendeu, Agendou e Descartado abrem a caixa (Agendou também pede a data da reunião)
function abrirAnotacao(modo) {
  const contato = contatoAtual();
  const m = MODOS_ANOTACAO[modo];
  tela.anotando = modo;
  $('tituloAnotacao').textContent = m.titulo;
  $('rotuloAnotacao').textContent = m.rotulo;
  $('anotacao').placeholder = m.exemplo;
  $('anotacao').value = contato?.anotacao || '';
  $('agendamento').value = contato?.agendamento ? paraCampoDataHora(contato.agendamento) : '';
  mostrar('rotuloAgendamento', modo === 'Agendou');
  mostrar('erroAnotacao', false);
  render();
  (modo === 'Agendou' ? $('agendamento') : $('anotacao')).focus();
}

// ms -> "2026-11-27T15:30" (formato do campo de data e hora)
function paraCampoDataHora(ms) {
  const d = new Date(ms);
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

async function salvarAnotacao(ligarDepois) {
  const modo = tela.anotando;
  const campos = { resultado: modo, anotacao: $('anotacao').value.trim() };
  if (modo === 'Agendou') {
    const quando = $('agendamento').value ? new Date($('agendamento').value) : null;
    if (!quando || isNaN(quando)) {
      $('erroAnotacao').textContent = 'Informe a data e a hora da reunião.';
      mostrar('erroAnotacao', true);
      $('agendamento').focus();
      return;
    }
    campos.agendamento = quando.getTime();
  }
  if (!(await registrar(campos))) return;
  if (ligarDepois) await ligarParaProximo();
  else render();
}

async function pular() {
  if (await registrar({ resultado: 'Pulado' })) await ligarParaProximo();
}

// Modo Planilhas Google: lê os leads (e os registros já feitos) direto da planilha
async function carregarPlanilhaGoogle() {
  tela.mensagem = { texto: 'Lendo a planilha…' };
  $('btnAtualizar').disabled = true;
  render();
  try {
    const r = await servidor('lerPlanilha');
    const dados = montarContatos(r.linhas);
    if (!dados.cabecalho) throw new Error('a linha 1 precisa ter os títulos (Nome, Telefone, Etapa, Campanha).');
    Object.assign(estado, dados, { arquivo: r.nome });
    estado.config.ramal = r.ramal;
    $('ramal').value = r.ramal || '';
    tela.tokenNoServidor = r.tokenSalvo;
    // Lead em andamento = o último que foi ligado e ainda não tem resultado
    estado.atual = -1;
    let maisRecente = 0;
    estado.contatos.forEach((c, i) => {
      if (c.numero && c.ligadoEm && !c.resultado && c.ligadoEm >= maisRecente) { estado.atual = i; maisRecente = c.ligadoEm; }
    });
    tela.mensagem = null;
  } catch (erro) {
    tela.mensagem = { texto: 'Erro ao ler a planilha: ' + (erro.message || erro), tipo: 'erro' };
  } finally {
    $('btnAtualizar').disabled = false;
    render();
    renderConfig();
  }
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
    linha[col.agendamento] = c.agendamento ? new Date(c.agendamento) : (c.agendamentoTexto || '');
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
    if (MODO_GOOGLE) await armazenamento.set({ filtroEtapa: estado.filtroEtapa });
    else await armazenamento.set(dados);
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
    ? `${MODO_GOOGLE ? 'Planilha Google: ' : ''}${estado.arquivo} · ${validos.length} leads` +
      (estado.ignoradas ? ` · ${plural(estado.ignoradas, 'linha sem telefone ignorada', 'linhas sem telefone ignoradas')}` : '')
    : MODO_GOOGLE ? 'Planilha Google sem leads com telefone.' : 'Nenhuma planilha importada.';
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
    const quantos = (r) => naFila.filter((c) => c.resultado === r).length;
    const partes = [
      ['Atendeu', 'atendeu', 'atenderam'], ['Não atendeu', 'não atendeu', 'não atenderam'],
      ['Agendou', 'agendou', 'agendaram'], ['Descartado', 'descartado', 'descartados'],
    ].filter(([r]) => quantos(r) > 0).map(([r, um, varios]) => plural(quantos(r), um, varios));
    $('resumo').textContent = [plural(feitos, 'trabalhado', 'trabalhados'), ...partes].join(' · ');
  }

  // Cartão do lead
  const posicao = contato ? indices.indexOf(estado.atual) : -1;
  $('posicao').textContent = !comLista ? '' : !contato ? 'Pronto para começar'
    : posicao >= 0 ? `Lead ${posicao + 1} de ${indices.length}` : 'Lead atual (fora da etapa selecionada)';
  $('nome').textContent = !comLista ? (MODO_GOOGLE ? 'Nenhum lead na planilha' : 'Importe a planilha para começar')
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
    const nota = contato.anotacao ? `. "${contato.anotacao}"` : '';
    if (contato.resultado === 'Atendeu') {
      status = { texto: 'Atendeu' + quando + nota, tipo: 'atendeu' };
    } else if (contato.resultado === 'Agendou') {
      const reuniao = contato.agendamento ? dataHora(contato.agendamento) : contato.agendamentoTexto;
      status = { texto: `Agendou reunião para ${reuniao}` + nota, tipo: 'atendeu' };
    } else if (contato.resultado === 'Descartado') {
      status = { texto: 'Descartado' + quando + nota, tipo: 'aviso' };
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
  // Os botões de atendimento aparecem sempre que há um lead na tela sem resultado,
  // inclusive quando a ligação deu erro (ex.: para descartar um número inválido)
  const pendente = emLigacao || semDisparo;
  mostrar('caixaResultado', pendente && !tela.anotando);
  mostrar('caixaAnotacao', pendente && tela.anotando);
  mostrar('lnkDiscarDeNovo', emLigacao && !tela.anotando);
  mostrar('caixaErro', semDisparo && !tela.discando && !tela.anotando);
  mostrar('caixaFim', acabou);

  for (const id of ['btnIniciar', 'btnNaoAtendeu', 'btnAtendeu', 'btnAgendou', 'btnDescartar', 'btnDiscarDeNovo', 'btnPular', 'lnkDiscarDeNovo']) {
    $(id).disabled = tela.discando;
  }

  renderTabelas(comLista, indices);
}

// ---------- Tabelas: últimos 10 e próximos 10 ----------

const CLASSE_STATUS = {
  Atendeu: 'atendeu', 'Não atendeu': 'nao-atendeu', Agendou: 'agendou', Descartado: 'descartado',
  'Em ligação': 'em-ligacao', 'Na fila': 'na-fila',
};

function linhaTabela(c, status) {
  const tr = document.createElement('tr');
  for (const texto of [c.nome || '—', etapaDe(c), telefoneLegivel(c)]) {
    const td = document.createElement('td');
    td.textContent = texto;
    tr.append(td);
  }
  const td = document.createElement('td');
  const pilula = document.createElement('span');
  pilula.className = 'pilula ' + (CLASSE_STATUS[status] || '');
  pilula.textContent = status;
  if (status === 'Agendou' && c.agendamento) pilula.title = 'Reunião: ' + dataHora(c.agendamento);
  td.append(pilula);
  tr.append(td);
  return tr;
}

function renderTabelas(comLista, indices) {
  mostrar('historico', comLista);
  if (!comLista) return;

  // Últimos 10: as ligações mais recentes (todas as etapas)
  const ultimos = estado.contatos
    .filter((c) => c.numero && c.ligadoEm)
    .sort((a, b) => b.ligadoEm - a.ligadoEm)
    .slice(0, 10);
  $('tabelaUltimos').replaceChildren(...ultimos.map((c) => linhaTabela(c, c.resultado || 'Em ligação')));
  mostrar('vazioUltimos', ultimos.length === 0);

  // Próximos 10: quem vem depois na fila da etapa selecionada
  const proximos = indices
    .filter((i) => i !== estado.atual && !trabalhado(estado.contatos[i]))
    .slice(0, 10)
    .map((i) => estado.contatos[i]);
  $('tabelaProximos').replaceChildren(...proximos.map((c) => linhaTabela(c, 'Na fila')));
  mostrar('vazioProximos', proximos.length === 0);
}

// ---------- Configurações ----------

async function sha256(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function renderConfig() {
  const liberada = tela.configLiberada;
  const aberta = liberada ? !$('conteudoConfig').hidden : !$('formSenha').hidden;
  $('cadeado').classList.toggle('aberto', liberada);
  $('cadeado').setAttribute('aria-label', liberada ? 'desbloqueado' : 'bloqueado');
  $('abrirConfig').setAttribute('aria-expanded', String(aberta));
  $('infoToken').textContent = MODO_GOOGLE
    ? (tela.tokenNoServidor
      ? 'O token da Api4Com está salvo na sua conta Google. O ramal é descoberto pelo token. Para trocar, cole o novo e clique em Salvar.'
      : 'Nenhum token salvo. Cole o SEU token da Api4Com e clique em Salvar: o ramal é descoberto sozinho e tudo fica salvo na sua conta Google.')
    : EH_EXTENSAO
    ? 'Na extensão, preencha o token da Api4Com (ou gere com e-mail e senha) para ligar sozinha.'
    : tela.tokenNoServidor
      ? 'O token da Api4Com já está guardado no servidor: não precisa preencher.'
      : 'Nenhum token guardado no servidor. Preencha o token (ou gere com e-mail e senha) para ligar sozinha.';
}

function alternarConfig() {
  if (tela.configLiberada) {
    $('conteudoConfig').hidden = !$('conteudoConfig').hidden;
  } else {
    $('formSenha').hidden = !$('formSenha').hidden;
    if (!$('formSenha').hidden) $('senhaConfig').focus();
  }
  renderConfig();
}

async function conferirSenha(evento) {
  evento.preventDefault();
  if (await sha256($('senhaConfig').value.trim()) !== HASH_SENHA_CONFIG) {
    $('erroSenha').textContent = 'Senha incorreta.';
    $('senhaConfig').select();
    return;
  }
  tela.configLiberada = true;
  $('senhaConfig').value = '';
  $('erroSenha').textContent = '';
  $('formSenha').hidden = true;
  $('conteudoConfig').hidden = false;
  renderConfig();
}

function trancarConfig() {
  tela.configLiberada = false;
  $('conteudoConfig').hidden = true;
  $('statusConfig').textContent = '';
  renderConfig();
}

function lerFormulario() {
  return { ramal: $('ramal').value.trim(), token: $('token').value.trim() };
}

function preencherFormulario(c) {
  $('ramal').value = c.ramal;
  $('token').value = c.token;
}

async function salvarConfig() {
  if (!tela.configLiberada) return;
  if (MODO_GOOGLE) {
    // Ramal e token ficam na conta Google (valem no celular e no PC); o token não volta para a tela
    try {
      const r = await servidor('salvarConfig', lerFormulario());
      estado.config.ramal = r.ramal;
      $('ramal').value = r.ramal || '';
      tela.tokenNoServidor = r.tokenSalvo;
      $('token').value = '';
      $('statusConfig').textContent = !r.tokenSalvo ? 'Salvo. Falta colar o token da Api4Com.'
        : r.ramal ? `Salvo na sua conta Google. Ramal ${r.ramal}${r.ramalDetectado ? ' (descoberto pelo token)' : ''}.`
          : 'Token salvo, mas não encontrei o ramal dele na Api4Com. Confira se o token é do seu usuário.';
    } catch (erro) {
      $('statusConfig').textContent = 'Não consegui salvar: ' + (erro.message || erro);
    }
    renderConfig();
    return;
  }
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
  if (MODO_GOOGLE) {
    const r = await servidor('gerarToken', email, senha).catch((e) => ({ erro: e.message || String(e) }));
    $('senha').value = '';
    if (r.erro) {
      $('statusConfig').textContent = `Não consegui gerar o token (${r.erro}). Confira e-mail e senha, ou cole o token.`;
    } else {
      tela.tokenNoServidor = true;
      if (r.ramal) { estado.config.ramal = r.ramal; $('ramal').value = r.ramal; }
      $('statusConfig').textContent = 'Token gerado e salvo na sua conta Google.' + (r.ramal ? ` Ramal ${r.ramal}.` : '');
      renderConfig();
    }
    return;
  }
  try {
    const resposta = await fetch(URL_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.id) throw new Error(`HTTP ${resposta.status}`);
    let token = dados.id;
    if (EH_EXTENSAO) {
      // Troca o token do login (temporário) por um que nunca expira
      const permanente = await fetch(`${API4COM}/users/accessTokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ ttl: -1 }),
      }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      token = permanente.id || token;
    }
    $('token').value = token;
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
  const chaves = ['arquivo', 'cabecalho', 'colRegistro', 'contatos', 'atual', 'ultimaChamada', 'filtroEtapa', 'ignoradas', 'config'];
  const salvo = await armazenamento.get(chaves).catch(() => ({}));
  // Listas salvas pela versão anterior não tinham estes campos
  const contatos = (salvo.contatos || []).map((c) => ({
    linha: [c.nome, c.telefone, c.etapa, c.campanha], ligadoEm: null, ligadoEmTexto: '', resultado: '', anotacao: '',
    agendamento: null, agendamentoTexto: '', ...c,
  }));
  Object.assign(estado, {
    arquivo: salvo.arquivo || '',
    cabecalho: salvo.cabecalho || (salvo.contatos ? ['Nome', 'Telefone', 'Etapa', 'Campanha'] : null),
    colRegistro: salvo.colRegistro || {},
    contatos,
    atual: Number.isInteger(salvo.atual) ? salvo.atual : -1,
    ultimaChamada: salvo.ultimaChamada || '',
    filtroEtapa: salvo.filtroEtapa || '',
    ignoradas: salvo.ignoradas || 0,
    config: {
      ramal: salvo.config?.ramal || CONFIG_PADRAO.ramal,
      token: salvo.config?.token || CONFIG_PADRAO.token,
    },
  });
  preencherFormulario(estado.config);
  if (MODO_GOOGLE) {
    // A planilha Google é a fonte dos leads: sem importar, exportar nem modelo
    for (const id of ['baixarModelo', 'rotuloImportar', 'exportar', 'btnExportarFim']) mostrar(id, false);
    mostrar('btnAtualizar', true);
    $('textoFim').textContent = 'Todos os leads selecionados já foram trabalhados. Os registros estão na planilha.';
    $('token').placeholder = 'cole o token novo (vazio = manter o salvo)';
    $('ramal').value = '';
    $('ramal').placeholder = 'automático (descoberto pelo token)';
  }
  render();
  renderConfig();

  if (!MODO_GOOGLE && !EH_EXTENSAO) {
    // No site, pergunta ao servidor se o token padrão está configurado
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      tela.tokenNoServidor = Boolean((await r.json()).tokenNoServidor);
    } catch { /* sem servidor: segue sem token padrão */ }
    renderConfig();
  }

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
  $('btnAtendeu').addEventListener('click', () => abrirAnotacao('Atendeu'));
  $('btnAgendou').addEventListener('click', () => abrirAnotacao('Agendou'));
  $('btnDescartar').addEventListener('click', () => abrirAnotacao('Descartado'));
  $('btnSalvarProximo').addEventListener('click', () => salvarAnotacao(true));
  $('btnSoSalvar').addEventListener('click', () => salvarAnotacao(false));
  $('btnCancelarAnotacao').addEventListener('click', () => { tela.anotando = false; render(); });
  $('btnDiscarDeNovo').addEventListener('click', discarAtual);
  $('lnkDiscarDeNovo').addEventListener('click', discarAtual);
  $('btnPular').addEventListener('click', pular);
  $('abrirConfig').addEventListener('click', alternarConfig);
  $('formSenha').addEventListener('submit', conferirSenha);
  $('trancarConfig').addEventListener('click', trancarConfig);
  $('salvar').addEventListener('click', salvarConfig);
  $('gerarToken').addEventListener('click', gerarToken);
  $('ramal').addEventListener('change', salvarConfig);
  $('token').addEventListener('change', salvarConfig);

  if (MODO_GOOGLE) {
    $('btnAtualizar').addEventListener('click', carregarPlanilhaGoogle);
    await carregarPlanilhaGoogle();
  }
}

iniciar();
