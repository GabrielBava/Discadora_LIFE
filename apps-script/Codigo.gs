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
 * (PropertiesService, privado da sua conta). A Discadora nunca desliga ligações.
 */

const API4COM = 'https://api.api4com.com/api/v1';
const RAMAL_PADRAO = '1204';
const TITULOS_REGISTRO = { ligadoEm: 'Data/hora da ligação', resultado: 'Resultado', anotacao: 'Anotação' };

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
 */
function discar(ref, dados) {
  const config = config_();
  if (!config.token) {
    return { erro: 'Nenhum token da Api4Com salvo. Abra Configurações, cole o token e clique em Salvar.' };
  }
  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const aba = aba_();
    const linha = localizar_(aba, ref);
    const resposta = UrlFetchApp.fetch(`${API4COM}/dialer`, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: config.token },
      payload: JSON.stringify({
        extension: config.ramal,
        phone: String(dados.telefone),
        metadata: { nome: dados.nome, etapa: dados.etapa, campanha: dados.campanha },
      }),
      muteHttpExceptions: true,
    });
    const status = resposta.getResponseCode();
    if (status === 401) {
      return { erro: 'A Api4Com recusou o token (vencido ou inválido). Salve um token novo em Configurações.' };
    }
    if (status < 200 || status >= 300) {
      return { erro: `A Api4Com recusou a ligação (HTTP ${status}). ${resposta.getContentText().slice(0, 200)}` };
    }
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

/** Gera o token com e-mail e senha da Api4Com. A senha não é salva. */
function gerarToken(email, senha) {
  const resposta = UrlFetchApp.fetch(`${API4COM}/users/login`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ email, password: senha }),
    muteHttpExceptions: true,
  });
  let dados = {};
  try { dados = JSON.parse(resposta.getContentText()); } catch (e) { /* resposta sem JSON */ }
  if (resposta.getResponseCode() !== 200 || !dados.id) return { erro: `HTTP ${resposta.getResponseCode()}` };
  PropertiesService.getUserProperties().setProperty('API4COM_TOKEN', dados.id);
  return { tokenSalvo: true };
}

// ---------- Auxiliares (o "_" no fim esconde a função da página) ----------

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
