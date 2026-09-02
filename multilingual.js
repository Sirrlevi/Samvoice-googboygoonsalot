const SCRIPT_TABLES = {
  Devanagari:{ind:{"अ":"a","आ":"aa","इ":"i","ई":"ii","उ":"u","ऊ":"uu","ऋ":"ri","ए":"e","ऐ":"ai","ओ":"o","औ":"au"},
    con:{"क":"k","ख":"kh","ग":"g","घ":"gh","ङ":"ng","च":"ch","छ":"chh","ज":"j","झ":"jh","ञ":"ny","ट":"t","ठ":"th","ड":"d","ढ":"dh","ण":"n","त":"t","थ":"th","द":"d","ध":"dh","न":"n","प":"p","फ":"ph","ब":"b","भ":"bh","म":"m","य":"y","र":"r","ल":"l","व":"v","श":"sh","ष":"sh","स":"s","ह":"h","ळ":"l"},
    mat:{"ा":"aa","ि":"i","ी":"ii","ु":"u","ू":"uu","ृ":"ri","े":"e","ै":"ai","ो":"o","ौ":"au","ॅ":"e","ॉ":"o"}, marks:{"ं":"n","ँ":"n","ः":"h","्":"","़":""}},
  Bengali:{ind:{"অ":"a","আ":"aa","ই":"i","ঈ":"ii","উ":"u","ঊ":"uu","ঋ":"ri","এ":"e","ঐ":"oi","ও":"o","ঔ":"ou"},
    con:{"ক":"k","খ":"kh","গ":"g","ঘ":"gh","ঙ":"ng","চ":"ch","ছ":"chh","জ":"j","ঝ":"jh","ঞ":"ny","ট":"t","ঠ":"th","ড":"d","ঢ":"dh","ণ":"n","ত":"t","থ":"th","দ":"d","ধ":"dh","ন":"n","প":"p","ফ":"ph","ব":"b","ভ":"bh","ম":"m","য":"y","র":"r","ল":"l","শ":"sh","ষ":"sh","স":"s","হ":"h"},
    mat:{"া":"aa","ি":"i","ী":"ii","ু":"u","ূ":"uu","ৃ":"ri","ে":"e","ৈ":"oi","ো":"o","ৌ":"ou"}, marks:{"ং":"ng","ঁ":"n","ঃ":"h","্":"","়":""}},
  Gurmukhi:{ind:{"ਅ":"a","ਆ":"aa","ਇ":"i","ਈ":"ii","ਉ":"u","ਊ":"uu","ਏ":"e","ਐ":"ai","ਓ":"o","ਔ":"au"},
    con:{"ਕ":"k","ਖ":"kh","ਗ":"g","ਘ":"gh","ਙ":"ng","ਚ":"ch","ਛ":"chh","ਜ":"j","ਝ":"jh","ਞ":"ny","ਟ":"t","ਠ":"th","ਡ":"d","ਢ":"dh","ਣ":"n","ਤ":"t","ਥ":"th","ਦ":"d","ਧ":"dh","ਨ":"n","ਪ":"p","ਫ":"ph","ਬ":"b","ਭ":"bh","ਮ":"m","ਯ":"y","ਰ":"r","ਲ":"l","ਵ":"v","ਸ":"s","ਹ":"h"},
    mat:{"ਾ":"aa","ਿ":"i","ੀ":"ii","ੁ":"u","ੂ":"uu","ੇ":"e","ੈ":"ai","ੋ":"o","ੌ":"au"}, marks:{"ਂ":"n","ੰ":"n","ੱ":"","੍":"","਼":""}},
  Gujarati:{ind:{"અ":"a","આ":"aa","ઇ":"i","ઈ":"ii","ઉ":"u","ઊ":"uu","ઋ":"ri","એ":"e","ઐ":"ai","ઓ":"o","ઔ":"au"},
    con:{"ક":"k","ખ":"kh","ગ":"g","ઘ":"gh","ઙ":"ng","ચ":"ch","છ":"chh","જ":"j","ઝ":"jh","ઞ":"ny","ટ":"t","ઠ":"th","ડ":"d","ઢ":"dh","ણ":"n","ત":"t","થ":"th","દ":"d","ધ":"dh","ન":"n","પ":"p","ફ":"ph","બ":"b","ભ":"bh","મ":"m","ય":"y","ર":"r","લ":"l","વ":"v","શ":"sh","ષ":"sh","સ":"s","હ":"h"},
    mat:{"ા":"aa","િ":"i","ી":"ii","ુ":"u","ૂ":"uu","ૃ":"ri","ે":"e","ૈ":"ai","ો":"o","ૌ":"au"}, marks:{"ં":"n","ઃ":"h","્":"","઼":""}},
  Tamil:{ind:{"அ":"a","ஆ":"aa","இ":"i","ஈ":"ii","உ":"u","ஊ":"uu","எ":"e","ஏ":"ee","ஐ":"ai","ஒ":"o","ஓ":"oo","ஔ":"au"},
    con:{"க":"k","ங":"ng","ச":"ch","ஞ":"ny","ட":"t","ண":"n","த":"t","ந":"n","ப":"p","ம":"m","ய":"y","ர":"r","ல":"l","வ":"v","ழ":"zh","ள":"l","ற":"r","ன":"n","ஜ":"j","ஷ":"sh","ஸ":"s","ஹ":"h"},
    mat:{"ா":"aa","ி":"i","ீ":"ii","ு":"u","ூ":"uu","ெ":"e","ே":"ee","ை":"ai","ொ":"o","ோ":"oo","ௌ":"au"}, marks:{"்":"","ஂ":"m","ஃ":"h"}},
  Telugu:{ind:{"అ":"a","ఆ":"aa","ఇ":"i","ఈ":"ii","ఉ":"u","ఊ":"uu","ఋ":"ri","ఎ":"e","ఏ":"ee","ఐ":"ai","ఒ":"o","ఓ":"oo","ఔ":"au"},
    con:{"క":"k","ఖ":"kh","గ":"g","ఘ":"gh","ఙ":"ng","చ":"ch","ఛ":"chh","జ":"j","ఝ":"jh","ఞ":"ny","ట":"t","ఠ":"th","డ":"d","ఢ":"dh","ణ":"n","త":"t","థ":"th","ద":"d","ధ":"dh","న":"n","ప":"p","ఫ":"ph","బ":"b","భ":"bh","మ":"m","య":"y","ర":"r","ల":"l","వ":"v","శ":"sh","ష":"sh","స":"s","హ":"h"},
    mat:{"ా":"aa","ి":"i","ీ":"ii","ు":"u","ూ":"uu","ృ":"ri","ె":"e","ే":"ee","ై":"ai","ొ":"o","ో":"oo","ౌ":"au"}, marks:{"ం":"n","ః":"h","్":"","ఁ":"n"}},
  Kannada:{ind:{"ಅ":"a","ಆ":"aa","ಇ":"i","ಈ":"ii","ಉ":"u","ಊ":"uu","ಋ":"ri","ಎ":"e","ಏ":"ee","ಐ":"ai","ಒ":"o","ಓ":"oo","ಔ":"au"},
    con:{"ಕ":"k","ಖ":"kh","ಗ":"g","ಘ":"gh","ಙ":"ng","ಚ":"ch","ಛ":"chh","ಜ":"j","ಝ":"jh","ಞ":"ny","ಟ":"t","ಠ":"th","ಡ":"d","ಢ":"dh","ಣ":"n","ತ":"t","ಥ":"th","ದ":"d","ಧ":"dh","ನ":"n","ಪ":"p","ಫ":"ph","ಬ":"b","ಭ":"bh","ಮ":"m","ಯ":"y","ರ":"r","ಲ":"l","ವ":"v","ಶ":"sh","ಷ":"sh","ಸ":"s","ಹ":"h"},
    mat:{"ಾ":"aa","ಿ":"i","ೀ":"ii","ು":"u","ೂ":"uu","ೃ":"ri","ೆ":"e","ೇ":"ee","ೈ":"ai","ೊ":"o","ೋ":"oo","ೌ":"au"}, marks:{"ಂ":"n","ಃ":"h","್":""}},
  Malayalam:{ind:{"അ":"a","ആ":"aa","ഇ":"i","ഈ":"ii","ഉ":"u","ഊ":"uu","ഋ":"ri","എ":"e","ഏ":"ee","ഐ":"ai","ഒ":"o","ഓ":"oo","ഔ":"au"},
    con:{"ക":"k","ഖ":"kh","ഗ":"g","ഘ":"gh","ങ":"ng","ച":"ch","ഛ":"chh","ജ":"j","ഝ":"jh","ഞ":"ny","ട":"t","ഠ":"th","ഡ":"d","ഢ":"dh","ണ":"n","ത":"t","ഥ":"th","ദ":"d","ധ":"dh","ന":"n","പ":"p","ഫ":"ph","ബ":"b","ഭ":"bh","മ":"m","യ":"y","ര":"r","ല":"l","വ":"v","ശ":"sh","ഷ":"sh","സ":"s","ഹ":"h","ള":"l","ഴ":"zh","റ":"r"},
    mat:{"ാ":"aa","ി":"i","ീ":"ii","ു":"u","ൂ":"uu","ൃ":"ri","െ":"e","േ":"ee","ൈ":"ai","ൊ":"o","ോ":"oo","ൌ":"au"}, marks:{"ം":"n","ഃ":"h","്":""}}
};
const RANGES = Object.entries(SCRIPT_TABLES).map(([name,t])=>[name,new RegExp(`[${Object.keys({...t.ind,...t.con,...t.mat,...t.marks}).join("")}]`),t]);

