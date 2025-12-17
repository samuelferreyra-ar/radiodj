// js/cuenta-panels.js
// Gestión de pestañas de cuenta, roles y paneles (Datos, Programación, Usuarios, Notas, Soporte)

import { app, auth, db, observeAuth } from "./firebase.js";
import {
  updateProfile, updateEmail, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, deleteUser, signOut
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc, deleteDoc,
  getDocs, query, where, orderBy, serverTimestamp, Timestamp, onSnapshot, limit
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ---------- Utilidades generales ----------
const $  = (sel)=>document.querySelector(sel);
const $$ = (sel)=>document.querySelectorAll(sel);

const todayStr = ()=> new Date().toISOString().slice(0,10);
const toTS     = (d)=> Timestamp.fromDate(new Date(d+"T00:00:00"));

function toast(msg){ alert(msg); }

// ID de caso desde URL (si viene de notificación)
let pendingCaseId = new URLSearchParams(location.search).get('case') || null;

// Estado global mínimo
let currentUser   = null;
let currentRole   = "espectador";
let currentNoteId = null;
// guardo un label de usuario para reutilizar en Notas
let currentUsernameLabel = "";

// ---------- Tabs según rol ----------
function setTabs(role){
  const tProg     = $("#tab-programacion");
  const tUsers    = $("#tab-usuarios");
  const tNotas    = $("#tab-notas");
  const tSoporte  = $("#tab-soporte");
  const tMetricas = $("#tab-metricas");

  if (tProg)     tProg.hidden     = true;
  if (tUsers)    tUsers.hidden    = true;
  if (tNotas)    tNotas.hidden    = true;
  if (tSoporte)  tSoporte.hidden  = true;
  if (tMetricas) tMetricas.hidden = true;

  if (role === "admin") {
    if (tProg)     tProg.hidden     = false;
    if (tUsers)    tUsers.hidden    = false;
    if (tSoporte)  tSoporte.hidden  = false;
    if (tMetricas) tMetricas.hidden = false;
    if (tNotas) tNotas.hidden = false;
  }
  if (role === "periodista") {
    if (tNotas) tNotas.hidden = false;
  }
  if (role === "soporte") {
    if (tSoporte) tSoporte.hidden = false;
  }

  const delBox = $("#deleteBox");
  if (delBox) delBox.style.display = (role === "espectador") ? "block" : "none";
}

function initTabs(){
  $$(".tab-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      $$(".tab-btn").forEach(b=>b.setAttribute("aria-selected","false"));
      btn.setAttribute("aria-selected","true");
      const id = btn.getAttribute("aria-controls");
      $$(".panel").forEach(p=>p.classList.remove("active"));
      $("#"+id).classList.add("active");
    });
  });
}

// ---------- Arranque / sesión ----------
observeAuth(async (user)=>{
  if(!user){ window.location.href = "login.html"; return; }
  currentUser = user;

  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);
  const udata = usnap.data() || {};

  const whoAlias = udata.username
    ? `@${udata.username}`
    : (user.email ? user.email.split("@")[0] : "usuario");

  $("#whoami").textContent = `${whoAlias} · ${user.email}`;

  if(!usnap.exists()){
    const autoUser = (user.email ? user.email.split("@")[0] : "usuario")
      .toLowerCase().replace(/[^\w]+/g,"").slice(0,20);
    await setDoc(uref, {
      uid: user.uid,
      email: user.email || "",
      username: autoUser,
      role: "espectador",
      createdAt: serverTimestamp()
    });
    currentRole = "espectador";
    currentUsernameLabel = `@${autoUser}`;
  } else {
    currentRole = udata.role || "espectador";
    currentUsernameLabel = udata.username ? `@${udata.username}` :
      (currentUser.email ? currentUser.email.split("@")[0] : "periodista");
  }

  // Datos iniciales
  const inpUsername = $("#inpUsername");
  if (inpUsername) inpUsername.value = (udata.username||"");

  // Tabs
  setTabs(currentRole);
  initTabs();

  // Si venimos de notificación, abrir soporte
  if ((location.hash === '#panel-soporte' || pendingCaseId) && (currentRole === 'admin' || currentRole === 'soporte')) {
    const tabSoporte = $("#tab-soporte");
    const panelSoporte = $("#panel-soporte");
    if (tabSoporte && panelSoporte && !panelSoporte.classList.contains('active')) {
      tabSoporte.click();
    }
  }

  // Inits por rol
if (currentRole === "admin") {
  initProgramacion();
  initGestionUsuarios();
  initMetricasPanel();   // ← NUEVO
}
if (currentRole === "periodista" || currentRole === "admin") {
  initNotas();
}
if (currentRole === "soporte" || currentRole === "admin") {
  initSoporte();
}

});

// ---------- DATOS (perfil) ----------
$("#btnSaveUsername")?.addEventListener("click", async ()=>{
  const username = $("#inpUsername").value.trim().toLowerCase().replace(/[^\w]+/g,"").slice(0,20);
  if (!username) return toast("Usuario inválido");
  await updateDoc(doc(db,"users",currentUser.uid), { username });
  toast("Usuario actualizado");
});

