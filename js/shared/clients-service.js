// ============================================================================
// clients-service.js — operaciones CRUD centralizadas para clientes
// ============================================================================
//
// Todas las mutaciones y lecturas de /clients, /clientsPublic y /clientAccess
// pasan por acá. Así hay un solo lugar donde mantener la sincronización
// entre los 3 docs relacionados.
//
// Reglas de negocio centralizadas:
//   - Al crear un cliente → se crean los 3 docs relacionados con accessToken
//   - Al editar datos que afecten al portal (displayName, phone, etc.) →
//     se sincroniza /clientsPublic Y /clientAccess.displayName
//   - Al eliminar → borra los 3 docs + opcionalmente sus subcolecciones
//   - Al desactivar → toca solo /clients.active + /clientAccess.clientPortalActive
// ============================================================================

import { db } from "../firebase/config.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
  limit as limitQuery
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { generateAccessToken } from "./crypto.js";

// ----------------------------------------------------------------------------
// Lectura
// ----------------------------------------------------------------------------

/**
 * Lee un cliente por id. Devuelve null si no existe.
 */
export async function getClient(clientId) {
  const snap = await getDoc(doc(db, "clients", clientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Lista clientes con filtros opcionales.
 * Opciones:
 *   - includeInactive (default false): si true, también trae los inactivos
 *   - assignedColabId: filtrar por colab asignado
 *   - limit: máximo a traer
 *
 * Orden por createdAt desc por defecto.
 */
export async function listClients(opts = {}) {
  const { includeInactive = false, assignedColabId = null, limit = 200 } = opts;

  const constraints = [];
  if (!includeInactive) constraints.push(where("active", "==", true));
  if (assignedColabId) constraints.push(where("assignedColabId", "==", assignedColabId));
  constraints.push(orderBy("createdAt", "desc"));
  if (limit) constraints.push(limitQuery(limit));

  const q = query(collection(db, "clients"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Lista clientes sin filtros de active. Útil para búsqueda global.
 * IMPORTANTE: no agregar filtros adicionales — las reglas de Firestore
 * filtran según el rol del usuario automáticamente. Si un colab llama
 * esto, solo le llegan sus clientes asignados.
 *
 * Nota práctica: con reglas restrictivas, colab NO puede hacer
 * "list all" — tiene que filtrar por assignedColabId para que Firestore
 * devuelva algo. Por eso esta función toma el rol.
 */
export async function listAllClientsForRole(role, uid) {
  if (role === "admin") {
    return listClients({ includeInactive: true });
  }
  if (role === "colab") {
    return listClients({ includeInactive: true, assignedColabId: uid });
  }
  return [];
}

// ----------------------------------------------------------------------------
// Creación
// ----------------------------------------------------------------------------

/**
 * Crea un cliente nuevo con los 3 docs sincronizados.
 *
 * El objeto `data` debe traer los campos del formulario. Los campos derivados
 * (accessToken, timestamps, flags) los genera esta función.
 *
 * Devuelve { clientId, accessToken }.
 */
export async function createClient(data) {
  const displayName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
  if (!displayName) throw new Error("Faltan nombre y apellido.");

  const accessToken = generateAccessToken(40);

  // Generamos el ID del doc primero para poder referenciarlo en los otros 2
  const clientRef = doc(collection(db, "clients"));
  const clientId = clientRef.id;

  // 1) /clients/{id} — datos sensibles completos
  const clientDoc = {
    // Datos básicos
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    displayName,
    phone: data.phone || "",
    email: data.email || "",
    birthDate: data.birthDate || "",
    gender: data.gender || "",

    // Salud y objetivos
    medicalConditions: data.medicalConditions || "",
    injuries: data.injuries || "",
    objective: data.objective || "",
    experienceLevel: data.experienceLevel || "",

    // Notas internas
    internalNotes: data.internalNotes || "",

    // Administrativo
    admissionDate: data.admissionDate || "",
    assignedColabId: data.assignedColabId || null,
    active: true,

    // Contacto de emergencia
    emergencyContactName: data.emergencyContactName || "",
    emergencyContactPhone: data.emergencyContactPhone || "",

    // Portal cliente
    accessToken,
    accessTokenGeneratedAt: serverTimestamp(),
    clientPortalActive: true,
    trustedDevices: [],
    trustedUids: [],
    pinFailedAttempts: 0,
    pinLockedUntil: null,

    // Metadata
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(clientRef, clientDoc);

  // 2) /clientsPublic/{id} — vista del cliente
  await setDoc(doc(db, "clientsPublic", clientId), {
    displayName,
    phone: data.phone || "",
    photoUrl: "",
    emergencyContact: data.emergencyContactName
      ? `${data.emergencyContactName}${data.emergencyContactPhone ? " · " + data.emergencyContactPhone : ""}`
      : "",
    currentServiceName: "",
    currentServiceVigencia: "",
    updatedAt: serverTimestamp()
  });

  // 3) /clientAccess/{token} — doc para el flujo de login
  await setDoc(doc(db, "clientAccess", accessToken), {
    clientId,
    displayName,
    clientPortalActive: true,
    trustedUids: [],
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    createdAt: serverTimestamp()
  });

  return { clientId, accessToken };
}

// ----------------------------------------------------------------------------
// Actualización
// ----------------------------------------------------------------------------

/**
 * Actualiza datos del cliente y sincroniza los docs relacionados.
 *
 * Campos que se sincronizan en /clientsPublic cuando cambian:
 *   - firstName/lastName → displayName (en los 3 docs)
 *   - phone → /clientsPublic.phone
 *   - emergencyContact* → /clientsPublic.emergencyContact
 *
 * Campos que se sincronizan en /clientAccess:
 *   - displayName (para que el saludo en el login del cliente quede bien)
 */
export async function updateClient(clientId, updates) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente no encontrado.");

  const payload = { ...updates, updatedAt: serverTimestamp() };

  // Si cambió el nombre, recalcular displayName
  let displayNameChanged = false;
  if (updates.firstName !== undefined || updates.lastName !== undefined) {
    const firstName = updates.firstName !== undefined ? updates.firstName : client.firstName;
    const lastName  = updates.lastName  !== undefined ? updates.lastName  : client.lastName;
    payload.displayName = `${firstName || ""} ${lastName || ""}`.trim();
    displayNameChanged = payload.displayName !== client.displayName;
  }

  // 1) Update /clients/{id}
  await updateDoc(doc(db, "clients", clientId), payload);

  // 2) Sync /clientsPublic si cambiaron datos públicos
  const publicUpdate = { updatedAt: serverTimestamp() };
  let hasPublicChanges = false;
  if (displayNameChanged) {
    publicUpdate.displayName = payload.displayName;
    hasPublicChanges = true;
  }
  if (updates.phone !== undefined) {
    publicUpdate.phone = updates.phone;
    hasPublicChanges = true;
  }
  if (updates.emergencyContactName !== undefined || updates.emergencyContactPhone !== undefined) {
    const n = updates.emergencyContactName !== undefined ? updates.emergencyContactName : client.emergencyContactName;
    const p = updates.emergencyContactPhone !== undefined ? updates.emergencyContactPhone : client.emergencyContactPhone;
    publicUpdate.emergencyContact = n ? `${n}${p ? " · " + p : ""}` : "";
    hasPublicChanges = true;
  }
  if (hasPublicChanges) {
    await updateDoc(doc(db, "clientsPublic", clientId), publicUpdate);
  }

  // 3) Sync /clientAccess si cambió displayName
  if (displayNameChanged && client.accessToken) {
    try {
      await updateDoc(doc(db, "clientAccess", client.accessToken), {
        displayName: payload.displayName
      });
    } catch (err) {
      console.warn("[clients-service] no se pudo sincronizar clientAccess:", err);
    }
  }
}

// ----------------------------------------------------------------------------
// Activar / desactivar
// ----------------------------------------------------------------------------

/**
 * Marca el cliente como inactivo (soft delete). El portal se desactiva
 * automáticamente también.
 */
export async function deactivateClient(clientId) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente no encontrado.");

  await updateDoc(doc(db, "clients", clientId), {
    active: false,
    clientPortalActive: false,
    updatedAt: serverTimestamp()
  });

  if (client.accessToken) {
    try {
      await updateDoc(doc(db, "clientAccess", client.accessToken), {
        clientPortalActive: false
      });
    } catch {}
  }
}

/**
 * Reactiva un cliente desactivado.
 */
export async function activateClient(clientId) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente no encontrado.");

  await updateDoc(doc(db, "clients", clientId), {
    active: true,
    clientPortalActive: true,
    updatedAt: serverTimestamp()
  });

  if (client.accessToken) {
    try {
      await updateDoc(doc(db, "clientAccess", client.accessToken), {
        clientPortalActive: true
      });
    } catch {}
  }
}

// ----------------------------------------------------------------------------
// Eliminar definitivamente
// ----------------------------------------------------------------------------

/**
 * Borra los 3 docs principales del cliente. NO borra subcolecciones
 * (attendance, proteinLog, etc.) porque Firestore no permite borrar
 * subcolecciones atómicamente desde el frontend.
 *
 * Para una limpieza completa, a futuro habría que hacerlo con Cloud Functions
 * (requiere Blaze). Por ahora advertimos al usuario al eliminar.
 */
export async function deleteClientPermanent(clientId) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Cliente no encontrado.");

  // Orden de borrado: clientAccess primero (para cortar acceso inmediato),
  // después clientsPublic, después clients.
  if (client.accessToken) {
    try {
      await deleteDoc(doc(db, "clientAccess", client.accessToken));
    } catch {}
  }

  try {
    await deleteDoc(doc(db, "clientsPublic", clientId));
  } catch {}

  await deleteDoc(doc(db, "clients", clientId));
}

// ----------------------------------------------------------------------------
// Listar colaboradores (para el select "asignar a")
// ----------------------------------------------------------------------------

/**
 * Lista todos los colaboradores activos, ordenados por nombre.
 * Necesario para el select de "asignar colab" al crear/editar cliente.
 */
export async function listActiveColabs() {
  const q = query(
    collection(db, "users"),
    where("type", "==", "colab"),
    where("active", "==", true)
  );
  const snap = await getDocs(q);
  const colabs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  colabs.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  return colabs;
}
