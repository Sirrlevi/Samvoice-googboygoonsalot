# GoodBoyGoonsaLot — Stability Fixes

- Long text is synthesized in safe sentence/word chunks instead of one huge SAM render.
- SAM's verbose internal diagnostics are silenced only during rendering, preventing mobile browser console flooding.
- Synthesis now supports cancellation and clearer errors.
- Phonetic mode automatically converts the current prose into SAM phonemes when enabled.
- Added a raw phoneme example and stress-marker guidance.
- Uploaded audio is decoded and resampled to mono 16 kHz before Whisper.
- Long audio is transcribed in 30-second chunks to reduce memory pressure.
- Added an in-app MediaRecorder path so recordings are created in a browser-native format.
- Audio errors now distinguish codec/decode, network/model, memory and no-speech failures.
- Original SAM formant engine remains untouched.
