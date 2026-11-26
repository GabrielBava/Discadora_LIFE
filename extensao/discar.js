// Roda dentro da página da Api4Com. Só faz duas coisas quando o painel pede:
// cola o número no campo de discagem e aciona a ligação. Nunca desliga.

(() => {
  if (window.__discadoraLife) return;
  window.__discadoraLife = true;

  const RE_CAMPO = /n[uú]mero|telefone|fone|phone|discar|dial|destino/i;
  const RE_BOTAO = /ligar|discar|chamar|call|dial/i;
  const RE_NAO_E_LIGAR = /deslig|encerr|hang|desconect|cancel|recus/i;

  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };

  const descricao = (el) =>
    [el.textContent, el.title, el.value, el.id, el.name, el.placeholder,
      el.getAttribute('aria-label'), el.getAttribute('class')].join(' ');

  function acharCampo(seletor) {
    if (seletor) return document.querySelector(seletor);
    const campos = [...document.querySelectorAll(
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=password]):not([type=button]):not([type=submit])'
    )].filter(visivel);
    return campos.find((c) => c.type === 'tel') ||
      campos.find((c) => RE_CAMPO.test(descricao(c))) || null;
  }

  function acharBotao(seletor) {
    if (seletor) return document.querySelector(seletor);
    const botoes = [...document.querySelectorAll(
      'button, [role=button], input[type=button], input[type=submit]'
    )].filter(visivel);
    return botoes.find((b) => {
      const d = descricao(b);
      return RE_BOTAO.test(d) && !RE_NAO_E_LIGAR.test(d);
    }) || null;
  }

  // Preenche de um jeito que frameworks (React, Vue, Angular) também percebem
  function colar(campo, numero) {
    campo.focus();
    if (campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement) {
      const proto = Object.getPrototypeOf(campo) === HTMLTextAreaElement.prototype
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(campo, numero);
    } else {
      campo.textContent = numero; // campo editável que não é <input>
    }
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function apertarEnter(campo) {
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      campo.dispatchEvent(new KeyboardEvent(tipo, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
      }));
    }
  }

  function destacar(el) {
    if (!el) return;
    const antes = el.style.outline;
    el.style.outline = '3px solid #e8590c';
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => { el.style.outline = antes; }, 3000);
  }

  chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
    if (!msg || !String(msg.tipo).startsWith('discadora:')) return;
    // A primeira tentativa vai só para a página principal; a segunda, para os iframes.
    const ehTopo = window === window.top;
    if (msg.somenteTopo !== ehTopo) return;

    const { seletorCampo, seletorBotao, usarEnter } = msg.config || {};
    let campo, botao;
    try {
      campo = acharCampo(seletorCampo);
      if (campo) botao = usarEnter ? null : acharBotao(seletorBotao);
    } catch {
      if (ehTopo) responder({ ok: false, erro: 'seletor' });
      return;
    }
    if (!campo) {
      if (ehTopo) responder({ ok: false, erro: 'campo' });
      return;
    }

    if (msg.tipo === 'discadora:testar') {
      destacar(campo);
      destacar(botao);
      responder({ ok: true, botao: !!botao, usarEnter: !!usarEnter });
      return;
    }

    if (msg.tipo === 'discadora:discar') {
      colar(campo, msg.numero);
      // Pequena pausa para a página registrar o número antes de ligar
      setTimeout(() => {
        if (botao) botao.click();
        else apertarEnter(campo);
        responder({ ok: true, como: botao ? 'botao' : 'enter' });
      }, 300);
      return true;
    }
  });
})();
