/**
 * docs/js/app.js – EstoqueFarmácia PRO v2.0
 * Frontend logic with all modules integrated
 */

/* ── State ──────────────────────────────────────────────────────── */
const state = {
  periodoSelecionado: 14,
  topSelecionado: 10,
  estoqueCarregado: false,
  vendasCarregadas: false,
  resultado: null,
  relatorio: null,
  estoqueLocal: null,
  vendasLocal: null,
  diasVendasLocal: 7,
  estoqueVemSugestao: false,
  precoLocal: {},
  ncmLocal: {},
  icmsLocal: {},
  unidade: (CONFIG.UNIDADES && CONFIG.UNIDADES[0]) || 'Loja 01',
  fabricanteLocal: {},
  filtroFabricante: 'todos',
  currentPage: 'dashboard',
  sortCol: -1,
  sortAsc: true,
  pedidoAtual: null,
  chartInstances: {},
  // Pagination
  pages: { compras: 1, abc: 1, giro: 1, tax: 1 },
  pageSize: 50,
};

const MARGEM_SEGURANCA_DIAS = 3;
const LABOR_COL_OFFSET = 5;

/* ── DOM refs ───────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

/* ── Bootstrap ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupUnidadeSelector();
  setupPeriodButtons();
  setupTopButtons();
  setupDropzone('estoqueDropzone', 'estoqueCsvInput', 'estoqueProgress', 'estoqueStatus', 'Estoque', false);
  setupDropzone('vendasDropzone', 'vendasCsvInput', 'vendasProgress', 'vendasStatus', 'Vendas', true);
  updateCalcularBtn();
  renderRevendedores();
  renderHistoricoPedidos();
  loadTheme();
  // Check if data exists in localStorage
  loadCachedData();
});

/* ── Navigation ─────────────────────────────────────────────────── */
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = $('page-' + page);
  if (section) section.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  const titles = {
    dashboard: 'Dashboard',
    importar: 'Importar Dados',
    compras: 'Sugestão de Compras',
    analise: 'Análise & Relatórios',
    tributario: 'Tributário',
    revendedores: 'Revendedores',
  };
  $('pageTitle').textContent = titles[page] || page;
  // Close sidebar on mobile
  $('sidebar').classList.remove('open');
}

function toggleSidebar() {
  $('sidebar').classList.toggle('open');
}

function switchTab(page, tabId) {
  const section = $('page-' + page);
  if (!section) return;
  section.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  section.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const tab = $(tabId);
  if (tab) tab.classList.add('active');
  event.target.classList.add('active');
}

/* ── Theme ──────────────────────────────────────────────────────── */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  $('themeLabel').textContent = isDark ? 'Escuro' : 'Claro';
  localStorage.setItem('farmacia_theme', isDark ? 'light' : 'dark');
  // Rebuild charts with new colors
  if (state.estoqueLocal || state.vendasLocal) updateDashboard();
}

function loadTheme() {
  const saved = localStorage.getItem('farmacia_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  $('themeLabel').textContent = saved === 'dark' ? 'Claro' : 'Escuro';
}

/* ── Unit selector ──────────────────────────────────────────────── */
function setupUnidadeSelector() {
  const sel = $('unidadeSelect');
  if (!sel) return;
  const unidades = (CONFIG.UNIDADES && CONFIG.UNIDADES.length) ? CONFIG.UNIDADES : ['Loja 01'];
  sel.innerHTML = '';
  unidades.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    sel.appendChild(opt);
  });
  sel.value = state.unidade;
  sel.addEventListener('change', () => { state.unidade = sel.value; });
}

/* ── Period selector ────────────────────────────────────────────── */
function setupPeriodButtons() {
  document.querySelectorAll('.period-btn[data-dias]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn[data-dias]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.periodoSelecionado = parseInt(btn.dataset.dias, 10);
    });
  });
}

function setupTopButtons() {
  document.querySelectorAll('.top-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.top-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.topSelecionado = parseInt(btn.dataset.top, 10);
    });
  });
}

/* ── Dropzone ───────────────────────────────────────────────────── */
function setupDropzone(zoneId, inputId, progressId, statusId, tipo, isVendas) {
  const zone = $(zoneId);
  const input = $(inputId);
  if (!zone || !input) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('over');
    if (e.dataTransfer.files[0]) handleCsvFile(e.dataTransfer.files[0], progressId, statusId, tipo, isVendas);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) handleCsvFile(input.files[0], progressId, statusId, tipo, isVendas);
    input.value = '';
  });
}

/* ── CSV/XLS parsing ────────────────────────────────────────────── */
function handleCsvFile(file, progressId, statusId, tipo, isVendas) {
  const isXls = file.name.match(/\.xlsx?$/i);
  const isCsv = file.name.match(/\.(csv|txt)$/i);
  if (!isXls && !isCsv) { showToast('Arquivo inválido. Use CSV, XLS ou XLSX.', 'error'); return; }

  const status = $(statusId);
  status.textContent = 'Lendo arquivo…';

  if (isXls) {
    if (typeof XLSX === 'undefined') { showToast('Biblioteca XLS não carregou.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseXlsRows(ws);
        if (isParsedEmpty(parsed)) { status.textContent = '⚠️ Arquivo vazio.'; return; }
        await processRows(parsed, progressId, statusId, tipo, isVendas, status);
      } catch (err) { status.textContent = `❌ Erro: ${err.message}`; }
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const parsed = parseCsv(e.target.result);
      if (isParsedEmpty(parsed)) { status.textContent = '⚠️ Arquivo vazio.'; return; }
      await processRows(parsed, progressId, statusId, tipo, isVendas, status);
    };
    reader.readAsText(file, 'UTF-8');
  }
}

function isParsedEmpty(parsed) {
  if (!parsed) return true;
  if (parsed.format === 'sugestao' || parsed.format === 'rede') return (!parsed.estoqueRows || parsed.estoqueRows.length === 0);
  if (parsed.format === 'nf') return (!parsed.rows || parsed.rows.length === 0);
  return (!parsed || parsed.length === 0);
}

function parseXlsRows(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const allRows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? cell.v : '');
    }
    allRows.push(row);
  }
  return detectAndParse(allRows);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const allRows = lines.map(line => splitCsvLine(line));
  return detectAndParse(allRows);
}

function splitCsvLine(line) {
  const sep = (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ';' : ',';
  const cells = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { cells.push(current); current = ''; continue; }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function detectAndParse(allRows) {
  // Detect format
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim().toUpperCase());
    const joined = cells.join(' ');
    if (joined.includes('SUGEST') && joined.includes('COMPRA')) return parseSugestaoRows(allRows);
    if (cells.some(c => /^C[ÓO]D\.?$/i.test(c)) && cells.some(c => /^ESTOQ$/i.test(c) || /^VEND\.?$/i.test(c))) return parseSugestaoRows(allRows);
    // Detect NF estoque format
    const headerIdx = cells.findIndex(c => c.includes('DESCRI') || c.includes('NCM'));
    if (headerIdx >= 0 && cells.some(c => c.includes('QTD'))) return parseDrogamaisEstoqueRows(allRows, i);
  }
  // Rede format check
  for (let i = 0; i < Math.min(15, allRows.length); i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim().toUpperCase());
    if (cells.some(c => c.includes('REDE')) && cells.some(c => c.includes('SALDO'))) return parseRedeRows(allRows);
  }
  // Simple 2-column fallback
  return parseSimpleRows(allRows);
}

function parseDrogamaisEstoqueRows(allRows, headerIdx) {
  const rows = [], precos = {}, ncms = {}, icmsMap = {};
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim());
    const code = cells[1] || '';
    const nome = cells[3] || '';
    const ncm = cells[7] || '';
    const icms = cells[9] || '';
    const qtd = parseFloat((cells[12] || '').replace(',', '.'));
    const preco = parseFloat((cells[14] || '').replace(',', '.')) || 0;
    if (!nome || !code || isNaN(qtd) || qtd <= 0 || isNaN(parseInt(code, 10))) continue;
    const nomeCompleto = `${code} – ${nome}`;
    rows.push([nomeCompleto, qtd]);
    precos[nomeCompleto.toUpperCase()] = preco;
    if (ncm) ncms[nomeCompleto.toUpperCase()] = ncm;
    if (icms) icmsMap[nomeCompleto.toUpperCase()] = icms;
  }
  return { format: 'nf', rows, precos, ncms, icmsMap };
}

