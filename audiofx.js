// audiofx.js -- signal processing for arbitrary uploaded audio.
//
// This is deliberately separate from the SAM engine: SAM only ever turns
// phonemes into audio, it has no path for accepting an arbitrary waveform as
// input, so there is no way to "run an MP3 through SAM". What this module
// does instead is give uploaded audio its own Pitch / Speed / Mouth / Throat
// controls using real signal processing, so the same parameter vocabulary
// (and the same saved presets) can be applied to any audio file.
//
// Pitch and speed are implemented with a classic granular overlap-add
// time-stretch, then a resample to compensate -- the standard technique
// behind most simple pitch shifters. Mouth/Throat are implemented as real
// peaking EQ filters via OfflineAudioContext, in the same two frequency
// bands SAM's own "mouth" (mid) and "throat" (low) controls loosely evoke.

/**
 * Overlap-add time stretch. Changes duration by `ratio` while preserving
 * pitch (ratio > 1 = longer/slower, ratio < 1 = shorter/faster).
 * @param {Float32Array} samples
 * @param {number} ratio
 * @return {Float32Array}
 */
export function timeStretchOLA(samples, ratio, grainSize=2048, overlap=0.5) {
  if (!samples.length || Math.abs(ratio-1) < 1e-6) return samples.slice();
  const hopIn = Math.max(1, Math.round(grainSize*(1-overlap)));
  const hopOut = Math.max(1, Math.round(hopIn*ratio));
  const outLen = Math.max(1, Math.round(samples.length*ratio)) + grainSize;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const win = new Float32Array(grainSize);
  for (let i=0;i<grainSize;i++) win[i] = 0.5-0.5*Math.cos(2*Math.PI*i/(grainSize-1));
  let inPos=0, outPos=0;
  while (inPos < samples.length) {
    for (let i=0;i<grainSize;i++) {
      const s = (inPos+i<samples.length) ? samples[inPos+i] : 0;
      const idx = outPos+i;
      if (idx < outLen) { out[idx]+=s*win[i]; norm[idx]+=win[i]; }
    }
    inPos += hopIn; outPos += hopOut;
  }
  for (let i=0;i<outLen;i++) if (norm[i]>1e-6) out[i]/=norm[i];
  const finalLen = Math.max(1, Math.round(samples.length*ratio));
  return out.slice(0, finalLen);
}

/** Linear-interpolation resample to an exact new sample count. */
export function resampleLinear(samples, newLength) {
  if (newLength === samples.length || !samples.length) return samples.slice();
  const out = new Float32Array(newLength);
  const scale = (samples.length-1)/Math.max(1,newLength-1);
  for (let i=0;i<newLength;i++) {
    const pos=i*scale, i0=Math.floor(pos), i1=Math.min(samples.length-1,i0+1), frac=pos-i0;
    out[i]=samples[i0]*(1-frac)+samples[i1]*frac;
  }
  return out;
}

/**
 * Shifts pitch by `semitones` while keeping the original duration.
 * Stretches by the pitch ratio, then resamples back to the original length
 * -- the resample step is what actually raises/lowers the perceived pitch.
 */
export function pitchShift(samples, semitones) {
  if (!semitones) return samples.slice();
  const ratio = Math.pow(2, semitones/12);
  const stretched = timeStretchOLA(samples, ratio);
  return resampleLinear(stretched, samples.length);
}

/**
 * Changes speed to `speedPercent` (100 = unchanged) while preserving the
 * original pitch: resample to the new duration (which shifts pitch as a
 * side effect), then pitch-shift back by the inverse amount to compensate.
 */
export function changeSpeed(samples, speedPercent) {
  const factor = speedPercent/100;
  if (Math.abs(factor-1) < 1e-6) return samples.slice();
  const newLen = Math.max(1, Math.round(samples.length/factor));
  const resampled = resampleLinear(samples, newLen);
  const compensate = -12*Math.log2(factor);
  return pitchShift(resampled, compensate);
}

/**
 * "Mouth" (mid resonance) and "Throat" (low resonance) tone shaping, as real
 * peaking EQ filters -- 0..255 to match SAM's own control range, 128 =
 * neutral. Uses OfflineAudioContext so the actual filtering is done by the
 * browser's own audio engine rather than hand-rolled biquad math.
 */
export async function applyFormantFilters(samples, sampleRate, mouthValue=128, throatValue=128) {
  const mouthGain = ((mouthValue-128)/128)*15;   // -15..+15 dB around ~1.4kHz
  const throatGain = ((throatValue-128)/128)*15; // -15..+15 dB around ~450Hz
  if (Math.abs(mouthGain) < 0.05 && Math.abs(throatGain) < 0.05) return samples.slice();
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OfflineCtx(1, samples.length, sampleRate);
  const buf = ctx.createBuffer(1, samples.length, sampleRate);
  buf.getChannelData(0).set(samples);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const mouth = ctx.createBiquadFilter();
  mouth.type = "peaking"; mouth.frequency.value = 1400; mouth.Q.value = 0.9; mouth.gain.value = mouthGain;
  const throat = ctx.createBiquadFilter();
  throat.type = "peaking"; throat.frequency.value = 450; throat.Q.value = 0.9; throat.gain.value = throatGain;
  src.connect(mouth).connect(throat).connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

/**
 * Full chain: pitch -> speed -> tone. Each step is skipped cheaply when it
 * would be a no-op (0 semitones, 100% speed, neutral mouth/throat).
 * @param {Float32Array} samples  mono input samples
 * @param {number} sampleRate
 * @param {{pitch?:number, speed?:number, mouth?:number, throat?:number}} params
 * @return {Promise<Float32Array>}
 */
export async function processAudioFx(samples, sampleRate, params={}) {
  const { pitch=0, speed=100, mouth=128, throat=128 } = params;
  let out = pitchShift(samples, pitch);
  out = changeSpeed(out, speed);
  out = await applyFormantFilters(out, sampleRate, mouth, throat);
  return out;
}

/** Downmix a decoded AudioBuffer to a single mono Float32Array. */
export function toMonoFloat32(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0).slice();
  const len = audioBuffer.length;
  const out = new Float32Array(len);
  for (let ch=0; ch<audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i=0;i<len;i++) out[i]+=data[i]/audioBuffer.numberOfChannels;
  }
  return out;
}
