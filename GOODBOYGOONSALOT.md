# GoodBoyGoonsaLot

A premium client-side UI around the existing BetterSAM / SAM JavaScript engine.

## What changed

- Complete responsive dark/light UI
- Exact numeric inputs + sliders for Pitch, Speed, Mouth and Throat
- Built-in voice library plus local custom presets
- Preset JSON import/export
- 16-bit PCM WAV export
- Real-time waveform visualization
- Local generation history (15 entries)
- Phonetic mode and SAM stress-marker guidance
- English-first language handling with a deliberately modest Hindi transliteration layer
- Randomize + voice transformation tools
- Shareable parameter/text links and JSON export
- Keyboard shortcuts
- Optional local Whisper transcription for uploaded audio
- Web Speech API microphone transcription where supported
- Accessible labels, responsive layout and loading/error states
- Original SAM engine in `dist/samjs.esm.js` remains the synthesizer

## Keyboard shortcuts

- `Ctrl/Cmd + Enter` — Preview
- `Ctrl/Cmd + Shift + D` — Download WAV
- `Ctrl/Cmd + K` — Focus speech input
- `Esc` — Stop playback

## Content Clone limitation

Uploaded-audio transcription is **speech-to-text → SAM text-to-speech**. It does not clone the uploaded speaker's timbre, identity, accent or vocal characteristics.

The uploaded-file transcription path loads Transformers.js + `Xenova/whisper-tiny` from jsDelivr/Hugging Face at runtime. It is intentionally optional so the core SAM app remains lightweight and backend-free.

## SAM language limitation

SAM is fundamentally an English-oriented formant synthesizer/reciter. The language selector therefore does not pretend to provide neural multilingual TTS. English is the reliable path; Hindi has a lightweight transliteration approximation; other languages are explicitly marked approximate.

## Original engine / attribution

The original repository's SAM implementation, source, manual and attribution are preserved. See `README.md`, `LICENSE` and `docs/`.

The SAM lineage included in this project credits Don't Ask Software / SoftVoice, Christian Schiffler, Stefan Macke, Vidar Hokstad, 8BitPimp and other contributors as documented by the source repository.