function parseSugestaoRows(allRows) {
  let periodoDias = 7;
  for (let i = 0; i < Math.min(15, allRows.length); i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim());
    for (const cell of cells) {
      const m = cell.match(/(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        const d1 = new Date(+m[3], +m[2] - 1, +m[1]);
        const d2 = new Date(+m[6], +m[5] - 1, +m[4]);
        const diff = Math.round((d2 - d1) / 86400000);
        if (diff > 0) { periodoDias = diff; break; }
      }
    }
  }

  let codeCol = 2, nomeCol = 3, saldoCol = 9, vendCol = 13, custoUnitCol = 17, laborCol = 7;
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim());
    const cidx = cells.findIndex(c => /^C[ÓO]D\.?$/i.test(c));
    if (cidx >= 0) {
      codeCol = cidx; nomeCol = cidx + 1;
      const lidx = cells.findIndex(c => /^LABOR\.?$/i.test(c));
      laborCol = lidx >= 0 ? lidx : cidx + LABOR_COL_OFFSET;
    }
    const eidx = cells.findIndex(c => /^ESTOQ$/i.test(c));
    const vidx = cells.findIndex(c => /^VEND\.?$/i.test(c));
    if (eidx >= 0 && vidx >= 0) {
      saldoCol = eidx; vendCol = vidx;
      const uidx = cells.findIndex(c => /^UNIT\.?$/i.test(c));
      if (uidx >= 0) custoUnitCol = uidx;
      break;
    }
  }

  const estoqueRows = [], vendasRows = [], precos = {}, fabricantes = {};
  for (let i = 0; i < allRows.length; i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim());
    const code = cells[codeCol] || '';
    if (!code || isNaN(parseFloat(code)) || parseFloat(code) <= 0) continue;
    const nome = cells[nomeCol] || '';
    if (!nome) continue;
    const saldo = parseFloat((cells[saldoCol] || '0').replace(',', '.')) || 0;
    const qtdVend = parseFloat((cells[vendCol] || '0').replace(',', '.')) || 0;
    const custo = parseFloat((cells[custoUnitCol] || '0').replace(',', '.')) || 0;
    const fabricante = (cells[laborCol] || '').trim();
    const nomeComCodigo = `${code} – ${nome}`;
    estoqueRows.push([nomeComCodigo, Math.max(0, saldo)]);
    vendasRows.push([nomeComCodigo, qtdVend]);
    if (custo > 0) precos[nomeComCodigo.toUpperCase()] = custo;
    if (fabricante) fabricantes[nomeComCodigo.toUpperCase()] = fabricante;
  }
  return { format: 'sugestao', estoqueRows, vendasRows, periodoDias, precos, fabricantes };
}

function parseRedeRows(allRows) {
  const estoqueRows = [], vendasRows = [], precos = {};
  let dataStarted = false;
  for (let i = 0; i < allRows.length; i++) {
    const cells = allRows[i].map(c => String(c == null ? '' : c).trim());
    if (!dataStarted) {
      if (cells.some(c => /SALDO/i.test(c))) { dataStarted = true; continue; }
      continue;
    }
    const code = cells[0] || cells[1] || '';
    if (!code || isNaN(parseInt(code, 10))) continue;
    const nome = cells[1] || cells[2] || '';
    const saldo = parseFloat((cells[3] || cells[4] || '0').replace(',', '.')) || 0;
    const vend = parseFloat((cells[5] || cells[6] || '0').replace(',', '.')) || 0;
    const preco = parseFloat((cells[7] || cells[8] || '0').replace(',', '.')) || 0;
    if (!nome) continue;
    const full = `${code} – ${nome}`;
    estoqueRows.push([full, Math.max(0, saldo)]);
    vendasRows.push([full, vend]);
    if (preco > 0) precos[full.toUpperCase()] = preco;
  }
  return { format: 'rede', estoqueRows, vendasRows, precos };
}

function parseSimpleRows(allRows) {
  const rows = [];
  for (const row of allRows) {
    const nome = String(row[0] == null ? '' : row[0]).trim();
    const qtdRaw = String(row[1] == null ? '' : row[1]).trim().replace(',', '.');
    const qtd = parseFloat(qtdRaw);
    if (!nome || isNaN(qtd)) continue;
    rows.push([nome, qtd]);
  }
  return rows;
}

/* ── Process parsed rows ────────────────────────────────────────── */
async function processRows(parsed, progressId, statusId, tipo, isVendas, status) {
  if (parsed.format === 'rede' || parsed.format === 'sugestao') {
    const total = parsed.estoqueRows.length;
    if (total === 0) { status.textContent = '⚠️ Nenhum item encontrado.'; return; }

    state.estoqueLocal = parsed.estoqueRows.slice();
    state.vendasLocal = parsed.vendasRows.slice();
    state.diasVendasLocal = parsed.format === 'rede' ? 30 : parsed.periodoDias;
    state.estoqueVemSugestao = true;
    state.estoqueCarregado = true;
    state.vendasCarregadas = true;
    if (parsed.precos) Object.assign(state.precoLocal, parsed.precos);
    if (parsed.fabricantes) Object.assign(state.fabricanteLocal, parsed.fabricantes);
    updateCalcularBtn();

    const label = parsed.format === 'rede' ? 'Rede' : 'Sugestão de Compras';
    status.textContent = `✅ ${label} detectada – ${total} itens importados!`;
    $('estoqueStatus').textContent = `✅ ${total} itens de estoque importados!`;
    $('vendasStatus').textContent = `✅ ${total} itens de vendas importados (${state.diasVendasLocal} dias)!`;
    showToast(`${label}: ${total} itens importados.`, 'success');

    // Cache data
    cacheData();
    // Update dashboard
    updateDashboard();
    updateAnalytics();
    updateTributario();
    return;
  }

  if (parsed.format === 'nf') {
    const total = parsed.rows.length;
    if (total === 0) { status.textContent = '⚠️ Nenhum item encontrado.'; return; }
    state.estoqueLocal = parsed.rows.slice();
    state.estoqueCarregado = true;
    if (parsed.precos) Object.assign(state.precoLocal, parsed.precos);
    if (parsed.ncms) Object.assign(state.ncmLocal, parsed.ncms);
    if (parsed.icmsMap) Object.assign(state.icmsLocal, parsed.icmsMap);
    updateCalcularBtn();
    status.textContent = `✅ ${total} itens de estoque importados (NF)!`;
    showToast(`Estoque NF: ${total} itens.`, 'success');
    cacheData();
    updateDashboard();
    updateTributario();
    return;
  }

  // Simple format
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  if (rows.length === 0) { status.textContent = '⚠️ Nenhum item encontrado.'; return; }

  if (isVendas) {
    state.vendasLocal = rows;
    state.vendasCarregadas = true;
    status.textContent = `✅ ${rows.length} itens de vendas importados!`;
  } else {
    state.estoqueLocal = rows;
    state.estoqueCarregado = true;
    status.textContent = `✅ ${rows.length} itens de estoque importados!`;
  }
  updateCalcularBtn();
  showToast(`${tipo}: ${rows.length} itens importados.`, 'success');
  cacheData();
  updateDashboard();
}

