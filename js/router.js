// ============================================================================
// router.js — router de hash + carga de sesión (user + rol + permisos)
// ============================================================================
//
// Este router hace DOS cosas:
//
//   1. Router de hashes estilo SPA (registerRoute / navigate / matchRoute).
//
//   2. Gestor de sesión: escucha onAuthStateChanged, y cuando hay un user
//      autenticado, carga su doc en /users/{uid}. Si el doc existe y tiene
//      type === 'admin', NO necesita perfil. Si es 'colab', carga su perfil
//      de /roleProfiles/{roleProfileId} y deriva los permisos.
//
// Flujo de bloqueo:
//   - Autenticado + sin doc en /users  → logout forzado + mensaje (salvo
//     RECOVERY_ADMIN_EMAIL, que va a pantalla de recuperación)
//   - Autenticado + doc existe + perfil inexistente/inactivo → logout forzado
//
// Lo expuesto al resto de la app:
//   - getCurrentUser()         → objeto user de Firebase Auth
//   - getCurrentRole()         → 'admin' | 'colab' | null
//   - getCurrentPermissions()  → objeto de permisos normalizado
//   - getCurrentProfile()      → doc del roleProfile (o null para admin)
// ============================================================================

import { auth, db } from "./firebase/config.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  fullPermissions,
  normalizePermissions
} from "./shared/permissions.js";

// ----------------------------------------------------------------------------
// MODO RECUPERACIÓN
// ----------------------------------------------------------------------------
// Si este email se loguea y NO tiene doc en /users, en lugar de bloquearlo
// lo mandamos a una pantalla que le dice cómo crear su propio doc admin
// desde Firebase Console. Esto previene quedar trancado sin acceso si
// accidentalmente se borra el doc del admin principal.
// Si querés cambiarlo, editá esta constante.
const RECOVERY_ADMIN_EMAIL = "simon@ovagym.com";
// ----------------------------------------------------------------------------

const routes = {};

let currentUser = null;
let currentRole = null;           // 'admin' | 'colab' | null
let currentUserDoc = null;        // doc completo de /users/{uid}
let currentProfile = null;        // doc de /roleProfiles/{id} (null para admin)
let currentPermissions = null;    // objeto normalizado de permisos
let sessionReady = false;         // true cuando terminó la primera carga

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

