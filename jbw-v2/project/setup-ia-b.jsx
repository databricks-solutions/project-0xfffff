// JBW v2 — Setup IA · Variation B: WORKFLOW SHELL.
//
// "Setup has its own shell — a sequence of stations over the same durable
// settings. Each station opens the corresponding Project settings panel
// in-place. After completion, the shell becomes the Sprint launcher
// (sprint creation is the same workflow shape, against existing artifacts).
//
// Differs from A in that Setup is the foreground: a horizontal stations
// rail rather than a left-side mini progress widget; a 'workflow canvas'
// in the center showing one station at a time, with prereq edges drawn
// inline above each station.

const { useState: useS_setupB } = React;

function SetupB(){
  const [station, setStation] = useS_setupB('rubric');
  const cur = ARTIFACTS.find(a=>a.id===station) || ARTIFACTS[2];
  const idx = ARTIFACTS.indexOf(cur);

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper-2)', fontSize:13}}>
      <SetupHeader kind="Setup workflow" right={
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{fontSize:11, color:'var(--ink-3)'}}>{PROGRESS.done} of {PROGRESS.total} configured</span>
          <button className="btn ghost" style={{padding:'4px 8px'}}>Settings ↗</button>
          <button className="btn primary" disabled style={{opacity:0.5}}>Launch first sprint</button>
        </div>
      }/>

      {/* Title row */}
      <div style={{padding:'22px 36px 10px', background:'var(--paper)', borderBottom:'1px solid var(--line)'}}>
        <div className="eyebrow" style={{marginBottom:6}}>FIRST-RUN · GET THIS PROJECT OPERATIONAL</div>
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:24}}>
          <div className="serif" style={{fontSize:30, fontWeight:500, letterSpacing:'-0.01em', lineHeight:1.1, maxWidth:760}}>
            Configure the seven things this project owns. Each becomes a Project setting you can revisit later.
          </div>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <ProgressRing pct={PROGRESS.pct} size={56}/>
            <div>
              <div style={{fontSize:12, color:'var(--ink-3)'}}>est. 6 min remaining</div>
              <div style={{fontSize:12, color:'var(--ink-3)'}}>1 task blocked behind <strong style={{color:'var(--ink)'}}>Rubric</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* Stations rail with prereq edges */}
      <div style={{padding:'30px 36px 18px', borderBottom:'1px solid var(--line)', background:'var(--paper)', position:'relative'}}>
        <StationsRail current={station} onPick={setStation}/>
      </div>

      {/* Station body */}
      <div className="scroll" style={{flex:1, overflowY:'auto', padding:'22px 36px 28px'}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:18, alignItems:'flex-start'}}>
          <div className="card" style={{padding:0, overflow:'hidden'}}>
            <div style={{padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--line-2)', background:'var(--paper-2)'}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <span style={{
                  width:28, height:28, borderRadius:14,
                  background:'var(--ink)', color:'var(--paper)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:600, fontFamily:'var(--mono)'
                }}>{idx+1}</span>
                <div>
                  <div style={{fontSize:15, fontWeight:600}}>{cur.label}</div>
                  <div style={{fontSize:11, color:'var(--ink-3)'}}>Step {idx+1} of {ARTIFACTS.length} · also lives at <span className="mono">Settings → {cur.label}</span></div>
                </div>
              </div>
              <StatePill state={cur.state}/>
            </div>
            <div style={{padding:'14px 0 18px'}}>
              <SettingsBody artifact={cur}/>
            </div>
            <div style={{padding:'14px 20px', borderTop:'1px solid var(--line-2)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper-2)'}}>
              <button className="btn" disabled={idx===0} onClick={()=>setStation(ARTIFACTS[Math.max(0,idx-1)].id)}>← Back</button>
              <span style={{fontSize:11, color:'var(--ink-3)'}}>autosave · changes apply to <span className="mono">v0</span></span>
              <button className="btn primary" onClick={()=>setStation(ARTIFACTS[Math.min(ARTIFACTS.length-1,idx+1)].id)}>
                <I.check/>Save & continue →
              </button>
            </div>
          </div>

          {/* Side: workflow guidance, sibling-workflow callout */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <div className="card" style={{padding:'14px 16px'}}>
              <div className="eyebrow" style={{marginBottom:8}}>UNLOCKED BY THIS</div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {ARTIFACTS.filter(a=>a.blocks.includes(cur.id)).map(a=>(
                  <div key={a.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:8, padding:'8px 10px', background:'var(--paper-2)', borderRadius:6}}>
                    <Dot color={STATE_TONE[a.state].dot}/>
                    <span style={{fontSize:12}}>{a.label}</span>
                    <span className="mono" style={{fontSize:10, color:'var(--ink-4)'}}>step {ARTIFACTS.indexOf(a)+1}</span>
                  </div>
                ))}
                {ARTIFACTS.filter(a=>a.blocks.includes(cur.id)).length===0 && (
                  <span style={{fontSize:11.5, color:'var(--ink-3)'}}>nothing depends on this — it's terminal.</span>
                )}
              </div>
            </div>
            <div className="card" style={{padding:'14px 16px'}}>
              <div className="eyebrow" style={{marginBottom:8}}>WHY A WORKFLOW?</div>
              <div style={{fontSize:12, color:'var(--ink-3)', lineHeight:1.55}}>
                <strong style={{color:'var(--ink-2)'}}>Setup</strong> is a guided sequence over the same artifacts you'll keep editing in <strong style={{color:'var(--ink-2)'}}>Project settings</strong>. Once configured, this shell collapses; you'll only see it again when you create a new sprint — which is the same shape, against existing artifacts.
              </div>
            </div>
            <div className="card" style={{padding:'14px 16px', background:'oklch(0.97 0.04 268)', borderColor:'oklch(0.85 0.08 268)'}}>
              <div className="eyebrow" style={{marginBottom:6, color:'oklch(0.4 0.15 268)'}}>SAME PATTERN, NEXT TIME</div>
              <div style={{fontSize:12, color:'oklch(0.3 0.12 268)', lineHeight:1.55}}>
                <strong>Sprint creation</strong> uses this exact shell — but the stations are <em>read-only artifacts</em> (rubric vN, judge vN, pool) plus the things that actually vary per sprint (sample, k, timebox). Setup ≈ a sprint that creates the artifacts.
              </div>
            </div>
          </div>
        </div>

        {/* Hand-off footer once everything is configured */}
        <div style={{marginTop:18, padding:'16px 20px', background:'var(--paper)', borderRadius:'var(--r-lg)', border:'1px dashed var(--line)', display:'flex', alignItems:'center', gap:14}}>
          <Blob seed="handoff" size={36}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:600}}>When the rail is green: this shell becomes the Sprint launcher.</div>
            <div style={{fontSize:12, color:'var(--ink-3)'}}>same stations, but each is now an artifact-version selector (rubric vN, judge vN, pool prior). Sprint defaults stays editable.</div>
          </div>
          <button className="btn" disabled style={{opacity:0.5}}>Open sprint launcher →</button>
        </div>
      </div>
    </div>
  );
}

