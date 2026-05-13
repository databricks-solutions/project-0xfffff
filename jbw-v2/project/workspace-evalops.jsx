// JBW v2 — Evaluation Ops (CUJ: Run Evaluation Ops)
// Three directions:
//   A · Production console — what's running, drift, recommendations
//   B · Incident lineage — production issue → rubric/judge/feed evidence
//   C · Sprint trigger — production signals draft the next sprint

const RUNNING = {
  rubric: { v:'v0.3', since:'2d ago' },
  judge:  { v:'v0.4', shadow:'v0.5 candidate', since:'2d ago' },
  scope:  '14.2k prod traces / 24h',
};

const SIGNALS = [
  { id:'sig-1', kind:'drift',         level:'warn', metric:'topic mix', detail:'+34% pediatric dosing last 48h vs. trailing 14d', linked:'tr_d31e cluster' },
  { id:'sig-2', kind:'judge-uncertainty', level:'warn', metric:'judge confidence', detail:'p(low-conf) = 0.18 on c4 (was 0.09)', linked:'judge-completeness@v0.4' },
  { id:'sig-3', kind:'construct',     level:'bad',  metric:'JHA · c2 in prod', detail:'shadow JHA 0.58 in pediatric slice (was 0.74 overall)', linked:'rubric c2 · judge-clinical@v0.4' },
  { id:'sig-4', kind:'incident',      level:'bad',  metric:'safety incident', detail:'2 escalations · pediatric amoxicillin overdose flag missed', linked:'tr_pd_4419, tr_pd_4421' },
  { id:'sig-5', kind:'volume',        level:'ok',   metric:'throughput', detail:'1.4k traces/h · stable', linked:'' },
];

const RECS = [
  { kind:'collect',   title:'Collect more SME judgement on pediatric dosing', why:'opens c4 measurement and resolves c2 ambiguity in this slice', size:'~25 traces · 2 SME hours', sprint:true },
  { kind:'rubric',    title:'Promote rubric v0.4 (c2 split)',                  why:'shadow JHA 0.83 vs current 0.74 on warfarin slice', size:'lineage-safe migration', sprint:false },
  { kind:'judge',     title:'Improve judge-completeness · pediatric guideline',why:'low confidence cluster localized to dosing format', size:'1 guideline edit + regression', sprint:false },
  { kind:'remediate', title:'Patch system prompt · require dose-by-weight checks', why:'reduces missed-omission incidents at the source',     size:'eng owner · 1 PR', sprint:false },
];

