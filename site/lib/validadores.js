const RE_USUARIO = /^[a-z0-9._-]{3,32}$/i;

function normalizarUsuario(valor) {
    return String(valor || '').trim().toLowerCase();
}

function validarUsuario(valor) {
    const usuario = normalizarUsuario(valor);
    if (!RE_USUARIO.test(usuario)) {
        return { valido: false, erro: 'Use de 3 a 32 caracteres: letras, numeros, ponto, hifen ou underscore.' };
    }
    return { valido: true, valor: usuario };
}

function validarSenha(valor) {
    const senha = String(valor || '');
    if (senha.length < 8) {
        return { valido: false, erro: 'A senha deve ter no minimo 8 caracteres.' };
    }
    if (senha.length > 200) {
        return { valido: false, erro: 'A senha e muito longa.' };
    }
    return { valido: true, valor: senha };
}

module.exports = { normalizarUsuario, validarUsuario, validarSenha };