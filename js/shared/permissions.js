// ============================================================================
// permissions.js — helpers para el modelo de permisos anidado por módulo
// ============================================================================
//
// Los permisos se guardan en /roleProfiles/{id}.permissions como un objeto
// anidado. Ejemplo:
//
//   permissions: {
//     clients: { view: true, create: false, edit: true, delete: false, viewAll: false },
//     measurements: { view: true, create: true, edit: true, delete: false },
//     ...
//   }
//
// Este módulo centraliza:
//   - La definición del esquema completo (PERMISSION_SCHEMA)
//   - Presets para facilitar la creación de nuevos perfiles
//   - El helper hasPermission() que usa notación "modulo.accion"
//
// Filosofía: si un permiso no está definido → false. Siempre cerrado por
// defecto. El objeto ADMIN_PERMISSIONS se usa SOLO para el perfil Administrador
// y se genera poniendo todo en true.
// ============================================================================

/**
 * Esquema completo de permisos. Define qué módulos existen y qué acciones
 * soporta cada uno. Esto es la fuente de verdad para renderizar checkboxes
 * en la UI y para validar.
 *
 * Si agregás un módulo nuevo al sistema, lo registrás acá.
 */
export const PERMISSION_SCHEMA = [
  {
    module: "clients",
    label: "Clientes",
    actions: [
      { key: "view",     label: "Ver clientes asignados" },
      { key: "viewAll",  label: "Ver TODOS los clientes (no solo asignados)" },
      { key: "create",   label: "Crear clientes" },
      { key: "edit",     label: "Editar clientes" },
      { key: "delete",   label: "Eliminar clientes" }
    ]
  },
  {
    module: "assignments",
    label: "Asignación de clientes",
    actions: [
      { key: "assign", label: "Asignar/reasignar clientes a colaboradores" }
    ]
  },
  {
    module: "measurements",
    label: "Mediciones",
    actions: [
      { key: "view",   label: "Ver mediciones" },
      { key: "create", label: "Crear mediciones" },
      { key: "edit",   label: "Editar mediciones" },
      { key: "delete", label: "Eliminar mediciones" }
    ]
  },
  {
    module: "loadTracker",
    label: "Tracker de cargas",
    actions: [
      { key: "view",   label: "Ver cargas" },
      { key: "create", label: "Registrar cargas" },
      { key: "edit",   label: "Editar cargas" },
      { key: "delete", label: "Eliminar cargas" }
    ]
  },
  {
    module: "progressionCalculator",
    label: "Calculadora de progresión",
    actions: [
      { key: "use", label: "Usar la calculadora" }
    ]
  },
  {
    module: "mesocycles",
    label: "Mesociclos",
    actions: [
      { key: "view",   label: "Ver mesociclos" },
      { key: "create", label: "Crear mesociclos" },
      { key: "edit",   label: "Editar mesociclos" },
      { key: "delete", label: "Eliminar mesociclos" }
    ]
  },
  {
    module: "streaks",
    label: "Rachas y metas",
    actions: [
      { key: "view", label: "Ver rachas" },
      { key: "edit", label: "Editar metas" }
    ]
  },
  {
    module: "protein",
    label: "Proteína",
    actions: [
      { key: "view", label: "Ver tracking de proteína" },
      { key: "edit", label: "Registrar/editar consumo" }
    ]
  },
  {
    module: "notes",
    label: "Notas",
    actions: [
      { key: "view",   label: "Ver notas" },
      { key: "create", label: "Crear notas" },
      { key: "edit",   label: "Editar notas" },
      { key: "delete", label: "Eliminar notas" }
    ]
  },
  {
    module: "onboarding",
    label: "Onboarding",
    actions: [
      { key: "view", label: "Ver onboarding" },
      { key: "edit", label: "Completar/editar onboarding" }
    ]
  },
  {
    module: "nutrition",
    label: "Nutrición",
    actions: [
      { key: "view", label: "Ver módulo de nutrición" }
    ]
  },
  {
    module: "payments",
    label: "Pagos",
    actions: [
      { key: "view",     label: "Ver pagos" },
      { key: "register", label: "Registrar pagos" }
    ]
  },
  {
    module: "roleProfiles",
    label: "Perfiles de rol",
    adminOnly: true,
    actions: [
      { key: "view", label: "Ver perfiles" },
      { key: "edit", label: "Crear/editar perfiles" }
    ]
  },
  {
    module: "users",
    label: "Usuarios / Colaboradores",
    adminOnly: true,
    actions: [
      { key: "view", label: "Ver usuarios" },
      { key: "edit", label: "Crear/editar usuarios" }
    ]
  },
  {
    module: "config",
    label: "Configuración del sistema",
    adminOnly: true,
    actions: [
      { key: "view", label: "Ver configuración" },
      { key: "edit", label: "Editar configuración" }
    ]
  }
];