/* ── Local calculation ──────────────────────────────────────────── */
function calcularLocal(diasCobertura) {
  const diasEfetivos = diasCobertura + MARGEM_SEGURANCA_DIAS;
  const mapaEstoque = {};
  if (state.estoqueLocal) {
    state.estoqueLocal.forEach(([nome, qtd]) => {
      const chave = String(nome).trim().toUpperCase();
      if (chave) mapaEstoque[chave] = Number(qtd) || 0;
    });
  }

  const diasVendas = state.diasVendasLocal || 7;
  const lista = [];

  (state.vendasLocal || []).forEach(([nome, vendasTotais]) => {
    const chave = String(nome).trim().toUpperCase();
    if (!chave) return;
    const estoqueAtual = mapaEstoque[chave] ?? 0;
    const vendas = Number(vendasTotais) || 0;
    const mediaDiaria = vendas / diasVendas;
    const projecao = mediaDiaria * diasEfetivos;
    const necessidade = projecao - estoqueAtual;
    const preco = state.precoLocal[chave] || 0;

    // Ponto de pedido e urgência
    const pp = ANALYTICS.pontoPedido(mediaDiaria);
    const cobertura = mediaDiaria > 0 ? estoqueAtual / mediaDiaria : 999;
    let urgencia = 'baixa';
    if (cobertura <= 2) urgencia = 'critica';
    else if (cobertura <= 5) urgencia = 'alta';
    else if (cobertura <= 10) urgencia = 'media';

    if (necessidade > 0) {
      const comprar = Math.ceil(necessidade);
      lista.push({
        medicamento: chave,
        fabricante: state.fabricanteLocal[chave] || '',
        estoqueAtual,
        mediaDiaria: Math.round(mediaDiaria * 100) / 100,
        projecao: Math.round(projecao * 10) / 10,
        comprar,
        precoUnitario: preco,
        valorEstimado: preco > 0 ? Math.round(preco * comprar * 100) / 100 : 0,
        urgencia,
        coberturaDias: Math.round(cobertura),
        pontoPedido: pp.pontoPedido,
        ncm: state.ncmLocal[chave] || '',
        icms: state.icmsLocal[chave] || 'SUBS. TRIB',
      });
    }
  });

  lista.sort((a, b) => {
    const urgOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
    return (urgOrder[a.urgencia] || 3) - (urgOrder[b.urgencia] || 3) || b.comprar - a.comprar;
  });

  const valorTotal = lista.reduce((s, i) => s + i.valorEstimado, 0);
  return {
    diasCobertura,
    diasVendas,
    totalItens: lista.length,
    valorTotal: Math.round(valorTotal * 100) / 100,
    geradoEm: new Date().toISOString(),
    itens: lista,
  };
}

/* ── Calculate ──────────────────────────────────────────────────── */
async function calcular() {
  const btn = $('btnCalcular');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Calculando…';

  try {
    if (state.vendasLocal && state.vendasLocal.length > 0) {
      const resultado = calcularLocal(state.periodoSelecionado);
      state.resultado = resultado;
      renderResultado(resultado);
      showToast(`Lista gerada: ${resultado.totalItens} item(s).`, 'success');
      navigateTo('compras');
      updateDashboard();
      updateAnalytics();
      updateTributario();
      return;
    }
    showToast('Importe dados de vendas primeiro.', 'error');
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Calcular Lista de Compras';
  }
}

/* ── Render purchase list ───────────────────────────────────────── */
function fmtBrl(value) {
  return value > 0 ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '–';
}

function fmtUnidade() {
  return state.unidade ? ` – ${escHtml(state.unidade)}` : '';
}

function renderResultado(data) {
  $('metaDias').textContent = `${data.diasCobertura} (+${MARGEM_SEGURANCA_DIAS} seg.)`;
  $('metaTotal').textContent = data.totalItens;
  $('metaValorTotal').textContent = data.valorTotal > 0 ? fmtBrl(data.valorTotal) : '–';
  $('metaGerado').textContent = new Date(data.geradoEm).toLocaleString('pt-BR');

  if (!data.itens || data.itens.length === 0) {
    $('emptyState').style.display = 'block';
    $('tabelaWrap').style.display = 'none';
    return;
  }

  $('emptyState').style.display = 'none';
  $('tabelaWrap').style.display = '';

  // Build distributor filter
  const fabricantes = [...new Set(data.itens.map(i => i.fabricante).filter(Boolean))].sort();
  const filterWrap = $('fabricanteFilterWrap');
  const filterSel = $('fabricanteSelect');
  if (fabricantes.length > 0) {
    filterSel.innerHTML = '<option value="todos">Todos os Fornecedores</option>';
    fabricantes.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = f;
      filterSel.appendChild(opt);
    });
    filterWrap.style.display = '';
  } else {
    filterWrap.style.display = 'none';
  }

  renderComprasPage(data, 1);
}

