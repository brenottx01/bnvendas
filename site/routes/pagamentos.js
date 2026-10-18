const express = require('express');
const QRCode = require('qrcode');

const { exigirLogin, exigirAdmin } = require('../middleware/auth');
const { obterConfiguracoes, salvarConfiguracoes, calcularPreco } = require('../lib/pagamentos');
const { gerarPayloadPix, txidAleatorio } = require('../lib/pix');
const Cobranca = require('../models/cobranca');
const { Produto } = require('../../models/vendas');

const router = express.Router();

router.use(exigirLogin);

// ---------- Checkout do usuario ----------

router.get('/checkout', async (req, res, next) => {
    try {
        const [config, produtos] = await Promise.all([
            obterConfiguracoes(),
            Produto.find({ quantidade: { $gt: 0 } }).sort({ nome: 1 }).limit(200).lean()
        ]);

        const ehAdmin = res.locals.usuario.papel === 'admin';
        const itens = produtos.map((produto) => ({
            ...produto,
            preco: calcularPreco(produto.valor, ehAdmin, config)
        }));

        return res.render('checkout', {
            titulo: 'Checkout PIX',
            itens,
            config,
            ehAdmin,
            temDesconto: config.descontoAtivo && (!ehAdmin || !config.adminPagaValorCheio)
        });
    } catch (erro) {
        return next(erro);
    }
});

router.post('/checkout/gerar', async (req, res, next) => {
    try {
        const config = await obterConfiguracoes();

        if (!config.chavePix) {
            req.session.flash = { erro: 'O administrador ainda nao configurou a chave PIX.' };
            return res.redirect('/checkout');
        }

        const recebidos = req.body.produtos === undefined
            ? []
            : (Array.isArray(req.body.produtos) ? req.body.produtos : [req.body.produtos]);

        const selecionados = recebidos.map(Number).filter(Boolean);

        if (selecionados.length === 0) {
            req.session.flash = { erro: 'Selecione ao menos um produto.' };
            return res.redirect('/checkout');
        }

        const produtos = await Produto.find({ _id: { $in: selecionados } }).lean();
        if (produtos.length === 0) {
            req.session.flash = { erro: 'Produtos nao encontrados.' };
            return res.redirect('/checkout');
        }

        const ehAdmin = res.locals.usuario.papel === 'admin';
        const itens = produtos.map((produto) => {
            const preco = calcularPreco(produto.valor, ehAdmin, config);
            return {
                produtoId: produto._id,
                nome: produto.nome,
                valorOriginal: preco.valorOriginal,
                valorPago: preco.valorFinal
            };
        });

        const valorOriginal = itens.reduce((t, i) => t + i.valorOriginal, 0);
        const valorFinal = itens.reduce((t, i) => t + i.valorPago, 0);

        const { payload, txid } = gerarPayloadPix({
            chave: config.chavePix,
            valor: valorFinal,
            nomeRecebedor: config.nomeRecebedor,
            cidade: config.cidade,
            txid: txidAleatorio()
        });

        const qrCode = await QRCode.toDataURL(payload, { margin: 1, width: 320 });

        const cobranca = await Cobranca.create({
            usuarioId: res.locals.usuario._id,
            usuario: res.locals.usuario.usuario,
            ehAdmin,
            itens,
            valorOriginal,
            desconto: valorOriginal - valorFinal,
            comissao: valorOriginal - valorFinal,
            valorFinal,
            status: 'pendente',
            txid,
            payloadPix: payload,
            qrCode
        });

        return res.redirect(`/cobranca/${cobranca._id}`);
    } catch (erro) {
        return next(erro);
    }
});

router.get('/cobranca/:id', async (req, res, next) => {
    try {
        const cobranca = await Cobranca.findById(req.params.id).lean();
        const ehAdmin = res.locals.usuario.papel === 'admin';

        if (!cobranca) {
            req.session.flash = { erro: 'Cobranca nao encontrada.' };
            return res.redirect('/minhas-cobrancas');
        }

        if (!ehAdmin && cobranca.usuarioId.toString() !== res.locals.usuario._id.toString()) {
            return res.status(403).render('erro', {
                titulo: 'Acesso negado',
                codigo: 403,
                mensagem: 'Esta cobranca pertence a outra conta.',
                voltar: '/minhas-cobrancas'
            });
        }

        const config = await obterConfiguracoes();
        return res.render('cobranca', {
            titulo: 'Pagamento PIX',
            cobranca,
            config,
            ehAdmin
        });
    } catch (erro) {
        return next(erro);
    }
});

router.get('/minhas-cobrancas', async (req, res, next) => {
    try {
        const filtro = res.locals.usuario.papel === 'admin'
            ? {}
            : { usuarioId: res.locals.usuario._id };

        const cobrancas = await Cobranca.find(filtro).sort({ criadoEm: -1 }).limit(100).lean();
        return res.render('minhas-cobrancas', { titulo: 'Minhas cobrancas', cobrancas });
    } catch (erro) {
        return next(erro);
    }
});

// ---------- Administracao do PIX ----------

router.get('/admin/pagamentos', exigirAdmin, async (req, res, next) => {
    try {
        const [cobrancas, config] = await Promise.all([
            Cobranca.find({}).sort({ criadoEm: -1 }).limit(200).lean(),
            obterConfiguracoes()
        ]);

        const totalConfirmado = cobrancas
            .filter((c) => c.status === 'confirmado')
            .reduce((t, c) => t + c.valorFinal, 0);

        const totalComissao = cobrancas
            .filter((c) => c.status === 'confirmado')
            .reduce((t, c) => t + c.comissao, 0);

        return res.render('admin-pagamentos', {
            titulo: 'Pagamentos',
            cobrancas,
            config,
            resumo: {
                pendentes: cobrancas.filter((c) => c.status === 'pendente').length,
                totalConfirmado,
                totalComissao
            }
        });
    } catch (erro) {
        return next(erro);
    }
});

router.post('/admin/pagamentos/config', exigirAdmin, async (req, res, next) => {
    try {
        const config = await salvarConfiguracoes(req.body);
        req.session.flash = {
            sucesso: config.chavePix ? 'Configuracao PIX salva.' : 'Configuracao PIX limpa.'
        };
        return res.redirect('/admin/pagamentos');
    } catch (erro) {
        return next(erro);
    }
});

router.post('/admin/cobranca/:id/status', exigirAdmin, async (req, res, next) => {
    try {
        const status = ['pendente', 'confirmado', 'cancelado'].includes(req.body.status)
            ? req.body.status
            : 'pendente';

        const cobranca = await Cobranca.findById(req.params.id);
        if (!cobranca) {
            req.session.flash = { erro: 'Cobranca nao encontrada.' };
            return res.redirect('/admin/pagamentos');
        }

        cobranca.status = status;
        cobranca.confirmadoEm = status === 'confirmado' ? new Date() : null;
        cobranca.confirmadoPor = status === 'confirmado' ? res.locals.usuario.usuario : '';
        await cobranca.save();

        req.session.flash = { sucesso: `Cobranca marcada como ${status}.` };
        return res.redirect('/admin/pagamentos');
    } catch (erro) {
        return next(erro);
    }
});

module.exports = router;