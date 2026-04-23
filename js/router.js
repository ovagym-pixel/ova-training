import { auth } from "./firebase/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const routes = {};
let currentUser = null;
let currentUserRole = null;

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
  const match = matchRoute(window.location.hash);
  const appRoot = document.getElementById("app");

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
    role: currentUserRole,
    params: match.params,
    root: appRoot
  });
}

export function startRouter() {
  window.addEventListener("hashchange", render);

  onAuthStateChanged(auth, async user => {
    currentUser = user;
    currentUserRole = null;

    if (user) {
      const email = user.email;
      currentUserRole = email === "simon.fattobene.w@gmail.com" ? "admin" : "colab";
    }

    if (!window.location.hash) {
      window.location.hash = user ? "/dashboard" : "/login";
    } else {
      render();
    }
  });
}

export function getCurrentUser() { return currentUser; }
export function getCurrentRole() { return currentUserRole; }