function renderComprasPage(data, page) {
  state.pages.compras = page;
  const start = (page - 1) * state.pageSize;
  const end = start + state.pageSize;
  const itens = data.itens.slice(start, end);
  const temPrecos = data.itens.some(i => i.precoUnitario > 0);

  const tbody = $('tabelaBody');
  const tfoot = $('tabelaFoot');
  tbody.innerHTML = '';
  tfoot.innerHTML = '';

  itens.forEach((item, idx) => {
    const globalIdx = start + idx;
    const tr = document.createElement('tr');
    tr.dataset.fabricante = item.fabricante || '';
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="item-check" checked></td>
      <td>${globalIdx + 1}</td>
      <td>${escHtml(item.medicamento)}</td>
      <td>${item.estoqueAtual}</td>
      <td>${item.mediaDiaria.toFixed(2)}/dia</td>
      <td>${item.projecao.toFixed(1)}</td>
      <td><span class="badge-comprar">${item.comprar}</span></td>
      <td><span class="badge-urgencia ${item.urgencia}">${item.urgencia.toUpperCase()}</span></td>
      <td>${temPrecos ? fmtBrl(item.precoUnitario) : '–'}</td>
      <td>${temPrecos ? fmtBrl(item.valorEstimado) : '–'}</td>`;
    tbody.appendChild(tr);
  });

  if (temPrecos) {
    const totalValor = data.itens.reduce((s, i) => s + i.valorEstimado, 0);
    const tr = document.createElement('tr');
    tr.className = 'tr-total';
    tr.innerHTML = `<td colspan="9" style="text-align:right;font-weight:700;padding:10px 14px;">Total estimado:</td>
      <td id="totalEstimadoCell" style="font-weight:700;">${fmtBrl(totalValor)}</td>`;
    tfoot.appendChild(tr);
  }

  renderPagination('comprasPagination', data.itens.length, page, (p) => renderComprasPage(data, p));

  const wrap = $('tabelaWrap');
  wrap.removeEventListener('change', atualizarTotalSelecionados);
  wrap.addEventListener('change', atualizarTotalSelecionados);
}

/* ── Pagination helper ──────────────────────────────────────────── */
function renderPagination(containerId, totalItems, currentPage, callback) {
  const container = $(containerId);
  if (!container) return;
  const totalPages = Math.ceil(totalItems / state.pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="event.preventDefault()">‹</button>`;
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}">${i}</button>`;
  }
  html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>`;
  html += `<span class="page-info">${currentPage}/${totalPages} (${totalItems} itens)</span>`;
  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.textContent.trim();
      if (text === '‹') callback(currentPage - 1);
      else if (text === '›') callback(currentPage + 1);
      else { const p = parseInt(text); if (!isNaN(p)) callback(p); }
    });
  });
}

/* ── Sort table ─────────────────────────────────────────────────── */
function sortTable(col) {
  if (!state.resultado) return;
  if (state.sortCol === col) state.sortAsc = !state.sortAsc;
  else { state.sortCol = col; state.sortAsc = true; }

  const fields = ['medicamento', 'medicamento', 'estoqueAtual', 'mediaDiaria', 'projecao', 'comprar', 'urgencia', 'precoUnitario', 'valorEstimado'];
  const field = fields[col] || 'comprar';
  const urgOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };

  state.resultado.itens.sort((a, b) => {
    let va = a[field], vb = b[field];
    if (field === 'urgencia') { va = urgOrder[va] || 3; vb = urgOrder[vb] || 3; }
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va < vb) return state.sortAsc ? -1 : 1;
    if (va > vb) return state.sortAsc ? 1 : -1;
    return 0;
  });
  renderComprasPage(state.resultado, 1);
}

/* ── Filter & selection helpers ─────────────────────────────────── */
function aplicarFiltroPorFabricante(fabricante) {
  state.filtroFabricante = fabricante;
  const trs = document.querySelectorAll('#tabelaBody tr');
  trs.forEach(tr => {
    tr.style.display = (fabricante === 'todos' || tr.dataset.fabricante === fabricante) ? '' : 'none';
  });
  atualizarTotalSelecionados();
}

function atualizarTotalSelecionados() {
  const cell = $('totalEstimadoCell');
  if (!cell || !state.resultado) return;
  const trs = document.querySelectorAll('#tabelaBody tr');
  let total = 0;
  const page = state.pages.compras;
  const start = (page - 1) * state.pageSize;
  trs.forEach((tr, idx) => {
    if (tr.style.display === 'none') return;
    const cb = tr.querySelector('.item-check');
    const item = state.resultado.itens[start + idx];
    if (cb && cb.checked && item) total += item.valorEstimado || 0;
  });
  cell.textContent = fmtBrl(Math.round(total * 100) / 100);
}

function toggleTodos(marcar) {
  document.querySelectorAll('#tabelaBody tr').forEach(tr => {
    if (tr.style.display === 'none') return;
    const cb = tr.querySelector('.item-check');
    if (cb) cb.checked = marcar;
  });
  const checkAll = $('checkAll');
  if (checkAll) checkAll.checked = marcar;
  atualizarTotalSelecionados();
}

function getItensFiltrados() {
  if (!state.resultado) return [];
  const trs = document.querySelectorAll('#tabelaBody tr');
  const page = state.pages.compras;
  const start = (page - 1) * state.pageSize;
  const result = [];
  trs.forEach((tr, idx) => {
    if (tr.style.display === 'none') return;
    const cb = tr.querySelector('.item-check');
    if (cb && cb.checked) {
      const item = state.resultado.itens[start + idx];
      if (item) result.push(item);
    }
  });
  // Also include items from other pages if filter is "todos"
  if (state.filtroFabricante === 'todos' && state.resultado.itens.length > state.pageSize) {
    return state.resultado.itens;
  }
  return result.length > 0 ? result : state.resultado.itens.filter(i => state.filtroFabricante === 'todos' || i.fabricante === state.filtroFabricante);
}

/* ── Dashboard ──────────────────────────────────────────────────── */
function updateDashboard() {
  if (!state.estoqueLocal && !state.vendasLocal) return;

  const diasVendas = state.diasVendasLocal || 7;
  // Build combined items list
  const mapaEstoque = {};
  (state.estoqueLocal || []).forEach(([nome, qtd]) => {
    mapaEstoque[String(nome).trim().toUpperCase()] = Number(qtd) || 0;
  });

  const itens = [];
  const allKeys = new Set([...Object.keys(mapaEstoque)]);
  (state.vendasLocal || []).forEach(([nome, qtd]) => {
    const chave = String(nome).trim().toUpperCase();
    allKeys.add(chave);
  });

  const vendasMap = {};
  (state.vendasLocal || []).forEach(([nome, qtd]) => {
    vendasMap[String(nome).trim().toUpperCase()] = Number(qtd) || 0;
  });

  allKeys.forEach(chave => {
    const estoque = mapaEstoque[chave] || 0;
    const vendas = vendasMap[chave] || 0;
    const media = vendas / diasVendas;
    itens.push({
      medicamento: chave,
      estoqueAtual: estoque,
      quantidade: estoque,
      totalVendido: vendas,
      mediaDiaria: Math.round(media * 100) / 100,
      precoUnitario: state.precoLocal[chave] || 0,
      ncm: state.ncmLocal[chave] || '',
      icms: state.icmsLocal[chave] || 'SUBS. TRIB',
    });
  });

  // Indicators
  const ind = ANALYTICS.indicadoresGerais(itens, diasVendas);
  $('dsTotalItens').textContent = ind.totalItens.toLocaleString('pt-BR');
  $('dsValorEstoque').textContent = fmtBrl(ind.valorEstoque);
  $('dsTotalVendas').textContent = ind.totalVendas.toLocaleString('pt-BR');
  $('dsCriticos').textContent = ind.criticos;
  $('dsGiroMedio').textContent = ind.giroMedio.toFixed(2);
  $('dsCobertura').textContent = ind.coberturMedia;

  // Charts
  renderDashboardCharts(itens, diasVendas);

  // Alerts
  renderAlerts(itens, diasVendas);
}

function renderDashboardCharts(itens, diasVendas) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#e5e7eb' : '#374151';
  const gridColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';

  // Destroy existing charts
  Object.values(state.chartInstances).forEach(c => { if (c && c.destroy) c.destroy(); });
  state.chartInstances = {};

  // Curva ABC Pie
  const abc = ANALYTICS.curvaABC(itens);
  const ctxABC = $('chartABC');
  if (ctxABC) {
    state.chartInstances.abc = new Chart(ctxABC, {
      type: 'doughnut',
      data: {
        labels: ['Classe A', 'Classe B', 'Classe C'],
        datasets: [{
          data: [abc.resumo.classA?.valor || 0, abc.resumo.classB?.valor || 0, abc.resumo.classC?.valor || 0],
          backgroundColor: ['#1a6fc4', '#f59e0b', '#9ca3af'],
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } }
      }
    });
  }

  // Top 10 vendas bar
  const topVendas = [...itens].filter(i => i.totalVendido > 0).sort((a, b) => b.mediaDiaria - a.mediaDiaria).slice(0, 10);
  const ctxTop = $('chartTopVendas');
  if (ctxTop) {
    state.chartInstances.topVendas = new Chart(ctxTop, {
      type: 'bar',
      data: {
        labels: topVendas.map(i => i.medicamento.substring(0, 25)),
        datasets: [{
          label: 'Média Diária',
          data: topVendas.map(i => i.mediaDiaria),
          backgroundColor: '#1a6fc4',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } }
        }
      }
    });
  }

  // Tributário pie
  const resumoTax = TAX.gerarResumoTributario(itens);
  const ctxTax = $('chartTributario');
  if (ctxTax) {
    state.chartInstances.tax = new Chart(ctxTax, {
      type: 'doughnut',
      data: {
        labels: ['ICMS', 'PIS', 'COFINS'],
        datasets: [{
          data: [resumoTax.totalIcms, resumoTax.totalPis, resumoTax.totalCofins],
          backgroundColor: ['#dc3545', '#f59e0b', '#0ea5e9'],
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } }
      }
    });
  }

  // Status estoque
  const giro = ANALYTICS.giroEstoque(itens, diasVendas);
  const statusCount = { critico: 0, alerta: 0, normal: 0, excesso: 0, parado: 0 };
  giro.forEach(i => { if (statusCount[i.status] !== undefined) statusCount[i.status]++; });
  const ctxStatus = $('chartStatusEstoque');
  if (ctxStatus) {
    state.chartInstances.status = new Chart(ctxStatus, {
      type: 'bar',
      data: {
        labels: ['Crítico', 'Alerta', 'Normal', 'Excesso', 'Parado'],
        datasets: [{
          data: [statusCount.critico, statusCount.alerta, statusCount.normal, statusCount.excesso, statusCount.parado],
          backgroundColor: ['#dc3545', '#f59e0b', '#16a05a', '#0ea5e9', '#9ca3af'],
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  }
}

function renderAlerts(itens, diasVendas) {
  const criticos = ANALYTICS.estoqueCritico(itens, 5);
  const parados = ANALYTICS.produtosParados(itens);
  const container = $('alertsList');
  if (!container) return;

  let html = '';
  if (criticos.length > 0) {
    html += `<div style="padding:8px 12px;background:#fef2f2;border-radius:8px;margin-bottom:8px;border-left:4px solid var(--danger);">
      <strong style="color:var(--danger);">⚠️ ${criticos.length} produto(s) com estoque crítico</strong>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">${criticos.slice(0, 5).map(i => i.medicamento.substring(0, 30)).join(', ')}${criticos.length > 5 ? '...' : ''}</p>
    </div>`;
  }
  if (parados.length > 0) {
    html += `<div style="padding:8px 12px;background:#f3f4f6;border-radius:8px;margin-bottom:8px;border-left:4px solid #9ca3af;">
      <strong style="color:#6b7280;">📦 ${parados.length} produto(s) sem giro (parados)</strong>
      <p style="font-size:.8rem;color:var(--text-muted);margin-top:4px;">${parados.slice(0, 5).map(i => i.medicamento.substring(0, 30)).join(', ')}${parados.length > 5 ? '...' : ''}</p>
    </div>`;
  }
  if (criticos.length === 0 && parados.length === 0) {
    html = '<p style="color:var(--accent);font-size:.85rem;">✅ Nenhum alerta no momento. Estoque em boas condições!</p>';
  }
  container.innerHTML = html;
}

/* ── Analytics page ─────────────────────────────────────────────── */
function updateAnalytics() {
  if (!state.vendasLocal) return;
  const diasVendas = state.diasVendasLocal || 7;

  // Build items
  const mapaEstoque = {};
  (state.estoqueLocal || []).forEach(([nome, qtd]) => {
    mapaEstoque[String(nome).trim().toUpperCase()] = Number(qtd) || 0;
  });

  const itens = (state.vendasLocal || []).map(([nome, qtd]) => {
    const chave = String(nome).trim().toUpperCase();
    const vendas = Number(qtd) || 0;
    return {
      medicamento: chave,
      estoqueAtual: mapaEstoque[chave] || 0,
      totalVendido: vendas,
      mediaDiaria: Math.round((vendas / diasVendas) * 100) / 100,
      precoUnitario: state.precoLocal[chave] || 0,
    };
  }).filter(i => i.totalVendido > 0 || i.estoqueAtual > 0);

  // Curva ABC detail
  const abc = ANALYTICS.curvaABC(itens);
  const abcResumo = $('abcResumo');
  if (abcResumo) {
    abcResumo.innerHTML = `
      <div class="stat-card"><div class="stat-value" style="color:#1a6fc4;">${abc.resumo.classA?.itens || 0}</div><div class="stat-label">Classe A (${abc.resumo.classA?.pctItens || 0}% itens)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#f59e0b;">${abc.resumo.classB?.itens || 0}</div><div class="stat-label">Classe B (${abc.resumo.classB?.pctItens || 0}% itens)</div></div>
      <div class="stat-card"><div class="stat-value" style="color:#9ca3af;">${abc.resumo.classC?.itens || 0}</div><div class="stat-label">Classe C (${abc.resumo.classC?.pctItens || 0}% itens)</div></div>`;
  }

  // ABC table
  const allAbc = [...abc.A, ...abc.B, ...abc.C];
  renderAbcPage(allAbc, 1);

  // ABC chart
  const ctxABCDetail = $('chartABCDetail');
  if (ctxABCDetail && state.chartInstances.abcDetail) state.chartInstances.abcDetail.destroy();
  if (ctxABCDetail) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    state.chartInstances.abcDetail = new Chart(ctxABCDetail, {
      type: 'line',
      data: {
        labels: allAbc.slice(0, 50).map((_, i) => i + 1),
        datasets: [{
          label: '% Acumulado',
          data: allAbc.slice(0, 50).map(i => i.percentualAcumulado),
          borderColor: '#1a6fc4',
          backgroundColor: 'rgba(26,111,196,.1)',
          fill: true, tension: 0.3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: isDark ? '#e5e7eb' : '#374151' } } },
        scales: {
          x: { ticks: { color: isDark ? '#e5e7eb' : '#374151' } },
          y: { ticks: { color: isDark ? '#e5e7eb' : '#374151' }, max: 100 }
        }
      }
    });
  }

  // Giro de estoque
  const giro = ANALYTICS.giroEstoque(itens, diasVendas);
  renderGiroPage(giro, 1);

  // Estoque crítico
  const criticos = ANALYTICS.estoqueCritico(itens);
  const criticosBody = $('criticosTableBody');
  if (criticosBody) {
    criticosBody.innerHTML = criticos.slice(0, 100).map((item, idx) => {
      const cob = item.mediaDiaria > 0 ? Math.round(item.estoqueAtual / item.mediaDiaria) : 999;
      const status = cob <= 2 ? 'critico' : cob <= 5 ? 'alerta' : 'normal';
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escHtml(item.medicamento)}</td>
        <td>${item.estoqueAtual}</td>
        <td>${item.mediaDiaria.toFixed(2)}</td>
        <td>${cob} dias</td>
        <td><span class="badge-status ${status}">${status.toUpperCase()}</span></td>
      </tr>`;
    }).join('');
  }
}

