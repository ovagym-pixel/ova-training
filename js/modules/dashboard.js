import { auth } from "../firebase/config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { navigate } from "../router.js";
import { renderTopbar } from "../shared/topbar.js";

export function renderDashboard({ user, role, root }) {
  if (!user) {
    navigate("/login");
    return;
  }

  root.innerHTML = `
    ${renderTopbar(role)}
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">§ Gestión</div>
          <a class="active"><span class="num">01</span><span>Dashboard</span></a>
          <a><span class="num">02</span><span>Clientes</span></a>
          <a><span class="num">03</span><span>Colaboradores</span></a>
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
        <h1>Hola, <span class="accent">${user.email.split("@")[0]}</span>.</h1>
        <p style="color:var(--ink-2);max-width:560px;margin-bottom:32px">
          Sistema B.1 operativo. Autenticación funcionando. Próximo paso: cargar el modelo de datos y gestión de clientes.
        </p>

        <div class="metrics">
          <div class="metric">
            <div class="label">Rol actual</div>
            <div class="val" style="font-size:20px">${role || "—"}</div>
            <div class="sub">detectado automáticamente</div>
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

        <div class="note info">
          <strong>Hito B.1 completado.</strong><br>
          El sistema está levantado, la autenticación funciona y el routing entre pantallas está operativo.
        </div>
      </main>
    </div>
  `;

  document.getElementById("logout-link").addEventListener("click", async () => {
    await signOut(auth);
    navigate("/login");
  });
}