function StationsRail({ current, onPick }){
  // Render stations horizontally; draw subtle prereq curves above the rail
  // for any blocked station.
  return (
    <div style={{position:'relative'}}>
      {/* Prereq edges layer */}
      <svg style={{position:'absolute', left:0, top:0, width:'100%', height:36, pointerEvents:'none', overflow:'visible'}} preserveAspectRatio="none">
        {ARTIFACTS.map((a, i)=>{
          if (a.blocks.length===0) return null;
          return a.blocks.map(bId=>{
            const j = ARTIFACTS.findIndex(x=>x.id===bId);
            if (j<0) return null;
            const x1 = `${(j+0.5) * (100/ARTIFACTS.length)}%`;
            const x2 = `${(i+0.5) * (100/ARTIFACTS.length)}%`;
            return <path key={`${a.id}-${bId}`} d={`M ${x1} 30 C ${x1} 6, ${x2} 6, ${x2} 30`}
              stroke="var(--line)" strokeWidth="1" fill="none" strokeDasharray="3 3"/>;
          });
        })}
      </svg>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${ARTIFACTS.length}, 1fr)`, gap:10, paddingTop:36}}>
        {ARTIFACTS.map((a,i)=>{
          const sel = a.id===current;
          const tone = STATE_TONE[a.state];
          const blocked = a.state==='blocked';
          return (
            <button key={a.id} onClick={()=>!blocked && onPick(a.id)} disabled={blocked}
              style={{textAlign:'left', padding:'10px 12px', borderRadius:8,
                border: sel?'1.5px solid var(--ink)':'1px solid var(--line)',
                background: sel?'var(--paper)': a.state==='done'?'var(--paper-2)':'var(--paper)',
                opacity: blocked?0.6:1,
                cursor: blocked?'not-allowed':'pointer',
                display:'flex', flexDirection:'column', gap:6, position:'relative'}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{
                  width:18, height:18, borderRadius:9,
                  background: a.state==='done'?'var(--good)': a.state==='active'?'var(--accent)':'var(--paper-3)',
                  color: (a.state==='done'||a.state==='active')?'var(--paper)':'var(--ink-3)',
                  border: '1px solid var(--line)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600
                }}>
                  {a.state==='done' ? <I.check/> : i+1}
                </span>
                <span style={{fontSize:11.5, fontWeight: sel?600:500}}>{a.label}</span>
                {blocked && <span style={{marginLeft:'auto', fontSize:10}}>🔒</span>}
              </div>
              <span style={{fontSize:10, color:'var(--ink-4)', lineHeight:1.35}}>{tone.label}{blocked && a.blocks.length ? ` · needs ${a.blocks.map(b=>ARTIFACTS.find(x=>x.id===b).label.split(' ')[0]).join('+')}` : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { SetupB });
