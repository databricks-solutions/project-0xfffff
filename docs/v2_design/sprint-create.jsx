// JBW v2 — "Create sprint" view (recurring "push it forward" moment).
// Sprint = parameterized run of the convergence loop, snapshots workshop's
// current rubric+judge at start, emits new versions on completion.
// Three variations.

const { useState: useS_sc } = React;

// ── Variation A: "Mode-first" ──────────────────────────────────────────────
// Pick Eval mode (rubric per example) vs Judge tuning (global rubric);
// then a preset (bootstrap / harden / recurring) shapes the rest.
function SprintCreateA(){
  const [mode, setMode] = useS_sc('judge'); // 'eval' | 'judge'
  const [preset, setPreset] = useS_sc('harden');

  const presets = {
    bootstrap: { label:'Bootstrap',  blurb:'small N, max overlap, draft rubric',     n:15, k:4, irr:0.7,  align:0.7, time:'2h live'  },
    harden:    { label:'Harden',     blurb:'mid N, alignment focus',                 n:50, k:3, irr:0.75, align:0.8, time:'7d async' },
    recurring: { label:'Recurring',  blurb:'large N, drift detection',               n:120,k:2, irr:0.75, align:0.85,time:'14d async'},
  };
  const cfg = presets[preset];

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <SCHeader title="New sprint · support-agent-eval" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Save as draft</button>
          <button className="btn primary"><I.play/>Start sprint</button>
        </div>
      }/>

      <div className="scroll" style={{flex:1, overflowY:'auto', padding:'24px 32px 28px'}}>
        {/* mode selector */}
        <div style={{marginBottom:18}}>
          <div className="eyebrow" style={{marginBottom:10}}>WHAT KIND OF SPRINT?</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <ModeCard
              sel={mode==='eval'}
              onClick={()=>setMode('eval')}
              icon={<Blob seed="eval" size={26}/>}
              title="Eval mode"
              blurb="rubric tailored per example — for benchmark-style evaluation where each trace has its own pass/fail spec."
              foot="Outputs: per-example reference scores."
            />
            <ModeCard
              sel={mode==='judge'}
              onClick={()=>setMode('judge')}
              icon={<Blob seed="judge" size={26}/>}
              title="Judge tuning"
              blurb="global rubric applied to every trace — for retuning the judge model against drift."
              foot="Outputs: rubric vN+1, judge vN+1."
            />
          </div>
        </div>

        {/* preset */}
        <div style={{marginBottom:18}}>
          <div className="eyebrow" style={{marginBottom:10}}>PRESET</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
            {Object.entries(presets).map(([id,p])=>{
              const sel = preset===id;
              return (
                <button key={id} onClick={()=>setPreset(id)} className="card"
                  style={{textAlign:'left', padding:'12px 14px', cursor:'pointer',
                    background: sel?'var(--paper-2)':'var(--paper)',
                    borderColor: sel?'var(--ink)':'var(--line)', borderWidth: sel?2:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
                    <span style={{fontWeight:600}}>{p.label}</span>
                    {sel && <span className="chip accent" style={{padding:'1px 6px', fontSize:10}}>selected</span>}
                  </div>
                  <span style={{fontSize:11.5, color:'var(--ink-3)'}}>{p.blurb}</span>
                  <div style={{marginTop:8, display:'flex', gap:6, flexWrap:'wrap'}}>
                    <span className="chip" style={{padding:'1px 6px', fontSize:10}}>{p.n} traces</span>
                    <span className="chip" style={{padding:'1px 6px', fontSize:10}}>k={p.k}</span>
                    <span className="chip" style={{padding:'1px 6px', fontSize:10}}>{p.time}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* config rows */}
        <div className="card" style={{padding:'20px 22px'}}>
          <div style={{display:'grid', gridTemplateColumns:'180px 1fr', rowGap:18, columnGap:18, alignItems:'center'}}>
            <span className="eyebrow">SNAPSHOT AT START</span>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              <span className="chip"><Blob seed="rubric" size={14} subtle/>rubric v3 · 4 criteria</span>
              <span className="chip"><Blob seed="judge" size={14} subtle/>judge v2 · claude-haiku-4-5</span>
              <span style={{fontSize:11, color:'var(--ink-4)', alignSelf:'center'}}>(read-only — promoted at sprint end)</span>
            </div>

            <span className="eyebrow">TRACES</span>
            <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <span className="tnum" style={{fontSize:18, fontWeight:600}}>{cfg.n}</span>
              <span style={{color:'var(--ink-3)'}}>traces · stratified by</span>
              <span className="chip">{preset==='bootstrap'?'topic-balanced':'disagreement+drift'}</span>
              <span style={{flex:1}}/>
              <button className="btn ghost"><I.spark/>Open Trace Funnel →</button>
            </div>

            <span className="eyebrow">PARTICIPANTS</span>
            <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
              {['Alice Chen','Bo Tanaka','Carla Mendes'].map(n=>(
                <span key={n} className="chip" style={{padding:'3px 8px'}}><Avatar name={n} size={14}/>{n}</span>
              ))}
              <span className="chip" style={{padding:'3px 8px', borderStyle:'dashed'}}><I.plus/>Add SME</span>
              <span style={{fontSize:11, color:'var(--ink-4)', marginLeft:8}}>k={cfg.k} raters per trace</span>
            </div>

            <span className="eyebrow">CONVERGENCE TARGETS</span>
            <div style={{display:'flex', gap:18, alignItems:'center'}}>
              <Target label="IRR (κ)" v={cfg.irr}/>
              <Target label="Judge alignment" v={cfg.align}/>
              <Target label="M-consecutive" v="3" raw/>
              <span style={{flex:1}}/>
              <button className="btn ghost" style={{fontSize:11}}>Advanced</button>
            </div>

            <span className="eyebrow">TIMEBOX</span>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <span style={{fontSize:14, fontWeight:600}}>{cfg.time}</span>
              <span style={{color:'var(--ink-3)'}}>· hard end</span>
              <span style={{flex:1}}/>
              <span className="chip">auto-pause if convergence hit early</span>
            </div>

            <span className="eyebrow">ON COMPLETION</span>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              <span className="chip accent">refine rubric on disagreement</span>
              <span className="chip accent">retune judge on divergence</span>
              <span className="chip">promote new versions to workshop</span>
            </div>
          </div>
        </div>

        {/* sprint-as-loop diagram */}
        <div style={{marginTop:18, padding:'16px 20px', background:'var(--paper-2)', borderRadius:'var(--r-lg)', border:'1px dashed var(--line)'}}>
          <div className="eyebrow" style={{marginBottom:10}}>THE LOOP</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr) auto', alignItems:'center', gap:10, fontSize:12}}>
            {[
              {l:'SMEs grade', s:`${cfg.n} traces · k=${cfg.k}`},
              {l:'Judge grades', s:'same traces'},
              {l:'Refine rubric', s:'where humans disagree'},
              {l:'Retune judge', s:'where judge diverges'},
            ].map((s,i)=>(
              <React.Fragment key={s.l}>
                <div style={{display:'flex', flexDirection:'column', gap:2, padding:'10px 12px', background:'var(--paper)', borderRadius:8, border:'1px solid var(--line-2)'}}>
                  <span style={{fontWeight:600}}>{s.l}</span>
                  <span style={{fontSize:10.5, color:'var(--ink-3)'}}>{s.s}</span>
                </div>
                {i<3 && <I.chev/>}
              </React.Fragment>
            ))}
            <div style={{textAlign:'right', fontSize:11, color:'var(--ink-3)', alignSelf:'center'}}>
              loops until {(cfg.irr*100)|0}% κ +<br/>{(cfg.align*100)|0}% align
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ sel, onClick, icon, title, blurb, foot }){
  return (
    <button onClick={onClick} className="card"
      style={{textAlign:'left', padding:'16px 18px', cursor:'pointer',
        background: sel?'var(--paper-2)':'var(--paper)',
        borderColor: sel?'var(--ink)':'var(--line)', borderWidth: sel?2:1,
        display:'flex', flexDirection:'column', gap:10}}>
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        {icon}
        <span className="serif" style={{fontSize:18, fontWeight:600, letterSpacing:'-0.005em'}}>{title}</span>
        {sel && <span className="chip accent" style={{padding:'1px 6px', fontSize:10, marginLeft:'auto'}}>selected</span>}
      </div>
      <span style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.5}}>{blurb}</span>
      <span className="eyebrow" style={{fontSize:9.5}}>{foot}</span>
    </button>
  );
}

