import { auth } from "../firebase/config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { navigate } from "../router.js";
import { renderTopbar } from "../shared/topbar.js";

export function renderDashboard({ user, role, userDoc, profile, root }) {
  if (!user) {
    navigate("/login");
    return;
  }

  const displayName = userDoc?.displayName || user.email.split("@")[0];
  const roleLabel = role === "admin"
    ? "Administrador"
    : (profile?.name || "Colaborador");

  // Link a "Perfiles de rol" visible solo para admin
  const adminLinks = role === "admin" ? `
    <a href="#/role-profiles"><span class="num">04</span><span>Perfiles de rol</span></a>
    <a href="#/admin-client-access"><span class="num">05</span><span>Acceso cliente (debug)</span></a>
  ` : "";

  root.innerHTML = `
    ${renderTopbar(role)}
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">§ Gestión</div>
          <a class="active"><span class="num">01</span><span>Dashboard</span></a>
          <a><span class="num">02</span><span>Clientes</span></a>
          <a><span class="num">03</span><span>Colaboradores</span></a>
          ${adminLinks}
          <div class="divider"></div>
          <a id="logout-link" style="color:var(--danger)"><span class="num">×</span><span>Cerrar sesión</span></a>
        </div>
      </aside>

      <main class="main">
        <div class="breadcrumb">
          <span>OVA TRAINING</span>
          <span class="sep">/</span>
          <span class="current">DASHBOARD</span>
        </div>
        <div class="kicker">§ 01 · Bienvenida</div>
        <h1>Hola, <span class="accent">${displayName}</span>.</h1>
        <p style="color:var(--ink-2);max-width:560px;margin-bottom:32px">
          Sistema B.2.3 operativo. Sesión validada contra Firestore con perfiles de rol.
        </p>

        <div class="metrics">
          <div class="metric">
            <div class="label">Rol</div>
            <div class="val" style="font-size:20px">${roleLabel}</div>
            <div class="sub">${role === "admin" ? "acceso total" : "desde perfil de rol"}</div>
          </div>
          <div class="metric">
            <div class="label">Email</div>
            <div class="val" style="font-size:14px">${user.email}</div>
          </div>
          <div class="metric">
            <div class="label">UID</div>
            <div class="val mono" style="font-size:11px;word-break:break-all">${user.uid}</div>
          </div>
        </div>

        ${role === "admin" ? `
          <div class="note info">
            <strong>Hito B.2.3 completado.</strong><br>
            Sistema de perfiles de rol operativo. Desde el menú lateral podés gestionar
            los perfiles y sus permisos.
          </div>
        ` : ""}
      </main>
    </div>
  `;

  document.getElementById("logout-link").addEventListener("click", async () => {
    await signOut(auth);
    navigate("/login");
  });
}
