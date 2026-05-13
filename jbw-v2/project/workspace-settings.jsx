// JBW v2 — Settings & Setup handoff
// Three directions:
//   A · Project settings — durable home for the things setup configured
//   B · Setup handoff    — first-run wizard that drains into a starter Workspace
//   C · Living settings  — settings as a sidebar accessible inside Workspace

const { useState: useS_st } = React;

// ─────────────────────────────────────────────────────────────────
// A · Project settings (durable)
// ─────────────────────────────────────────────────────────────────
function SettingsA(){
  const [tab, setTab] = useS_st('project');
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <STHeader sub="Project settings · durable home for system-under-review, sources, participants, defaults"/>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'220px 1fr', gap:1, background:'var(--line)'}}>
        {/* nav */}
        <div style={{background:'var(--paper-2)', padding:'14px 8px', display:'flex', flexDirection:'column', gap:1}}>
          {[
            ['project','Project'],
            ['system','System under review'],
            ['source','MLflow / trace source'],
            ['people','Participants'],
            ['integrations','Integrations'],
            ['defaults','Defaults'],
            ['advanced','Advanced'],
          ].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{textAlign:'left', padding:'7px 12px', borderRadius:'var(--r-sm)', background: k===tab?'oklch(0.97 0.03 268)':'transparent', border:'none', cursor:'pointer', fontSize:12, color: k===tab?'var(--ink)':'var(--ink-2)', fontWeight: k===tab?500:400}}>{l}</button>
          ))}
          <div style={{flex:1}}/>
          <div style={{fontSize:10.5, color:'var(--ink-4)', padding:'8px 12px', lineHeight:1.5}}>
            Settings is durable, not a wizard. Setup populated this — change anything any time.
          </div>
        </div>

        <div style={{background:'var(--paper)', overflow:'auto', padding:'24px 32px'}} className="scroll">
          {tab==='project' && <STSectProject/>}
          {tab==='system'  && <STSectSystem/>}
          {tab==='source'  && <STSectSource/>}
          {tab==='people'  && <STSectPeople/>}
          {tab==='integrations' && <STSectIntegrations/>}
          {tab==='defaults' && <STSectDefaults/>}
          {tab==='advanced' && <STSectAdvanced/>}
        </div>
      </div>
    </div>
  );
}

function STHeader({ sub, title='Settings' }){
  return (
    <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <a style={{fontSize:11, color:'var(--ink-3)'}}>← Workspace</a>
          <span style={{fontSize:11, color:'var(--ink-4)'}}>/</span>
          <span style={{fontSize:13, fontWeight:600}}>{title}</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
      </div>
      <button className="btn">Saved · just now</button>
    </div>
  );
}

function STSectProject(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>Project</STH2>
      <STRow label="Project name"><STInput value="ClinicalAdvisor · v2 evaluation"/></STRow>
      <STRow label="Description"><STTextarea value="Evaluating the clinical-advice assistant for safety, accuracy, and tone across patient-facing and clinician-facing modes."/></STRow>
      <STRow label="Project ID"><span className="mono" style={{fontSize:11, color:'var(--ink-3)'}}>proj_clinical-advisor_v2</span></STRow>
      <STRow label="Created"><span style={{fontSize:11, color:'var(--ink-3)'}}>2026-04-23 · by Bo Tanaka</span></STRow>

      <STH2 style={{marginTop:32}}>Active sprint</STH2>
      <div className="card" style={{padding:'12px 14px'}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span className="chip"><Dot color="var(--good)"/>sprint #3 · day 4 of 5</span>
          <span style={{fontSize:12.5, fontWeight:500}}>Warfarin · split safety criterion</span>
          <span style={{flex:1}}/>
          <a style={{fontSize:11, color:'var(--accent)'}}>open in Workspace ↗</a>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:5}}>Sprint is a goal-tracking container; not a phase the project is in.</div>
      </div>
    </div>
  );
}

