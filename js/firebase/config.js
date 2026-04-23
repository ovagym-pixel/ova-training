import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAiUOOJ4wX5mJZ8_8OyEuYI-6ySRTImq14",
  authDomain: "ova-training.firebaseapp.com",
  projectId: "ova-training",
  storageBucket: "ova-training.firebasestorage.app",
  messagingSenderId: "760177451014",
  appId: "1:760177451014:web:0972274591d71c8d526387"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

enableIndexedDbPersistence(db).catch(err => {
  if (err.code === "failed-precondition") {
    console.warn("Persistencia offline: múltiples pestañas abiertas");
  } else if (err.code === "unimplemented") {
    console.warn("Persistencia offline no soportada en este navegador");
  }
});

export const groqConfig = {
  apiKey: "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",
  model: "llama-3.3-70b-versatile",
  url: "https://api.groq.com/openai/v1/chat/completions"
};