function Target({ label, v, raw }){
  const pct = raw ? null : Math.round(v*100);
  return (
    <div style={{display:'flex', flexDirection:'column', gap:4, minWidth:120}}>
      <div className="eyebrow" style={{fontSize:9.5}}>{label}</div>
      <div style={{display:'flex', alignItems:'baseline', gap:6}}>
        <span className="tnum" style={{fontSize:20, fontWeight:600}}>{raw ? v : v.toFixed(2)}</span>
        {!raw && <span style={{fontSize:11, color:'var(--ink-3)'}}>· target {pct}%</span>}
      </div>
      {!raw && (
        <div style={{height:4, background:'var(--line-2)', borderRadius:2, overflow:'hidden'}}>
          <div style={{height:'100%', width:`${pct}%`, background:'var(--accent)'}}/>
        </div>
      )}
    </div>
  );
}

function SCHeader({ title, right }){
  return (
    <div style={{padding:'14px 24px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--ink-3)'}}>
        <span>JBW</span><I.chev/>
        <span>support-agent-eval</span><I.chev/>
        <span style={{color:'var(--ink)', fontWeight:600}}>{title}</span>
      </div>
      {right}
    </div>
  );
}

// ── Variation B: "Targets-first dial" ──────────────────────────────────────
// Set the convergence outcomes you want; system reverse-engineers N traces,
// overlap, timebox.
function SprintCreateB(){
  const [irr, setIrr] = useS_sc(0.75);
  const [align, setAlign] = useS_sc(0.80);
  const [confidence, setConfidence] = useS_sc(0.90);

  // toy reverse engineering
  const n = Math.round(40 + (irr-0.6)*120 + (align-0.7)*60 + (confidence-0.8)*100);
  const k = irr>=0.8 ? 3 : 2;
  const days = Math.max(1, Math.round(n / 10));

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <SCHeader title="New sprint · targets-first" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Switch to manual</button>
          <button className="btn primary"><I.play/>Start sprint</button>
        </div>
      }/>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'1fr 1.1fr', minHeight:0}}>
        {/* targets */}
        <div style={{padding:'30px 36px 24px', display:'flex', flexDirection:'column', gap:24, borderRight:'1px solid var(--line)'}}>
          <div>
            <div className="eyebrow" style={{marginBottom:8}}>SET YOUR OUTCOMES</div>
            <div className="serif" style={{fontSize:28, fontWeight:500, letterSpacing:'-0.01em', lineHeight:1.1}}>
              Tell me where you need to land. I'll size the sprint to get there.
            </div>
          </div>

          <Dial label="Inter-rater agreement (κ)" sub="how aligned humans are with each other" v={irr} setV={setIrr} min={0.5} max={0.95}/>
          <Dial label="Judge alignment" sub="judge model vs. consensus human grade" v={align} setV={setAlign} min={0.5} max={0.95}/>
          <Dial label="Confidence in result" sub="how sure you want to be the targets actually held" v={confidence} setV={setConfidence} min={0.7} max={0.99}/>

          <div style={{padding:'12px 14px', background:'var(--paper-2)', borderRadius:'var(--r)', fontSize:11.5, color:'var(--ink-3)', lineHeight:1.5}}>
            Targets above 0.85 require larger N and more rater overlap. We'll cap at the workshop's available SMEs and trace pool.
          </div>
        </div>

        {/* implied plan */}
        <div className="scroll" style={{overflowY:'auto', padding:'30px 36px 32px', background:'var(--paper-2)'}}>
          <div className="eyebrow" style={{marginBottom:8}}>WE'LL RUN</div>
          <div className="serif" style={{fontSize:36, fontWeight:500, letterSpacing:'-0.015em', lineHeight:1.05}}>
            <span className="tnum">{n}</span> traces · <span className="tnum">{k}</span> raters each
            <div style={{fontSize:18, color:'var(--ink-3)', fontWeight:400, marginTop:6}}>≈ {days} day{days>1?'s':''} async, ending at convergence or hard timebox.</div>
          </div>

          <div style={{marginTop:22, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <PlanCell label="Trace sample" v={`${n}`} sub="stratified by topic + drift"/>
            <PlanCell label="Per-trace overlap" v={`k = ${k}`} sub={k===3?'high — supports IRR≥0.8':'standard'}/>
            <PlanCell label="Timebox" v={`${days}d`} sub="hard end · auto-stops on convergence"/>
            <PlanCell label="M-consecutive" v="3" sub="3 batches in a row passing → done"/>
            <PlanCell label="Rubric snapshot" v="v3" sub="4 criteria · refines on disagreement"/>
            <PlanCell label="Judge snapshot" v="v2" sub="claude-haiku · retunes on divergence"/>
          </div>

          <div className="dotline" style={{margin:'20px 0'}}/>

          <div className="eyebrow" style={{marginBottom:8}}>WHY THIS SIZING</div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <Reason
              label="Larger N"
              cause={`κ target ${irr.toFixed(2)} + confidence ${(confidence*100)|0}%`}
              effect={`+${Math.round((n-50))} traces vs. baseline 50`}/>
            <Reason
              label="More overlap"
              cause={`κ ≥ 0.8 needs k ≥ 3 to estimate reliably`}
              effect={`k=${k} raters per trace`}/>
            <Reason
              label="Async timebox"
              cause={`${n} traces > 30 → exceeds a single live session`}
              effect={`${days}-day async window`}/>
          </div>

          <div style={{marginTop:22, padding:'14px 16px', background:'var(--paper)', borderRadius:'var(--r-lg)', border:'1px solid var(--line)', display:'flex', gap:14, alignItems:'center'}}>
            <Blob seed={`sprint-${n}`} size={36}/>
            <div style={{flex:1}}>
              <div style={{fontWeight:600}}>Sprint #4 · push-toward-{(align*100)|0}%-align</div>
              <div style={{fontSize:11.5, color:'var(--ink-3)'}}>preview name · editable on the next screen</div>
            </div>
            <button className="btn"><I.spark/>Tweak sample</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dial({ label, sub, v, setV, min, max }){
  const pct = Math.round(v*100);
  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
        <div>
          <div style={{fontSize:13, fontWeight:600}}>{label}</div>
          <div style={{fontSize:11, color:'var(--ink-3)'}}>{sub}</div>
        </div>
        <span className="tnum" style={{fontSize:24, fontWeight:600}}>{v.toFixed(2)}</span>
      </div>
      <input type="range" min={min*100} max={max*100} value={pct}
        onChange={e=>setV(Number(e.target.value)/100)}
        style={{width:'100%'}}/>
      <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--ink-4)', marginTop:2}}>
        <span>{min.toFixed(2)}</span><span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function PlanCell({ label, v, sub }){
  return (
    <div style={{padding:'12px 14px', background:'var(--paper)', borderRadius:'var(--r)', border:'1px solid var(--line-2)'}}>
      <div className="eyebrow" style={{fontSize:9.5, marginBottom:4}}>{label}</div>
      <div className="tnum" style={{fontSize:18, fontWeight:600}}>{v}</div>
      <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
    </div>
  );
}

function Reason({ label, cause, effect }){
  return (
    <div style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center', padding:'8px 10px', background:'var(--paper)', borderRadius:6, border:'1px solid var(--line-2)'}}>
      <span className="chip accent" style={{padding:'2px 8px'}}>{label}</span>
      <span style={{fontSize:12, color:'var(--ink-3)'}}>{cause}</span>
      <span className="tnum" style={{fontSize:11.5, fontWeight:600, color:'var(--ink)'}}>{effect}</span>
    </div>
  );
}

// ── Variation C: "Diff from last" — recurring case ─────────────────────────
// Most sprints aren't bootstrapping. Show last sprint's outcome, propose
// "same plan + these 3 changes" — and emphasize how the trace pool prior
// updates as we accumulate ratings.
function SprintCreateC(){
  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <SCHeader title="New sprint · sprint #4" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Edit plan</button>
          <button className="btn primary"><I.play/>Start sprint #4</button>
        </div>
      }/>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'1fr 1fr', minHeight:0}}>
        {/* last sprint */}
        <div style={{padding:'24px 28px 22px', borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column', gap:14, minHeight:0, background:'var(--paper-2)'}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span className="eyebrow">LAST SPRINT</span>
            <span className="chip good"><I.check/>converged</span>
          </div>
          <div className="serif" style={{fontSize:22, fontWeight:500, letterSpacing:'-0.005em', lineHeight:1.2}}>
            Sprint #3 · harden · 50 traces · 7d
          </div>

          <div className="card" style={{padding:'14px 16px'}}>
            <div className="eyebrow" style={{marginBottom:8}}>OUTCOMES</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
              <Outcome label="κ achieved" v="0.78" target="0.75" good/>
              <Outcome label="Judge align" v="0.82" target="0.80" good/>
              <Outcome label="Refinements" v="2 criteria" target="" good/>
              <Outcome label="Judge retunes" v="1" target="" good/>
            </div>
          </div>

          <div className="card" style={{padding:'14px 16px'}}>
            <div className="eyebrow" style={{marginBottom:6}}>WHAT EMERGED</div>
            <ul style={{margin:0, padding:'0 0 0 16px', fontSize:12, color:'var(--ink-2)', lineHeight:1.6}}>
              <li>Tone criterion split into "warmth" vs "clarity" — humans disagreed when bundled.</li>
              <li>Judge over-rewards apologetic phrasing; prompt updated to require concrete next steps.</li>
              <li>Card-disputes topic under-sampled vs. prod (8% in pool, 14% in support tickets).</li>
            </ul>
          </div>

          <div className="card" style={{padding:'14px 16px'}}>
            <div className="eyebrow" style={{marginBottom:8}}>VERSION LINEAGE</div>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
              <span className="mono chip">rubric v2</span><I.chev/>
              <span className="mono chip">v3 (refined)</span>
              <span style={{color:'var(--ink-4)', marginLeft:'auto', fontSize:11}}>now current</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12, marginTop:6}}>
              <span className="mono chip">judge v1</span><I.chev/>
              <span className="mono chip">v2 (retuned)</span>
              <span style={{color:'var(--ink-4)', marginLeft:'auto', fontSize:11}}>now current</span>
            </div>
          </div>
        </div>

        {/* this sprint */}
        <div className="scroll" style={{overflowY:'auto', padding:'24px 28px 32px', display:'flex', flexDirection:'column', gap:14, minHeight:0}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span className="eyebrow">THIS SPRINT · PROPOSED</span>
            <span className="chip accent"><I.spark/>3 changes from #3</span>
          </div>
          <div className="serif" style={{fontSize:22, fontWeight:500, letterSpacing:'-0.005em', lineHeight:1.2}}>
            Same harden plan, with the things that came up.
          </div>

          {/* changes */}
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <Change
              kind="rubric"
              before={`4 criteria · "Tone" bundled`}
              after={`5 criteria · "Tone → Warmth + Clarity"`}
              why="humans disagreed on bundled criterion"
              auto/>
            <Change
              kind="judge"
              before={`v2 prompt · rewards apology`}
              after={`v2 prompt · requires next steps`}
              why="judge over-rewarded apologetic phrasing"
              auto/>
            <Change
              kind="pool"
              before={`50 traces · topic-balanced`}
              after={`50 traces · oversample card-disputes (+6pp)`}
              why="under-sampled vs. prod in #3"/>
            <Change
              kind="targets"
              before={`κ ≥ 0.75 · align ≥ 0.80`}
              after={`κ ≥ 0.78 · align ≥ 0.85`}
              why="raised to match #3 outcome — push further"
              optional/>
          </div>

          {/* trace prior viz */}
          <div className="card" style={{padding:'14px 16px'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
              <div className="eyebrow">TRACE POOL PRIOR · UPDATING</div>
              <span style={{fontSize:11, color:'var(--ink-3)'}}>3 sprints · 165 graded traces</span>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {[
                {n:'billing',     prev:28, next:25},
                {n:'transfers',   prev:24, next:22},
                {n:'login/auth',  prev:16, next:15},
                {n:'card disputes', prev:8,  next:14},
                {n:'investments', prev:14, next:14},
                {n:'other',       prev:10, next:10},
              ].map(t=>(
                <div key={t.n} style={{display:'grid', gridTemplateColumns:'110px 1fr 1fr 60px', alignItems:'center', gap:10, fontSize:12}}>
                  <span style={{color:'var(--ink-3)'}}>{t.n}</span>
                  <div style={{height:6, background:'var(--line-2)', borderRadius:2, overflow:'hidden'}}>
                    <div style={{height:'100%', width:`${t.prev*3}%`, background:'var(--ink-4)'}}/>
                  </div>
                  <div style={{height:6, background:'var(--line-2)', borderRadius:2, overflow:'hidden'}}>
                    <div style={{height:'100%', width:`${t.next*3}%`, background:'var(--accent)'}}/>
                  </div>
                  <span className="tnum" style={{fontSize:10.5, color: t.next!==t.prev?'var(--accent)':'var(--ink-3)', textAlign:'right'}}>
                    {t.next>t.prev?'+':''}{t.next-t.prev}pp
                  </span>
                </div>
              ))}
            </div>
            <div className="dotline" style={{margin:'10px 0'}}/>
            <div style={{display:'flex', alignItems:'center', gap:14, fontSize:11}}>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:6, background:'var(--ink-4)', borderRadius:2, display:'inline-block'}}/><span style={{color:'var(--ink-3)'}}>prev sprint pool</span></span>
              <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:10, height:6, background:'var(--accent)', borderRadius:2, display:'inline-block'}}/><span style={{color:'var(--ink-3)'}}>this sprint (updated)</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Outcome({ label, v, target, good }){
  return (
    <div>
      <div className="eyebrow" style={{fontSize:9.5, marginBottom:3}}>{label}</div>
      <div style={{display:'flex', alignItems:'baseline', gap:6}}>
        <span className="tnum" style={{fontSize:20, fontWeight:600, color: good?'var(--good)':'var(--ink)'}}>{v}</span>
        {target && <span style={{fontSize:11, color:'var(--ink-4)'}}>· tgt {target}</span>}
      </div>
    </div>
  );
}

