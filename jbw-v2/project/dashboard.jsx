// JBW v2 — Facilitator dashboard variations.
// Two takes on "the orchestration view a facilitator stares at during a session."

const { useState: useS_db, useEffect: useE_db, useMemo: useM_db } = React;

// shared atoms (dashboard-scoped) -------------------------------------------
function StatPill({ label, value, sub, accent }){
  return (
    <div style={{display:'flex', flexDirection:'column', gap:2, padding:'10px 14px', borderRight:'1px solid var(--line)'}}>
      <span className="eyebrow">{label}</span>
      <span style={{display:'flex', alignItems:'baseline', gap:6}}>
        <span className="tnum" style={{fontSize:22, fontWeight:600, letterSpacing:'-0.01em', color: accent || 'var(--ink)'}}>{value}</span>
        {sub && <span style={{fontSize:11, color:'var(--ink-3)'}}>{sub}</span>}
      </span>
    </div>
  );
}

function Sparkline({ values, w=80, h=22, color='var(--ink-2)' }){
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v,i)=>[ (i/(values.length-1))*w, h - ((v-min)/span)*h ]);
  const d = 'M ' + pts.map(p=>p.join(',')).join(' L ');
  return <svg width={w} height={h}><path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>;
}

// ── Variation A: "Session Cockpit" ─────────────────────────────────────────
// Live session console — panel of running raters on the left, the current
// trace in the middle, and a live signal column on the right.
function DashboardA(){
  const [tab, setTab] = useS_db('raters');
  const session = {
    title: 'Clinical advice — pass 3 (warfarin focus)',
    started: '34m',
    target: 80,
    completed: 47,
    inProgress: 6,
    queued: 27,
  };

  const raters = [
    {name:'Alice Chen', state:'rating',   trace:'tr_82af', dwell:'1m 12s', count:14, sig:[8,9,7,11,9,12,10]},
    {name:'Bo Tanaka',  state:'rating',   trace:'tr_91ce', dwell:'42s',    count:11, sig:[6,7,9,8,10,9,11]},
    {name:'Carla Mendes',state:'comment', trace:'tr_82af', dwell:'3m 04s', count:9,  sig:[5,6,5,7,8,7,8]},
    {name:'Devon Park', state:'idle',     trace:'—',       dwell:'—',      count:8,  sig:[9,8,9,7,6,5,4]},
    {name:'Eli Rao',    state:'rating',   trace:'tr_4b07', dwell:'18s',    count:6,  sig:[3,4,5,6,7,7,8]},
    {name:'Faye Olsen', state:'reading',  trace:'tr_4b07', dwell:'22s',    count:9,  sig:[7,7,8,9,9,10,11]},
  ];

  const stateColor = {
    rating:  'var(--good)',
    comment: 'var(--accent)',
    reading: 'var(--ink-3)',
    idle:    'var(--ink-4)',
  };

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper-2)', fontSize:13}}>
      {/* topbar */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <Blob seed="warfarin" size={28} />
          <div>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={{fontWeight:600}}>{session.title}</span>
              <span className="chip good"><Dot color="var(--good)"/>Live · {session.started}</span>
            </div>
            <div className="eyebrow" style={{marginTop:3}}>Project · JBW · Healthcare-A · Session #4012</div>
          </div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn"><I.spark/>Insights</button>
          <button className="btn"><I.diff/>Diff to pass 2</button>
          <button className="btn primary"><I.plus/>Add trace</button>
        </div>
      </div>

      {/* stat strip */}
      <div style={{display:'flex', alignItems:'stretch', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <StatPill label="Completed" value={`${session.completed}`} sub={`/ ${session.target}`}/>
        <StatPill label="In progress" value={session.inProgress} accent="var(--accent)"/>
        <StatPill label="Queued" value={session.queued}/>
        <StatPill label="IRR (Cohen κ)" value="0.71" sub="↑ 0.04"/>
        <StatPill label="Median time" value="2:48" sub="per trace"/>
        <StatPill label="Disagreements" value="9" sub="3 unresolved" accent="var(--bad)"/>
        <div style={{flex:1, padding:'10px 14px', display:'flex', flexDirection:'column', gap:4, justifyContent:'center'}}>
          <span className="eyebrow">Throughput · last 30m</span>
          <Sparkline values={[2,4,3,6,5,7,6,8,9,7,10,12,11,13]} w={300} h={22} color="var(--accent)"/>
        </div>
      </div>

      {/* body */}
      <div style={{flex:1, display:'grid', gridTemplateColumns:'320px 1fr 360px', minHeight:0}}>
        {/* left rail: switchable raters / queue */}
        <div style={{borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'12px 12px 0', display:'flex', gap:2}}>
            {[
              {id:'raters', label:`Raters · 6`},
              {id:'queue',  label:`Queue · 27`},
              {id:'why',    label:`Why these?`},
            ].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className="btn ghost"
                style={{
                  padding:'6px 10px', fontSize:11.5, borderRadius:6,
                  background: tab===t.id?'var(--paper-3)':'transparent',
                  color: tab===t.id?'var(--ink)':'var(--ink-3)',
                  fontWeight: tab===t.id?600:400,
                }}>{t.label}</button>
            ))}
          </div>
          <div className="dotline" style={{margin:'10px 12px 0'}}/>
          {tab==='raters' && (
          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'8px 12px 12px'}}>
            {raters.map(r=>(
              <div key={r.name} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center', padding:'10px 8px', borderRadius:8, marginBottom:2}}
                   onMouseOver={e=>e.currentTarget.style.background='var(--paper-3)'}
                   onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                <div style={{position:'relative'}}>
                  <Avatar name={r.name} size={28}/>
                  <span style={{position:'absolute', right:-1, bottom:-1, width:9, height:9, borderRadius:999, background:stateColor[r.state], border:'2px solid var(--paper)'}}/>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, fontWeight:500, fontSize:12.5}}>
                    {r.name}
                  </div>
                  <div style={{fontSize:11, color:'var(--ink-3)', display:'flex', gap:6, alignItems:'center'}}>
                    <span style={{textTransform:'capitalize'}}>{r.state}</span>
                    <span>·</span>
                    <span className="mono">{r.trace}</span>
                    <span>·</span>
                    <span>{r.dwell}</span>
                  </div>
                </div>
                <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3}}>
                  <Sparkline values={r.sig} w={48} h={14} color={stateColor[r.state]}/>
                  <span className="tnum" style={{fontSize:10, color:'var(--ink-3)'}}>{r.count} done</span>
                </div>
              </div>
            ))}
          </div>
          )}
          {tab==='raters' && (
          <div style={{borderTop:'1px solid var(--line)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper-2)'}}>
            <span className="eyebrow">Auto-assign</span>
            <span className="chip accent"><Dot color="var(--accent)"/>balancing load</span>
          </div>
          )}
          {tab==='queue' && (
            <div className="scroll" style={{flex:1, overflowY:'auto', padding:'8px 12px 12px', display:'flex', flexDirection:'column', gap:4}}>
              {[
                {id:'tr_82af', topic:'warfarin · supratherapeutic', why:'IRR 0.32', state:'active'},
                {id:'tr_77de', topic:'pediatric dosing', why:'judge gap', state:'queued'},
                {id:'tr_4b07', topic:'pt-BR translation', why:'novelty', state:'done'},
                {id:'tr_91ce', topic:'finance summary', why:'feedback ↓', state:'queued'},
                {id:'tr_55c1', topic:'chest pain triage', why:'IRR 0.45', state:'queued'},
                {id:'tr_2231', topic:'sepsis triage', why:'judge gap', state:'queued'},
                {id:'tr_7710', topic:'antibiotic interaction', why:'feedback ↓', state:'queued'},
                {id:'tr_9011', topic:'allergy reaction', why:'novelty', state:'queued'},
              ].map(t=>{
                const c = t.state==='active'?'var(--accent)':t.state==='done'?'var(--good)':'var(--ink-4)';
                return (
                  <div key={t.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, alignItems:'center', padding:'8px 10px', borderRadius:8, background: t.state==='active'?'var(--paper-3)':'transparent'}}>
                    <Dot color={c} size={7}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12.5, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{t.topic}</div>
                      <div style={{fontSize:10.5, color:'var(--ink-4)', display:'flex', gap:6}}>
                        <span className="mono">{t.id}</span><span>·</span><span>{t.why}</span>
                      </div>
                    </div>
                    <span className="chip" style={{fontSize:9.5, padding:'1px 6px', textTransform:'capitalize'}}>{t.state}</span>
                  </div>
                );
              })}
              <div style={{borderTop:'1px solid var(--line-2)', marginTop:6, paddingTop:8, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11, color:'var(--ink-3)'}}>
                <span>+ 19 more</span>
                <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>Edit queue</button>
              </div>
            </div>
          )}
          {tab==='why' && (
            <div className="scroll" style={{flex:1, overflowY:'auto', padding:'10px 12px 12px', display:'flex', flexDirection:'column', gap:8}}>
              <div style={{fontSize:11.5, color:'var(--ink-3)', lineHeight:1.5, padding:'0 4px'}}>
                Stratifier: <strong style={{color:'var(--ink)'}}>disagreement-aware</strong>. Pulled 80 traces from the production-clinical-q4 experiment where prior κ&lt;0.5 on safety, weighted ×3.
              </div>
              <DriverChip label="Disagreement" n={34} pct={42}/>
              <DriverChip label="Judge gap" n={22} pct={28}/>
              <DriverChip label="Production feedback" n={14} pct={18}/>
              <DriverChip label="Novelty" n={10} pct={12}/>
              <button className="btn" style={{justifyContent:'center', marginTop:6}}><I.spark/>Re-stratify queue</button>
            </div>
          )}
        </div>

        {/* center — current trace under microscope */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0, background:'var(--paper)'}}>
          <div style={{padding:'14px 22px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--line-2)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>tr_82af</span>
              <span style={{fontWeight:600}}>Warfarin · supratherapeutic + nosebleed</span>
              <span className="chip warn">3 raters active</span>
            </div>
            <div style={{display:'flex', gap:6, fontSize:11, color:'var(--ink-3)'}}>
              <button className="btn ghost"><I.chev/></button>
              <span style={{alignSelf:'center'}}>23 / 80</span>
              <button className="btn ghost" style={{transform:'rotate(180deg)'}}><I.chev/></button>
            </div>
          </div>

          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'18px 22px', display:'flex', flexDirection:'column', gap:16}}>
            <Bubble who="user" name="Patient (sim)" body={TRACES[0].user}/>
            <Bubble who="asst" name="Model · v2024-12-18" body={TRACES[0].asst} highlights={[
              {phrase:'do **not** give vitamin K reflexively', color:'good'},
              {phrase:'Recheck INR in 24h', color:'q'},
            ]}/>
          </div>

          <div style={{borderTop:'1px solid var(--line)', padding:'10px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--paper-2)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, fontSize:12}}>
              <Avatar name="You" size={20}/>
              <span style={{color:'var(--ink-3)'}}>you're observing — switch roles to rate</span>
            </div>
            <div style={{display:'flex', gap:6}}>
              <button className="btn"><I.comment/>Annotate</button>
              <button className="btn primary">Open in editor</button>
            </div>
          </div>
        </div>

        {/* right — live signals */}
        <div style={{borderLeft:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'14px 18px 10px'}}>
            <span className="eyebrow">Live signals</span>
          </div>
          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:10}}>
            <SignalCard kind="disagreement"
              title="Vitals before checklist?"
              body={'Bo flagged the absence of vitals as a safety gap. Alice and Carla scored "ok".'}
              actors={['Bo Tanaka','Alice Chen','Carla Mendes']}
              ts="2 min ago"/>
            <SignalCard kind="theme"
              title="Patient-facing tone leaks clinical phrasing"
              body="Recurs across 4 traces this pass. Suggests adding a tone rubric criterion."
              actors={['Carla Mendes','Faye Olsen']}
              ts="6 min ago"/>
            <SignalCard kind="judge"
              title="Judge vs. human gap on c2 (safety)"
              body="Auto-grader agreement 62% — below threshold. Promote to 2-of-3 review?"
              actors={['Judge gpt-4o-mini']}
              ts="11 min ago"/>
            <SignalCard kind="ok"
              title="IRR on c1 (factuality) stable"
              body="κ = 0.83 across last 40 traces. No action needed."
              actors={[]}
              ts="14 min ago"/>
          </div>
          <div style={{borderTop:'1px solid var(--line)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper-2)'}}>
            <span className="eyebrow">Auto-summarize at end</span>
            <span className="chip accent"><Dot color="var(--accent)"/>on</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ who, name, body, highlights=[] }){
  let html = body;
  highlights.forEach(h=>{
    html = html.replace(h.phrase, `<mark class="hl hl-${h.color}">${h.phrase}</mark>`);
  });
  // crude markdown for **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return (
    <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
      <div style={{flex:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:4, width:36}}>
        {who==='user' ? <Avatar name={name} size={28}/> : <Blob seed={name} size={28}/>}
        <span className="eyebrow" style={{fontSize:9}}>{who==='user'?'USER':'ASST'}</span>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
          <span style={{fontWeight:600, fontSize:12.5}}>{name}</span>
        </div>
        <div style={{lineHeight:1.55, color:'var(--ink-2)', whiteSpace:'pre-wrap'}}
             dangerouslySetInnerHTML={{__html: html}}/>
      </div>
    </div>
  );
}

