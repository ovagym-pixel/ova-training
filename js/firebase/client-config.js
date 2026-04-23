// ============================================================================
// client-config.js — instancia Firebase aislada para el portal cliente
// ============================================================================
//
// Inicializa una segunda "app" de Firebase con el mismo config, pero un
// nombre distinto ("client-portal"). Firebase permite tener múltiples apps
// simultáneas — cada una tiene su propio estado de auth.
//
// Esto evita que la sesión anónima del cliente pise la sesión admin del
// navegador. Son dos sesiones paralelas gracias a nombres distintos.
//
// El cliente usa:
//   - clientAuth  → su propia instancia de auth (anónima)
//   - db          → el mismo Firestore que el admin (re-exportado de config.js)
//
// Firestore se comparte porque el cache y la conexión son costosos y no hay
// razón para duplicarlos. Las reglas de Firestore son las que determinan qué
// puede ver/escribir cada sesión, y funcionan correctamente con ambos auths
// porque request.auth.uid se resuelve por operación, no por app.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig, db } from "./config.js";

// Segunda app con nombre distinto. Las dos apps apuntan al mismo proyecto
// Firebase pero tienen estado de auth independiente.
export const clientApp = initializeApp(firebaseConfig, "client-portal");

export const clientAuth = getAuth(clientApp);

// Re-export del Firestore compartido para que client-session.js solo importe
// de acá.
export { db };
