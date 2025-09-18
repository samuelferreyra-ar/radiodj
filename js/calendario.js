// js/calendario.js
import { db } from "./firebase.js";
import {
  collection, query, where, getDocs, getDoc, doc, documentId
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/** CONFIG */
const COLL_MAIN = "programacion";             // usa esta colección (sin tilde)
const COLL_ALT  = "programación";             // fallback si la tenés con tilde

/** DOM */
const grid  = document.getElementById("calGrid");
const title = document.getElementById("calTitle");
const btnPrev = document.getElementById("calPrev");
const btnNext = document.getElementById("calNext");
const modal    = document.getElementById("calModal");
const modalTit = document.getElementById("calModalTitle");
const modalBody= document.getElementById("calModalBody");
const modalClose = document.getElementById("calModalClose");

/** Estado */
let viewYear, viewMonth; // 0-11
const today = new Date();
const todayStr = fmtDateKey(today);
const cacheMonth = new Map(); // "YYYY-MM-DD" -> [programa,...]
let useAlt = false; // si debemos leer la colección con tilde

/** Utilidades */
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtDateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthNameES(m){
  return ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][m];
}

/** Render base */
function renderMonth(y,m){
  viewYear = y; viewMonth = m;
  title.textContent = `${monthNameES(m)} ${y}`;

  // Encabezado de días
  grid.innerHTML = "";
  ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].forEach(d=>{
    const el = document.createElement("div");
    el.className = "cal-wday";
    el.textContent = d;
    grid.appendChild(el);
  });

  // Primer día caja
  const first = new Date(y,m,1);
  const last  = new Date(y,m+1,0);
  const startWeekday = (first.getDay() + 6) % 7; // Lunes=0 … Domingo=6
  const daysInMonth = last.getDate();

  // Relleno prev
  for(let i=0;i<startWeekday;i++){
    const cell = document.createElement("div");
    cell.className = "cal-cell disabled";
    grid.appendChild(cell);
  }

  // Días del mes
  for(let d=1; d<=daysInMonth; d++){
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    const dateKey = `${y}-${pad2(m+1)}-${pad2(d)}`;
    cell.dataset.dateKey = dateKey;

    const num = document.createElement("div");
    num.className = "cal-daynum";
    num.textContent = d;
    cell.appendChild(num);

    // “hoy” resaltado
    if(dateKey === todayStr) cell.classList.add("cal-today");

    // puntito si hay programación (cuando la sepamos, lo marcamos)
    // si en cache ya tenemos ese día, poné dot:
    if(cacheMonth.has(dateKey)) {
      const dot = document.createElement("div");
      dot.className = "cal-dot";
      cell.appendChild(dot);
    }

    // click → abrir modal (y fetch si no está en cache)
    cell.addEventListener("click", ()=> openDay(dateKey));
    grid.appendChild(cell);
  }

  // Prefetch del mes (y colocar dots)
  prefetchMonth(y,m).then(markDotsForMonth);
}

function markDotsForMonth(){
  // colocar puntitos para los que tienen programas
  grid.querySelectorAll(".cal-cell").forEach(cell=>{
    const dk = cell.dataset.dateKey;
    if(!dk || cell.classList.contains("disabled")) return;
    if(cacheMonth.has(dk) && cacheMonth.get(dk).length){
      if(!cell.querySelector(".cal-dot")){
        const dot = document.createElement("div");
        dot.className = "cal-dot";
        cell.appendChild(dot);
      }
    }
  });
}

/** Prefetch del mes: usa rango de documentId */
async function prefetchMonth(y,m){
  cacheMonth.clear();
  const startKey = `${y}-${pad2(m+1)}-01`;
  const endKey   = `${y}-${pad2(m+1)}-31`; // seguro en orden lexicográfico

  // función helper que prueba COLL_MAIN y si falla, COLL_ALT
  async function getRange(collName){
    const q = query(
      collection(db, collName),
      where(documentId(), ">=", startKey),
      where(documentId(), "<=", endKey)
    );
    const snap = await getDocs(q);
    return snap;
  }

  let snap;
  try {
    snap = await getRange(COLL_MAIN);
  } catch (e) {
    // si la colección con tilde es la válida:
    snap = await getRange(COLL_ALT);
    useAlt = true;
  }

  snap.forEach(docu=>{
    const data = docu.data();
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    const programas = blocks
      .map(b => (b && typeof b.programa === "string") ? b.programa.trim() : "")
      .filter(Boolean);
    cacheMonth.set(docu.id, programas);
  });
}

/** Abrir un día: si no hay cache, leer doc puntual y mostrar */
async function openDay(dateKey){
  // si celda deshabilitada, salir
  const cell = grid.querySelector(`[data-date-key="${dateKey}"]`);
  if(cell && cell.classList.contains("disabled")) return;

  if(!cacheMonth.has(dateKey)){
    // leer doc puntual
    const dref = doc(db, useAlt ? COLL_ALT : COLL_MAIN, dateKey);
    const snap = await getDoc(dref);
    const programas = [];
    if(snap.exists()){
      const blocks = Array.isArray(snap.data().blocks) ? snap.data().blocks : [];
      blocks.forEach(b=>{
        if(b && typeof b.programa === "string"){
          const p = b.programa.trim();
          if(p) programas.push(p);
        }
      });
    }
    cacheMonth.set(dateKey, programas);
    // marca dot si corresponde
    if(programas.length && cell && !cell.querySelector(".cal-dot")){
      const dot = document.createElement("div");
      dot.className = "cal-dot";
      cell.appendChild(dot);
    }
  }

  const programas = cacheMonth.get(dateKey) || [];
  showModal(dateKey, programas);
}

/** Modal */
function showModal(dateKey, programas){
  const [y,m,d] = dateKey.split("-");
  modalTit.textContent = `Programación ${d}/${m}/${y}`;
  modalBody.innerHTML = "";

  if(!programas.length){
    const empty = document.createElement("div");
    empty.className = "prog-item prog-empty";
    empty.textContent = "No hay programación cargada para este día.";
    modalBody.appendChild(empty);
  } else {
    programas.forEach(p=>{
      const item = document.createElement("div");
      item.className = "prog-item";
      item.textContent = p;
      modalBody.appendChild(item);
    });
  }
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  modal.setAttribute("aria-hidden","true");
}
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e)=>{ if(e.target === modal) closeModal(); });

/** Navegación de mes */
btnPrev.addEventListener("click", ()=>{
  const d = new Date(viewYear, viewMonth-1, 1);
  renderMonth(d.getFullYear(), d.getMonth());
});
btnNext.addEventListener("click", ()=>{
  const d = new Date(viewYear, viewMonth+1, 1);
  renderMonth(d.getFullYear(), d.getMonth());
});

/** Init */
(function init(){
  const now = new Date();
  renderMonth(now.getFullYear(), now.getMonth());
})();