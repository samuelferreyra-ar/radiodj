// /js/componentes.js
class SiteHeader extends HTMLElement {
  async connectedCallback() {
    try {
      const res = await fetch('/componentes/header.html', { cache: 'no-store' });
      const html = await res.text();
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      this.replaceWith(tpl.content.cloneNode(true));
    } catch (e) {
      console.error('No pude cargar header.html', e);
    }
  }
}

class SiteFooter extends HTMLElement {
  async connectedCallback() {
    try {
      const res = await fetch('/componentes/footer.html', { cache: 'no-store' });
      const html = await res.text();
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      // 👇 Reemplaza <site-footer> por el <footer> real
      this.replaceWith(tpl.content.cloneNode(true));
    } catch (e) {
      console.error('No pude cargar footer.html', e);
    }
  }
}

customElements.define('site-header', SiteHeader);
customElements.define('site-footer', SiteFooter);
