// js/auth.js
// Login con email o username + "Recordarme" (persistencia)
// Compatible también con registro si la página incluye #registerForm

import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// ---------- Utilidades ----------
const $ = (sel) => document.querySelector(sel);

function looksLikeEmail(s) {
  return /\S+@\S+\.\S+/.test(s);
}

function normalizeUsername(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "")
    .slice(0, 20);
}

async function resolveEmailFromLoginInput(loginInput) {
  if (looksLikeEmail(loginInput)) return loginInput.trim();

  // Si no parece email, lo tratamos como username y buscamos EN UN SOLO DOC:
  const uname = normalizeUsername(loginInput);
  if (!uname) throw new Error("Usuario no válido");

  const ref = doc(db, "usernames", uname);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Usuario no encontrado");
  }
  const { email } = snap.data() || {};
  if (!email) throw new Error("No se pudo resolver el email del usuario");
  return email;
}

// Crea/asegura el doc users/{uid}
async function ensureUserDoc(user, extra = {}) {
  const uref = doc(db, "users", user.uid);
  const usnap = await getDoc(uref);

  const email = (user.email || "").trim();
  const emailLower = email.toLowerCase();

  if (!usnap.exists()) {
    await setDoc(uref, {
      uid: user.uid,
      email,
      emailLower,          // 👈 NUEVO
      role: "espectador",
      createdAt: serverTimestamp(),
      ...extra,
    });
  } else {
    const payload = {
      ...(Object.keys(extra).length ? extra : {}),
    };

    // Si el email cambió o falta emailLower, lo actualizamos
    if (email && (!usnap.data()?.emailLower || usnap.data()?.emailLower !== emailLower)) {
      payload.email = email;
      payload.emailLower = emailLower; // 👈 NUEVO
    }

    if (Object.keys(payload).length) {
      await setDoc(uref, payload, { merge: true });
    }
  }
}

// Crea/actualiza el índice usernames/{username} -> { uid, email }
async function upsertUsernameIndex(username, user) {
  const uname = normalizeUsername(username);
  if (!uname) return;
  const ref = doc(db, "usernames", uname);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // crea si no existe (si tus reglas exigen que no exista previamente)
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      createdAt: serverTimestamp(),
    });
  } else {
    const data = snap.data() || {};
    // Si ya existe y pertenece a este uid, lo dejamos; si es de otro, no lo pisamos
    if (data.uid === user.uid) {
      // opcional: actualizar email si cambió
      if (data.email !== user.email) {
        await setDoc(ref, { email: user.email || "" }, { merge: true });
      }
    }
    // Si pertenece a otro, no hacemos nada (colisión de username)
  }
}

async function upsertEmailIndex(email, user) {
  const emailLower = (email || "").trim().toLowerCase();
  if (!emailLower) return;

  const ref = doc(db, "emails", emailLower);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: emailLower,
      createdAt: serverTimestamp(),
    });
  } else {
    const data = snap.data() || {};
    // Si ya existe y pertenece a este uid, ok. Si es de otro, no pisar.
    if (data.uid === user.uid) {
      return;
    }
  }
}


