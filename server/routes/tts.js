// =============================================================
// TTS Routes - Text-to-Speech proxy (keeps ElevenLabs key server-side)
// =============================================================
const express = require('express');
const router = express.Router();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'IKne3meq5aSn9XLyUdCD';

// POST /api/tts/speak - Generate speech audio
router.post('/speak', async (req, res) => {
    try {
        const { text, voice_id } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required.' });
        }

        const cleanText = text.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').trim().substring(0, 500);

        if (!ELEVENLABS_API_KEY) {
            return res.status(503).json({ error: 'Text-to-speech service not configured. Use browser speech synthesis as fallback.', fallback: true });
        }

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id || ELEVENLABS_VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text: cleanText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.4,
                    similarity_boost: 0.85,
                },
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            console.warn('ElevenLabs API error:', response.status);
            return res.status(502).json({ error: 'Speech synthesis temporarily unavailable.', fallback: true });
        }

        const audioBuffer = await response.arrayBuffer();
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.byteLength,
            'Cache-Control': 'public, max-age=3600',
        });
        res.send(Buffer.from(audioBuffer));
    } catch (err) {
        console.error('TTS error:', err);
        res.status(500).json({ error: 'Speech synthesis failed.', fallback: true });
    }
});

module.exports = router;
