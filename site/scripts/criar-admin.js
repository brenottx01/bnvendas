require('dotenv').config();

const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const config = require('../config');
const Usuario = require('../models/usuario');
const { validarUsuario, validarSenha } = require('../lib/validadores');

async function main() {
    const usuario = validarUsuario(process.env.ADMIN_USER);
    const senha = validarSenha(process.env.ADMIN_PASSWORD);

    if (!usuario.valido) {
        throw new Error(`ADMIN_USER invalido: ${usuario.erro}`);
    }

    if (!senha.valido) {
        throw new Error(`ADMIN_PASSWORD invalido: ${senha.erro}`);
    }

    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 });

    const senhaHash = await Usuario.gerarHash(senha.valor);
    const resultado = await Usuario.findOneAndUpdate(
        { usuario: usuario.valor },
        {
            $set: {
                senhaHash,
                papel: 'admin',
                ativo: true
            },
            $setOnInsert: { criadoEm: new Date() }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    console.log(`Administrador pronto: ${resultado.usuario}`);
    console.log('A senha nao e exibida e nunca deve ser enviada por chat, e-mail ou commit.');
}

main()
    .then(async () => {
        await mongoose.connection.close();
        process.exit(0);
    })
    .catch(async (erro) => {
        console.error(erro.message);
        if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
        process.exit(1);
    });