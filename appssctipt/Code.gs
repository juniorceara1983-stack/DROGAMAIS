/**
 * EstoqueFarmácia PRO – Google Apps Script Backend v2.0
 *
 * Setup:
 *  1. Open your Google Spreadsheet.
 *  2. Go to Extensions → Apps Script.
 *  3. Paste this entire file and save.
 *  4. Deploy as a Web App (Execute as: Me, Who has access: Anyone).
 *  5. Copy the deployment URL and paste it into docs/js/config.js.
 *
 * Spreadsheet structure:
 *   Sheet "Estoque"  → Col A: Medicine name | Col B: Current stock | Col C: NCM | Col D: ICMS | Col E: Price
 *   Sheet "Vendas"   → Col A: Medicine name | Col B: Qty sold | Col C: Fabricante
 *                      Cell G1: days the sales data covers (e.g. 30)
 *   Sheet "Tributario" → Auto-generated tax summary
 *   Sheet "Revendedores" → Supplier/reseller data
 */

// ─── Spreadsheet ID ──────────────────────────────────────────────
var SPREADSHEET_ID = '1ydCAgpG1uRO9jYONFifUDr7vX4PJQBZwQQzVOqgQ3rw';

// ─── Sheet name constants ────────────────────────────────────────
var SHEET_ESTOQUE = 'Estoque';
var SHEET_VENDAS  = 'Vendas';
var SHEET_TRIBUTARIO = 'Tributario';
var SHEET_REVENDEDORES = 'Revendedores';

// ─── Tax constants ───────────────────────────────────────────────
var ICMS_TIPOS = {
  'SUBS. TRIB': 0,
  'ST': 0,
  'ISENTO': 0,
  'TRIBUTADO': 18,
  'NAO TRIBUTADO': 0,
};

// ─── Unit-aware sheet name helpers ───────────────────────────────
function nomeAba(base, unidade) {
  if (!unidade || String(unidade).trim() === '') return base;
  return String(unidade).trim() + ' \u2013 ' + base;
}

// ─── Entry point: GET ────────────────────────────────────────────
function doGet(e) {
  var params = e.parameter;
  var action = params.action || 'ping';

  try {
    if (action === 'calcular') {
      var dias    = parseInt(params.dias, 10);
      var unidade = params.unidade || '';
      if (isNaN(dias) || dias <= 0) return jsonError('Parâmetro "dias" inválido.');
      return jsonOk(calcularNecessidade(dias, unidade));
    }

    if (action === 'relatorio') {
      var top     = parseInt(params.top, 10);
      var unidade = params.unidade || '';
      if (isNaN(top) || top < 0) top = 0;
      return jsonOk(gerarRelatorioMaisVendidos(top, unidade));
    }

    if (action === 'tributario') {
      var unidade = params.unidade || '';
      return jsonOk(gerarResumoTributario(unidade));
    }

    if (action === 'indicadores') {
      var unidade = params.unidade || '';
      return jsonOk(gerarIndicadores(unidade));
    }

    if (action === 'ping') {
      return jsonOk({ status: 'ok', version: '2.0', timestamp: new Date().toISOString() });
    }

    return jsonError('Ação desconhecida: ' + action);
  } catch (err) {
    return jsonError(err.message);
  }
}

// ─── Entry point: POST ───────────────────────────────────────────
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action;
    var unidade = payload.unidade || '';

    if (action === 'importarEstoque') {
      var sheetName = nomeAba(SHEET_ESTOQUE, unidade);
      importarDados(sheetName, payload.dados, payload.clearFirst !== false, payload.colunas || 2);
      return jsonOk({ importados: payload.dados.length });
    }

    if (action === 'importarVendas') {
      var sheetName = nomeAba(SHEET_VENDAS, unidade);
      importarDados(sheetName, payload.dados, payload.clearFirst !== false, payload.colunas || 2);
      if (payload.periodo && payload.clearFirst !== false) {
        var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
        var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
        sheet.getRange('G1').setValue(payload.periodo);
      }
      return jsonOk({ importados: payload.dados.length });
    }

    if (action === 'salvarRevendedor') {
      return jsonOk(salvarRevendedor(payload.dados));
    }

    return jsonError('Ação POST desconhecida: ' + action);
  } catch (err) {
    return jsonError(err.message);
  }
}

