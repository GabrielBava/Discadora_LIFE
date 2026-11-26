// Leitura de planilhas .xlsx e .csv sem bibliotecas externas.
// Devolve sempre uma matriz de linhas: [["Nome", "Telefone", ...], [...], ...]

const Planilha = (() => {
  async function lerArquivo(arquivo) {
    const nome = arquivo.name.toLowerCase();
    const buffer = await arquivo.arrayBuffer();
    if (nome.endsWith('.xlsx')) return lerXlsx(buffer);
    if (nome.endsWith('.csv') || nome.endsWith('.txt')) return lerCsv(decodificarTexto(buffer));
    throw new Error('Formato não suportado. Salve a planilha como .xlsx ou .csv.');
  }

  // ---------- CSV ----------

  // Exportações do Excel em português costumam vir em Windows-1252, não UTF-8.
  function decodificarTexto(buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  function lerCsv(texto) {
    const primeiraLinha = texto.split(/\r?\n/, 1)[0] || '';
    const contar = (c) => primeiraLinha.split(c).length - 1;
    const separador = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];

    const linhas = [];
    let linha = [];
    let campo = '';
    let entreAspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (entreAspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') entreAspas = false;
        else campo += c;
      } else if (c === '"') {
        entreAspas = true;
      } else if (c === separador) {
        linha.push(campo); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha);
        linha = []; campo = '';
      } else {
        campo += c;
      }
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return limpar(linhas);
  }

  // ---------- XLSX (arquivo zip com XML dentro) ----------

  async function lerXlsx(buffer) {
    const zip = abrirZip(buffer);
    const xml = async (caminho) => {
      const texto = await zip.lerTexto(caminho);
      return texto == null ? null : new DOMParser().parseFromString(texto, 'application/xml');
    };
    const filhos = (no, nome) => [...no.getElementsByTagNameNS('*', nome)];

    // Textos compartilhados (onde o Excel guarda a maioria dos textos)
    const compartilhados = [];
    const docTextos = await xml('xl/sharedStrings.xml');
    if (docTextos) {
      for (const si of filhos(docTextos, 'si')) compartilhados.push(textoRico(si));
    }

    // Primeira aba da pasta de trabalho
    let caminhoAba = 'xl/worksheets/sheet1.xml';
    const docPasta = await xml('xl/workbook.xml');
    const docRels = await xml('xl/_rels/workbook.xml.rels');
    const primeira = docPasta && filhos(docPasta, 'sheet')[0];
    if (primeira && docRels) {
      const idRel = [...primeira.attributes].find((a) => a.localName === 'id')?.value;
      const rel = filhos(docRels, 'Relationship').find((r) => r.getAttribute('Id') === idRel);
      const alvo = rel?.getAttribute('Target');
      if (alvo) caminhoAba = alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '');
    }
    const docAba = await xml(caminhoAba);
    if (!docAba) throw new Error('Não encontrei a primeira aba da planilha.');

    const linhas = [];
    let proximaLinha = 0;
    for (const row of filhos(docAba, 'row')) {
      const r = parseInt(row.getAttribute('r'), 10);
      const indiceLinha = Number.isFinite(r) ? r - 1 : proximaLinha;
      proximaLinha = indiceLinha + 1;
      const valores = [];
      let proximaColuna = 0;
      for (const c of filhos(row, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? indiceColuna(ref) : proximaColuna;
        proximaColuna = col + 1;
        valores[col] = valorCelula(c, compartilhados, filhos);
      }
      linhas[indiceLinha] = Array.from(valores, (v) => v ?? '');
    }
    return limpar(Array.from(linhas, (l) => l ?? []));
  }

  function valorCelula(c, compartilhados, filhos) {
    const tipo = c.getAttribute('t');
    const v = filhos(c, 'v')[0]?.textContent ?? '';
    if (tipo === 's') return compartilhados[parseInt(v, 10)] ?? '';
    if (tipo === 'inlineStr') return filhos(c, 'is')[0] ? textoRico(filhos(c, 'is')[0]) : '';
    if (tipo === 'b') return v === '1' ? 'VERDADEIRO' : 'FALSO';
    if ((tipo === null || tipo === 'n') && /e/i.test(v) && Number.isFinite(Number(v))) {
      const n = Number(v); // telefone salvo como número em notação científica
      return Number.isInteger(n) ? n.toFixed(0) : String(n);
    }
    return v;
  }

  // Junta os trechos <t> de um texto, ignorando a guia fonética (<rPh>)
  function textoRico(no) {
    return [...no.getElementsByTagNameNS('*', 't')]
      .filter((t) => t.parentNode.localName !== 'rPh')
      .map((t) => t.textContent)
      .join('');
  }

  function indiceColuna(ref) {
    const letras = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
    let n = 0;
    for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
    return n - 1;
  }

  function abrirZip(buffer) {
    const dv = new DataView(buffer);
    let fim = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error('Arquivo .xlsx inválido ou corrompido.');

    const entradas = {};
    const total = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Arquivo .xlsx inválido ou corrompido.');
      const tamNome = dv.getUint16(p + 28, true);
      const nome = new TextDecoder().decode(new Uint8Array(buffer, p + 46, tamNome));
      entradas[nome.toLowerCase()] = {
        metodo: dv.getUint16(p + 10, true),
        tamanho: dv.getUint32(p + 20, true),
        inicio: dv.getUint32(p + 42, true),
      };
      p += 46 + tamNome + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }

    return {
      async lerTexto(caminho) {
        const e = entradas[caminho.toLowerCase()];
        if (!e) return null;
        const dados = e.inicio + 30 + dv.getUint16(e.inicio + 26, true) + dv.getUint16(e.inicio + 28, true);
        const bytes = new Uint8Array(buffer, dados, e.tamanho);
        if (e.metodo === 0) return new TextDecoder().decode(bytes);
        if (e.metodo !== 8) throw new Error('Compressão do .xlsx não suportada.');
        const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(fluxo).text();
      },
    };
  }

  // Tira espaços das pontas e remove linhas totalmente vazias
  function limpar(linhas) {
    return linhas
      .map((l) => l.map((v) => String(v ?? '').trim()))
      .filter((l) => l.some((v) => v !== ''));
  }

  // ---------- Gerar .xlsx ----------
  // linhas: matriz de células. Texto vira texto; Date vira data/hora do Excel.
  // A primeira linha sai em negrito e fica congelada (cabeçalho).

  function escreverXlsx(linhas, nomeAba = 'Contatos') {
    const esc = (t) => String(t)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const letra = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
    const largura = Math.max(1, ...linhas.map((l) => l.length));

    const xmlLinhas = linhas.map((linha, r) => {
      const celulas = linha.map((v, c) => {
        const ref = letra(c) + (r + 1);
        if (v instanceof Date) return `<c r="${ref}" s="1"><v>${dataParaExcel(v)}</v></c>`;
        if (v === null || v === undefined || v === '') return '';
        return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="2"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${celulas}</row>`;
    }).join('');

    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const arquivos = {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} ${nsR}><sheets><sheet name="${esc(nomeAba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
      'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${largura}" width="24" customWidth="1"/></cols><sheetData>${xmlLinhas}</sheetData></worksheet>`,
    };
    return new Blob([zipSemCompressao(arquivos)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  // Data/hora local <-> número de série do Excel (dias desde 30/12/1899)
  function dataParaExcel(d) {
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
    return (utc / 86400000 + 25569).toFixed(6);
  }

  function excelParaData(valor) {
    const texto = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) {
      const d = new Date(texto); // ISO (vem da planilha Google)
      return isNaN(d) ? null : d;
    }
    if (/^\d+(\.\d+)?$/.test(texto) && Number(texto) > 20000) {
      const u = new Date(Math.round((Number(texto) - 25569) * 86400) * 1000);
      return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
    }
    const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  }

  function zipSemCompressao(arquivos) {
    const tabela = crc32Tabela();
    const partes = [];
    const central = [];
    let posicao = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const dados = new TextEncoder().encode(conteudo);
      const bNome = new TextEncoder().encode(nome);
      let crc = 0xffffffff;
      for (const b of dados) crc = tabela[(crc ^ b) & 0xff] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(12, 0x5821, true); // data fixa (01/01/2024)
      local.setUint32(14, crc, true);
      local.setUint32(18, dados.length, true);
      local.setUint32(22, dados.length, true);
      local.setUint16(26, bNome.length, true);
      partes.push(new Uint8Array(local.buffer), bNome, dados);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(14, 0x5821, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, dados.length, true);
      cd.setUint32(24, dados.length, true);
      cd.setUint16(28, bNome.length, true);
      cd.setUint32(42, posicao, true);
      central.push(new Uint8Array(cd.buffer), bNome);
      posicao += 30 + bNome.length + dados.length;
    }
    const tamanhoCentral = central.reduce((t, p) => t + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, Object.keys(arquivos).length, true);
    fim.setUint16(10, Object.keys(arquivos).length, true);
    fim.setUint32(12, tamanhoCentral, true);
    fim.setUint32(16, posicao, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)]);
  }

  function crc32Tabela() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  }

  return { lerArquivo, lerCsv, lerXlsx, escreverXlsx, excelParaData };
})();
