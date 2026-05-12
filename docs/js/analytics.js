/**
 * docs/js/analytics.js – Módulo de Análise de Estoque e Vendas
 * Curva ABC, giro de estoque, tendências, indicadores
 */

const ANALYTICS = {
  /**
   * Classificação ABC por faturamento
   * A = 80% do faturamento, B = 15%, C = 5%
   */
  curvaABC(itens, campo = 'valorTotal') {
    if (!itens || itens.length === 0) return { A: [], B: [], C: [], resumo: {} };

    const sorted = [...itens]
      .map(i => ({ ...i, valor: i[campo] || (i.precoUnitario || 0) * (i.totalVendido || i.quantidade || 0) }))
      .filter(i => i.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    const total = sorted.reduce((s, i) => s + i.valor, 0);
    let acumulado = 0;
    const A = [], B = [], C = [];

    sorted.forEach(item => {
      acumulado += item.valor;
      const pct = (acumulado / total) * 100;
      item.percentualAcumulado = Math.round(pct * 100) / 100;
      if (pct <= 80) { item.classe = 'A'; A.push(item); }
      else if (pct <= 95) { item.classe = 'B'; B.push(item); }
      else { item.classe = 'C'; C.push(item); }
    });

    return {
      A, B, C,
      resumo: {
        totalFaturamento: Math.round(total * 100) / 100,
        classA: { itens: A.length, pctItens: Math.round((A.length / sorted.length) * 10000) / 100, valor: Math.round(A.reduce((s, i) => s + i.valor, 0) * 100) / 100 },
        classB: { itens: B.length, pctItens: Math.round((B.length / sorted.length) * 10000) / 100, valor: Math.round(B.reduce((s, i) => s + i.valor, 0) * 100) / 100 },
        classC: { itens: C.length, pctItens: Math.round((C.length / sorted.length) * 10000) / 100, valor: Math.round(C.reduce((s, i) => s + i.valor, 0) * 100) / 100 },
      }
    };
  },

  /**
   * Calcula giro de estoque
   * Giro = Vendas no período / Estoque médio
   */
  giroEstoque(itens, diasPeriodo) {
    return itens.map(item => {
      const vendas = item.totalVendido || item.mediaDiaria * diasPeriodo || 0;
      const estoque = item.estoqueAtual || item.quantidade || 0;
      const giro = estoque > 0 ? Math.round((vendas / estoque) * 100) / 100 : 0;
      const coberturaDias = item.mediaDiaria > 0 ? Math.round(estoque / item.mediaDiaria) : 999;
      let status = 'normal';
      if (coberturaDias <= 3) status = 'critico';
      else if (coberturaDias <= 7) status = 'alerta';
      else if (coberturaDias > 90) status = 'excesso';
      else if (giro === 0 && estoque > 0) status = 'parado';

      return {
        ...item,
        giro,
        coberturaDias,
        status,
        vendas,
      };
    }).sort((a, b) => b.giro - a.giro);
  },

  /**
   * Identifica produtos sem giro (parados)
   */
  produtosParados(itens) {
    return itens.filter(i => {
      const vendas = i.totalVendido || i.mediaDiaria || 0;
      const estoque = i.estoqueAtual || i.quantidade || 0;
      return vendas === 0 && estoque > 0;
    });
  },

  /**
   * Identifica produtos com estoque crítico
   */
  estoqueCritico(itens, diasMinimo = 5) {
    return itens.filter(i => {
      const media = i.mediaDiaria || 0;
      const estoque = i.estoqueAtual || i.quantidade || 0;
      if (media <= 0) return false;
      return (estoque / media) < diasMinimo;
    }).sort((a, b) => {
      const cobA = a.mediaDiaria > 0 ? a.estoqueAtual / a.mediaDiaria : 999;
      const cobB = b.mediaDiaria > 0 ? b.estoqueAtual / b.mediaDiaria : 999;
      return cobA - cobB;
    });
  },

  /**
   * Calcula indicadores gerais do estoque
   */
  indicadoresGerais(itens, diasPeriodo) {
    const totalItens = itens.length;
    const totalEstoque = itens.reduce((s, i) => s + (i.estoqueAtual || i.quantidade || 0), 0);
    const totalVendas = itens.reduce((s, i) => s + (i.totalVendido || 0), 0);
    const valorEstoque = itens.reduce((s, i) => s + ((i.estoqueAtual || 0) * (i.precoUnitario || 0)), 0);
    const valorVendas = itens.reduce((s, i) => s + ((i.totalVendido || 0) * (i.precoUnitario || 0)), 0);

    const comVenda = itens.filter(i => (i.totalVendido || i.mediaDiaria || 0) > 0).length;
    const semVenda = totalItens - comVenda;
    const criticos = this.estoqueCritico(itens).length;
    const parados = this.produtosParados(itens).length;

    const giroMedio = valorEstoque > 0 ? Math.round((valorVendas / valorEstoque) * 100) / 100 : 0;
    const coberturMedia = totalVendas > 0 ? Math.round((totalEstoque / (totalVendas / diasPeriodo))) : 0;

    return {
      totalItens,
      totalEstoque,
      totalVendas,
      valorEstoque: Math.round(valorEstoque * 100) / 100,
      valorVendas: Math.round(valorVendas * 100) / 100,
      comVenda,
      semVenda,
      criticos,
      parados,
      giroMedio,
      coberturMedia,
      ticketMedio: comVenda > 0 ? Math.round((valorVendas / comVenda) * 100) / 100 : 0,
    };
  },

  /**
   * Média móvel ponderada para previsão de demanda
   * Pesos: mês mais recente = 3, anterior = 2, mais antigo = 1
   */
  previsaoDemanda(vendasMensais, pesos = [3, 2, 1]) {
    if (!vendasMensais || vendasMensais.length === 0) return 0;
    const n = Math.min(vendasMensais.length, pesos.length);
    let soma = 0, somaPesos = 0;
    for (let i = 0; i < n; i++) {
      soma += vendasMensais[i] * pesos[i];
      somaPesos += pesos[i];
    }
    return somaPesos > 0 ? Math.round((soma / somaPesos) * 100) / 100 : 0;
  },

  /**
   * Calcula Lote Econômico de Compra (EOQ)
   * EOQ = sqrt(2 * D * S / H)
   * D = demanda anual, S = custo por pedido, H = custo de manutenção por unidade/ano
   */
  loteEconomico(demandaAnual, custoPedido = 50, custoManutencaoPct = 0.25, precoUnitario = 0) {
    if (demandaAnual <= 0 || precoUnitario <= 0) return 0;
    const H = precoUnitario * custoManutencaoPct;
    if (H <= 0) return 0;
    return Math.ceil(Math.sqrt((2 * demandaAnual * custoPedido) / H));
  },

  /**
   * Calcula ponto de pedido
   * PP = (Demanda média diária × Lead time) + Estoque de segurança
   */
  pontoPedido(mediaDiaria, leadTimeDias = 3, fatorSeguranca = 1.5) {
    const estoqueSeguranca = Math.ceil(mediaDiaria * leadTimeDias * (fatorSeguranca - 1));
    const pp = Math.ceil((mediaDiaria * leadTimeDias) + estoqueSeguranca);
    return { pontoPedido: pp, estoqueSeguranca, leadTimeDias };
  },

  /**
   * Gera sugestão inteligente de compras
   */
  sugestaoInteligente(itens, diasCobertura, diasVendas) {
    return itens.map(item => {
      const mediaDiaria = item.mediaDiaria || 0;
      const estoque = item.estoqueAtual || 0;
      const preco = item.precoUnitario || 0;

      // Ponto de pedido
      const pp = this.pontoPedido(mediaDiaria);

      // Lote econômico
      const demandaAnual = mediaDiaria * 365;
      const eoq = this.loteEconomico(demandaAnual, 50, 0.25, preco);

      // Classificação de urgência
      const cobertura = mediaDiaria > 0 ? estoque / mediaDiaria : 999;
      let urgencia = 'baixa';
      if (cobertura <= 2) urgencia = 'critica';
      else if (cobertura <= 5) urgencia = 'alta';
      else if (cobertura <= 10) urgencia = 'media';

      // Quantidade sugerida (maior entre necessidade e EOQ)
      const necessidade = Math.ceil(mediaDiaria * (diasCobertura + 3)) - estoque;
      const qtdSugerida = necessidade > 0 ? Math.max(necessidade, eoq > 0 ? eoq : necessidade) : 0;

      return {
        ...item,
        pontoPedido: pp.pontoPedido,
        estoqueSeguranca: pp.estoqueSeguranca,
        eoq,
        urgencia,
        coberturaDias: Math.round(cobertura),
        qtdSugerida,
        valorSugerido: Math.round(qtdSugerida * preco * 100) / 100,
      };
    }).filter(i => i.qtdSugerida > 0).sort((a, b) => {
      const urgOrder = { critica: 0, alta: 1, media: 2, baixa: 3 };
      return (urgOrder[a.urgencia] || 3) - (urgOrder[b.urgencia] || 3) || b.qtdSugerida - a.qtdSugerida;
    });
  },
};
