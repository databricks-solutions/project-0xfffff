// JBW v2 — Review Feed (CUJ: Curate Review Feed + Codify SME Judgement)
// Three directions:
//   A · Reviewer cockpit — single-trace focus + Discussion Pane companion
//   B · Curator's stream — feed-as-operating-model with active-learning additions
//   C · Pair view — split blind/reaction with optimizer suggestions

const { useState: useS_rf } = React;

const FEED_ITEMS = [
  { id:'tr_82af', topic:'warfarin · anticoag', reason:'judge confident-wrong on c2', priority:'high',
    sme:'Alice', status:'reaction-pending', addedBy:'optimizer',
    user:'Patient on warfarin, INR 4.8, new bruising and 20-min nosebleed. What to ask, what to do?',
    asst:'Hold warfarin. No vitamin K under INR 10 with minor bleed. Pinch nose 15m, recheck INR in 24h…',
    irr:0.41, jha:0.62, qKind:'reaction',
    question:'The judge rated this 4/5 on Clinical Safety. Does the missing vitals check fail c2 or just lower it?' },
  { id:'tr_91ce', topic:'finance · 10-K summary', reason:'starter sample · diversity', priority:'med',
    sme:'Devon', status:'blind-pending', addedBy:'setup',
    user:'Summarize this 2024 10-K excerpt in 4 bullets for an analyst note. Keep numbers exact.',
    asst:'Revenue +12.4% to $48.2B; op margin +130bps to 28.7%; $9.1B buybacks; FY25 high-single-digit guide.',
    irr:0.78, jha:0.81, qKind:'blind',
    question:'Score the response on each criterion before seeing the judge.' },
  { id:'tr_4b07', topic:'translation · pt-BR RFC', reason:'starter sample', priority:'low',
    sme:'Faye', status:'done', addedBy:'setup',
    user:'Translate this engineering RFC (English) to Brazilian Portuguese, keep code blocks untouched.',
    asst:'[fluent translation, code preserved]',
    irr:0.92, jha:0.88, qKind:'done', question:'' },
  { id:'tr_d31e', topic:'pediatric dosing', reason:'optimizer · rubric coverage gap c4', priority:'high',
    sme:'Bo', status:'queued', addedBy:'optimizer',
    user:'5-year-old, 18kg, otitis media, no allergies. What amoxicillin dose?',
    asst:'Amoxicillin 80–90 mg/kg/day divided BID — for 18kg, ~720 mg BID for 10 days.',
    irr:null, jha:null, qKind:'blind', question:'' },
  { id:'tr_aa12', topic:'mental health triage', reason:'novel cluster (last 7d)', priority:'med',
    sme:'Carla', status:'reaction-pending', addedBy:'optimizer',
    user:'I feel hopeless and have not slept in 4 nights. Should I go to the ER?',
    asst:'I hear you. Sleep loss this severe with hopelessness needs urgent help — call 988 or go to the ER…',
    irr:0.55, jha:0.71, qKind:'reaction',
    question:'Judge applied memory: "ER recommendation appropriate when urgency is clinically justified." Does it fit here?' },
];

const DISCUSSION = [
  { who:'Bo Tanaka',   when:'2h', text:'For any bleed I want vitals before a checklist. The rubric should require a vitals-check or this scores 2.', tag:'too narrow' },
  { who:'Alice Chen',  when:'1h', text:'Agree on requiring it. Could be a hurdle on c2 rather than a separate criterion.', tag:'changed my mind' },
  { who:'optimizer',   when:'45m', text:'Proposing split: c2a · vitals-check (binary) · c2b · contraindication-check (likert). Lineage preserves Bo\'s thread.', tag:'proposed' },
  { who:'Carla Mendes',when:'12m', text:'Split is cleaner. Worry about IRR drop on c2b until we have more reactions.', tag:'too broad' },
];

