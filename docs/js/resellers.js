/**
 * docs/js/resellers.js – Módulo de Gestão de Revendedores/Distribuidores
 * Cadastro, pedidos, envio e histórico
 */

const RESELLERS = {
  STORAGE_KEY: 'farmacia_revendedores',
  HISTORY_KEY: 'farmacia_pedidos_historico',

  /**
   * Carrega revendedores do localStorage
   */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch { return []; }
  },

  /**
   * Salva revendedores no localStorage
   */
  saveAll(list) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
  },

  /**
   * Adiciona um novo revendedor
   */
  add(revendedor) {
    const list = this.getAll();
    revendedor.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    revendedor.criadoEm = new Date().toISOString();
    list.push(revendedor);
    this.saveAll(list);
    return revendedor;
  },

  /**
   * Atualiza um revendedor existente
   */
  update(id, dados) {
    const list = this.getAll();
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...dados, atualizadoEm: new Date().toISOString() };
      this.saveAll(list);
      return list[idx];
    }
    return null;
  },

  /**
   * Remove um revendedor
   */
  remove(id) {
    const list = this.getAll().filter(r => r.id !== id);
    this.saveAll(list);
  },

  /**
   * Busca revendedor por ID
   */
  getById(id) {
    return this.getAll().find(r => r.id === id) || null;
  },

  /**
   * Gera pedido formatado para um fornecedor
   */
  gerarPedido(fornecedor, itens, farmacia) {
    const agora = new Date();
    const pedido = {
      id: 'PED-' + agora.getTime().toString(36).toUpperCase(),
      fornecedor: fornecedor,
      itens: itens.map(i => ({
        medicamento: i.medicamento,
        quantidade: i.comprar || i.qtdSugerida || 0,
        precoUnitario: i.precoUnitario || 0,
        valorTotal: (i.comprar || i.qtdSugerida || 0) * (i.precoUnitario || 0),
      })),
      farmacia: farmacia,
      data: agora.toISOString(),
      status: 'gerado',
    };
    pedido.valorTotal = Math.round(pedido.itens.reduce((s, i) => s + i.valorTotal, 0) * 100) / 100;
    pedido.totalItens = pedido.itens.length;
    return pedido;
  },

  /**
   * Formata pedido para WhatsApp
   */
  formatarWhatsApp(pedido) {
    let msg = `*PEDIDO DE COMPRA*\n`;
    msg += `*${pedido.farmacia}*\n`;
    msg += `Pedido: ${pedido.id}\n`;
    msg += `Data: ${new Date(pedido.data).toLocaleDateString('pt-BR')}\n`;
    msg += `Fornecedor: ${pedido.fornecedor.nome}\n\n`;
    msg += `─────────────────\n`;

    pedido.itens.forEach((item, idx) => {
      msg += `${idx + 1}. ${item.medicamento}\n`;
      msg += `   Qtd: *${item.quantidade}* un`;
      if (item.precoUnitario > 0) {
        msg += ` | Unit: R$${item.precoUnitario.toFixed(2)}`;
      }
      msg += `\n`;
    });

    msg += `─────────────────\n`;
    msg += `*Total: ${pedido.totalItens} itens*\n`;
    if (pedido.valorTotal > 0) {
      msg += `*Valor estimado: R$${pedido.valorTotal.toFixed(2)}*\n`;
    }
    msg += `\n_Gerado por EstoqueFarmácia PRO_`;
    return msg;
  },

  /**
   * Gera HTML do pedido para PDF
   */
  gerarPedidoPdfHtml(pedido) {
    const hoje = new Date(pedido.data).toLocaleDateString('pt-BR');
    const rows = pedido.itens.map((item, idx) => {
      const bg = idx % 2 === 0 ? '' : ' style="background:#f7faff"';
      return `<tr${bg}>
        <td>${idx + 1}</td>
        <td>${item.medicamento}</td>
        <td style="text-align:center"><strong>${item.quantidade}</strong></td>
        <td style="text-align:right">${item.precoUnitario > 0 ? 'R$' + item.precoUnitario.toFixed(2) : '–'}</td>
        <td style="text-align:right">${item.valorTotal > 0 ? 'R$' + item.valorTotal.toFixed(2) : '–'}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<title>Pedido ${pedido.id}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;margin:0;color:#222}
  .hdr{background:#1a6fc4;color:#fff;padding:12px 16px 10px}
  .hdr h1{font-size:16px;margin:0 0 4px}
  .hdr p{font-size:10px;margin:2px 0}
  .hdr .dt{float:right;font-size:10px}
  .info{padding:10px 16px;background:#f0f4ff;border-bottom:1px solid #ddd;font-size:11px}
  .info strong{color:#1a6fc4}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}
  th{background:#e6eeff;color:#222;font-size:10px}
  .total-row td{background:#e6eeff;font-weight:bold;font-size:12px}
  .ft{font-size:9px;color:#888;margin-top:10px;padding:0 16px}
  .btn{padding:6px 14px;cursor:pointer;font-size:12px;margin:10px 16px}
  @media print{@page{margin:1cm;size:A4} .btn{display:none}}
</style></head>
<body>
<div class="hdr">
  <span class="dt">${hoje}</span>
  <h1>PEDIDO DE COMPRA</h1>
  <p>${pedido.farmacia} | Pedido: ${pedido.id}</p>
</div>
<div class="info">
  <strong>Fornecedor:</strong> ${pedido.fornecedor.nome}<br>
  ${pedido.fornecedor.contato ? '<strong>Contato:</strong> ' + pedido.fornecedor.contato + '<br>' : ''}
  ${pedido.fornecedor.whatsapp ? '<strong>WhatsApp:</strong> ' + pedido.fornecedor.whatsapp + '<br>' : ''}
</div>
<table>
<thead><tr><th>#</th><th>Produto</th><th>Qtd.</th><th>Vlr Unit.</th><th>Vlr Total</th></tr></thead>
<tbody>${rows}
<tr class="total-row">
  <td colspan="3">TOTAL (${pedido.totalItens} itens)</td>
  <td></td>
  <td style="text-align:right">R$${pedido.valorTotal.toFixed(2)}</td>
</tr>
</tbody></table>
<p class="ft">Gerado por EstoqueFarmácia PRO em ${hoje}</p>
<button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
</body></html>`;
  },

  /**
   * Salva pedido no histórico
   */
  salvarHistorico(pedido) {
    try {
      const hist = JSON.parse(localStorage.getItem(this.HISTORY_KEY)) || [];
      hist.unshift(pedido);
      // Manter últimos 100 pedidos
      if (hist.length > 100) hist.length = 100;
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(hist));
    } catch (e) { console.warn('Erro ao salvar histórico:', e); }
  },

  /**
   * Carrega histórico de pedidos
   */
  getHistorico() {
    try {
      return JSON.parse(localStorage.getItem(this.HISTORY_KEY)) || [];
    } catch { return []; }
  },

  /**
   * Agrupa itens por fornecedor/fabricante
   */
  agruparPorFornecedor(itens) {
    const grupos = {};
    itens.forEach(item => {
      const fab = item.fabricante || 'Sem Fornecedor';
      if (!grupos[fab]) grupos[fab] = [];
      grupos[fab].push(item);
    });
    return grupos;
  },
};
