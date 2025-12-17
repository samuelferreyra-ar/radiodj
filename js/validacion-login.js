// js/validacion-login.js
// Validación de LOGIN en frontend (antes de auth/back-end)

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return; // por si este script se carga en otras páginas

  const userOrEmailInput = document.getElementById("loginUserOrEmail");
  const passInput        = document.getElementById("loginPassword");
  const submitBtn        = form.querySelector('button[type="submit"]');

  // Dominios permitidos para el e-mail (mismos que en registro)
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


  // --- Helpers UI ---

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

  // --- Reglas de negocio (mismas ideas que en registro) ---

  function looksLikeEmail(s) {
    return /\S+@\S+\.\S+/.test(s);
  }

  function validarUsername(valor) {
    const user = (valor || "").trim();

    if (user.length === 0) {
      return { ok: false, msg: "Ingresá tu usuario o email" };
    }

    // Debe empezar con letra y tener 3–20 caracteres (letras, números, _)
    if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(user)) {
      return {
        ok: false,
        msg: "El usuario debe iniciar con letra y tener 3–20 caracteres (letras, números y _)"
      };
    }

    // Evita cosas tipo aaa111___ (3 iguales seguidos)
    if (/(.)\1\1/.test(user)) {
      return {
        ok: false,
        msg: "No se permiten caracteres repetidos más de 2 veces seguidas"
      };
    }

    return { ok: true, msg: "Usuario válido" };
  }

  function validarEmailLogin(valor) {
    const email = (valor || "").trim();

    if (email.length === 0) {
      return { ok: false, msg: "Ingresá tu usuario o email" };
    }

    // Usamos validator.js si está disponible
    const esEmailValido =
      typeof validator !== "undefined"
        ? validator.isEmail(email)
        : looksLikeEmail(email);

    if (!esEmailValido) {
      return { ok: false, msg: "Formato de email inválido" };
    }

    const dominio = email.split("@")[1]?.toLowerCase() || "";
    if (!dominiosPermitidos.includes(dominio)) {
      return {
        ok: false,
        msg: "El dominio del email no está permitido (usa Gmail, Outlook, etc.)"
      };
    }

    return { ok: true, msg: "Email válido" };
  }

  function validarUserOrEmail(valor) {
    const v = (valor || "").trim();
    if (v.length === 0) {
      return { ok: false, msg: "Ingresá tu usuario o email" };
    }

    // Si parece email, aplicamos reglas de email + dominios
    if (looksLikeEmail(v)) {
      return validarEmailLogin(v);
    }

    // Si no parece email, lo tratamos como username
    return validarUsername(v);
  }

  function validarPassword(valor) {
    const pass = valor || "";

    if (pass.length === 0) {
      return { ok: false, msg: "Ingresá tu contraseña" };
    }

    // Mismas reglas que en registro:
    if (pass.length < 8) {
      return { ok: false, msg: "La contraseña debe tener al menos 8 caracteres" };
    }

    if (!/[A-Z]/.test(pass)) {
      return { ok: false, msg: "Debe incluir al menos una letra mayúscula" };
    }

    if (!/[a-z]/.test(pass)) {
      return { ok: false, msg: "Debe incluir al menos una letra minúscula" };
    }

    if (!/[0-9]/.test(pass)) {
      return { ok: false, msg: "Debe incluir al menos un número" };
    }

    if (!/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]\;]/.test(pass)) {
      return { ok: false, msg: "Debe incluir al menos un símbolo especial" };
    }

    // Detectar secuencias numéricas consecutivas (123, 456, etc.)
    for (let i = 0; i < pass.length - 2; i++) {
      const a = pass.charCodeAt(i);
      const b = pass.charCodeAt(i + 1);
      const c = pass.charCodeAt(i + 2);

      const esNumero = (ch) => ch >= 48 && ch <= 57;

      if (esNumero(a) && esNumero(b) && esNumero(c)) {
        if (b === a + 1 && c === b + 1) {
          return {
            ok: false,
            msg: "No se permiten números consecutivos (ej: 123)"
          };
        }
      }
    }

    return { ok: true, msg: "Contraseña válida" };
  }

  // --- Validación por campo + actualización de UI ---

  function checkUserOrEmailField() {
    const { ok, msg } = validarUserOrEmail(userOrEmailInput.value);
    setFieldState(userOrEmailInput, ok ? "ok" : "error", msg);
    return ok;
  }

  function checkPasswordField() {
    const { ok, msg } = validarPassword(passInput.value);
    setFieldState(passInput, ok ? "ok" : "error", msg);
    return ok;
  }

  function checkFormValidity() {
    const ue = checkUserOrEmailField();
    const p  = checkPasswordField();

    const allOk = ue && p;
    if (submitBtn) {
      submitBtn.disabled = !allOk;
    }
    return allOk;
  }

  // --- Listeners en tiempo real ---

  userOrEmailInput.addEventListener("input", () => {
    checkUserOrEmailField();
    checkFormValidity();
  });

  passInput.addEventListener("input", () => {
    checkPasswordField();
    checkFormValidity();
  });

  // Validación final al enviar
  form.addEventListener("submit", (event) => {
    const ok = checkFormValidity();
    if (!ok) {
      event.preventDefault();

      const fields = [userOrEmailInput, passInput];
      const firstError = fields.find((input) =>
        input.classList.contains("field-invalid")
      );
      if (firstError) firstError.focus();
    }
    // Si ok === true, no hacemos preventDefault:
    // auth.js se encargará de hacer el login contra Firebase.
  });

  // Estado inicial: botón deshabilitado hasta que todo esté válido
  if (submitBtn) {
    submitBtn.disabled = true;
  }
});