function SignalCard({ kind, title, body, actors, ts }){
  const meta = {
    disagreement: { color:'var(--bad)', label:'Disagreement' },
    theme:        { color:'var(--accent)', label:'Theme' },
    judge:        { color:'var(--warn)', label:'Judge gap' },
    ok:           { color:'var(--good)', label:'Stable' },
  }[kind];
  return (
    <div className="card" style={{padding:12, position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute', left:0, top:0, bottom:0, width:3, background:meta.color}}/>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
        <span className="eyebrow" style={{color:meta.color}}>{meta.label}</span>
        <span style={{fontSize:10, color:'var(--ink-4)'}}>{ts}</span>
      </div>
      <div style={{fontWeight:600, fontSize:13, marginBottom:4}}>{title}</div>
      <div style={{fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>{body}</div>
      {actors.length>0 && (
        <div style={{display:'flex', alignItems:'center', gap:4, marginTop:8}}>
          {actors.slice(0,3).map(a=> <Avatar key={a} name={a} size={18}/>)}
          {actors.length>3 && <span style={{fontSize:10, color:'var(--ink-3)', marginLeft:4}}>+{actors.length-3}</span>}
        </div>
      )}
    </div>
  );
}

// ── Variation B: "Pass plan" ───────────────────────────────────────────────
// A different metaphor: the dashboard as a horizontal timeline of the rating
// pass — phases (kickoff → rate → reconcile → close), each with its KPIs.
// More of a "project view" than a live console.
function DashboardB(){
  const phases = [
    { id:'kickoff',  title:'Kickoff', state:'done', dur:'12m', kpi:'8/8 rubric agreed' },
    { id:'rate',     title:'Rate',    state:'live', dur:'34m / ~1h', kpi:'47 / 80 traces' },
    { id:'reconcile',title:'Reconcile', state:'next', dur:'~30m', kpi:'9 disagreements pending' },
    { id:'close',    title:'Close',   state:'idle', dur:'~10m', kpi:'export + memo' },
  ];

  const incidents = [
    {who:'Bo Tanaka', kind:'flag', text:'Asks for a mandatory "vitals first" pre-check across clinical prompts.', ts:'2m', for:'rate'},
    {who:'Carla Mendes', kind:'note', text:'Tone rubric needs a separate criterion — patient vs. clinician readers.', ts:'6m', for:'rate'},
    {who:'Judge', kind:'auto', text:'c2 (safety) judge accuracy 62% — below 75% threshold.', ts:'11m', for:'rate'},
    {who:'Alice Chen', kind:'flag', text:'Two traces in the queue look near-duplicate (tr_91ce, tr_91d3).', ts:'18m', for:'rate'},
  ];

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      {/* hero header */}
      <div style={{padding:'24px 32px 18px', borderBottom:'1px solid var(--line)', display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'flex-start'}}>
        <div>
          <div className="eyebrow" style={{marginBottom:6}}>JBW · session #4012 · healthcare-a</div>
          <div className="serif" style={{fontSize:30, lineHeight:1.1, fontWeight:500, letterSpacing:'-0.01em', maxWidth:520}}>
            Clinical advice <span style={{color:'var(--ink-3)'}}>—</span> pass three, focused on warfarin and bleeding triage.
          </div>
          <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap'}}>
            <span className="chip"><Avatar name="You" size={14}/>You · facilitator</span>
            <span className="chip">6 raters live</span>
            <span className="chip">2 invited</span>
            <span className="chip accent"><Dot color="var(--accent)"/>auto-assign on</span>
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end'}}>
          <div style={{display:'flex', gap:8}}>
            <button className="btn"><I.diff/>Compare to pass 2</button>
            <button className="btn primary"><I.spark/>Draft session memo</button>
          </div>
          <div style={{fontSize:11, color:'var(--ink-3)'}}>started 34 min ago · target 80 traces · ~26 min remaining</div>
        </div>
      </div>

      {/* phase timeline */}
      <div style={{padding:'22px 32px 16px', borderBottom:'1px solid var(--line)', background:'var(--paper-2)'}}>
        <div className="eyebrow" style={{marginBottom:12}}>Pass plan</div>
        <div style={{display:'grid', gridTemplateColumns:`repeat(${phases.length}, 1fr)`, gap:0, position:'relative'}}>
          {phases.map((p,i)=>{
            const live = p.state==='live';
            const done = p.state==='done';
            const next = p.state==='next';
            const color = live ? 'var(--accent)' : done ? 'var(--good)' : next ? 'var(--ink-2)' : 'var(--line)';
            return (
              <div key={p.id} style={{position:'relative', paddingRight: i<phases.length-1?16:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                  <span style={{width:18, height:18, borderRadius:999, background: done?'var(--good)':'var(--paper)', border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>
                    {done && <I.check/>}
                  </span>
                  <span style={{fontWeight:600, color: live?'var(--ink)':'var(--ink-2)'}}>{p.title}</span>
                  {live && <span className="chip accent" style={{padding:'2px 6px'}}><Dot color="var(--accent)"/>live</span>}
                </div>
                <div style={{height:4, borderRadius:2, background: done?'var(--good)':live?'var(--paper-3)':'var(--line-2)', overflow:'hidden', marginBottom:8}}>
                  {live && <div style={{height:'100%', width: '58%', background:'var(--accent)', borderRadius:2}}/>}
                </div>
                <div style={{fontSize:11, color:'var(--ink-3)'}}>{p.dur}</div>
                <div style={{fontSize:12.5, marginTop:2, fontWeight:500}}>{p.kpi}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* main content row */}
      <div style={{flex:1, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', minHeight:0}}>
        {/* throughput */}
        <Panel title="Throughput" sub="traces / 5min">
          <BarChart data={[3,5,4,6,8,7,9,11,9,12]} labels={['','','','','','','','','','now']}/>
          <div className="dotline" style={{margin:'14px 0'}}/>
          <Row label="Median time" v="2:48"/>
          <Row label="Slowest rater" v="Carla · 4:12"/>
          <Row label="Fastest rater" v="Eli · 1:34"/>
          <Row label="Idle raters" v="1" warn/>
        </Panel>
        {/* agreement */}
        <Panel title="Agreement" sub="per rubric criterion">
          {RUBRIC.map(c=>(
            <div key={c.id} style={{display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:10, padding:'8px 0', borderTop:'1px solid var(--line-2)'}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12.5, fontWeight:500}}>{c.title}</div>
                <div style={{fontSize:10.5, color:'var(--ink-4)'}}>{c.type}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <KappaBar v={c.irr}/>
                <span className="tnum" style={{fontSize:12, width:32, textAlign:'right'}}>{c.irr.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </Panel>
        {/* incidents */}
        <Panel title="Incidents · 4" sub="needs facilitator attention" right={<button className="btn ghost"><I.spark/>cluster</button>}>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {incidents.map((it,i)=>(
              <div key={i} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:8, padding:'8px', borderRadius:8, background:'var(--paper-2)'}}>
                <div style={{paddingTop:2}}>
                  {it.kind==='auto' ? <Blob seed="judge" size={20}/> : <Avatar name={it.who} size={20}/>}
                </div>
                <div>
                  <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.45}}>{it.text}</div>
                  <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:3, display:'flex', gap:6}}>
                    <span>{it.who}</span><span>·</span><span>{it.ts}</span>
                  </div>
                </div>
                <button className="btn ghost" title="resolve"><I.check/></button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, sub, right, children }){
  return (
    <div style={{padding:'18px 22px', borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0}}>
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:14}}>
        <div>
          <div style={{fontWeight:600}}>{title}</div>
          <div style={{fontSize:11, color:'var(--ink-3)'}}>{sub}</div>
        </div>
        {right}
      </div>
      <div className="scroll" style={{flex:1, overflowY:'auto'}}>{children}</div>
    </div>
  );
}

function Row({ label, v, warn }){
  return (
    <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:12.5}}>
      <span style={{color:'var(--ink-3)'}}>{label}</span>
      <span className="tnum" style={{color: warn?'var(--bad)':'var(--ink)'}}>{v}</span>
    </div>
  );
}

function BarChart({ data, labels }){
  const max = Math.max(...data);
  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${data.length}, 1fr)`, gap:4, alignItems:'end', height:80}}>
        {data.map((v,i)=>(
          <div key={i} style={{height:`${(v/max)*100}%`, background: i===data.length-1?'var(--accent)':'var(--ink-4)', borderRadius:'3px 3px 0 0', opacity: i===data.length-1?1:0.55 }}/>
        ))}
      </div>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${data.length}, 1fr)`, gap:4, marginTop:4}}>
        {labels.map((l,i)=><span key={i} style={{fontSize:9.5, color:'var(--ink-4)', textAlign:'center'}}>{l}</span>)}
      </div>
    </div>
  );
}

function KappaBar({ v }){
  // 0..1 with thresholds
  const color = v>=0.7 ? 'var(--good)' : v>=0.5 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div style={{position:'relative', width:80, height:6, borderRadius:3, background:'var(--line-2)', overflow:'hidden'}}>
      <div style={{position:'absolute', inset:0, width:`${v*100}%`, background:color}}/>
    </div>
  );
}

// ── Variation C: "Trace funnel" — discovery + sampling ──────────────────────
// Addresses CUJ 1: how does the facilitator pick *which* traces feed the
// session, and see *why* those? Funnel from source → filter → stratify →
// queue, plus an NL search bar and sample preview.
function DashboardC(){
  const [nl, setNl] = useS_db('safety failures on warfarin / anticoagulant prompts where rater disagreed');
  const [strat, setStrat] = useS_db('disagreement');

  const sources = [
    { id:'mlflow',   name:'MLflow experiment',    sub:'prod-clinical-q4 · 14,820 traces', count:14820, on:true,  badge:'live' },
    { id:'jsonl',    name:'JSONL upload',         sub:'sme-curated-202604.jsonl · 312',   count:312,   on:true,  badge:'static' },
    { id:'datadog',  name:'Datadog (external)',   sub:'preview · authenticate',           count:0,     on:false, badge:'beta' },
    { id:'feedback', name:'Production feedback',  sub:'thumbs-down only · last 30d',      count:1240,  on:false, badge:'live' },
  ];

  const filters = [
    { name:'topic',     v:'clinical · medication · pediatric', n:3892 },
    { name:'language',  v:'en, pt-BR',                          n:3401 },
    { name:'has_feedback', v:'yes',                             n:1108 },
    { name:'rated_in',  v:'never',                              n:892  },
  ];

  // funnel stages
  const stages = [
    { label:'Sources',         n:16372, w:'100%' },
    { label:'After filters',   n:3892,  w:'58%'  },
    { label:'NL match',        n:412,   w:'34%'  },
    { label:`Stratified (${strat})`, n:80, w:'18%' },
  ];

  const stratStrategies = [
    { id:'random',        label:'Random',        hint:'baseline · no balancing' },
    { id:'disagreement',  label:'Disagreement',  hint:'maximize κ-information · prefer prior IRR<0.5' },
    { id:'judge-gap',     label:'Judge gap',     hint:'prefer traces where judge & humans diverge' },
    { id:'topic-balanced',label:'Topic-balanced',hint:'equal coverage of topics in queue' },
    { id:'novelty',       label:'Novelty',       hint:'cluster centroids — unseen subspaces' },
  ];

  const previewQueue = [
    { id:'tr_82af', topic:'warfarin', why:'IRR 0.32 on c2', tags:['clinical','medication'], age:'2d' },
    { id:'tr_77de', topic:'pediatric dosing', why:'judge gap +2', tags:['clinical','pediatric'], age:'4h' },
    { id:'tr_4b07', topic:'pt-BR translation', why:'novelty cluster', tags:['translation'], age:'1d' },
    { id:'tr_91ce', topic:'finance summary', why:'feedback: thumbs-down', tags:['summarize','finance'], age:'6h' },
    { id:'tr_55c1', topic:'chest pain triage', why:'IRR 0.45 on c2', tags:['clinical','triage'], age:'3d' },
    { id:'tr_2231', topic:'sepsis triage', why:'judge gap +1', tags:['clinical','triage'], age:'1d' },
  ];

  const topics = [
    { name:'medication', n:1240, pct:32 },
    { name:'triage',     n:910,  pct:23 },
    { name:'translation',n:520,  pct:13 },
    { name:'summary',    n:480,  pct:12 },
    { name:'pediatric',  n:380,  pct:10 },
    { name:'other',      n:362,  pct:10 },
  ];

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontWeight:600}}>Build trace queue</span>
          <span className="chip">healthcare-a · pass 3</span>
          <span className="chip warn"><Dot color="var(--warn)"/>queue not yet locked</span>
        </div>
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost"><I.spark/>Save as preset</button>
          <button className="btn primary"><I.play/>Lock queue · 80 traces</button>
        </div>
      </div>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'320px 1fr 360px', minHeight:0}}>
        {/* sources */}
        <div style={{borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0, padding:'16px 18px', gap:14, background:'var(--paper-2)'}}>
          <div>
            <div className="eyebrow" style={{marginBottom:8}}>SOURCES</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {sources.map(s=>(
                <div key={s.id} className="card" style={{padding:'10px 12px', display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center', opacity:s.on?1:0.6}}>
                  <input type="checkbox" defaultChecked={s.on}/>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12.5, fontWeight:500, display:'flex', alignItems:'center', gap:6}}>
                      {s.name}
                      <span className="chip" style={{fontSize:9.5, padding:'1px 5px'}}>{s.badge}</span>
                    </div>
                    <div style={{fontSize:11, color:'var(--ink-3)'}}>{s.sub}</div>
                  </div>
                  <span className="tnum" style={{fontSize:11, color:'var(--ink-3)'}}>{s.count.toLocaleString()}</span>
                </div>
              ))}
              <button className="btn ghost" style={{justifyContent:'flex-start', borderStyle:'dashed', borderWidth:1, borderColor:'var(--line)', borderTop:'1px dashed var(--line)'}}><I.plus/>Connect source</button>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{marginBottom:8}}>FILTERS · 4 active</div>
            <div style={{display:'flex', flexDirection:'column', gap:5}}>
              {filters.map(f=>(
                <div key={f.name} style={{display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', padding:'8px 10px', borderRadius:8, background:'var(--paper)', border:'1px solid var(--line-2)'}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:11, color:'var(--ink-3)'}}>{f.name}</div>
                    <div style={{fontSize:12.5, color:'var(--ink-2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f.v}</div>
                  </div>
                  <span className="tnum" style={{fontSize:11, color:'var(--ink-4)'}}>{f.n.toLocaleString()}</span>
                </div>
              ))}
              <button className="btn ghost" style={{justifyContent:'flex-start'}}><I.plus/>Add filter</button>
            </div>
          </div>

          <div style={{marginTop:'auto'}}>
            <div className="eyebrow" style={{marginBottom:6}}>SAVED PRESETS</div>
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              {['warfarin-disagreement','pt-BR translation drift','feedback-driven 30d'].map(p=>(
                <div key={p} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 8px', fontSize:12, color:'var(--ink-3)', borderRadius:6}}
                     onMouseOver={e=>e.currentTarget.style.background='var(--paper)'}
                     onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                  <Blob seed={p} size={14} subtle/>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* center: NL search + funnel + queue preview */}
        <div style={{display:'flex', flexDirection:'column', minHeight:0}}>
          {/* NL search */}
          <div style={{padding:'18px 24px 10px'}}>
            <div className="eyebrow" style={{marginBottom:8}}>FIND TRACES IN PLAIN ENGLISH</div>
            <div style={{display:'flex', gap:8, alignItems:'stretch'}}>
              <div style={{flex:1, display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'var(--paper-2)', border:'1px solid var(--line)', borderRadius:10}}>
                <I.search/>
                <input value={nl} onChange={e=>setNl(e.target.value)} spellCheck={false}
                  style={{flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:'var(--ink)'}}/>
                <span className="chip accent"><Dot color="var(--accent)"/>412 matches</span>
              </div>
              <button className="btn"><I.spark/>Refine</button>
            </div>
            <div style={{display:'flex', gap:6, marginTop:8, flexWrap:'wrap'}}>
              {['safety','warfarin','disagreement','medication','last 30d'].map(t=>(
                <span key={t} className="chip" style={{padding:'2px 8px'}}><I.x/>{t}</span>
              ))}
            </div>
          </div>

          {/* funnel */}
          <div style={{padding:'8px 24px 16px', borderBottom:'1px solid var(--line)'}}>
            <div className="eyebrow" style={{marginBottom:10}}>FUNNEL · what shrinks the pool at each step</div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {stages.map((s,i)=>(
                <div key={s.label} style={{display:'grid', gridTemplateColumns:'170px 1fr 80px', alignItems:'center', gap:12}}>
                  <span style={{fontSize:12.5, color:'var(--ink-2)'}}>{s.label}</span>
                  <div style={{position:'relative', height:14, background:'var(--line-2)', borderRadius:3, overflow:'hidden'}}>
                    <div style={{position:'absolute', inset:0, width:s.w,
                      background: i===stages.length-1?'var(--accent)':`oklch(0.6 0.1 ${260 - i*30})`,
                      opacity: i===stages.length-1?1:0.55}}/>
                  </div>
                  <span className="tnum" style={{fontSize:12, textAlign:'right'}}>{s.n.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{marginTop:14, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
              <span className="eyebrow" style={{marginRight:4}}>STRATIFY</span>
              {stratStrategies.map(s=>(
                <button key={s.id}
                  onClick={()=>setStrat(s.id)}
                  className="btn"
                  style={{
                    fontSize:11.5,
                    background: strat===s.id ? 'var(--ink)' : 'var(--paper)',
                    color: strat===s.id ? 'var(--paper)' : 'var(--ink-2)',
                    borderColor: strat===s.id ? 'var(--ink)' : 'var(--line)',
                  }}>{s.label}</button>
              ))}
              <span style={{flex:1}}/>
              <span style={{fontSize:11, color:'var(--ink-3)'}}>{stratStrategies.find(s=>s.id===strat)?.hint}</span>
            </div>
          </div>

          {/* queue preview */}
          <div style={{padding:'14px 24px 8px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div className="eyebrow">QUEUE PREVIEW · 80 traces · showing 6</div>
            <div style={{display:'flex', gap:6, fontSize:11, color:'var(--ink-3)'}}>
              <span>seed </span><span className="mono">2026-04-28</span>
              <button className="btn ghost" style={{padding:'2px 6px'}}>Reshuffle</button>
            </div>
          </div>
          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'0 24px 18px'}}>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {previewQueue.map(t=>(
                <div key={t.id} className="card" style={{padding:'10px 12px', display:'grid', gridTemplateColumns:'auto auto 1fr auto auto', alignItems:'center', gap:12}}>
                  <Blob seed={t.id} size={18}/>
                  <span className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>{t.id}</span>
                  <div style={{display:'flex', alignItems:'center', gap:8, minWidth:0}}>
                    <span style={{fontSize:13, fontWeight:500}}>{t.topic}</span>
                    <span style={{fontSize:11, color:'var(--ink-4)'}}>· {t.age} ago</span>
                  </div>
                  <div style={{display:'flex', gap:4}}>
                    {t.tags.map(tag=> <span key={tag} className="chip" style={{fontSize:10, padding:'1px 6px'}}>{tag}</span>)}
                  </div>
                  <span className="chip accent" title="why this trace was selected" style={{padding:'2px 8px'}}>{t.why}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right: distribution + driver explainer */}
        <div style={{borderLeft:'1px solid var(--line)', display:'flex', flexDirection:'column', minHeight:0, background:'var(--paper-2)'}}>
          <div style={{padding:'16px 18px 8px'}}>
            <div className="eyebrow">QUEUE COMPOSITION</div>
            <div style={{fontSize:11, color:'var(--ink-3)'}}>topic distribution after stratification</div>
          </div>
          <div style={{padding:'8px 18px 4px', display:'flex', flexDirection:'column', gap:6}}>
            {topics.map(t=>(
              <div key={t.name} style={{display:'grid', gridTemplateColumns:'90px 1fr 36px', alignItems:'center', gap:8, fontSize:12}}>
                <span style={{color:'var(--ink-3)'}}>{t.name}</span>
                <div style={{height:8, background:'var(--paper)', borderRadius:2, overflow:'hidden', border:'1px solid var(--line-2)'}}>
                  <div style={{height:'100%', width:`${t.pct*3}%`, background:'var(--accent)', opacity:0.7}}/>
                </div>
                <span className="tnum" style={{fontSize:11, textAlign:'right'}}>{t.pct}%</span>
              </div>
            ))}
          </div>

          <div style={{padding:'18px 18px 8px'}}>
            <div className="eyebrow">DRIVERS</div>
            <div style={{fontSize:11, color:'var(--ink-3)'}}>why these traces are in the queue</div>
          </div>
          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'4px 18px 16px', display:'flex', flexDirection:'column', gap:8}}>
            <DriverCard label="Disagreement" body="34 traces have prior κ < 0.5 on c2 (safety) — boosted ×3 by stratifier."/>
            <DriverCard label="Judge gap" body="22 traces where gpt-4o-mini diverged from human ≥2 points."/>
            <DriverCard label="Production feedback" body="14 traces with thumbs-down within 30 days."/>
            <DriverCard label="Novelty" body="10 traces from clusters not yet rated in any pass."/>
          </div>
          <div style={{borderTop:'1px solid var(--line)', padding:'10px 16px', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span className="eyebrow">EST. SESSION TIME</span>
            <span className="tnum" style={{fontSize:13, fontWeight:600}}>~3h 40m · 4 raters</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverCard({ label, body }){
  return (
    <div className="card" style={{padding:'10px 12px', background:'var(--paper)'}}>
      <div className="eyebrow" style={{color:'var(--accent)', marginBottom:4}}>{label}</div>
      <div style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.5}}>{body}</div>
    </div>
  );
}

function DriverChip({ label, n, pct }){
  return (
    <div style={{padding:'8px 10px', borderRadius:8, background:'var(--paper-2)'}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <span style={{fontSize:12, color:'var(--ink-2)'}}>{label}</span>
        <span className="tnum" style={{fontSize:11, color:'var(--ink-3)'}}>{n} · {pct}%</span>
      </div>
      <div style={{height:4, borderRadius:2, background:'var(--line-2)', overflow:'hidden'}}>
        <div style={{height:'100%', width:`${pct}%`, background:'var(--accent)'}}/>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardA, DashboardB, DashboardC });
