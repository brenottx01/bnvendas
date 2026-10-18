const Usuario = require('../models/usuario');

async function carregarUsuario(req, res, next) {
    res.locals.usuario = null;

    if (!req.session || !req.session.usuarioId) return next();

    try {
        const usuario = await Usuario.findById(req.session.usuarioId).lean();

        if (!usuario || !usuario.ativo) {
            delete req.session.usuarioId;
            return next();
        }

        res.locals.usuario = usuario;
        return next();
    } catch (erro) {
        return next(erro);
    }
}

function exigirLogin(req, res, next) {
    if (!res.locals.usuario) {
        return res.redirect('/entrar');
    }
    return next();
}

function exigirAdmin(req, res, next) {
    if (!res.locals.usuario) {
        return res.redirect('/entrar');
    }

    if (res.locals.usuario.papel !== 'admin') {
        return res.status(403).render('erro', {
            titulo: 'Acesso negado',
            codigo: 403,
            mensagem: 'Voce precisa ser administrador para acessar esta area.',
            voltar: '/painel'
        });
    }

    return next();
}

module.exports = { carregarUsuario, exigirLogin, exigirAdmin };