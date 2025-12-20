// js/noticias-publicas.js
import { db } from "./firebase.js";
import { collection, query, where, orderBy, limit, getDocs } 
  from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

function esc(s){
  return (s || "").toString().replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function catLabel(cat){
  if (cat === "local") return "Local";
  if (cat === "internacional") return "Internacional";
  if (cat === "musica") return "Música";
  return "Nota";
}

function catBadgeClass(cat){
  if (cat === "local") return "local";
  if (cat === "internacional") return "internacional";
  if (cat === "musica") return "musica";
  return "local";
}

function imgUrlOrDefault(url){
  const u = (url || "").toString().trim();
  // si está vacío -> default
  return u ? u : "404.png";
}

/**
 * Obtiene notas publicadas.
 * opts:
 *  - categoria?: "local"|"internacional"|"musica"
 *  - take?: number
 */
export async function fetchNotasPublicas(opts = {}){
  const clauses = [
    where("estado", "==", "publicada"),
    orderBy("updatedAt", "desc"),
  ];
  if (opts.categoria) clauses.unshift(where("categoria", "==", opts.categoria));
  if (opts.take) clauses.push(limit(opts.take));

  const qref = query(collection(db, "notas"), ...clauses);
  const snap = await getDocs(qref);

  const out = [];
  snap.forEach(d => out.push({ id: d.id, ...d.data() }));
  return out;
}

/**
 * Render EXACTO del formato de INDEX (sin badge ni comentarios)
 * Mantiene <article class="card"> ... <div class="thumb"> ...
 * pero ahora adentro va un <img> con fallback a 404.png
 */
export function renderCardIndex(n){
  const titulo = esc(n.titulo || "");
  const resumen = esc(n.resumen || "");
  const img = esc(imgUrlOrDefault(n.imagenUrl));

  return `
    <article class="card">
      <div class="thumb">
        <img
          src="${img}"
          alt="${titulo}"
          loading="lazy"
          onerror="this.onerror=null;this.src='404.png';"
          style="width:100%;height:160px;object-fit:cover;display:block;"
        >
      </div>
      <div class="card-body">
        <h3>${titulo}</h3>
        <p>${resumen}</p>
      </div>
    </article>
  `;
}

/**
 * Render EXACTO del formato de NOTICIAS (con badge y “Leer Más”)
 * Mantiene <div class="thumb"></div> pero ahora es un contenedor del <img>.
 */
export function renderCardNoticias(n){
  const cat = (n.categoria || "local").toString();
  const titulo = esc(n.titulo || "");
  const resumen = esc(n.resumen || "");
  const img = esc(imgUrlOrDefault(n.imagenUrl));

  const badge = catLabel(cat);
  const badgeCls = catBadgeClass(cat);

  return `
    <article class="card" data-category="${esc(cat)}" data-id="${esc(n.id)}">
      <div class="thumb">
        <img
          src="${img}"
          alt="${titulo}"
          loading="lazy"
          onerror="this.onerror=null;this.src='404.png';"
          style="width:100%;height:160px;object-fit:cover;display:block;"
        >
      </div>
      <div class="card-body">
        <span class="badge ${badgeCls}">${badge}</span>
        <h3>${titulo}</h3>
        <p>${resumen}</p>
        <span class="read-more" data-act="leer" data-id="${esc(n.id)}">Leer Más</span>
      </div>
    </article>
  `;
}