// ---------- LOGIN (email o username) ----------
const loginForm = $("#loginForm");
if (loginForm) {
  const inputUserOrEmail = $("#loginUserOrEmail");
  const inputPass = $("#loginPassword");
  const rememberMe = $("#rememberMe"); // checkbox "Recordarme" (opcional)

  // ---- PATCH LOGIN CON FILTRO DE DOMINIOS Y PASSWORD FUERTE ----

const dominiosPermitidos = [
  "gmail.com",
  "gmail.com.ar",
  "outlook.com",
  "outlook.com.ar",
  "hotmail.com",
  "hotmail.com.ar",
  "yahoo.com",
  "yahoo.com.ar",
  "icloud.com",
  "live.com",
  "live.com.ar",
    "yahoo.es"
];


function emailDominioPermitido(email) {
  const dominio = email.split("@")[1]?.toLowerCase() || "";
  return dominiosPermitidos.includes(dominio);
}

// MISMA VALIDACIÓN DE CONTRASEÑA QUE EN REGISTRO (versión compacta)
function validarPasswordLogin(pass) {
  if (pass.length < 8) return { ok: false, msg: "La contraseña debe tener al menos 8 caracteres" };
  if (!/[A-Z]/.test(pass)) return { ok: false, msg: "Debe incluir al menos una letra mayúscula" };
  if (!/[a-z]/.test(pass)) return { ok: false, msg: "Debe incluir al menos una letra minúscula" };
  if (!/[0-9]/.test(pass)) return { ok: false, msg: "Debe incluir al menos un número" };
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]\;]/.test(pass)) return { ok: false, msg: "Debe incluir un símbolo especial" };

  // Secuencias numéricas
  for (let i = 0; i < pass.length - 2; i++) {
    const a = pass.charCodeAt(i);
    const b = pass.charCodeAt(i + 1);
    const c = pass.charCodeAt(i + 2);
    const esNumero = (ch) => ch >= 48 && ch <= 57;
    if (esNumero(a) && esNumero(b) && esNumero(c)) {
      if (b === a + 1 && c === b + 1) {
        return { ok: false, msg: "No se permiten números consecutivos (ej: 123)" };
      }
    }
  }

  return { ok: true };
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const loginInput = (inputUserOrEmail.value || "").trim();
  const password = inputPass.value;

  // --- FILTRO 2: Dominio permitido si el usuario ingresó un email directo ---
  const pareceEmail = /\S+@\S+\.\S+/.test(loginInput);
  if (pareceEmail && !emailDominioPermitido(loginInput)) {
    alert("El dominio del email no está permitido.");
    return;
  }

  try {
    // Persistencia según "Recordarme"
    const persistence =
      rememberMe && rememberMe.checked
        ? browserLocalPersistence
        : browserSessionPersistence;
    try {
      await setPersistence(auth, persistence);
    } catch {
      await setPersistence(auth, browserSessionPersistence);
    }

    // Resolver email si escribieron username
    const email = await resolveEmailFromLoginInput(loginInput);

    // Filtro extra de dominio por si viene de username
    if (!emailDominioPermitido(email)) {
      alert("El dominio del email asociado a este usuario no está permitido.");
      return;
    }

    // --- LOGIN REAL ---
    const cred = await signInWithEmailAndPassword(auth, email, password);

    await ensureUserDoc(cred.user);

    const params = new URLSearchParams(location.search);
    const next = params.get("next") || "index.html";
    window.location.href = next;

  } catch (err) {
    console.error("[login]", err);

    // 1) Caso: username no existe (error nuestro, sin err.code)
    if (!err.code && err.message === "Usuario no encontrado") {
      if (pareceEmail) {
        // Esto en la práctica casi no debería pasar, pero lo contemplamos por si acaso
        alert("El e-mail ingresado no corresponde a un usuario registrado");
      } else {
        alert("El nombre de usuario no corresponde a un usuario registrado");
      }
      return;
    }

    const code = err.code || "";

    // 2) Email no registrado (Firebase)
    if (code === "auth/user-not-found") {
      // En este punto, si parecía email, seguro es un e-mail; si no, igual informamos por e-mail
      if (pareceEmail) {
        alert("El e-mail ingresado no corresponde a un usuario registrado");
      } else {
        // Si el usuario escribió algo sin @ pero Firebase devuelve user-not-found,
        // igual le explicamos por e-mail porque el signIn se hizo con email.
        alert("El e-mail ingresado no corresponde a un usuario registrado");
      }
      return;
    }

    // 3) Password incorrecta (prácticamente siempre invalid-credential / wrong-password)
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
      alert("Contraseña incorrecta");
      return;
    }

    // 4) Otros errores más específicos
    if (code === "auth/invalid-email") {
      alert("El e-mail ingresado no es válido.");
      return;
    }

    if (code === "auth/too-many-requests") {
      alert("Demasiados intentos. Probá más tarde.");
      return;
    }

    if (code === "auth/network-request-failed") {
      alert("Error de conexión. Revisá tu internet.");
      return;
    }

    // 5) Fallback genérico
    alert("No se pudo iniciar sesión. Reintentá más tarde.");
  }
});


}

