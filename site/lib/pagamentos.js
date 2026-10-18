const ConfiguracoesPagamento = require('../models/configuracoes');

const PADRAO = {
    chavePix: '',
    nomeRecebedor: '',
    cidade: 'SAO PAULO',
    descontoPercentual: 10,
    comissaoPercentual: 10,
    descontoAtivo: true,
    adminPagaValorCheio: true
};

async function obterConfiguracoes() {
    const salvo = await ConfiguracoesPagamento.findOne({}).lean();
    return { ...PADRAO, ...(salvo || {}) };
}

async function salvarConfiguracoes(dados) {
    const config = {
        chavePix: String(dados.chavePix || '').trim(),
        nomeRecebedor: String(dados.nomeRecebedor || '').trim().slice(0, 25).toUpperCase(),
        cidade: String(dados.cidade || 'SAO PAULO').trim().slice(0, 15).toUpperCase(),
        descontoPercentual: Math.min(100, Math.max(0, Number(dados.descontoPercentual) || 0)),
        comissaoPercentual: Math.min(100, Math.max(0, Number(dados.comissaoPercentual) || 0)),
        descontoAtivo: dados.descontoAtivo === true || dados.descontoAtivo === 'on',
        adminPagaValorCheio: dados.adminPagaValorCheio === true || dados.adminPagaValorCheio === 'on',
        atualizadoEm: new Date()
    };

    await ConfiguracoesPagamento.findOneAndUpdate({}, config, { upsert: true, new: true, setDefaultsOnInsert: true });
    return config;
}

/**
 * Calcula o preco final.
 * Administradores (dono) pagam o valor cheio quando desejado.
 * Os demais usuarios recebem o desconto configurado; a diferenca
 * e a comissao do administrador.
 */
function calcularPreco(valorOriginal, ehAdmin, config) {
    const base = Math.max(0, Number(valorOriginal) || 0);

    const descontoAplicavel = config.descontoAtivo && (!ehAdmin || !config.adminPagaValorCheio);
    const desconto = descontoAplicavel ? (base * Number(config.descontoPercentual || 0)) / 100 : 0;
    const valorFinal = Math.max(0, base - desconto);

    return {
        valorOriginal: base,
        desconto,
        valorFinal,
        comissao: desconto
    };
}

module.exports = { obterConfiguracoes, salvarConfiguracoes, calcularPreco, PADRAO };