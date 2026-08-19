// =============================================================
// SALEEM Analytics Center — Config Endpoint (Vercel Serverless)
// Safely delivers public Supabase URL and Anon Key to frontend
// =============================================================

module.exports = (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Content-Type', 'application/json');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    const backendUrl = process.env.SALEEM_BACKEND_URL || process.env.BACKEND_URL || '';

    // STRICT SECURITY: Never expose service-role key, JWT secrets, or passwords
    return res.status(200).json({
        supabase_url: supabaseUrl,
        supabase_anon_key: supabaseAnonKey,
        backend_url: backendUrl
    });
};
