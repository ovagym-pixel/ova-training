// ============================================================================
// form-helpers.js — validaciones y utilidades para formularios
// ============================================================================
//
// Funciones puras sin dependencias externas. Se pueden usar desde cualquier
// módulo. Validaciones devuelven { ok: boolean, error: string | null }.
// ============================================================================

/**
 * Escapa HTML para prevenir inyección. Usar siempre que se inserte texto de
 * usuario en innerHTML.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Valida nombre (solo letras, espacios, acentos, guiones, apóstrofes).
 * Mín 2, máx 60 caracteres.
 */
export function validateName(raw, fieldName = "Nombre") {
  const value = (raw || "").trim();
  if (!value) return { ok: false, error: `${fieldName} es obligatorio.` };
  if (value.length < 2) return { ok: false, error: `${fieldName} debe tener al menos 2 caracteres.` };
  if (value.length > 60) return { ok: false, error: `${fieldName} no puede tener más de 60 caracteres.` };
  if (!/^[\p{L}\s'\-.]+$/u.test(value)) {
    return { ok: false, error: `${fieldName} contiene caracteres no válidos.` };
  }
  return { ok: true, value };
}

/**
 * Valida teléfono argentino (flexible: acepta +54, 54, con o sin espacios,
 * guiones y paréntesis). Como mínimo 8 dígitos útiles.
 */
export function validatePhone(raw, required = true) {
  const value = (raw || "").trim();
  if (!value) {
    return required
      ? { ok: false, error: "Teléfono es obligatorio." }
      : { ok: true, value: "" };
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return { ok: false, error: "Teléfono debe tener al menos 8 dígitos." };
  if (digits.length > 15) return { ok: false, error: "Teléfono demasiado largo." };
  return { ok: true, value };
}

/**
 * Valida email. Permite vacío si required=false.
 */
export function validateEmail(raw, required = false) {
  const value = (raw || "").trim().toLowerCase();
  if (!value) {
    return required
      ? { ok: false, error: "Email es obligatorio." }
      : { ok: true, value: "" };
  }
  // Regex simple, no intenta cubrir RFC 5322 completo
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, error: "Email inválido." };
  }
  return { ok: true, value };
}

/**
 * Valida fecha en formato YYYY-MM-DD (input type="date" nativo).
 * Opciones: notFuture (true por defecto), minAge, maxAge.
 */
export function validateDate(raw, opts = {}) {
  const { required = false, notFuture = true, minAge = null, maxAge = null, fieldName = "Fecha" } = opts;
  const value = (raw || "").trim();

  if (!value) {
    return required
      ? { ok: false, error: `${fieldName} es obligatoria.` }
      : { ok: true, value: "" };
  }

  const date = new Date(value + "T00:00:00");
  if (isNaN(date.getTime())) return { ok: false, error: `${fieldName} inválida.` };

  const now = new Date();
  if (notFuture && date > now) {
    return { ok: false, error: `${fieldName} no puede ser futura.` };
  }

  if (minAge !== null || maxAge !== null) {
    const ageYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (minAge !== null && ageYears < minAge) {
      return { ok: false, error: `Edad mínima: ${minAge} años.` };
    }
    if (maxAge !== null && ageYears > maxAge) {
      return { ok: false, error: `Edad máxima: ${maxAge} años.` };
    }
  }

  return { ok: true, value };
}

/**
 * Calcula edad a partir de fecha de nacimiento YYYY-MM-DD.
 */
export function calculateAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Formatea fecha YYYY-MM-DD a dd/mm/yyyy para mostrar.
 */
export function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Devuelve hoy en formato YYYY-MM-DD (para input type="date").
 */
export function todayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Recorta texto para mostrar en listas con límite.
 */
export function truncate(str, max = 80) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Formatea un número de teléfono argentino para mostrar de forma más legible.
 * Heurística simple, no pretende ser perfecta.
 */
export function formatPhoneDisplay(raw) {
  if (!raw) return "";
  return String(raw).trim();
}

// ----------------------------------------------------------------------------
// Opciones predefinidas para selects
// ----------------------------------------------------------------------------

export const GENDER_OPTIONS = [
  { value: "",       label: "Prefiero no decir" },
  { value: "male",   label: "Masculino" },
  { value: "female", label: "Femenino" },
  { value: "other",  label: "Otro" }
];

export const OBJECTIVE_OPTIONS = [
  { value: "",            label: "Sin definir" },
  { value: "weight_loss", label: "Bajar peso" },
  { value: "muscle_gain", label: "Ganar masa muscular" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "performance", label: "Rendimiento deportivo" },
  { value: "health",      label: "Salud general" },
  { value: "other",       label: "Otro" }
];

export const EXPERIENCE_OPTIONS = [
  { value: "",             label: "Sin definir" },
  { value: "beginner",     label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced",     label: "Avanzado" }
];

/**
 * Devuelve el label legible de una opción dado su value.
 */
export function optionLabel(options, value) {
  const opt = options.find(o => o.value === value);
  return opt ? opt.label : "";
}
