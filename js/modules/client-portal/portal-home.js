// ============================================================================
// portal-home.js — home del portal cliente
// ============================================================================
//
// Vista minimalista por ahora. Muestra:
//   - Saludo con nombre del cliente (de /clientsPublic/{id})
//   - Grid de módulos accesibles (por ahora son placeholders)
//   - Botón "cerrar sesión en este dispositivo"
//
// Las pantallas reales de cada módulo (check-in, proteína, onboarding, etc.)
// se construyen en B.5+.
// ============================================================================

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { clientAuth, db } from "../../firebase/client-config.js";
import { clearLastToken } from "../../shared/client-session.js";

export async function renderPortalHome({ root, access, uid }) {
  const clientId = access.clientId;

  // Cargar datos públicos del cliente
  let publicData = null;
  try {
    const snap = await getDoc(doc(db, "clientsPublic", clientId));
    if (snap.exists()) publicData = snap.data();
  } catch (err) {
    console.warn("[portal-home] no se pudo cargar clientsPublic:", err);
  }

  const displayName = publicData?.displayName || access.displayName || "Cliente";
  const serviceName = publicData?.currentServiceName || null;
  const vigencia = publicData?.currentServiceVigencia || null;

  root.innerHTML = `
    <div class="client-portal-wrap">
      <div class="client-card" style="max-width:640px">

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="client-logo">OVA <span class="accent">Training</span></div>
          <button class="icon-btn" id="client-logout" title="Cerrar sesión en este dispositivo">×</button>
        </div>

        <div class="kicker" style="margin-top:12px">§ Tu espacio</div>
        <h1 style="font-size:28px;margin-bottom:16px">Hola, <span class="accent">${escapeHtml(displayName)}</span>.</h1>

        ${serviceName ? `
          <div class="note info" style="margin-bottom:24px">
            <strong>Tu plan:</strong> ${escapeHtml(serviceName)}
            ${vigencia ? `<br><span style="font-size:12px;color:var(--ink-3)">Vigente hasta: ${escapeHtml(vigencia)}</span>` : ""}
          </div>
        ` : ""}

        <div class="section-title" style="margin-top:20px">§ Qué querés hacer</div>
        <div class="client-module-grid">
          ${moduleCard("Mis mediciones", "Ver tu historial de composición corporal", "📏", true)}
          ${moduleCard("Registrar asistencia", "Marcar que viniste hoy al gym", "✓", true)}
          ${moduleCard("Mi plan", "Ver tu rutina actual y progresiones", "🏋️", true)}
          ${moduleCard("Proteína", "Registrar tu consumo diario", "🥩", true)}
          ${moduleCard("Mis notas", "Tomá nota de lo que quieras recordar", "📝", true)}
          ${moduleCard("Encuestas", "Responder encuestas pendientes", "📋", true)}
        </div>

        <div class="client-footer">
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--ink-3);letter-spacing:0.08em;text-transform:uppercase">
            Dispositivo confiable · uid ${uid.slice(0, 8)}…
          </div>
        </div>

      </div>
    </div>
  `;

  document.getElementById("client-logout").addEventListener("click", async () => {
    if (!confirm("¿Cerrar sesión en este dispositivo? La próxima vez que entres al link vas a tener que ingresar tu PIN.")) return;

    try {
      await signOut(clientAuth);
    } catch {}
    clearLastToken();

    // NOTA: signOut de usuario anónimo revoca el uid actual, pero el uid sigue
    // quedando en trustedUids del cliente. Eso está OK porque la próxima vez
    // que entre se va a generar un uid anónimo DISTINTO, que no va a estar
    // en trustedUids, por lo que le va a pedir PIN.
    //
    // La limpieza de trustedUids "viejos" (de devices que nunca se van a
    // volver a usar) es responsabilidad del admin desde el panel de gestión.

    root.innerHTML = `
      <div class="client-portal-wrap">
        <div class="client-card">
          <div class="client-logo">OVA <span class="accent">Training</span></div>
          <h2 style="margin-top:20px">Sesión cerrada</h2>
          <p style="color:var(--ink-2);margin-top:12px;line-height:1.5">
            Cerraste tu sesión en este dispositivo. Cuando vuelvas al link,
            vas a tener que ingresar tu PIN.
          </p>
        </div>
      </div>
    `;
  });
}

function moduleCard(title, desc, icon, disabled) {
  return `
    <div class="client-module ${disabled ? "disabled" : ""}">
      <div class="client-module-icon">${icon}</div>
      <div class="client-module-body">
        <div class="client-module-title">${escapeHtml(title)}</div>
        <div class="client-module-desc">${escapeHtml(desc)}</div>
        ${disabled ? `<div class="client-module-soon">Próximamente</div>` : ""}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
