// ============================================================================
// config.js — Firebase app principal (admin / colab)
// ============================================================================
//
// Esta es la app "principal" que usan admin y colab. Todas las pantallas
// internas (/dashboard, /role-profiles, /admin-client-access, etc.) importan
// auth y db de acá.
//
// El portal cliente (/c/:token) usa client-config.js — una app separada con
// su propia instancia de auth. Así una sesión anónima de cliente NUNCA pisa
// la sesión admin aunque se abran ambas en pestañas distintas.
//
// Ambas apps comparten Firestore (db) porque el Firestore cache/state es
// por-app, no por-auth. Por eso ponemos el cache acá y lo re-exportamos
// desde client-config.js.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "REEMPLAZAR_CON_TU_API_KEY",
  authDomain: "ova-training.firebaseapp.com",
  projectId: "ova-training",
  storageBucket: "ova-training.firebasestorage.app",
  messagingSenderId: "REEMPLAZAR",
  appId: "REEMPLAZAR"
};

// App principal (sin nombre custom → es la "default")
export const app = initializeApp(firebaseConfig);

// Firestore con persistencia multi-tab (permite tener varias pestañas de la
// app abiertas simultáneamente sin que se pelee el cache)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Auth de la sesión admin/colab
export const auth = getAuth(app);

export const groqConfig = {
  apiKey: "REEMPLAZAR_CON_TU_API_KEY_GROQ",
  model: "llama-3.3-70b-versatile",
  url: "https://api.groq.com/openai/v1/chat/completions"
};

// Export para que client-config.js pueda acceder al config sin repetirlo
export { firebaseConfig };
