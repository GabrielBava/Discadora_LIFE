/**
 * Discadora LIFE — versão Planilhas Google (Google Apps Script).
 *
 * Cole este arquivo em Extensões → Apps Script da planilha de leads, junto com o
 * arquivo HTML "Discadora". Ele:
 *  - mostra a Discadora (doGet), que abre no celular e no PC;
 *  - lê os leads da primeira aba da planilha;
 *  - liga pela API da Api4Com usando o ramal e o token salvos na sua conta Google;
 *  - grava "Data/hora da ligação", "Resultado" e "Anotação" nas colunas ao lado dos dados.
 *
 * O token NÃO fica neste código: ele é salvo pela tela de Configurações da Discadora
 * (PropertiesService, privado da sua conta).
 *
 * Ligações (documentação oficial: developers.api4com.com, "Integração utilizando Webphone
 * API4COM"): POST /calls liga primeiro para o ramal, o Webphone atende sozinho e então a
 * Api4Com liga para o lead. A Api4Com aceita uma ligação por vez por usuário; por isso,
 * quando o usuário clica para ligar de novo, a ligação anterior (se ainda estiver ativa)
 * é encerrada antes. Fora isso, a Discadora não desliga nada.
 */

const API4COM = 'https://api.api4com.com/api/v1';
const RAMAL_PADRAO = '1204';
const TITULOS_REGISTRO = { ligadoEm: 'Data/hora da ligação', resultado: 'Resultado', anotacao: 'Anotação' };
const GATEWAY = 'discadora-life';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Discadora')
    .setTitle('Discadora LIFE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Leitura ----------

function lerPlanilha() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = aba_();
  const linhas = aba.getDataRange().getValues().map((linha) => linha.map(texto_));
  const config = config_();
  return {
    nome: `${planilha.getName()} · ${aba.getName()}`,
    linhas,
    ramal: config.ramal,
    tokenSalvo: Boolean(config.token),
  };
}

// ---------- Ligação ----------

/**
 * Liga para o lead e grava a data/hora do disparo na planilha.
 * ref = { linha, numero, colTelefone } (o servidor confere a linha pelo telefone).
 * dados = { telefone } no formato +55DDDNUMERO.
 */
function discar(ref, dados) {
  const config = config_();
  if (!config.token) {
    return { erro: 'Nenhum token da Api4Com salvo. Abra Configurações, cole o token e clique em Salvar.' };
  }
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const aba = aba_();
    const linha = localizar_(aba, ref);
    const props = PropertiesService.getUserProperties();

    // Uma ligação por vez: encerra a anterior, se ainda estiver ativa
    const anterior = props.getProperty('ULTIMA_CHAMADA');
    if (anterior) {
      if (encerrar_(anterior, config.token)) Utilities.sleep(1500);
      props.deleteProperty('ULTIMA_CHAMADA');
    }

    const resposta = UrlFetchApp.fetch(`${API4COM}/calls`, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: config.token },
      payload: JSON.stringify({
        extension: config.ramal,
        caller: config.ramal,
        called: String(dados.telefone),
        metadata: { gateway: GATEWAY, callRef: `dl-${Date.now()}` },
      }),
      muteHttpExceptions: true,
    });
    const status = resposta.getResponseCode();
    if (status < 200 || status >= 300) return { erro: mensagemErro_(status, resposta.getContentText()) };

    let id = '';
    try { id = JSON.parse(resposta.getContentText()).id || ''; } catch (e) { /* sem id */ }
    if (id) props.setProperty('ULTIMA_CHAMADA', id);

    const agora = new Date();
    const col = colunasRegistro_(aba);
    aba.getRange(linha, col.ligadoEm).setValue(agora).setNumberFormat('dd/mm/yyyy hh:mm');
    return { ligadoEm: agora.getTime(), ramal: config.ramal };
  } finally {
    trava.releaseLock();
  }
}

/** Grava o resultado (e a anotação) do lead. campos = { resultado, anotacao? } */
function registrar(ref, campos) {
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const aba = aba_();
    const linha = localizar_(aba, ref);
    const col = colunasRegistro_(aba);
    if ('resultado' in campos) aba.getRange(linha, col.resultado).setValue(textoSeguro_(campos.resultado));
    if ('anotacao' in campos) aba.getRange(linha, col.anotacao).setValue(textoSeguro_(campos.anotacao));
    return true;
  } finally {
    trava.releaseLock();
  }
}

// ---------- Configurações (ficam na sua conta Google, valem em todos os aparelhos) ----------

function salvarConfig(novo) {
  const props = PropertiesService.getUserProperties();
  if (novo && novo.ramal) props.setProperty('RAMAL', String(novo.ramal).trim());
  if (novo && novo.token) props.setProperty('API4COM_TOKEN', String(novo.token).trim());
  const config = config_();
  return { ramal: config.ramal, tokenSalvo: Boolean(config.token) };
}

/**
 * Gera um token que nunca expira com e-mail e senha da Api4Com (login + /users/accessTokens).
 * A senha não é salva.
 */
