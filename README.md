# SMILE Chat — Minimal front-end

This repo contains a minimal single-page frontend implementing the requested architecture: landing page + demo badge, Google/email/anonymous auth via Firebase, a global chatroom and private 1-on-1 rooms, messages mapped to SMILES and rendered as molecule images using SmilesDrawer, and Firebase Realtime Database for live messages.

Setup

1. Create a Firebase project and enable Authentication (Google, Email/Password, Anonymous) and Realtime Database.
2. Replace the placeholders in `app.js`'s `firebaseConfig` with your project's config values.
3. (Optional) Create demo user in Firebase or use anonymous demo button.

Run locally

Open `index.html` in a static server or deploy to Vercel.

Vercel

This is static and ready to deploy to Vercel. Add your Firebase config to a secure place (we keep it in `app.js` for now). For production, use environment variables or server-pass-through.
