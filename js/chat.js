// js/chat.js
import { auth, db, observeAuth } from "./firebase.js";
import {
  collection, addDoc, serverTimestamp,
  query, where, orderBy, onSnapshot, limit,
  Timestamp, doc, getDoc, getDocs, writeBatch, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";


const chatMessagesEl = document.getElementById("chatMessages");
const chatFormEl     = document.getElementById("chatForm");
const chatInputEl    = document.getElementById("chatInput");
const chatLoginHint  = document.getElementById("chatLoginHint");

const M6 = 6 * 60 * 60 * 1000; // 6 horas en ms
const MESSAGES_LIMIT = 500;
const colChat = collection(db, "chat");
const MOD_PLACEHOLDER = "eliminado por un moderador";

let currentIsAdmin = false;   // lo llenamos al loguearse

// --- Utils ---
function userHue(uid = "") {
  // Hash simple para repartir 0..359
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h % 360;
}
function formatHour(ts) {
  const d = ts?.toDate ? ts.toDate() : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function normalizeUsername(s) {
  return (s || "").toString().trim().toLowerCase();
}

// Obtiene username del perfil (si no, intenta derivar de email)
async function getMyUsername() {
  const u = auth.currentUser;
  if (!u) return null;
  const uref = doc(db, "users", u.uid);
  const usnap = await getDoc(uref);
  if (usnap.exists() && usnap.data().username) {
    return normalizeUsername(usnap.data().username);
  }
  // fallback: parte local del email
  if (u.email) return normalizeUsername(u.email.split("@")[0]);
  return "usuario";
}

function renderMessage(msg, id) {
  const wrap = document.createElement("div");
  wrap.className = "msg";
  const hue = userHue(msg.uid || "");
  wrap.style.setProperty("--msg-accent", `hsl(${hue} 70% 55%)`);

  // Elegimos nombre a mostrar: username > email local > "usuario"
  let name = msg.username || (msg.email ? msg.email.split("@")[0] : "usuario");
  name = normalizeUsername(name);

  const isDeleted = msg.moderated === true || (msg.text === MOD_PLACEHOLDER);

  wrap.innerHTML = `
    <div class="meta">
      <strong>@${name}</strong> · ${formatHour(msg.createdAt)}
    </div>
    <div class="text"></div>
  `;

  const textEl = wrap.querySelector(".text");
  textEl.textContent = isDeleted ? MOD_PLACEHOLDER : (msg.text || "");

  if (isDeleted) {
    wrap.classList.add("msg--deleted");
  }

  // Botón de moderación solo si soy admin y el mensaje no está ya borrado
  if (currentIsAdmin && !isDeleted && id) {
    const metaEl = wrap.querySelector(".meta");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-delete-btn";
    btn.textContent = "Eliminar";
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm("¿Seguro que querés marcar este mensaje como eliminado?")) return;
      try {
        await softDeleteMessage(id);
      } catch (e) {
        console.error("Error al moderar mensaje:", e);
        alert("No se pudo marcar el mensaje como eliminado.");
      }
    });
    metaEl.appendChild(btn);
  }

  return wrap;
}


function clearMessagesUI() {
  chatMessagesEl.innerHTML = "";
}

function subscribeLast6Hours() {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - M6));
  const qRef = query(
    colChat,
    where("createdAt", ">=", cutoff),
    orderBy("createdAt", "asc"),
    limit(MESSAGES_LIMIT)
  );
  return onSnapshot(qRef, (snap) => {
    clearMessagesUI();
    snap.forEach((docu) => {
  const d = docu.data();
  chatMessagesEl.appendChild(renderMessage(d, docu.id));
  });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });
}

// Limpia físicamente mensajes viejos (solo admin). Silencioso si reglas no lo permiten.
async function cleanupOldMessagesIfAdmin() {
  const me = auth.currentUser;
  if (!me) return;
  const usnap = await getDoc(doc(db, "users", me.uid));
  if (!usnap.exists() || usnap.data().role !== "admin") return;

  const cutoff = Timestamp.fromDate(new Date(Date.now() - M6));
  const oldQ = query(colChat, where("createdAt", "<", cutoff), orderBy("createdAt", "asc"), limit(200));
  const oldSnap = await getDocs(oldQ);
  if (oldSnap.empty) return;

  const batch = writeBatch(db);
  oldSnap.forEach((d) => batch.delete(d.ref));
  try {
    await batch.commit();
  } catch (e) {
    // Si las reglas no lo permiten, lo ignoramos.
    console.warn("No pude borrar mensajes antiguos:", e?.message || e);
  }
}

async function softDeleteMessage(messageId) {
  const me = auth.currentUser;
  if (!me) throw new Error("No hay usuario autenticado");

  // redundancia de seguridad, no está de más
  const usnap = await getDoc(doc(db, "users", me.uid));
  if (!usnap.exists() || usnap.data().role !== "admin") {
    throw new Error("No tenés permisos para moderar mensajes");
  }

  const ref = doc(db, "chat", messageId);
  await updateDoc(ref, {
    text: MOD_PLACEHOLDER,
    moderated: true,
    moderatedAt: serverTimestamp(),
    moderatedBy: me.uid,
  });
}

let unsubscribe = null;

// --- Estado de auth controla UI y suscripciones ---
observeAuth(async (user) => {
  if (!user) {
    currentIsAdmin = false;

    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    clearMessagesUI();
    chatLoginHint.hidden = false;
    chatFormEl.style.display = "none";
    return;
  }

  // Logueado: averiguamos rol
  const usnap = await getDoc(doc(db, "users", user.uid));
  const udata = usnap.exists() ? usnap.data() : {};
  currentIsAdmin = (udata.role === "admin");

  chatLoginHint.hidden = true;
  chatFormEl.style.display = "flex";

  if (unsubscribe) unsubscribe();
  unsubscribe = subscribeLast6Hours();

  // Primera pasada de limpieza + limpieza periódica
  cleanupOldMessagesIfAdmin();
  setInterval(cleanupOldMessagesIfAdmin, 30 * 60 * 1000);
});

// --- Envío de mensajes ---
chatFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = (chatInputEl.value || "").trim();
  if (!text) return;

  const u = auth.currentUser;
  if (!u) {
    chatLoginHint.hidden = false;
    return;
  }

  const username = await getMyUsername();

  try {
    await addDoc(colChat, {
      uid: u.uid,
      email: u.email || null,
      username,                // 👈 preferimos username para mostrar
      text,
      createdAt: serverTimestamp()
    });
    chatInputEl.value = "";
  } catch (err) {
    console.error("No se pudo enviar el mensaje:", err);
    alert("No se pudo enviar el mensaje.");
  }
});