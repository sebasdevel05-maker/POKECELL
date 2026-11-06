// Impresion desde el navegador (etiquetas 40x30 mm y factura/ticket 80 mm).
// La impresora la elige el usuario en el dialogo de impresion del navegador,
// asi funciona en cualquier computador donde este conectada la 4BARCODE.

(function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function barcodeSVG(code) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, String(code), { format: 'CODE128', width: 1.6, height: 40, displayValue: false, margin: 0 });
      svg.setAttribute('preserveAspectRatio', 'none');
      return svg.outerHTML;
    } catch (e) {
      return '';
    }
  }

  // Imprime un documento HTML en un iframe oculto y abre el dialogo de impresion.
  function printDocument(title, css, body) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`);
    doc.close();

    const cleanup = () => setTimeout(() => iframe.remove(), 1000);
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.addEventListener('afterprint', cleanup);
      iframe.contentWindow.print();
      setTimeout(cleanup, 60000);
    }, 250);
  }

  // items: [{ name, barcode, sale_price, quantity }]
  function printLabels(items) {
    const css = `
      @page { size: 40mm 30mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, Helvetica, sans-serif; color: #000; }
      .label { width: 40mm; height: 30mm; padding: 1.2mm 1.5mm; overflow: hidden;
               display: flex; flex-direction: column; align-items: center; justify-content: space-between;
               page-break-after: always; break-after: page; }
      .label:last-child { page-break-after: auto; break-after: auto; }
      .store { font-size: 6.5pt; font-weight: bold; letter-spacing: 0.5px; }
      .name { font-size: 6pt; text-align: center; line-height: 1.1; max-height: 2.3em; overflow: hidden; width: 100%; }
      .bc { width: 34mm; height: 9mm; }
      .bc svg { width: 100%; height: 100%; display: block; }
      .code { font-size: 5.5pt; }
      .price { font-size: 10pt; font-weight: bold; }
    `;
    let body = '';
    for (const it of items) {
      const svg = barcodeSVG(it.barcode);
      const one = `<div class="label">
          <div class="store">POKECELL</div>
          <div class="name">${esc(it.name)}</div>
          <div class="bc">${svg}</div>
          <div class="code">${esc(it.barcode)}</div>
          <div class="price">${money(it.sale_price)}</div>
        </div>`;
      const qty = Math.max(1, parseInt(it.quantity) || 1);
      for (let i = 0; i < qty; i++) body += one;
    }
    printDocument('Etiquetas', css, body);
  }

  // sale: respuesta de POST /api/sales (invoice_number, created_at, customer_name,
  // seller_name, payment_method, items[{product_name, quantity, unit_price, subtotal}],
  // subtotal, discount_percent, total)
  function printReceipt(sale) {
    const items = sale.items || [];
    // Alto aproximado del ticket para que la impresora no corte de mas ni de menos.
    const heightMm = Math.ceil(62 + items.length * 9 + (sale.discount_percent > 0 ? 5 : 0));
    const css = `
      @page { size: 80mm ${heightMm}mm; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 80mm; padding: 3mm 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; }
      .c { text-align: center; }
      .store { font-size: 15pt; font-weight: bold; }
      .sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
      .row { display: flex; justify-content: space-between; gap: 2mm; }
      .item { margin-bottom: 1.2mm; }
      .item .n { font-weight: bold; }
      .total { font-size: 14pt; font-weight: bold; }
      .muted { font-size: 8pt; }
    `;
    let rows = '';
    for (const it of items) {
      rows += `<div class="item"><div class="n">${esc(it.product_name)}</div>
        <div class="row"><span>${money(it.unit_price)} x${esc(it.quantity)}</span><span>${money(it.subtotal)}</span></div></div>`;
    }
    const disc = sale.discount_percent > 0
      ? `<div class="row"><span>Descuento (${esc(sale.discount_percent)}%)</span><span>-${money(sale.subtotal * sale.discount_percent / 100)}</span></div>`
      : '';
    const body = `
      <div class="c store">POKECELL</div>
      <div class="c muted">Accesorios</div>
      <div class="sep"></div>
      <div><b>${esc(sale.invoice_number)}</b></div>
      <div class="muted">Fecha: ${esc(sale.created_at)}</div>
      <div class="muted">Cliente: ${esc(sale.customer_name)}</div>
      <div class="muted">Vendedor: ${esc(sale.seller_name)}</div>
      <div class="muted">Pago: ${esc(sale.payment_method)}</div>
      <div class="sep"></div>
      ${rows}
      <div class="sep"></div>
      <div class="row"><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
      ${disc}
      <div class="row total"><span>TOTAL</span><span>${money(sale.total)}</span></div>
      <div class="sep"></div>
      <div class="c">Gracias por su compra!</div>
    `;
    printDocument('Factura ' + (sale.invoice_number || ''), css, body);
  }

  // Pregunta antes de cerrar la venta. Devuelve Promise<true|false> (imprimir o no)
  // o null si el usuario cancela (no se cierra la venta).
  function askPrintInvoice(total) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;';
      overlay.innerHTML = `
        <div style="background:#fff;color:#0f172a;border-radius:14px;max-width:380px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:inherit;">
          <h3 style="margin:0 0 6px;font-size:1.15rem;">Cerrar venta</h3>
          <p style="margin:0 0 18px;color:#475569;">Total: <b>${money(total)}</b><br>¿Desea imprimir la factura?</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button data-r="yes" style="flex:1;min-width:120px;padding:11px;border:0;border-radius:9px;background:#0d9488;color:#fff;font-weight:600;cursor:pointer;">Sí, imprimir</button>
            <button data-r="no" style="flex:1;min-width:120px;padding:11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font-weight:600;cursor:pointer;">No imprimir</button>
          </div>
          <button data-r="cancel" style="margin-top:10px;width:100%;padding:8px;border:0;background:none;color:#64748b;cursor:pointer;">Cancelar (seguir vendiendo)</button>
        </div>`;
      const done = (v) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(v); };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
      };
      overlay.addEventListener('click', (e) => {
        const r = e.target.getAttribute && e.target.getAttribute('data-r');
        if (r === 'yes') done(true);
        else if (r === 'no') done(false);
        else if (r === 'cancel' || e.target === overlay) done(null);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-r="yes"]').focus();
    });
  }

  window.PosPrint = { printLabels, printReceipt, askPrintInvoice };
})();