function renderAbcPage(allAbc, page) {
  state.pages.abc = page;
  const start = (page - 1) * state.pageSize;
  const items = allAbc.slice(start, start + state.pageSize);
  const body = $('abcTableBody');
  if (body) {
    body.innerHTML = items.map((item, idx) => {
      const classColor = item.classe === 'A' ? '#1a6fc4' : item.classe === 'B' ? '#f59e0b' : '#9ca3af';
      return `<tr>
        <td>${start + idx + 1}</td>
        <td><span style="background:${classColor};color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;font-size:.75rem;">${item.classe}</span></td>
        <td>${escHtml(item.medicamento)}</td>
        <td>${fmtBrl(item.valor)}</td>
        <td>${item.percentualAcumulado}%</td>
      </tr>`;
    }).join('');
  }
  renderPagination('abcPagination', allAbc.length, page, (p) => renderAbcPage(allAbc, p));
}

function renderGiroPage(giro, page) {
  state.pages.giro = page;
  const start = (page - 1) * state.pageSize;
  const items = giro.slice(start, start + state.pageSize);
  const body = $('giroTableBody');
  if (body) {
    body.innerHTML = items.map((item, idx) => `<tr>
      <td>${start + idx + 1}</td>
      <td>${escHtml(item.medicamento)}</td>
      <td>${item.estoqueAtual || item.quantidade || 0}</td>
      <td>${item.vendas}</td>
      <td>${item.giro.toFixed(2)}</td>
      <td>${item.coberturaDias} dias</td>
      <td><span class="badge-status ${item.status}">${item.status.toUpperCase()}</span></td>
    </tr>`).join('');
  }
  renderPagination('giroPagination', giro.length, page, (p) => renderGiroPage(giro, p));
}

/* ── Relatório mais vendidos ────────────────────────────────────── */
async function gerarRelatorio() {
  const btn = $('btnRelatorio');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Gerando…';

  try {
    if (state.vendasLocal && state.vendasLocal.length > 0) {
      const diasVendas = state.diasVendasLocal || 7;
      let lista = state.vendasLocal.map(([nome, qtd]) => {
        const total = Number(qtd) || 0;
        return { medicamento: String(nome).trim().toUpperCase(), totalVendido: total, mediaDiaria: Math.round((total / diasVendas) * 100) / 100 };
      }).filter(i => i.totalVendido > 0);
      lista.sort((a, b) => b.mediaDiaria - a.mediaDiaria);
      const top = state.topSelecionado;
      const itens = top > 0 ? lista.slice(0, top) : lista;
      const data = { diasVendas, totalItens: itens.length, geradoEm: new Date().toISOString(), itens };
      state.relatorio = data;
      renderRelatorio(data);
      showToast(`Relatório: ${data.totalItens} item(s).`, 'success');
    }
  } catch (err) { showToast(`Erro: ${err.message}`, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = 'Gerar Relatório'; }
}

function renderRelatorio(data) {
  $('relatorioResultado').style.display = 'block';
  const label = state.topSelecionado > 0 ? `Top ${state.topSelecionado}` : 'Todos';
  $('relatorioMeta').innerHTML =
    `<span>Exibindo: <strong>${label}</strong></span>` +
    `<span>Itens: <strong>${data.totalItens}</strong></span>` +
    `<span>Período: <strong>${data.diasVendas} dias</strong></span>`;

  const tbody = $('relatorioBody');
  tbody.innerHTML = data.itens.map((item, idx) => `<tr>
    <td><span class="badge-rank">${idx + 1}º</span></td>
    <td>${escHtml(item.medicamento)}</td>
    <td>${item.totalVendido}</td>
    <td><strong>${item.mediaDiaria.toFixed(2)}</strong>/dia</td>
  </tr>`).join('');
}

/* ── Tributário page ────────────────────────────────────────────── */
function updateTributario() {
  const mapaEstoque = {};
  (state.estoqueLocal || []).forEach(([nome, qtd]) => {
    mapaEstoque[String(nome).trim().toUpperCase()] = Number(qtd) || 0;
  });

  const itens = [];
  const allKeys = new Set(Object.keys(mapaEstoque));
  (state.vendasLocal || []).forEach(([nome]) => allKeys.add(String(nome).trim().toUpperCase()));

  allKeys.forEach(chave => {
    itens.push({
      medicamento: chave,
      quantidade: mapaEstoque[chave] || 0,
      precoUnitario: state.precoLocal[chave] || 0,
      ncm: state.ncmLocal[chave] || '',
      icms: state.icmsLocal[chave] || 'SUBS. TRIB',
      comprar: mapaEstoque[chave] || 0,
    });
  });

  const resumo = TAX.gerarResumoTributario(itens);
  $('txBase').textContent = fmtBrl(resumo.totalBase);
  $('txTotal').textContent = fmtBrl(resumo.totalImpostos);
  $('txCarga').textContent = resumo.cargaMedia + '%';
  $('txIcms').textContent = fmtBrl(resumo.totalIcms);
  $('txPis').textContent = fmtBrl(resumo.totalPis);
  $('txCofins').textContent = fmtBrl(resumo.totalCofins);

  // Charts
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#e5e7eb' : '#374151';

  if (state.chartInstances.icmsTipo) state.chartInstances.icmsTipo.destroy();
  const ctxIcms = $('chartIcmsTipo');
  if (ctxIcms) {
    const tipos = Object.entries(resumo.porTipoIcms);
    state.chartInstances.icmsTipo = new Chart(ctxIcms, {
      type: 'doughnut',
      data: {
        labels: tipos.map(([k, v]) => `${k} (${v.qtd})`),
        datasets: [{ data: tipos.map(([, v]) => v.valor), backgroundColor: ['#1a6fc4', '#16a05a', '#f59e0b', '#dc3545', '#0ea5e9', '#9ca3af'] }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor } } } }
    });
  }

  if (state.chartInstances.ncm) state.chartInstances.ncm.destroy();
  const ctxNcm = $('chartNcm');
  if (ctxNcm) {
    const ncms = Object.entries(resumo.porNcm).sort((a, b) => b[1].valor - a[1].valor).slice(0, 10);
    state.chartInstances.ncm = new Chart(ctxNcm, {
      type: 'bar',
      data: {
        labels: ncms.map(([k]) => k),
        datasets: [{ label: 'Valor', data: ncms.map(([, v]) => v.valor), backgroundColor: '#1a6fc4', borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } }
      }
    });
  }

  // Tax table
  renderTaxPage(itens, 1);
}

