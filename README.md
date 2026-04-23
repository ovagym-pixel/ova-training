# OVA Training

Plataforma web modular para gestión de personal trainers y clientes.

## Stack

- Frontend: Vanilla JS (ES modules) + HTML + CSS
- Backend: Firebase (Firestore + Authentication)
- Hosting: GitHub Pages
- PWA instalable con soporte offline

## Setup local

1. Clonar el repo
2. Crear un proyecto Firebase llamado "ova-training"
3. Copiar la config de Firebase en `js/firebase/config.js`
4. Registrar una API key de Groq y pegarla en `js/firebase/config.js` (campo `groqConfig.apiKey`)
5. Servir con cualquier HTTP server local (ej: `python -m http.server 8000`)

## Roles

- **Admin**: vos (Simón). Un único email con acceso total.
- **Colaborador**: personas con perfil configurado por el admin.
- **Cliente**: accede con link mágico + PIN.

## Fases del proyecto

- **B.1**: Setup + auth + routing ← ESTAMOS ACÁ
- **B.2**: Modelo de datos Firestore + perfiles de rol
- **B.3**: Gestión de clientes y servicios
- **B.4**: Configuración del sistema
- **B.5**: Integración módulo de mediciones con Groq
- **B.6**: Encuestas
- **B.7**: Tutorial + pulido

## Deploy

GitHub Pages desde la branch `main`.
