// /js/auth.js
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  doc, setDoc, getDocs, query, where, collection
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { auth, db, setRememberPersistence } from "./firebase.js";

/** ---------- LOGIN ---------- */
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userOrEmail = document.getElementById("loginUserOrEmail").value.trim();
    const pass = document.getElementById("loginPassword").value;
    const remember = document.getElementById("rememberMe")?.checked;

    try {
      if (remember !== undefined) await setRememberPersistence(!!remember);

      let email = userOrEmail;
      // Si no parece email, resolvemos por username -> email
      if (!userOrEmail.includes("@")) {
        const q = query(collection(db, "users"), where("username", "==", userOrEmail));
        const snap = await getDocs(q);
        if (snap.empty) throw new Error("Usuario no encontrado");
        email = snap.docs[0].data().email;
      }

      await signInWithEmailAndPassword(auth, email, pass);
      // Redirigí a inicio (o cuenta)
      window.location.href = "index.html";
    } catch (err) {
      alert(err.message || "Error al iniciar sesión");
    }
  });
}

/** ---------- REGISTRO ---------- */
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fullName = document.getElementById("regFullName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const pass1 = document.getElementById("regPassword").value;
    const pass2 = document.getElementById("regPassword2").value;

    if (pass1 !== pass2) { alert("Las contraseñas no coinciden."); return; }

    // username “amigable” desde el nombre (puede refinarse)
    const username = fullName.toLowerCase().replace(/[^\w]+/g, "").slice(0,20);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass1);
      await updateProfile(cred.user, { displayName: fullName });

      // Guardar perfil básico (para buscar por username y usar en el chat)
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName: fullName,
        username,
        createdAt: Date.now()
      });

      window.location.href = "index.html";
    } catch (err) {
      alert(err.message || "No se pudo registrar");
    }
  });
}

/** ---------- RESET PASSWORD ---------- */
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("resetEmail").value.trim();
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Enviamos un enlace de recuperación a tu correo.");
    } catch (err) {
      alert(err.message || "No se pudo enviar el enlace");
    }
  });
}