// ============================================================================
// clients-new.js — wizard de creación de cliente (ruta /clients/new)
// ============================================================================
//
// Wizard en 4 pasos:
//   1. Datos básicos (nombre, apellido, tel, email, nacimiento, género)
//   2. Salud y objetivos (condiciones, lesiones, objetivo, experiencia)
//   3. Administrativo (fecha alta, colab asignado, notas internas)
//   4. Emergencia + confirmación (contacto emergencia, resumen, crear)
//
// Solo admin puede crear clientes (las reglas lo validan; el UI también).
// Al confirmar, se ejecuta createClient() que genera los 3 docs sincronizados.
// ============================================================================

import { navigate } from "../router.js";
import { renderTopbar, attachTopbarBehavior } from "../shared/topbar.js";
import { createClient, listActiveColabs } from "../shared/clients-service.js";
import {
  escapeHtml,
  validateName,
  validatePhone,
  validateEmail,
  validateDate,
  calculateAge,
  formatDateDisplay,
  todayISO,
  optionLabel,
  GENDER_OPTIONS,
  OBJECTIVE_OPTIONS,
  EXPERIENCE_OPTIONS
} from "../shared/form-helpers.js";

// Estado del wizard (local al módulo)
let formData = {};
let currentStep = 1;
let colabs = [];

const TOTAL_STEPS = 4;

