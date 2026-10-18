const crypto = require('crypto');

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = function csrf(req, res, next) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    res.locals.csrfToken = req.session.csrfToken;

    if (METODOS_SEGUROS.has(req.method)) return next();

    const enviado = req.body && req.body._csrf;
    const esperado = req.session.csrfToken;

    const valido = typeof enviado === 'string'
        && typeof esperado === 'string'
        && enviado.length === esperado.length
        && crypto.timingSafeEqual(Buffer.from(enviado), Buffer.from(esperado));

    if (!valido) {
        return res.status(403).render('erro', {
            titulo: 'Formulario invalido',
            codigo: 403,
            mensagem: 'A sessao do formulario expirou. Atualize a pagina e tente novamente.',
            voltar: '/painel'
        });
    }

    return next();
};