$("#btnChangeEmail")?.addEventListener("click", async ()=>{
  const newEmail = $("#inpNewEmail").value.trim();
  const pass = $("#inpCurrentPassForEmail").value;
  if(!newEmail || !pass) return toast("Completá nuevo email y tu contraseña");
  try{
    const cred = EmailAuthProvider.credential(currentUser.email, pass);
    await reauthenticateWithCredential(currentUser, cred);
    await updateEmail(currentUser, newEmail);
    await updateDoc(doc(db,"users",currentUser.uid), { email:newEmail });
    toast("Email actualizado");
  }catch(err){ toast(err.message || "No se pudo actualizar el email"); }
});

$("#btnChangePass")?.addEventListener("click", async ()=>{
  const oldp = $("#inpCurrentPass").value;
  const newp = $("#inpNewPass").value;
  if(!oldp || !newp) return toast("Completá ambas contraseñas");
  try{
    const cred = EmailAuthProvider.credential(currentUser.email, oldp);
    await reauthenticateWithCredential(currentUser, cred);
    await updatePassword(currentUser, newp);
    toast("Contraseña actualizada");
  }catch(err){ toast(err.message || "No se pudo actualizar la contraseña"); }
});

$("#btnDeleteAccount")?.addEventListener("click", async ()=>{
  const pass = $("#inpDeletePass").value;
  if(!pass) return toast("Confirmá tu contraseña");
  if(!confirm("¿Seguro que querés eliminar tu cuenta?")) return;
  try{
    const cred = EmailAuthProvider.credential(currentUser.email, pass);
    await reauthenticateWithCredential(currentUser, cred);
    await deleteDoc(doc(db,"users",currentUser.uid));
    await deleteUser(currentUser);
    alert("Cuenta eliminada. ¡Hasta pronto!");
    window.location.href = "index.html";
  }catch(err){ toast(err.message || "No se pudo eliminar la cuenta"); }
});

/*

---------- PROGRAMACIÓN (admin) ----------

*/

// Función maestra 1

function initProgramacion(){
  const inpDate = $("#progDate");                                               //Seleccionamos el input de fecha
  if (!inpDate) return;                                                         //Si no existiera (ej usuario no admin) detenemos la función
  inpDate.value = todayStr();                                                   //Inicializamos con la fecha de hoy
  loadDayProg(inpDate.value).catch(err=>{                                       //Cargamos la programación del día pasando el día de hoy
    console.error(err); toast("No se pudo cargar la programación inicial");     //Si algo falla tenemos un error codificado
  });
  inpDate.addEventListener("change", ()=>{                                      //Colocamos un listener para cambios en el input de fecha, cuando
    const d = inpDate.value || todayStr();                                      //se cambia la fecha, se toma la nueva fecha y se llama a loadDayProg
    loadDayProg(d).catch(err=>{
      console.error(err);
      toast("No se pudo cargar la programación de ese día");
    });
  });
  $("#btnSaveProg")?.addEventListener("click", async ()=>{                      //Agregamos un listener al botón de guardado para que tome la fecha seleccionada
    const d = (inpDate.value || todayStr());                                    //llame a saveDayProg para validar y guardar la programacion en la BD
    try{
      await saveDayProg(d);
    }catch(err){
      console.error(err);
      toast("No se pudo guardar la programación");                              //Si algo fallara, mostramos un toast
    }
  });
}

// ---------- MÉTRICAS DE CHAT (solo admin) ----------
let metricasInitialized = false;

async function fetchChatMessagesForDate(dateStr) {
  // dateStr formato YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
  if (!y || !m || !d) throw new Error("Fecha inválida");

  const start = new Date(y, m - 1, d, 0, 0, 0);
  const end   = new Date(y, m - 1, d + 1, 0, 0, 0);

  const colChat = collection(db, "chat");
  const qRef = query(
    colChat,
    where("createdAt", ">=", Timestamp.fromDate(start)),
    where("createdAt", "<", Timestamp.fromDate(end)),
    orderBy("createdAt", "asc")
  );

  const snap = await getDocs(qRef);
  const rows = [];
  snap.forEach(docu => {
    rows.push({ id: docu.id, ...docu.data() });
  });
  return rows;
}

async function fetchProgramBlocksForDate(dateStr) {
  const ref = doc(db, "programacion", dateStr);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];
  const data = snap.data();
  return Array.isArray(data.blocks) ? data.blocks : [];
}


