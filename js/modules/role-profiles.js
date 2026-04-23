// ============================================================================
// role-profiles.js — CRUD de perfiles de rol (B.2.3)
// ============================================================================
//
// Pantalla accesible solo para admin (ruta /role-profiles).
// Permite:
//   - Listar todos los perfiles existentes
//   - Crear uno nuevo (con presets opcionales)
//   - Editar nombre, descripción, permisos, widgets
//   - Desactivar / reactivar
//   - Eliminar (solo si active: false y no es isSystem)
//   - Inicializar el catálogo de widgets en Firestore si todavía no existe
//
// El perfil con isSystem: true (Administrador) se muestra pero NO es editable
// ni eliminable desde la UI.
// ============================================================================

import { db } from "../firebase/config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { navigate, getCurrentRole } from "../router.js";
import { renderTopbar, attachTopbarBehavior } from "../shared/topbar.js";
import {
  PERMISSION_SCHEMA,
  PROFILE_PRESETS,
  emptyPermissions,
  normalizePermissions
} from "../shared/permissions.js";
import {
  loadWidgetsCatalog,
  seedWidgetsCatalog,
  widgetsCatalogExists,
  clearWidgetsCacheLocal
} from "../shared/widgets-catalog.js";

// ----------------------------------------------------------------------------
// Render principal
// ----------------------------------------------------------------------------

export async function renderRoleProfiles({ user, role, root }) {
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
          <a href="#/role-profiles" class="active"><span class="num">04</span><span>Perfiles de rol</span></a>
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
          <span class="current">PERFILES DE ROL</span>
        </div>
        <div class="kicker">§ 04 · Permisos y perfiles</div>
        <h1>Perfiles de <span class="accent">rol</span>.</h1>
        <p style="color:var(--ink-2);max-width:680px;margin-bottom:24px">
          Definí qué puede hacer cada tipo de colaborador. Los permisos se aplican al
          asignar un perfil a un usuario desde la gestión de colaboradores.
        </p>

        <div id="catalog-seed-banner"></div>

        <div style="margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn primary" id="new-profile-btn">+ Nuevo perfil</button>
          <button class="btn" id="refresh-btn">Recargar</button>
        </div>

        <div id="profiles-list-wrap">
          <div class="note info">Cargando perfiles…</div>
        </div>
      </main>
    </div>

    <div id="modal-root"></div>
  `;

  document.getElementById("logout-link").addEventListener("click", async () => {
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { auth } = await import("../firebase/config.js");
    await signOut(auth);
    navigate("/login");
  });

  document.getElementById("new-profile-btn").addEventListener("click", () => openProfileModal(null));
  document.getElementById("refresh-btn").addEventListener("click", () => refreshList());

  attachTopbarBehavior();

  await refreshCatalogBanner();
  await refreshList();
}

// ----------------------------------------------------------------------------
// Banner de seed del catálogo de widgets
// ----------------------------------------------------------------------------

async function refreshCatalogBanner() {
  const el = document.getElementById("catalog-seed-banner");
  if (!el) return;

  const exists = await widgetsCatalogExists();
  if (exists) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="note warn" style="margin-bottom:20px">
      <strong>Catálogo de widgets no inicializado.</strong><br>
      Antes de configurar widgets en los perfiles, creá el catálogo en Firestore.
      <div style="margin-top:12px">
        <button class="btn primary" id="seed-catalog-btn">Inicializar catálogo</button>
      </div>
    </div>
  `;

  document.getElementById("seed-catalog-btn").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Creando…";
    try {
      await seedWidgetsCatalog();
      await refreshCatalogBanner();
    } catch (err) {
      console.error(err);
      alert("Error al inicializar catálogo: " + err.message);
      btn.disabled = false;
      btn.textContent = "Inicializar catálogo";
    }
  });
}

// ----------------------------------------------------------------------------
// Listado de perfiles
// ----------------------------------------------------------------------------

