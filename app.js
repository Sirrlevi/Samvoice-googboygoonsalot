import SamJs from "./dist/samjs.esm.js";
import { normalizeForSam, detectScript } from "./multilingual.js";
import { processAudioFx, toMonoFloat32 } from "./audiofx.js";

const STORAGE = {
  settings: "gbgl-settings-v1",
  presets: "gbgl-presets-v1",
  history: "gbgl-history-v1",
  theme: "gbgl-theme-v1"
};
const SAMPLE_RATE = 22050;

const defaults = { pitch:64, speed:72, mouth:128, throat:128 };
const presetData = [
  ["classic","Classic SAM","The reference voice",64,72,128,128,"◈"],
  ["elf","Elf","Bright + nimble",92,82,168,148,"✦"],
  ["robot","Little Robot","Compact machine",58,82,92,76,"▣"],
  ["stuffy","Stuffy Guy","Nasal character",72,64,188,190,"◉"],
  ["oldlady","Little Old Lady","Thin + high",112,70,178,164,"♧"],
  ["alien","Extra-Terrestrial","Odd resonance",44,94,188,66,"✧"],
  ["creepy","Deep Creepy Entity","Dark horror texture",28,58,196,212,"☽"],
  ["narrator","Soft Male Narrator","Low + measured",52,82,102,112,"◌"],
  ["female","Soft Female","Light + warm",112,78,112,126,"○"],
  ["demon","Monster / Demon","Heavy + aggressive",18,48,224,236,"⛧"],
  ["child","Child","High + quick",132,92,144,140,"⌁"],
  ["android","Robot / Android","Precise synthetic",50,68,72,70,"⌬"]
];

let state = {
  ...defaults,
  language: "auto",
  phonetic: false,
  text: "Hello. I am GoodBoyGoonsaLot — your tiny, gloriously weird speech machine."
};

let currentAudio = null;
let currentSource = null;
let currentBuffer = null;
let audioContext = null;
let transcriber = null;
let selectedFile = null;
let toastTimer = null;
let recorder = null;
let recordedChunks = [];
let fxSource = null;    // { samples: Float32Array, sampleRate } for the uploaded file, decoded once
let fxBuffer = null;    // processed Float32Array, ready to draw/play/download
let fxBufferRate = SAMPLE_RATE;
let fxToken = 0;
let recordingStream = null;
let phoneticSourceText = null;
let synthesisToken = 0;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function safeJSON(raw, fallback) {
  try { return JSON.parse(raw) ?? fallback; } catch { return fallback; }
}
function clamp(n, min, max) { return Math.min(max, Math.max(min, Number(n) || 0)); }
function showToast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function setStatus(text, sel="#statusText") { $(sel).textContent = text; }

function persistSettings() {
  localStorage.setItem(STORAGE.settings, JSON.stringify(state));
}
function loadSettings() {
  const saved = safeJSON(localStorage.getItem(STORAGE.settings), {});
  state = {...state, ...saved};
}
function syncText() {
  $("#speechinput").value = state.text;
  $("#charCount").textContent = `${state.text.length} / 4000`;
}
function updateControlUI(name) {
  const row = document.querySelector(`[data-control="${name}"]`);
  if (!row) return;
  const value = clamp(state[name], 0, 255);
  const range = row.querySelector('input[type="range"]');
  const num = row.querySelector('input[type="number"]');
  range.value = value;
  num.value = value;
  range.style.setProperty("--fill", `${value / 255 * 100}%`);
}
function setControl(name, value, animate=false) {
  const target = clamp(value, 0, 255);
  if (!animate) {
    state[name] = target;
    updateControlUI(name);
    persistSettings();
    return;
  }
  const start = state[name];
  const started = performance.now();
  const duration = 260;
  const tick = (now) => {
    const t = Math.min(1, (now-started)/duration);
    const eased = 1 - Math.pow(1-t, 3);
    state[name] = Math.round(start + (target-start)*eased);
    updateControlUI(name);
    if (t < 1) requestAnimationFrame(tick);
    else persistSettings();
  };
  requestAnimationFrame(tick);
}

function buildControls() {
  const meta = [
    ["pitch","Pitch","Voice height / fundamental contour"],
    ["speed","Speed","Words and syllable timing"],
    ["mouth","Mouth","Formant / mouth resonance"],
    ["throat","Throat","Formant / throat resonance"]
  ];
  $("#controls").innerHTML = meta.map(([id,label,sub]) => `
    <div class="control-row" data-control="${id}">
      <div class="control-top">
        <div><label for="${id}">${label}</label><div class="control-sub">${sub}</div></div>
        <input class="number-input" id="${id}Number" type="number" min="0" max="255" step="1" inputmode="numeric" aria-label="${label} exact value">
      </div>
      <div class="range-wrap">
        <input id="${id}" type="range" min="0" max="255" step="1" aria-label="${label}" />
      </div>
    </div>`).join("");

  meta.forEach(([id]) => {
    const range = $(`#${id}`);
    const num = $(`#${id}Number`);
    const commit = (value) => {
      state[id] = clamp(value, 0, 255);
      updateControlUI(id);
      persistSettings();
      $$(".preset").forEach(x => x.classList.remove("active"));
    };
    range.addEventListener("input", e => commit(e.target.value));
    num.addEventListener("input", e => commit(e.target.value));
    num.addEventListener("blur", () => updateControlUI(id));
    updateControlUI(id);
  });
}

