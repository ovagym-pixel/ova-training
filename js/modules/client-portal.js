// ============================================================================
// client-portal.js — entrada al portal cliente
// ============================================================================
//
// Ruta: /c/:token
//
// Este módulo es un "sub-router" que:
//   1. Valida que haya un token en la URL
//   2. Autentica anónimamente al cliente
//   3. Carga /clientAccess/{token}
//   4. Decide qué pantalla mostrar según el estado
//   5. Renderiza la pantalla correspondiente
//
// Pantallas:
//   - notfound   → el token no existe
//   - disabled   → el portal está desactivado
//   - locked     → bloqueado temporalmente
//   - setPin     → primera vez, elegir PIN
//   - enterPin   → ya hay PIN, este device no es confiable
//   - ready      → renderizar el home del portal
// ============================================================================

import {
  ensureAnonAuth,
  loadAccessDoc,
  computeAuthState,
  setInitialPin,
  validatePinAttempt,
  rememberLastToken
} from "../shared/client-session.js";
import { validatePinFormat } from "../shared/crypto.js";
import { renderPortalHome } from "./client-portal/portal-home.js";

export async function renderClientPortal({ params, root }) {
  const token = params.token;

  if (!token) {
    renderGenericError(root, "Link inválido", "El link que usaste no es correcto. Pedile a tu instructor un link nuevo.");
    return;
  }

  rememberLastToken(token);

  // Loading inicial
  root.innerHTML = renderLoading("Conectando con el sistema…");

  let uid, access;
  try {
    uid = await ensureAnonAuth();
  } catch (err) {
    console.error(err);
    renderGenericError(root, "Error de conexión", "No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.");
    return;
  }

  try {
    access = await loadAccessDoc(token);
  } catch (err) {
    console.error(err);
    renderGenericError(root, "Error de conexión", "No se pudo acceder a los datos. Revisá tu conexión e intentá de nuevo.");
    return;
  }

  const authState = computeAuthState(access, uid);

  switch (authState.state) {
    case "notfound":
      renderGenericError(root, "Link inválido",
        "Este link no corresponde a ninguna cuenta activa. Pedile a tu instructor un link nuevo.");
      return;

    case "disabled":
      renderGenericError(root, "Acceso desactivado",
        "Tu acceso al portal está desactivado temporalmente. Contactá a tu instructor.");
      return;

    case "locked":
      renderLocked(root, authState.until);
      return;

    case "setPin":
      renderSetPin(root, token, access);
      return;

    case "enterPin":
      renderEnterPin(root, token, access);
      return;

    case "ready":
      await renderPortalHome({ root, access, uid });
      return;
  }

  renderGenericError(root, "Estado desconocido", "Algo inesperado ocurrió. Recargá la página.");
}

// ============================================================================
// Pantallas de error / bloqueo (simples, reutilizan estilos del login)
// ============================================================================

function renderLoading(msg) {
  return `
    <div class="client-portal-wrap">
      <div class="client-card">
        <div class="spinner"></div>
        <div class="client-loading-label">${escapeHtml(msg)}</div>
      </div>
    </div>
  `;
}

function renderGenericError(root, title, message) {
  root.innerHTML = `
    <div class="client-portal-wrap">
      <div class="client-card">
        <div class="client-logo">OVA <span class="accent">Training</span></div>
        <h2 style="margin-top:20px">${escapeHtml(title)}</h2>
        <p style="color:var(--ink-2);margin-top:12px;line-height:1.5">${escapeHtml(message)}</p>
      </div>
    </div>
  `;
}

function renderLocked(root, untilMs) {
  const minutes = Math.ceil((untilMs - Date.now()) / 60000);
  root.innerHTML = `
    <div class="client-portal-wrap">
      <div class="client-card">
        <div class="client-logo">OVA <span class="accent">Training</span></div>
        <h2 style="margin-top:20px">Acceso bloqueado</h2>
        <p style="color:var(--ink-2);margin-top:12px;line-height:1.5">
          Demasiados intentos fallidos. Probá de nuevo en
          <strong>${minutes} ${minutes === 1 ? "minuto" : "minutos"}</strong>.
        </p>
        <p style="color:var(--ink-3);margin-top:20px;font-size:13px">
          Si perdiste tu PIN, contactá a tu instructor para resetearlo.
        </p>
      </div>
    </div>
  `;
}

// ============================================================================
// Pantalla: Setear PIN por primera vez
// ============================================================================