export async function renderClientsNew({ user, role, root }) {
  if (!user) { navigate("/login"); return; }
  if (role !== "admin") { navigate("/clients"); return; }

  // Reset
  formData = {
    firstName: "", lastName: "", phone: "", email: "", birthDate: "", gender: "",
    medicalConditions: "", injuries: "", objective: "", experienceLevel: "",
    admissionDate: todayISO(), assignedColabId: "", internalNotes: "",
    emergencyContactName: "", emergencyContactPhone: ""
  };
  currentStep = 1;

  root.innerHTML = `
    ${renderTopbar(role)}
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-content">
          <div class="section-title">§ Gestión</div>
          <a href="#/dashboard"><span class="num">01</span><span>Dashboard</span></a>
          <a href="#/clients" class="active"><span class="num">02</span><span>Clientes</span></a>
          <a><span class="num">03</span><span>Colaboradores</span></a>
          <a href="#/role-profiles"><span class="num">04</span><span>Perfiles de rol</span></a>
          <a href="#/admin-client-access"><span class="num">05</span><span>Acceso cliente (debug)</span></a>
          <div class="divider"></div>
          <a id="logout-link" style="color:var(--danger)"><span class="num">×</span><span>Cerrar sesión</span></a>
        </div>
      </aside>

      <main class="main">
        <div class="breadcrumb">
          <span>OVA TRAINING</span>
          <span class="sep">/</span>
          <a href="#/clients" style="color:var(--ink-3);text-decoration:none">CLIENTES</a>
          <span class="sep">/</span>
          <span class="current">NUEVO</span>
        </div>
        <div class="kicker">§ 02 · Nuevo cliente</div>
        <h1>Nuevo <span class="accent">cliente</span>.</h1>

        <div id="wizard-progress" class="wizard-progress"></div>

        <div id="wizard-body" class="wizard-body"></div>

        <div class="wizard-footer">
          <button class="btn" id="btn-cancel">Cancelar</button>
          <div style="flex:1"></div>
          <button class="btn" id="btn-prev" style="display:none">← Atrás</button>
          <button class="btn primary" id="btn-next">Siguiente →</button>
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

  document.getElementById("btn-cancel").addEventListener("click", () => {
    if (hasAnyData() && !confirm("¿Cancelar? Vas a perder los datos cargados.")) return;
    navigate("/clients");
  });

  document.getElementById("btn-prev").addEventListener("click", () => {
    captureCurrentStep();
    if (currentStep > 1) { currentStep--; renderStep(); }
  });

  document.getElementById("btn-next").addEventListener("click", async () => {
    const valid = captureCurrentStep();
    if (!valid) return;

    if (currentStep < TOTAL_STEPS) {
      currentStep++;
      renderStep();
    } else {
      await submitForm();
    }
  });

  attachTopbarBehavior();

  // Cargar colabs para el paso 3
  try {
    colabs = await listActiveColabs();
  } catch (err) {
    console.warn("[clients-new] no se pudieron cargar colabs:", err);
    colabs = [];
  }

  renderStep();
}

function hasAnyData() {
  return Object.values(formData).some(v => v && String(v).trim() !== "" && v !== todayISO());
}

function renderStep() {
  renderProgress();
  const body = document.getElementById("wizard-body");
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");

  btnPrev.style.display = currentStep > 1 ? "inline-flex" : "none";
  btnNext.textContent = currentStep < TOTAL_STEPS ? "Siguiente →" : "Crear cliente";

  switch (currentStep) {
    case 1: body.innerHTML = renderStep1(); break;
    case 2: body.innerHTML = renderStep2(); break;
    case 3: body.innerHTML = renderStep3(); break;
    case 4: body.innerHTML = renderStep4(); break;
  }

  // Autofocus en primer input
  setTimeout(() => {
    const first = body.querySelector("input, textarea, select");
    if (first) first.focus();
  }, 50);
}

function renderProgress() {
  const el = document.getElementById("wizard-progress");
  const steps = ["Datos básicos", "Salud", "Administrativo", "Contacto + confirmar"];
  el.innerHTML = steps.map((label, i) => {
    const stepNum = i + 1;
    const state = stepNum < currentStep ? "done" : stepNum === currentStep ? "current" : "pending";
    return `
      <div class="wizard-step ${state}">
        <div class="wizard-step-num">${stepNum}</div>
        <div class="wizard-step-label">${label}</div>
      </div>
    `;
  }).join("");
}

// ============================================================================
// PASO 1 — Datos básicos
// ============================================================================

function renderStep1() {
  return `
    <h2 style="margin-bottom:20px">Datos básicos</h2>
    <div class="form-grid">
      <div class="form-field">
        <label>Nombre *</label>
        <input type="text" id="f-firstName" value="${escapeHtml(formData.firstName)}" autocomplete="off">
      </div>
      <div class="form-field">
        <label>Apellido *</label>
        <input type="text" id="f-lastName" value="${escapeHtml(formData.lastName)}" autocomplete="off">
      </div>
      <div class="form-field">
        <label>Teléfono *</label>
        <input type="tel" id="f-phone" value="${escapeHtml(formData.phone)}" placeholder="+54 341..." autocomplete="off">
      </div>
      <div class="form-field">
        <label>Email (opcional)</label>
        <input type="email" id="f-email" value="${escapeHtml(formData.email)}" autocomplete="off">
      </div>
      <div class="form-field">
        <label>Fecha de nacimiento</label>
        <input type="date" id="f-birthDate" value="${escapeHtml(formData.birthDate)}">
      </div>
      <div class="form-field">
        <label>Género</label>
        <select id="f-gender">
          ${GENDER_OPTIONS.map(o => `<option value="${o.value}" ${formData.gender === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="error" id="step-error"></div>
  `;
}

function captureStep1() {
  formData.firstName = document.getElementById("f-firstName").value;
  formData.lastName  = document.getElementById("f-lastName").value;
  formData.phone     = document.getElementById("f-phone").value;
  formData.email     = document.getElementById("f-email").value;
  formData.birthDate = document.getElementById("f-birthDate").value;
  formData.gender    = document.getElementById("f-gender").value;

  const errors = [];
  const first = validateName(formData.firstName, "Nombre");
  if (!first.ok) errors.push(first.error); else formData.firstName = first.value;
  const last  = validateName(formData.lastName, "Apellido");
  if (!last.ok) errors.push(last.error); else formData.lastName = last.value;
  const phone = validatePhone(formData.phone, true);
  if (!phone.ok) errors.push(phone.error); else formData.phone = phone.value;
  const email = validateEmail(formData.email, false);
  if (!email.ok) errors.push(email.error); else formData.email = email.value;
  const birth = validateDate(formData.birthDate, { required: false, notFuture: true, maxAge: 110, fieldName: "Fecha de nacimiento" });
  if (!birth.ok) errors.push(birth.error); else formData.birthDate = birth.value;

  if (errors.length > 0) {
    showStepError(errors[0]);
    return false;
  }
  return true;
}

// ============================================================================
// PASO 2 — Salud y objetivos
// ============================================================================

function renderStep2() {
  return `
    <h2 style="margin-bottom:20px">Salud y objetivos</h2>
    <div class="form-field">
      <label>Condiciones médicas (opcional)</label>
      <textarea id="f-medicalConditions" rows="2" placeholder="Ej: hipertensión, diabetes, etc.">${escapeHtml(formData.medicalConditions)}</textarea>
    </div>
    <div class="form-field">
      <label>Lesiones o limitaciones (opcional)</label>
      <textarea id="f-injuries" rows="2" placeholder="Ej: hernia lumbar, rodilla izquierda operada, etc.">${escapeHtml(formData.injuries)}</textarea>
    </div>
    <div class="form-grid">
      <div class="form-field">
        <label>Objetivo principal</label>
        <select id="f-objective">
          ${OBJECTIVE_OPTIONS.map(o => `<option value="${o.value}" ${formData.objective === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </div>
      <div class="form-field">
        <label>Nivel de experiencia</label>
        <select id="f-experienceLevel">
          ${EXPERIENCE_OPTIONS.map(o => `<option value="${o.value}" ${formData.experienceLevel === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="error" id="step-error"></div>
  `;
}

function captureStep2() {
  formData.medicalConditions = document.getElementById("f-medicalConditions").value.trim();
  formData.injuries          = document.getElementById("f-injuries").value.trim();
  formData.objective         = document.getElementById("f-objective").value;
  formData.experienceLevel   = document.getElementById("f-experienceLevel").value;
  return true; // Todo opcional en este paso
}

// ============================================================================
// PASO 3 — Administrativo
// ============================================================================

function renderStep3() {
  return `
    <h2 style="margin-bottom:20px">Administrativo</h2>
    <div class="form-grid">
      <div class="form-field">
        <label>Fecha de alta</label>
        <input type="date" id="f-admissionDate" value="${escapeHtml(formData.admissionDate)}">
      </div>
      <div class="form-field">
        <label>Colaborador asignado (opcional)</label>
        <select id="f-assignedColabId">
          <option value="">Sin asignar</option>
          ${colabs.map(c => `
            <option value="${c.id}" ${formData.assignedColabId === c.id ? "selected" : ""}>
              ${escapeHtml(c.displayName || c.email || "(sin nombre)")}
            </option>
          `).join("")}
        </select>
      </div>
    </div>
    <div class="form-field">
      <label>Notas internas del staff (opcional)</label>
      <textarea id="f-internalNotes" rows="3" placeholder="Lo que quieras recordar sobre este cliente. El cliente NO ve esto.">${escapeHtml(formData.internalNotes)}</textarea>
    </div>
    <div class="error" id="step-error"></div>
  `;
}

function captureStep3() {
  formData.admissionDate   = document.getElementById("f-admissionDate").value;
  formData.assignedColabId = document.getElementById("f-assignedColabId").value || null;
  formData.internalNotes   = document.getElementById("f-internalNotes").value.trim();

  const admission = validateDate(formData.admissionDate, { required: false, notFuture: true, fieldName: "Fecha de alta" });
  if (!admission.ok) { showStepError(admission.error); return false; }

  return true;
}

// ============================================================================
// PASO 4 — Contacto de emergencia + confirmación
// ============================================================================

function renderStep4() {
  const colab = colabs.find(c => c.id === formData.assignedColabId);

  return `
    <h2 style="margin-bottom:20px">Contacto de emergencia + confirmación</h2>

    <div class="form-grid">
      <div class="form-field">
        <label>Nombre del contacto (opcional)</label>
        <input type="text" id="f-emergencyContactName" value="${escapeHtml(formData.emergencyContactName)}" autocomplete="off">
      </div>
      <div class="form-field">
        <label>Teléfono del contacto (opcional)</label>
        <input type="tel" id="f-emergencyContactPhone" value="${escapeHtml(formData.emergencyContactPhone)}" autocomplete="off">
      </div>
    </div>

    <h3 style="margin-top:24px;margin-bottom:12px;font-size:14px">Resumen</h3>
    <div class="wizard-summary">
      ${summaryRow("Nombre", `${formData.firstName} ${formData.lastName}`)}
      ${summaryRow("Teléfono", formData.phone)}
      ${summaryRow("Email", formData.email || "—")}
      ${summaryRow("Nacimiento", formData.birthDate ? `${formatDateDisplay(formData.birthDate)} (${calculateAge(formData.birthDate)} años)` : "—")}
      ${summaryRow("Género", optionLabel(GENDER_OPTIONS, formData.gender) || "—")}
      ${summaryRow("Objetivo", optionLabel(OBJECTIVE_OPTIONS, formData.objective) || "—")}
      ${summaryRow("Experiencia", optionLabel(EXPERIENCE_OPTIONS, formData.experienceLevel) || "—")}
      ${summaryRow("Fecha de alta", formatDateDisplay(formData.admissionDate))}
      ${summaryRow("Colaborador asignado", colab ? (colab.displayName || colab.email) : "Sin asignar")}
      ${formData.medicalConditions ? summaryRow("Condiciones médicas", formData.medicalConditions) : ""}
      ${formData.injuries ? summaryRow("Lesiones", formData.injuries) : ""}
      ${formData.internalNotes ? summaryRow("Notas internas", formData.internalNotes) : ""}
    </div>

    <div class="note info" style="margin-top:20px">
      Al crear el cliente, se genera automáticamente su link de acceso al portal.
      Desde el detalle del cliente vas a poder copiarlo y enviárselo.
    </div>

    <div class="error" id="step-error"></div>
  `;
}

function captureStep4() {
  formData.emergencyContactName  = document.getElementById("f-emergencyContactName").value.trim();
  formData.emergencyContactPhone = document.getElementById("f-emergencyContactPhone").value.trim();

  if (formData.emergencyContactPhone) {
    const p = validatePhone(formData.emergencyContactPhone, false);
    if (!p.ok) { showStepError(p.error); return false; }
    formData.emergencyContactPhone = p.value;
  }

  return true;
}

// ============================================================================
// Submit
// ============================================================================

async function submitForm() {
  const btn = document.getElementById("btn-next");
  btn.disabled = true;
  btn.textContent = "Creando…";

  try {
    const { clientId } = await createClient(formData);
    navigate(`/clients/${clientId}`);
  } catch (err) {
    console.error(err);
    showStepError("Error al crear: " + err.message);
    btn.disabled = false;
    btn.textContent = "Crear cliente";
  }
}

// ============================================================================
// Helpers
// ============================================================================

function captureCurrentStep() {
  switch (currentStep) {
    case 1: return captureStep1();
    case 2: return captureStep2();
    case 3: return captureStep3();
    case 4: return captureStep4();
  }
  return true;
}

function showStepError(msg) {
  const el = document.getElementById("step-error");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}

function summaryRow(label, value) {
  return `
    <div class="wizard-summary-row">
      <div class="wizard-summary-label">${escapeHtml(label)}</div>
      <div class="wizard-summary-value">${escapeHtml(value || "—")}</div>
    </div>
  `;
}
