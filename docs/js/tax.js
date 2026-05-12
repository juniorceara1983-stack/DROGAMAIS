/**
 * docs/js/tax.js – Módulo de Cálculos Tributários para Farmácia
 * Regras baseadas na legislação brasileira para medicamentos
 */

const TAX = {
  // Tabela de alíquotas padrão por tipo de tributação ICMS
  ICMS_TIPOS: {
    'SUBS. TRIB':    { aliquota: 0, descricao: 'Substituição Tributária (ICMS já recolhido)', sigla: 'ST' },
    'ST':            { aliquota: 0, descricao: 'Substituição Tributária', sigla: 'ST' },
    'ISENTO':        { aliquota: 0, descricao: 'Isento de ICMS', sigla: 'IS' },
    'TRIBUTADO':     { aliquota: 18, descricao: 'Tributação Normal', sigla: 'TR' },
    'TRIBUTADO 12%': { aliquota: 12, descricao: 'Alíquota Reduzida 12%', sigla: 'TR12' },
    'TRIBUTADO 7%':  { aliquota: 7, descricao: 'Alíquota Interestadual 7%', sigla: 'TR7' },
    'NAO TRIBUTADO': { aliquota: 0, descricao: 'Não Tributado', sigla: 'NT' },
  },

  // PIS/COFINS – Regime monofásico para medicamentos (NCM 3003/3004)
  PIS_COFINS: {
    MONOFASICO: { pis: 0, cofins: 0, descricao: 'Monofásico (recolhido na indústria)' },
    LISTA_POSITIVA: { pis: 0.65, cofins: 3.0, descricao: 'Lista Positiva – alíquota reduzida' },
    LISTA_NEGATIVA: { pis: 2.1, cofins: 9.9, descricao: 'Lista Negativa – alíquota majorada' },
    LISTA_NEUTRA: { pis: 0, cofins: 0, descricao: 'Lista Neutra – alíquota zero' },
    TRIBUTADO_NORMAL: { pis: 1.65, cofins: 7.6, descricao: 'Tributação Normal (Lucro Real)' },
    SIMPLES_NACIONAL: { pis: 0, cofins: 0, descricao: 'Simples Nacional (incluso no DAS)' },
  },

  // NCMs comuns de medicamentos (3003 e 3004)
  NCM_MEDICAMENTOS: ['3003', '3004'],

  // NCMs de perfumaria/cosméticos (tributação diferente)
  NCM_PERFUMARIA: ['3303', '3304', '3305', '3306', '3307'],

  // NCMs de alimentos/suplementos
  NCM_SUPLEMENTOS: ['2106', '2202'],

  /**
   * Identifica o regime PIS/COFINS baseado no NCM
   */
  getRegimePisCofins(ncm) {
    if (!ncm) return this.PIS_COFINS.MONOFASICO;
    const ncm4 = String(ncm).substring(0, 4);
    // Medicamentos NCM 3003/3004 – regime monofásico
    if (this.NCM_MEDICAMENTOS.includes(ncm4)) return this.PIS_COFINS.MONOFASICO;
    // Perfumaria – tributação normal
    if (this.NCM_PERFUMARIA.includes(ncm4)) return this.PIS_COFINS.TRIBUTADO_NORMAL;
    // Suplementos – pode variar
    if (this.NCM_SUPLEMENTOS.includes(ncm4)) return this.PIS_COFINS.LISTA_POSITIVA;
    return this.PIS_COFINS.TRIBUTADO_NORMAL;
  },

  /**
   * Retorna informações de ICMS baseado no tipo
   */
  getInfoICMS(tipoIcms) {
    if (!tipoIcms) return { aliquota: 18, descricao: 'Não identificado', sigla: '??' };
    const key = String(tipoIcms).trim().toUpperCase();
    return this.ICMS_TIPOS[key] || { aliquota: 18, descricao: key, sigla: 'TR' };
  },

  /**
   * Calcula todos os impostos de um item
   */
  calcularImpostos(item) {
    const preco = item.precoUnitario || 0;
    const qtd = item.comprar || item.quantidade || 0;
    const valorBase = preco * qtd;
    const ncm = item.ncm || '';
    const tipoIcms = item.icms || item.tipoIcms || 'SUBS. TRIB';

    const infoIcms = this.getInfoICMS(tipoIcms);
    const regimePisCofins = this.getRegimePisCofins(ncm);

    const icmsValor = valorBase * (infoIcms.aliquota / 100);
    const pisValor = valorBase * (regimePisCofins.pis / 100);
    const cofinsValor = valorBase * (regimePisCofins.cofins / 100);
    const totalImpostos = icmsValor + pisValor + cofinsValor;

    return {
      valorBase: Math.round(valorBase * 100) / 100,
      icms: {
        tipo: infoIcms.sigla,
        descricao: infoIcms.descricao,
        aliquota: infoIcms.aliquota,
        valor: Math.round(icmsValor * 100) / 100,
      },
      pis: {
        regime: regimePisCofins.descricao,
        aliquota: regimePisCofins.pis,
        valor: Math.round(pisValor * 100) / 100,
      },
      cofins: {
        regime: regimePisCofins.descricao,
        aliquota: regimePisCofins.cofins,
        valor: Math.round(cofinsValor * 100) / 100,
      },
      totalImpostos: Math.round(totalImpostos * 100) / 100,
      cargaTributaria: valorBase > 0 ? Math.round((totalImpostos / valorBase) * 10000) / 100 : 0,
    };
  },

  /**
   * Gera resumo tributário de uma lista de itens
   */
  gerarResumoTributario(itens) {
    let totalBase = 0, totalIcms = 0, totalPis = 0, totalCofins = 0;
    const porTipo = {};
    const porNcm = {};

    itens.forEach(item => {
      const imp = this.calcularImpostos(item);
      totalBase += imp.valorBase;
      totalIcms += imp.icms.valor;
      totalPis += imp.pis.valor;
      totalCofins += imp.cofins.valor;

      // Agrupar por tipo ICMS
      const tipo = imp.icms.tipo;
      if (!porTipo[tipo]) porTipo[tipo] = { qtd: 0, valor: 0, imposto: 0, descricao: imp.icms.descricao };
      porTipo[tipo].qtd++;
      porTipo[tipo].valor += imp.valorBase;
      porTipo[tipo].imposto += imp.icms.valor;

      // Agrupar por NCM (4 primeiros dígitos)
      const ncm4 = item.ncm ? String(item.ncm).substring(0, 4) : 'N/D';
      if (!porNcm[ncm4]) porNcm[ncm4] = { qtd: 0, valor: 0 };
      porNcm[ncm4].qtd++;
      porNcm[ncm4].valor += imp.valorBase;
    });

    const totalImpostos = totalIcms + totalPis + totalCofins;
    return {
      totalBase: Math.round(totalBase * 100) / 100,
      totalIcms: Math.round(totalIcms * 100) / 100,
      totalPis: Math.round(totalPis * 100) / 100,
      totalCofins: Math.round(totalCofins * 100) / 100,
      totalImpostos: Math.round(totalImpostos * 100) / 100,
      cargaMedia: totalBase > 0 ? Math.round((totalImpostos / totalBase) * 10000) / 100 : 0,
      porTipoIcms: porTipo,
      porNcm: porNcm,
      totalItens: itens.length,
    };
  },
};
