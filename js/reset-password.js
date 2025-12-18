import { auth } from "./firebase.js";
import {
  verifyPasswordResetCode,
  confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const $ = (s) => document.querySelector(s);

function msg(text, ok=false){
  const el = $("#resetMsg");
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? "green" : "crimson";
}

const params = new URLSearchParams(location.search);
const oobCode = params.get("oobCode");
const mode = params.get("mode");

if (!oobCode || mode !== "resetPassword") {
  msg("Enlace inválido o incompleto.");
} else {
  // Verifica que el código sea válido y te devuelve el email asociado
  let resetEmail = "";

    verifyPasswordResetCode(auth, oobCode)
    .then((email) => {
        resetEmail = email;
        msg(`Código válido para: ${email}`, true);
    })
    .catch((err) => {
      console.error("[verifyPasswordResetCode]", err);
      msg("El enlace expiró o ya fue usado. Pedí uno nuevo.");
    });
}

$("#confirmResetForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p1 = ($("#newPass1").value || "").trim();
  const p2 = ($("#newPass2").value || "").trim();

  if (!oobCode) return msg("Falta el código del enlace.");
  if (p1.length < 6) return msg("La contraseña debe tener al menos 6 caracteres.");
  if (p1 !== p2) return msg("Las contraseñas no coinciden.");
  if (!resetEmail) return msg("El enlace aún no fue validado o es inválido.");

  try {
    await confirmPasswordReset(auth, oobCode, p1);
    msg("Contraseña actualizada. Ya podés iniciar sesión.", true);
    setTimeout(() => (location.href = "login.html"), 1200);
  } catch (err) {
    console.error("[confirmPasswordReset]", err);
    const map = {
      "auth/expired-action-code": "El enlace expiró. Pedí uno nuevo.",
      "auth/invalid-action-code": "El enlace es inválido o ya fue usado.",
      "auth/user-disabled": "Este usuario está deshabilitado.",
      "auth/weak-password": "Contraseña débil. Probá otra."
    };
    msg(map[err.code] || "No se pudo actualizar la contraseña.");
  }
});