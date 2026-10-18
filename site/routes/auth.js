const express = require('express');
const rateLimit = require('express-rate-limit');
const Usuario = require('../models/usuario');
const { validarUsuario, validarSenha } = require('../lib/validadores');

const router = express.Router();

const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.'
});

const limiteCadastro = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Limite de cadastros atingido para este IP. Aguarde 1 hora.'
});

router.get('/entrar', (req, res) => {
    if (res.locals.usuario) return res.redirect('/painel');
    return res.render('entrar', { titulo: 'Entrar' });
});

router.post('/entrar', limiteLogin, async (req, res, next) => {
    try {
        const checagemUsuario = validarUsuario(req.body.usuario);
        const checagemSenha = validarSenha(req.body.senha);

        if (!checagemUsuario.valido || !checagemSenha.valido) {
            return res.status(400).render('entrar', {
                titulo: 'Entrar',
                erro: 'Informe um usuario e uma senha validos.',
                valores: { usuario: req.body.usuario }
            });
        }

        const usuario = await Usuario.findOne({ usuario: checagemUsuario.valor });
        const senhaCorreta = usuario ? await usuario.verificarSenha(String(req.body.senha)) : false;

        if (!usuario || !senhaCorreta || !usuario.ativo) {
            req.session.flash = { erro: 'Usuario ou senha invalidos, ou conta desativada.' };
            return res.redirect('/entrar');
        }

        await new Promise((resolve, reject) => {
            req.session.regenerate((erro) => (erro ? reject(erro) : resolve()));
        });

        req.session.usuarioId = usuario._id.toString();
        req.session.flash = { sucesso: `Bem-vindo, ${usuario.usuario}!` };

        usuario.ultimoLogin = new Date();
        await usuario.save();

        return res.redirect('/painel');
    } catch (erro) {
        return next(erro);
    }
});

router.get('/registrar', (req, res) => {
    if (res.locals.usuario) return res.redirect('/painel');
    return res.render('registrar', { titulo: 'Criar conta' });
});

router.post('/registrar', limiteCadastro, async (req, res, next) => {
    try {
        const checagemUsuario = validarUsuario(req.body.usuario);
        const checagemSenha = validarSenha(req.body.senha);

        if (!checagemUsuario.valido) {
            return res.status(400).render('registrar', {
                titulo: 'Criar conta',
                erro: checagemUsuario.erro,
                valores: { usuario: req.body.usuario }
            });
        }

        if (!checagemSenha.valido) {
            return res.status(400).render('registrar', {
                titulo: 'Criar conta',
                erro: checagemSenha.erro,
                valores: { usuario: req.body.usuario }
            });
        }

        if (req.body.senha !== req.body.confirmarSenha) {
            return res.status(400).render('registrar', {
                titulo: 'Criar conta',
                erro: 'As senhas nao conferem.',
                valores: { usuario: req.body.usuario }
            });
        }

        const existente = await Usuario.findOne({ usuario: checagemUsuario.valor });
        if (existente) {
            return res.status(409).render('registrar', {
                titulo: 'Criar conta',
                erro: 'Este usuario ja esta cadastrado.',
                valores: { usuario: req.body.usuario }
            });
        }

        const usuario = await Usuario.create({
            usuario: checagemUsuario.valor,
            senhaHash: await Usuario.gerarHash(checagemSenha.valor),
            papel: 'user',
            ativo: true
        });

        await new Promise((resolve, reject) => {
            req.session.regenerate((erro) => (erro ? reject(erro) : resolve()));
        });

        req.session.usuarioId = usuario._id.toString();
        req.session.flash = { sucesso: 'Conta criada com sucesso.' };

        return res.redirect('/painel');
    } catch (erro) {
        return next(erro);
    }
});

router.post('/sair', (req, res, next) => {
    req.session.destroy((erro) => {
        if (erro) return next(erro);
        res.clearCookie('vendas.sid');
        return res.redirect('/entrar');
    });
});

module.exports = router;