(function (root) {
  const TG = (root.TimeGuard = root.TimeGuard || {});

  // Helpers for the extension's pages. Pages never write storage themselves;
  // they ask the service worker, which checks codes and owns all the data.
  function send(type, payload = {}) {
    return chrome.runtime.sendMessage({ type, ...payload });
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const child of children || []) if (child != null) node.append(child);
    return node;
  }

  function showMessages(container, lines, kind) {
    container.replaceChildren(...lines.map((t) => el('span', { className: kind, textContent: t })));
  }

  // Draws a QR code with the bundled qrcode-generator library. Always dark on
  // white, since many scanners can't read inverted codes.
  function drawQr(canvas, text) {
    const qr = root.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    const scale = Math.floor(canvas.width / (count + quiet * 2));
    const offset = Math.floor((canvas.width - scale * count) / 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(offset + c * scale, offset + r * scale, scale, scale);
      }
    }
  }

  // "JBSW Y3DP EHPK 3PXP" for typing the key by hand.
  function groupKeyText(secret) {
    return secret.replace(/(.{4})/g, '$1 ').trim();
  }

  function untilText(ms) {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${min % 60} min`;
  }

  Object.assign(TG, { send, el, showMessages, drawQr, groupKeyText, untilText });
})(globalThis);
