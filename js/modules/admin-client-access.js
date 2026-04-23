// ============================================================================
// admin-client-access.js — pantalla temporal de gestión de acceso cliente (B.2.4)
// ============================================================================
//
// Solo accesible por admin (ruta /admin-client-access).
// Pantalla de debug mientras no existe el módulo completo de clientes (B.3).
//
// Permite:
//   - Listar clientes existentes
//   - Crear un "cliente de prueba" (con datos dummy)
//   - Ver el link completo del portal para cada cliente
//   - Copiar el link al clipboard
//   - Ver dispositivos confiables con botón "revocar"
//   - Regenerar accessToken (invalida el link viejo)
//   - Resetear PIN
//   - Activar/desactivar acceso al portal
//
// Cuando se construya B.3 (CRUD de clientes), esta pantalla se puede
// eliminar o integrar al detalle del cliente.
// ============================================================================

import { db } from "../firebase/config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { navigate } from "../router.js";
import { renderTopbar, attachTopbarBehavior } from "../shared/topbar.js";
import { generateAccessToken } from "../shared/crypto.js";

// Base del portal — se calcula desde window.location para funcionar
// tanto en localhost como en github.io
function portalBaseUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname;
  return `${origin}${path}#/c/`;
}

// ============================================================================
// Render principal
// ============================================================================

export async function renderAdminClientAccess({ user, role, root }) {
  if (!user) { navigate("/login"); return; }
  if (role !== "admin") { navigate("/dashboard"); return; }

  root.innerHTML = `
    ${renderTopbar(role)}
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">§ Gestión</div>
          <a href="#/dashboard"><span class="num">01</span><span>Dashboard</span></a>
          <a><span class="num">02</span><span>Clientes</span></a>
          <a><span class="num">03</span><span>Colaboradores</span></a>
          <a href="#/role-profiles"><span class="num">04</span><span>Perfiles de rol</span></a>
          <a href="#/admin-client-access" class="active"><span class="num">05</span><span>Acceso cliente (debug)</span></a>
          <div class="divider"></div>
          <a id="logout-link" style="color:var(--danger)"><span class="num">×</span><span>Cerrar sesión</span></a>
        </div>
      </aside>

      <main class="main">
        <div class="breadcrumb">
          <span>OVA TRAINING</span>
          <span class="sep">/</span>
          <span>GESTIÓN</span>
          <span class="sep">/</span>
          <span class="current">ACCESO CLIENTE (DEBUG)</span>
        </div>
        <div class="kicker">§ 05 · Portal cliente</div>
        <h1>Acceso <span class="accent">cliente</span>.</h1>
        <p style="color:var(--ink-2);max-width:680px;margin-bottom:16px">
          Pantalla temporal para probar el flujo del portal cliente (B.2.4).
          Cuando haya CRUD de clientes completo, estas acciones migran al
          detalle de cada cliente.
        </p>

        <div class="note warn" style="margin-bottom:24px">
          <strong>Atención:</strong> esta pantalla es para debug. Los clientes de
          prueba creados acá son reales en Firestore — si los creás y no los usás,
          borralos desde Firebase Console para mantener la base limpia.
        </div>

        <div style="margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn primary" id="new-test-client">+ Crear cliente de prueba</button>
          <button class="btn" id="refresh-btn">Recargar lista</button>
        </div>

        <div id="clients-list">
          <div class="note info">Cargando clientes…</div>
        </div>
      </main>
    </div>
  `;

  document.getElementById("logout-link").addEventListener("click", async () => {
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { auth } = await import("../firebase/config.js");
    await signOut(auth);
    navigate("/login");
  });

  document.getElementById("new-test-client").addEventListener("click", createTestClient);
  document.getElementById("refresh-btn").addEventListener("click", refreshList);

  attachTopbarBehavior();
  await refreshList();
}

// ============================================================================
// Listar clientes
// ============================================================================