function renderPresets() {
  const custom = safeJSON(localStorage.getItem(STORAGE.presets), []);
  const built = presetData.map(p => ({
    id:p[0],name:p[1],desc:p[2],pitch:p[3],speed:p[4],mouth:p[5],throat:p[6],icon:p[7],custom:false
  }));
  const all = [...built, ...custom];
  $("#presetGrid").innerHTML = all.map(p => `
    <button class="preset" type="button" data-preset="${encodeURIComponent(JSON.stringify(p))}">
      <span class="preset-icon">${p.icon || "✦"}</span>
      <strong>${escapeHtml(p.name)}</strong>
      <span>${escapeHtml(p.desc || "Custom voice")}</span>
    </button>`).join("");
  $$(".preset").forEach(btn => btn.addEventListener("click", () => {
    const p = JSON.parse(decodeURIComponent(btn.dataset.preset));
    applyPreset(p);
  }));
}
function applyPreset(p) {
  ["pitch","speed","mouth","throat"].forEach(k => setControl(k, p[k], true));
  setTimeout(() => {
    $$(".preset").forEach(x => x.classList.remove("active"));
    const active = [...$$(".preset")].find(x => {
      try { return JSON.parse(decodeURIComponent(x.dataset.preset)).id === p.id; } catch { return false; }
    });
    active?.classList.add("active");
  }, 280);
  showToast(`${p.name} applied`);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function randomize() {
  const next = {
    pitch: Math.round(18 + Math.random()*210),
    speed: Math.round(48 + Math.random()*100),
    mouth: Math.round(50 + Math.random()*190),
    throat: Math.round(45 + Math.random()*190)
  };
  Object.entries(next).forEach(([k,v]) => setControl(k,v,true));
  showToast("New voice DNA generated");
}
function smart(kind) {
  const transforms = {
    creepy: {pitch: Math.max(8,state.pitch-24), speed:Math.max(40,state.speed-10), mouth:Math.min(255,state.mouth+35), throat:Math.min(255,state.throat+55)},
    deep: {pitch:Math.max(0,state.pitch-35), throat:Math.min(255,state.throat+28)},
    high: {pitch:Math.min(255,state.pitch+40), speed:Math.min(255,state.speed+10)},
    robot: {mouth:Math.max(25,state.mouth-40), throat:Math.max(20,state.throat-45), speed:Math.max(35,state.speed-8)},
    soft: {pitch:Math.min(255,state.pitch+8), mouth:Math.max(40,state.mouth-35), throat:Math.max(30,state.throat-25), speed:Math.min(255,state.speed+5)},
    reset: defaults
  };
  Object.entries(transforms[kind]).forEach(([k,v]) => setControl(k,v,true));
  showToast(kind === "reset" ? "Classic controls restored" : `${kind[0].toUpperCase()+kind.slice(1)} transformation applied`);
}

function samOptions() {
  // SAM's speed parameter is historically inverted from what modern users expect:
  // larger values make the generated buffer longer. We preserve the engine behavior.
  return { debug:false, pitch:state.pitch, speed:Math.max(1,state.speed), mouth:state.mouth, throat:state.throat };
}

function languageProcess(text) {
  const result=normalizeForSam(text,state.language);
  updateDetectedLanguage(result.detected);
  return result.normalized;
}
function updateDetectedLanguage(detected){
  const el=$("#detectedLanguage"); if(el)el.textContent=`Detected: ${detected}`;
}
function buildSamPhonemes(text){
  const normalized=languageProcess(text);
  const phonemes=withQuietSamConsole(()=>SamJs.convert(normalized));
  if(typeof phonemes!=="string"||!phonemes.trim())throw new Error("SAM phoneme compiler returned no data");
  return phonemes.trim();
}

// SAM has a small, strict phoneme alphabet.  Phonetic mode is intentionally
// forgiving: if a user types ordinary words such as "hi" while the toggle is
// on, we compile those words instead of throwing the misleading "cannot parse"
// error.  A real phoneme stream (e.g. /HAY) is left untouched.
const SAM_PHONEMES = new Set([
  "IY","IH","EH","AE","AA","AH","AO","OH","UH","UX","ER","AX","IX",
  "EY","AY","OY","AW","OW","UW","YX","WX","RX","LX","/X","DX",
  "R","L","W","WH","Y","M","N","NX","B","D","G","J","Z","ZH","V","DH",
  "S","SH","F","TH","P","T","K","CH","/H","UL","UM","UN","Q"
]);
function looksLikeSamPhonemes(text){
  if(!text.trim())return false;
  return scanPhonemes(text).valid;
}
function findBadPhoneme(text){
  // Names the offending chunk instead of returning a boolean, for a useful
  // error message. This was called from renderSpeech()'s catch block but
  // never defined, so any phonetic-mode input that looked valid but still
  // failed to render threw a second, masking ReferenceError instead of
  // showing the real problem.
  const {badToken}=scanPhonemes(text);
  return badToken || "the input";
}
// Mirrors the real SAM parser's own tokenizer (src/parser/parse1.es6): a
// phoneme string is matched greedily against the raw character stream --
// a 2-character phoneme code is tried first, then a 1-character one --
// rather than split on whitespace. That's why SAM's own example
// "DHAX KAET IHZ AH5GLIY." is valid: it's DH+AX, K+AE+T, IH+Z, AH+GX+L+IY,
// run together with no separator required between individual phonemes.
// The earlier whitespace-splitting version rejected that exact example.
function scanPhonemes(text){
  const s=text.toUpperCase();
  let i=0, count=0, badToken=null;
  while(i<s.length){
    if(SAM_PHONEMES.has(s.slice(i,i+2))){ count++; i+=2; continue; }
    if(SAM_PHONEMES.has(s[i])){ count++; i+=1; continue; }
    if(/[1-8]/.test(s[i])){ i+=1; continue; }        // stress marker on the preceding phoneme
    if(/[\s.,!?;:-]/.test(s[i])){ i+=1; continue; }   // word gap / pause -- SAM has its own pause phoneme for these
    if(badToken===null) badToken=(s.slice(i).match(/^\S+/)||[s[i]])[0];
    i+=1;
  }
  return { valid: count>0 && badToken===null, badToken };
}
function preparePhoneticInput(raw){
  if(looksLikeSamPhonemes(raw))return raw.toUpperCase().replace(/\s+/g," ").trim();
  // Forgive ordinary text in phonetic mode.  This is especially important on
  // mobile, where users often enable the mode and then type a word to test it.
  const compiled=buildSamPhonemes(raw);
  showToast("Ordinary text detected — compiled to SAM phonemes");
  state.text=compiled; syncText(); persistSettings();
  return compiled;
}
function splitPhonemes(phonemes,maxChars=360){
  if(phonemes.length<=maxChars)return [phonemes];
  const tokens=phonemes.split(/\s+/).filter(Boolean),chunks=[];let current="";
  for(const token of tokens){
    const candidate=(current+" "+token).trim();
    if(candidate.length<=maxChars)current=candidate;
    else{if(current)chunks.push(current);current=token;}
  }
  if(current)chunks.push(current);
  return chunks;
}

function withQuietSamConsole(fn) {
  // The bundled SAM build contains verbose diagnostic console.log calls in its
  // parser. They are useful while developing the engine but catastrophic for a
  // long browser synthesis because thousands of logs can freeze mobile Chrome.
  const old = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = old; }
}

