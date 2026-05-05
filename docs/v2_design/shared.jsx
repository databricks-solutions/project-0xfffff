// Shared bits for JBW v2 designs.
const { useState, useMemo, useEffect, useRef } = React;

// Stable hash for blob seeding
function hash(str, n=0){ let h=n; for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i))|0; return Math.abs(h); }

const BLOB_PAIRS = [
  ['var(--indigo)','var(--blue)'],
  ['var(--fuchsia)','var(--rose)'],
  ['var(--rose)','var(--amber)'],
  ['var(--amber)','var(--rose)'],
  ['var(--emerald)','var(--cyan)'],
  ['var(--cyan)','var(--blue)'],
  ['var(--violet)','var(--fuchsia)'],
  ['var(--blue)','var(--indigo)'],
];

function Blob({ seed='x', size=24, subtle=false, style, className='' }){
  const h = typeof seed === 'number' ? seed : hash(seed);
  const [a,b] = BLOB_PAIRS[h % BLOB_PAIRS.length];
  const r1 = `${40+(h%30)}% ${60-(h%30)}% ${40+((h*2)%30)}% ${60-((h*2)%30)}% / ${40+((h*3)%30)}% ${40+((h*4)%30)}% ${60-((h*4)%30)}% ${60-((h*3)%30)}%`;
  const r2 = `${45+((h*5)%25)}% ${55-((h*5)%25)}% ${45+((h*6)%25)}% ${55-((h*6)%25)}% / ${55-((h*7)%25)}% ${45+((h*7)%25)}% ${55-((h*8)%25)}% ${45+((h*8)%25)}%`;
  const dur1 = 14 + (h%6);
  const dur2 = 18 + ((h*2)%7);
  return (
    <span className={`blob ${subtle?'subtle':''} ${className}`} style={{ width:size, height:size, ['--blob-a']:a, ['--blob-b']:b, ...style }}>
      <style>{`
        .blob[data-h="${h}"]::before { border-radius: ${r1}; animation-duration: ${dur1}s; }
        .blob[data-h="${h}"]::after  { border-radius: ${r2}; animation-duration: ${dur2}s; }
      `}</style>
      <span data-h={h} className="blob" style={{ width:size, height:size, position:'absolute', inset:0, ['--blob-a']:a, ['--blob-b']:b }}/>
    </span>
  );
}

// avatar with initials baked over a blob
function Avatar({ name='?', size=22 }){
  const h = hash(name);
  const [a,b] = BLOB_PAIRS[h % BLOB_PAIRS.length];
  const initials = name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
  return (
    <span className="av" style={{ width:size, height:size, fontSize: size*0.42, background:`linear-gradient(135deg, ${a}, ${b})` }}>{initials}</span>
  );
}

function Dot({ color='var(--ink-3)', size=6 }){
  return <span style={{display:'inline-block', width:size, height:size, borderRadius:999, background:color, flex:'none'}}/>
}

// Mock data ------------------------------------------------------------------
const PEOPLE = [
  {name:'Alice Chen', role:'SME'},
  {name:'Bo Tanaka', role:'SME'},
  {name:'Carla Mendes', role:'SME'},
  {name:'Devon Park', role:'Participant'},
  {name:'Eli Rao', role:'Participant'},
  {name:'Faye Olsen', role:'SME'},
];

