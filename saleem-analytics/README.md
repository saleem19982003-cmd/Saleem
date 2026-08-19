# SALEEM Analytics Center

**Private Platform Intelligence & Real-Time Analytics for SALEEM**

SALEEM Analytics Center is a completely separate, standalone web application that connects directly to the shared SALEEM Supabase project to provide private, real-time analytics, user intelligence, learning funnels, retention metrics, and export capabilities.

---

## 🏛 Architecture

```text
SALEEM Web App ────┐
                   │
SALEEM Android ────┼──> Supabase Database
                   │    (analytics_events, analytics_users, sessions, progress)
                   │
                   │           ▲
                               │ Protected by Supabase Auth & RLS
                               │ (Strictly saleem19982003@gmail.com)
                               │
                   └────> SALEEM Analytics Center
                          Separate Standalone Website
```

---

## 🔒 Security & Access Control

1. **Restricted Admin Account**: Access is strictly limited to `saleem19982003@gmail.com`.
2. **Supabase Authentication**: Utilizes secure Supabase Auth (email + password).
3. **Row Level Security (RLS)**: Analytics tables have policies enforcing `auth.jwt()->>'email' = 'saleem19982003@gmail.com'`. Normal users cannot read analytics data.
4. **Search Engine Protection**:
   - `robots.txt` disallows all crawlers (`Disallow: /`).
   - HTML header includes `<meta name="robots" content="noindex,nofollow,noarchive">`.
   - Vercel response header `X-Robots-Tag: noindex, nofollow, noarchive`.
5. **No Secret Exposure**: Zero service-role keys or passwords in the repository or client bundle.

---

## 🚀 Local Development

```bash
# 1. Navigate to the Analytics Center
cd saleem-analytics

# 2. Configure environment
cp .env.example .env

# 3. Start local development server
npm start
# Server will open at http://localhost:3001
```

---

## 🌐 Deploying to Vercel

1. **Create a new project on Vercel**:
   - Import your GitHub repository.
   - Set the **Root Directory** to `saleem-analytics`.
2. **Configure Environment Variables** in Vercel Project Settings:
   - `SUPABASE_URL`: Your Supabase Project URL.
   - `SUPABASE_ANON_KEY`: Your Supabase Public Anon Key.
3. **Deploy**:
   - Click **Deploy**.
   - Your Analytics Center will be live at `https://saleem-analytics.vercel.app` (or custom domain `https://analytics.saleem.app`).