function splitSpeechIntoChunks(text, maxChars=520) {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= maxChars) return [clean];
  const units = clean.match(/[^.!?;:]+[.!?;:]?\s*/g) || [clean];
  const chunks=[]; let current="";
  for (const unit of units) {
    if ((current+unit).length <= maxChars) current += unit;
    else {
      if (current.trim()) chunks.push(current.trim());
      if (unit.length <= maxChars) current=unit;
      else {
        const words=unit.split(/\s+/); current="";
        for(const word of words){
          if((current+" "+word).trim().length>maxChars){if(current.trim())chunks.push(current.trim());current=word;}
          else current=(current+" "+word).trim();
        }
      }
    }
  }
  if(current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function concatFloat32(parts, gapSamples=0) {
  // gapSamples inserts a short run of silence (zeros) between chunks, which
  // avoids an audible click at the join and gives multi-sentence speech a
  // natural breath between pieces. Defaults to 0 (old behavior) so a single
  // chunk -- the overwhelming majority of Previews -- is unaffected.
  const gaps=Math.max(0,parts.length-1)*Math.max(0,gapSamples);
  const total=parts.reduce((n,a)=>n+a.length,0)+gaps;
  const out=new Float32Array(total); let pos=0;
  parts.forEach((part,i)=>{
    out.set(part,pos); pos+=part.length;
    if(gapSamples && i<parts.length-1) pos+=gapSamples;
  });
  return out;
}

function estimateSeconds(text) {
  // Conservative UI estimate; actual SAM duration is returned after rendering.
  const chunks=splitSpeechIntoChunks(text);
  return Math.max(.2, chunks.reduce((sum,c)=>sum + c.length*.012*(state.speed/72), 0));
}

// Restored from the V1 "Voice Lab" build: this function was being called from
// renderSpeech(), the theme toggle, and the window resize handler, but its
// definition had been dropped somewhere during the V2-V4 upgrades. That made
// every Preview throw "ReferenceError: drawWaveform is not defined" right
// after synthesis had already produced valid audio -- see V4-STABILITY-FIXES
// notes in the technical report for the full trace.
function drawWaveform(data, canvasSel="#waveform", placeholderSel="#wavePlaceholder") {
  const canvas = $(canvasSel), dpr = Math.min(2,window.devicePixelRatio||1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1,Math.floor(rect.width*dpr)); canvas.height = Math.floor(150*dpr);
  const ctx = canvas.getContext("2d"); ctx.clearRect(0,0,canvas.width,canvas.height);
  const w=canvas.width,h=canvas.height, mid=h/2;
  ctx.beginPath();
  const step=Math.max(1,Math.floor(data.length/w));
  for(let x=0;x<w;x++){
    const start=x*step; let min=1,max=-1;
    for(let j=0;j<step && start+j<data.length;j++){const v=data[start+j];if(v<min)min=v;if(v>max)max=v;}
    const y1=mid+min*mid*.82,y2=mid+max*mid*.82;
    x===0?ctx.moveTo(x,y1):ctx.lineTo(x,y1);ctx.lineTo(x,y2);
  }
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--accent2").trim();
  ctx.globalAlpha=.75;ctx.lineWidth=1.4*dpr;ctx.stroke();ctx.globalAlpha=1;
  $(placeholderSel).style.display="none";
}

async function renderSpeech(){
  const raw=$("#speechinput").value.trim();
  if(!raw)return showToast("Write something first");
  if(raw.length>4000)return showToast("Keep the speech under 4000 characters");
  stopAudio(false);const token=++synthesisToken;
  state.text=raw;persistSettings();setStatus("Preparing speech…");
  $("#previewBtn").disabled=true;$("#downloadBtn").disabled=true;$("#stopBtn").disabled=false;
  $("#previewBtn").innerHTML="<span>◌</span> Generating…";$("#wavePlaceholder").style.display="grid";
  // PHASE 1 -- text/phonemes -> PCM. This is the only phase that legitimately
  // reports "could not synthesize": once we have a buffer, synthesis has
  // succeeded regardless of what happens next (drawing, playing, etc).
  let synthesized;
  try{
    let chunks;
    if(state.phonetic){
      chunks=splitPhonemes(preparePhoneticInput(raw));
    }else{
      // Compile sentence-sized pieces independently.  This avoids asking the
      // old SAM reciter to parse a multi-thousand-character document in one go.
      const textChunks=splitSpeechIntoChunks(raw,360);
      chunks=[];
      for(let i=0;i<textChunks.length;i++){
        if(token!==synthesisToken)throw new Error("Synthesis cancelled");
        setStatus(textChunks.length>1?`Compiling ${i+1} / ${textChunks.length}…`:"Compiling speech…");
        chunks.push(...splitPhonemes(buildSamPhonemes(textChunks[i])));
        await new Promise(requestAnimationFrame);
      }
    }
    if(!chunks.length)throw new Error("Empty phoneme stream");
    const parts=[];
    for(let i=0;i<chunks.length;i++){
      if(token!==synthesisToken)throw new Error("Synthesis cancelled");
      setStatus(chunks.length>1?`Synthesizing ${i+1} / ${chunks.length}…`:"Synthesizing…");
      await new Promise(requestAnimationFrame);
      const sam=new SamJs(samOptions());
      const result=withQuietSamConsole(()=>sam.buf32(chunks[i],true));
      if(!result||!result.length)throw new Error(`SAM render failed at segment ${i+1}`);
      parts.push(result);
    }
    // A short silence between chunks avoids an audible click at each join and
    // lets multi-sentence speech breathe. Only relevant when text had to be
    // split into more than one chunk.
    const gap=parts.length>1?Math.round(SAMPLE_RATE*0.04):0;
    synthesized=concatFloat32(parts,gap);
  }catch(err){
    console.error("[Preview] synthesis:",err);
    if(err.message!=="Synthesis cancelled"){
      setStatus("Synthesis failed");
      const message=state.phonetic
        ? (looksLikeSamPhonemes(raw)?`Invalid SAM phoneme stream near: ${findBadPhoneme(raw)}`:"Could not compile that text into SAM phonemes. Try ordinary English or use the Insert example button.")
        : "Could not synthesize this text. Try a shorter sentence or simpler wording.";
      showToast(message);
    }
    $("#previewBtn").disabled=false;$("#downloadBtn").disabled=false;$("#stopBtn").disabled=!currentSource;
    $("#previewBtn").innerHTML="<span>▶</span> Preview";
    return;
  }

  // PHASE 2 -- synthesis already succeeded, so currentBuffer is set from here
  // on no matter what happens below: Download works even if drawing or
  // playback hits a problem. Each step has its own try/catch so a failure is
  // reported as exactly what it is, never mislabeled as "synthesis failed".
  currentBuffer=synthesized;
  try{
    drawWaveform(currentBuffer);
  }catch(err){
    console.error("[Preview] waveform render:",err);
  }
  $("#duration").textContent=`${(currentBuffer.length/SAMPLE_RATE).toFixed(2)} s`;
  addHistory($("#speechinput").value.trim());
  try{
    setStatus("Playing…");
    await playBuffer(currentBuffer);
    setStatus("Ready to synthesize");
  }catch(err){
    console.error("[Preview] playback:",err);
    setStatus("Ready to synthesize");
    showToast("Audio was generated, but playback failed on this device. Download still works.");
  }finally{
    $("#previewBtn").disabled=false;$("#downloadBtn").disabled=false;$("#stopBtn").disabled=!currentSource;
    $("#previewBtn").innerHTML="<span>▶</span> Preview";
  }
}

async function playBuffer(float32, opts={}) {
  const { sampleRate=SAMPLE_RATE, stopBtnSel="#stopBtn" } = opts;
  if(!audioContext) audioContext=new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==="suspended") await audioContext.resume();
  const audio=audioContext.createBuffer(1,float32.length,sampleRate);
  audio.getChannelData(0).set(float32);currentAudio=audio;
  currentSource=audioContext.createBufferSource();currentSource.buffer=audio;currentSource.connect(audioContext.destination);
  // Only one audio source ever plays at a time (starting one stops the
  // other via stopAudio()), so keep only the relevant Stop button live.
  $("#stopBtn").disabled = stopBtnSel !== "#stopBtn";
  $("#fxStopBtn").disabled = stopBtnSel !== "#fxStopBtn";
  currentSource.onended=()=>{currentSource=null;$(stopBtnSel).disabled=true};
  $(stopBtnSel).disabled=false;currentSource.start();
}
function stopAudio(show=true, opts={}) {
  const { statusSel="#statusText", idleStatus="Ready to synthesize" } = opts;
  synthesisToken++;
  try{currentSource?.stop()}catch{}
  currentSource=null;
  $("#stopBtn").disabled=true; $("#fxStopBtn").disabled=true;
  if(show){setStatus("Stopped",statusSel);setTimeout(()=>setStatus(idleStatus,statusSel),700)}
}

