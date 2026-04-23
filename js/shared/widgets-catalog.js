// ============================================================================
// widgets-catalog.js — catálogo de widgets de dashboard
// ============================================================================
//
// Los widgets se persisten en Firestore (/config/widgets-catalog) para que
// a futuro se puedan editar desde UI. Este archivo define:
//
//   1. Los widgets DEFAULT que se usan como seed inicial la primera vez
//      que el admin abre el CRUD de perfiles y la colección está vacía.
//
//   2. El helper loadWidgetsCatalog() que lee desde Firestore con cache
//      en memoria.
//
// Estructura del doc en Firestore:
//   /config/widgets-catalog
//     {
//       widgets: [
//         { id, label, description, requires: [permission_paths] }
//       ]
//     }
// ============================================================================

import { db } from "../firebase/config.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Catálogo default. Se usa como semilla y como fallback si Firestore está
 * offline la primera vez que se abre la app.
 */
export const DEFAULT_WIDGETS = [
  {
    id: "myClients",
    label: "Mis clientes",
    description: "Lista y contador de clientes asignados al usuario.",
    requires: ["clients.view"]
  },
  {
    id: "allClients",
    label: "Todos los clientes",
    description: "Lista global de clientes (solo para quienes ven todos).",
    requires: ["clients.viewAll"]
  },
  {
    id: "todaySchedule",
    label: "Agenda de hoy",
    description: "Turnos y sesiones programadas para el día actual.",
    requires: ["clients.view"]
  },
  {
    id: "pendingMeasurements",
    label: "Mediciones pendientes",
    description: "Clientes a los que les toca medición en los próximos días.",
    requires: ["measurements.view"]
  },
  {
    id: "recentMeasurements",
    label: "Mediciones recientes",
    description: "Últimas mediciones cargadas en el sistema.",
    requires: ["measurements.view"]
  },
  {
    id: "expiringServices",
    label: "Servicios por vencer",
    description: "Clientes con servicios que vencen en los próximos 7 días.",
    requires: ["clients.view"]
  },
  {
    id: "monthlyRevenue",
    label: "Ingresos del mes",
    description: "Total facturado en el mes en curso.",
    requires: ["payments.view"]
  },
  {
    id: "activeClientsCount",
    label: "Clientes activos",
    description: "Contador rápido de clientes con servicio vigente.",
    requires: ["clients.view"]
  },
  {
    id: "pendingOnboarding",
    label: "Onboarding pendiente",
    description: "Clientes nuevos que no completaron el proceso de alta.",
    requires: ["onboarding.view"]
  },
  {
    id: "streaksLeaderboard",
    label: "Top rachas",
    description: "Ranking de clientes con rachas de asistencia más largas.",
    requires: ["streaks.view"]
  }
];

// Cache en memoria para evitar lecturas repetidas en la misma sesión
let cachedCatalog = null;

/**
 * Lee el catálogo desde Firestore. Si no existe el doc, devuelve DEFAULT_WIDGETS
 * como fallback (sin crear el doc — solo el admin puede inicializarlo).
 */
export async function loadWidgetsCatalog() {
  if (cachedCatalog) return cachedCatalog;

  try {
    const ref = doc(db, "config", "widgets-catalog");
    const snap = await getDoc(ref);

    if (snap.exists() && Array.isArray(snap.data().widgets)) {
      cachedCatalog = snap.data().widgets;
      return cachedCatalog;
    }
  } catch (err) {
    console.warn("[widgets-catalog] No se pudo leer de Firestore, usando defaults:", err.message);
  }

  // Fallback: devolvemos defaults pero NO cacheamos (para que el próximo
  // intento vuelva a consultar Firestore)
  return DEFAULT_WIDGETS;
}

/**
 * Escribe el catálogo default en Firestore. Solo se llama desde el botón
 * "Inicializar catálogo" que aparece si el doc no existe.
 * Requiere permisos de admin (las reglas lo validan).
 */
export async function seedWidgetsCatalog() {
  const ref = doc(db, "config", "widgets-catalog");
  await setDoc(ref, {
    widgets: DEFAULT_WIDGETS,
    seededAt: serverTimestamp(),
    version: 1
  });
  cachedCatalog = DEFAULT_WIDGETS;
}

/**
 * Chequea si el catálogo ya existe en Firestore (para decidir si mostrar
 * el botón de seed o no).
 */
export async function widgetsCatalogExists() {
  try {
    const ref = doc(db, "config", "widgets-catalog");
    const snap = await getDoc(ref);
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * Limpia el cache (útil después de un seed o si se sabe que hubo cambios).
 */
export function clearWidgetsCacheLocal() {
  cachedCatalog = null;
}
