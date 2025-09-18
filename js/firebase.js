// js/firebase.js (ESM limpio, UNA sola inicialización)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ⬇⬇⬇ reemplaza con tus credenciales de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB-1cHB2BMTYJt29hKNlHxuRuAaI-ZzBRc",
    authDomain: "radio-dj-752b3.firebaseapp.com",
    projectId: "radio-dj-752b3",
    storageBucket: "radio-dj-752b3.firebasestorage.app",
    messagingSenderId: "1096330822045",
    appId: "1:1096330822045:web:72a075071b5f391f692f74",
    measurementId: "G-PRZQZBKQ78"
};
// ⬆⬆⬆

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Útil para “Recordarme” en login
export function setRememberPersistence(remember) {
  // ✅ Nunca pases undefined; usa session si no se marca “Recordarme”
  return setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

// Observador de sesión (por si lo usás en index/cuenta)
export function observeAuth(callback) {
  return auth.onAuthStateChanged(callback);
}