function encodeWav(float32, sampleRate=SAMPLE_RATE) {
  const buffer = new ArrayBuffer(44+float32.length*2), view = new DataView(buffer);
  const write=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  write(0,"RIFF");view.setUint32(4,36+float32.length*2,true);write(8,"WAVE");write(12,"fmt ");
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,"data");
  view.setUint32(40,float32.length*2,true);
  for(let i=0;i<float32.length;i++){const s=Math.max(-1,Math.min(1,float32[i]));view.setInt16(44+i*2,s<0?s*0x8000:s*0x7fff,true);}
  return new Blob([buffer],{type:"audio/wav"});
}
function downloadWav() {
  if(!currentBuffer){ return renderSpeech().then(()=>currentBuffer && downloadWav()); }
  const a=document.createElement("a"),url=URL.createObjectURL(encodeWav(currentBuffer));
  a.href=url;a.download=`goodboygoonsalot-${Date.now()}.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast("16-bit WAV exported");
}

function addHistory(text) {
  const history=safeJSON(localStorage.getItem(STORAGE.history),[]);
  history.unshift({text,params:{pitch:state.pitch,speed:state.speed,mouth:state.mouth,throat:state.throat},time:new Date().toISOString()});
  localStorage.setItem(STORAGE.history,JSON.stringify(history.slice(0,15)));
  renderHistory();
}
function renderHistory() {
  const history=safeJSON(localStorage.getItem(STORAGE.history),[]);
  $("#historyList").innerHTML=history.length ? history.map((h,i)=>`
    <div class="history-item">
      <div><div class="history-text">${escapeHtml(h.text)}</div><div class="history-meta">${new Date(h.time).toLocaleString()} · P ${h.params.pitch} · S ${h.params.speed} · M ${h.params.mouth} · T ${h.params.throat}</div></div>
      <button type="button" data-history="${i}">Load</button>
    </div>`).join("") : `<div class="empty">No generations yet. Your next voice lands here.</div>`;
  $$("#historyList [data-history]").forEach(btn=>btn.addEventListener("click",()=>{
    const h=history[Number(btn.dataset.history)];
    Object.entries(h.params).forEach(([k,v])=>setControl(k,v,true));
    state.text=h.text;syncText();showToast("History item loaded");
  }));
}

function savePreset() {
  const name=prompt("Name this voice preset:");
  if(!name?.trim()) return;
  const custom=safeJSON(localStorage.getItem(STORAGE.presets),[]);
  custom.unshift({id:`custom-${Date.now()}`,name:name.trim(),desc:"Saved locally",icon:"✦",custom:true,
    pitch:state.pitch,speed:state.speed,mouth:state.mouth,throat:state.throat});
  localStorage.setItem(STORAGE.presets,JSON.stringify(custom.slice(0,40)));
  renderPresets();showToast("Preset saved locally");
}
function exportPresets() {
  const custom=safeJSON(localStorage.getItem(STORAGE.presets),[]);
  const payload={app:"GoodBoyGoonsaLot",version:1,presets:custom,exportedAt:new Date().toISOString()};
  downloadBlob(JSON.stringify(payload,null,2),"goodboygoonsalot-presets.json","application/json");
  showToast("Preset JSON exported");
}
function importPresets(file) {
  const reader=new FileReader();
  reader.onload=()=>{const data=safeJSON(reader.result,null);if(!data?.presets?.length)return showToast("Invalid preset JSON");
    const existing=safeJSON(localStorage.getItem(STORAGE.presets),[]);localStorage.setItem(STORAGE.presets,JSON.stringify([...data.presets,...existing].slice(0,40)));
    renderPresets();showToast(`${data.presets.length} presets imported`);
  };reader.readAsText(file);
}
function downloadBlob(text,name,type){const a=document.createElement("a"),u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}

function sharePayload() {
  return {app:"GoodBoyGoonsaLot",v:1,text:$("#speechinput").value,language:state.language,phonetic:state.phonetic,
    pitch:state.pitch,speed:state.speed,mouth:state.mouth,throat:state.throat};
}
function encodeShare(obj){return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function decodeShare(s){try{return JSON.parse(decodeURIComponent(escape(atob(s.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-s.length%4)%4)))))}catch{return null}}
async function copy(text){try{await navigator.clipboard.writeText(text);showToast("Copied to clipboard")}catch{showToast("Clipboard permission denied")}}
function loadShare() {
  const hash=location.hash.startsWith("#v=")?location.hash.slice(3):"";
  const p=hash?decodeShare(hash):null;
  if(!p)return;
  Object.assign(state,{text:p.text||state.text,language:p.language||"auto",phonetic:!!p.phonetic,
    pitch:clamp(p.pitch,0,255),speed:clamp(p.speed,1,255),mouth:clamp(p.mouth,0,255),throat:clamp(p.throat,0,255)});
}

function setupTheme() {
  const saved=localStorage.getItem(STORAGE.theme);
  const theme=saved || (matchMedia("(prefers-color-scheme:light)").matches?"light":"dark");
  document.documentElement.dataset.theme=theme;
  $("#themeBtn").textContent=theme==="dark"?"☼":"☾";
  $("#themeBtn").onclick=()=>{const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;localStorage.setItem(STORAGE.theme,next);$("#themeBtn").textContent=next==="dark"?"☼":"☾";if(currentBuffer)drawWaveform(currentBuffer)};
}

function setupLanguage(){
  $("#language").value=state.language;$("#phonetic").checked=state.phonetic;
  const update=()=>{
    const note=$("#languageNote"),help=$("#phonemeHelp");
    if(state.phonetic){
      note.textContent="Raw SAM phonemes are active. Example: DHAX KAET IHZ AH5GLIY. Stress markers 1–8 follow a phoneme.";
      note.classList.remove("warn");if(help)help.hidden=false;
    }else{
      const detected=detectScript($("#speechinput").value||"");updateDetectedLanguage(detected);
      note.textContent=(state.language==="auto"||state.language==="hi")
        ?"Auto mode detects Devanagari/Hinglish and supported Indic scripts, normalizes them, then compiles through the original SAM phoneme engine."
        :"This language is transliterated approximately into SAM's English-oriented phoneme system. Expect a synthetic accent.";
      note.classList.toggle("warn",state.language!=="auto"&&state.language!=="hi");
      if(help)help.hidden=true;
    }
  };
  $("#language").addEventListener("change",()=>{state.language=$("#language").value;persistSettings();update()});
  $("#phonetic").addEventListener("change",()=>{
    const enabled=$("#phonetic").checked;
    if(enabled&&!state.phonetic){
      phoneticSourceText=$("#speechinput").value;
      try{state.text=buildSamPhonemes(phoneticSourceText);state.phonetic=true;syncText();showToast("Text compiled to SAM phonemes — edit freely");}
      catch{$("#phonetic").checked=false;showToast("Could not compile this text into SAM phonemes")}
    }else if(!enabled&&state.phonetic){
      state.phonetic=false;if(phoneticSourceText){state.text=phoneticSourceText;syncText();}phoneticSourceText=null;
    }
    persistSettings();update();
  });
  $("#phonemeExample").onclick=()=>{state.text="DHAX KAET IHZ AH5GLIY.";state.phonetic=true;$("#phonetic").checked=true;syncText();persistSettings();update();showToast("SAM phoneme example inserted")};
  update();
}

async function loadTranscriber(setProgress){
  if(transcriber)return transcriber;
  setProgress(4,"Loading Whisper runtime…");
  const mod=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2");
  transcriber=await mod.pipeline("automatic-speech-recognition","Xenova/whisper-tiny",{
    progress_callback:(p)=>{
      if(p?.progress!=null)setProgress(Math.max(4,Math.min(45,Math.round(p.progress*.45))),p.status||"Downloading model…");
    }
  });
  return transcriber;
}
function setTranscribeProgress(percent,label){
  const wrap=$("#transcribeProgressWrap"),bar=$("#transcribeBar"),pct=$("#transcribePct"),text=$("#transcribeLabel");
  wrap.hidden=false;bar.style.width=`${percent}%`;pct.textContent=`${Math.round(percent)}%`;text.textContent=label;
}
async function transcribeUploaded(){
  if(!selectedFile)return;
  $("#transcribeBtn").disabled=true;$("#recordBtn").disabled=true;setStatus("Preparing transcription…");
  try{
    const transcriberFn=await loadTranscriber(setTranscribeProgress);
    setTranscribeProgress(48,"Decoding audio in your browser…");
    const audio=await decodeToMono16k(selectedFile);
    if(!audio?.length)throw new Error("Audio decoded to zero samples");
    const chunkSize=16000*30, texts=[];const total=Math.ceil(audio.length/chunkSize);
    for(let i=0;i<total;i++){
      const chunk=audio.subarray(i*chunkSize,Math.min((i+1)*chunkSize,audio.length));
      setTranscribeProgress(50+(i/total)*48,`Transcribing segment ${i+1} / ${total}…`);
      const result=await transcriberFn(chunk,{chunk_length_s:30,return_timestamps:false});
      if(result?.text)texts.push(result.text.trim());
    }
    const text=texts.join(" ").replace(/\s+/g," ").trim();
    if(!text)throw new Error("No speech detected");
    state.text=text;state.phonetic=false;$("#phonetic").checked=false;syncText();persistSettings();
    setTranscribeProgress(100,"Transcription complete");setStatus("Ready to synthesize");showToast("Transcript inserted — edit it before speaking");
  }catch(err){
    console.error("Transcription:",err);setTranscribeProgress(0,formatAudioError(err));setStatus("Ready to synthesize");
    showToast(formatAudioError(err));
  }finally{$("#transcribeBtn").disabled=!selectedFile;$("#recordBtn").disabled=false}
}
function formatAudioError(err){
  const m=String(err?.message||err||"");
  if(/decode|encoding|codec|DataClone|buffer/i.test(m))return "This audio codec cannot be decoded by your browser. Use Record here or convert to WAV/MP3.";
  if(/fetch|network|cdn|load|module/i.test(m))return "Whisper could not load. Check your connection, then try again.";
  if(/memory|allocation|out of memory/i.test(m))return "This recording is too heavy for this device. Try a shorter clip.";
  return "Transcription failed. Try a shorter recording or use the built-in Record button.";
}
async function decodeToMono16k(file){
  if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
  const arr=await file.arrayBuffer();
  let decoded;
  try{decoded=await audioContext.decodeAudioData(arr.slice(0));}
  catch(err){throw new Error("Audio decode/codec unsupported: "+err.message)}
  const seconds=Math.min(decoded.duration,300);
  if(decoded.duration>300)showToast("Only the first 5 minutes will be transcribed");
  const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(seconds*16000)),16000);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const out=await offline.startRendering();return out.getChannelData(0);
}

function setSelectedAudio(file){
  if(!file)return;
  if(!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|aac|ogg|oga|webm|opus|flac)$/i.test(file.name))return showToast("Choose an audio file");
  selectedFile=file;$("#fileName").textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;$("#transcribeBtn").disabled=false;showToast("Audio ready to transcribe");
}
function setupAudioDrop(){
  const zone=$("#dropzone"),input=$("#audioInput");
  input.addEventListener("change",()=>setSelectedAudio(input.files[0]));
  ["dragenter","dragover"].forEach(e=>zone.addEventListener(e,x=>{x.preventDefault();zone.classList.add("drag")}));
  ["dragleave","drop"].forEach(e=>zone.addEventListener(e,x=>{x.preventDefault();zone.classList.remove("drag")}));
  zone.addEventListener("drop",e=>setSelectedAudio(e.dataTransfer.files[0]));
  $("#transcribeBtn").onclick=transcribeUploaded;
  $("#recordBtn").onclick=toggleRecorder;
}
async function toggleRecorder(){
  const btn=$("#recordBtn");
  if(recorder){try{recorder.stop()}catch{};return}
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)return showToast("Audio recording is not supported in this browser");
  try{
    recordingStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const preferred=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(t=>MediaRecorder.isTypeSupported(t));
    recorder=new MediaRecorder(recordingStream,preferred?{mimeType:preferred}:undefined);recordedChunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data)};
    recorder.onstop=()=>{
      const type=recorder?.mimeType||recordedChunks[0]?.type||"audio/webm";
      const ext=/mp4/.test(type)?"m4a":/ogg/.test(type)?"ogg":"webm";
      const blob=new Blob(recordedChunks,{type});setSelectedAudio(new File([blob],`goodboy-recording-${Date.now()}.${ext}`,{type}));
      recordingStream?.getTracks().forEach(t=>t.stop());recordingStream=null;recorder=null;btn.classList.remove("recording");btn.textContent="● Record";
    };
    recorder.start(250);btn.classList.add("recording");btn.textContent="■ Stop recording";setStatus("Recording…");
  }catch(err){showToast(err.name==="NotAllowedError"?"Microphone permission was denied":"Could not start recording")}
}
function setupMic(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition,btn=$("#micBtn");
  if(!SpeechRecognition){btn.disabled=true;btn.textContent="Browser mic text unavailable";return}
  let rec=null;
  btn.onclick=()=>{
    if(rec){try{rec.stop()}catch{};rec=null;btn.textContent="Use microphone";return}
    rec=new SpeechRecognition();rec.lang=state.language==="hi"?"hi-IN":"en-US";rec.interimResults=true;rec.continuous=false;
    btn.textContent="Listening…";setStatus("Listening for speech…");
    rec.onresult=e=>{let t="";for(const r of e.results)t+=r[0].transcript+" ";state.text=t.trim();syncText()};
    rec.onerror=()=>{btn.textContent="Use microphone";setStatus("Ready to synthesize");showToast("Microphone recognition failed")};
    rec.onend=()=>{rec=null;btn.textContent="Use microphone";setStatus("Ready to synthesize");persistSettings()};
    try{rec.start()}catch{}
  };
}

// ===================== Audio FX Lab (Step 07) =====================
// Separate from the SAM speech pipeline on purpose: this processes whatever
// audio the user uploads directly, using real DSP (audiofx.js), rather than
// SAM's phoneme-only synthesis path. See the panel copy in index.html for
// why "run this through SAM" isn't literally possible.
function fxParams() {
  return {
    pitch: Number($("#fxPitch").value),
    speed: Number($("#fxSpeed").value),
    mouth: Number($("#fxMouth").value),
    throat: Number($("#fxThroat").value),
  };
}
function setupAudioFx(){
  const dropzone=$("#fxDropzone"), input=$("#fxAudioInput");

  const handleFxFile=async(file)=>{
    if(!file)return;
    try{
      setStatus("Decoding audio…","#fxStatusText");
      const arrayBuf=await file.arrayBuffer();
      const decodeCtx=new (window.AudioContext||window.webkitAudioContext)();
      const decoded=await decodeCtx.decodeAudioData(arrayBuf);
      fxSource={samples:toMonoFloat32(decoded),sampleRate:decoded.sampleRate};
      decodeCtx.close?.();
      $("#fxFileName").textContent=`${file.name} · ${decoded.duration.toFixed(1)}s · ${decoded.sampleRate}Hz`;
      $("#fxControls").hidden=false;
      setStatus("Ready","#fxStatusText");
      showToast("Audio loaded — adjust the controls, then Preview");
    }catch(err){
      console.error("[AudioFX] decode:",err);
      setStatus("Ready","#fxStatusText");
      showToast("Could not decode that audio file. Try a different format.");
    }
  };
  input.addEventListener("change",()=>handleFxFile(input.files[0]));
  ["dragover","dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>e.preventDefault()));
  dropzone.addEventListener("dragover",()=>dropzone.classList.add("drag"));
  dropzone.addEventListener("dragleave",()=>dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop",e=>{dropzone.classList.remove("drag");handleFxFile(e.dataTransfer.files[0])});

  // Two-way bind each range/number pair, same pattern as buildControls().
  [["fxPitch",-12,12],["fxSpeed",50,200],["fxMouth",0,255],["fxThroat",0,255]].forEach(([id,min,max])=>{
    const range=$(`#${id}`),num=$(`#${id}Number`);
    const sync=(v)=>{
      const c=clamp(v,min,max);range.value=c;num.value=c;
      range.style.setProperty("--fill",`${(c-min)/(max-min)*100}%`);
    };
    sync(range.value);
    range.addEventListener("input",e=>sync(e.target.value));
    num.addEventListener("input",e=>sync(e.target.value));
  });

  // Presets: the exact same list renderPresets() draws from, so a preset
  // saved for the voice lab shows up here too.
  const presetSelect=$("#fxPresetSelect");
  const custom=safeJSON(localStorage.getItem(STORAGE.presets),[]);
  const built=presetData.map(p=>({name:p[1],pitch:p[3],speed:p[4],mouth:p[5],throat:p[6]}));
  const allPresets=[...built,...custom];
  presetSelect.innerHTML=`<option value="">Choose a preset…</option>`+
    allPresets.map((p,i)=>`<option value="${i}">${escapeHtml(p.name)}</option>`).join("");
  presetSelect.addEventListener("change",()=>{
    if(presetSelect.value==="")return;
    const p=allPresets[Number(presetSelect.value)];
    // SAM's presets are 0-255 synthesis parameters, not audio-effect
    // parameters -- map pitch/speed onto this tool's semitone/percent range
    // so the preset's *character* carries over rather than its raw numbers.
    const semis=Math.round(((p.pitch-128)/128)*12);
    const pct=Math.round(50+(p.speed/255)*150);
    $("#fxPitch").value=semis;$("#fxPitchNumber").value=semis;
    $("#fxSpeed").value=pct;$("#fxSpeedNumber").value=pct;
    $("#fxMouth").value=p.mouth;$("#fxMouthNumber").value=p.mouth;
    $("#fxThroat").value=p.throat;$("#fxThroatNumber").value=p.throat;
    showToast(`${p.name} mapped onto Audio FX`);
  });

  $("#fxPreviewBtn").onclick=runAudioFx;
  $("#fxStopBtn").onclick=()=>stopAudio(true,{statusSel:"#fxStatusText",idleStatus:"Ready"});
  $("#fxDownloadBtn").onclick=downloadFxWav;
}