async function refreshList() {
  const wrap = document.getElementById("clients-list");
  wrap.innerHTML = `<div class="note info">Cargando clientes…</div>`;

  let clients;
  try {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    clients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="note danger">Error: ${err.message}</div>`;
    return;
  }

  if (clients.length === 0) {
    wrap.innerHTML = `
      <div class="note">
        No hay clientes todavía. Tocá <strong>"+ Crear cliente de prueba"</strong>
        para crear uno y probar el flujo.
      </div>
    `;
    return;
  }

  wrap.innerHTML = clients.map(c => renderClientCard(c)).join("");

  // Wire up buttons
  wrap.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleAction(btn.dataset.action, btn.dataset.id, btn.dataset.extra));
  });
}

function renderClientCard(c) {
  const link = portalBaseUrl() + (c.accessToken || "SIN-TOKEN");
  const active = c.clientPortalActive !== false;
  const hasPin = !!c.pinHash;
  const devices = Array.isArray(c.trustedDevices) ? c.trustedDevices : [];
  const failed = c.pinFailedAttempts || 0;
  const lockedUntil = c.pinLockedUntil?.toMillis ? c.pinLockedUntil.toMillis() : null;
  const isLocked = lockedUntil && lockedUntil > Date.now();

  return `
    <div class="admin-client-card">
      <div class="admin-client-header">
        <div>
          <strong style="font-size:16px">${escapeHtml(c.displayName || "(sin nombre)")}</strong>
          ${active
            ? `<span class="pill ok" style="margin-left:8px">Activo</span>`
            : `<span class="pill gray" style="margin-left:8px">Desactivado</span>`}
          ${hasPin
            ? `<span class="pill info" style="margin-left:6px">PIN configurado</span>`
            : `<span class="pill warn" style="margin-left:6px">Sin PIN</span>`}
          ${isLocked ? `<span class="pill danger" style="margin-left:6px">Bloqueado</span>` : ""}
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-3);letter-spacing:0.08em;text-transform:uppercase">
          ID: ${c.id}
        </div>
      </div>

      <div class="admin-client-body">
        <div style="margin-bottom:12px">
          <label class="admin-field-label">Link del portal</label>
          <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
            <input type="text" readonly value="${link}"
                   style="flex:1;background:var(--bg-2);border:1px solid var(--line);padding:8px 10px;border-radius:6px;font-family:var(--font-mono);font-size:11px;color:var(--ink-2)">
            <button class="btn" data-action="copy-link" data-id="${c.id}" data-extra="${escapeAttr(link)}" style="padding:8px 12px;font-size:11px">Copiar</button>
            <button class="btn" data-action="open-link" data-id="${c.id}" data-extra="${escapeAttr(link)}" style="padding:8px 12px;font-size:11px">Abrir</button>
          </div>
        </div>

        <div style="margin-bottom:12px">
          <label class="admin-field-label">Dispositivos confiables (${devices.length})</label>
          ${devices.length === 0
            ? `<div style="font-size:12px;color:var(--ink-3);margin-top:4px">Ninguno todavía. El cliente va a agregar uno cuando valide el PIN.</div>`
            : `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
                ${devices.map(d => `
                  <div class="admin-device-row">
                    <div>
                      <strong style="font-size:13px">${escapeHtml(d.label || "Dispositivo")}</strong>
                      <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-3)">uid: ${d.uid.slice(0, 16)}…</div>
                    </div>
                    <button class="btn danger" data-action="revoke-device" data-id="${c.id}" data-extra="${d.uid}" style="padding:4px 10px;font-size:11px">Revocar</button>
                  </div>
                `).join("")}
               </div>`
          }
        </div>

        ${failed > 0 || isLocked
          ? `<div class="note warn" style="margin-bottom:12px;font-size:12px">
              Intentos fallidos: ${failed}
              ${isLocked ? ` · Bloqueado hasta ${new Date(lockedUntil).toLocaleString()}` : ""}
             </div>`
          : ""
        }

        <div class="admin-actions-row">
          <button class="btn" data-action="regenerate-token" data-id="${c.id}">Regenerar link</button>
          <button class="btn" data-action="reset-pin" data-id="${c.id}">Resetear PIN</button>
          <button class="btn" data-action="toggle-active" data-id="${c.id}">
            ${active ? "Desactivar portal" : "Activar portal"}
          </button>
          ${isLocked
            ? `<button class="btn" data-action="unlock" data-id="${c.id}">Desbloquear</button>`
            : ""
          }
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Acciones
// ============================================================================