const TRACES = [
  {
    id:'tr_82af',
    user:`A patient on warfarin reports new bruising and a nosebleed lasting 20 minutes. INR was 4.8 yesterday. Walk me through what to ask and what to do next.`,
    asst:`Given the elevated INR (4.8) and active minor bleeding, this is a supratherapeutic warfarin presentation — manage urgently but not as a major bleed unless symptoms escalate.

**Ask first**
- Volume of nosebleed; can it be controlled with 15 minutes of firm pinching?
- Any black/tarry stools, hematuria, headache, or vision change?
- Last warfarin dose; recent antibiotic, NSAID, or alcohol intake; missed labs?

**Do next**
1. Hold warfarin; do **not** give vitamin K reflexively for INR <10 with only minor bleeding.
2. Apply local nasal pressure 15 min; cold compress.
3. Recheck INR in 24h; resume at a reduced dose once INR <3.5.
4. Escalate to ED if bleeding doesn't stop, hemoglobin drops, or any red-flag symptom appears.

Document the plan and patient education on bleed precautions.`,
    fb: [
      {who:'Alice Chen', label:'good',  text:'Solid triage. Likes the explicit "do not give vitamin K reflexively" — common mistake.'},
      {who:'Bo Tanaka', label:'bad',   text:'Skips checking blood pressure and pulse. For any bleed I want vitals first.'},
      {who:'Carla Mendes', label:'good', text:'Good structure. Would soften "urgently but not major" — patients read these.'},
    ],
    findings:[
      {kind:'disagreement', title:'Vitals before checklist?', body:'2 SMEs flagged the absence of vitals as a safety gap; 1 considered it acceptable for a non-major bleed.'},
      {kind:'theme', title:'Tone for patient-facing language', body:'Recurs across 4 traces — clinical phrasing leaks into patient-readable text.'},
    ],
    tags:['triage','warfarin','bleeding'],
  },
  {
    id:'tr_91ce',
    user:`Summarize this 2024 10-K excerpt in 4 bullets for an analyst note. Keep numbers exact.`,
    asst:`- Revenue grew **12.4%** YoY to $48.2B, driven by services (+18%) and ads (+9%).
- Operating margin expanded 130 bps to 28.7%; opex grew 6%, slower than revenue.
- $9.1B returned via buybacks; **dividend raised to $0.82/share** (+10%).
- Guidance: FY25 revenue growth in the **high single digits**, margins flat to slightly up.`,
    fb: [
      {who:'Devon Park', label:'good', text:'Numbers match the source. Useful for a desk note.'},
      {who:'Eli Rao', label:'bad', text:'Missing the segment that actually drove the beat (cloud).'},
    ],
    findings:[
      {kind:'gap', title:'Segment attribution missing', body:'Cloud segment drove most YoY delta; not surfaced in summary.'},
    ],
    tags:['summarize','finance'],
  },
  {
    id:'tr_4b07',
    user:`Translate this engineering RFC (English) to Brazilian Portuguese, keep code blocks untouched.`,
    asst:`*[fluent translation, code blocks preserved verbatim]*`,
    fb:[
      {who:'Faye Olsen', label:'good', text:'Idiomatic. Preserved code; preserved variable names; correct register for an RFC.'},
    ],
    findings:[],
    tags:['translation','pt-BR'],
  },
];

const RUBRIC = [
  { id:'c1', title:'Factual accuracy', type:'binary',  desc:'Are numerical and named-entity facts correct?', irr:0.83, judgeAcc:0.91 },
  { id:'c2', title:'Clinical safety', type:'likert',  desc:'Does the response avoid safety-relevant omissions (vitals, contraindications)?', irr:0.41, judgeAcc:0.62 },
  { id:'c3', title:'Tone for audience', type:'likert',  desc:'Is phrasing appropriate for the indicated reader (patient, analyst, engineer)?', irr:0.66, judgeAcc:0.78 },
  { id:'c4', title:'Completeness', type:'likert',  desc:'Does the response cover the parts of the question the user actually asked?', irr:0.71, judgeAcc:0.81 },
  { id:'c5', title:'Citation discipline', type:'freeform', desc:'When sources are referenced, are they verifiable and necessary?', irr:0.55, judgeAcc:null },
];

// Tiny inline icons (stroke-only, single source of truth) -------------------
const I = {
  search:  () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  play:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  pause:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>,
  plus:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  chev:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>,
  chevd:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  user:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
  bot:     () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01"/></svg>,
  spark:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>,
  comment: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4z"/></svg>,
  thumbU:  () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 4 1l-1 5h5a2 2 0 0 1 2 2l-1 7a2 2 0 0 1-2 2H7"/></svg>,
  thumbD:  () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-4-1l1-5H5a2 2 0 0 1-2-2l1-7a2 2 0 0 1 2-2h11"/></svg>,
  more:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>,
  drag:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/></svg>,
  diff:    () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v18M18 3v18M6 8h12M6 16h12"/></svg>,
  check:   () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5 11-11"/></svg>,
  x:       () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>,
};

Object.assign(window, { hash, BLOB_PAIRS, Blob, Avatar, Dot, PEOPLE, TRACES, RUBRIC, I });
