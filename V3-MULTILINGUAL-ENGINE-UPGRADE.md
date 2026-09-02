# GoodBoyGoonsaLot v3

The original SAM renderer remains intact. v3 upgrades the pipeline around it:

1. Detect script / Hinglish.
2. Normalize Unicode and punctuation.
3. Transliterate supported Indic scripts into Latin approximations.
4. Apply conservative Hinglish pronunciation aliases.
5. Compile normalized text through the original SAM reciter into phonemes.
6. Render the phoneme stream directly with SAM.
7. Chunk long phoneme streams safely for mobile stability.

Supported script layers: Devanagari, Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada and Malayalam, plus Latin English/Hinglish.

This improves multilingual input substantially, but SAM is still an English-centric 1982 formant synthesizer. It cannot provide native human Hindi/Bengali/etc. pronunciation or neural voice identity cloning.
