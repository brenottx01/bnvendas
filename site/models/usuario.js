const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const usuarioSchema = new mongoose.Schema({
    usuario: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 32,
        match: [/^[a-z0-9._-]+$/i]
    },
    senhaHash: { type: String, required: true },
    papel: { type: String, enum: ['user', 'admin'], default: 'user' },
    ativo: { type: Boolean, default: true },
    discordId: { type: String, default: '' },
    ultimoLogin: { type: Date, default: null },
    criadoEm: { type: Date, default: Date.now }
}, { versionKey: false });

usuarioSchema.methods.verificarSenha = function verificarSenha(senha) {
    return bcrypt.compare(senha, this.senhaHash);
};

usuarioSchema.statics.gerarHash = function gerarHash(senha) {
    return bcrypt.hash(senha, 12);
};

usuarioSchema.set('toJSON', {
    transform(doc, ret) {
        delete ret.senhaHash;
        return ret;
    }
});

module.exports = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema);