const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

const config = require('./config');
const { carregarUsuario } = require('./middleware/auth');
const csrf = require('./middleware/csrf');
const flash = require('./middleware/flash');
const rotasAuth = require('./routes/auth');
const rotasPainel = require('./routes/painel');
const rotasPagamentos = require('./routes/pagamentos');

require('../models/vendas');
require('./models/usuario');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.locals.appName = 'Painel de Vendas';
app.locals.formatarMoeda = (valor) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
}).format(Number(valor) || 0);
app.locals.formatarData = (valor) => {
    if (!valor) return '-';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleString('pt-BR');
};

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"]
        }
    },
    referrerPolicy: { policy: 'same-origin' }
}));

app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.producao ? '1d' : 0 }));

app.use(session({
    name: 'vendas.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
        mongoUrl: config.mongoUri,
        collectionName: 'sessoes_site',
        ttl: 60 * 60 * 24 * 7,
        touchAfter: 60 * 10
    }),
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.producao,
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.use(flash);
app.use(carregarUsuario);
app.use(csrf);

app.get('/', (req, res) => {
    res.redirect(res.locals.usuario ? '/painel' : '/entrar');
});

app.get('/saude', (req, res) => {
    res.json({ ok: true });
});

app.use(rotasAuth);
app.use(rotasPainel);
app.use(rotasPagamentos);

app.use((req, res) => {
    res.status(404).render('erro', {
        titulo: 'Pagina nao encontrada',
        codigo: 404,
        mensagem: 'A pagina que voce tentou acessar nao existe.',
        voltar: res.locals.usuario ? '/painel' : '/entrar'
    });
});

app.use((erro, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('Erro no site:', erro);

    if (res.headersSent) return next(erro);

    return res.status(500).render('erro', {
        titulo: 'Erro interno',
        codigo: 500,
        mensagem: 'Ocorreu um erro inesperado. Tente novamente em instantes.',
        voltar: res.locals.usuario ? '/painel' : '/entrar'
    });
});

async function iniciar() {
    await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 10000
    });

    const servidor = app.listen(config.port, () => {
        console.log(`Site iniciado em http://localhost:${config.port}`);
    });

    async function encerrar(sinal) {
        console.log(`Recebido ${sinal}, encerrando o site...`);
        servidor.close(async () => {
            await mongoose.connection.close();
            process.exit(0);
        });
    }

    process.on('SIGINT', () => encerrar('SIGINT'));
    process.on('SIGTERM', () => encerrar('SIGTERM'));
}

iniciar().catch((erro) => {
    console.error('Nao foi possivel iniciar o site:', erro.message);
    process.exit(1);
});