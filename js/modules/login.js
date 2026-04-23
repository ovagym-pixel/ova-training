import { auth } from "../firebase/config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { navigate } from "../router.js";

export function renderLogin({ root }) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-box">
        <h1>OVA <span class="accent">Training</span>.</h1>
        <div class="sub">Ingresá con tu email y contraseña</div>

        <form id="login-form">
          <div class="form-field">
            <label>Email</label>
            <input type="email" id="email" required autocomplete="email">
          </div>
          <div class="form-field">
            <label>Contraseña</label>
            <input type="password" id="password" required autocomplete="current-password">
          </div>

          <div class="error" id="error-msg"></div>

          <button type="submit" class="btn primary" id="submit-btn" style="width:100%;margin-top:12px;padding:14px">
            Ingresar
          </button>
        </form>

        <div style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3);font-family:var(--font-mono);letter-spacing:0.04em;text-align:center">
          Si sos cliente, pedile el link de acceso a tu instructor
        </div>
      </div>
    </div>
  `;

  const form = document.getElementById("login-form");
  const errorMsg = document.getElementById("error-msg");
  const btn = document.getElementById("submit-btn");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    errorMsg.classList.remove("visible");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    btn.disabled = true;
    btn.textContent = "Ingresando...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/dashboard");
    } catch (err) {
      let msg = "Error al ingresar. Verificá tus datos.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        msg = "Email o contraseña incorrectos";
      } else if (err.code === "auth/user-not-found") {
        msg = "No existe una cuenta con ese email";
      } else if (err.code === "auth/too-many-requests") {
        msg = "Demasiados intentos. Intentá en unos minutos.";
      } else if (err.code === "auth/network-request-failed") {
        msg = "Sin conexión a internet";
      }
      errorMsg.textContent = msg;
      errorMsg.classList.add("visible");
      btn.disabled = false;
      btn.textContent = "Ingresar";
    }
  });
}