// ─────────────────────────────────────────────────────────────────
// A · Production console
// ─────────────────────────────────────────────────────────────────
function EvalOpsA(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <EOHeader sub="Production console · what's running · what's drifting · what to do next"/>

      {/* running banner */}
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 1fr', gap:14, alignItems:'center'}}>
        <div>
          <span className="eyebrow">running in production</span>
          <div style={{display:'flex', alignItems:'center', gap:8, marginTop:5}}>
            <EOPill mono>rubric {RUNNING.rubric.v}</EOPill>
            <EOPill mono>judge {RUNNING.judge.v}</EOPill>
            <EOPill mono accent>shadow · {RUNNING.judge.shadow}</EOPill>
          </div>
          <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:4}}>since {RUNNING.judge.since} · scope: {RUNNING.scope}</div>
        </div>
        <EOBigStat label="JHA · 24h" v="0.74" trend="-0.04" bad/>
        <EOBigStat label="judge confidence" v="0.86" trend="-0.02"/>
        <EOBigStat label="construct validity" v="0.71" trend="-0.06" bad sub="c2 weak in pediatric"/>
      </div>

      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:1, background:'var(--line)'}}>
        {/* signals stream */}
        <div style={{background:'var(--paper)', overflow:'auto', padding:'18px 22px'}} className="scroll">
          <div style={{display:'flex', alignItems:'baseline', gap:10, marginBottom:10}}>
            <span className="serif" style={{fontSize:18, fontWeight:500, letterSpacing:'-0.01em'}}>Signals</span>
            <span style={{fontSize:11, color:'var(--ink-3)'}}>last 48h</span>
            <span style={{flex:1}}/>
            <span className="chip">drift</span>
            <span className="chip">uncertainty</span>
            <span className="chip">construct</span>
            <span className="chip bad">incident</span>
          </div>

          {/* sparkline strip */}
          <div className="card" style={{padding:'12px 14px', marginBottom:14}}>
            <div className="eyebrow">trend · last 14 days</div>
            <div style={{display:'grid', gridTemplateColumns:'120px 1fr 50px', gap:8, alignItems:'center', marginTop:8}}>
              {[
                {l:'JHA', d:[0.79,0.78,0.79,0.80,0.79,0.78,0.78,0.77,0.78,0.78,0.76,0.75,0.75,0.74], end:'0.74', bad:true},
                {l:'judge conf', d:[0.90,0.91,0.90,0.89,0.89,0.89,0.88,0.88,0.88,0.87,0.87,0.86,0.86,0.86], end:'0.86'},
                {l:'CV (c2)',    d:[0.78,0.78,0.77,0.78,0.77,0.76,0.75,0.74,0.74,0.72,0.72,0.71,0.71,0.71], end:'0.71', bad:true},
                {l:'topic novelty',d:[0.10,0.11,0.10,0.12,0.13,0.14,0.16,0.18,0.21,0.24,0.27,0.31,0.33,0.34], end:'+34%', bad:true},
              ].map(s=>(
                <React.Fragment key={s.l}>
                  <span style={{fontSize:11, color:'var(--ink-3)'}}>{s.l}</span>
                  <EOSparkline data={s.d} bad={s.bad}/>
                  <span className="mono tnum" style={{fontSize:11, fontWeight:500, color:s.bad?'var(--bad)':'var(--ink)', textAlign:'right'}}>{s.end}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* signal list */}
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            {SIGNALS.map(s=>(
              <div key={s.id} className="card" style={{padding:'10px 12px', display:'flex', gap:10, alignItems:'flex-start', borderColor: s.level==='bad'?'oklch(0.7 0.15 25)':s.level==='warn'?'oklch(0.78 0.13 75)':'var(--line)'}}>
                <span style={{width:6, height:6, borderRadius:3, background: s.level==='bad'?'var(--bad)':s.level==='warn'?'var(--warn)':'var(--good)', marginTop:6}}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span className="chip" style={{fontSize:9.5}}>{s.kind}</span>
                    <span style={{fontSize:12, fontWeight:500}}>{s.metric}</span>
                    <span style={{flex:1}}/>
                    <span className="mono" style={{fontSize:10, color:'var(--ink-4)'}}>{s.linked}</span>
                  </div>
                  <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:4, lineHeight:1.45}}>{s.detail}</div>
                  <div style={{display:'flex', gap:6, marginTop:6}}>
                    <button className="btn" style={{fontSize:10.5}}>Lineage</button>
                    <button className="btn" style={{fontSize:10.5}}>Add slice to feed</button>
                    {s.level!=='ok' && <button className="btn primary" style={{fontSize:10.5}}>Triage →</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* recommendations rail */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', gap:6}}>
            <I.spark/><span style={{fontSize:12, fontWeight:600}}>Recommendations</span>
            <span className="chip accent" style={{fontSize:9.5, marginLeft:'auto'}}>4 actions</span>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10}} className="scroll">
            {RECS.map((r,i)=>(
              <div key={i} className="card" style={{padding:'10px 12px'}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <EORecGlyph kind={r.kind}/>
                  <span style={{fontSize:11.5, fontWeight:500}}>{r.title}</span>
                </div>
                <div style={{fontSize:11, color:'var(--ink-2)', marginTop:5, lineHeight:1.45}}>{r.why}</div>
                <div className="mono" style={{fontSize:10, color:'var(--ink-4)', marginTop:4}}>{r.size}</div>
                <div style={{display:'flex', gap:6, marginTop:8}}>
                  {r.sprint
                    ? <button className="btn primary" style={{fontSize:10.5}}>Draft sprint</button>
                    : <button className="btn primary" style={{fontSize:10.5}}>Take action</button>}
                  <button className="btn" style={{fontSize:10.5}}>Why?</button>
                </div>
              </div>
            ))}
            <div style={{fontSize:10.5, color:'var(--ink-4)', lineHeight:1.5, marginTop:6}}>
              Recommendations come from the four levers: collect SME judgement · revise rubric · improve judge · remediate model/system.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EOHeader({ sub }){
  return (
    <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <a style={{fontSize:11, color:'var(--ink-3)'}}>← Workspace</a>
          <span style={{fontSize:11, color:'var(--ink-4)'}}>/</span>
          <span style={{fontSize:13, fontWeight:600}}>Evaluation Ops</span>
          <span className="chip"><Dot color="var(--good)"/>monitoring · live</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
      </div>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <button className="btn"><I.diff/>compare windows</button>
        <button className="btn primary"><I.spark/>Draft sprint from signals</button>
      </div>
    </div>
  );
}

function EOPill({ children, mono, accent }){
  return <span className={`chip ${accent?'accent':''} ${mono?'mono':''}`} style={{fontSize:10.5}}>{children}</span>;
}

function EOBigStat({ label, v, trend, bad, sub }){
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:3}}>
        <span className="tnum" style={{fontSize:22, fontWeight:600, color: bad?'var(--bad)':'var(--ink)'}}>{v}</span>
        {trend && <span className="mono tnum" style={{fontSize:10.5, color: trend.startsWith('-')?'var(--bad)':'var(--good)'}}>{trend.startsWith('-')?'↓':'↑'} {trend.replace('-','')}</span>}
      </div>
      {sub && <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:2}}>{sub}</div>}
    </div>
  );
}

