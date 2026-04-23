// ============================================================================
// client-session.js — gestión de sesión del portal cliente
// ============================================================================
//
// Este módulo encapsula toda la lógica de autenticación del cliente:
//
//   1. signInAnonymously() para tener un uid de Firebase
//   2. Leer /clientAccess/{token} con ese uid (regla: lectura pública)
//   3. Determinar el flujo según el estado:
//        - Cliente sin PIN todavía  → "setPin"
//        - Dispositivo ya confiable → "ready"
//        - Dispositivo no confiable → "enterPin"
//        - Cliente bloqueado        → "locked"
//        - Portal desactivado       → "disabled"
//   4. Ofrecer métodos para setear PIN, validar PIN, marcar device como trusted
//
// Todo asume que Firebase Anonymous Auth está habilitado en el proyecto.
// ============================================================================

import { auth, db } from "../firebase/config.js";
import {
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  generateSalt,
  hashPin,
  validatePinFormat,
  deviceLabelFromUA
} from "./crypto.js";

// Estado en memoria (una sesión por pestaña)
let anonUid = null;
let loadedAccess = null;  // doc /clientAccess/{token}

// ----------------------------------------------------------------------------
// Autenticación anónima
// ----------------------------------------------------------------------------

/**
 * Garantiza que hay un usuario anónimo autenticado para el portal cliente.
 *
 * Casos que maneja:
 *   a) Ya tenemos un uid anónimo cacheado en memoria y sigue válido → usarlo
 *   b) auth.currentUser existe y es anónimo → usarlo
 *   c) auth.currentUser existe pero NO es anónimo (se loguea alguien con email
 *      y entra al link de cliente por error) → NO queremos pisar su sesión,
 *      hacemos sign-out y después signInAnonymously
 *   d) No hay user → signInAnonymously
 *
 * La clave: esperar que Firebase termine de hidratar el estado persistido
 * antes de decidir. Por eso usamos onAuthStateChanged y NO miramos
 * auth.currentUser directamente al principio (puede ser null antes de hidratar
 * y luego cambiar).
 */
export function ensureAnonAuth() {
  return new Promise((resolve, reject) => {
    // Fast path: ya resolvimos en esta misma sesión de pestaña
    if (anonUid && auth.currentUser?.uid === anonUid && auth.currentUser?.isAnonymous) {
      resolve(anonUid);
      return;
    }

    let resolved = false;

    const unsub = onAuthStateChanged(auth, async user => {
      if (resolved) return;

      // Caso a+b: user presente y anónimo → reutilizar
      if (user && user.isAnonymous) {
        resolved = true;
        unsub();
        anonUid = user.uid;
        resolve(user.uid);
        return;
      }

      // Caso c: user presente pero NO anónimo (sesión admin/colab)
      // Necesitamos desautenticarlo antes de crear la sesión anónima, porque
      // Firebase no permite dos sesiones simultáneas en la misma app.
      if (user && !user.isAnonymous) {
        resolved = true;
        unsub();
        try {
          await signOut(auth);
        } catch {}
        try {
          const cred = await signInAnonymously(auth);
          anonUid = cred.user.uid;
          resolve(cred.user.uid);
        } catch (err) {
          reject(err);
        }
        return;
      }

      // Caso d: no hay user → crear anónimo
      resolved = true;
      unsub();
      try {
        const cred = await signInAnonymously(auth);
        anonUid = cred.user.uid;
        resolve(cred.user.uid);
      } catch (err) {
        reject(err);
      }
    });

    // Safety timeout: si Firebase no dispara onAuthStateChanged en 10s
    // (raro pero puede pasar sin red), rechazar para no dejar el spinner colgado.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        reject(new Error("Timeout esperando auth. Revisá tu conexión."));
      }
    }, 10000);
  });
}

export function getAnonUid() { return anonUid; }

// ----------------------------------------------------------------------------
// Carga de /clientAccess/{token}
// ----------------------------------------------------------------------------

/**
 * Lee el doc /clientAccess/{token}. Si no existe, devuelve null.
 * Este doc tiene lectura pública (por reglas) pero solo expone datos
 * no sensibles: clientId, pinHash, salt, pinLockedUntil, clientPortalActive.
 */
export async function loadAccessDoc(token) {
  if (!token) return null;
  try {
    const ref = doc(db, "clientAccess", token);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    loadedAccess = { token, ...snap.data() };
    return loadedAccess;
  } catch (err) {
    console.error("[client-session] Error cargando /clientAccess:", err);
    throw err;
  }
}

export function getAccessDoc() { return loadedAccess; }

// ----------------------------------------------------------------------------
// Determinar el estado del flujo
// ----------------------------------------------------------------------------

/**
 * Decide qué pantalla mostrar según el estado actual del acceso.
 *
 * Devuelve uno de:
 *   "notfound"  — el token no corresponde a ningún cliente
 *   "disabled"  — el portal está desactivado para este cliente
 *   "locked"    — el cliente está bloqueado temporalmente por intentos fallidos
 *   "setPin"    — el cliente nunca configuró PIN (primera vez)
 *   "enterPin"  — hay PIN pero este device no es confiable
 *   "ready"     — este device ya es confiable, entra directo al portal
 */
