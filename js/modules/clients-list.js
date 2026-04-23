// ============================================================================
// clients-list.js — lista de clientes (ruta /clients)
// ============================================================================
//
// Pantalla para admin y colab. Muestra:
//   - Búsqueda por nombre/teléfono/email
//   - Filtros: estado (activo/inactivo/todos), colab asignado (solo admin)
//   - Lista con info resumida + click para ir al detalle
//   - Botón "Nuevo cliente" → navega a /clients/new
//
// Por reglas de Firestore, un colab solo ve sus clientes asignados
// automáticamente.
// ============================================================================

import { navigate } from "../router.js";
import { renderTopbar, attachTopbarBehavior } from "../shared/topbar.js";
import { listAllClientsForRole, listActiveColabs } from "../shared/clients-service.js";
import { escapeHtml, truncate, formatDateDisplay, optionLabel, OBJECTIVE_OPTIONS } from "../shared/form-helpers.js";

// Estado local del módulo (solo vive mientras la pantalla está montada)
let allClients = [];
let allColabs = [];
let searchTerm = "";
let statusFilter = "active"; // "active" | "inactive" | "all"
let colabFilter = "all";

export async function renderClientsList({ user, role, root }) {
  if (!user) { navigate("/login"); return; }
  if (role !== "admin" && role !== "colab") { navigate("/dashboard"); return; }

  const isAdmin = role === "admin";

  // Reset de filtros al entrar
  searchTerm = "";
  statusFilter = "active";
  colabFilter = "all";

  root.innerHTML = `
    ${renderTopbar(role)}
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">§ Gestión</div>
          <a href="#/dashboard"><span class="num">01</span><span>Dashboard</span></a>
          <a href="#/clients" class="active"><span class="num">02</span><span>Clientes</span></a>
          <a><span class="num">03</span><span>Colaboradores</span></a>
          ${isAdmin ? `
            <a href="#/role-profiles"><span class="num">04</span><span>Perfiles de rol</span></a>
            <a href="#/admin-client-access"><span class="num">05</span><span>Acceso cliente (debug)</span></a>
          ` : ""}
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
          <span class="current">CLIENTES</span>
        </div>
        <div class="kicker">§ 02 · Gestión de clientes</div>
        <h1>Clientes<span class="accent">.</span></h1>

        <div class="clients-toolbar">
          <div class="clients-search">
            <input type="text" id="search-input" placeholder="Buscar por nombre, teléfono o email…" autocomplete="off">
          </div>

          <div class="clients-filters">
            <select id="status-filter">
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos</option>
            </select>
            ${isAdmin ? `
              <select id="colab-filter">
                <option value="all">Todos los colabs</option>
                <option value="unassigned">Sin asignar</option>
              </select>
            ` : ""}
          </div>

          <button class="btn primary" id="new-client-btn">+ Nuevo cliente</button>
        </div>

        <div id="clients-stats" class="clients-stats"></div>

        <div id="clients-list-wrap">
          <div class="note info">Cargando…</div>
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

  document.getElementById("new-client-btn").addEventListener("click", () => navigate("/clients/new"));

  document.getElementById("search-input").addEventListener("input", e => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderList();
  });

  document.getElementById("status-filter").addEventListener("change", e => {
    statusFilter = e.target.value;
    renderList();
  });

  if (isAdmin) {
    document.getElementById("colab-filter").addEventListener("change", e => {
      colabFilter = e.target.value;
      renderList();
    });
  }

  attachTopbarBehavior();

  // Carga inicial
  await loadData(role, user.uid, isAdmin);
  renderList();
}

async function loadData(role, uid, isAdmin) {
  try {
    const [clients, colabs] = await Promise.all([
      listAllClientsForRole(role, uid),
      isAdmin ? listActiveColabs() : Promise.resolve([])
    ]);
    allClients = clients;
    allColabs = colabs;

    if (isAdmin) {
      const colabSelect = document.getElementById("colab-filter");
      colabs.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.displayName || c.email || "(sin nombre)";
        colabSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error(err);
    document.getElementById("clients-list-wrap").innerHTML =
      `<div class="note danger">Error al cargar clientes: ${escapeHtml(err.message)}</div>`;
  }
}

function applyFilters(clients) {
  return clients.filter(c => {
    // Estado
    const isActive = c.active !== false;
    if (statusFilter === "active" && !isActive) return false;
    if (statusFilter === "inactive" && isActive) return false;

    // Colab
    if (colabFilter === "unassigned" && c.assignedColabId) return false;
    if (colabFilter !== "all" && colabFilter !== "unassigned" && c.assignedColabId !== colabFilter) return false;

    // Búsqueda (en displayName, phone, email)
    if (searchTerm) {
      const haystack = [
        c.displayName || "",
        c.firstName || "",
        c.lastName || "",
        c.phone || "",
        c.email || ""
      ].join(" ").toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

    return true;
  });
}

function renderList() {
  const wrap = document.getElementById("clients-list-wrap");
  const statsEl = document.getElementById("clients-stats");
  if (!wrap) return;

  const filtered = applyFilters(allClients);

  statsEl.innerHTML = `
    <span class="mono" style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--ink-3)">
      ${filtered.length} de ${allClients.length} ${allClients.length === 1 ? "cliente" : "clientes"}
    </span>
  `;

  if (allClients.length === 0) {
    wrap.innerHTML = `
      <div class="note">
        Todavía no hay clientes. Tocá <strong>+ Nuevo cliente</strong> para crear uno.
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    wrap.innerHTML = `
      <div class="note">
        No se encontraron clientes con esos filtros.
      </div>
    `;
    return;
  }

  const colabById = {};
  allColabs.forEach(c => { colabById[c.id] = c; });

  wrap.innerHTML = `
    <div class="clients-grid">
      ${filtered.map(c => renderClientCard(c, colabById)).join("")}
    </div>
  `;

  wrap.querySelectorAll("[data-client-id]").forEach(el => {
    el.addEventListener("click", () => {
      navigate(`/clients/${el.dataset.clientId}`);
    });
  });
}

function renderClientCard(c, colabById) {
  const active = c.active !== false;
  const colab = c.assignedColabId ? colabById[c.assignedColabId] : null;
  const colabLabel = colab ? (colab.displayName || colab.email || "—") : "Sin asignar";
  const objective = optionLabel(OBJECTIVE_OPTIONS, c.objective);
  const testFlag = c._testClient ? `<span class="pill gray" style="margin-left:6px;font-size:9px">TEST</span>` : "";

  return `
    <div class="client-card-row" data-client-id="${c.id}">
      <div class="client-card-main">
        <div class="client-card-name">
          <strong>${escapeHtml(c.displayName || "(sin nombre)")}</strong>
          ${!active ? `<span class="pill gray" style="margin-left:8px">Inactivo</span>` : ""}
          ${testFlag}
        </div>
        <div class="client-card-meta">
          ${c.phone ? `<span>${escapeHtml(c.phone)}</span>` : ""}
          ${objective ? `<span class="dot-sep">·</span><span>${escapeHtml(objective)}</span>` : ""}
          <span class="dot-sep">·</span>
          <span>${escapeHtml(colabLabel)}</span>
        </div>
      </div>
      <div class="client-card-side">
        ${c.createdAt?.toDate ? `
          <div class="client-card-date">
            Alta: ${escapeHtml(formatDateDisplay(c.admissionDate) || c.createdAt.toDate().toLocaleDateString("es-AR"))}
          </div>
        ` : ""}
      </div>
    </div>
  `;
}