// Note: "main", "the", "mat", "me" and "to" are deliberately excluded even
// though they're valid Hindi/Hinglish romanizations (they also all appear in
// "the", "mera meri mere", etc.). They're common enough as plain English
// words on their own ("the", "to", "a mat", "give it to me") that a single
// incidental match was misclassifying ordinary English sentences as
// Hinglish. Genuine Hinglish input will almost always contain one of the
// many remaining unambiguous markers below as well.
const HINGLISH = new Set("mai mujhe mujhe mera meri mere hum ham aap tum tu tera teri tere apna hai hain hoon hu tha thi hoga hogi kar kya kaise kaisa kyun kyunki nahi nahin ja jaa raha rahi rahe gaya gayi ghar bhai yaar acha accha mujko isko usko ye yeh woh wo kab ab kal aaj phir bas bahut bohot wala wali wale se ko ka ki ke mein par pe aur bhi toh sirf chahiye pata lagta sach jhoot zindagi dil pyar pyaar samajh samajhta".split(" "));

export function detectScript(text){
  const counts=RANGES.map(([n,re])=>[n,(text.match(re)||[]).length]).filter(([,n])=>n);
  if(counts.length)return counts.sort((a,b)=>b[1]-a[1])[0][0];
  const words=text.toLowerCase().replace(/[^a-z\s]/g," ").split(/\s+/).filter(Boolean);
  return words.filter(w=>HINGLISH.has(w)).length ? "Hinglish" : "Latin / English";
}
export function transliterate(text,script=detectScript(text)){
  const table=SCRIPT_TABLES[script]; if(!table)return text;
  const out=[]; const c=[...text];
  for(let i=0;i<c.length;i++){
    const ch=c[i], next=c[i+1];
    if(table.con[ch]){
      let v=table.con[ch];
      if(next && table.mat[next]){v+=table.mat[next];i++;}
      else if(next==="्"||next==="੍"||next==="்"||next==="్"||next==="್"||next==="്"){i++;}
      else v+="a";
      out.push(v);
    } else if(table.ind[ch])out.push(table.ind[ch]);
    else if(table.mat[ch])out.push(table.mat[ch]);
    else if(table.marks[ch])out.push(table.marks[ch]);
    else out.push(ch);
  }
  return out.join("");
}
const ALIASES=[
  [/\bmain\b/gi,"maain"],[/\bmai\b/gi,"maai"],[/\bhai\b/gi,"hay"],[/\bhain\b/gi,"hain"],[/\bhoon\b/gi,"hoon"],[/\bhu\b/gi,"hoo"],
  [/\bnahi\b/gi,"nahee"],[/\bnahin\b/gi,"naheen"],[/\bkyun\b/gi,"kyoon"],[/\bkyunki\b/gi,"kyoonkee"],[/\bacha\b/gi,"achha"],[/\baccha\b/gi,"achha"],
  [/\bbhai\b/gi,"bhaai"],[/\byaar\b/gi,"yaar"],[/\bpyaar\b/gi,"pyaar"],[/\bjaunga\b/gi,"jaaunga"],[/\bjaungi\b/gi,"jaaungee"],
  [/\braha\b/gi,"rahaa"],[/\brahi\b/gi,"rahee"],[/\bmujhe\b/gi,"mujhay"],[/\btumhe\b/gi,"tumhay"],[/\bmeri\b/gi,"meree"]
];
function removeIndicFinalSchwa(text,script){
  if(!["Devanagari","Bengali","Gurmukhi","Gujarati"].includes(script))return text;
  // Conservative Hindi/Punjabi/Bengali-style final schwa deletion. This fixes
  // common words such as घर→ghar and आज→aaj after transliteration.
  return text.split(/(\s+)/).map(word=>{
    if(/^\s+$/.test(word)||word.length<3)return word;
    return word.replace(/a(?=[.,!?;:]?$)/i,"");
  }).join("");
}
export function normalizeForSam(text,language="auto"){
  let detected=detectScript(text), normalized=transliterate(text,detected);
  normalized=removeIndicFinalSchwa(normalized,detected);
  if(detected==="Latin / English"||detected==="Hinglish") normalized=text;
  if(detected==="Hinglish"||language==="hi"||detected!=="Latin / English"){
    for(const [re,r] of ALIASES)normalized=normalized.replace(re,r);
  }
  normalized=normalized.normalize("NFC").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[—–]/g," - ").replace(/\u00A0/g," ").replace(/[^\x00-\x7F]/g," ").replace(/\s+/g," ").trim();
  return {normalized,detected};
}