function buildQuarterHourSlotsForDay(dateStr, messages, programBlocks) {
  const base = new Date(dateStr + "T00:00:00");

  const slots = [];
  const SLOT_MINUTES = 15;
  const TOTAL_SLOTS = 24 * 60 / SLOT_MINUTES; // 96 bloques

  // Pre-procesamos la programación: rangos en minutos
  const programRanges = (programBlocks || [])
    .map(b => {
      const s = parseHHMM(b.start);
      const e = parseHHMM(b.end);
      if (s == null || e == null || e <= s) return null;
      return {
        start: s,
        end: e, // usaremos [start, end) en minutos
        programa: (b.programa || "").toString()
      };
    })
    .filter(Boolean);

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    const startMinutes = i * SLOT_MINUTES;
    const endMinutes   = startMinutes + SLOT_MINUTES - 1;

    const h1 = String(Math.floor(startMinutes / 60)).padStart(2, "0");
    const m1 = String(startMinutes % 60).padStart(2, "0");

    const h2 = String(Math.floor(endMinutes / 60)).padStart(2, "0");
    const m2 = String(endMinutes % 60).padStart(2, "0");

    // Buscar qué programa corresponde a ESTE bloque
    let programaLabel = "";
    for (const p of programRanges) {
      // tratamos el rango como [start, end)
      if (startMinutes >= p.start && startMinutes < p.end) {
        programaLabel = p.programa;
        break;
      }
    }

    slots.push({
      index: i,
      label: `${h1}:${m1} - ${h2}:${m2}`,
      messages: 0,
      usersSet: new Set(),
      programa: programaLabel
    });
  }

  const allUsersDay = new Set();
  let totalMessages = 0;

  for (const msg of messages) {
    const ts = msg.createdAt;
    if (!ts || !ts.toDate) continue;
    const d = ts.toDate();

    if (
      d.getFullYear() !== base.getFullYear() ||
      d.getMonth()    !== base.getMonth() ||
      d.getDate()     !== base.getDate()
    ) {
      continue;
    }

    const minutes = d.getHours() * 60 + d.getMinutes();
    const slotIndex = Math.floor(minutes / SLOT_MINUTES);
    if (slotIndex < 0 || slotIndex >= TOTAL_SLOTS) continue;

    const s = slots[slotIndex];
    s.messages++;
    totalMessages++;

    const userId = msg.uid || msg.username || msg.email || "desconocido";
    s.usersSet.add(userId);
    allUsersDay.add(userId);
  }

  slots.forEach(s => {
    s.usersCount = s.usersSet.size;
    delete s.usersSet;
  });

  return {
    slots,
    totalMessages,
    totalUsers: allUsersDay.size
  };
}


