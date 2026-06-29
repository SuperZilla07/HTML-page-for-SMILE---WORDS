# VCMC Molecular Chat

Firebase/Vercel-ready chat app for sending words as VCMC SMILES. Messages are stored as SMILES arrays, rendered as molecule images, and decoded client-side when a message is tapped.

## Features

- Landing screen with beta badge and demo credentials
- Google sign-in and email/password authentication
- Global live chatroom
- Private 1-on-1 rooms after contact requests are accepted
- Messages stored as VCMC SMILES, not plaintext
- Molecule cards rendered via PubChem first, Cactus fallback, then local SVG fallback
- Firebase Realtime Database live updates
- Vercel-ready Vite build

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env` with a Firebase web app config. Enable these Firebase products:

- Authentication: Email/Password and Google
- Realtime Database

## Vercel

Add the same variables from `.env.example` in Vercel Project Settings > Environment Variables.

Build command:

```bash
npm run build
```

Output directory:

```bash
dist
```

## Firebase Rules

`database.rules.json` contains a starter ruleset for authenticated global chat, private rooms, contacts, and friend requests. Review before production use.

## Demo Account

Set:

```env
VITE_DEMO_EMAIL=demo@vcmc.app
VITE_DEMO_PASSWORD=demo123456
```

Then create the same user in Firebase Authentication, or register it through the app once.
