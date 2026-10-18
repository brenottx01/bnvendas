const crypto = require('crypto');

const ALFABETO_TXID = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ';

function campo(id, valor) {
    const texto = String(valor);
    return `${id}${String(texto.length).padStart(2, '0')}${texto}`;
}

function semAcento(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, '')
        .trim();
}

function txidAleatorio() {
    let texto = '';
    const bytes = crypto.randomBytes(25);
    for (let i = 0; i < 25; i++) texto += ALFABETO_TXID[bytes[i] % ALFABETO_TXID.length];
    return texto;
}

function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
            crc &= 0xFFFF;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera o payload PIX (BR Code) estatico com valor definido.
 */
function gerarPayloadPix({ chave, valor, nomeRecebedor, cidade, txid }) {
    const chaveLimpa = String(chave || '').trim();
    if (!chaveLimpa) throw new Error('Chave PIX nao configurada.');

    const valorNum = Math.max(0, Number(valor) || 0);
    const nome = (semAcento(nomeRecebedor) || 'RECEBEDOR').slice(0, 25).toUpperCase();
    const cidadeLimpa = (semAcento(cidade) || 'SAO PAULO').slice(0, 15).toUpperCase();
    const idTxid = (txid || txidAleatorio()).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25) || txidAleatorio();

    const merchantAccount = campo('00', 'br.gov.bcb.pix') + campo('01', chaveLimpa);
    const additional = campo('05', idTxid);

    let payload = '';
    payload += campo('00', '01');
    payload += campo('26', merchantAccount);
    payload += campo('52', '0000');
    payload += campo('53', '986');
    if (valorNum > 0) payload += campo('54', valorNum.toFixed(2));
    payload += campo('58', 'BR');
    payload += campo('59', nome);
    payload += campo('60', cidadeLimpa);
    payload += campo('62', additional);
    payload += '6304';

    return { payload: payload + crc16(payload), txid: idTxid };
}

module.exports = { gerarPayloadPix, txidAleatorio };