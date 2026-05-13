// JBW v2 — Setup IA exploration.
// Three directions for "Setup-as-workflow over durable Project Settings".
//
// Anchored vocabulary:
//   Setup workflow ┐
//   Project settings  ├ same artifacts, different frame.
//
// Artifacts (in dependency order):
//   1. Project profile      (name, description, domain)        — blocks rubric draft
//   2. Trace source         (MLflow experiment binding)         — blocks trace pool
//   3. Rubric               (criteria + dimensions)             — needed for judge + sampling
//   4. Baseline judge       (model + prompt)                    — needed for judge-dependent sampling
//   5. Trace pool           (sampling plan)                     — needed for sprint
//   6. Participants         (SMEs + roles)                      — needed for sprint
//   7. Sprint defaults      (timebox, k, targets)               — sprint-launch params
//
// Sprint creation is the same workflow shape, against existing artifacts.
//
// Three artboards: A (Guided Settings Rail), B (Workflow Shell), C (Command Center).

const { useState: useS_setup } = React;

// ── Shared model ──────────────────────────────────────────────────────────
const ARTIFACTS = [
  { id:'profile', label:'Project profile',  hint:'name · description · domain',
    op:'Set up project profile',  state:'done',     blocks:[],
    summary:'support-agent-eval · Consumer fintech · Calibrate factual, tone, money-safety.' },
  { id:'source',  label:'Trace source',     hint:'MLflow experiment',
    op:'Connect MLflow experiment', state:'done',   blocks:[],
    summary:'mlflow · prod-support-q2 · 14,820 traces · last sync 4m ago' },
  { id:'rubric',  label:'Rubric',           hint:'criteria · dimensions',
    op:'Define rubric',           state:'active',   blocks:['profile'],
    summary:'4 starter criteria drafted from project profile · v0 unsaved' },
  { id:'judge',   label:'Baseline judge',   hint:'model · prompt',
    op:'Configure judge',         state:'blocked',  blocks:['rubric'],
    summary:'requires rubric · proposed: claude-haiku-4-5 · v0 prompt' },
  { id:'pool',    label:'Trace pool',       hint:'sampling plan',
    op:'Sample 50 traces',        state:'blocked',  blocks:['source','rubric','judge'],
    summary:'requires judge for stratification · proposed: stratified · 50 traces' },
  { id:'people',  label:'Participants',     hint:'SMEs · roles',
    op:'Invite participants',     state:'todo',     blocks:[],
    summary:'1 facilitator · 0 SMEs invited' },
  { id:'sprint',  label:'Sprint defaults',  hint:'timebox · k · targets',
    op:'Set sprint defaults',     state:'blocked',  blocks:['pool','people'],
    summary:'requires trace pool + ≥1 SME · proposed: bootstrap · 15 traces · 2h live · κ≥0.7' },
];

const STATE_TONE = {
  done:    { dot:'var(--good)',   chip:'good',   label:'configured' },
  active:  { dot:'var(--accent)', chip:'accent', label:'in progress' },
  todo:    { dot:'var(--ink-4)',  chip:'',       label:'todo' },
  blocked: { dot:'var(--ink-4)',  chip:'',       label:'blocked' },
};

const NEXT_OP = (() => {
  // first non-done, non-blocked
  const a = ARTIFACTS.find(x => x.state==='active') || ARTIFACTS.find(x=>x.state==='todo');
  return a || ARTIFACTS[0];
})();

const PROGRESS = (() => {
  const total = ARTIFACTS.length;
  const done = ARTIFACTS.filter(x=>x.state==='done').length;
  return { done, total, pct: Math.round(100*done/total) };
})();

// shared header — same shell across the three directions
function SetupHeader({ kind, mode='first-run', right }){
  return (
    <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--ink-3)'}}>
        <span style={{color:'var(--ink-2)', fontWeight:600}}>JBW</span>
        <I.chev/>
        <span>support-agent-eval</span>
        <I.chev/>
        <span style={{color:'var(--ink)', fontWeight:600}}>{kind}</span>
        <span className="chip" style={{marginLeft:8, padding:'1px 7px', fontSize:10}}>
          {mode==='first-run' ? 'first-run' : 'maintenance'}
        </span>
      </div>
      {right}
    </div>
  );
}

