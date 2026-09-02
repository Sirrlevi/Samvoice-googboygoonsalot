# GoodBoyGoonsaLot v4 — Preview Stability Fix

This release fixes a real UX/integration bug in v3: phonetic mode treated ordinary input such as `hi` as if it were a raw SAM phoneme stream. `HI` is not a valid SAM phoneme token; `/HAY` is. v4 detects this and automatically compiles ordinary text when phonetic mode is enabled.

The normal speech path now compiles sentence-sized pieces independently before rendering. This prevents long documents from overwhelming SAM's legacy parser.

The original SAM engine file in `dist/` is not modified.