function EOSparkline({ data, bad }){
  const W=220, H=24, pad=2;
  const min = Math.min(...data), max = Math.max(...data);
  const r = max - min || 1;
  const pts = data.map((v,i)=>{
    const x = pad + (i/(data.length-1))*(W-2*pad);
    const y = H-pad - ((v-min)/r)*(H-2*pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <polyline fill="none" points={pts} stroke={bad?'var(--bad)':'var(--accent)'} strokeWidth="1.4"/>
    </svg>
  );
}

function EORecGlyph({ kind }){
  const map = {collect:['var(--cyan)','C'], rubric:['var(--accent)','R'], judge:['var(--violet)','J'], remediate:['var(--emerald)','M']};
  const [c,l] = map[kind] || ['var(--ink-3)','·'];
  return <span style={{width:18, height:18, borderRadius:4, background:c, color:'white', fontSize:10, fontFamily:'var(--mono)', fontWeight:600, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{l}</span>;
}

// ─────────────────────────────────────────────────────────────────
// B · Incident lineage
// ─────────────────────────────────────────────────────────────────
function EvalOpsB(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <EOHeader sub="Incident lineage · production issue → rubric / judge / feed evidence"/>
      {/* incident header */}
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--line)', background:'oklch(0.985 0.02 25)'}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span className="chip bad" style={{fontSize:10}}>incident</span>
          <span style={{fontSize:14, fontWeight:600}}>Pediatric amoxicillin · dose-format omission missed by judge</span>
          <span className="mono" style={{fontSize:11, color:'var(--ink-3)', marginLeft:'auto'}}>INC-2026-04-27 · raised by ops</span>
        </div>
        <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:5, lineHeight:1.5, maxWidth:880}}>
          2 escalations in the last 24h. The judge scored c2 (clinical safety) at 4 on traces where SME review later flagged a missing dose-by-weight check. Below: the lineage from incident back through judge, rubric criterion, and SME evidence.
        </div>
      </div>

      <div style={{flex:1, minHeight:0, overflow:'auto', padding:'22px 28px'}} className="scroll">
        <div style={{maxWidth:1080, margin:'0 auto'}}>
          {/* lineage swimlanes */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:1, background:'var(--line)', borderRadius:'var(--r)', overflow:'hidden', border:'1px solid var(--line)'}}>
            {[
              {head:'production', items:[
                {kind:'incident', main:'INC-2026-04-27', sub:'2 escalations'},
                {kind:'trace', main:'tr_pd_4419', sub:'pediatric, 22kg'},
                {kind:'trace', main:'tr_pd_4421', sub:'pediatric, 14kg'},
              ]},
              {head:'judge', items:[
                {kind:'judge', main:'judge-clinical@v0.4', sub:'scored 4/5 · conf 0.81'},
                {kind:'memory', main:'memory · ER red flags', sub:'applied (out of scope)'},
              ]},
              {head:'rubric', items:[
                {kind:'criterion', main:'c2 · clinical safety', sub:'rubric v0.3 · IRR 0.41'},
                {kind:'proposal', main:'c2 split (proposed)', sub:'c2a vitals · c2b contraindications'},
              ]},
              {head:'SME evidence', items:[
                {kind:'thread', main:'#11 · vitals-first', sub:'Bo Tanaka · "needs vitals check"'},
                {kind:'judgement', main:'11 SME assessments', sub:'mean 3.2 · vs judge 4.1'},
              ]},
              {head:'feed source', items:[
                {kind:'trace', main:'tr_82af · warfarin', sub:'starter · day 1'},
                {kind:'trace', main:'tr_aa12 · MH triage', sub:'optimizer add · day 2'},
              ]},
            ].map((col,ci)=>(
              <div key={col.head} style={{background:'var(--paper)', padding:'12px 12px', minHeight:380}}>
                <div className="eyebrow" style={{marginBottom:10, color:'var(--ink-3)'}}>{col.head}</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {col.items.map((it,i)=>(
                    <EOLinNode key={i} {...it} primary={ci===0&&i===0}/>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* arrows note */}
          <div style={{textAlign:'center', fontSize:10.5, color:'var(--ink-4)', marginTop:8}}>incident → traces → judge that scored them → criterion that defines safety → human evidence behind the criterion → feed traces that established it</div>

          {/* findings */}
          <div style={{marginTop:24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14}}>
            <div className="card" style={{padding:'14px 16px'}}>
              <div className="eyebrow">root finding</div>
              <p style={{fontSize:13, color:'var(--ink-2)', lineHeight:1.55, marginTop:6}}>
                The judge applies the "ER only when red flags" memory globally, but the c2 criterion does not name <span className="hl">dose-by-weight</span> as a safety dimension. SME evidence (thread #11, 11 judgements) already proposes splitting c2; the proposal has not been promoted.
              </p>
              <div style={{display:'flex', gap:6, marginTop:10}}>
                <button className="btn primary"><I.spark/>Promote rubric v0.4 (c2 split)</button>
                <button className="btn">Open thread #11</button>
                <button className="btn">View judge guidelines</button>
              </div>
            </div>

            <div className="card" style={{padding:'14px 16px'}}>
              <div className="eyebrow">construct validity audit</div>
              <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:6, fontSize:11.5, color:'var(--ink-2)'}}>
                <EOAudit q="Does c2 measure what production cares about?" a="Partially. Misses dose-by-weight."/>
                <EOAudit q="Is the SME judgement used to define c2 representative of pediatric?" a="No · 4 of 47 traces."/>
                <EOAudit q="Does the judge generalize c2 fairly across slices?" a="JHA 0.74 overall, 0.58 pediatric."/>
              </div>
            </div>
          </div>

          {/* recommendation */}
          <div style={{marginTop:18}}>
            <div className="card" style={{padding:'14px 16px', background:'oklch(0.985 0.012 268)', borderColor:'oklch(0.85 0.06 268)'}}>
              <div className="eyebrow" style={{color:'var(--accent)'}}>recommended sprint</div>
              <div style={{fontSize:13.5, fontWeight:500, marginTop:5, color:'var(--ink)'}}>3-day workshop · pediatric safety</div>
              <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:5, lineHeight:1.5}}>
                Goal: lift c2 JHA on pediatric slice from 0.58 → 0.80. Add 25 pediatric traces to the feed, two physician SMEs, promote v0.4, regenerate judge, regression vs incident set.
              </div>
              <div style={{display:'flex', gap:6, marginTop:10}}>
                <button className="btn primary">Draft this sprint →</button>
                <button className="btn">Adjust scope</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EOLinNode({ kind, main, sub, primary }){
  const colors = { incident:'var(--bad)', trace:'var(--cyan)', judge:'var(--emerald)', memory:'var(--violet)', criterion:'var(--accent)', proposal:'var(--warn)', thread:'var(--accent)', judgement:'var(--ink-3)' };
  const c = colors[kind] || 'var(--ink-3)';
  return (
    <div style={{padding:'8px 10px', borderRadius:'var(--r-sm)', background: primary?'oklch(0.97 0.06 25)':'var(--paper-2)', border: '1px solid', borderColor: primary?c:'var(--line)', borderLeft: `2px solid ${c}`}}>
      <div className="mono" style={{fontSize:9.5, color:'var(--ink-4)'}}>{kind}</div>
      <div style={{fontSize:11, fontWeight:500, marginTop:2}}>{main}</div>
      <div style={{fontSize:10, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
    </div>
  );
}

function EOAudit({ q, a }){
  return (
    <div style={{display:'flex', gap:10}}>
      <span style={{flex:1}}>{q}</span>
      <span style={{color:'var(--ink-3)', fontStyle:'italic'}}>{a}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// C · Sprint trigger from production
// ─────────────────────────────────────────────────────────────────
function EvalOpsC(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <EOHeader sub="Production signals draft the next sprint · approve, edit, or merge"/>

      <div style={{flex:1, minHeight:0, overflow:'auto', padding:'24px 28px'}} className="scroll">
        <div style={{maxWidth:920, margin:'0 auto'}}>
          {/* signal cluster */}
          <div className="eyebrow">signals clustered into one sprint proposal</div>
          <div style={{display:'flex', gap:8, marginTop:6, flexWrap:'wrap'}}>
            <EOPill>drift · pediatric +34%</EOPill>
            <EOPill>construct · c2 JHA 0.58</EOPill>
            <EOPill>incident · INC-2026-04-27</EOPill>
            <EOPill>uncertainty · c4 confidence ↓</EOPill>
          </div>

          {/* sprint draft */}
          <div className="card" style={{marginTop:16, padding:'18px 22px', borderColor:'oklch(0.85 0.06 268)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span className="chip accent">draft sprint</span>
              <span style={{fontSize:11, color:'var(--ink-3)'}} className="mono">proposed by optimizer · today</span>
              <span style={{flex:1}}/>
              <button className="btn">Discard</button>
              <button className="btn primary">Open sprint →</button>
            </div>

            <div style={{marginTop:14}}>
              <div className="eyebrow">name</div>
              <div className="serif" style={{fontSize:22, fontWeight:500, marginTop:3, letterSpacing:'-0.01em'}}>Pediatric safety · 3-day workshop</div>
            </div>

            <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <EOField label="goal" value="Lift c2 JHA on pediatric slice from 0.58 → 0.80; close INC-2026-04-27."/>
              <EOField label="duration" value="3 days · workshop format · synchronous SME hours day 2"/>
              <EOField label="participants" value="2 physician SMEs · 1 developer · optimizer"/>
              <EOField label="scope" value="rubric c2 only · pediatric slice"/>
            </div>

            <div style={{marginTop:18}}>
              <div className="eyebrow" style={{marginBottom:8}}>plan</div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                <EOStep n="1" head="Curate review feed" body="25 pediatric traces from production (drift cluster + incident set), 4 starter exemplars from setup data."/>
                <EOStep n="2" head="Elicit & codify" body="Pass-1 blind review by both SMEs on 12 traces · Pass-2 reactions on judge v0.4 · resolve thread #11 · promote rubric v0.4 (c2 split)."/>
                <EOStep n="3" head="Improve judge" body="Regenerate judge-clinical → v0.5 with split criteria · regression vs anchor set · target JHA ≥ 0.80 on pediatric slice."/>
                <EOStep n="4" head="Close incident" body="Shadow v0.5 over INC trace set · sign-off · roll to production · monitor for 48h."/>
              </div>
            </div>

            <div style={{marginTop:18, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
              <EOCell label="feed prefill" v="29 traces"/>
              <EOCell label="rubric target" v="v0.4 · c2 split"/>
              <EOCell label="judge target" v="v0.5"/>
              <EOCell label="exit criterion" v="JHA ≥ 0.80"/>
            </div>
          </div>

          {/* alternatives */}
          <div style={{marginTop:16}}>
            <div className="eyebrow">alternatives</div>
            <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:6}}>
              <EOAlt title="Patch + monitor (no sprint)" body="Apply system-prompt patch only; monitor 48h. Faster, but doesn't address c2 weakness."/>
              <EOAlt title="Full sprint · 2 weeks" body="Includes broader rubric review beyond c2. Recommended only if signals widen."/>
              <EOAlt title="Merge into existing sprint #3" body="Adds pediatric scope to current warfarin sprint. Risk: scope creep, IRR may suffer."/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EOField({ label, value }){
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div style={{fontSize:12.5, color:'var(--ink-2)', marginTop:3, lineHeight:1.5}}>{value}</div>
    </div>
  );
}

function EOStep({ n, head, body }){
  return (
    <div style={{display:'flex', gap:12, padding:'10px 12px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)'}}>
      <span className="mono" style={{width:22, height:22, borderRadius:11, background:'var(--ink)', color:'var(--paper)', fontSize:11, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>{n}</span>
      <div style={{flex:1}}>
        <div style={{fontSize:12.5, fontWeight:500}}>{head}</div>
        <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:3, lineHeight:1.5}}>{body}</div>
      </div>
    </div>
  );
}

function EOCell({ label, v }){
  return (
    <div style={{padding:'8px 10px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)'}}>
      <div className="eyebrow">{label}</div>
      <div className="mono" style={{fontSize:12, fontWeight:500, marginTop:3}}>{v}</div>
    </div>
  );
}

function EOAlt({ title, body }){
  return (
    <div style={{padding:'10px 12px', borderRadius:'var(--r-sm)', border:'1px solid var(--line)', background:'var(--paper)', display:'flex', gap:10, alignItems:'flex-start'}}>
      <div style={{flex:1}}>
        <div style={{fontSize:12, fontWeight:500}}>{title}</div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:3, lineHeight:1.5}}>{body}</div>
      </div>
      <button className="btn">Choose</button>
    </div>
  );
}

Object.assign(window, { EvalOpsA, EvalOpsB, EvalOpsC });