// status pill — same vocabulary across all 3 directions
function StatePill({ state }){
  const tone = STATE_TONE[state];
  return (
    <span className={`chip ${tone.chip}`} style={{padding:'2px 7px', fontSize:10, gap:5}}>
      <Dot color={tone.dot} size={5}/>{tone.label}
    </span>
  );
}

// ── Variation A: GUIDED SETTINGS RAIL ─────────────────────────────────────
// "Settings is the page. Setup is a rail on the left that progresses you
// through the sections and surfaces the next-best-action."
function SetupA(){
  const [open, setOpen] = useS_setup('rubric');
  const cur = ARTIFACTS.find(a=>a.id===open) || ARTIFACTS[2];

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <SetupHeader kind="Project settings" right={
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{fontSize:11, color:'var(--ink-3)'}}>Setup · {PROGRESS.done} of {PROGRESS.total}</span>
          <button className="btn ghost" style={{padding:'4px 8px'}}>Skip setup →</button>
          <button className="btn primary"><I.spark/>{NEXT_OP.op}</button>
        </div>
      }/>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'280px 1fr', minHeight:0}}>
        {/* LEFT RAIL — setup workflow as progress rail over settings sections */}
        <div style={{borderRight:'1px solid var(--line)', background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'18px 20px 10px'}}>
            <div className="eyebrow" style={{marginBottom:6}}>SETUP WORKFLOW</div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <ProgressRing pct={PROGRESS.pct} size={36}/>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>{PROGRESS.done}/{PROGRESS.total} configured</div>
                <div style={{fontSize:11, color:'var(--ink-3)'}}>{ARTIFACTS.length - PROGRESS.done} remaining · 1 blocked</div>
              </div>
            </div>
          </div>

          <div className="dotline" style={{margin:'4px 16px'}}/>

          <div className="scroll" style={{flex:1, overflowY:'auto', padding:'8px 8px 14px'}}>
            {ARTIFACTS.map(a=>{
              const sel = a.id===open;
              const blocked = a.state==='blocked';
              const tone = STATE_TONE[a.state];
              return (
                <button key={a.id} onClick={()=>setOpen(a.id)} disabled={blocked}
                  style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center',
                    width:'100%', textAlign:'left', cursor: blocked?'not-allowed':'pointer',
                    padding:'10px 12px', borderRadius:8, border:'none',
                    background: sel?'var(--paper)':'transparent',
                    boxShadow: sel?'0 0 0 1px var(--ink) inset':'none',
                    opacity: blocked?0.55:1}}>
                  <span style={{
                    width:22, height:22, borderRadius:11,
                    background: a.state==='done'?'var(--good)': a.state==='active'?'var(--accent)':'var(--paper-3)',
                    color: (a.state==='done'||a.state==='active')?'var(--paper)':'var(--ink-3)',
                    border:'1px solid var(--line)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:600,
                  }}>
                    {a.state==='done' ? <I.check/> : ARTIFACTS.indexOf(a)+1}
                  </span>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12.5, fontWeight: sel?600:500, color: blocked?'var(--ink-3)':'var(--ink)'}}>{a.label}</div>
                    <div style={{fontSize:10.5, color:'var(--ink-4)'}}>{blocked ? `requires ${a.blocks.map(b=>ARTIFACTS.find(x=>x.id===b).label).join(' + ')}` : a.hint}</div>
                  </div>
                  {a.state==='active' && <Dot color="var(--accent)"/>}
                  {blocked && <span style={{fontSize:10, color:'var(--ink-4)'}}>🔒</span>}
                </button>
              );
            })}
          </div>

          <div style={{padding:'10px 14px 14px', borderTop:'1px solid var(--line)', background:'var(--paper)'}}>
            <div className="eyebrow" style={{marginBottom:6}}>NEXT BEST ACTION</div>
            <div style={{display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--paper-2)', borderRadius:8, border:'1px solid var(--line-2)'}}>
              <Blob seed={NEXT_OP.id} size={20}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:12, fontWeight:600}}>{NEXT_OP.op}</div>
                <div style={{fontSize:10.5, color:'var(--ink-3)'}}>unblocks judge, pool, sprint</div>
              </div>
              <button className="btn primary" style={{padding:'4px 8px', fontSize:11}}>Go</button>
            </div>
          </div>
        </div>

        {/* RIGHT — settings section detail */}
        <div className="scroll" style={{overflowY:'auto', minHeight:0}}>
          <div style={{padding:'24px 32px 16px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:18}}>
            <div style={{minWidth:0}}>
              <div className="eyebrow" style={{marginBottom:6}}>PROJECT SETTINGS · {cur.label.toUpperCase()}</div>
              <div className="serif" style={{fontSize:30, fontWeight:500, letterSpacing:'-0.01em', lineHeight:1.1}}>{cur.label}</div>
              <div style={{fontSize:13, color:'var(--ink-3)', marginTop:6, maxWidth:560}}>{cur.summary}</div>
            </div>
            <StatePill state={cur.state}/>
          </div>

          {/* Generic settings body for the active artifact */}
          <SettingsBody artifact={cur}/>

          {/* Why-this-matters footer */}
          <div style={{margin:'18px 32px 28px', padding:'12px 14px', background:'var(--paper-2)', borderRadius:'var(--r)', border:'1px solid var(--line-2)', display:'flex', gap:12, alignItems:'flex-start'}}>
            <I.spark/>
            <div style={{flex:1, fontSize:12, color:'var(--ink-3)', lineHeight:1.55}}>
              <strong style={{color:'var(--ink-2)'}}>Why this is in setup:</strong> the rubric is a durable project setting — once defined it lives across every sprint. We surface it during setup because <strong>baseline judge</strong> and <strong>trace pool sampling</strong> can't be configured until it exists.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ pct, size=36 }){
  const r = (size-4)/2;
  const c = 2*Math.PI*r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth="3"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth="3"
        strokeDasharray={`${c*pct/100} ${c}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle"
        fontSize={size*0.32} fontWeight="600" fill="var(--ink)" fontFamily="var(--mono)">{pct}</text>
    </svg>
  );
}

function SettingsBody({ artifact }){
  // We use rubric as the canonical body; other artifacts are stubs for compactness.
  if (artifact.id === 'rubric') return <RubricBody/>;
  if (artifact.id === 'profile') return <ProfileBody/>;
  if (artifact.id === 'source') return <SourceBody/>;
  if (artifact.id === 'judge') return <BlockedBody artifact={artifact}/>;
  if (artifact.id === 'pool') return <BlockedBody artifact={artifact}/>;
  if (artifact.id === 'people') return <PeopleBody/>;
  if (artifact.id === 'sprint') return <BlockedBody artifact={artifact}/>;
  return null;
}

function RubricBody(){
  return (
    <div style={{padding:'8px 32px 0', display:'flex', flexDirection:'column', gap:14}}>
      <div className="card" style={{padding:'14px 16px'}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8}}>
          <div style={{display:'flex', alignItems:'baseline', gap:10}}>
            <span style={{fontSize:14, fontWeight:600}}>Criteria</span>
            <span style={{fontSize:11, color:'var(--ink-3)'}}>4 starter · drafted from project profile</span>
          </div>
          <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}><I.spark/>Re-draft</button>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {[
            { t:'Factual accuracy on account/billing', k:'binary' },
            { t:'Empathetic tone (not patronizing)',    k:'likert' },
            { t:'Money-movement safety',                k:'likert' },
            { t:'Resolution clarity',                   k:'likert' },
          ].map((c,i)=>(
            <div key={i} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:10, alignItems:'center', padding:'9px 12px', background:'var(--paper-2)', borderRadius:6, border:'1px solid var(--line-2)'}}>
              <span className="mono" style={{fontSize:10.5, color:'var(--ink-4)'}}>c{i+1}</span>
              <span style={{fontSize:12.5}}>{c.t}</span>
              <span className="chip" style={{fontSize:9.5, padding:'1px 6px'}}>{c.k}</span>
              <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>edit</button>
            </div>
          ))}
          <button className="btn ghost" style={{justifyContent:'flex-start', padding:'6px 10px', alignSelf:'flex-start'}}><I.plus/>Add criterion</button>
        </div>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <div className="card" style={{padding:'14px 16px'}}>
          <div className="eyebrow" style={{marginBottom:6}}>SCORING SHAPE</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            <span className="chip accent" style={{padding:'3px 8px'}}>per-criterion · 1–5</span>
            <span className="chip" style={{padding:'3px 8px'}}>+ rationale</span>
            <span className="chip" style={{padding:'3px 8px'}}>+ confidence</span>
          </div>
        </div>
        <div className="card" style={{padding:'14px 16px'}}>
          <div className="eyebrow" style={{marginBottom:6}}>VERSIONING</div>
          <div style={{fontSize:12, color:'var(--ink-2)'}}>Saving promotes <span className="mono">v0 → v1</span>. Live across all sprints.</div>
          <div style={{display:'flex', gap:6, marginTop:8}}>
            <button className="btn">Save as draft</button>
            <button className="btn primary"><I.check/>Save & promote v1</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileBody(){
  return (
    <div style={{padding:'8px 32px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
      <ReadOnlyField label="Name"        value="support-agent-eval" mono/>
      <ReadOnlyField label="Domain"      value="Consumer fintech support"/>
      <ReadOnlyField label="Description" value="Calibrate the consumer-fintech support agent — factual, tone, money-safety." span={2}/>
      <ReadOnlyField label="Created"     value="3d ago by you"/>
      <ReadOnlyField label="Owner"       value="Devon Park"/>
    </div>
  );
}
function SourceBody(){
  return (
    <div style={{padding:'8px 32px 0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
      <ReadOnlyField label="Provider"    value="MLflow" mono/>
      <ReadOnlyField label="Experiment"  value="prod-support-q2" mono/>
      <ReadOnlyField label="Trace count" value="14,820"/>
      <ReadOnlyField label="Last sync"   value="4 min ago · auto every 15m"/>
    </div>
  );
}
function PeopleBody(){
  return (
    <div style={{padding:'8px 32px 0'}}>
      <div className="card" style={{padding:'14px 16px'}}>
        <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
          <span className="chip" style={{padding:'4px 8px'}}><Avatar name="You" size={16}/>You · facilitator</span>
          <span className="chip" style={{padding:'4px 10px', borderStyle:'dashed', cursor:'pointer'}}><I.plus/>Invite SME</span>
        </div>
        <div style={{marginTop:10, padding:'8px 10px', background:'oklch(0.96 0.07 75)', borderRadius:6, fontSize:11.5, color:'oklch(0.45 0.13 75)'}}>
          ⚠ Sprint creation requires at least one SME.
        </div>
      </div>
    </div>
  );
}
function BlockedBody({ artifact }){
  const blockers = artifact.blocks.map(b=>ARTIFACTS.find(x=>x.id===b));
  return (
    <div style={{padding:'8px 32px 0'}}>
      <div className="card" style={{padding:'18px 20px', background:'var(--paper-2)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
          <span style={{fontSize:18}}>🔒</span>
          <span className="serif" style={{fontSize:18, fontWeight:500}}>Configure {blockers.map(b=>b.label).join(' + ').toLowerCase()} first.</span>
        </div>
        <div style={{fontSize:12, color:'var(--ink-3)', lineHeight:1.55}}>
          {artifact.summary}
        </div>
        <div style={{marginTop:14, display:'flex', gap:8}}>
          {blockers.map(b=>(
            <button key={b.id} className="btn">{b.op} →</button>
          ))}
        </div>
      </div>
    </div>
  );
}
function ReadOnlyField({ label, value, mono, span }){
  return (
    <div style={{gridColumn: span?`span ${span}`:'auto'}}>
      <div className="eyebrow" style={{marginBottom:5}}>{label}</div>
      <div style={{padding:'9px 12px', background:'var(--paper-2)', border:'1px solid var(--line-2)', borderRadius:6, fontSize:12.5, color:'var(--ink-2)', fontFamily: mono?'var(--mono)':'var(--sans)'}}>{value}</div>
    </div>
  );
}

Object.assign(window, { SetupA, ARTIFACTS, NEXT_OP, PROGRESS, STATE_TONE, SetupHeader, StatePill, ProgressRing, SettingsBody });