function STSectSystem(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>System under review</STH2>
      <STRow label="System name"><STInput value="ClinicalAdvisor"/></STRow>
      <STRow label="Description" sub="What it does, who it serves, and how it should behave. The optimizer uses this to seed the starter rubric.">
        <STTextarea h={120} value={`A patient-facing and clinician-facing chat assistant for non-emergency clinical questions. It must:\n· avoid recommending action that requires direct clinical examination\n· cite sources for dosing, contraindications, and red flags\n· match tone to audience (lay vs clinician)\n· defer to local protocols when given`}/>
      </STRow>
      <STRow label="Current version"><STInput value="ca-2026.04.21" mono/></STRow>
      <STRow label="Version source"><div style={{display:'flex', gap:6, alignItems:'center'}}><STInput value="github.com/clinicaladvisor/ca · main@a3f29c7" mono/><button className="btn">Re-link</button></div></STRow>
      <STRow label="Production traffic" sub="Source for trace ingestion and ops monitoring."><span className="chip">~14k traces / day</span></STRow>
    </div>
  );
}

function STSectSource(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>MLflow · trace source</STH2>
      <STRow label="MLflow experiment"><div style={{display:'flex', gap:6, alignItems:'center'}}><STInput value="exp_clinical-advisor_eval" mono/><span className="chip good">connected</span></div></STRow>
      <STRow label="Trace ingestion"><span style={{fontSize:11, color:'var(--ink-3)'}}>continuous · prod tagged · 14.2k / 24h</span></STRow>
      <STRow label="Anchor sets" sub="Frozen subsets used for regression. Surfaced in Grading and Eval Ops.">
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {[
            {n:'starter-v1', size:'12 traces', use:'sprint #1 baseline'},
            {n:'warfarin-anchors', size:'24 traces', use:'sprint #3 regression'},
            {n:'incident-set · INC-2026-04-27', size:'8 traces', use:'eval ops'},
          ].map(a=>(
            <div key={a.n} style={{display:'flex', alignItems:'center', gap:8, padding:'8px 10px', border:'1px solid var(--line)', borderRadius:'var(--r-sm)'}}>
              <span className="mono" style={{fontSize:11, fontWeight:500}}>{a.n}</span>
              <span style={{fontSize:11, color:'var(--ink-3)'}}>{a.size}</span>
              <span style={{flex:1}}/>
              <span style={{fontSize:11, color:'var(--ink-4)'}}>{a.use}</span>
            </div>
          ))}
          <button className="btn ghost" style={{alignSelf:'flex-start', fontSize:11}}>+ Anchor set</button>
        </div>
      </STRow>
    </div>
  );
}

function STSectPeople(){
  const ppl = [
    {n:'Bo Tanaka',     role:'admin · physician SME',    last:'2h ago',  irr:'0.78'},
    {n:'Alice Chen',    role:'physician SME',            last:'1h ago',  irr:'0.74'},
    {n:'Carla Mendes',  role:'mental health SME',        last:'12m ago', irr:'0.69'},
    {n:'Devon Park',    role:'developer',                last:'4h ago',  irr:'—'},
    {n:'Faye Ortiz',    role:'translator SME (pt-BR)',   last:'yesterday', irr:'0.92'},
  ];
  return (
    <div style={{maxWidth:760}}>
      <STH2>Participants</STH2>
      <div className="card" style={{padding:0, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1fr 80px 80px', padding:'8px 14px', background:'var(--paper-2)', fontSize:10.5, color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'0.05em'}}>
          <span>Name</span><span>Role</span><span>Last active</span><span>IRR</span><span/>
        </div>
        {ppl.map(p=>(
          <div key={p.n} style={{display:'grid', gridTemplateColumns:'1.6fr 1.4fr 1fr 80px 80px', padding:'10px 14px', borderTop:'1px solid var(--line)', alignItems:'center', fontSize:12}}>
            <span style={{display:'flex', alignItems:'center', gap:8}}><Avatar name={p.n} size={22}/>{p.n}</span>
            <span style={{color:'var(--ink-3)'}}>{p.role}</span>
            <span style={{color:'var(--ink-4)', fontSize:11}}>{p.last}</span>
            <span className="mono tnum" style={{fontSize:11}}>{p.irr}</span>
            <span style={{textAlign:'right'}}><a style={{fontSize:11, color:'var(--accent)'}}>edit</a></span>
          </div>
        ))}
      </div>
      <div style={{display:'flex', gap:8, marginTop:14}}>
        <STInput placeholder="email@org.com"/>
        <select className="btn" style={{fontSize:11}}><option>SME</option><option>Developer</option><option>Admin</option></select>
        <button className="btn primary">Send invite</button>
      </div>
      <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:8}}>Invites can be tied directly to the next sprint by selecting it; their first task lands in their feed.</div>
    </div>
  );
}