export function computeAuthState(access, uid) {
  if (!access) return { state: "notfound" };

  if (access.clientPortalActive === false) {
    return { state: "disabled" };
  }

  const lockedUntil = access.pinLockedUntil?.toMillis
    ? access.pinLockedUntil.toMillis()
    : null;

  if (lockedUntil && lockedUntil > Date.now()) {
    return { state: "locked", until: lockedUntil };
  }

  if (!access.pinHash) {
    return { state: "setPin" };
  }

  const trusted = Array.isArray(access.trustedUids) ? access.trustedUids : [];
  if (uid && trusted.includes(uid)) {
    return { state: "ready" };
  }

  return { state: "enterPin" };
}

// ----------------------------------------------------------------------------
// Operaciones de escritura
// ----------------------------------------------------------------------------

/**
 * Primera configuración del PIN. Sólo permitido si el cliente todavía
 * no tiene pinHash (validado por reglas de Firestore).
 *
 * Escribe tanto en /clientAccess/{token} como en /clients/{clientId}
 * para mantener ambos docs en sync.
 */
export async function setInitialPin(token, rawPin, clientId) {
  const uid = await ensureAnonAuth();

  const validation = validatePinFormat(rawPin);
  if (!validation.ok) throw new Error(validation.error);

  const salt = generateSalt();
  const pinHash = await hashPin(rawPin, salt);

  const device = {
    uid,
    addedAt: Timestamp.now(),
    userAgent: navigator.userAgent || "",
    label: deviceLabelFromUA(navigator.userAgent || "")
  };

  // 1) Actualizar /clientAccess/{token} (lectura pública, escritura con validación)
  const accessRef = doc(db, "clientAccess", token);
  await updateDoc(accessRef, {
    pinHash,
    salt,
    pinSetAt: serverTimestamp(),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    trustedUids: arrayUnion(uid)
  });

  // 2) Actualizar /clients/{clientId} con los mismos datos
  //    trustedUids es el array "plano" de strings que usan las reglas de Firestore
  //    (porque hasAny no matchea objetos parciales); trustedDevices es el que
  //    el admin ve con labels, userAgent, etc.
  const clientRef = doc(db, "clients", clientId);
  await updateDoc(clientRef, {
    pinHash,
    salt,
    pinSetAt: serverTimestamp(),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    trustedDevices: arrayUnion(device),
    trustedUids: arrayUnion(uid)
  });

  // Refrescar cache
  await loadAccessDoc(token);
  return uid;
}

/**
 * Validar un intento de PIN. Si es correcto, agrega el uid a trustedUids.
 * Si es incorrecto, incrementa pinFailedAttempts (rate limiting).
 *
 * Devuelve: { ok: true } o { ok: false, reason: "badPin"|"locked", remaining?: number }
 */
export async function validatePinAttempt(token, rawPin, clientId) {
  const uid = await ensureAnonAuth();
  const access = await loadAccessDoc(token);
  if (!access) throw new Error("Token inválido");

  const state = computeAuthState(access, uid);
  if (state.state === "locked") {
    return { ok: false, reason: "locked", until: state.until };
  }

  const validation = validatePinFormat(rawPin);
  if (!validation.ok) {
    return { ok: false, reason: "badFormat", error: validation.error };
  }

  const candidateHash = await hashPin(rawPin, access.salt);

  if (candidateHash === access.pinHash) {
    // ✅ PIN correcto → agregar device como confiable, resetear contador
    const device = {
      uid,
      addedAt: Timestamp.now(),
      userAgent: navigator.userAgent || "",
      label: deviceLabelFromUA(navigator.userAgent || "")
    };

    await updateDoc(doc(db, "clientAccess", token), {
      trustedUids: arrayUnion(uid),
      pinFailedAttempts: 0,
      pinLockedUntil: null
    });

    await updateDoc(doc(db, "clients", clientId), {
      trustedDevices: arrayUnion(device),
      trustedUids: arrayUnion(uid),
      pinFailedAttempts: 0,
      pinLockedUntil: null
    });

    await loadAccessDoc(token);
    return { ok: true };
  }

  // ❌ PIN incorrecto → rate limiting
  const attempts = (access.pinFailedAttempts || 0) + 1;
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos

  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = Timestamp.fromMillis(Date.now() + LOCK_DURATION_MS);
    await updateDoc(doc(db, "clientAccess", token), {
      pinFailedAttempts: attempts,
      pinLockedUntil: lockUntil
    });
    await updateDoc(doc(db, "clients", clientId), {
      pinFailedAttempts: attempts,
      pinLockedUntil: lockUntil
    });
    return { ok: false, reason: "locked", until: lockUntil.toMillis() };
  }

  await updateDoc(doc(db, "clientAccess", token), {
    pinFailedAttempts: attempts
  });
  await updateDoc(doc(db, "clients", clientId), {
    pinFailedAttempts: attempts
  });

  return { ok: false, reason: "badPin", remaining: MAX_ATTEMPTS - attempts };
}

// ----------------------------------------------------------------------------
// LocalStorage: persistir el último token usado en este device
// Esto solo sirve para UX — no es seguridad. La seguridad real la da
// el uid anónimo + trustedUids en Firestore.
// ----------------------------------------------------------------------------

const LAST_TOKEN_KEY = "ova-client-last-token";

export function rememberLastToken(token) {
  try { localStorage.setItem(LAST_TOKEN_KEY, token); } catch {}
}

export function getLastToken() {
  try { return localStorage.getItem(LAST_TOKEN_KEY); } catch { return null; }
}

export function clearLastToken() {
  try { localStorage.removeItem(LAST_TOKEN_KEY); } catch {}
}