async function runAudioFx(){
  if(!fxSource)return showToast("Upload an audio file first");
  stopAudio(false);const token=++fxToken;
  setStatus("Processing…","#fxStatusText");
  $("#fxPreviewBtn").disabled=true;$("#fxDownloadBtn").disabled=true;$("#fxStopBtn").disabled=false;
  $("#fxWavePlaceholder").style.display="grid";

  // PHASE 1 -- DSP chain. Same "only this phase reports a processing
  // failure" split as renderSpeech(), for the same reason.
  let processed;
  try{
    processed=await processAudioFx(fxSource.samples,fxSource.sampleRate,fxParams());
    if(token!==fxToken)return; // superseded by a newer click; say nothing
  }catch(err){
    console.error("[AudioFX] processing:",err);
    setStatus("Processing failed","#fxStatusText");
    showToast("Could not process this audio with these settings.");
    $("#fxPreviewBtn").disabled=false;$("#fxDownloadBtn").disabled=false;$("#fxStopBtn").disabled=!currentSource;
    return;
  }

  // PHASE 2 -- draw/play. fxBuffer is valid from here even if playback fails.
  fxBuffer=processed;fxBufferRate=fxSource.sampleRate;
  try{ drawWaveform(fxBuffer,"#fxWaveform","#fxWavePlaceholder"); }
  catch(err){ console.error("[AudioFX] waveform:",err); }
  $("#fxDuration").textContent=`${(fxBuffer.length/fxBufferRate).toFixed(2)} s`;
  try{
    setStatus("Playing…","#fxStatusText");
    await playBuffer(fxBuffer,{sampleRate:fxBufferRate,stopBtnSel:"#fxStopBtn"});
    setStatus("Ready","#fxStatusText");
  }catch(err){
    console.error("[AudioFX] playback:",err);
    setStatus("Ready","#fxStatusText");
    showToast("Audio was processed, but playback failed. Download still works.");
  }finally{
    $("#fxPreviewBtn").disabled=false;$("#fxDownloadBtn").disabled=false;$("#fxStopBtn").disabled=!currentSource;
  }
}

