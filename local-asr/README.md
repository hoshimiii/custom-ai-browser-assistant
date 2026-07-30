# Local ASR companion

This loopback-only helper downloads audio from a validated YouTube or Bilibili URL, converts it with FFmpeg, and uploads bounded 20-minute MP3 chunks to Cloudflare Workers AI Whisper. Audio leaves your computer for Cloudflare; no local Whisper model or GPU is used.

```powershell
python asr_companion.py generate-token
$env:CLOUDFLARE_ACCOUNT_ID = 'YOUR_32_LOWERCASE_HEX_ACCOUNT_ID'
$env:CLOUDFLARE_API_TOKEN = 'YOUR_CLOUDFLARE_HELPER_TOKEN'
python asr_companion.py serve --origin chrome-extension://YOUR_32_LOWERCASE_ID --token YOUR_GENERATED_TOKEN
```

It binds only to `127.0.0.1:8765`. Install `yt-dlp` and ensure `ffmpeg` is available on `PATH` before serving.