// ─── Core: Calculate purchase needs ──────────────────────────────
function calcularNecessidade(diasCobertura, unidade) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var MARGEM = 3;
  var diasEfetivos = diasCobertura + MARGEM;

  var nomeEstoque  = nomeAba(SHEET_ESTOQUE, unidade);
  var sheetEstoque = ss.getSheetByName(nomeEstoque);
  if (!sheetEstoque) throw new Error('Aba "' + nomeEstoque + '" não encontrada.');
  var dadosEstoque = sheetEstoque.getDataRange().getValues();

  var mapaEstoque = {};
  for (var i = 0; i < dadosEstoque.length; i++) {
    var nome = String(dadosEstoque[i][0]).trim();
    var qtd  = parseFloat(dadosEstoque[i][1]) || 0;
    if (nome && nome.toLowerCase() !== 'nome' && nome.toLowerCase() !== 'medicamento') {
      mapaEstoque[nome.toUpperCase()] = qtd;
    }
  }

  var nomeVendas  = nomeAba(SHEET_VENDAS, unidade);
  var sheetVendas = ss.getSheetByName(nomeVendas);
  if (!sheetVendas) throw new Error('Aba "' + nomeVendas + '" não encontrada.');
  var dadosVendas = sheetVendas.getDataRange().getValues();
  var diasVendas  = parseFloat(sheetVendas.getRange('G1').getValue()) || 30;

  var mapaVendas = {};
  for (var j = 0; j < dadosVendas.length; j++) {
    var nomeV = String(dadosVendas[j][0]).trim();
    var qtdV  = parseFloat(dadosVendas[j][1]) || 0;
    if (nomeV && nomeV.toLowerCase() !== 'nome' && nomeV.toLowerCase() !== 'medicamento') {
      mapaVendas[nomeV.toUpperCase()] = qtdV;
    }
  }

  var lista = [];
  var todosNomes = Object.keys(mapaVendas);

  for (var k = 0; k < todosNomes.length; k++) {
    var chave        = todosNomes[k];
    var vendasTotais = mapaVendas[chave]  || 0;
    var estoqueAtual = mapaEstoque[chave] || 0;
    var mediaDiaria  = vendasTotais / diasVendas;
    var projecao     = mediaDiaria * diasEfetivos;
    var necessidade  = projecao - estoqueAtual;

    if (necessidade > 0) {
      var cobertura = mediaDiaria > 0 ? estoqueAtual / mediaDiaria : 999;
      var urgencia = 'baixa';
      if (cobertura <= 2) urgencia = 'critica';
      else if (cobertura <= 5) urgencia = 'alta';
      else if (cobertura <= 10) urgencia = 'media';

      lista.push({
        medicamento:  chave,
        estoqueAtual: estoqueAtual,
        mediaDiaria:  Math.round(mediaDiaria * 100) / 100,
        projecao:     Math.round(projecao * 10) / 10,
        comprar:      Math.ceil(necessidade),
        urgencia:     urgencia,
        coberturaDias: Math.round(cobertura),
      });
    }
  }

  lista.sort(function(a, b) {
    var urgOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
    var diff = (urgOrder[a.urgencia] || 3) - (urgOrder[b.urgencia] || 3);
    return diff !== 0 ? diff : b.comprar - a.comprar;
  });

  return {
    diasCobertura: diasCobertura,
    diasVendas:    diasVendas,
    totalItens:    lista.length,
    geradoEm:      new Date().toISOString(),
    itens:         lista,
  };
}

// ─── Report: most-sold items ─────────────────────────────────────
function gerarRelatorioMaisVendidos(top, unidade) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var nomeVendas  = nomeAba(SHEET_VENDAS, unidade);
  var sheetVendas = ss.getSheetByName(nomeVendas);
  if (!sheetVendas) throw new Error('Aba "' + nomeVendas + '" não encontrada.');
  var dadosVendas = sheetVendas.getDataRange().getValues();
  var diasVendas  = parseFloat(sheetVendas.getRange('G1').getValue()) || 30;

  var lista = [];
  for (var j = 0; j < dadosVendas.length; j++) {
    var nome = String(dadosVendas[j][0]).trim();
    var qtd  = parseFloat(dadosVendas[j][1]) || 0;
    if (!nome || nome.toLowerCase() === 'nome' || nome.toLowerCase() === 'medicamento') continue;
    lista.push({ medicamento: nome.toUpperCase(), totalVendido: qtd, mediaDiaria: Math.round((qtd / diasVendas) * 100) / 100 });
  }
  lista.sort(function(a, b) { return b.mediaDiaria - a.mediaDiaria; });
  var itens = (top > 0) ? lista.slice(0, top) : lista;

  return { diasVendas: diasVendas, totalItens: itens.length, geradoEm: new Date().toISOString(), itens: itens };
}