function gerarToken(email, senha) {
  const login = UrlFetchApp.fetch(`${API4COM}/users/login`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ email, password: senha }),
    muteHttpExceptions: true,
  });
  const temporario = json_(login).id;
  if (login.getResponseCode() !== 200 || !temporario) return { erro: `HTTP ${login.getResponseCode()}` };

  const permanente = UrlFetchApp.fetch(`${API4COM}/users/accessTokens`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: temporario },
    payload: JSON.stringify({ ttl: -1 }),
    muteHttpExceptions: true,
  });
  const token = (permanente.getResponseCode() === 200 && json_(permanente).id) || temporario;
  PropertiesService.getUserProperties().setProperty('API4COM_TOKEN', token);
  return { tokenSalvo: true, semValidade: token !== temporario };
}

// ---------- Auxiliares (o "_" no fim esconde a função da página) ----------

// Encerra uma ligação feita por POST /calls. Devolve true se ela ainda estava ativa.
function encerrar_(id, token) {
  const r = UrlFetchApp.fetch(`${API4COM}/calls/${encodeURIComponent(id)}/hangup`, {
    method: 'post',
    headers: { Authorization: token },
    muteHttpExceptions: true,
  });
  return r.getResponseCode() === 200; // 404 = já tinha terminado
}

// Respostas de POST /calls, conforme a documentação da Api4Com
function mensagemErro_(status, corpo) {
  const mensagens = {
    401: 'A Api4Com recusou o token (inválido, removido ou vencido). Salve um token novo em Configurações.',
    402: 'O plano ou a situação do seu usuário na Api4Com não permite ligar agora. Fale com o administrador da conta.',
    403: 'O plano ou a situação do seu usuário na Api4Com não permite ligar agora. Fale com o administrador da conta.',
    404: 'Ramal não encontrado na Api4Com. Confira o ramal em Configurações.',
    422: 'A Api4Com não aceitou o número. Confira o telefone deste lead na planilha.',
    424: 'O Webphone não atendeu. Deixe o Webphone da Api4Com aberto e "Online" no PC (em um navegador só) e tente de novo.',
    429: 'Muitas ligações em pouco tempo (limite da Api4Com: 15 por minuto). Espere um pouco e tente de novo.',
    503: 'A Api4Com está temporariamente indisponível. Tente de novo em alguns segundos.',
  };
  return mensagens[status] || `A Api4Com recusou a ligação (HTTP ${status}). ${String(corpo || '').slice(0, 200)}`;
}

function json_(resposta) {
  try { return JSON.parse(resposta.getContentText()) || {}; } catch (e) { return {}; }
}

function config_() {
  const props = PropertiesService.getUserProperties();
  return {
    ramal: props.getProperty('RAMAL') || RAMAL_PADRAO,
    token: props.getProperty('API4COM_TOKEN') || '',
  };
}

// A primeira aba da planilha (ou a aba com o nome salvo na propriedade ABA)
function aba_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const nome = PropertiesService.getScriptProperties().getProperty('ABA');
  return (nome && planilha.getSheetByName(nome)) || planilha.getSheets()[0];
}

// Datas vão em ISO (independe do fuso do aparelho); números sem notação científica
function texto_(v) {
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString();
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v);
}

function normalizar_(t) {
  return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Primeiro telefone da célula, só os dígitos (mesma regra da tela)
function digitos_(v) {
  const t = typeof v === 'number' ? v.toFixed(0) : String(v);
  return t.split(/[\/;|,]/)[0].replace(/\D/g, '');
}

// Evita que um texto começando com = + - @ vire fórmula
function textoSeguro_(t) {
  const s = String(t == null ? '' : t);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Confere se a linha ainda é do mesmo lead; se a planilha mudou, procura pelo telefone
function localizar_(aba, ref) {
  const col = Number(ref.colTelefone) + 1;
  const ultima = aba.getLastRow();
  if (ref.linha >= 2 && ref.linha <= ultima && digitos_(aba.getRange(ref.linha, col).getValue()) === ref.numero) {
    return ref.linha;
  }
  if (ultima >= 2) {
    const valores = aba.getRange(2, col, ultima - 1, 1).getValues();
    const i = valores.findIndex((l) => digitos_(l[0]) === ref.numero);
    if (i >= 0) return i + 2;
  }
  throw new Error('Não encontrei este lead na planilha. Clique em "Atualizar planilha".');
}

// Colunas de registro: usa as que já existem; senão cria logo depois da última coluna
function colunasRegistro_(aba) {
  const ultima = Math.max(aba.getLastColumn(), 1);
  const titulos = aba.getRange(1, 1, 1, ultima).getValues()[0].map(normalizar_);
  const col = {};
  let proxima = ultima + 1;
  Object.keys(TITULOS_REGISTRO).forEach((chave) => {
    const i = titulos.indexOf(normalizar_(TITULOS_REGISTRO[chave]));
    if (i >= 0) {
      col[chave] = i + 1;
    } else {
      col[chave] = proxima++;
      aba.getRange(1, col[chave]).setValue(TITULOS_REGISTRO[chave]).setFontWeight('bold');
    }
  });
  return col;
}
