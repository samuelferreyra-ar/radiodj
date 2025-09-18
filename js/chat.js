// /js/chat.js
import { auth, db, observeAuth } from "./firebase.js";
import {
  collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatLoginHint = document.getElementById("chatLoginHint");

// Render de mensajes
function renderMessage(msg) {
  const wrap = document.createElement("div");
  wrap.className = "msg";
  wrap.innerHTML = `
    <div class="meta">${msg.displayName || "Anónimo"} • ${msg.createdAt?.toDate?.().toLocaleTimeString?.() || ""}</div>
    <div class="text">${(msg.text || "").replace(/</g,"&lt;")}</div>
  `;
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Suscripción en tiempo real (últimos 50)
const q = query(collection(db, "chat"), orderBy("createdAt", "asc"), limit(50));
onSnapshot(q, (snap) => {
  chatMessages.innerHTML = "";
  snap.forEach(doc => renderMessage(doc.data()));
});

// Habilitar/deshabilitar input según auth
observeAuth((user) => {
  const logged = !!user;
  chatForm.style.display = logged ? "flex" : "none";
  chatLoginHint.hidden = logged;
});

// Enviar mensaje
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Necesitás iniciar sesión.");
    const text = chatInput.value.trim();
    if (!text) return;

    await addDoc(collection(db, "chat"), {
      text,
      uid: user.uid,
      displayName: user.displayName || "Usuario",
      createdAt: serverTimestamp()
    });
    chatInput.value = "";
  });
}