function Change({ kind, before, after, why, auto, optional }){
  const tags = {
    rubric: { color:'var(--accent)', label:'rubric' },
    judge:  { color:'var(--violet)', label:'judge' },
    pool:   { color:'var(--cyan)',   label:'pool' },
    targets:{ color:'var(--warn)',   label:'targets' },
  }[kind];
  return (
    <div className="card" style={{padding:'12px 14px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'center'}}>
      <span className="chip" style={{padding:'3px 9px', borderColor:tags.color, color:tags.color, background:'transparent'}}>{tags.label}</span>
      <div style={{minWidth:0}}>
        <div style={{display:'flex', gap:8, alignItems:'center', fontSize:12, color:'var(--ink-3)'}}>
          <span style={{textDecoration:'line-through', color:'var(--ink-4)'}}>{before}</span>
          <I.chev/>
          <span style={{color:'var(--ink)', fontWeight:500}}>{after}</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:3}}>{why}</div>
      </div>
      <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
        {auto && <span className="chip accent" style={{padding:'1px 6px', fontSize:9.5}}><I.spark/>auto</span>}
        {optional && <span className="chip" style={{padding:'1px 6px', fontSize:9.5}}>optional</span>}
        <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>edit</button>
      </div>
    </div>
  );
}

Object.assign(window, { SprintCreateA, SprintCreateB, SprintCreateC });