function renderTaxPage(itens, page) {
  state.pages.tax = page;
  const start = (page - 1) * state.pageSize;
  const items = itens.slice(start, start + state.pageSize);
  const body = $('taxTableBody');
  if (body) {
    body.innerHTML = items.map((item, idx) => {
      const imp = TAX.calcularImpostos(item);
      return `<tr>
        <td>${start + idx + 1}</td>
        <td>${escHtml(item.medicamento)}</td>
        <td>${item.ncm || 'N/D'}</td>
        <td>${imp.icms.tipo}</td>
        <td>${imp.icms.aliquota}%</td>
        <td>${imp.pis.aliquota}%</td>
        <td>${imp.cofins.aliquota}%</td>
        <td>${fmtBrl(imp.valorBase)}</td>
        <td>${fmtBrl(imp.totalImpostos)}</td>
      </tr>`;
    }).join('');
  }
  renderPagination('taxPagination', itens.length, page, (p) => renderTaxPage(itens, p));
}

/* ── Revendedores ───────────────────────────────────────────────── */
function renderRevendedores() {
  const list = RESELLERS.getAll();
  const container = $('revendedoresList');
  const select = $('fornecedorPedidoSelect');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;">Nenhum fornecedor cadastrado. Clique em "+ Novo Fornecedor" para começar.</p>';
  } else {
    container.innerHTML = list.map(r => `
      <div class="reseller-card">
        <div class="reseller-info">
          <h4>${escHtml(r.nome)}</h4>
          <p>${r.contato ? r.contato + ' | ' : ''}${r.whatsapp || ''}${r.email ? ' | ' + r.email : ''}</p>
          ${r.produtos ? '<p style="font-size:.72rem;color:var(--text-muted);">' + escHtml(r.produtos) + '</p>' : ''}
        </div>
        <div class="reseller-actions">
          <button class="btn btn-outline btn-sm" onclick="editarRevendedor('${r.id}')">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="removerRevendedor('${r.id}')">Remover</button>
        </div>
      </div>
    `).join('');
  }

  // Update select
  if (select) {
    const currentVal = select.value;
    select.innerHTML = '<option value="">Selecione um fornecedor...</option>';

    // Add registered resellers
    list.forEach(r => {
      const opt = document.createElement('option');
      opt.value = 'reseller:' + r.id;
      opt.textContent = r.nome;
      select.appendChild(opt);
    });

    // Add fabricantes from data
    const fabricantes = [...new Set(Object.values(state.fabricanteLocal))].sort();
    if (fabricantes.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Fabricantes (dos dados)';
      fabricantes.forEach(f => {
        const opt = document.createElement('option');
        opt.value = 'fab:' + f;
        opt.textContent = f;
        optgroup.appendChild(opt);
      });
      select.appendChild(optgroup);
    }
    if (currentVal) select.value = currentVal;
  }
}

function abrirModalRevendedor(id) {
  $('revendedorEditId').value = id || '';
  $('modalRevendedorTitle').textContent = id ? 'Editar Fornecedor' : 'Novo Fornecedor';
  if (id) {
    const r = RESELLERS.getById(id);
    if (r) {
      $('revNome').value = r.nome || '';
      $('revContato').value = r.contato || '';
      $('revWhatsapp').value = r.whatsapp || '';
      $('revEmail').value = r.email || '';
      $('revProdutos').value = r.produtos || '';
    }
  } else {
    $('revNome').value = '';
    $('revContato').value = '';
    $('revWhatsapp').value = '';
    $('revEmail').value = '';
    $('revProdutos').value = '';
  }
  $('modalRevendedor').classList.add('show');
}

function fecharModalRevendedor() {
  $('modalRevendedor').classList.remove('show');
}

function salvarRevendedor() {
  const nome = $('revNome').value.trim();
  if (!nome) { showToast('Nome é obrigatório.', 'error'); return; }
  const dados = {
    nome,
    contato: $('revContato').value.trim(),
    whatsapp: $('revWhatsapp').value.trim(),
    email: $('revEmail').value.trim(),
    produtos: $('revProdutos').value.trim(),
  };
  const editId = $('revendedorEditId').value;
  if (editId) {
    RESELLERS.update(editId, dados);
    showToast('Fornecedor atualizado!', 'success');
  } else {
    RESELLERS.add(dados);
    showToast('Fornecedor cadastrado!', 'success');
  }
  fecharModalRevendedor();
  renderRevendedores();
}

function editarRevendedor(id) { abrirModalRevendedor(id); }

function removerRevendedor(id) {
  if (confirm('Remover este fornecedor?')) {
    RESELLERS.remove(id);
    renderRevendedores();
    showToast('Fornecedor removido.', 'success');
  }
}

function gerarPedidoFornecedor() {
  const sel = $('fornecedorPedidoSelect');
  const val = sel.value;
  if (!val) { showToast('Selecione um fornecedor.', 'error'); return; }
  if (!state.resultado) { showToast('Calcule a lista de compras primeiro.', 'error'); return; }

  let fornecedor = { nome: '' };
  let itens = [];

  if (val.startsWith('reseller:')) {
    const r = RESELLERS.getById(val.replace('reseller:', ''));
    if (r) fornecedor = r;
    // Filter items by reseller's products keywords
    if (r && r.produtos) {
      const keywords = r.produtos.toUpperCase().split(/[,;|\n]/).map(k => k.trim()).filter(Boolean);
      itens = state.resultado.itens.filter(i => {
        return keywords.some(k => i.medicamento.includes(k) || (i.fabricante && i.fabricante.toUpperCase().includes(k)));
      });
    }
    if (itens.length === 0) itens = state.resultado.itens;
  } else if (val.startsWith('fab:')) {
    const fab = val.replace('fab:', '');
    fornecedor = { nome: fab };
    itens = state.resultado.itens.filter(i => i.fabricante === fab);
  }

  if (itens.length === 0) { showToast('Nenhum item encontrado para este fornecedor.', 'error'); return; }

  const pedido = RESELLERS.gerarPedido(fornecedor, itens, CONFIG.FARMACIA_NOME);
  state.pedidoAtual = pedido;
  RESELLERS.salvarHistorico(pedido);
  renderPedidoPreview(pedido);
  renderHistoricoPedidos();
  showToast(`Pedido gerado: ${pedido.totalItens} itens.`, 'success');
}

