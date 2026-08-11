# भक्ति मंदिर (Bhakti Mandir) — Devotional Music Stream

A serene, standalone, full-screen devotional music sanctuary inspired by minimal aesthetic UI patterns: adaptive backgrounds, Devanagari calligraphy, glassmorphic capsule player with rotating vinyl album art, interactive temple bell sound, screen-wide flower shower animation, and live real-time visitor presence.

## 🌟 Key Features

- **Devotional Playback Engine**: 4-track opening sequence (*Sakal Hans Mein Ram Viraje*, *Bagad Bam*, *Hanuman Chalisa*, etc.) seamlessly transitioning into continuous public bhajan playlists.
- **Adaptive Visual Backgrounds**: Desktop landscape (`baba.png`) and mobile portrait (`baba2.png`).
- **Interactive Scrubber**: Draggable progress bar with live preview and debounced seeking.
- **Temple Bell & Flower Shower**: Web audio synthesized & MP3 temple bell sound with ringing animation, plus screen-wide blossom cascade.
- **Live Presence Counter**: Real-time anonymous visitor tracking via Supabase Realtime Presence.
- **MediaSession API**: Full lockscreen and background audio control support.

## 🚀 Getting Started

No build step required. Plain HTML/CSS/Vanilla JS.

### Run Locally:
```bash
npm run dev
# or
node server.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Deployment
Deploy as static files directly to Vercel, Netlify, or GitHub Pages.