function downloadFxWav(){
  if(!fxBuffer){
    if(!fxSource)return showToast("Upload an audio file first");
    return runAudioFx().then(()=>fxBuffer&&downloadFxWav());
  }
  const a=document.createElement("a"),url=URL.createObjectURL(encodeWav(fxBuffer,fxBufferRate));
  a.href=url;a.download=`goodboygoonsalot-fx-${Date.now()}.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast("16-bit WAV exported");
}

function bindEvents() {
  $("#speechinput").addEventListener("input",e=>{state.text=e.target.value;$("#charCount").textContent=`${state.text.length} / 4000`;updateDetectedLanguage(detectScript(state.text));persistSettings()});
  $("#previewBtn").onclick=renderSpeech;$("#downloadBtn").onclick=downloadWav;$("#stopBtn").onclick=()=>stopAudio(true);
  $("#randomBtn").onclick=randomize;$$("[data-smart]").forEach(b=>b.onclick=()=>smart(b.dataset.smart));
  $("#savePresetBtn").onclick=savePreset;$("#exportBtn").onclick=exportPresets;$("#importInput").onchange=e=>e.target.files[0]&&importPresets(e.target.files[0]);
  $("#clearHistoryBtn").onclick=()=>{localStorage.removeItem(STORAGE.history);renderHistory();showToast("History cleared")};
  $("#copyJsonBtn").onclick=()=>copy(JSON.stringify(sharePayload(),null,2));
  $("#copyLinkBtn").onclick=()=>{const url=`${location.origin}${location.pathname}#v=${encodeShare(sharePayload())}`;copy(url)};
  $("#aboutBtn").onclick=()=>$("#aboutDialog").showModal();$("#closeAbout").onclick=()=>$("#aboutDialog").close();$("#closeAbout2").onclick=()=>$("#aboutDialog").close();
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();renderSpeech()}
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==="d"){e.preventDefault();downloadWav()}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#speechinput").focus()}
    if(e.key==="Escape")stopAudio(false);
  });
  window.addEventListener("resize",()=>{currentBuffer&&drawWaveform(currentBuffer);fxBuffer&&drawWaveform(fxBuffer,"#fxWaveform","#fxWavePlaceholder")});
}

loadSettings();loadShare();buildControls();syncText();setupTheme();setupLanguage();renderPresets();renderHistory();setupAudioDrop();setupMic();setupAudioFx();bindEvents();
