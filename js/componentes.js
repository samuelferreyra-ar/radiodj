// 1) includeHtml que ejecuta callback tras insertar:
export async function includeHtml(id, file, callback) {
  const res = await fetch(file);
  const html = await res.text();
  const el = document.getElementById(id);
  el.innerHTML = html;

  // Opcional: si alguna vez quisieras ejecutar <script> internos, habría que reinyectarlos manualmente.
  // Aquí no lo necesitamos porque movemos la lógica al propio componentes.js.

  if (callback) callback();
}

// 2) Upgrade del link "Cuenta" según auth:
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

export function upgradeCuentaLink() {
  const link = document.getElementById("linkCuenta");
  if (!link) return;
  // por defecto ya es login.html desde header.html
  onAuthStateChanged(auth, (user) => {
    if (user) link.setAttribute("href", "cuenta.html");
  });
}

// 3) Al cargar el sitio, insertamos header/footer y luego hacemos el upgrade
window.addEventListener("DOMContentLoaded", () => {
  includeHtml("header", "header.html", upgradeCuentaLink);
  includeHtml("footer", "footer.html");
});

// ... después de setear innerHTML del header:
document.dispatchEvent(new CustomEvent("header:ready"));


// == Header mobile: hamburguesa + cierre fuera + ESC + coordinación con notifs ==

(() => {
  const host = document.getElementById('header');

  function initHeaderNav() {
    const navToggle = document.getElementById('navToggle');
    const navMenu   = document.getElementById('navMenu');
    const notifDrop = document.getElementById('notif-dropdown');

    if (!navToggle || !navMenu) return false;

    const open = () => {
      navMenu.dataset.open = "true";
      navToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      // cerrar notificaciones si estaban abiertas
      if (notifDrop && !notifDrop.hidden) notifDrop.hidden = true;
    };
    const close = () => {
      navMenu.dataset.open = "false";
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };
    const toggle = () => (navMenu.dataset.open === "true" ? close() : open());

    // evitar listeners duplicados
    navToggle.removeEventListener('click', toggle);
    navToggle.addEventListener('click', toggle);

    // cerrar al tocar un link
    navMenu.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) close();
    });

    // cerrar al tocar fuera
    document.addEventListener('click', (e) => {
      if (navMenu.dataset.open !== "true") return;
      const isInside = (host ? host.contains(e.target) : false);
      // si clickean fuera del header, cerrar
      if (!isInside) close();
    });

    // cerrar con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.dataset.open === "true") close();
    });

    return true;
  }

  // 1) intentar de una
  if (initHeaderNav()) return;

  // 2) si aún no están los nodos, observar hasta que aparezcan
  const mo = new MutationObserver(() => {
    if (document.getElementById('navToggle') && document.getElementById('navMenu')) {
      initHeaderNav();
      mo.disconnect();
    }
  });
  mo.observe(host || document.body, { childList: true, subtree: true });
})();

