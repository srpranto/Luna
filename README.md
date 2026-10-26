# 🌙 Luna

> Simple, fast, and private late-night chat with strangers. No accounts, no clutter, and end-to-end encrypted.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-luna--ggwp.vercel.app-blue?style=for-the-badge&logo=vercel)](https://luna-ggwp.vercel.app/)

👉 **Try it live**: [https://luna-ggwp.vercel.app/](https://luna-ggwp.vercel.app/)

---

## What is Luna?

Luna is a modern, text-only chat app that connects you with people around the world based on shared interests—or random serendipity.

There are **zero sign-ups**, no passwords, and no email verification. You open the site, pick topics you like (or leave them blank), and start talking. If the vibe isn't right, tap **Next** to meet someone new.

---

## ✨ Features You'll Love

- **No Sign-Up**: Just open the link and start chatting. No personal info needed.
- **Topic Matching**: Add tags like `#anime`, `#coding`, or `#music` to match with people who like the same things.
- **True End-to-End Encryption**: Chats are encrypted directly on your device with ECDH (P-256) and AES-GCM 256. Even the server cannot read your messages.
- **WhatsApp-Style Read Receipts**: One check (`✓`) when sent, two checks (`✓✓`) in blue when the other person actually reads it on focus.
- **Fast & Responsive**: Clean UI designed for late-night typing, with smooth auto-expanding text, markdown formatting, and link previews.
- **Desktop Keyboard Shortcuts**:
  - `Enter` to send, `Shift + Enter` for a new line.
  - Just start typing on desktop to auto-focus the message composer.
  - `Esc` to cancel replies or editing.
- **Mutual Reconnect**: Accidentally disconnected? Both people can tap "Reconnect" within 2 minutes to pick up where you left off.
- **Installable PWA**: Works on your phone or desktop like a native app.

---

## 🔒 How Privacy Works

- **No Trackers & No Accounts**: Your identity is tied only to an anonymous device key stored in your browser.
- **Device-Local Session Cache**: Messages are temporarily saved in your browser's local cache so refreshing doesn't lose your chat, but everything automatically clears after 24 hours.
- **Fail-Closed Security**: If a secure key exchange doesn't complete, messages won't send in plain text. Privacy is guaranteed.

---

## 🛠️ Tech Stack

- **Frontend**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [Lucide Icons](https://lucide.dev/)
- **Database**: PostgreSQL (Production) / PGlite WASM (Local Zero-Config Development)
- **Encryption**: Web Crypto API (SubtleCrypto ECDH + AES-GCM)
- **Audio**: Web Audio API synthesized notification tones

---

## 🚀 Running Locally

### 1. Clone & Install

```bash
git clone https://github.com/srpranto/Luna.git
cd Luna
npm install
```

### 2. Environment Setup (Optional for Local Dev)

Luna includes embedded **PGlite** for instant zero-dependency local development: you can run `npm run dev` immediately without setting up PostgreSQL!

For production deployment (e.g. Vercel, Railway) or when connecting to a remote database (e.g. Neon, Supabase), create a `.env.local` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/luna?sslmode=require"
```

### 3. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

Luna comes with a comprehensive 148-test E2E suite covering matchmaking, cryptography, and real-time messaging:

```bash
# Run test suite
npm test

# Check TypeScript types
npm run type-check

# Build for production
npm run build
```

---

## 💬 Feedback & Questions

Made with ❤️ by [Pranto](https://github.com/srpranto). Have suggestions or found a bug? Feel free to open an issue!
