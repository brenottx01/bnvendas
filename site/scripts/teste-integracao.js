'use strict';

/**
 * Teste de integracao com MongoDB em memoria.
 * Nao usa nem altera o banco configurado em config.json.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.PORT = process.env.TEST_PORT || '3199';
process.env.SESSION_SECRET = 'segredo-de-teste-integracao-000000000000000000000';

function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extrairCsrf(html) {
    const achado = html.match(/name="_csrf" value="([^"]+)"/);
    return achado ? achado[1] : null;
}

const cookies = new Map();

function lerSetCookies(resposta) {
    if (typeof resposta.headers.getSetCookie === 'function') {
        const lista = resposta.headers.getSetCookie();
        if (lista && lista.length) return lista;
    }
    const bruto = resposta.headers.get('set-cookie');
    return bruto ? [bruto] : [];
}

function guardarCookies(resposta) {
    for (const cookie of lerSetCookies(resposta)) {
        const par = cookie.split(';')[0].trim();
        if (!par) continue;
        cookies.set(par.split('=')[0], par);
    }
}

function cabecalhoCookie() {
    return [...cookies.values()].join('; ');
}

(async () => {
    const mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri('siteTeste');

    require('../server');

    const base = `http://127.0.0.1:${process.env.PORT}`;
    let pronto = false;
    for (let tentativa = 0; tentativa < 60; tentativa++) {
        try {
            const resposta = await fetch(`${base}/saude`);
            if (resposta.ok) {
                pronto = true;
                break;
            }
        } catch (erro) {
            await esperar(250);
        }
    }

    if (!pronto) throw new Error('O site nao respondeu apos iniciar.');

    const mongoose = require('mongoose');
    const Usuario = require('../models/usuario');
    const { Produto, Pagamento } = require('../../models/vendas');

    await Produto.create({ nome: 'Produto de teste', valor: 19.9, quantidade: 3, server_id: 'guild1' });
    await Pagamento.create({
        _id: 123456789,
        server_id: 'guild1',
        user_id: 'discord123',
        pagamento_confirmado: true,
        data: new Date().toISOString(),
        quantidade_produtos_vendidos: 2,
        valor: 39.8
    });

    // 1. Pagina de login
    let resposta = await fetch(`${base}/entrar`);
    const htmlLogin = await resposta.text();
    const csrfLogin = extrairCsrf(htmlLogin);
    if (resposta.status !== 200) throw new Error(`Falha em /entrar: ${resposta.status}`);
    if (!csrfLogin) throw new Error('Token CSRF ausente em /entrar.');
    guardarCookies(resposta);

    // 2. Cadastro de usuario comum
    resposta = await fetch(`${base}/registrar`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cabecalhoCookie() },
        body: new URLSearchParams({
            _csrf: csrfLogin,
            usuario: 'cliente_teste',
            senha: 'SenhaForte123',
            confirmarSenha: 'SenhaForte123'
        })
    });
    if (resposta.status !== 302) throw new Error(`Falha no cadastro: ${resposta.status}`);
    guardarCookies(resposta);

    // 3. Painel do usuario comum
    resposta = await fetch(`${base}/painel`, { headers: { cookie: cabecalhoCookie() } });
    const htmlPainel = await resposta.text();
    if (resposta.status !== 200 || !htmlPainel.includes('cliente_teste')) {
        throw new Error(`Usuario comum nao acessou o painel (status ${resposta.status}).`);
    }

    // 4. Usuario comum nao pode ver vendas
    resposta = await fetch(`${base}/vendas`, { headers: { cookie: cabecalhoCookie() } });
    if (resposta.status !== 403) throw new Error(`Rota /vendas deveria estar bloqueada (recebeu ${resposta.status}).`);

    // 5. Criar administrador
    await Usuario.create({
        usuario: 'admin_teste',
        senhaHash: await Usuario.gerarHash('SenhaAdmin123'),
        papel: 'admin',
        ativo: true
    });

    // 6. Login do administrador
    cookies.clear();
    resposta = await fetch(`${base}/entrar`);
    const csrfAdmin = extrairCsrf(await resposta.text());
    guardarCookies(resposta);
    resposta = await fetch(`${base}/entrar`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cabecalhoCookie() },
        body: new URLSearchParams({
            _csrf: csrfAdmin,
            usuario: 'admin_teste',
            senha: 'SenhaAdmin123'
        })
    });
    if (resposta.status !== 302) throw new Error(`Falha no login do admin: ${resposta.status}`);
    guardarCookies(resposta);

    // 7. Painel administrativo
    resposta = await fetch(`${base}/admin/usuarios`, { headers: { cookie: cabecalhoCookie() } });
    const htmlAdmin = await resposta.text();
    if (resposta.status !== 200 || !htmlAdmin.includes('cliente_teste')) {
        throw new Error('Administrador nao visualizou a lista de usuarios.');
    }

    resposta = await fetch(`${base}/vendas`, { headers: { cookie: cabecalhoCookie() } });
    if (resposta.status !== 200) throw new Error(`Administrador nao acessou /vendas: ${resposta.status}`);

    // 8. Logout
    const htmlPainelAdmin = await (await fetch(`${base}/painel`, { headers: { cookie: cabecalhoCookie() } })).text();
    const csrfPainel = extrairCsrf(htmlPainelAdmin);
    resposta = await fetch(`${base}/sair`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cabecalhoCookie() },
        body: new URLSearchParams({ _csrf: csrfPainel })
    });
    if (resposta.status !== 302) throw new Error(`Falha no logout: ${resposta.status}`);

    console.log('TESTE_OK: cadastro, login, permissoes, painel, produtos e vendas funcionando');

    await mongoose.connection.close();
    await mongod.stop();
    process.exit(0);
})().catch(async (erro) => {
    console.error('TESTE_FALHOU:', erro.message);
    process.exit(1);
});