function renderSetPin(root, token, access) {
  const displayName = access.displayName || "Hola";

  root.innerHTML = `
    <div class="client-portal-wrap">
      <div class="client-card">
        <div class="client-logo">OVA <span class="accent">Training</span></div>

        <h2 style="margin-top:20px">¡Bienvenido, ${escapeHtml(displayName)}!</h2>
        <p style="color:var(--ink-2);margin-top:8px;line-height:1.5">
          Es la primera vez que entrás al portal. Elegí un PIN que vas a usar
          cada vez que accedas desde un dispositivo nuevo.
        </p>

        <div class="form-field" style="margin-top:24px">
          <label>PIN (4 a 6 caracteres, letras o números)</label>
          <input type="text" id="pin-input" maxlength="6" autocomplete="off" inputmode="text"
                 style="text-transform:uppercase;letter-spacing:0.2em;font-family:var(--font-mono);font-size:18px;text-align:center">
        </div>

        <div class="form-field" style="margin-top:12px">
          <label>Confirmá tu PIN</label>
          <input type="text" id="pin-confirm" maxlength="6" autocomplete="off" inputmode="text"
                 style="text-transform:uppercase;letter-spacing:0.2em;font-family:var(--font-mono);font-size:18px;text-align:center">
        </div>

        <div class="error" id="set-pin-error"></div>

        <button class="btn primary" id="set-pin-btn" style="width:100%;margin-top:20px;padding:14px">
          Guardar PIN y entrar
        </button>

        <div style="margin-top:20px;padding:12px;background:var(--bg-2);border-radius:8px;font-size:12px;color:var(--ink-3);line-height:1.5">
          <strong>Consejo:</strong> elegí un PIN que recuerdes fácil. No uses
          fechas obvias (como tu cumpleaños). Si lo olvidás, tu instructor
          puede resetearlo.
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById("set-pin-btn");
  const errorEl = document.getElementById("set-pin-error");
  const input = document.getElementById("pin-input");
  const confirm = document.getElementById("pin-confirm");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
  }
  function clearError() {
    errorEl.classList.remove("visible");
  }

  btn.addEventListener("click", async () => {
    clearError();
    const pin = input.value;
    const conf = confirm.value;

    const fmt = validatePinFormat(pin);
    if (!fmt.ok) { showError(fmt.error); return; }
    if (pin.trim().toUpperCase() !== conf.trim().toUpperCase()) {
      showError("Los PIN no coinciden. Volvé a escribirlos.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Guardando…";

    try {
      await setInitialPin(token, pin, access.clientId);
      // Recargar para que el router re-evalúe el estado (ahora ready)
      window.location.reload();
    } catch (err) {
      console.error(err);
      showError("Error al guardar el PIN: " + err.message);
      btn.disabled = false;
      btn.textContent = "Guardar PIN y entrar";
    }
  });

  input.focus();
}

// ============================================================================
// Pantalla: Ingresar PIN existente
// ============================================================================

function renderEnterPin(root, token, access) {
  const displayName = access.displayName || "";

  root.innerHTML = `
    <div class="client-portal-wrap">
      <div class="client-card">
        <div class="client-logo">OVA <span class="accent">Training</span></div>

        ${displayName ? `<h2 style="margin-top:20px">Hola, ${escapeHtml(displayName)}</h2>` : ""}
        <p style="color:var(--ink-2);margin-top:8px;line-height:1.5">
          Este es un dispositivo nuevo. Ingresá tu PIN para continuar.
        </p>

        <div class="form-field" style="margin-top:24px">
          <label>Tu PIN</label>
          <input type="text" id="pin-input" maxlength="6" autocomplete="off" inputmode="text"
                 style="text-transform:uppercase;letter-spacing:0.2em;font-family:var(--font-mono);font-size:18px;text-align:center">
        </div>

        <div class="error" id="enter-pin-error"></div>

        <button class="btn primary" id="enter-pin-btn" style="width:100%;margin-top:20px;padding:14px">
          Ingresar
        </button>

        <div style="margin-top:20px;text-align:center;font-size:12px;color:var(--ink-3)">
          ¿No recordás tu PIN? Pedile a tu instructor que te lo resetee.
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById("enter-pin-btn");
  const errorEl = document.getElementById("enter-pin-error");
  const input = document.getElementById("pin-input");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
  }
  function clearError() {
    errorEl.classList.remove("visible");
  }

  async function attempt() {
    clearError();
    const pin = input.value;
    btn.disabled = true;
    btn.textContent = "Verificando…";

    try {
      const result = await validatePinAttempt(token, pin, access.clientId);
      if (result.ok) {
        window.location.reload();
        return;
      }

      if (result.reason === "locked") {
        renderLocked(root, result.until);
        return;
      }

      if (result.reason === "badFormat") {
        showError(result.error);
      } else if (result.reason === "badPin") {
        showError(`PIN incorrecto. Te quedan ${result.remaining} ${result.remaining === 1 ? "intento" : "intentos"}.`);
        input.value = "";
        input.focus();
      } else {
        showError("No se pudo verificar el PIN. Intentá de nuevo.");
      }
    } catch (err) {
      console.error(err);
      showError("Error al verificar: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Ingresar";
    }
  }

  btn.addEventListener("click", attempt);
  input.addEventListener("keypress", e => {
    if (e.key === "Enter") attempt();
  });
  input.focus();
}

// ============================================================================
// Utils
// ============================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
