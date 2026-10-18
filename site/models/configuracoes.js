const mongoose = require('mongoose');

const esquema = new mongoose.Schema({
    chavePix: { type: String, default: '' },
    nomeRecebedor: { type: String, default: '' },
    cidade: { type: String, default: 'SAO PAULO' },
    descontoPercentual: { type: Number, default: 10, min: 0, max: 100 },
    comissaoPercentual: { type: Number, default: 10, min: 0, max: 100 },
    descontoAtivo: { type: Boolean, default: true },
    adminPagaValorCheio: { type: Boolean, default: true },
    atualizadoEm: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.models.ConfiguracoesPagamento
    || mongoose.model('ConfiguracoesPagamento', esquema, 'configuracoes_pagamento');