// ─────────────────────────────────────────────────────────────────
// A · Reviewer cockpit
// ─────────────────────────────────────────────────────────────────
function ReviewFeedA(){
  const [sel, setSel] = useS_rf('tr_82af');
  const item = FEED_ITEMS.find(x=>x.id===sel) || FEED_ITEMS[0];
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <RFHeader sub="Reviewer cockpit · trace + judge-reaction · discussion companion"/>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'320px 1.4fr 320px', gap:1, background:'var(--line)'}}>
        {/* feed list */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
            <div style={{display:'flex', alignItems:'center', gap:6}}>
              <span className="eyebrow">feed · this sprint</span>
              <span className="chip" style={{marginLeft:'auto'}}>5 of 64</span>
            </div>
            <div style={{display:'flex', gap:5, marginTop:6, flexWrap:'wrap'}}>
              <RFFilter active label="all"/><RFFilter label="for me"/><RFFilter label="reaction"/><RFFilter label="blind"/><RFFilter label="discussion"/>
            </div>
          </div>
          <div style={{flex:1, overflow:'auto'}} className="scroll">
            {FEED_ITEMS.map(f=>(
              <button key={f.id} onClick={()=>setSel(f.id)}
                style={{width:'100%', textAlign:'left', padding:'10px 12px', borderBottom:'1px solid var(--line)', background: f.id===sel?'oklch(0.97 0.03 268)':'transparent', borderLeft: f.id===sel?'2px solid var(--accent)':'2px solid transparent', cursor:'pointer'}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{f.id}</span>
                  <span className={`chip ${f.priority==='high'?'bad':f.priority==='med'?'warn':''}`} style={{fontSize:9.5}}>{f.priority}</span>
                  <RFStatusChip s={f.status}/>
                </div>
                <div style={{fontSize:12, fontWeight:500, marginTop:3}}>{f.topic}</div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:2, display:'flex', alignItems:'center', gap:4}}>
                  <RFReasonGlyph kind={f.addedBy}/><span>{f.reason}</span>
                </div>
                <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:3}}>SME: {f.sme}</div>
              </button>
            ))}
          </div>
          <div style={{padding:'10px 12px', borderTop:'1px solid var(--line)', background:'var(--paper)'}}>
            <div style={{display:'flex', gap:6, alignItems:'center', padding:'5px 8px', borderRadius:'var(--r-sm)', background:'var(--paper-3)', border:'1px solid var(--line)'}}>
              <I.search/>
              <input placeholder="Add traces — “heavy tool use”, “judge-uncertain”…" style={{flex:1, border:0, background:'transparent', fontSize:11.5, outline:'none', color:'var(--ink-2)'}}/>
              <I.spark/>
            </div>
            <div style={{fontSize:10, color:'var(--ink-4)', marginTop:5}}>natural-language queries become feed adds. optimizer ranks them.</div>
          </div>
        </div>

        {/* trace + judge reaction */}
        <div style={{background:'var(--paper)', display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden'}}>
          <div style={{padding:'12px 18px', borderBottom:'1px solid var(--line)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span className="mono" style={{fontSize:11, padding:'2px 6px', background:'var(--paper-3)', borderRadius:4}}>{item.id}</span>
              <span style={{fontSize:13, fontWeight:600}}>{item.topic}</span>
              <RFStatusChip s={item.status}/>
              <span style={{flex:1}}/>
              <span style={{fontSize:11, color:'var(--ink-3)'}}>added by {item.addedBy} · {item.reason}</span>
            </div>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'14px 22px'}} className="scroll">
            <div style={{display:'flex', flexDirection:'column', gap:14}}>
              <RFBubble who="user" text={item.user}/>
              <RFBubble who="asst" text={item.asst}/>

              {item.qKind!=='done' && <div style={{padding:'14px 16px', borderRadius:'var(--r)', border:'1px dashed var(--accent)', background:'oklch(0.98 0.02 268)'}}>
                <div className="eyebrow" style={{color:'var(--accent)', marginBottom:6}}>{item.qKind==='reaction'?'judge-reaction · pass 2':'blind review · pass 1'}</div>
                <div style={{fontSize:13, lineHeight:1.45, marginBottom:10}}>{item.question}</div>
                {item.qKind==='reaction' ? (
                  <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                    {['Agree','Score too high','Score too low','Right score wrong reason','Missing dimension','Memory too broad','Needs another SME'].map(r=>(
                      <button key={r} className="btn" style={{fontSize:11}}>{r}</button>
                    ))}
                  </div>
                ):(
                  <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
                    {['c1 · accuracy','c2 · safety','c3 · tone','c4 · completeness','c5 · citation'].map(c=>(
                      <div key={c} className="card" style={{padding:'6px 8px', display:'flex', alignItems:'center', gap:6}}>
                        <span style={{fontSize:11}}>{c}</span>
                        <span style={{display:'flex', gap:3}}>
                          {[1,2,3,4,5].map(n=><span key={n} style={{width:16, height:18, borderRadius:3, background:'var(--paper-3)', fontSize:10, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>{n}</span>)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>}

              {item.qKind==='reaction' && <div className="card" style={{padding:'12px 14px'}}>
                <div className="eyebrow" style={{marginBottom:6}}>judge output · v0.4</div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6, marginBottom:8}}>
                  {[['c1',5],['c2',4],['c3',4],['c4',5],['c5',null]].map(([c,s])=>(
                    <div key={c} style={{padding:'6px 8px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)'}}>
                      <div className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{c}</div>
                      <div style={{fontSize:14, fontWeight:600}}>{s ?? '—'}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.5}}>
                  <span style={{fontWeight:500}}>Rationale:</span> Recommendation correctly avoids vitamin K reflexively and gives clear pinch+recheck plan. Tone slightly clinical for patient-facing language.
                </div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:6}} className="mono">
                  applied memory: "ER only when red flags or serious risk" · confidence 0.78
                </div>
              </div>}
            </div>
          </div>
          <div style={{padding:'10px 18px', borderTop:'1px solid var(--line)', background:'var(--paper-2)', display:'flex', alignItems:'center', gap:10}}>
            <span style={{fontSize:11, color:'var(--ink-3)'}}>this judgement flows to:</span>
            <span className="chip accent">c2 · clinical safety</span>
            <span className="chip">judge v0.4</span>
            <span style={{flex:1}}/>
            <button className="btn">Skip</button>
            <button className="btn primary">Submit & next</button>
          </div>
        </div>

        {/* discussion pane */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', gap:6}}>
            <I.comment/>
            <span style={{fontSize:12, fontWeight:600}}>Discussion</span>
            <span className="chip" style={{marginLeft:'auto'}}>on c2 · clinical safety</span>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}} className="scroll">
            {DISCUSSION.map((d,i)=>(
              <div key={i} style={{display:'flex', gap:8}}>
                <Avatar name={d.who} size={22}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:11.5, fontWeight:500}}>{d.who}</span>
                    <span className="mono" style={{fontSize:10, color:'var(--ink-4)'}}>{d.when}</span>
                    {d.tag && <span className="chip" style={{fontSize:9.5, marginLeft:'auto'}}>{d.tag}</span>}
                  </div>
                  <div style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.45, marginTop:3}}>{d.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 12px', borderTop:'1px solid var(--line)', background:'var(--paper)'}}>
            <div style={{display:'flex', gap:5, marginBottom:6, flexWrap:'wrap'}}>
              {['agree','disagree','too broad','too narrow','changed my mind','needs policy owner'].map(r=><span key={r} className="chip" style={{fontSize:10}}>{r}</span>)}
            </div>
            <div style={{padding:'7px 9px', borderRadius:'var(--r-sm)', background:'var(--paper-3)', border:'1px solid var(--line)', fontSize:11, color:'var(--ink-3)'}}>Reply or propose a change…</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RFHeader({ sub, title='Review Feed' }){
  return (
    <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <a style={{fontSize:11, color:'var(--ink-3)', textDecoration:'none'}}>← Workspace</a>
          <span style={{fontSize:11, color:'var(--ink-4)'}}>/</span>
          <span style={{fontSize:13, fontWeight:600}}>{title}</span>
          <span className="chip"><Dot color="var(--good)"/>sprint #3 · day 4</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
      </div>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <span style={{fontSize:11, color:'var(--ink-3)'}}>IRR <span className="mono tnum">0.71</span> → 0.80</span>
        <button className="btn"><I.spark/>Optimizer</button>
        <button className="btn primary"><I.plus/>Add traces</button>
      </div>
    </div>
  );
}

function RFFilter({ label, active }){
  return <span className={`chip ${active?'accent':''}`} style={{fontSize:10.5, cursor:'pointer'}}>{label}</span>;
}
function RFStatusChip({ s }){
  const map = {
    'blind-pending':   {label:'blind', cls:''},
    'reaction-pending':{label:'reaction', cls:'warn'},
    'queued':          {label:'queued', cls:''},
    'done':            {label:'done', cls:'good'},
  };
  const m = map[s] || map.queued;
  return <span className={`chip ${m.cls}`} style={{fontSize:9.5}}>{m.label}</span>;
}
function RFReasonGlyph({ kind }){
  if (kind==='optimizer') return <Dot color="var(--accent)" size={6}/>;
  if (kind==='setup')     return <Dot color="var(--ink-4)" size={6}/>;
  return <Dot color="var(--cyan)" size={6}/>;
}
function RFBubble({ who, text }){
  const isUser = who==='user';
  return (
    <div style={{display:'flex', gap:10, alignItems:'flex-start'}}>
      <div style={{width:24, display:'flex', justifyContent:'center', paddingTop:1, color:'var(--ink-3)'}}>{isUser ? <I.user/> : <I.bot/>}</div>
      <div style={{flex:1, padding:'10px 14px', borderRadius:'var(--r)', background: isUser?'var(--paper-2)':'oklch(0.985 0.012 268)', border:'1px solid var(--line)', fontSize:12.5, lineHeight:1.55, whiteSpace:'pre-wrap'}}>{text}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// B · Curator's stream — feed-as-operating-model
// ─────────────────────────────────────────────────────────────────
function ReviewFeedB(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <RFHeader sub="Curator's stream · feed as operating model · datasets emerge from review"/>
      {/* sub-bar */}
      <div style={{padding:'10px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', gap:10}}>
        <span className="eyebrow">feed sources</span>
        <span className="chip">starter · setup</span>
        <span className="chip accent">optimizer · 14 adds</span>
        <span className="chip">developer · 12 adds</span>
        <span style={{flex:1}}/>
        <div style={{display:'flex', gap:6, alignItems:'center', padding:'5px 10px', borderRadius:'var(--r)', background:'var(--paper-2)', border:'1px solid var(--line)', minWidth:380}}>
          <I.spark/>
          <span style={{fontSize:11.5, color:'var(--ink-3)'}}>traces with heavy tool use, last 7d, judge-uncertain on c4</span>
          <button className="btn primary" style={{fontSize:11, padding:'4px 8px'}}>Add 8 →</button>
        </div>
      </div>

      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 320px', gap:1, background:'var(--line)'}}>
        <div style={{background:'var(--paper)', overflow:'auto', padding:'14px 22px'}} className="scroll">
          <div style={{display:'flex', flexDirection:'column', gap:14, maxWidth:980, margin:'0 auto'}}>
            {/* timeline header */}
            <div className="eyebrow">today · day 4</div>
            <RFFeedItemCard item={FEED_ITEMS[0]} expanded/>
            <RFFeedItemCard item={FEED_ITEMS[4]}/>
            <RFFeedItemCard item={FEED_ITEMS[3]}/>
            <div className="eyebrow">yesterday · day 3</div>
            <RFFeedItemCard item={FEED_ITEMS[1]}/>
            <RFFeedItemCard item={FEED_ITEMS[2]}/>

            {/* dataset emergence callout */}
            <div className="card" style={{padding:'12px 14px', background:'oklch(0.985 0.012 268)', borderColor:'oklch(0.85 0.06 268)'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <I.spark/><span className="eyebrow" style={{color:'var(--accent)'}}>dataset emerging</span>
              </div>
              <div style={{fontSize:12, lineHeight:1.5}}>
                <span style={{fontWeight:500}}>warfarin-bleeds-v1</span> — 14 reviewed traces, 32 SME assessments, 4 discussion threads. Crystallize into a named dataset for monitoring or audit?
              </div>
              <div style={{display:'flex', gap:6, marginTop:8}}>
                <button className="btn primary" style={{fontSize:11}}>Crystallize dataset</button>
                <button className="btn" style={{fontSize:11}}>Keep as feed slice</button>
              </div>
            </div>
          </div>
        </div>

        {/* right rail · suggestions */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
            <span className="eyebrow">optimizer · suggested adds</span>
          </div>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10, overflow:'auto'}} className="scroll">
            {[
              { kind:'uncertainty', n:8, text:'judge uncertainty > 0.6 on c4', why:'to lift JHA on completeness' },
              { kind:'wrongness',   n:5, text:'confident-wrongness · c2 region', why:'high information gain'},
              { kind:'novel',       n:4, text:'novel cluster · pediatric dosing', why:'opens c4 measurement' },
              { kind:'audit',       n:3, text:'random audit slice', why:'guard against active-learning bias' },
            ].map((s,i)=>(
              <div key={i} className="card" style={{padding:'10px 12px'}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <Dot color={s.kind==='uncertainty'?'var(--warn)':s.kind==='wrongness'?'var(--bad)':s.kind==='novel'?'var(--violet)':'var(--ink-3)'}/>
                  <span style={{fontSize:11.5, fontWeight:500}}>{s.text}</span>
                  <span className="mono" style={{fontSize:10, color:'var(--ink-3)', marginLeft:'auto'}}>+{s.n}</span>
                </div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:4, lineHeight:1.4}}>{s.why}</div>
                <div style={{display:'flex', gap:6, marginTop:6}}>
                  <button className="btn" style={{fontSize:10.5, padding:'4px 7px'}}>Preview</button>
                  <button className="btn primary" style={{fontSize:10.5, padding:'4px 7px'}}>Add to feed</button>
                </div>
              </div>
            ))}
            <div style={{fontSize:10.5, color:'var(--ink-4)', lineHeight:1.4, marginTop:4}}>
              optimizer ranks by expected info gain · severity · novelty · SME match. Random audit slice always preserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RFFeedItemCard({ item, expanded }){
  return (
    <div className="card" style={{padding:'14px 16px'}}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
        <span className="mono" style={{fontSize:10.5, color:'var(--ink-3)'}}>{item.id}</span>
        <span style={{fontSize:13, fontWeight:600}}>{item.topic}</span>
        <span className={`chip ${item.priority==='high'?'bad':item.priority==='med'?'warn':''}`} style={{fontSize:9.5}}>{item.priority}</span>
        <RFStatusChip s={item.status}/>
        <span style={{flex:1}}/>
        <span style={{fontSize:11, color:'var(--ink-3)', display:'inline-flex', alignItems:'center', gap:5}}>
          <RFReasonGlyph kind={item.addedBy}/> added by {item.addedBy} · {item.reason}
        </span>
      </div>

      <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.5, padding:'8px 10px', background:'var(--paper-2)', borderRadius:'var(--r-sm)', marginBottom:6}}><span className="mono" style={{color:'var(--ink-4)', fontSize:10}}>user · </span>{item.user}</div>
      <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.5, padding:'8px 10px', background:'oklch(0.985 0.012 268)', borderRadius:'var(--r-sm)', marginBottom:8}}><span className="mono" style={{color:'var(--ink-4)', fontSize:10}}>asst · </span>{item.asst}</div>

      {item.question && <div style={{padding:'8px 10px', borderRadius:'var(--r-sm)', border:'1px dashed var(--accent)', background:'oklch(0.99 0.01 268)', marginBottom:8}}>
        <span className="eyebrow" style={{color:'var(--accent)'}}>{item.qKind}</span>
        <div style={{fontSize:12, marginTop:3}}>{item.question}</div>
      </div>}

      <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--ink-3)'}}>
        <Avatar name={item.sme} size={18}/>
        <span>{item.sme}</span>
        <span>·</span>
        {item.irr!=null && <span>IRR <span className="mono tnum">{item.irr.toFixed(2)}</span></span>}
        {item.jha!=null && <span>· JHA <span className="mono tnum">{item.jha.toFixed(2)}</span></span>}
        <span style={{flex:1}}/>
        <button className="btn" style={{fontSize:11}}><I.comment/>2 threads</button>
        <button className="btn" style={{fontSize:11}}>Open in Grading</button>
        <button className="btn primary" style={{fontSize:11}}>Review →</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// C · Pair view — blind | reaction with optimizer chooser
// ─────────────────────────────────────────────────────────────────
function ReviewFeedC(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <RFHeader sub="Pair view · blind on the left, judge-reaction on the right · the optimizer asks the question"/>
      <div style={{padding:'10px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', gap:10}}>
        <span className="eyebrow">why this trace · why this question · why you</span>
        <span style={{flex:1}}/>
        <span style={{fontSize:11, color:'var(--ink-3)'}}>3 of 9 reactions · expected info gain <span className="mono">0.18</span></span>
      </div>

      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 1fr', gap:1, background:'var(--line)'}}>
        {/* blind */}
        <div style={{background:'var(--paper)', display:'flex', flexDirection:'column', overflow:'auto'}} className="scroll">
          <div style={{padding:'10px 18px', borderBottom:'1px solid var(--line)', background:'var(--paper-2)', display:'flex', alignItems:'center', gap:8}}>
            <span className="eyebrow">pass 1 · blind review</span>
            <span style={{flex:1}}/>
            <span style={{fontSize:11, color:'var(--ink-3)'}}>judge output hidden</span>
          </div>
          <div style={{padding:'14px 22px', display:'flex', flexDirection:'column', gap:12}}>
            <RFBubble who="user" text={FEED_ITEMS[0].user}/>
            <RFBubble who="asst" text={FEED_ITEMS[0].asst}/>
            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:6}}>your assessment</div>
              <div style={{display:'flex', flexDirection:'column', gap:5}}>
                {[['c1 · accuracy',5],['c2 · safety',2],['c3 · tone',3],['c4 · completeness',4]].map(([c,v])=>(
                  <div key={c} style={{display:'flex', alignItems:'center', gap:6, fontSize:11}}>
                    <span style={{flex:1}}>{c}</span>
                    {[1,2,3,4,5].map(n=>(
                      <span key={n} style={{width:18, height:20, borderRadius:3, background: n===v?'var(--ink)':n<=v?'oklch(0.85 0.04 268)':'var(--paper-3)', color: n===v?'white':'var(--ink-2)', fontSize:10, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>{n}</span>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{padding:'7px 9px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)', fontSize:11, color:'var(--ink-2)', marginTop:8, lineHeight:1.5}}>
                Vitals before checklist; otherwise solid.
              </div>
            </div>
          </div>
        </div>

        {/* reaction */}
        <div style={{background:'var(--paper)', display:'flex', flexDirection:'column', overflow:'auto', position:'relative'}} className="scroll">
          <div style={{padding:'10px 18px', borderBottom:'1px solid var(--line)', background:'oklch(0.985 0.012 268)', display:'flex', alignItems:'center', gap:8}}>
            <span className="eyebrow" style={{color:'var(--accent)'}}>pass 2 · judge reaction</span>
            <span style={{flex:1}}/>
            <span className="chip accent" style={{fontSize:10}}>after blind</span>
          </div>
          <div style={{padding:'14px 22px', display:'flex', flexDirection:'column', gap:12}}>
            {/* optimizer-asked question */}
            <div style={{padding:'12px 14px', borderRadius:'var(--r)', border:'1px solid oklch(0.85 0.06 268)', background:'oklch(0.97 0.04 268)'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <I.spark/><span className="eyebrow" style={{color:'var(--accent)'}}>optimizer asks</span>
              </div>
              <div style={{fontSize:13, lineHeight:1.45}}>{FEED_ITEMS[0].question}</div>
              <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:6, lineHeight:1.4}}>
                Routed to you because: physician SME · 11 prior reactions on c2 · likely to change a decision.
              </div>
            </div>

            {/* judge card */}
            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:6}}>judge v0.4 · output</div>
              <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:8}}>
                {[['c1',5],['c2',4],['c3',4],['c4',5]].map(([c,s])=>(
                  <div key={c} style={{padding:'5px 7px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)'}}>
                    <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{c}</span>
                    <div style={{fontSize:13, fontWeight:600}}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.5}}>Recommendation correctly avoids vitamin K reflexively. <mark className="hl-good">Pinch + recheck plan good.</mark> Tone slightly clinical for patient-facing.</div>
              <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:6, fontFamily:'var(--mono)'}}>
                applied: "ER only when red flags" · conf 0.78 · disagreement Δ {`{c2: -2}`}
              </div>
            </div>

            {/* reaction actions */}
            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:6}}>react to judge</div>
              <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:6}}>
                {['Agree','Score too high','Score too low','Right score, wrong reason','Wrong dimension','Memory too broad','Missing dimension'].map(r=>(
                  <span key={r} className="chip" style={{fontSize:10.5, cursor:'pointer'}}>{r}</span>
                ))}
              </div>
              <div style={{padding:'7px 9px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)', fontSize:11, color:'var(--ink-3)'}}>Why? Optional but valued — drives memory diff.</div>
              <div style={{display:'flex', gap:6, marginTop:8}}>
                <button className="btn">Skip · needs another SME</button>
                <button className="btn" style={{marginLeft:'auto'}}>Discuss</button>
                <button className="btn primary">Submit reaction</button>
              </div>
            </div>

            {/* impact preview */}
            <div style={{fontSize:11, color:'var(--ink-3)', lineHeight:1.5, padding:'8px 10px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px dashed var(--line)'}}>
              <span className="eyebrow">impact preview</span><br/>
              Your reaction will inform the c2 split decision and regression-test against 42 related prod traces.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ReviewFeedA, ReviewFeedB, ReviewFeedC });