function STSectIntegrations(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>Integrations</STH2>
      {[
        {n:'MLflow', s:'connected', d:'exp_clinical-advisor_eval · auto-trace'},
        {n:'GitHub', s:'connected', d:'clinicaladvisor/ca · code references in lineage'},
        {n:'Slack',  s:'connected', d:'#clinical-eval · sprint digests + incident pings'},
        {n:'PagerDuty', s:'optional', d:'route eval-ops incidents'},
        {n:'OpenAI / Anthropic', s:'connected', d:'judge model providers'},
      ].map(i=>(
        <div key={i.n} className="card" style={{padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:12.5, fontWeight:500, minWidth:120}}>{i.n}</span>
          <span style={{fontSize:11, color:'var(--ink-3)', flex:1}}>{i.d}</span>
          <span className={`chip ${i.s==='connected'?'good':''}`} style={{fontSize:10}}>{i.s}</span>
          <button className="btn" style={{fontSize:11}}>Configure</button>
        </div>
      ))}
    </div>
  );
}

function STSectDefaults(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>Defaults</STH2>
      <STRow label="Review pass" sub="Default for new feed items added by SME, optimizer, or developer.">
        <div style={{display:'flex', gap:6}}>
          <STToggle label="blind first" on/>
          <STToggle label="reaction first"/>
          <STToggle label="ask user"/>
        </div>
      </STRow>
      <STRow label="Active learning" sub="Optimizer mix when adding traces.">
        <STMix items={[['judge-uncertain',40],['confident-wrong',25],['novel cluster',20],['random audit',15]]}/>
      </STRow>
      <STRow label="Sprint length default"><div style={{display:'flex', gap:6}}><STToggle label="workshop · 1–3d"/><STToggle label="standard · 1w" on/><STToggle label="long · 2w"/></div></STRow>
      <STRow label="Discussion privacy" sub="Threads attached to traces and criteria are visible to:"><div style={{display:'flex', gap:6}}><STToggle label="all participants" on/><STToggle label="role-scoped"/></div></STRow>
    </div>
  );
}

function STSectAdvanced(){
  return (
    <div style={{maxWidth:680}}>
      <STH2>Advanced</STH2>
      <STRow label="Lineage retention"><span style={{fontSize:11, color:'var(--ink-3)'}}>full · indefinite (recommended)</span></STRow>
      <STRow label="Judge sandbox"><STToggle label="on" on/></STRow>
      <STRow label="Export" sub="Audit-ready bundle including rubric versions, judgements, threads, and lineage edges.">
        <button className="btn">Export project archive</button>
      </STRow>
      <STRow label="Danger zone"><button className="btn" style={{color:'var(--bad)', borderColor:'oklch(0.85 0.1 25)'}}>Archive project</button></STRow>
    </div>
  );
}

