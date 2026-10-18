const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function lerMongoUri() {
    if (process.env.MONGO_URI && process.env.MONGO_URI.trim()) {
        return process.env.MONGO_URI.trim();
    }

    try {
        const botConfig = require('../config.json');
        if (botConfig.mongo_key) return botConfig.mongo_key;
    } catch (erro) {
        console.error('config.json nao encontrado e MONGO_URI nao definido.');
    }

    throw new Error('Defina MONGO_URI no .env ou informe mongo_key no config.json.');
}

const producao = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 32
    ? process.env.SESSION_SECRET.trim()
    : null;

if (!sessionSecret && producao) {
    throw new Error('SESSION_SECRET ausente. Defina um valor de no minimo 32 caracteres.');
}

module.exports = {
    port: Number(process.env.PORT) || 3000,
    producao,
    sessionSecret: sessionSecret || crypto.randomBytes(48).toString('hex'),
    mongoUri: lerMongoUri()
};