async function handleAction(action, clientId, extra) {
  try {
    switch (action) {
      case "copy-link":
        await navigator.clipboard.writeText(extra);
        toast("Link copiado");
        break;

      case "open-link":
        window.open(extra, "_blank");
        break;

      case "regenerate-token":
        await regenerateToken(clientId);
        break;

      case "reset-pin":
        await resetPin(clientId);
        break;

      case "toggle-active":
        await togglePortalActive(clientId);
        break;

      case "revoke-device":
        await revokeDevice(clientId, extra);
        break;

      case "unlock":
        await unlockClient(clientId);
        break;
    }
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
}

async function loadClient(clientId) {
  const snap = await getDoc(doc(db, "clients", clientId));
  if (!snap.exists()) throw new Error("Cliente no encontrado");
  return { id: snap.id, ...snap.data() };
}

async function regenerateToken(clientId) {
  if (!confirm("¿Regenerar link? El link viejo va a dejar de funcionar.")) return;

  const oldClient = await loadClient(clientId);
  const oldToken = oldClient.accessToken;
  const newToken = generateAccessToken(40);
  const trustedUids = oldClient.trustedUids
    || (oldClient.trustedDevices || []).map(d => d.uid);

  // 1) Crear nuevo clientAccess
  await setDoc(doc(db, "clientAccess", newToken), {
    clientId: clientId,
    displayName: oldClient.displayName || "",
    pinHash: oldClient.pinHash || null,
    salt: oldClient.salt || null,
    pinSetAt: oldClient.pinSetAt || null,
    pinFailedAttempts: oldClient.pinFailedAttempts || 0,
    pinLockedUntil: oldClient.pinLockedUntil || null,
    trustedUids,
    clientPortalActive: oldClient.clientPortalActive !== false,
    createdAt: serverTimestamp()
  });

  // 2) Actualizar /clients
  await updateDoc(doc(db, "clients", clientId), {
    accessToken: newToken,
    accessTokenGeneratedAt: serverTimestamp(),
    trustedUids
  });

  // 3) Invalidar el clientAccess viejo (si había)
  if (oldToken && oldToken !== newToken) {
    try {
      await setDoc(
        doc(db, "clientAccess", oldToken),
        { invalidated: true, invalidatedAt: serverTimestamp(), clientPortalActive: false },
        { merge: true }
      );
    } catch {}
  }

  toast("Link regenerado");
  await refreshList();
}

async function resetPin(clientId) {
  if (!confirm("¿Resetear PIN? El cliente va a tener que elegir un PIN nuevo la próxima vez que entre.")) return;

  const client = await loadClient(clientId);
  const token = client.accessToken;

  const pinUpdate = {
    pinHash: deleteField(),
    salt: deleteField(),
    pinSetAt: deleteField(),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    trustedDevices: [],
    trustedUids: []
  };

  await updateDoc(doc(db, "clients", clientId), pinUpdate);

  if (token) {
    await updateDoc(doc(db, "clientAccess", token), {
      pinHash: deleteField(),
      salt: deleteField(),
      pinSetAt: deleteField(),
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      trustedUids: []
    });
  }

  toast("PIN reseteado");
  await refreshList();
}

async function togglePortalActive(clientId) {
  const client = await loadClient(clientId);
  const nextActive = !(client.clientPortalActive !== false);

  await updateDoc(doc(db, "clients", clientId), {
    clientPortalActive: nextActive,
    updatedAt: serverTimestamp()
  });

  if (client.accessToken) {
    await updateDoc(doc(db, "clientAccess", client.accessToken), {
      clientPortalActive: nextActive
    });
  }

  toast(nextActive ? "Portal activado" : "Portal desactivado");
  await refreshList();
}

async function revokeDevice(clientId, uidToRevoke) {
  if (!confirm(`¿Revocar este dispositivo? La próxima vez que entre desde ese celu le va a pedir el PIN.`)) return;

  const client = await loadClient(clientId);
  const newDevices = (client.trustedDevices || []).filter(d => d.uid !== uidToRevoke);
  const newUids = (client.trustedUids || []).filter(u => u !== uidToRevoke);

  await updateDoc(doc(db, "clients", clientId), {
    trustedDevices: newDevices,
    trustedUids: newUids,
    updatedAt: serverTimestamp()
  });

  if (client.accessToken) {
    const access = await getDoc(doc(db, "clientAccess", client.accessToken));
    if (access.exists()) {
      const uids = (access.data().trustedUids || []).filter(u => u !== uidToRevoke);
      await updateDoc(doc(db, "clientAccess", client.accessToken), {
        trustedUids: uids
      });
    }
  }

  toast("Dispositivo revocado");
  await refreshList();
}

async function unlockClient(clientId) {
  const client = await loadClient(clientId);

  await updateDoc(doc(db, "clients", clientId), {
    pinFailedAttempts: 0,
    pinLockedUntil: null
  });

  if (client.accessToken) {
    await updateDoc(doc(db, "clientAccess", client.accessToken), {
      pinFailedAttempts: 0,
      pinLockedUntil: null
    });
  }

  toast("Cliente desbloqueado");
  await refreshList();
}

// ============================================================================
// Crear cliente de prueba
// ============================================================================

async function createTestClient() {
  const btn = document.getElementById("new-test-client");
  btn.disabled = true;
  btn.textContent = "Creando…";

  try {
    const name = prompt("Nombre del cliente de prueba:", "Cliente Prueba " + Math.floor(Math.random() * 1000));
    if (!name) { btn.disabled = false; btn.textContent = "+ Crear cliente de prueba"; return; }

    const accessToken = generateAccessToken(40);

    // 1) Crear /clients/{newId}
    const clientRef = doc(collection(db, "clients"));
    const clientId = clientRef.id;

    await setDoc(clientRef, {
      displayName: name,
      phone: "",
      assignedColabId: null,
      accessToken,
      accessTokenGeneratedAt: serverTimestamp(),
      clientPortalActive: true,
      trustedDevices: [],
      trustedUids: [],
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Flag para identificar que es de prueba
      _testClient: true
    });

    // 2) Crear /clientsPublic/{newId}
    await setDoc(doc(db, "clientsPublic", clientId), {
      displayName: name,
      phone: "",
      photoUrl: "",
      emergencyContact: "",
      currentServiceName: "Plan de prueba",
      currentServiceVigencia: "",
      updatedAt: serverTimestamp()
    });

    // 3) Crear /clientAccess/{token}
    await setDoc(doc(db, "clientAccess", accessToken), {
      clientId,
      displayName: name,
      clientPortalActive: true,
      trustedUids: [],
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      createdAt: serverTimestamp()
    });

    toast("Cliente de prueba creado");
    await refreshList();
  } catch (err) {
    console.error(err);
    alert("Error al crear: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Crear cliente de prueba";
  }
}

// ============================================================================
// Toast helper
// ============================================================================

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast-msg";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("visible"), 10);
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 2200);
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

function escapeAttr(str) {
  return escapeHtml(str);
}