function renderPedidoPreview(pedido) {
  $('pedidoPreview').style.display = 'block';
  $('pedidoMeta').innerHTML = `
    <span>Pedido: <strong>${pedido.id}</strong></span>
    <span>Fornecedor: <strong>${escHtml(pedido.fornecedor.nome)}</strong></span>
    <span>Itens: <strong>${pedido.totalItens}</strong></span>
    <span>Valor: <strong>${fmtBrl(pedido.valorTotal)}</strong></span>`;

  const body = $('pedidoBody');
  const foot = $('pedidoFoot');
  body.innerHTML = pedido.itens.map((item, idx) => `<tr>
    <td>${idx + 1}</td>
    <td>${escHtml(item.medicamento)}</td>
    <td>${item.quantidade}</td>
    <td>${fmtBrl(item.precoUnitario)}</td>
    <td>${fmtBrl(item.valorTotal)}</td>
  </tr>`).join('');
  foot.innerHTML = `<tr class="tr-total"><td colspan="4" style="text-align:right;font-weight:700;">TOTAL:</td><td style="font-weight:700;">${fmtBrl(pedido.valorTotal)}</td></tr>`;
}

function enviarPedidoWhatsApp() {
  if (!state.pedidoAtual) { showToast('Gere um pedido primeiro.', 'error'); return; }
  const msg = RESELLERS.formatarWhatsApp(state.pedidoAtual);
  const fone = state.pedidoAtual.fornecedor.whatsapp ? state.pedidoAtual.fornecedor.whatsapp.replace(/\D/g, '') : '';
  const url = fone ? `https://wa.me/${fone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function exportarPedidoPdf() {
  if (!state.pedidoAtual) { showToast('Gere um pedido primeiro.', 'error'); return; }
  const html = RESELLERS.gerarPedidoPdfHtml(state.pedidoAtual);
  _abrirJanelaPdf(html);
}

function enviarPorFornecedor() {
  if (!state.resultado) { showToast('Calcule a lista de compras primeiro.', 'error'); return; }
  navigateTo('revendedores');
}

function renderHistoricoPedidos() {
  const hist = RESELLERS.getHistorico();
  const body = $('historicoBody');
  if (!body) return;
  if (hist.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum pedido no histórico.</td></tr>';
    return;
  }
  body.innerHTML = hist.slice(0, 20).map(p => `<tr>
    <td><strong>${p.id}</strong></td>
    <td>${escHtml(p.fornecedor.nome)}</td>
    <td>${new Date(p.data).toLocaleDateString('pt-BR')}</td>
    <td>${p.totalItens}</td>
    <td>${fmtBrl(p.valorTotal)}</td>
    <td><button class="btn btn-outline btn-sm" onclick="reenviarPedido('${p.id}')">Ver</button></td>
  </tr>`).join('');
}

function reenviarPedido(id) {
  const hist = RESELLERS.getHistorico();
  const pedido = hist.find(p => p.id === id);
  if (pedido) {
    state.pedidoAtual = pedido;
    renderPedidoPreview(pedido);
    showToast('Pedido carregado.', 'success');
  }
}

/* ── PDF exports ────────────────────────────────────────────────── */
function _abrirJanelaPdf(html) {
  const win = window.open('', '_blank');
  if (!win) { showToast('Permita pop-ups para gerar PDF.', 'error'); return false; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}

function exportarPdf(comValores) {
  if (!state.resultado) return;
  const itens = state.resultado.itens.filter(i => state.filtroFabricante === 'todos' || i.fabricante === state.filtroFabricante);
  if (itens.length === 0) { showToast('Nenhum item.', 'error'); return; }
  const data = state.resultado;
  const farmacia = CONFIG.FARMACIA_NOME;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const temPrecos = comValores && itens.some(i => i.precoUnitario > 0);
  const tipoLabel = comValores ? 'Conferência de Caixa' : 'Lista de Cotação';

  let cols, colWidths;
  if (temPrecos) {
    cols = ['#', 'Medicamento', 'Estoque', 'Média/dia', 'Comprar', 'Urgência', 'Vlr Unit.', 'Valor Est.'];
    colWidths = ['3%', '32%', '8%', '10%', '8%', '10%', '12%', '14%'];
  } else {
    cols = ['#', 'Medicamento', 'Qtd. a Comprar'];
    colWidths = ['4%', '76%', '20%'];
  }

  let totalValor = 0;
  const trRows = itens.map((item, idx) => {
    let cells;
    if (temPrecos) {
      totalValor += item.valorEstimado || 0;
      cells = [idx + 1, escHtml(item.medicamento), item.estoqueAtual, item.mediaDiaria.toFixed(2), `<strong>${item.comprar}</strong>`, item.urgencia.toUpperCase(), fmtBrl(item.precoUnitario), fmtBrl(item.valorEstimado)];
    } else {
      cells = [idx + 1, escHtml(item.medicamento), `<strong>${item.comprar}</strong>`];
    }
    const bg = idx % 2 === 0 ? '' : ' style="background:#f7faff"';
    return `<tr${bg}>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');

  let totalRow = '';
  if (temPrecos && totalValor > 0) {
    totalRow = `<tr class="total-row"><td colspan="${cols.length - 1}"><strong>TOTAL (${itens.length} itens)</strong></td><td><strong>${fmtBrl(totalValor)}</strong></td></tr>`;
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${escHtml(tipoLabel)} – ${escHtml(farmacia)}</title>
<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;color:#222}.hdr{background:#1a6fc4;color:#fff;padding:10px 14px 8px}.hdr h1{font-size:15px;margin:0 0 2px}.hdr p{font-size:9px;margin:0}.hdr .dt{float:right;font-size:9px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#e6eeff;color:#222;font-size:9px}.total-row td{background:#e6eeff;font-weight:bold}.ft{font-size:8px;color:#888;margin-top:8px}.btn{padding:6px 14px;cursor:pointer;font-size:12px;margin-top:10px}@media print{@page{margin:1cm;size:A4}.btn{display:none}}</style></head><body>
<div class="hdr"><span class="dt">${hoje}</span><h1>${escHtml(farmacia)}${fmtUnidade()}</h1><p>${escHtml(tipoLabel)} – Cobertura: ${data.diasCobertura}+${MARGEM_SEGURANCA_DIAS} dias</p></div>
<table><colgroup>${cols.map((_, i) => `<col style="width:${colWidths[i]}">`).join('')}</colgroup>
<thead><tr>${cols.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${trRows}${totalRow}</tbody></table>
<p class="ft">Total: ${itens.length} item(s) | Período: ${data.diasVendas} dias</p>
<button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`;
  _abrirJanelaPdf(html);
}

function exportarRelatorioPdf() {
  if (!state.relatorio) return;
  const data = state.relatorio;
  const farmacia = CONFIG.FARMACIA_NOME;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const trRows = data.itens.map((item, idx) => {
    const bg = idx % 2 === 0 ? '' : ' style="background:#f7faff"';
    return `<tr${bg}><td>${idx + 1}º</td><td>${escHtml(item.medicamento)}</td><td>${item.totalVendido}</td><td><strong>${item.mediaDiaria.toFixed(2)}/dia</strong></td></tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório – ${escHtml(farmacia)}</title>
<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;color:#222}.hdr{background:#1a6fc4;color:#fff;padding:10px 14px 8px}.hdr h1{font-size:15px;margin:0 0 2px}.hdr p{font-size:9px;margin:0}.hdr .dt{float:right;font-size:9px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#e6eeff;font-size:9px}.ft{font-size:8px;color:#888;margin-top:8px}.btn{padding:6px 14px;cursor:pointer;font-size:12px;margin-top:10px}@media print{@page{margin:1cm;size:A4}.btn{display:none}}</style></head><body>
<div class="hdr"><span class="dt">${hoje}</span><h1>${escHtml(farmacia)}</h1><p>Relatório Mais Vendidos | Período: ${data.diasVendas} dias</p></div>
<table><thead><tr><th>#</th><th>Medicamento</th><th>Total Vendido</th><th>Média Diária</th></tr></thead><tbody>${trRows}</tbody></table>
<p class="ft">Total: ${data.totalItens} item(s)</p><button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`;
  _abrirJanelaPdf(html);
}

function exportarTributarioPdf() {
  const mapaEstoque = {};
  (state.estoqueLocal || []).forEach(([nome, qtd]) => { mapaEstoque[String(nome).trim().toUpperCase()] = Number(qtd) || 0; });
  const itens = Object.keys(mapaEstoque).map(chave => ({
    medicamento: chave, quantidade: mapaEstoque[chave], precoUnitario: state.precoLocal[chave] || 0,
    ncm: state.ncmLocal[chave] || '', icms: state.icmsLocal[chave] || 'SUBS. TRIB', comprar: mapaEstoque[chave],
  }));
  const resumo = TAX.gerarResumoTributario(itens);
  const farmacia = CONFIG.FARMACIA_NOME;
  const hoje = new Date().toLocaleDateString('pt-BR');

  const trRows = itens.slice(0, 200).map((item, idx) => {
    const imp = TAX.calcularImpostos(item);
    const bg = idx % 2 === 0 ? '' : ' style="background:#f7faff"';
    return `<tr${bg}><td>${idx + 1}</td><td>${escHtml(item.medicamento)}</td><td>${item.ncm || 'N/D'}</td><td>${imp.icms.tipo}</td><td>${imp.icms.aliquota}%</td><td>${imp.pis.aliquota}%</td><td>${imp.cofins.aliquota}%</td><td>${fmtBrl(imp.valorBase)}</td><td>${fmtBrl(imp.totalImpostos)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>Relatório Tributário – ${escHtml(farmacia)}</title>
<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;color:#222}.hdr{background:#1a6fc4;color:#fff;padding:10px 14px 8px}.hdr h1{font-size:14px;margin:0 0 2px}.hdr p{font-size:9px;margin:0}.hdr .dt{float:right;font-size:9px}.sum{padding:8px 14px;background:#f0f4ff;font-size:10px;border-bottom:1px solid #ddd}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #ccc;padding:3px 5px;text-align:left}th{background:#e6eeff;font-size:8px}.ft{font-size:8px;color:#888;margin-top:8px}.btn{padding:6px 14px;cursor:pointer;font-size:12px;margin-top:10px}@media print{@page{margin:.8cm;size:A4 landscape}.btn{display:none}}</style></head><body>
<div class="hdr"><span class="dt">${hoje}</span><h1>${escHtml(farmacia)}</h1><p>Relatório Tributário do Estoque</p></div>
<div class="sum"><strong>Base:</strong> ${fmtBrl(resumo.totalBase)} | <strong>ICMS:</strong> ${fmtBrl(resumo.totalIcms)} | <strong>PIS:</strong> ${fmtBrl(resumo.totalPis)} | <strong>COFINS:</strong> ${fmtBrl(resumo.totalCofins)} | <strong>Total Impostos:</strong> ${fmtBrl(resumo.totalImpostos)} | <strong>Carga:</strong> ${resumo.cargaMedia}%</div>
<table><thead><tr><th>#</th><th>Medicamento</th><th>NCM</th><th>ICMS</th><th>ICMS%</th><th>PIS%</th><th>COFINS%</th><th>Valor Base</th><th>Total Imp.</th></tr></thead><tbody>${trRows}</tbody></table>
<p class="ft">${itens.length} item(s)</p><button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button></body></html>`;
  _abrirJanelaPdf(html);
}

/* ── WhatsApp ───────────────────────────────────────────────────── */
function compartilharWhatsapp() {
  if (!state.resultado) return;
  const itens = state.resultado.itens.filter(i => state.filtroFabricante === 'todos' || i.fabricante === state.filtroFabricante);
  if (itens.length === 0) { showToast('Nenhum item.', 'error'); return; }
  const data = state.resultado;
  const temPrecos = itens.some(i => i.precoUnitario > 0);

  let msg = `*Sugestão de Compra – ${CONFIG.FARMACIA_NOME}${fmtUnidade()}*\n`;
  msg += `_Cobertura: ${data.diasCobertura}+${MARGEM_SEGURANCA_DIAS} dias | ${new Date().toLocaleDateString('pt-BR')}_\n\n`;

  let totalValor = 0;
  itens.forEach(item => {
    if (temPrecos && item.valorEstimado > 0) {
      msg += `• ${item.medicamento}: *${item.comprar} un* – ${fmtBrl(item.valorEstimado)}\n`;
      totalValor += item.valorEstimado;
    } else {
      msg += `• ${item.medicamento}: *${item.comprar} un*\n`;
    }
  });
  msg += `\n_Total: ${itens.length} item(s)_`;
  if (temPrecos && totalValor > 0) msg += `\n_Valor: *${fmtBrl(Math.round(totalValor * 100) / 100)}*_`;

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── Global search ──────────────────────────────────────────────── */
function handleGlobalSearch(query) {
  if (!query || query.length < 2) return;
  const q = query.toUpperCase();
  // Search in current visible table
  document.querySelectorAll('#tabelaBody tr, #relatorioBody tr, #giroTableBody tr, #taxTableBody tr').forEach(tr => {
    const text = tr.textContent.toUpperCase();
    tr.style.display = text.includes(q) ? '' : 'none';
  });
}

/* ── Cache data ─────────────────────────────────────────────────── */
function cacheData() {
  try {
    const data = {
      estoqueLocal: state.estoqueLocal,
      vendasLocal: state.vendasLocal,
      diasVendasLocal: state.diasVendasLocal,
      precoLocal: state.precoLocal,
      ncmLocal: state.ncmLocal,
      icmsLocal: state.icmsLocal,
      fabricanteLocal: state.fabricanteLocal,
      estoqueCarregado: state.estoqueCarregado,
      vendasCarregadas: state.vendasCarregadas,
      timestamp: Date.now(),
    };
    localStorage.setItem('farmacia_cache', JSON.stringify(data));
  } catch (e) { console.warn('Cache error:', e); }
}

function loadCachedData() {
  try {
    const cached = JSON.parse(localStorage.getItem('farmacia_cache'));
    if (!cached || !cached.timestamp) return;
    // Only use cache if less than 24h old
    if (Date.now() - cached.timestamp > 86400000) return;

    if (cached.estoqueLocal) { state.estoqueLocal = cached.estoqueLocal; state.estoqueCarregado = true; }
    if (cached.vendasLocal) { state.vendasLocal = cached.vendasLocal; state.vendasCarregadas = true; }
    if (cached.diasVendasLocal) state.diasVendasLocal = cached.diasVendasLocal;
    if (cached.precoLocal) Object.assign(state.precoLocal, cached.precoLocal);
    if (cached.ncmLocal) Object.assign(state.ncmLocal, cached.ncmLocal);
    if (cached.icmsLocal) Object.assign(state.icmsLocal, cached.icmsLocal);
    if (cached.fabricanteLocal) Object.assign(state.fabricanteLocal, cached.fabricanteLocal);

    updateCalcularBtn();
    if (state.estoqueCarregado) $('estoqueStatus').textContent = '✅ Dados carregados do cache.';
    if (state.vendasCarregadas) $('vendasStatus').textContent = '✅ Dados carregados do cache.';

    updateDashboard();
    updateAnalytics();
    updateTributario();
    renderRevendedores();
  } catch (e) { console.warn('Cache load error:', e); }
}

/* ── UI helpers ─────────────────────────────────────────────────── */
function updateCalcularBtn() {
  const btn = $('btnCalcular');
  if (btn) btn.disabled = !(state.estoqueCarregado && state.vendasCarregadas);
  const btnRel = $('btnRelatorio');
  if (btnRel) btnRel.disabled = !state.vendasCarregadas;
  // Badge
  const badge = $('badgeCompras');
  if (badge && state.resultado && state.resultado.totalItens > 0) {
    badge.textContent = state.resultado.totalItens;
    badge.style.display = '';
  }
}

let toastTimer;
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3500);
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showProgress(progressId) {
  const wrap = $(`${progressId}Wrap`);
  if (wrap) wrap.style.display = 'block';
}

function updateProgress(progressId, done, total) {
  const fg = $(`${progressId}Fg`);
  const label = $(`${progressId}Label`);
  const pct = Math.round((done / total) * 100);
  if (fg) fg.style.width = `${pct}%`;
  if (label) label.textContent = `${done} / ${total}`;
}
