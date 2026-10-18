(function () {
    'use strict';

    document.querySelectorAll('.ver-senha').forEach(function (botao) {
        botao.addEventListener('click', function () {
            var alvoId = botao.getAttribute('data-alvo');
            var campo = document.getElementById(alvoId);
            if (!campo) return;

            var mostrar = campo.type === 'password';
            campo.type = mostrar ? 'text' : 'password';
            botao.textContent = mostrar ? 'ocultar' : 'ver';
            botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
        });
    });

    document.querySelectorAll('form[data-confirmar]').forEach(function (formulario) {
        formulario.addEventListener('submit', function (evento) {
            var mensagem = formulario.getAttribute('data-confirmar');
            if (!window.confirm(mensagem)) evento.preventDefault();
        });
    });

    document.querySelectorAll('[data-copiar]').forEach(function (botao) {
        botao.addEventListener('click', function () {
            var texto = botao.getAttribute('data-copiar');
            var original = botao.textContent;

            function feedback(mensagem) {
                botao.textContent = mensagem;
                setTimeout(function () { botao.textContent = original; }, 1600);
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(texto).then(
                    function () { feedback('Copiado!'); },
                    function () { fallbackCopiar(texto); }
                );
            } else {
                fallbackCopiar(texto);
            }

            function fallbackCopiar(valor) {
                var area = document.createElement('textarea');
                area.value = valor;
                area.setAttribute('readonly', '');
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                try {
                    document.execCommand('copy');
                    feedback('Copiado!');
                } catch (erro) {
                    feedback('Selecione e copie');
                }
                document.body.removeChild(area);
            }
        });
    });
}());