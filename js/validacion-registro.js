// js/validacion-registro.js
// Registro: validación frontend + disponibilidad en vivo (username + email)

import { db } from "./firebase.js";
import {
  doc, getDoc,
  collection, query, where, getDocs, limit
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  if (!form) return;

  const usernameInput = document.getElementById("regUsername");
  const emailInput = document.getElementById("regEmail");
  const passInput = document.getElementById("regPassword");
  const pass2Input = document.getElementById("regPassword2");
  const submitBtn = form.querySelector('button[type="submit"]');

  // Dominios permitidos para el e-mail
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

  // ---------------- UI helpers ----------------

  function getHelpElement(input) {
    const wrapper = input.closest(".input-wrapper") || input.parentElement;
    let help = wrapper.querySelector(".help");
    if (!help) {
      help = document.createElement("small");
      help.classList.add("help");
      wrapper.appendChild(help);
    }
    return help;
  }

  /**
   * state: "ok" | "error" | "neutral"
   */
  function setFieldState(input, state, msg = "") {
    const help = getHelpElement(input);

    input.classList.remove("field-valid", "field-invalid");
    help.classList.remove("ok", "error");

    if (state === "ok") {
      input.classList.add("field-valid");
      help.classList.add("ok");
      help.textContent = msg || "Correcto";
    } else if (state === "error") {
      input.classList.add("field-invalid");
      help.classList.add("error");
      help.textContent = msg || "Revisá este campo";
    } else {
      help.textContent = msg || "";
    }
  }

  // ---------------- Normalizadores (alineados con auth.js) ----------------

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

  function normalizeEmail(s) {
    return (s || "").toString().trim().toLowerCase();
  }

  // ---------------- Validaciones de formato ----------------

  function validarUsernameFormato(valor) {
    const user = (valor || "").trim();

    if (user.length === 0) {
      return { ok: false, msg: "El nombre de usuario es obligatorio" };
    }

    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(user)) {
      return { ok: false, msg: "Debe iniciar con letra y tener 3–20 caracteres (letras, números y _)" };
    }

    if (/(.)\1\1/.test(user)) {
      return { ok: false, msg: "No se permiten caracteres repetidos más de 2 veces seguidas" };
    }

    return { ok: true, msg: "Formato correcto" };
  }

  function validarEmailFormato(valor) {
    const email = (valor || "").trim();

    if (email.length === 0) {
      return { ok: false, msg: "El email es obligatorio" };
    }

    const okEmail =
      typeof validator !== "undefined"
        ? validator.isEmail(email)
        : looksLikeEmail(email);

    if (!okEmail) return { ok: false, msg: "Formato de email inválido" };

    const dominio = email.split("@")[1]?.toLowerCase() || "";
    if (!dominiosPermitidos.includes(dominio)) {
      return { ok: false, msg: "El dominio del email no está permitido (usa Gmail, Outlook, etc.)" };
    }

    return { ok: true, msg: "Formato correcto" };
  }

  function validarPassword(valor) {
    const pass = valor || "";

    if (pass.length === 0) return { ok: false, msg: "La contraseña es obligatoria" };
    if (pass.length < 8) return { ok: false, msg: "Mínimo 8 caracteres" };
    if (!/[A-Z]/.test(pass)) return { ok: false, msg: "Debe incluir al menos una letra mayúscula" };
    if (!/[a-z]/.test(pass)) return { ok: false, msg: "Debe incluir al menos una letra minúscula" };
    if (!/[0-9]/.test(pass)) return { ok: false, msg: "Debe incluir al menos un número" };
    if (!/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]\;]/.test(pass)) return { ok: false, msg: "Debe incluir al menos un símbolo especial" };

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

    return { ok: true, msg: "Contraseña segura" };
  }

  function validarPassword2(pass, pass2) {
    const p2 = pass2 || "";
    if (p2.length === 0) return { ok: false, msg: "Confirmá la contraseña" };
    if (pass !== p2) return { ok: false, msg: "Las contraseñas no coinciden" };
    return { ok: true, msg: "Las contraseñas coinciden" };
  }

  // ---------------- Disponibilidad en vivo ----------------

  // null = sin verificar / verificando / no pudo verificar
  // true = disponible, false = ocupado
  let usernameDisponible = null;
  let emailDisponible = null;

  // anti-race: solo aplica el último request
  let usernameReqId = 0;
  let emailReqId = 0;

  // debounce
  let tUser = null;
  let tEmail = null;

  // Evita “parpadeos” de estado: no cambies a “verificando” inmediatamente
  // (si el usuario escribe rápido, se queda en neutral hasta que haga pausa)
  const VERIFY_DELAY_MS = 450;
  const VERIFY_HINT_MS = 250;
  let tUserHint = null;
  let tEmailHint = null;

  async function checkUsernameDisponible(rawValue) {
    const uname = normalizeUsername(rawValue);
    if (!uname) return null;

    const myId = ++usernameReqId;
    try {
      const ref = doc(db, "usernames", uname);
      const snap = await getDoc(ref);
      if (myId !== usernameReqId) return null;
      return snap.exists() ? false : true;
    } catch (e) {
      if (myId !== usernameReqId) return null;
      console.error("[checkUsernameDisponible] error:", e);
      return null;
    }

  }

  async function checkEmailDisponible(rawValue) {
  const emailLower = normalizeEmail(rawValue);
  if (!emailLower) return null;

  const myId = ++emailReqId;
  try {
    // Índice: emails/{emailLower}
    const ref = doc(db, "emails", emailLower);
    const snap = await getDoc(ref);

    if (myId !== emailReqId) return null;
    return snap.exists() ? false : true; // existe => ocupado
  } catch (e) {
    if (myId !== emailReqId) return null;
    console.error("[checkEmailDisponible] error:", e);
    return null;
  }
}


  // ---------------- Render por campo (formato + disponibilidad) ----------------

  function renderUsernameState() {
    const fmt = validarUsernameFormato(usernameInput.value);
    if (!fmt.ok) {
      usernameDisponible = null;
      setFieldState(usernameInput, "error", fmt.msg);
      return false;
    }

    if (usernameDisponible === true) {
      setFieldState(usernameInput, "ok", "Usuario disponible");
      return true;
    }

    if (usernameDisponible === false) {
      setFieldState(usernameInput, "error", "Ese nombre de usuario ya está en uso");
      return false;
    }

    // Pendiente / no verificable aún
    setFieldState(usernameInput, "neutral", "");
    return false;
  }

  function renderEmailState() {
    const fmt = validarEmailFormato(emailInput.value);
    if (!fmt.ok) {
      emailDisponible = null;
      setFieldState(emailInput, "error", fmt.msg);
      return false;
    }

    if (emailDisponible === true) {
      setFieldState(emailInput, "ok", "Email disponible");
      return true;
    }

    if (emailDisponible === false) {
      setFieldState(emailInput, "error", "Ese email ya está registrado");
      return false;
    }

    setFieldState(emailInput, "neutral", "");
    return false;
  }

  function renderPasswordState() {
    const { ok, msg } = validarPassword(passInput.value);
    setFieldState(passInput, ok ? "ok" : "error", msg);
    return ok;
  }

  function renderPassword2State() {
    const { ok, msg } = validarPassword2(passInput.value, pass2Input.value);
    setFieldState(pass2Input, ok ? "ok" : "error", msg);
    return ok;
  }

  function updateSubmitState() {
    const uFmtOk = validarUsernameFormato(usernameInput.value).ok;
    const eFmtOk = validarEmailFormato(emailInput.value).ok;
    const pOk = validarPassword(passInput.value).ok;
    const p2Ok = validarPassword2(passInput.value, pass2Input.value).ok;

    const allOk =
      uFmtOk &&
      eFmtOk &&
      pOk &&
      p2Ok &&
      usernameDisponible === true &&
      emailDisponible === true;

    submitBtn.disabled = !allOk;
    return allOk;
  }

  function scheduleUsernameCheck() {
    clearTimeout(tUser);
    clearTimeout(tUserHint);

    // resetea disponibilidad al tipear
    usernameDisponible = null;

    const fmt = validarUsernameFormato(usernameInput.value);
    if (!fmt.ok) {
      setFieldState(usernameInput, "error", fmt.msg);
      updateSubmitState();
      return;
    }

    // hint suave "verificando..." solo si se queda quieto un poquito
    tUserHint = setTimeout(() => {
      // si aún no hay resultado
      if (usernameDisponible === null) {
        setFieldState(usernameInput, "neutral", "Verificando disponibilidad…");
      }
    }, VERIFY_HINT_MS);

    tUser = setTimeout(async () => {
      const res = await checkUsernameDisponible(usernameInput.value);
      usernameDisponible = res;

      if (res === true) setFieldState(usernameInput, "ok", "Usuario disponible");
      else if (res === false) setFieldState(usernameInput, "error", "Ese nombre de usuario ya está en uso");
      else setFieldState(usernameInput, "neutral", "No se pudo verificar (reintentá)");

      updateSubmitState();
    }, VERIFY_DELAY_MS);

    updateSubmitState();
  }

  function scheduleEmailCheck() {
    clearTimeout(tEmail);
    clearTimeout(tEmailHint);

    emailDisponible = null;

    const fmt = validarEmailFormato(emailInput.value);
    if (!fmt.ok) {
      setFieldState(emailInput, "error", fmt.msg);
      updateSubmitState();
      return;
    }

    tEmailHint = setTimeout(() => {
      if (emailDisponible === null) {
        setFieldState(emailInput, "neutral", "Verificando disponibilidad…");
      }
    }, VERIFY_HINT_MS);

    tEmail = setTimeout(async () => {
      const res = await checkEmailDisponible(emailInput.value);
      emailDisponible = res;

      if (res === true) setFieldState(emailInput, "ok", "Email disponible");
      else if (res === false) setFieldState(emailInput, "error", "Ese email ya está registrado");
      else setFieldState(emailInput, "neutral", "No se pudo verificar (reintentá)");

      updateSubmitState();
    }, VERIFY_DELAY_MS);

    updateSubmitState();
  }

  // ---------------- Listeners ----------------

  usernameInput.addEventListener("input", () => {
    // Render formato inmediato, pero sin “ok” definitivo
    const fmt = validarUsernameFormato(usernameInput.value);
    if (!fmt.ok) setFieldState(usernameInput, "error", fmt.msg);
    else setFieldState(usernameInput, "neutral", ""); // neutral mientras verifica

    scheduleUsernameCheck();
  });

  emailInput.addEventListener("input", () => {
    const fmt = validarEmailFormato(emailInput.value);
    if (!fmt.ok) setFieldState(emailInput, "error", fmt.msg);
    else setFieldState(emailInput, "neutral", "");

    scheduleEmailCheck();
  });

  passInput.addEventListener("input", () => {
    renderPasswordState();
    renderPassword2State();
    updateSubmitState();
  });

  pass2Input.addEventListener("input", () => {
    renderPassword2State();
    updateSubmitState();
  });

  // Submit final
  form.addEventListener("submit", (event) => {
    // Asegura estados visibles
    const uOk = renderUsernameState();
    const eOk = renderEmailState();
    const pOk = renderPasswordState();
    const p2Ok = renderPassword2State();

    const allOk = updateSubmitState();

    // Si está todo ok, dejamos que auth.js haga el registro.
    if (allOk) return;

    event.preventDefault();

    // Mensajes más útiles si quedó pendiente
    if (validarUsernameFormato(usernameInput.value).ok && usernameDisponible !== true) {
      setFieldState(usernameInput, "neutral", usernameDisponible === false ? "Ese nombre de usuario ya está en uso" : "Esperá a que termine la verificación…");
    }
    if (validarEmailFormato(emailInput.value).ok && emailDisponible !== true) {
      setFieldState(emailInput, "neutral", emailDisponible === false ? "Ese email ya está registrado" : "Esperá a que termine la verificación…");
    }

    // Foco al primer problema
    const fields = [usernameInput, emailInput, passInput, pass2Input];
    const firstBad =
      fields.find((inp) => inp.classList.contains("field-invalid")) ||
      fields.find((inp) => inp === usernameInput && !uOk) ||
      fields.find((inp) => inp === emailInput && !eOk) ||
      fields.find((inp) => inp === passInput && !pOk) ||
      fields.find((inp) => inp === pass2Input && !p2Ok);

    if (firstBad) firstBad.focus();
  });

  // Estado inicial
  submitBtn.disabled = true;
  setFieldState(usernameInput, "neutral", "");
  setFieldState(emailInput, "neutral", "");
  setFieldState(passInput, "neutral", "");
  setFieldState(pass2Input, "neutral", "");
});