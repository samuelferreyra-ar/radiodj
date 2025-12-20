// js/notificaciones.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const LS_KEY_ADMIN = "notifLastSeenTs_admin";
const LS_KEY_USER  = "notifLastSeenTs_user";

let latestTs = 0;
let unsub = null;

// util
const esc = (s)=> (s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

initWhenHeaderReady();
document.addEventListener("header:ready", initNotifications, { once:true });

async function initWhenHeaderReady(){
  if (document.getElementById("btn-notifs") && document.getElementById("notif-dropdown")) {
    initNotifications();
    return;
  }
  const host = document.getElementById("header") || document.body;
  const mo = new MutationObserver(()=>{
    if (document.getElementById("btn-notifs") && document.getElementById("notif-dropdown")) {
      mo.disconnect();
      initNotifications();
    }
  });
  mo.observe(host, { childList:true, subtree:true });
}

function initNotifications(){
  const btn   = document.getElementById("btn-notifs");
  const drop  = document.getElementById("notif-dropdown");
  const list  = document.getElementById("notif-list");
  const badge = document.getElementById("notif-badge");
  if (!btn || !drop || !list || !badge) return;

  if (btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";

  // UI toggle
  document.addEventListener("click", (e) => {
    if (e.target === btn || btn.contains(e.target)) {
      const willShow = drop.hidden;
      drop.hidden = !willShow;

      if (willShow) {
        const key = btn.dataset.mode === "admin" ? LS_KEY_ADMIN : LS_KEY_USER;
        localStorage.setItem(key, String(latestTs > 0 ? latestTs : Date.now()));
        badge.hidden = true;
      }
      return;
    }
    if (!drop.hidden && !drop.contains(e.target)) drop.hidden = true;
  });

  onAuthStateChanged(auth, async (user) => {
    if (unsub) { unsub(); unsub = null; }
    latestTs = 0;

    if (!user) { hideUI(); return; }

    // rol
    let role = "espectador";
    try {
      const usnap = await getDoc(doc(db, "users", user.uid));
      role = usnap.exists() ? (usnap.data().role || "espectador") : "espectador";
    } catch (e) {
      console.warn("[notifs] No se pudo leer users/{uid}", e);
    }

    const isAdmin = (role === "admin");
    btn.hidden = false;
    btn.dataset.mode = isAdmin ? "admin" : "user";

    unsub = isAdmin
      ? subscribeAdmin({ list, badge })
      : subscribeUser({ uid: user.uid, list, badge });
  });

  function hideUI(){
    btn.hidden = true;
    drop.hidden = true;
    badge.hidden = true;
  }
}

/* =========================
   ADMIN (igual que antes)
========================= */
function subscribeAdmin({ list, badge }){
  const qref = query(
    collection(db, "reclamos"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  return onSnapshot(qref, (snap) => {
    const abiertos = [];
    snap.forEach(d => {
      const x = d.data();
      const estado = (x.estado || "Recibido").trim();
      if (estado !== "Resuelto") {
        const ts = getTsForAdmin(x);
        abiertos.push({ id: d.id, estado, ts });
      }
    });

    renderListAdmin(list, abiertos.slice(0, 5));

    latestTs = Math.max(0, ...abiertos.map(i => i.ts || 0));
    const lastSeen = parseInt(localStorage.getItem(LS_KEY_ADMIN) || "0", 10);
    badge.hidden = !(latestTs > (isNaN(lastSeen) ? 0 : lastSeen));
  }, (err) => console.error("[notifs] onSnapshot reclamos(admin):", err));
}

function renderListAdmin(listEl, items){
  if (!items.length) {
    listEl.innerHTML = `<div class="notif-item"><div class="notif-meta">Sin casos abiertos</div></div>`;
    return;
  }
  listEl.innerHTML = items.map(c => `
    <a class="notif-item" href="cuenta.html?case=${encodeURIComponent(c.id)}#panel-soporte">
      <div class="notif-title">
        Nuevo caso de soporte <span class="notif-meta">#${esc(c.id.slice(0,6))}</span>
      </div>
    </a>
  `).join("");
}

function getTsForAdmin(x){
  // el admin “vive” con createdAt, porque su notificación es “hay casos abiertos”
  const cand = x.createdAt;
  const ms = cand?.toMillis?.() ?? (cand?.seconds ? cand.seconds * 1000 : null);
  return ms ?? Date.now();
}

/* =========================
   USER: reporterUid + estados
========================= */
function subscribeUser({ uid, list, badge }){
  const qref = query(
    collection(db, "reclamos"),
    where("reporterUid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  return onSnapshot(qref, (snap) => {
    const notifs = [];

    snap.forEach(d => {
      const x = d.data();
      const estado = (x.estado || "Recibido").trim();

      if (estado === "En proceso" || estado === "Resuelto") {
        // clave: cuando cambió el estado (si existe), si no, fallback
        const ts = getTsForUser(x);
        notifs.push({ id: d.id, estado, ts });
      }
    });

    notifs.sort((a,b) => (b.ts||0) - (a.ts||0));
    renderListUser(list, notifs.slice(0, 5));

    latestTs = Math.max(0, ...notifs.map(i => i.ts || 0));
    const lastSeen = parseInt(localStorage.getItem(LS_KEY_USER) || "0", 10);
    badge.hidden = !(latestTs > (isNaN(lastSeen) ? 0 : lastSeen));
  }, (err) => console.error("[notifs] onSnapshot reclamos(user):", err));
}

function renderListUser(listEl, items){
  if (!items.length) {
    listEl.innerHTML = `<div class="notif-item"><div class="notif-meta">Sin notificaciones</div></div>`;
    return;
  }

  listEl.innerHTML = items.map(c => {
    const label = (c.estado === "Resuelto")
      ? "Tu caso fue resuelto"
      : "Tu caso está en proceso";

    // NOTA: el usuario NO tiene tab de soporte, pero el anchor no molesta.
    // Si querés, más abajo te digo cómo abrir una “vista de caso” para usuario.
    return `
      <a class="notif-item" href="cuenta.html?case=${encodeURIComponent(c.id)}#panel-soporte">
        <div class="notif-title">
          ${esc(label)} <span class="notif-meta">#${esc(c.id.slice(0,6))}</span>
        </div>
      </a>
    `;
  }).join("");
}

function getTsForUser(x){
  // este es el campo nuevo que agregamos al cambiar estado:
  const cand = x.estadoUpdatedAt || x.updatedAt || x.createdAt;
  const ms = cand?.toMillis?.() ?? (cand?.seconds ? cand.seconds * 1000 : null);
  return ms ?? Date.now();
}