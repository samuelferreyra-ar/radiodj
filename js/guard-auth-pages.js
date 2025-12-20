import { observeAuth } from "./firebase.js";

const params = new URLSearchParams(location.search);
const next = params.get("next");

// Si estás logueado, no deberías ver login/registro/reset
observeAuth((user) => {
  if (user) {
    // si venían con next, lo respetamos, sino mandamos a cuenta
    window.location.replace(next || "cuenta.html");
  }
});
