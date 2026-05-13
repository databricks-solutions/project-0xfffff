// JBW v2 — "Feed" page: where reviewers actually rate.
// Two takes: (A) Google-Docs-style document with side-by-side rubric +
// inline annotations, and (B) Shorts-style swipeable card stack.

const { useState: useS_fd, useMemo: useM_fd } = React;

// ── Variation A: GDocs-feel ────────────────────────────────────────────────
function FeedA(){
  const [active, setActive] = useS_fd('a1');
  const [score, setScore] = useS_fd({c1:'pass', c2:3, c3:4, c4:4});

  const annotations = [
    { id:'a1', start:'do **not** give vitamin K reflexively', label:'good', who:'You',  text:'Common mistake — call this out explicitly. ', resolved:false },
    { id:'a2', start:'Recheck INR in 24h', label:'q', who:'Bo Tanaka', text:'Should this say 12-24h? Variation in guideline.', resolved:false },
    { id:'a3', start:'urgently but not as a major bleed', label:'bad', who:'Carla Mendes', text:'Patient may read this. Soften.', resolved:true },
  ];

  const trace = TRACES[0];

  // markup the body with anchored highlights
  let body = trace.asst.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  annotations.forEach(a=>{
    const phrase = a.start.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    body = body.replace(phrase, `<mark class="hl hl-${a.label}" data-aid="${a.id}" style="cursor:pointer;${active===a.id?'box-shadow:0 0 0 2px var(--ink);':''}">${phrase}</mark>`);
  });

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper-3)', fontSize:13}}>
      {/* doc-style topbar */}
      <div style={{padding:'10px 18px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper)'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <span className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>tr_82af</span>
          <span style={{fontWeight:600}}>Warfarin · supratherapeutic + nosebleed</span>
          <span className="chip">trace 23 / 80</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{display:'flex', marginRight:8}}>
            {['Alice Chen','Bo Tanaka','Carla Mendes'].map((n,i)=>(
              <span key={n} style={{marginLeft: i===0?0:-6}}><Avatar name={n} size={22}/></span>
            ))}
          </div>
          <button className="btn ghost"><I.chev/></button>
          <button className="btn ghost" style={{transform:'rotate(180deg)'}}><I.chev/></button>
          <span style={{width:1, height:20, background:'var(--line)', margin:'0 4px'}}/>
          <button className="btn"><I.comment/>Comment</button>
          <button className="btn primary">Submit ratings</button>
        </div>
      </div>

      {/* rubric strip below topbar — sticky-ish */}
      <div style={{padding:'10px 18px', borderBottom:'1px solid var(--line)', display:'flex', gap:10, background:'var(--paper)', alignItems:'center', flexWrap:'wrap'}}>
        <span className="eyebrow">Rubric</span>
        <Criterion title="Factual" type="binary" v={score.c1} onChange={v=>setScore(s=>({...s,c1:v}))}/>
        <Criterion title="Safety" type="likert" v={score.c2} onChange={v=>setScore(s=>({...s,c2:v}))}/>
        <Criterion title="Tone" type="likert" v={score.c3} onChange={v=>setScore(s=>({...s,c3:v}))}/>
        <Criterion title="Completeness" type="likert" v={score.c4} onChange={v=>setScore(s=>({...s,c4:v}))}/>
        <span style={{flex:1}}/>
        <span className="chip accent"><I.spark/>3 raters · 2 disagree</span>
      </div>

      {/* body */}
      <div style={{flex:1, display:'grid', gridTemplateColumns:'1fr 320px', minHeight:0}}>
        {/* doc canvas */}
        <div className="scroll" style={{overflowY:'auto', padding:'28px 0', display:'flex', justifyContent:'center'}}>
          <div style={{width:'100%', maxWidth:680, padding:'0 32px'}}>
            <div className="card" style={{padding:'28px 36px', boxShadow:'var(--shadow-2)'}}>
              <div className="eyebrow" style={{marginBottom:16}}>USER PROMPT</div>
              <div style={{fontSize:14, lineHeight:1.65, color:'var(--ink-2)', marginBottom:24}}>
                {trace.user}
              </div>
              <div className="dotline" style={{margin:'8px 0 22px'}}/>
              <div className="eyebrow" style={{marginBottom:16}}>MODEL RESPONSE · v2024-12-18</div>
              <div style={{fontSize:14, lineHeight:1.7, color:'var(--ink)', whiteSpace:'pre-wrap'}}
                   onClick={(e)=>{
                     const t = e.target;
                     if (t && t.dataset && t.dataset.aid) setActive(t.dataset.aid);
                   }}
                   dangerouslySetInnerHTML={{__html: body}}/>
            </div>
            <div style={{textAlign:'center', marginTop:18, fontSize:11, color:'var(--ink-4)'}}>
              {Math.round(trace.asst.length/5)} tokens · model latency 1.42s · cost $0.0021
            </div>
          </div>
        </div>

        {/* margin notes */}
        <div style={{borderLeft:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0, background:'var(--paper)'}}>
          <div style={{padding:'14px 18px 8px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span className="eyebrow">Comments · {annotations.filter(a=>!a.resolved).length} open</span>
            <button className="btn ghost"><I.plus/></button>
          </div>
          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'4px 14px 14px', display:'flex', flexDirection:'column', gap:10}}>
            {annotations.map(a=>(
              <div key={a.id}
                   onClick={()=>setActive(a.id)}
                   className="card"
                   style={{padding:12, cursor:'pointer', opacity: a.resolved?0.55:1, borderColor: active===a.id?'var(--ink)':'var(--line)'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                  <Avatar name={a.who} size={20}/>
                  <span style={{fontSize:12, fontWeight:600}}>{a.who}</span>
                  <span style={{flex:1}}/>
                  {a.resolved && <span className="chip good">resolved</span>}
                </div>
                <div style={{fontSize:11.5, color:'var(--ink-4)', borderLeft:'2px solid var(--line)', paddingLeft:8, marginBottom:6, fontStyle:'italic'}}>
                  {a.start.replace(/\*\*/g,'').slice(0,40)}…
                </div>
                <div style={{fontSize:12.5, color:'var(--ink-2)', lineHeight:1.5}}>{a.text}</div>
                {!a.resolved && (
                  <div style={{display:'flex', gap:6, marginTop:10}}>
                    <button className="btn ghost" style={{fontSize:11, padding:'4px 8px'}}><I.check/>Resolve</button>
                    <button className="btn ghost" style={{fontSize:11, padding:'4px 8px'}}>Reply</button>
                  </div>
                )}
              </div>
            ))}
            <div className="card" style={{padding:12, borderStyle:'dashed', background:'var(--paper-2)'}}>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <Blob seed="ai-suggest" size={20}/>
                <span style={{fontSize:12, fontWeight:600}}>AI suggestion</span>
              </div>
              <div style={{fontSize:12.5, color:'var(--ink-2)', lineHeight:1.5, marginBottom:8}}>
                Two prior raters flagged "tone for patients" on similar traces. Consider lowering the Tone score from 4 to 3.
              </div>
              <div style={{display:'flex', gap:6}}>
                <button className="btn" style={{fontSize:11, padding:'4px 8px'}}>Apply</button>
                <button className="btn ghost" style={{fontSize:11, padding:'4px 8px'}}>Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Criterion({ title, type, v, onChange }){
  return (
    <div style={{display:'flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:8, background:'var(--paper-2)', border:'1px solid var(--line-2)'}}>
      <span style={{fontSize:11.5, color:'var(--ink-3)'}}>{title}</span>
      {type==='binary' ? (
        <div style={{display:'flex', gap:2}}>
          <BinBtn active={v==='pass'} good onClick={()=>onChange('pass')}><I.check/></BinBtn>
          <BinBtn active={v==='fail'} bad onClick={()=>onChange('fail')}><I.x/></BinBtn>
        </div>
      ) : (
        <div style={{display:'flex', gap:2}}>
          {[1,2,3,4,5].map(n=>(
            <button key={n} onClick={()=>onChange(n)}
              style={{ width:22, height:22, borderRadius:6, border:'1px solid var(--line)',
                background: v>=n? scaleColor(n) : 'var(--paper)',
                color: v>=n? 'white' : 'var(--ink-3)',
                fontSize:11, fontWeight:500, cursor:'pointer'}}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}
function BinBtn({ children, active, good, bad, onClick }){
  const bg = active ? (good?'var(--good)':'var(--bad)') : 'var(--paper)';
  const fg = active ? 'white' : 'var(--ink-3)';
  return <button onClick={onClick} style={{width:22, height:22, borderRadius:6, border:'1px solid var(--line)', background:bg, color:fg, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>{children}</button>;
}
function scaleColor(n){
  return ['oklch(0.7 0.18 25)','oklch(0.75 0.16 50)','oklch(0.8 0.14 90)','oklch(0.7 0.13 145)','oklch(0.6 0.15 160)'][n-1];
}

// ── Variation B: Shorts-style card stack ───────────────────────────────────
function FeedB(){
  const [idx, setIdx] = useS_fd(0);
  const [scores, setScores] = useS_fd({});

  const trace = TRACES[idx % TRACES.length];

  function rate(label){
    setScores(s=>({...s, [trace.id]: label}));
    setTimeout(()=>setIdx(i=>i+1), 280);
  }

  return (
    <div style={{width:'100%', height:'100%', display:'flex', background:'var(--paper-3)'}}>
      {/* faux phone-ish narrow column for swipe metaphor */}
      <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24, position:'relative', overflow:'hidden'}}>
        {/* ambient blob */}
        <div style={{position:'absolute', inset:0, pointerEvents:'none', opacity:0.18}}>
          <Blob seed={trace.id} size={520} style={{position:'absolute', top:'-15%', left:'-10%'}}/>
        </div>

        <div style={{width:380, height:'min(100%, 720px)', display:'flex', flexDirection:'column', gap:10, position:'relative', zIndex:1}}>
          {/* trace counter */}
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', color:'var(--ink-3)', fontSize:11}}>
            <span className="eyebrow">Pass 3 · trace {(idx%TRACES.length)+1} of {TRACES.length}</span>
            <span>{trace.tags.map(t=> <span key={t} className="chip" style={{marginLeft:4}}>{t}</span>)}</span>
          </div>

          {/* stack: behind cards peek out */}
          <div style={{position:'relative', flex:1, minHeight:0}}>
            {[2,1,0].map(off=>{
              const t = TRACES[(idx+off) % TRACES.length];
              const top = idx + off;
              const isTop = off===0;
              return (
                <div key={top} className="card" style={{
                  position:'absolute', inset:0,
                  transform: `translateY(${off*8}px) scale(${1 - off*0.025})`,
                  zIndex: 10-off,
                  boxShadow: isTop?'0 18px 48px oklch(0.2 0.02 270 / 0.18), 0 0 0 1px var(--line)':'var(--shadow-2)',
                  background:'var(--paper)',
                  display:'flex', flexDirection:'column',
                  borderRadius:'var(--r-xl)',
                  overflow:'hidden',
                }}>
                  {/* header */}
                  <div style={{padding:'14px 18px 10px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--line-2)'}}>
                    <Blob seed={t.id} size={24}/>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontWeight:600, fontSize:13}}>{t.id}</div>
                      <div style={{fontSize:11, color:'var(--ink-3)'}}>model · v2024-12-18</div>
                    </div>
                    <button className="btn ghost"><I.more/></button>
                  </div>
                  {/* body */}
                  <div className="scroll" style={{flex:1, overflowY:'auto', padding:'14px 18px', display:'flex', flexDirection:'column', gap:14}}>
                    <div>
                      <div className="eyebrow" style={{marginBottom:6, color:'var(--ink-4)'}}>USER</div>
                      <div style={{fontSize:13.5, color:'var(--ink-2)', lineHeight:1.55}}>{t.user}</div>
                    </div>
                    <div className="dotline"/>
                    <div>
                      <div className="eyebrow" style={{marginBottom:6, color:'var(--ink-4)'}}>MODEL</div>
                      <div style={{fontSize:13.5, color:'var(--ink)', lineHeight:1.6, whiteSpace:'pre-wrap'}}
                           dangerouslySetInnerHTML={{__html: t.asst.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}}/>
                    </div>
                  </div>
                  {/* swipe affordance — only on top card */}
                  {isTop && (
                    <div style={{padding:'12px 14px', borderTop:'1px solid var(--line-2)', display:'flex', gap:8, alignItems:'stretch', background:'var(--paper-2)'}}>
                      <SwipeBtn color="var(--bad)"  icon={<I.thumbD/>} label="Bad"   onClick={()=>rate('bad')}/>
                      <SwipeBtn color="var(--warn)" icon={<I.comment/>} label="Mixed" onClick={()=>rate('mixed')}/>
                      <SwipeBtn color="var(--good)" icon={<I.thumbU/>} label="Good"  onClick={()=>rate('good')}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* keyboard hints */}
          <div style={{display:'flex', justifyContent:'center', gap:14, fontSize:11, color:'var(--ink-4)'}}>
            <span><kbd style={kbd}>J</kbd> bad</span>
            <span><kbd style={kbd}>K</kbd> mixed</span>
            <span><kbd style={kbd}>L</kbd> good</span>
            <span><kbd style={kbd}>C</kbd> comment</span>
            <span><kbd style={kbd}>U</kbd> undo</span>
          </div>
        </div>
      </div>

      {/* sidekick column: fine-grained rubric & history */}
      <div style={{width:300, borderLeft:'1px solid var(--line)', background:'var(--paper)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'18px 18px 8px'}}>
          <div className="eyebrow">Quick rubric</div>
          <div style={{fontSize:12, color:'var(--ink-3)', marginTop:4}}>Use full rubric for traces flagged "mixed"</div>
        </div>
        <div className="scroll" style={{flex:1, overflowY:'auto', padding:'8px 18px 14px', display:'flex', flexDirection:'column', gap:10}}>
          {RUBRIC.slice(0,4).map(c=>(
            <div key={c.id} style={{padding:10, borderRadius:10, background:'var(--paper-2)'}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                <span style={{fontSize:12, fontWeight:500}}>{c.title}</span>
                <span className="eyebrow" style={{fontSize:9}}>{c.type}</span>
              </div>
              {c.type==='binary' ? (
                <div style={{display:'flex', gap:6}}>
                  <button className="btn" style={{flex:1, justifyContent:'center'}}><I.check/>Pass</button>
                  <button className="btn" style={{flex:1, justifyContent:'center'}}><I.x/>Fail</button>
                </div>
              ) : (
                <div style={{display:'flex', gap:4}}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} style={{flex:1, height:24, borderRadius:5, border:'1px solid var(--line)', background:'var(--paper)', cursor:'pointer', fontSize:11}}>{n}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="dotline" style={{margin:'4px 0'}}/>
          <div className="eyebrow">Recent ({Object.keys(scores).length})</div>
          {Object.entries(scores).slice(-5).reverse().map(([id, lab])=>(
            <div key={id} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
              <span className="mono" style={{color:'var(--ink-3)'}}>{id}</span>
              <span style={{flex:1}}/>
              <span className={`chip ${lab==='good'?'good':lab==='bad'?'bad':'warn'}`}>{lab}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const kbd = { fontFamily:'var(--mono)', fontSize:10, padding:'1px 5px', borderRadius:4, border:'1px solid var(--line)', background:'var(--paper)' };

function SwipeBtn({ color, icon, label, onClick }){
  return (
    <button onClick={onClick} style={{
      flex:1, padding:'10px 0', borderRadius:10, border:'1px solid var(--line)',
      background:'var(--paper)', cursor:'pointer',
      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
      color
    }}
    onMouseOver={e=>{ e.currentTarget.style.background = 'var(--paper-3)'; }}
    onMouseOut={e=>{ e.currentTarget.style.background = 'var(--paper)'; }}>
      <span style={{display:'inline-flex'}}>{icon}</span>
      <span style={{fontSize:11, color:'var(--ink-2)', fontWeight:500}}>{label}</span>
    </button>
  );
}

Object.assign(window, { FeedA, FeedB });