// ---- Export a Excel (xlsx) ----
function exportMetricsToXLSX(rows, filename, sheetName) {
  if (typeof XLSX === "undefined") {
    alert("No está cargada la librería XLSX (SheetJS).");
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Metricas");
  XLSX.writeFile(wb, filename);
}

// ---- Export a PDF ----
async function exportMetricsToPDF(slots, totalValue, filename, title, valueKey, valueLabel, dateStr) {
  // Buscar jsPDF en sus variantes
  let JsPDFCtor = null;
  if (window.jspdf && window.jspdf.jsPDF) {
    JsPDFCtor = window.jspdf.jsPDF;
  } else if (window.jsPDF) {
    JsPDFCtor = window.jsPDF;
  }

  if (!JsPDFCtor) {
    console.error("jsPDF no encontrado. window.jspdf:", window.jspdf, "window.jsPDF:", window.jsPDF);
    alert("No está cargada la librería jsPDF.");
    return;
  }

  const doc = new JsPDFCtor("p", "mm", "a4");

  // Título y resumen
  doc.setFontSize(14);
  doc.text(title, 10, 10);
  doc.setFontSize(10);
  doc.text(`Fecha: ${dateStr}`, 10, 16);
  doc.text(`Total ${valueLabel.toLowerCase()} del día: ${totalValue}`, 10, 22);

  // Configuración de tabla
  const startY = 30;
  const rowHeight = 6;

  const colBloqueWidth = 40;
  const colValueWidth  = 30;
  const colProgWidth   = 120;

  const tableX = 10;
  const tableWidth = colBloqueWidth + colValueWidth + colProgWidth;

  let y = startY;

  function drawHeader() {
    doc.setFont(undefined, "bold");
    // Recuadro header
    doc.rect(tableX, y, tableWidth, rowHeight);

    doc.text("Bloque", tableX + 2, y + 4);
    doc.text(valueLabel, tableX + colBloqueWidth + 2, y + 4);
    doc.text("Programa", tableX + colBloqueWidth + colValueWidth + 2, y + 4);

    doc.setFont(undefined, "normal");
    y += rowHeight;
  }

  drawHeader();

  for (const s of slots) {
    if (y + rowHeight > 280) {
      // Nueva página si se pasa
      doc.addPage();
      y = 20;
      drawHeader();
    }

    // Recuadro de la fila completa
    doc.rect(tableX, y, tableWidth, rowHeight);

    const programa = (s.programa || "").toString();

    doc.text(s.label, tableX + 2, y + 4);
    doc.text(String(s[valueKey]), tableX + colBloqueWidth + 2, y + 4);

    // Programa (recortado si es demasiado largo)
    const progText = programa.length > 50 ? programa.slice(0, 47) + "..." : programa;
    doc.text(progText, tableX + colBloqueWidth + colValueWidth + 2, y + 4);

    y += rowHeight;
  }

  doc.save(filename);
}

function initMetricasPanel() {
  if (metricasInitialized) return;
  metricasInitialized = true;

  const dateInput = $("#metricasDate");
  const btnMsgXLSX  = $("#btnMetricasMsgXLSX");
  const btnMsgPDF   = $("#btnMetricasMsgPDF");
  const btnUsrXLSX  = $("#btnMetricasUsersXLSX");
  const btnUsrPDF   = $("#btnMetricasUsersPDF");

  if (!dateInput) return; // por si el HTML no está

  // por defecto, hoy
  if (!dateInput.value) {
    dateInput.value = todayStr();
  }

  async function buildMetrics(dateStr) {
  const [mensajes, programBlocks] = await Promise.all([
    fetchChatMessagesForDate(dateStr),
    fetchProgramBlocksForDate(dateStr)
  ]);

  return buildQuarterHourSlotsForDay(dateStr, mensajes, programBlocks);
}

  btnMsgXLSX?.addEventListener("click", async () => {
    const dateStr = dateInput.value;
    if (!dateStr) return toast("Elegí una fecha para generar métricas.");
    try {
      const { slots, totalMessages } = await buildMetrics(dateStr);
      const rows = slots.map(s => ({
        bloque: s.label,
        mensajes: s.messages,
        programa: s.programa || ""
      }));
      rows.push({
        bloque: "TOTAL DÍA",
        mensajes: totalMessages,
        programa: ""
      });
      exportMetricsToXLSX(
        rows,
        `metricas_mensajes_${dateStr}.xlsx`,
        `Mensajes_${dateStr}`
      );

    } catch (e) {
      console.error(e);
      toast("No se pudieron obtener las métricas de mensajes.");
    }
  });

  btnMsgPDF?.addEventListener("click", async () => {
  const dateStr = metricasDate.value;
  if (!dateStr) return toast("Elegí una fecha para generar métricas.");

  try {
    const { slots, totalMessages } = await buildMetrics(dateStr);
    await exportMetricsToPDF(
      slots,
      totalMessages,
      `metricas_mensajes_${dateStr}.pdf`,
      `Métricas de MENSAJES`,
      "messages",
      "Mensajes",
      dateStr
    );
  } catch (e) {
    console.error(e);
    toast("No se pudieron obtener las métricas de mensajes.");
  }
});


  btnUsrXLSX?.addEventListener("click", async () => {
    const dateStr = dateInput.value;
    if (!dateStr) return toast("Elegí una fecha para generar métricas.");
    try {
      const { slots, totalUsers } = await buildMetrics(dateStr);
      const rows = slots.map(s => ({
        bloque: s.label,
        usuariosUnicos: s.usersCount,
        programa: s.programa || ""
      }));
      rows.push({
        bloque: "TOTAL DÍA",
        usuariosUnicos: totalUsers,
        programa: ""
      });
      exportMetricsToXLSX(
        rows,
        `metricas_usuarios_${dateStr}.xlsx`,
        `Usuarios_${dateStr}`
      );

    } catch (e) {
      console.error(e);
      toast("No se pudieron obtener las métricas de usuarios.");
    }
  });

  btnUsrPDF?.addEventListener("click", async () => {
  const dateStr = metricasDate.value;
  if (!dateStr) return toast("Elegí una fecha para generar métricas.");

  try {
    const { slots, totalUsers } = await buildMetrics(dateStr);
    await exportMetricsToPDF(
      slots,
      totalUsers,
      `metricas_usuarios_${dateStr}.pdf`,
      `Métricas de USUARIOS ÚNICOS`,
      "usersCount",
      "Usuarios únicos",
      dateStr
    );
  } catch (e) {
    console.error(e);
    toast("No se pudieron obtener las métricas de usuarios.");
  }
});

}

// Función para cargar la programación correspondiente a un día específico desde la BD

async function loadDayProg(dStr){                                     //Recibe una fecha como parámetro
  const ref = doc(db,"programacion", dStr);                           //Referencia al documento de la BD
  const snap = await getDoc(ref);                                     //Obtenemos el documento asíncronamente
  if(snap.exists()){                                                  //Verificamos la existencia del documento
    const data = snap.data();                                         //Si existe, obtenemos los bloques de programación del día
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    renderProgRowsFromBlocks(blocks);
  } else {
    renderProgRowsFromBlocks([]);                                     //Sino, creamos una tabla vacía
  }
}

// Función de guardado

async function saveDayProg(dStr){                                     //Recibimos una fecha
  const rowsWithRefs = getAllRowsDataWithRefs();                      //Leemos todas las filas de la tabla
  const v = validateNoOverlap(rowsWithRefs);                          //Validamos con función que no se solapen horarios
  if(!v.ok){                                                          //Si ok es falso mandamos toast y marcamos en rojo
    toast("Revisá las horas: hay rangos inválidos o solapados");
    throw new Error("Overlapping or invalid time ranges");
  }
  const blocks = rowsWithRefs.map(r => r.data);                       //Preparamos los datos convirtiendo un array de tr y data en un array con solo los datos
  await setDoc(doc(db,"programacion", dStr), {                        //Guardamos en la BD
    blocks,
    updatedAt: serverTimestamp(),
    updatedBy: currentUser.uid
  });
  toast("Programación guardada");                                     //Enviamos un mensaje de confirmación
}

// Parsear horarios para facilitar identificación

function parseHHMM(s){
  if(!s || !/^\d{2}:\d{2}$/.test(s)) return null;       //Comprueba si el valor es válido y si tiene formato HH:MM /los d{} comprueban el formato de dos dígitos
  const [hh, mm] = s.split(":").map(Number);            //Dividimos el texto en horas y minutos "08:30" → [8, 30], convertidos a numeros
  if (hh<0 || hh>23 || mm<0 || mm>59) return null;      //Verifica que los valores estén en rango válido de horas del día
  return hh*60 + mm;                                    //Convierte la hora a minutos totales desde la medianoche (con fines de comparación)
}

// Validación de solapamiento para manejo de flags

function validateNoOverlap(rowsWithRefs){
  // rowsWithRefs: [{tr, data:{start,end,programa,...}}] sin filas vacías
  const enriched = rowsWithRefs.map((r,i)=>{                                //Recibe los datos de las filas
    const s = parseHHMM(r.data.start);                                      //Convierte las horas a minutos
    const e = parseHHMM(r.data.end);
    return { idx:i, tr:r.tr, data:r.data, s, e };
  });

  rowsWithRefs.forEach(r => r.tr.classList.remove("row-invalid"));          //Borra el estilo rojo antes de volver a validar, para no acumular errores viejos

  const errors = [];                                                        
  enriched.forEach(r=>{
    if(r.s===null || r.e===null){                                           //Chequea errores individuales
      errors.push({idx:r.idx, reason:"Hora inválida"});                     //Horas válidad (parseHHMM no devolvió null)
    } else if (r.s >= r.e){                                                 //Hora de inicio menor que la de fin
      errors.push({idx:r.idx, reason:"Inicio debe ser menor que Fin"});
    }
  });

  if(errors.length){                                                        //Si hay errores de hora, detener
    errors.forEach(err=>{
      const tr = enriched[err.idx].tr;
      tr.classList.add("row-invalid");
      tr.title = err.reason;
    });
    return { ok:false, errors };                                            //Si alguna fila falla la verificación básica, se devuelven banderas de error
  }

  const sorted = [...enriched].sort((a,b)=> a.s - b.s || a.e - b.e);        //Ordena los bloques por hora
  for(let i=1;i<sorted.length;i++){                                         //Revisamos los solapamientos recorriendo la lista en orden
    const prev = sorted[i-1];
    const curr = sorted[i];
    if (curr.s < prev.e){                                                   //Si el inicio de un bloque es menor que le fin del anterior, significa superposición
      prev.tr.classList.add("row-invalid");
      curr.tr.classList.add("row-invalid");
      prev.tr.title = "Solapa con otro bloque";
      curr.tr.title = "Solapa con otro bloque";
      return { ok:false, errors:[{idx:prev.idx, reason:"Overlap"},{idx:curr.idx, reason:"Overlap"}] };
    }
  }
  return { ok:true };                                                       //Si no hay errores, no hay flags
}

// Crear bloque vacío

function buildEmptyBlock(){
  return { start:"", end:"", programa:"", conductor:"", invitados:"" };
}

// Validar si la fila está vacía

function rowIsEmpty(block){
  return !(block.start || block.end || block.programa || block.conductor || block.invitados);
}

// Traer la info de la fila

function grabRowData(tr){
  const g = (k)=> tr.querySelector(`[data-k="${k}"]`).value.trim();
  return { start:g("start"), end:g("end"), programa:g("programa"), conductor:g("conductor"), invitados:g("invitados") };
}

// Función aux que crea una fila (tr) de manera dinámica con los inputs, íconos y eventos (para borrar o aggregar nuevas filas)

function makeRow(block){                                                                                            //Lo que recibe es un objeto con todos los datos de UN programa
  const tr = document.createElement("tr");                                                                          //Creamos un elemento de fila
  tr.innerHTML = `
    <td><input type="time" value="${block.start||""}" data-k="start"></td>
    <td><input type="time" value="${block.end||""}" data-k="end"></td>
    <td><input type="text" value="${block.programa||""}" placeholder="Nombre del programa" data-k="programa"></td>
    <td><input type="text" value="${block.conductor||""}" placeholder="Conductor" data-k="conductor"></td>
    <td><input type="text" value="${block.invitados||""}" placeholder="Invitados" data-k="invitados"></td>
    <td style="text-align:center;">
      <i class="bi bi-x-circle-fill" style="color:#d83c40; font-size:1.2rem; cursor:pointer;" data-act="delRow" title="Eliminar fila"></i>
    </td>
  `;                                                                                                              //Insertamos el HTML de la fila
  tr.querySelector('[data-act="delRow"]').addEventListener("click", ()=>{                                         //Agregamos el botón para eliminar la fila (delRow es el codigo del icono X)
    tr.remove();        
    ensureHasTrailingEmptyRow();                                                                                  
  });
  tr.querySelectorAll("input").forEach(inp=>{                                                                     //Agrega eventos para los inputs          
    inp.addEventListener("input", ()=> ensureHasTrailingEmptyRow());
  });
  return tr;                                                                                                      //Devolvemos la fila lista para usar
}

// Función que arma filas desde bloques de programación

function renderProgRowsFromBlocks(blocksArr){               //Recibe un array de programas y crea una fila en la tabla por cada uno, más la fila extra
  const cont = $("#progRows");                              //Busca tbody, donde se deben agregar las filas
  cont.innerHTML = "";                                      //Borramos cualquier fila existente (por si cambiamos de fecha)
  blocksArr.forEach(b=> cont.appendChild(makeRow(b)));      //Por cada programa b, se llama a makeRow para que construya una fila, y se la añade al tbody
  cont.appendChild(makeRow(buildEmptyBlock()));             //Se agrega una fila vacía para agregar un programa nuevo
}

// Función para convertir lo que el usuario escriba en datos listos para la BD

function getAllRowsDataWithRefs(){
  const cont = $("#progRows");                              //Seleccionamos el contenedor de las filas
  const rows = Array.from(cont.children);                   //Obtenemos todas las filas
  const out = [];           
  rows.forEach(tr=>{                                        //Extraemos los datos de cada fila iterando
    const data = grabRowData(tr);
    if(!rowIsEmpty(data)) out.push({ tr, data });           //Si la fila no está vacía la agrega al array out
  });
  return out;
}

// Función auxiliar para asegurarse de que siempre haya una fila vacía al final de la tabla

function ensureHasTrailingEmptyRow(){
  const cont = $("#progRows");                                                      //Seleccionamos al contenedor de filas
  const trs = Array.from(cont.children);                                            //Convertimos las filas en un array
  if(trs.length===0){ cont.appendChild(makeRow(buildEmptyBlock())); return; }       //Consideramos el caso especial de una tabla vacía, creamos una fila vacía y la agregamos al tbody
  const last = trs[trs.length-1];                                                   //Si hay filas, tomamos la última
  const lastData = grabRowData(last);
  if(!rowIsEmpty(lastData)) cont.appendChild(makeRow(buildEmptyBlock()));           //Verificamos si la última fila está vacía
}


// ---------- GESTIÓN DE USUARIOS (admin) ----------


function formatDate(ts){
  try{
    const dt = ts?.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleDateString();
  }catch{ return ""; }
}
async function loadUsers(){
  const role = $("#fltRole").value;
  const from = $("#fltFrom").value;
  const to   = $("#fltTo").value;

  let qref = collection(db,"users");
  const clauses = [];
  if(role) clauses.push(where("role","==",role));
  if(from) clauses.push(where("createdAt",">=", toTS(from)));
  if(to)   clauses.push(where("createdAt","<=", Timestamp.fromDate(new Date(to+"T23:59:59"))));

  if(clauses.length){
    // @ts-ignore
    qref = query(qref, ...clauses, orderBy("createdAt","desc"));
  }else{
    // @ts-ignore
    qref = query(qref, orderBy("createdAt","desc"), limit(100));
  }

  const snap = await getDocs(qref);
  const tbody = $("#usersTbody");
  tbody.innerHTML = "";
  snap.forEach(docu=>{
    const u = docu.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.email || ""}</td>
      <td>${u.username || ""}</td>
      <td>
        <select data-uid="${u.uid}" class="selRole">
          <option value="admin" ${u.role==="admin"?"selected":""}>admin</option>
          <option value="periodista" ${u.role==="periodista"?"selected":""}>periodista</option>
          <option value="espectador" ${u.role==="espectador"?"selected":""}>espectador</option>
        </select>
      </td>
      <td>${formatDate(u.createdAt)}</td>
      <td><button class="btn btnSmall" data-act="saveRole" data-uid="${u.uid}">Guardar rol</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-act="saveRole"]').forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const uid = btn.getAttribute("data-uid");
      const sel = tbody.querySelector(`select[data-uid="${uid}"]`);
      const newRole = sel.value;
      try{
        await updateDoc(doc(db,"users", uid), { role:newRole });
        toast("Rol actualizado");
      }catch(err){
        toast(err.message || "No se pudo actualizar el rol (verifica reglas y config/admins)");
      }
    });
  });
}
function initGestionUsuarios(){
  $("#btnApplyUsers")?.addEventListener("click", loadUsers);
  $("#btnResetUsers")?.addEventListener("click", ()=>{
    $("#fltRole").value="";
    $("#fltFrom").value="";
    $("#fltTo").value="";
    loadUsers();
  });
  loadUsers();
}


