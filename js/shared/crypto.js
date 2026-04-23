// ============================================================================
// crypto.js — utilidades de hashing y generación de tokens
// ============================================================================
//
// Usamos la Web Crypto API del navegador (nativa, sin dependencias).
//
// Funciones expuestas:
//   - generateAccessToken(length = 32)  → string aleatorio alfanumérico
//   - hashPin(pin, salt)                → SHA-256 con salt → hex string
//   - generateSalt()                    → string aleatorio de 16 chars
//   - normalizePin(raw)                 → uppercase + trim, para comparar
//
// Nota sobre seguridad:
// El hash del PIN usa SHA-256 con un salt por cliente. No es bcrypt/argon2
// (que serían lo ideal para passwords) porque:
//   a) Esto es un PIN de 4-6 chars, no una contraseña fuerte
//   b) SHA-256 está disponible nativamente en el navegador sin librerías
//   c) El rate limiting en Firestore (pinFailedAttempts + pinLockedUntil) es
//      la defensa principal contra fuerza bruta
// ============================================================================

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Genera un string aleatorio alfanumérico de la longitud indicada.
 * Usa crypto.getRandomValues() — seguro criptográficamente.
 */
export function generateAccessToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

/**
 * Genera un salt corto (16 chars). Se guarda junto al pinHash en Firestore.
 * Cada cliente tiene su propio salt → dos clientes con el mismo PIN tienen
 * hashes distintos.
 */
export function generateSalt() {
  return generateAccessToken(16);
}

/**
 * Normaliza el PIN ingresado por el usuario antes de hashear o comparar.
 * Esto evita que "abc1" y "ABC1" se traten como PINs distintos.
 */
export function normalizePin(raw) {
  if (!raw) return "";
  return String(raw).trim().toUpperCase();
}

/**
 * Hashea un PIN con salt. Devuelve un string hexadecimal.
 *
 * Protocolo: sha256(salt + ":" + normalizedPin)
 *
 * Aunque es una única pasada de SHA-256 (no stretching), para un PIN corto
 * con rate limiting agresivo (bloqueo tras 5 intentos) es suficiente.
 */
export async function hashPin(pin, salt) {
  const normalized = normalizePin(pin);
  if (!normalized) throw new Error("PIN vacío");
  if (!salt) throw new Error("Salt vacío");

  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${normalized}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convertir ArrayBuffer a hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida que un PIN cumpla con los requisitos de formato.
 * Reglas:
 *  - 4 a 6 caracteres
 *  - solo alfanuméricos (A-Z, 0-9 después de normalizar)
 *
 * Devuelve { ok: boolean, error: string | null }
 */
export function validatePinFormat(raw) {
  const normalized = normalizePin(raw);
  if (normalized.length < 4) return { ok: false, error: "El PIN debe tener al menos 4 caracteres." };
  if (normalized.length > 6) return { ok: false, error: "El PIN no puede tener más de 6 caracteres." };
  if (!/^[A-Z0-9]+$/.test(normalized)) return { ok: false, error: "El PIN solo puede contener letras y números." };
  return { ok: true, error: null };
}

/**
 * Genera una "etiqueta" legible para un dispositivo a partir de su userAgent.
 * Sirve para que el admin pueda ver "iPhone de fulano" en lugar de un uid
 * anónimo de 28 chars.
 *
 * Es heurístico y grosero — mejora progresiva más adelante si hace falta.
 */
export function deviceLabelFromUA(userAgent = "") {
  const ua = userAgent.toLowerCase();
  let os = "Desconocido";
  if (ua.includes("iphone") || ua.includes("ipad")) os = "iPhone/iPad";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac")) os = "Mac";
  else if (ua.includes("linux")) os = "Linux";

  let browser = "";
  if (ua.includes("chrome") && !ua.includes("edg")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edg")) browser = "Edge";

  return browser ? `${os} · ${browser}` : os;
}