// ─── Tax summary ─────────────────────────────────────────────────
function gerarResumoTributario(unidade) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var nomeEstoque = nomeAba(SHEET_ESTOQUE, unidade);
  var sheet = ss.getSheetByName(nomeEstoque);
  if (!sheet) throw new Error('Aba "' + nomeEstoque + '" não encontrada.');
  var dados = sheet.getDataRange().getValues();

  var totalBase = 0, totalIcms = 0;
  var porTipo = {};

  for (var i = 1; i < dados.length; i++) {
    var nome  = String(dados[i][0]).trim();
    var qtd   = parseFloat(dados[i][1]) || 0;
    var ncm   = String(dados[i][2] || '').trim();
    var icms  = String(dados[i][3] || 'SUBS. TRIB').trim().toUpperCase();
    var preco = parseFloat(dados[i][4]) || 0;

    if (!nome) continue;
    var valorBase = qtd * preco;
    var aliquota  = ICMS_TIPOS[icms] !== undefined ? ICMS_TIPOS[icms] : 18;
    var icmsValor = valorBase * (aliquota / 100);

    totalBase += valorBase;
    totalIcms += icmsValor;

    if (!porTipo[icms]) porTipo[icms] = { qtd: 0, valor: 0, imposto: 0 };
    porTipo[icms].qtd++;
    porTipo[icms].valor += valorBase;
    porTipo[icms].imposto += icmsValor;
  }

  return {
    totalBase: Math.round(totalBase * 100) / 100,
    totalIcms: Math.round(totalIcms * 100) / 100,
    porTipoIcms: porTipo,
    geradoEm: new Date().toISOString(),
  };
}

// ─── Indicators ──────────────────────────────────────────────────
function gerarIndicadores(unidade) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var nomeEstoque = nomeAba(SHEET_ESTOQUE, unidade);
  var sheetEstoque = ss.getSheetByName(nomeEstoque);
  var nomeVendas = nomeAba(SHEET_VENDAS, unidade);
  var sheetVendas = ss.getSheetByName(nomeVendas);

  var totalItens = 0, totalEstoque = 0, valorEstoque = 0;
  if (sheetEstoque) {
    var dados = sheetEstoque.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      var nome = String(dados[i][0]).trim();
      if (!nome) continue;
      totalItens++;
      var qtd = parseFloat(dados[i][1]) || 0;
      var preco = parseFloat(dados[i][4]) || 0;
      totalEstoque += qtd;
      valorEstoque += qtd * preco;
    }
  }

  var totalVendas = 0;
  if (sheetVendas) {
    var dadosV = sheetVendas.getDataRange().getValues();
    for (var j = 1; j < dadosV.length; j++) {
      totalVendas += parseFloat(dadosV[j][1]) || 0;
    }
  }

  return {
    totalItens: totalItens,
    totalEstoque: totalEstoque,
    valorEstoque: Math.round(valorEstoque * 100) / 100,
    totalVendas: totalVendas,
    geradoEm: new Date().toISOString(),
  };
}

// ─── Import helpers ──────────────────────────────────────────────
function importarDados(sheetName, dados, clearFirst, numCols) {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) { sheet = ss.insertSheet(sheetName); clearFirst = true; }
  if (!dados || dados.length === 0) return;
  if (!numCols) numCols = 2;

  if (clearFirst) {
    sheet.clearContents();
    var headers = ['Medicamento', 'Quantidade'];
    if (numCols >= 3) headers.push('NCM');
    if (numCols >= 4) headers.push('ICMS');
    if (numCols >= 5) headers.push('Preço');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) lastRow = 1;

  var rows = dados.map(function(row) {
    var r = [String(row[0]).trim(), parseFloat(row[1]) || 0];
    if (numCols >= 3) r.push(row[2] || '');
    if (numCols >= 4) r.push(row[3] || '');
    if (numCols >= 5) r.push(parseFloat(row[4]) || 0);
    return r;
  });

  sheet.getRange(lastRow + 1, 1, rows.length, numCols).setValues(rows);
}

// ─── Reseller management ─────────────────────────────────────────
function salvarRevendedor(dados) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_REVENDEDORES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_REVENDEDORES);
    sheet.getRange(1, 1, 1, 5).setValues([['Nome', 'Contato', 'WhatsApp', 'Email', 'Produtos']]);
  }
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, 5).setValues([[
    dados.nome || '',
    dados.contato || '',
    dados.whatsapp || '',
    dados.email || '',
    dados.produtos || '',
  ]]);
  return { salvo: true };
}

// ─── Response helpers ────────────────────────────────────────────
function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
