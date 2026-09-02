# GoodBoyGoonsaLot — Technical Report

## ROOT CAUSE

`renderSpeech()` in `app.js` called `drawWaveform(currentBuffer)` on every
Preview click. **`drawWaveform` was never defined anywhere in the V4
codebase** — it had been deleted at some point during the V1→V4 upgrades
while other functions were being added in the same region of the file, and
never restored. Calling it threw `ReferenceError: drawWaveform is not
defined`.

That exception fired *after* `currentBuffer = concatFloat32(parts)` had
already succeeded, so:
- Synthesis had genuinely completed and produced correct audio.
- The exception was caught by the surrounding `catch` block and mapped to
  the generic message *"Could not synthesize this text…"* — which was
  false. Synthesis had not failed; drawing the waveform had.
- Duration, history, and `playBuffer()` (actual playback) were never
  reached, because they came *after* the crashing line.
- `downloadWav()` still worked, because it reuses `currentBuffer` directly
  and never touches `drawWaveform` — this is exactly why "download works,
  generated audio is correct, but Preview fails" was the reported symptom.

A second, smaller instance of the same bug existed in the phonetic-mode
error path: `findBadPhoneme()` was called but also never defined.

**Verification, not assumption:** this was confirmed by actually executing
`renderSpeech()` — first as a faithful Node reproduction, then in a real
headless Chromium loading the unmodified project — and capturing the literal
stack trace:
```
ReferenceError: drawWaveform is not defined
    at HTMLButtonElement.renderSpeech (app.js:340:40)
```
with `currentBuffer` confirmed populated (5590 valid samples) immediately
after.

## V1 → V4 REGRESSION

The SAM engine itself (`src/`, `dist/`) is **byte-identical** across the V1
("Voice Lab") build, V4, and the pristine upstream `better-sam` library —
confirmed via checksum diff. The regression is entirely in the application
layer:

| File | V1 → V4 |
|---|---|
| `drawWaveform()` | Present and working in V1 → **deleted, never restored** in V4 |
| `findBadPhoneme()` | Didn't exist in V1 → **referenced but never defined** in V4 |
| Synthesis pipeline | V1: one `sam.buf32(text, phonetic)` call | V4: text→phonemes via `SamJs.convert()`, then chunked `sam.buf32(chunk, true)` — restructured for long-text chunking, **and this part works correctly** (verified independently, see below) |
| `index.html` / `styles.css` | Only additive changes (new language options, phonetic-mode help box, record button) — **no changes to any Preview/waveform/playback element**, ruling out an ID-mismatch theory |

## FIX

1. **Restored `drawWaveform`** verbatim from V1 (it already correctly
   downsamples via a min/max-per-pixel-column reduction, so it already
   satisfied the "don't render millions of points" requirement — no
   redesign needed, per the instruction not to replace a working V1
   implementation).
2. **Defined `findBadPhoneme`**, and in the process found and fixed a
   real, pre-existing bug in its sibling `looksLikeSamPhonemes`: both
   assumed one phoneme per whitespace-delimited token. SAM's actual parser
   (`src/parser/parse1.es6`) does 2-character-then-1-character greedy
   matching, with digits setting stress on the *previous* phoneme and
   ` . , ? -` themselves being pause phonemes — confirmed by reading the
   parser and its phoneme table directly. Under the old naive check, SAM's
   *own* canonical example (`DHAX KAET IHZ AH5GLIY.`) was incorrectly
   flagged as invalid. Rewrote both functions to mirror the real matching
   algorithm; verified against the real engine afterward.
3. **Split `renderSpeech()` into two phases** — text→PCM, then
   draw/duration/history/playback — each with its own error handling, so a
   failure after synthesis succeeds is never again reported as a synthesis
   failure. This directly implements "Preview must be independent from
   Download" for every step, not just the two that already worked.
4. **Added a small silence gap between concatenated long-text chunks**
   (~40ms) to avoid audible clicks at join points, per the long-text
   requirement.
5. **Fixed a real false-positive in language detection**: the Hinglish
   word-marker list included `main`, `the`, `mat`, `me`, `to` — all common
   standalone English words — so a single incidental match mislabeled
   ordinary English ("The quick brown fox…") as Hinglish. Removed the five
   ambiguous entries; genuine Hinglish/Hindi detection is unaffected (it
   has many unambiguous markers left, and script-range detection for
   Devanagari etc. was never affected).
6. Wired up `#detectedLanguage` in `index.html` — the code already wrote to
   it, but the element didn't exist, so the feature was invisible.
7. Removed a duplicated/conflicting pair of `.phoneme-help` CSS rule blocks
   in `styles.css` (leftover from separate edit passes).

## ARCHITECTURE