/**
 * Genera un objeto de permisos vacío (todo false) con la estructura completa.
 * Útil para inicializar un perfil nuevo y como base para los presets.
 */
export function emptyPermissions() {
  const out = {};
  for (const mod of PERMISSION_SCHEMA) {
    out[mod.module] = {};
    for (const action of mod.actions) {
      out[mod.module][action.key] = false;
    }
  }
  return out;
}

/**
 * Genera un objeto de permisos con TODO en true. Esto es lo que usa
 * el perfil Administrador. No se debería usar para otros perfiles.
 */
export function fullPermissions() {
  const out = {};
  for (const mod of PERMISSION_SCHEMA) {
    out[mod.module] = {};
    for (const action of mod.actions) {
      out[mod.module][action.key] = true;
    }
  }
  return out;
}

/**
 * Chequea si un objeto de permisos autoriza una acción específica.
 * Uso: hasPermission(perms, "clients.create")
 *
 * Si cualquier parte del path no existe → false. Nunca tira error.
 */
export function hasPermission(permissions, path) {
  if (!permissions || typeof permissions !== "object") return false;
  if (!path || typeof path !== "string") return false;

  const [module, action] = path.split(".");
  if (!module || !action) return false;

  const modPerms = permissions[module];
  if (!modPerms || typeof modPerms !== "object") return false;

  return modPerms[action] === true;
}

/**
 * Devuelve un objeto "sano" de permisos. Si viene algo raro de Firestore
 * (campos que faltan, módulos nuevos que se agregaron después), rellena
 * con false. Esto previene que la UI explote con undefineds.
 */
export function normalizePermissions(raw) {
  const base = emptyPermissions();
  if (!raw || typeof raw !== "object") return base;

  for (const mod of PERMISSION_SCHEMA) {
    if (raw[mod.module] && typeof raw[mod.module] === "object") {
      for (const action of mod.actions) {
        if (raw[mod.module][action.key] === true) {
          base[mod.module][action.key] = true;
        }
      }
    }
  }
  return base;
}

/**
 * Presets para acelerar la creación de perfiles comunes.
 * No son perfiles "oficiales" — son solo plantillas que el admin puede
 * elegir al crear un perfil nuevo para no tildar 40 checkboxes.
 */
export const PROFILE_PRESETS = {
  instructor: {
    label: "Instructor de musculación",
    description: "Entrena a sus clientes asignados. Carga mediciones, cargas y mesociclos.",
    build() {
      const p = emptyPermissions();
      p.clients.view = true;
      p.clients.edit = true;
      p.assignments.assign = false;
      p.measurements.view = true;
      p.measurements.create = true;
      p.measurements.edit = true;
      p.loadTracker.view = true;
      p.loadTracker.create = true;
      p.loadTracker.edit = true;
      p.progressionCalculator.use = true;
      p.mesocycles.view = true;
      p.mesocycles.create = true;
      p.mesocycles.edit = true;
      p.streaks.view = true;
      p.protein.view = true;
      p.notes.view = true;
      p.notes.create = true;
      p.notes.edit = true;
      p.onboarding.view = true;
      p.onboarding.edit = true;
      return p;
    },
    widgets: ["myClients", "todaySchedule", "pendingMeasurements", "expiringServices"]
  },

  nutricionista: {
    label: "Nutricionista",
    description: "Trabaja con mediciones, proteína y nutrición. Sin cargas ni mesociclos.",
    build() {
      const p = emptyPermissions();
      p.clients.view = true;
      p.clients.edit = true;
      p.measurements.view = true;
      p.measurements.create = true;
      p.measurements.edit = true;
      p.protein.view = true;
      p.protein.edit = true;
      p.nutrition.view = true;
      p.notes.view = true;
      p.notes.create = true;
      p.notes.edit = true;
      p.onboarding.view = true;
      return p;
    },
    widgets: ["myClients", "pendingMeasurements", "recentMeasurements"]
  },

  recepcion: {
    label: "Recepción",
    description: "Alta de clientes y registro de pagos. Sin acceso técnico.",
    build() {
      const p = emptyPermissions();
      p.clients.view = true;
      p.clients.viewAll = true;
      p.clients.create = true;
      p.clients.edit = true;
      p.payments.view = true;
      p.payments.register = true;
      p.onboarding.view = true;
      return p;
    },
    widgets: ["allClients", "expiringServices", "pendingOnboarding"]
  },

  soloLectura: {
    label: "Solo lectura",
    description: "Ve todo pero no modifica nada. Útil para contadores o consultores.",
    build() {
      const p = emptyPermissions();
      p.clients.view = true;
      p.clients.viewAll = true;
      p.measurements.view = true;
      p.loadTracker.view = true;
      p.mesocycles.view = true;
      p.streaks.view = true;
      p.protein.view = true;
      p.notes.view = true;
      p.onboarding.view = true;
      p.payments.view = true;
      return p;
    },
    widgets: ["allClients", "recentMeasurements", "monthlyRevenue"]
  }
};
