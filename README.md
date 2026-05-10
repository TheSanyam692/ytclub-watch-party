# 🎬 YTClub — Watch Together. Feel Together.

A premium real-time YouTube watch party platform built with React, Vite, Tailwind CSS, and Socket.IO. Create a room, share the code, and watch YouTube videos in perfect sync with friends.

![YTClub](https://img.shields.io/badge/YTClub-Watch%20Party-blueviolet?style=for-the-badge)

## ✨ Features

- **🎥 Synchronized YouTube Playback** — Host loads a video, everyone watches in sync
- **▶️ Full Playback Controls** — Play, Pause, Seek, ±10s — all synced in real-time
- **👑 Host Management** — Transfer host role, mute users, remove participants
- **🚀 Instant Rooms** — Create or join a room in seconds, no sign-up needed
- **🎨 Cinematic Dark UI** — Floating orbs, glassmorphism, Framer Motion animations
- **📋 Copy Room Code** — One-click share with toast notification
- **🔴 LIVE SYNCED Badge** — Real-time sync status indicator
- **📱 Fully Responsive** — Works on desktop, tablet, and mobile
- **🔔 Toast Notifications** — Join, leave, mute, and kick alerts

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Framer Motion |
| Backend | Express 5, Socket.IO 4 |
| Player | react-youtube |
| Styling | Glassmorphism, CSS animations, Inter font |

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/TheSanyam692/ytclub-watch-party.git
cd ytclub-watch-party

# Start Backend (Terminal 1)
cd backend
npm install
node server.js

# Start Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** → Enter your name → Create or Join a room!

## 📁 Project Structure

```
ytclub-watch-party/
├── backend/
│   ├── server.js          # Socket.IO server with sync events
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── App.jsx        # Router
│       ├── App.css        # Premium component styles
│       ├── index.css      # Global styles & animations
│       ├── socket.js      # Socket.IO client
│       └── pages/
│           ├── Home.jsx   # Cinematic landing page
│           └── Room.jsx   # Watch party room
└── README.md
```

## 🌐 Deployment

**Frontend → Vercel** | **Backend → Render**

Set `VITE_BACKEND_URL` in Vercel to your Render backend URL.

## 📜 License

MIT