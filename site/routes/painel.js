const express = require('express');
const mongoose = require('mongoose');
const Usuario = require('../models/usuario');
const { exigirLogin, exigirAdmin } = require('../middleware/auth');
const { validarSenha } = require('../lib/validadores');
const {
    Pagamento,
    Produto,
    ProdutoEstoque,
    Carrinho
} = require('../../models/vendas');

const router = express.Router();

router.use(exigirLogin);

router.get('/painel', async (req, res, next) => {
    try {
        const ehAdmin = res.locals.usuario.papel === 'admin';

        const [usuariosAtivos, totalProdutos, totalVendas, carrinhosAbertos, receitaAgg, vendasRecentes] = await Promise.all([
            ehAdmin ? Usuario.countDocuments({ ativo: true }) : 0,
            Produto.countDocuments({}),
            ehAdmin ? Pagamento.countDocuments({ pagamento_confirmado: true }) : 0,
            ehAdmin ? Carrinho.countDocuments({}) : 0,
            ehAdmin ? Pagamento.aggregate([
                { $match: { pagamento_confirmado: true } },
                { $group: { _id: null, total: { $sum: '$valor' } } }
            ]) : [],
            ehAdmin ? Pagamento.find({}).sort({ _id: -1 }).limit(8).lean() : []
        ]);

        return res.render('painel', {
            titulo: 'Painel',
            metricas: {
                usuariosAtivos,
                totalProdutos,
                totalVendas,
                carrinhosAbertos,
                receita: receitaAgg[0] ? receitaAgg[0].total : 0
            },
            vendasRecentes,
            ehAdmin
        });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/produtos', async (req, res, next) => {
    try {
        const produtos = await Produto.find({}).sort({ _id: -1 }).limit(300).lean();
        return res.render('produtos', { titulo: 'Produtos', produtos });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/vendas', exigirAdmin, async (req, res, next) => {
    try {
        const vendas = await Pagamento.find({}).sort({ _id: -1 }).limit(300).lean();
        return res.render('vendas', { titulo: 'Vendas', vendas });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/estoque', exigirAdmin, async (req, res, next) => {
    try {
        const estoque = await ProdutoEstoque.aggregate([
            {
                $group: {
                    _id: { servidor: '$server_id', produtoId: '$produtoId' },
                    total: { $sum: 1 },
                    maisAntigo: { $min: '$data_adicao' },
                    maisRecente: { $max: '$data_adicao' }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 300 }
        ]);

        const ids = estoque.map((item) => item._id.produtoId);
        const produtos = await Produto.find({ _id: { $in: ids } }).lean();
        const mapaProdutos = new Map(produtos.map((produto) => [produto._id, produto]));

        const linhas = estoque.map((item) => ({
            servidor: item._id.servidor,
            produto: mapaProdutos.get(item._id.produtoId) || null,
            produtoId: item._id.produtoId,
            total: item.total,
            maisAntigo: item.maisAntigo,
            maisRecente: item.maisRecente
        }));

        return res.render('estoque', { titulo: 'Estoque', linhas });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/carrinhos', exigirAdmin, async (req, res, next) => {
    try {
        const carrinhos = await Carrinho.find({}).sort({ _id: -1 }).limit(200).lean();
        return res.render('carrinhos', { titulo: 'Carrinhos', carrinhos });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/admin', exigirAdmin, async (req, res, next) => {
    try {
        const [totalUsuarios, admins, inativos, usuariosRecentes] = await Promise.all([
            Usuario.countDocuments({}),
            Usuario.countDocuments({ papel: 'admin', ativo: true }),
            Usuario.countDocuments({ ativo: false }),
            Usuario.find({}).sort({ criadoEm: -1 }).limit(8).lean()
        ]);

        return res.render('admin', {
            titulo: 'Administracao',
            metricas: { totalUsuarios, admins, inativos },
            usuariosRecentes
        });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/admin/usuarios', exigirAdmin, async (req, res, next) => {
    try {
        const usuarios = await Usuario.find({}).sort({ criadoEm: -1 }).limit(500).lean();
        return res.render('usuarios', { titulo: 'Usuarios', usuarios });
    } catch (erro) {
        return next(erro);
    }
});

router.post('/admin/usuarios/:id/papel', exigirAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const papel = req.body.papel === 'admin' ? 'admin' : 'user';

        if (!mongoose.isValidObjectId(id)) {
            req.session.flash = { erro: 'Usuario invalido.' };
            return res.redirect('/admin/usuarios');
        }

        if (id === res.locals.usuario._id.toString() && papel !== 'admin') {
            req.session.flash = { erro: 'Voce nao pode remover a propria permissao de administrador.' };
            return res.redirect('/admin/usuarios');
        }

        const usuario = await Usuario.findById(id);
        if (!usuario) {
            req.session.flash = { erro: 'Usuario nao encontrado.' };
            return res.redirect('/admin/usuarios');
        }

        if (usuario.papel === 'admin' && papel !== 'admin') {
            const totalAdmins = await Usuario.countDocuments({ papel: 'admin', ativo: true });
            if (totalAdmins <= 1) {
                req.session.flash = { erro: 'E preciso manter pelo menos um administrador ativo.' };
                return res.redirect('/admin/usuarios');
            }
        }

        usuario.papel = papel;
        await usuario.save();

        req.session.flash = { sucesso: `Permissao de ${usuario.usuario} atualizada.` };
        return res.redirect('/admin/usuarios');
    } catch (erro) {
        return next(erro);
    }
});

router.post('/admin/usuarios/:id/ativo', exigirAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;

        if (id === res.locals.usuario._id.toString()) {
            req.session.flash = { erro: 'Voce nao pode desativar a propria conta.' };
            return res.redirect('/admin/usuarios');
        }

        const usuario = await Usuario.findById(id);
        if (!usuario) {
            req.session.flash = { erro: 'Usuario nao encontrado.' };
            return res.redirect('/admin/usuarios');
        }

        usuario.ativo = !usuario.ativo;
        await usuario.save();

        req.session.flash = {
            sucesso: `Conta de ${usuario.usuario} ${usuario.ativo ? 'ativada' : 'desativada'}.`
        };
        return res.redirect('/admin/usuarios');
    } catch (erro) {
        return next(erro);
    }
});

router.get('/admin/usuarios/:id/senha', exigirAdmin, async (req, res, next) => {
    try {
        const usuario = await Usuario.findById(req.params.id).lean();
        if (!usuario) {
            req.session.flash = { erro: 'Usuario nao encontrado.' };
            return res.redirect('/admin/usuarios');
        }
        return res.render('redefinir-senha', { titulo: 'Redefinir senha', usuarioAlvo: usuario });
    } catch (erro) {
        return next(erro);
    }
});

router.post('/admin/usuarios/:id/senha', exigirAdmin, async (req, res, next) => {
    try {
        const checagem = validarSenha(req.body.senha);
        if (!checagem.valido || checagem.valor !== req.body.confirmarSenha) {
            req.session.flash = { erro: checagem.valido ? 'As senhas nao conferem.' : checagem.erro };
            return res.redirect(`/admin/usuarios/${req.params.id}/senha`);
        }

        const usuario = await Usuario.findById(req.params.id);
        if (!usuario) {
            req.session.flash = { erro: 'Usuario nao encontrado.' };
            return res.redirect('/admin/usuarios');
        }

        usuario.senhaHash = await Usuario.gerarHash(checagem.valor);
        await usuario.save();

        req.session.flash = { sucesso: `Senha de ${usuario.usuario} redefinida.` };
        return res.redirect('/admin/usuarios');
    } catch (erro) {
        return next(erro);
    }
});

module.exports = router;