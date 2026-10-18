const mongoose = require('mongoose');

const esquema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    usuario: { type: String, required: true },
    ehAdmin: { type: Boolean, default: false },
    itens: [{
        produtoId: Number,
        nome: String,
        valorOriginal: Number,
        valorPago: Number
    }],
    valorOriginal: { type: Number, required: true },
    desconto: { type: Number, default: 0 },
    comissao: { type: Number, default: 0 },
    valorFinal: { type: Number, required: true },
    status: { type: String, enum: ['pendente', 'confirmado', 'cancelado'], default: 'pendente' },
    txid: { type: String, required: true },
    payloadPix: { type: String, default: '' },
    qrCode: { type: String, default: '' },
    criadoEm: { type: Date, default: Date.now },
    confirmadoEm: { type: Date, default: null },
    confirmadoPor: { type: String, default: '' }
}, { versionKey: false });

esquema.index({ criadoEm: -1 });

module.exports = mongoose.models.Cobranca || mongoose.model('Cobranca', esquema);