function matchRoute(hash) {
  const path = hash.replace(/^#/, "") || "/";

  if (routes[path]) return { handler: routes[path], params: {} };

  for (const [pattern, handler] of Object.entries(routes)) {
    if (!pattern.includes(":")) continue;
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let matches = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return { handler, params };
  }

  return null;
}

function render() {
  const appRoot = document.getElementById("app");

  // No renderizar hasta que la sesión haya terminado de cargar — evita
  // flashes de login cuando ya estás logueado o viceversa.
  if (!sessionReady) return;

  const match = matchRoute(window.location.hash);

  if (!match) {
    appRoot.innerHTML = `
      <div class="login-wrap">
        <div class="login-box">
          <h1>404</h1>
          <div class="sub">Ruta no encontrada</div>
          <button class="btn" onclick="window.location.hash='/'">Volver al inicio</button>
        </div>
      </div>
    `;
    return;
  }

  match.handler({
    user: currentUser,
    role: currentRole,
    userDoc: currentUserDoc,
    profile: currentProfile,
    permissions: currentPermissions,
    params: match.params,
    root: appRoot
  });
}

// ----------------------------------------------------------------------------
// Pantallas de bloqueo (in-line, no dependen del resto del sistema)
// ----------------------------------------------------------------------------

function renderBlockedScreen(title, message, buttonLabel = "Volver al login") {
  const appRoot = document.getElementById("app");
  appRoot.innerHTML = `
    <div class="login-wrap">
      <div class="login-box">
        <h1>${title}</h1>
        <div class="sub" style="margin-bottom:20px">${message}</div>
        <button class="btn primary" id="blocked-back" style="width:100%;padding:14px">
          ${buttonLabel}
        </button>
      </div>
    </div>
  `;
  document.getElementById("blocked-back").addEventListener("click", () => {
    window.location.hash = "/login";
    window.location.reload();
  });
}

function renderRecoveryScreen(uid, email) {
  const appRoot = document.getElementById("app");
  appRoot.innerHTML = `
    <div class="login-wrap">
      <div class="login-box" style="max-width:560px">
        <h1>Modo <span class="accent">recuperación</span></h1>
        <div class="sub" style="margin-bottom:20px">
          Estás logueado como admin pero no existe tu documento en Firestore.
        </div>

        <div class="note warn" style="margin-bottom:20px;text-align:left">
          <strong>Qué hacer:</strong><br>
          Andá a Firebase Console → Firestore → colección <code>users</code> →
          creá un documento con el ID que se muestra abajo y estos campos:
          <br><br>
          <code style="display:block;background:var(--bg-2);padding:10px;border-radius:6px;font-size:11px;line-height:1.8">
            email: "${email}"<br>
            displayName: "Tu nombre"<br>
            type: "admin"<br>
            active: true<br>
            createdAt: (timestamp, now)
          </code>
        </div>

        <div class="form-field">
          <label>UID para usar como Document ID</label>
          <input type="text" value="${uid}" readonly id="recovery-uid" style="font-family:var(--font-mono);font-size:11px">
        </div>

        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn" id="recovery-copy" style="flex:1">Copiar UID</button>
          <button class="btn primary" id="recovery-reload" style="flex:1">Ya lo creé, recargar</button>
        </div>

        <div style="margin-top:16px;text-align:center">
          <a href="#" id="recovery-logout" style="color:var(--ink-3);font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none">
            Cerrar sesión
          </a>
        </div>
      </div>
    </div>
  `;

  document.getElementById("recovery-copy").addEventListener("click", () => {
    const input = document.getElementById("recovery-uid");
    input.select();
    navigator.clipboard.writeText(uid).then(() => {
      const btn = document.getElementById("recovery-copy");
      const prev = btn.textContent;
      btn.textContent = "¡Copiado!";
      setTimeout(() => { btn.textContent = prev; }, 1500);
    });
  });

  document.getElementById("recovery-reload").addEventListener("click", () => {
    window.location.reload();
  });

  document.getElementById("recovery-logout").addEventListener("click", async e => {
    e.preventDefault();
    await signOut(auth);
    window.location.hash = "/login";
    window.location.reload();
  });
}

// ----------------------------------------------------------------------------
// Carga de sesión: user doc + role profile + permisos
// ----------------------------------------------------------------------------

/**
 * Indica si la URL actual corresponde al portal cliente.
 * El portal usa hashes tipo #/c/<token> y NO debe pasar por el flujo de
 * validación admin/colab (el cliente se autentica anónimamente y no tiene
 * doc en /users/).
 */
function isClientPortalRoute() {
  const hash = window.location.hash || "";
  return hash.startsWith("#/c/") || hash === "#/c";
}

async function loadUserSession(user) {
  // Reseteamos el estado antes de cargar
  currentUser = user;
  currentUserDoc = null;
  currentRole = null;
  currentProfile = null;
  currentPermissions = null;

  if (!user) return { ok: true };

  // Si el usuario es anónimo (portal cliente) no intentamos cargar /users/{uid}.
  // El client-portal maneja su propio estado internamente.
  if (user.isAnonymous) {
    return { ok: true, isAnonymous: true };
  }

  // 1) Leer el doc /users/{uid}
  let userSnap;
  try {
    userSnap = await getDoc(doc(db, "users", user.uid));
  } catch (err) {
    console.error("[router] Error leyendo /users/{uid}:", err);
    return { ok: false, reason: "error", message: "No se pudo contactar con Firestore. Revisá tu conexión e intentá de nuevo." };
  }

  if (!userSnap.exists()) {
    // Modo recuperación para el admin principal
    if (user.email && user.email.toLowerCase() === RECOVERY_ADMIN_EMAIL.toLowerCase()) {
      return { ok: false, reason: "recovery" };
    }
    return { ok: false, reason: "no-user-doc" };
  }

  const userData = userSnap.data();
  currentUserDoc = { id: userSnap.id, ...userData };

  // Usuario inactivo
  if (userData.active === false) {
    return { ok: false, reason: "inactive" };
  }

  // 2) Derivar rol y permisos
  if (userData.type === "admin") {
    currentRole = "admin";
    currentProfile = null;
    currentPermissions = fullPermissions();
    return { ok: true };
  }

  if (userData.type === "colab") {
    currentRole = "colab";

    if (!userData.roleProfileId) {
      return { ok: false, reason: "no-profile-assigned" };
    }

    let profileSnap;
    try {
      profileSnap = await getDoc(doc(db, "roleProfiles", userData.roleProfileId));
    } catch (err) {
      console.error("[router] Error leyendo /roleProfiles:", err);
      return { ok: false, reason: "error", message: "No se pudo cargar tu perfil de permisos." };
    }

    if (!profileSnap.exists()) {
      return { ok: false, reason: "profile-not-found" };
    }

    const profileData = profileSnap.data();
    if (profileData.active === false) {
      return { ok: false, reason: "profile-inactive" };
    }

    currentProfile = { id: profileSnap.id, ...profileData };
    currentPermissions = normalizePermissions(profileData.permissions);
    return { ok: true };
  }

  // Tipo desconocido
  return { ok: false, reason: "unknown-type" };
}

// ----------------------------------------------------------------------------
// Mensajes para cada razón de bloqueo
// ----------------------------------------------------------------------------

const BLOCK_MESSAGES = {
  "no-user-doc": {
    title: "Cuenta no autorizada",
    message: "Tu cuenta está autenticada pero no tiene perfil en el sistema. Contactá al administrador para que te habilite."
  },
  "inactive": {
    title: "Cuenta desactivada",
    message: "Tu cuenta está marcada como inactiva. Contactá al administrador."
  },
  "no-profile-assigned": {
    title: "Perfil sin asignar",
    message: "Tu cuenta no tiene un perfil de rol asignado. Contactá al administrador."
  },
  "profile-not-found": {
    title: "Perfil inválido",
    message: "El perfil de rol asignado a tu cuenta no existe. Contactá al administrador."
  },
  "profile-inactive": {
    title: "Perfil desactivado",
    message: "El perfil de rol asignado a tu cuenta está desactivado. Contactá al administrador."
  },
  "unknown-type": {
    title: "Tipo de cuenta inválido",
    message: "Tu cuenta tiene un tipo de usuario desconocido. Contactá al administrador."
  }
};

// ----------------------------------------------------------------------------
// Startup
// ----------------------------------------------------------------------------

export function startRouter() {
  window.addEventListener("hashchange", render);

  // Si arrancamos directamente en una ruta del portal cliente, el router NO
  // necesita esperar al flujo de auth admin (la sesión cliente vive en otra
  // instancia de Firebase). Renderizamos de inmediato y el portal se auto-
  // gestiona internamente.
  if (isClientPortalRoute()) {
    sessionReady = true;
    currentUser = null;
    currentRole = "client-anon";
    currentUserDoc = null;
    currentProfile = null;
    currentPermissions = null;
    render();
    // No suscribimos al onAuthStateChanged de la app principal porque no
    // nos interesa: estamos en el portal cliente. Si el usuario navega
    // fuera del portal (cambia el hash), el evento hashchange hará render().
    return;
  }

  onAuthStateChanged(auth, async user => {
    const result = await loadUserSession(user);
    sessionReady = true;

    // Caso 1: no hay user (logout) → redirigir a login
    if (!user) {
      if (window.location.hash !== "#/login") {
        window.location.hash = "/login";
      } else {
        render();
      }
      return;
    }

    // Caso especial: usuario anónimo pero NO estamos en ruta del portal cliente.
    // En la NUEVA arquitectura esto NO debería ocurrir (los anónimos viven en
    // la instancia clientAuth, no en ésta). Si ocurre, es residual de una
    // sesión vieja — hacemos signOut silencioso.
    if (user.isAnonymous) {
      await signOut(auth);
      window.location.hash = "/login";
      return;
    }

    // Caso 2: sesión cargada ok → navegar a dashboard (o respetar hash actual)
    if (result.ok) {
      if (!window.location.hash || window.location.hash === "#/login" || window.location.hash === "#/") {
        window.location.hash = "/dashboard";
      } else {
        render();
      }
      return;
    }

    // Caso 3: bloqueo — modo recuperación
    if (result.reason === "recovery") {
      renderRecoveryScreen(user.uid, user.email);
      return;
    }

    // Caso 4: bloqueo — cerrar sesión y mostrar mensaje
    const blockInfo = BLOCK_MESSAGES[result.reason] || {
      title: "Acceso denegado",
      message: result.message || "No se puede acceder al sistema."
    };

    await signOut(auth);
    renderBlockedScreen(blockInfo.title, blockInfo.message);
  });
}

// ----------------------------------------------------------------------------
// API pública
// ----------------------------------------------------------------------------

export function getCurrentUser()         { return currentUser; }
export function getCurrentRole()         { return currentRole; }
export function getCurrentUserDoc()      { return currentUserDoc; }
export function getCurrentProfile()      { return currentProfile; }
export function getCurrentPermissions()  { return currentPermissions; }
export function isSessionReady()         { return sessionReady; }