async function loadProfiles() {
  const q = query(collection(db, "roleProfiles"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function refreshList() {
  const wrap = document.getElementById("profiles-list-wrap");
  wrap.innerHTML = `<div class="note info">Cargando perfiles…</div>`;

  let profiles;
  try {
    profiles = await loadProfiles();
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="note danger">Error al cargar perfiles: ${err.message}</div>`;
    return;
  }

  if (profiles.length === 0) {
    wrap.innerHTML = `
      <div class="note">
        Todavía no hay perfiles creados. Empezá creando el perfil
        <strong>"Administrador"</strong> desde el botón de arriba.
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="list">
      <div class="row header">
        <div style="flex:2">Nombre</div>
        <div style="flex:3">Descripción</div>
        <div style="flex:1">Estado</div>
        <div style="flex:1;text-align:right">Acciones</div>
      </div>
      ${profiles.map(p => renderRow(p)).join("")}
    </div>
  `;

  // Delegar eventos
  wrap.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async e => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const profile = profiles.find(x => x.id === id);
      if (!profile) return;

      if (action === "edit") openProfileModal(profile);
      else if (action === "toggle") await toggleProfileActive(profile);
      else if (action === "delete") await deleteProfile(profile);
    });
  });
}

function renderRow(p) {
  const active = p.active !== false;
  const isSystem = p.isSystem === true;

  const statusPill = active
    ? `<span class="pill ok">Activo</span>`
    : `<span class="pill gray">Inactivo</span>`;

  const systemPill = isSystem
    ? `<span class="pill info" style="margin-left:6px">Sistema</span>`
    : "";

  // El perfil del sistema (Administrador) no se puede editar ni borrar
  const actions = isSystem
    ? `<span style="color:var(--ink-3);font-size:11px;font-family:var(--font-mono);letter-spacing:0.08em">SOLO LECTURA</span>`
    : `
      <button class="btn" data-action="edit" data-id="${p.id}" style="padding:6px 10px;font-size:11px">Editar</button>
      <button class="btn" data-action="toggle" data-id="${p.id}" style="padding:6px 10px;font-size:11px">
        ${active ? "Desactivar" : "Activar"}
      </button>
      ${!active ? `<button class="btn danger" data-action="delete" data-id="${p.id}" style="padding:6px 10px;font-size:11px">Eliminar</button>` : ""}
    `;

  return `
    <div class="row">
      <div style="flex:2">
        <strong>${escapeHtml(p.name || "(sin nombre)")}</strong>
        ${systemPill}
      </div>
      <div style="flex:3;color:var(--ink-2);font-size:13px">
        ${escapeHtml(p.description || "—")}
      </div>
      <div style="flex:1">${statusPill}</div>
      <div style="flex:1;text-align:right;display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
        ${actions}
      </div>
    </div>
  `;
}

async function toggleProfileActive(profile) {
  const nextActive = !(profile.active !== false);
  const verb = nextActive ? "activar" : "desactivar";
  if (!confirm(`¿${verb.charAt(0).toUpperCase() + verb.slice(1)} el perfil "${profile.name}"?`)) return;

  try {
    await updateDoc(doc(db, "roleProfiles", profile.id), {
      active: nextActive,
      updatedAt: serverTimestamp()
    });
    await refreshList();
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
}

async function deleteProfile(profile) {
  if (profile.isSystem) {
    alert("No se puede eliminar un perfil del sistema.");
    return;
  }
  if (profile.active !== false) {
    alert("Primero desactivá el perfil antes de eliminarlo.");
    return;
  }
  if (!confirm(`¿Eliminar permanentemente el perfil "${profile.name}"? Esta acción no se puede deshacer.`)) return;
  // Segunda confirmación explícita
  const typed = prompt(`Para confirmar, escribí el nombre exacto del perfil:`);
  if (typed !== profile.name) {
    alert("El nombre no coincide. Operación cancelada.");
    return;
  }

  try {
    await deleteDoc(doc(db, "roleProfiles", profile.id));
    await refreshList();
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
}

// ----------------------------------------------------------------------------
// Modal: crear / editar
// ----------------------------------------------------------------------------

async function openProfileModal(profile) {
  const isEdit = !!profile;
  const modalRoot = document.getElementById("modal-root");

  // Estado local del formulario
  const state = {
    name: profile?.name || "",
    description: profile?.description || "",
    permissions: normalizePermissions(profile?.permissions),
    widgets: Array.isArray(profile?.dashboardWidgets) ? [...profile.dashboardWidgets] : [],
    saving: false
  };

  let widgetsCatalog = [];
  try {
    widgetsCatalog = await loadWidgetsCatalog();
  } catch (err) {
    console.warn("[modal] No se pudo cargar catálogo de widgets:", err);
  }

  function renderModal() {
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal-box">
          <div class="modal-header">
            <h2>${isEdit ? "Editar perfil" : "Nuevo perfil"}</h2>
            <button class="icon-btn" id="modal-close" title="Cerrar">×</button>
          </div>

          <div class="modal-body">

            ${!isEdit ? `
              <div class="form-section">
                <label class="section-label">Presets (opcional)</label>
                <div class="preset-buttons">
                  ${Object.entries(PROFILE_PRESETS).map(([key, preset]) => `
                    <button class="btn" data-preset="${key}">
                      ${escapeHtml(preset.label)}
                    </button>
                  `).join("")}
                </div>
                <div class="hint">Aplicar un preset completa nombre, permisos y widgets. Podés ajustar todo después.</div>
              </div>
            ` : ""}

            <div class="form-section">
              <label class="section-label">Nombre *</label>
              <input type="text" id="f-name" value="${escapeHtml(state.name)}" placeholder="Ej: Instructor de musculación">
            </div>

            <div class="form-section">
              <label class="section-label">Descripción</label>
              <textarea id="f-description" rows="2" placeholder="Qué hace este rol (opcional)">${escapeHtml(state.description)}</textarea>
            </div>

            <div class="form-section">
              <label class="section-label">Permisos</label>
              <div class="hint" style="margin-bottom:12px">
                Marcá lo que este perfil puede hacer. Los módulos marcados como "solo admin"
                normalmente se dejan desactivados.
              </div>
              <div id="perms-grid">
                ${PERMISSION_SCHEMA.map(mod => renderPermModule(mod, state.permissions)).join("")}
              </div>
            </div>

            <div class="form-section">
              <label class="section-label">Widgets de dashboard</label>
              <div class="hint" style="margin-bottom:12px">
                Qué ve este perfil al entrar al sistema.
              </div>
              ${widgetsCatalog.length === 0
                ? `<div class="note warn">El catálogo de widgets no está cargado. Cerrá este modal y tocá "Inicializar catálogo".</div>`
                : `<div class="widgets-grid">
                    ${widgetsCatalog.map(w => renderWidgetCheckbox(w, state.widgets)).join("")}
                   </div>`
              }
            </div>

          </div>

          <div class="modal-footer">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn primary" id="modal-save">
              ${isEdit ? "Guardar cambios" : "Crear perfil"}
            </button>
          </div>
        </div>
      </div>
    `;

    // Wire up
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-overlay").addEventListener("click", e => {
      if (e.target.id === "modal-overlay") closeModal();
    });

    document.getElementById("f-name").addEventListener("input", e => {
      state.name = e.target.value;
    });
    document.getElementById("f-description").addEventListener("input", e => {
      state.description = e.target.value;
    });

    // Checkboxes de permisos
    modalRoot.querySelectorAll("input[data-perm]").forEach(cb => {
      cb.addEventListener("change", e => {
        const path = e.target.dataset.perm;
        const [mod, action] = path.split(".");
        if (!state.permissions[mod]) state.permissions[mod] = {};
        state.permissions[mod][action] = e.target.checked;
      });
    });

    // Checkboxes de widgets
    modalRoot.querySelectorAll("input[data-widget]").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.widget;
        if (e.target.checked) {
          if (!state.widgets.includes(id)) state.widgets.push(id);
        } else {
          state.widgets = state.widgets.filter(x => x !== id);
        }
      });
    });

    // Presets (solo en modo crear)
    if (!isEdit) {
      modalRoot.querySelectorAll("[data-preset]").forEach(btn => {
        btn.addEventListener("click", () => {
          const preset = PROFILE_PRESETS[btn.dataset.preset];
          if (!preset) return;
          state.name = preset.label;
          state.description = preset.description;
          state.permissions = preset.build();
          state.widgets = [...(preset.widgets || [])];
          renderModal();  // re-render con valores nuevos
        });
      });
    }

    // Guardar
    document.getElementById("modal-save").addEventListener("click", saveProfile);
  }

  async function saveProfile() {
    const btn = document.getElementById("modal-save");

    const name = state.name.trim();
    if (!name) {
      alert("El nombre es obligatorio.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Guardando…";

    try {
      const payload = {
        name,
        description: state.description.trim(),
        permissions: state.permissions,
        dashboardWidgets: state.widgets,
        active: profile?.active !== false,  // por defecto activo, en edit respeta lo que había
        isSystem: profile?.isSystem === true,
        updatedAt: serverTimestamp()
      };

      if (isEdit) {
        await updateDoc(doc(db, "roleProfiles", profile.id), payload);
      } else {
        payload.createdAt = serverTimestamp();
        if (payload.isSystem === undefined) payload.isSystem = false;
        await addDoc(collection(db, "roleProfiles"), payload);
      }

      closeModal();
      await refreshList();
    } catch (err) {
      console.error(err);
      alert("Error al guardar: " + err.message);
      btn.disabled = false;
      btn.textContent = isEdit ? "Guardar cambios" : "Crear perfil";
    }
  }

  function closeModal() {
    modalRoot.innerHTML = "";
  }

  renderModal();
}

// ----------------------------------------------------------------------------
// Sub-render helpers
// ----------------------------------------------------------------------------

function renderPermModule(mod, permsState) {
  const modPerms = permsState[mod.module] || {};
  return `
    <div class="perm-module ${mod.adminOnly ? "admin-only" : ""}">
      <div class="perm-module-header">
        <strong>${escapeHtml(mod.label)}</strong>
        ${mod.adminOnly ? `<span class="pill info" style="margin-left:8px;font-size:10px">Solo admin</span>` : ""}
      </div>
      <div class="perm-actions">
        ${mod.actions.map(a => `
          <label class="perm-check">
            <input type="checkbox"
                   data-perm="${mod.module}.${a.key}"
                   ${modPerms[a.key] === true ? "checked" : ""}>
            <span>${escapeHtml(a.label)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

function renderWidgetCheckbox(w, selected) {
  const checked = selected.includes(w.id);
  const requires = Array.isArray(w.requires) && w.requires.length > 0
    ? `<div class="widget-req">Requiere: ${w.requires.map(r => `<code>${r}</code>`).join(", ")}</div>`
    : "";

  return `
    <label class="widget-check">
      <input type="checkbox" data-widget="${w.id}" ${checked ? "checked" : ""}>
      <div>
        <div class="widget-label"><strong>${escapeHtml(w.label)}</strong></div>
        <div class="widget-desc">${escapeHtml(w.description || "")}</div>
        ${requires}
      </div>
    </label>
  `;
}

// ----------------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------------

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