```
TEXT
 ↓ languageProcess()            (multilingual.js: script detection, transliteration)
 ↓ buildSamPhonemes() / preparePhoneticInput()
 ↓ splitPhonemes() + chunked sam.buf32(..., true)   [PHASE 1: synthesis]
 ↓ concatFloat32() with inter-chunk silence
currentBuffer (Float32Array, canonical PCM)          ← Download reads this directly
 ↓                                    ↓                          ↓
drawWaveform()                   playBuffer()               encodeWav()
[PHASE 2, independent try/catch each]                            ↓
                                                              WAV download
```
Synthesis produces one canonical buffer; drawing, playback, and download
are independent consumers of it, matching the requested architecture.
`playBuffer`/`drawWaveform`/`encodeWav`/`stopAudio` were generalized with
optional parameters (sample rate, target canvas, target Stop button) —
defaults reproduce old behavior exactly — so the new Audio FX Lab (below)
reuses this pipeline instead of duplicating it.

## NEW FEATURE — Audio FX Lab

Per your request: uploaded audio (any format the browser can decode)
gets its own **Pitch / Speed / Mouth / Throat** controls, including your
saved presets. One clarification worth being upfront about: SAM itself
can't process this — it only ever turns phonemes into audio and has no
path for accepting a waveform as input, so "run this MP3 through SAM" isn't
literally possible. What's implemented instead is a real, independent DSP
chain using the same parameter vocabulary:

- **Pitch** and **Speed** are a genuine granular overlap-add time-stretch
  + resample (`audiofx.js`) — not `playbackRate` trickery. Verified against
  a synthetic 440Hz tone: pitch shifts land within ~2% of the target
  frequency while duration stays exact; speed changes land on the expected
  duration while pitch stays within ~2% of original. Each is independent
  of the other.
- **Mouth**/**Throat** are real peaking-EQ filters (mid ~1.4kHz / low
  ~450Hz) via `OfflineAudioContext`, evoking SAM's own two controls without
  pretending to be them.
- **Apply a saved preset** maps its 0–255 pitch/speed onto this tool's
  semitone/percent range, and its mouth/throat values directly — so a
  preset built for the voice lab meaningfully carries over.
- Reuses the now-fixed waveform/playback/WAV pipeline, so it has its own
  Preview/Stop/Download and never interferes with the main voice lab's
  state (confirmed: SAM Preview still works correctly after exercising
  the FX Lab extensively).

## NEW — Theme

Restyled into a blood/bone/black palette (all via the existing CSS
variable system, so it cascades through every component without
restructuring anything): deep blood-red accent, sickly-green secondary
accent (used for the waveform glow), bone-parchment text, a dripping
jagged border under the header, a flickering "Creepster" display font on
the title, a vignette, and a themed scrollbar. No functional markup,
copy, or behavior changed — this is styling only, confirmed by the full
test suite passing identically before and after.

## TEST RESULTS

All run against the actual files in a real headless Chromium (not just
static analysis), server-served so ES modules load correctly.

**Preview / multilingual (10/10 passed):** "hi", "hello", "Hello this is a
test.", "The quick brown fox…" (Hinglish false-positive check), ~500/~2000/
~4000-character chunked text, Hindi Devanagari, Hinglish, mixed
Hindi+English.

**Interactions (11/11 passed):** phonetic auto-compile, Insert Example →
Preview (exercises the corrected phoneme tokenizer), phonetic OFF restores
text, preset → Preview, randomize → Preview, Preview → Stop → Preview,
rapid double-click (cancellation), Download with no prior Preview,
Preview → Download.

**Audio FX Lab (7/7 passed):** controls hidden until upload, decode +
reveal, pitch/speed/mouth Preview, preset mapping, Preview → Stop,
Download with no prior Preview, and — critically — the original SAM
Preview confirmed still working after exercising the new feature.

**Mobile (375×812, touch tap):** Preview works, waveform renders at the
narrow width, no console errors.

**Not tested via browser automation:** `findBadPhoneme`'s fallback branch
(reached only when phonetic input passes the coarse validity check yet
SAM's stricter internal grammar still rejects it) — this is a narrow edge
case I couldn't reliably construct through the UI, so I unit-tested the
function directly instead and confirmed it never throws.

## KNOWN LIMITATIONS

- SAM's phoneme system is fundamentally English-oriented; Hindi/Hinglish
  support (both here and before) is transliteration + pronunciation
  approximation, not native multilingual synthesis — SAM cannot produce
  authentic Hindi phonation.
- The granular pitch/speed shifter is a real, working implementation, but
  time-domain granular methods have inherent artifacts at extreme ratios
  (very large pitch shifts or speed changes) — audible graininess is
  expected there, not a bug.
- `findBadPhoneme`'s exact-offender guess falls back to "the input" for
  the narrow case noted above, since a coarse per-character check can't
  always pinpoint what SAM's fuller internal grammar rejected.