// ---------- REGISTRO (si la página tiene #registerForm) ----------
const registerForm = $("#registerForm");
if (registerForm) {
  const inpUsername = $("#regUsername");
  const inpEmail = $("#regEmail");
  const inpPass = $("#regPassword");
  const inpPass2 = $("#regPassword2");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const desired = (inpUsername?.value || "").trim();
    const email = (inpEmail.value || "").trim();
    const pass = inpPass.value;
    const pass2 = inpPass2.value;

    const username = normalizeUsername(desired);
    if (!username) return alert("Elegí un nombre de usuario válido (solo letras y números)");
    if (!looksLikeEmail(email)) return alert("Email inválido");
    if (pass.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");
    if (pass !== pass2) return alert("Las contraseñas no coinciden");

    try {
      // Verificar disponibilidad de username antes de crear la cuenta
      const unameRef = doc(db, "usernames", username);
      const unameSnap = await getDoc(unameRef);
      if (unameSnap.exists()) {
        return alert("Ese nombre de usuario ya está en uso. Probá con otro.");
      }

      const cred = await createUserWithEmailAndPassword(auth, email, pass);

      // Doc users/{uid} (sin displayName)
      await ensureUserDoc(cred.user, {});
      await upsertEmailIndex(email, cred.user);


      // Guardar username en users/{uid} e indexar en usernames/{username}
      let initialUsername = username;
      if (initialUsername) {
        await upsertUsernameIndex(initialUsername, cred.user);
        await setDoc(
          doc(db, "users", cred.user.uid),
          { username: initialUsername },
          { merge: true }
        );
      }

      alert("Cuenta creada con éxito");
      window.location.href = "index.html";
    } catch (err) {
  console.error("[register]", err);

  const mensajes = {
    "auth/email-already-in-use": "Ese email ya está registrado. Probá iniciar sesión o usar otro correo.",
    "auth/invalid-email": "El email ingresado no es válido.",
    "auth/weak-password": "La contraseña es demasiado débil. Elegí una más segura.",
    "auth/operation-not-allowed": "El registro está deshabilitado temporalmente. Probá más tarde.",
    "auth/network-request-failed": "No se pudo conectar al servidor. Revisá tu conexión a Internet.",
    "auth/too-many-requests": "Demasiados intentos. Probá de nuevo en unos minutos.",
  };

  const mensaje =
    mensajes[err.code] ||
    err.message ||
    "Ocurrió un error inesperado al crear la cuenta.";

  alert(mensaje);
}
  });
}
// ---------- RESET PASSWORD (olvidaste_contraseña.html) ----------
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  const resetEmailInp = document.getElementById("resetEmail");

  // (opcional) idioma del mail de Firebase
  try { auth.languageCode = "es"; } catch {}

  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (resetEmailInp.value || "").trim();
    if (!email) return alert("Ingresá tu email");

    try {
      await sendPasswordResetEmail(auth, email, {
        url: "https://samuelferreyra-ar.github.io/radiodj/login.html",
        handleCodeInApp: false
      });


      alert("Te enviamos un enlace para restablecer la contraseña. Revisá tu correo.");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 2000); // 2 segundos

    } catch (err) {
      console.error("[reset-pass]", err);
      // Mensajes más claros según el código de error
      const map = {
        "auth/invalid-email": "El email no es válido.",
        "auth/user-not-found": "No existe un usuario con ese email.",
        "auth/too-many-requests": "Demasiados intentos. Probá más tarde.",
      };
      alert(map[err.code] || (err.message || "No se pudo enviar el enlace."));
    }
  });
}