// ---------- NOTAS (periodista) ----------


async function refreshNotasList(){
  const lis = $("#listaNotas");
  if (!lis) return;
  lis.innerHTML = "";
  const qref = query(collection(db,"notas"), where("autorUid","==", currentUser.uid), orderBy("updatedAt","desc"));
  const snap = await getDocs(qref);
  snap.forEach(d=>{
    const n = d.data();
    const li = document.createElement("li");
    li.innerHTML = `<button class="btn" data-id="${d.id}">${n.titulo} · <span class="muted">${n.estado}</span></button>`;
    lis.appendChild(li);
  });
  lis.querySelectorAll("button").forEach(b=>{
    b.addEventListener("click", async ()=>{
      const id = b.getAttribute("data-id");
      const s = await getDoc(doc(db,"notas", id));
      if(s.exists()){
        const n = s.data();
        currentNoteId = id;
        $("#notaTitulo").value = n.titulo || "";
        $("#notaCuerpo").value = n.cuerpo || "";
        $("#notaEstado").value = n.estado || "borrador";
        $("#notaCategoria").value = n.categoria || "local";
        $("#notaResumen").value = n.resumen || "";
        $("#notaImagenUrl").value = n.imagenUrl || "";

      }
    });
  });
}
function initNotas(){
  $("#btnNuevaNota")?.addEventListener("click", ()=>{
    currentNoteId = null;
    $("#notaTitulo").value = "";
    $("#notaCuerpo").value = "";
    $("#notaEstado").value = "borrador";
    $("#notaCategoria").value = "local";
    $("#notaResumen").value = "";
    $("#notaImagenUrl").value = "";

  });

  $("#btnGuardarNota")?.addEventListener("click", async ()=>{
    const titulo = $("#notaTitulo").value.trim();
    const cuerpo = $("#notaCuerpo").value.trim();
    const estado = $("#notaEstado").value;
    const categoria = $("#notaCategoria").value;
    const resumen = $("#notaResumen").value.trim();
    const imagenUrl = $("#notaImagenUrl").value.trim();
    
    if(!titulo) return toast("Agrega un título");

    if(currentNoteId){
      await updateDoc(doc(db,"notas", currentNoteId), {
      titulo, cuerpo, estado,
      categoria, resumen, imagenUrl,
      updatedAt: serverTimestamp()
    });
    }else{
      const ref = await addDoc(collection(db,"notas"), {
      titulo, cuerpo, estado,
      categoria, resumen, imagenUrl,
      autorUid: currentUser.uid,
      autorNombre: currentUsernameLabel || (currentUser.email ? currentUser.email.split("@")[0] : "periodista"),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
      currentNoteId = ref.id;
    }
    toast("Nota guardada");
    refreshNotasList();
  });

  $("#btnBorrarNota")?.addEventListener("click", async ()=>{
    if(!currentNoteId) return toast("Seleccioná una nota");
    if(!confirm("¿Borrar esta nota?")) return;
    await deleteDoc(doc(db,"notas", currentNoteId));
    currentNoteId = null;
    $("#notaTitulo").value = "";
    $("#notaCuerpo").value = "";
    $("#notaEstado").value = "borrador";
    toast("Nota borrada");
    refreshNotasList();
  });

  refreshNotasList();
}

// ---------- SOPORTE (soporte/admin) ----------


function esc(s){ return (s||"").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function nl2br(s){ return s.replace(/\n/g,"<br>"); }
function estadoOption(v, cur){ return `<option value="${v}" ${v===cur?'selected':''}>${v}</option>`; }

function mailtoHref(caso){
  const to = encodeURIComponent(caso.reporterEmail || "");
  const subject = encodeURIComponent(`Seguimiento caso #${caso.id.slice(0,6)} - ${caso.ubicacion || ''}`);
  const body = encodeURIComponent(
`Hola ${caso.reporterName || ''},

Te contacto por tu reporte (#${caso.id}).

Ubicación: ${caso.ubicacion || ''}
Descripción:
${caso.descripcion || ''}

Quedamos atentos a tus comentarios.
Saludos.`
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

async function loadSupportCases(){
  const qref = query(collection(db,"reclamos"), orderBy("createdAt","desc"), limit(200));
  const snap = await getDocs(qref);
  const arr = [];
  snap.forEach(d=>{
    const x = d.data();
    arr.push({
      id: d.id,
      reporterUid: x.reporterUid || "",
      reporterName: x.reporterName || "",
      reporterEmail: x.reporterEmail || "",
      ubicacion: x.ubicacion || "",
      descripcion: x.descripcion || "",
      estado: x.estado || "Recibido",
      createdAt: x.createdAt
    });
  });
  return arr.filter(c => c.estado === "Recibido" || c.estado === "En proceso");
}

function renderSupportList(container, items){
  container.innerHTML = "";
  if(!items.length){
    container.innerHTML = `<p class="muted">No hay casos para mostrar.</p>`;
    return;
  }
  items.forEach(c=>{
    const wrap = document.createElement("div");
    const userLabel = c.reporterName?.trim()|| (c.reporterEmail ? c.reporterEmail.split("@")[0] : "usuario");
    wrap.className = "accordion-case";
    wrap.dataset.id = c.id;
    wrap.innerHTML = `
      <button class="accordion-hd" aria-expanded="false" title="${esc(c.reporterEmail || "")}">
        <span>
          #${c.id.slice(0,6)} · ${esc(userLabel)}
          · ${esc(c.ubicacion || "sin ubicación")}
          · <span class="muted">${esc(c.estado)}</span>
        </span>
        <span>▼</span>
      </button>
      <div class="accordion-bd">
        <div class="case-row"><div class="k">Usuario</div><div>${esc(c.reporterName || "")} · <span class="muted">${esc(c.reporterEmail || "")}</span></div></div>
        <div class="case-row"><div class="k">Ubicación</div><div>${esc(c.ubicacion || "")}</div></div>
        <div class="case-row"><div class="k">Descripción</div><div>${nl2br(esc(c.descripcion || ""))}</div></div>
        <div class="case-row">
          <div class="k">Estado</div>
          <div>
            <select class="sel-estado" data-id="${c.id}">
              ${estadoOption("Recibido", c.estado)}
              ${estadoOption("En proceso", c.estado)}
              ${estadoOption("Resuelto", c.estado)}
            </select>
          </div>
        </div>
        <div class="case-actions">
          <a class="btn" href="${mailtoHref(c)}">Contactar a ${esc(c.reporterName || "usuario")}</a>
        </div>
      </div>
    `;
    wrap.querySelector(".accordion-hd").addEventListener("click", ()=>{
      const open = wrap.classList.toggle("open");
      wrap.querySelector(".accordion-hd").setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.querySelector(".sel-estado").addEventListener("change", async (e)=>{
      const sel = e.target;
      const id  = sel.getAttribute("data-id");
      const nuevo = sel.value;
      try{
        await updateDoc(doc(db,"reclamos", id), {
          estado: nuevo,
          estadoUpdatedAt: serverTimestamp(),
          estadoUpdatedBy: currentUser?.uid || "",
          estadoUpdatedByRole: currentRole || "desconocido"
        });
        if (typeof initSoporte._refresh === "function") await initSoporte._refresh(id);
      }catch(err){
        alert("No se pudo actualizar el estado (permisos).");
        console.error(err);
        sel.value = items.find(x=>x.id===id)?.estado || "Recibido";
      }
    });
    container.appendChild(wrap);
  });
}

function openCaseById(id){
  const tabSoporte = $("#tab-soporte");
  const panelSoporte = $("#panel-soporte");
  if (tabSoporte && panelSoporte && !panelSoporte.classList.contains('active')) {
    tabSoporte.click();
  }
  const item = document.querySelector(`.accordion-case[data-id="${id}"]`);
  if (!item) return;
  item.classList.add('open');
  const hd = item.querySelector('.accordion-hd');
  if (hd) hd.setAttribute('aria-expanded','true');
  item.classList.add('case-highlight');
  setTimeout(()=> item.classList.remove('case-highlight'), 2000);
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  pendingCaseId = null;
}

function initSoporte(){
  const input = $("#srchSoporte");
  const list  = $("#soporteLista");
  if (!input || !list) return;

  let allCases = [];

  async function refreshSupportList(reopenId = null){
    const cases = await loadSupportCases();
    allCases = cases;

    const q = input.value.trim().toLowerCase();
    const data = q
      ? allCases.filter(c=>{
          const hay = (v)=> (v||"").toString().toLowerCase().includes(q);
          return hay(c.reporterName) || hay(c.reporterEmail) || hay(c.ubicacion) || hay(c.descripcion) || hay(c.id);
        })
      : allCases;

    renderSupportList(list, data);

    const toOpen = reopenId || pendingCaseId;
    if (toOpen) setTimeout(()=> openCaseById(toOpen), 0);
  }

  refreshSupportList();

  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    const data = q
      ? allCases.filter(c=>{
          const hay = (v)=> (v||"").toString().toLowerCase().includes(q);
          return hay(c.reporterName) || hay(c.reporterEmail) || hay(c.ubicacion) || hay(c.descripcion) || hay(c.id);
        })
      : allCases;
    renderSupportList(list, data);
    if (!q && pendingCaseId) openCaseById(pendingCaseId);
  });

  initSoporte._refresh = refreshSupportList;
}

// ---------- Logout ----------
$("#btn-logout")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.href = "login.html";
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    alert("No se pudo cerrar sesión. Inténtalo de nuevo.");
  }
});