function STH2({ children, style }){ return <h2 style={{fontSize:14, fontWeight:600, margin:'0 0 12px', letterSpacing:'-0.005em', ...style}} className="serif">{children}</h2>; }
function STRow({ label, sub, children }){
  return (
    <div style={{display:'grid', gridTemplateColumns:'180px 1fr', gap:18, padding:'12px 0', borderTop:'1px solid var(--line)'}}>
      <div>
        <div style={{fontSize:12, fontWeight:500}}>{label}</div>
        {sub && <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:3, lineHeight:1.45}}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
function STInput({ value, placeholder, mono }){
  return <input defaultValue={value} placeholder={placeholder} className={mono?'mono':''} style={{width:'100%', padding:'7px 10px', border:'1px solid var(--line)', borderRadius:'var(--r-sm)', fontSize:12, background:'var(--paper)', color:'var(--ink)', outline:'none', fontFamily: mono?'var(--mono)':'inherit'}}/>;
}
function STTextarea({ value, h=70 }){
  return <textarea defaultValue={value} style={{width:'100%', height:h, padding:'8px 10px', border:'1px solid var(--line)', borderRadius:'var(--r-sm)', fontSize:12, background:'var(--paper)', color:'var(--ink-2)', outline:'none', resize:'vertical', lineHeight:1.5, fontFamily:'inherit'}}/>;
}
function STToggle({ label, on }){
  return <span className={`chip ${on?'accent':''}`} style={{cursor:'pointer', fontSize:11, padding:'5px 10px'}}>{label}</span>;
}
function STMix({ items }){
  return (
    <div>
      <div style={{display:'flex', height:14, borderRadius:7, overflow:'hidden', border:'1px solid var(--line)'}}>
        {items.map(([n,p],i)=>{
          const c = ['var(--accent)','var(--bad)','var(--violet)','var(--ink-3)'][i];
          return <div key={n} style={{width:`${p}%`, background:c, opacity:0.85}}/>;
        })}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', gap:10, marginTop:6, fontSize:11, color:'var(--ink-3)'}}>
        {items.map(([n,p],i)=>{
          const c = ['var(--accent)','var(--bad)','var(--violet)','var(--ink-3)'][i];
          return <span key={n} style={{display:'inline-flex', alignItems:'center', gap:5}}><span style={{width:8,height:8,background:c,borderRadius:2}}/>{n} <span className="mono tnum">{p}%</span></span>;
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// B · Setup handoff (first-run)
// ─────────────────────────────────────────────────────────────────
function SettingsB(){
  // setup as a 4-step path that feeds directly into a starter Workspace
  const [step, setStep] = useS_st(3); // show late stage so handoff is visible
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontSize:13, fontWeight:600}}>Setup</span>
            <span className="chip">prerequisite · not a CUJ</span>
          </div>
          <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>Connects MLflow, names the system, invites people, and drains into a starter Workspace.</div>
        </div>
        <a style={{fontSize:11, color:'var(--ink-3)'}}>Skip & explore empty Workspace →</a>
      </div>

      {/* progress */}
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper-2)', display:'flex', gap:8, alignItems:'center'}}>
        {['Project','System','Trace source','Participants','Handoff'].map((l,i)=>(
          <React.Fragment key={l}>
            <button onClick={()=>setStep(i)} style={{display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:'var(--r-sm)', background: i<=step?'oklch(0.97 0.03 268)':'transparent', border:`1px solid ${i<=step?'oklch(0.85 0.06 268)':'var(--line)'}`, cursor:'pointer'}}>
              <span className="mono" style={{width:18,height:18,borderRadius:9,background: i<step?'var(--accent)':i===step?'var(--ink)':'var(--paper-3)', color:'white', fontSize:10, display:'inline-flex', alignItems:'center', justifyContent:'center'}}>{i<step?'✓':i+1}</span>
              <span style={{fontSize:11.5, fontWeight: i===step?500:400}}>{l}</span>
            </button>
            {i<4 && <span style={{flex:1, height:1, background:'var(--line)'}}/>}
          </React.Fragment>
        ))}
      </div>

      <div style={{flex:1, minHeight:0, overflow:'auto'}} className="scroll">
        {step<4 && <STSetupForm step={step} onNext={()=>setStep(step+1)}/>}
        {step===4 && <STSetupHandoff onBack={()=>setStep(3)}/>}
      </div>
    </div>
  );
}

function STSetupForm({ step, onNext }){
  const sections = [
    { title:'Name your project', body:<>
        <STRow label="Project name"><STInput value="ClinicalAdvisor · v2 evaluation"/></STRow>
        <STRow label="Short description" sub="One line. Teammates see this in the workspace switcher."><STInput value="Eval the clinical-advice assistant on safety, accuracy, tone."/></STRow>
      </>},
    { title:'Describe the system under review', body:<>
        <STRow label="System name"><STInput value="ClinicalAdvisor"/></STRow>
        <STRow label="What does it do?" sub="Used to seed your starter rubric. The more specific, the better the first criteria.">
          <STTextarea h={140} value={`A patient-facing and clinician-facing chat assistant for non-emergency clinical questions. Must avoid recommending action requiring direct exam, cite sources for dosing, match tone to audience.`}/>
        </STRow>
        <STRow label="Version" sub="Captured for lineage so we know what produced any given trace."><STInput value="ca-2026.04.21 · github main@a3f29c7" mono/></STRow>
      </>},
    { title:'Connect your trace source', body:<>
        <STRow label="MLflow experiment"><div style={{display:'flex', gap:6, alignItems:'center'}}><STInput value="exp_clinical-advisor_eval" mono/><span className="chip good">connected</span></div></STRow>
        <STRow label="Sample of recent traces" sub="What we saw. These will populate your starter Review Feed.">
          <div className="card" style={{padding:'10px 12px'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--ink-3)'}}>
              <span className="mono">last 7 days · 96k traces</span>
              <span style={{flex:1}}/>
              <span>topics:</span>
              {[['anticoag',32],['mental health',24],['pediatric',18],['translation',14],['admin',12]].map(([t,p])=><span key={t} className="chip" style={{fontSize:10}}>{t} <span className="mono tnum" style={{color:'var(--ink-4)'}}>{p}%</span></span>)}
            </div>
          </div>
        </STRow>
      </>},
    { title:'Invite teammates', body:<>
        <STRow label="Add SMEs and developers" sub="Their first review item will be waiting in their feed.">
          <div className="card" style={{padding:'12px 14px'}}>
            {['Alice Chen · physician SME','Bo Tanaka · physician SME','Carla Mendes · MH SME','Devon Park · developer'].map(p=>(
              <div key={p} style={{display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--line)', fontSize:12}}>
                <Avatar name={p} size={20}/>
                <span>{p.split(' · ')[0]}</span>
                <span style={{fontSize:10.5, color:'var(--ink-3)'}}>{p.split(' · ')[1]}</span>
                <span style={{flex:1}}/>
                <span className="chip good" style={{fontSize:10}}>queued</span>
              </div>
            ))}
            <div style={{display:'flex', gap:6, marginTop:10}}>
              <STInput placeholder="email@org.com"/>
              <button className="btn">Add</button>
            </div>
          </div>
        </STRow>
      </>},
  ];
  const s = sections[step];
  return (
    <div style={{padding:'28px 32px', maxWidth:760, margin:'0 auto'}}>
      <h1 className="serif" style={{fontSize:24, fontWeight:500, letterSpacing:'-0.01em', margin:'0 0 18px'}}>{s.title}</h1>
      <div style={{borderTop:'1px solid var(--line)', marginBottom:6}}/>
      {s.body}
      <div style={{display:'flex', gap:8, marginTop:24, justifyContent:'flex-end'}}>
        <button className="btn">Back</button>
        <button onClick={onNext} className="btn primary">Continue →</button>
      </div>
    </div>
  );
}

function STSetupHandoff({ onBack }){
  return (
    <div style={{padding:'28px 32px', maxWidth:980, margin:'0 auto'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
        <span className="chip accent">handoff</span>
        <span style={{fontSize:11, color:'var(--ink-3)'}}>setup is done · this is the last screen of setup and the first screen of the product</span>
      </div>
      <h1 className="serif" style={{fontSize:28, fontWeight:500, letterSpacing:'-0.01em', margin:'0 0 8px'}}>Your starter Workspace is ready</h1>
      <p style={{fontSize:13, color:'var(--ink-2)', lineHeight:1.55, maxWidth:680}}>We took what you told us about ClinicalAdvisor and drafted a first sprint, a starter rubric, and a Review Feed. Nothing here is permanent — it's a draft for you to edit, accept, or throw out.</p>

      <div style={{marginTop:22, display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr', gap:14}}>
        {/* sprint */}
        <div className="card" style={{padding:'14px 16px', borderColor:'oklch(0.85 0.06 268)', background:'oklch(0.985 0.012 268)'}}>
          <div className="eyebrow" style={{color:'var(--accent)'}}>sprint #1 · proposed</div>
          <div className="serif" style={{fontSize:18, fontWeight:500, marginTop:5, letterSpacing:'-0.005em'}}>Establish baseline rubric</div>
          <div style={{fontSize:11.5, color:'var(--ink-2)', marginTop:6, lineHeight:1.5}}>5-day sprint · goal: starter rubric with IRR ≥ 0.7 on 3+ criteria, JHA target 0.75.</div>
          <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:8}}>You can shorten this to a workshop (1–3 days) at any time.</div>
        </div>

        {/* starter rubric */}
        <div className="card" style={{padding:'14px 16px'}}>
          <div className="eyebrow">starter rubric · v0.1</div>
          <div style={{display:'flex', flexDirection:'column', gap:5, marginTop:8}}>
            {[['c1','Factual accuracy'],['c2','Clinical safety'],['c3','Tone for audience']].map(([k,v])=>(
              <div key={k} style={{display:'flex', alignItems:'center', gap:6, fontSize:11.5}}>
                <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:8, lineHeight:1.4}}>Derived from the system description. Will evolve through Grading.</div>
        </div>

        {/* starter feed */}
        <div className="card" style={{padding:'14px 16px'}}>
          <div className="eyebrow">starter Review Feed · 12 traces</div>
          <div style={{display:'flex', flexDirection:'column', gap:5, marginTop:8, fontSize:11.5}}>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>diversity sample</span><span className="mono tnum" style={{color:'var(--ink-3)'}}>6</span></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>likely-edge cases</span><span className="mono tnum" style={{color:'var(--ink-3)'}}>4</span></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>random audit</span><span className="mono tnum" style={{color:'var(--ink-3)'}}>2</span></div>
          </div>
          <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:8, lineHeight:1.4}}>Each item is assigned to one of your invited SMEs.</div>
        </div>
      </div>

      <div style={{marginTop:18}} className="card">
        <div style={{padding:'14px 16px'}}>
          <div className="eyebrow">what changes when you press the button</div>
          <div style={{display:'flex', flexDirection:'column', gap:5, marginTop:6, fontSize:11.5, color:'var(--ink-2)'}}>
            <STRowLine k="invites" v="4 emails sent · first task pre-routed"/>
            <STRowLine k="sprint #1" v="opens with the goal above and a 5-day window"/>
            <STRowLine k="rubric v0.1" v="visible & editable in Grading"/>
            <STRowLine k="Review Feed" v="12 starter items appear · optimizer queued for live additions"/>
            <STRowLine k="Eval Ops" v="monitoring is on, but signals only meaningful after first sprint"/>
          </div>
        </div>
      </div>

      <div style={{display:'flex', gap:8, marginTop:18, justifyContent:'space-between'}}>
        <button onClick={onBack} className="btn">Back · adjust</button>
        <div style={{display:'flex', gap:8}}>
          <button className="btn">Open empty Workspace · I'll do it manually</button>
          <button className="btn primary">Accept & open Workspace →</button>
        </div>
      </div>
    </div>
  );
}

function STRowLine({ k, v }){
  return <div style={{display:'flex', gap:12}}><span className="mono" style={{fontSize:10.5, color:'var(--ink-4)', minWidth:120}}>{k}</span><span style={{flex:1}}>{v}</span></div>;
}

// ─────────────────────────────────────────────────────────────────
// C · Living settings — sidebar-in-workspace
// ─────────────────────────────────────────────────────────────────
function SettingsC(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div>
          <span style={{fontSize:13, fontWeight:600}}>Workspace · Settings open</span>
          <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>Settings as a sidebar inside Workspace · never leave context · setup is just the first time you open it</div>
        </div>
      </div>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 380px', gap:1, background:'var(--line)'}}>
        {/* faux workspace behind it */}
        <div style={{background:'var(--paper)', padding:'24px 32px', position:'relative'}}>
          <div style={{filter:'blur(0.5px)', opacity:0.55}}>
            <div className="eyebrow">workspace · sprint #3</div>
            <div className="serif" style={{fontSize:24, fontWeight:500, marginTop:5, letterSpacing:'-0.01em'}}>Warfarin · split safety criterion</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginTop:18}}>
              {['Data Source','Review Feed','Grading','Confidence'].map(l=>(
                <div key={l} className="card" style={{padding:'14px 16px', minHeight:140}}>
                  <div className="eyebrow">{l}</div>
                  <div style={{height:90, marginTop:10, background:'repeating-linear-gradient(45deg, var(--paper-2) 0 6px, transparent 6px 12px)', borderRadius:'var(--r-sm)'}}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{position:'absolute', inset:0, background:'oklch(0.99 0 0 / 0.4)'}}/>
        </div>

        {/* settings drawer */}
        <div style={{background:'var(--paper)', display:'flex', flexDirection:'column', minHeight:0, boxShadow:'-8px 0 32px oklch(0 0 0 / 0.06)'}}>
          <div style={{padding:'14px 18px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontSize:13, fontWeight:600}}>Settings</span>
            <span style={{flex:1}}/>
            <button className="btn" style={{fontSize:11}}>Open full page ↗</button>
            <button className="btn ghost" style={{fontSize:11}}>×</button>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'14px 18px'}} className="scroll">
            <STAcc title="Project" sub="ClinicalAdvisor · v2 evaluation" defaultOpen>
              <STMini label="Name" v="ClinicalAdvisor · v2 evaluation"/>
              <STMini label="ID" v="proj_clinical-advisor_v2" mono/>
            </STAcc>
            <STAcc title="System under review" sub="ca-2026.04.21" defaultOpen>
              <STMini label="Version" v="ca-2026.04.21 · main@a3f29c7" mono/>
              <div style={{fontSize:11, color:'var(--ink-2)', marginTop:6, lineHeight:1.5, padding:'8px 10px', background:'var(--paper-2)', borderRadius:'var(--r-sm)', border:'1px solid var(--line)'}}>
                Patient/clinician-facing chat assistant. Avoid action requiring exam. Cite sources for dosing.
              </div>
              <button className="btn" style={{fontSize:11, marginTop:6}}>Edit description</button>
            </STAcc>
            <STAcc title="Trace source" sub="MLflow · connected">
              <STMini label="Experiment" v="exp_clinical-advisor_eval" mono/>
              <STMini label="Volume" v="14.2k / 24h"/>
            </STAcc>
            <STAcc title="Participants" sub="5 people">
              {['Bo Tanaka','Alice Chen','Carla Mendes','Devon Park','Faye Ortiz'].map(n=>(
                <div key={n} style={{display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:11.5}}>
                  <Avatar name={n} size={20}/>{n}
                </div>
              ))}
              <button className="btn ghost" style={{fontSize:11, marginTop:6}}>+ Invite</button>
            </STAcc>
            <STAcc title="Defaults" sub="review pass · active learning · sprint length"/>
            <STAcc title="Integrations" sub="MLflow · GitHub · Slack"/>
            <STAcc title="Advanced" sub="lineage · sandbox · export · archive"/>

            <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:18, lineHeight:1.5, padding:'10px 12px', background:'var(--paper-2)', borderRadius:'var(--r-sm)'}}>
              First time you open Workspace, this sidebar is open and points to a "Finish setup" task that drains into the starter feed. After that, it's just settings.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function STAcc({ title, sub, children, defaultOpen }){
  const [open, setOpen] = useS_st(!!defaultOpen);
  return (
    <div style={{borderTop:'1px solid var(--line)', padding:'10px 0'}}>
      <button onClick={()=>setOpen(!open)} style={{width:'100%', display:'flex', alignItems:'center', gap:8, background:'transparent', border:'none', cursor:'pointer', padding:'2px 0', textAlign:'left'}}>
        <span style={{fontSize:10, color:'var(--ink-4)', fontFamily:'var(--mono)', width:10}}>{open?'▾':'▸'}</span>
        <span style={{fontSize:12, fontWeight:500}}>{title}</span>
        <span style={{flex:1}}/>
        <span style={{fontSize:10.5, color:'var(--ink-3)'}}>{sub}</span>
      </button>
      {open && children && <div style={{paddingLeft:18, paddingTop:8}}>{children}</div>}
    </div>
  );
}

function STMini({ label, v, mono }){
  return (
    <div style={{display:'flex', gap:10, padding:'3px 0'}}>
      <span style={{fontSize:10.5, color:'var(--ink-4)', minWidth:74}}>{label}</span>
      <span className={mono?'mono':''} style={{fontSize:11, color:'var(--ink-2)'}}>{v}</span>
    </div>
  );
}

Object.assign(window, { SettingsA, SettingsB, SettingsC });
