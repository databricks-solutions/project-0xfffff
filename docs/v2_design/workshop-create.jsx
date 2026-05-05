// JBW v2 — "Create workshop" view (day-one bootstrap).
// Workshop = long-lived container owning rubric, judge, trace pool, SMEs.
// Three variations exploring different on-ramps.

const { useState: useS_wc, useMemo: useM_wc } = React;

// ── Variation A: "Conversational brief" ────────────────────────────────────
// Facilitator describes intent in plain English; the right pane live-builds
// the workshop spec. After Create, the first sprint is auto-staged.
function WorkshopCreateA(){
  const [brief, setBrief] = useS_wc(
`We're calibrating a customer-support agent for our consumer fintech app.
We care most about: (1) factual accuracy on account/billing, (2) tone — empathetic but not patronizing, (3) safety on anything money-movement related.
Trace source is the prod-support-q2 MLflow experiment. Three SMEs from the support quality team will participate; I'll facilitate.`
  );

  const drafted = {
    name: 'support-agent-eval',
    description: 'Calibrate the consumer-fintech support agent — factual, tone, money-safety.',
    target: 'Consumer fintech support agent',
    rubric: [
      { id:'c1', t:'Factual accuracy on account/billing', kind:'binary', src:'from your goals' },
      { id:'c2', t:'Empathetic tone (not patronizing)',    kind:'likert', src:'from your goals' },
      { id:'c3', t:'Money-movement safety',                kind:'likert', src:'from your goals' },
      { id:'c4', t:'Resolution clarity',                   kind:'likert', src:'support template'},
    ],
    judge: { model:'claude-haiku-4-5', prompt:'fintech-support · v0' },
    pool:  { source:'mlflow · prod-support-q2', size:'14,820 traces', sampling:'stratified · representative · 50 for first sprint' },
    smes:  ['Alice Chen','Bo Tanaka','Carla Mendes'],
  };

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <WCHeader subtitle="New workshop · conversational" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Switch to manual</button>
          <button className="btn primary"><I.spark/>Create workshop & stage first sprint</button>
        </div>
      }/>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'1fr 1.1fr', minHeight:0}}>
        {/* left: the brief */}
        <div style={{display:'flex', flexDirection:'column', borderRight:'1px solid var(--line)', minHeight:0, padding:'30px 36px 22px', gap:18}}>
          <div>
            <div className="eyebrow" style={{marginBottom:10}}>STEP 1 · TELL US WHAT YOU'RE CALIBRATING</div>
            <div className="serif" style={{fontSize:32, lineHeight:1.1, fontWeight:500, letterSpacing:'-0.015em'}}>
              Describe the agent, what good looks like, and where the traces live.
            </div>
            <div style={{fontSize:13, color:'var(--ink-3)', marginTop:8, maxWidth:480, lineHeight:1.5}}>
              We'll draft a starter rubric, judge prompt, sampling plan and SME list. You review everything before anything is created.
            </div>
          </div>

          <div style={{flex:1, display:'flex', flexDirection:'column', minHeight:0}}>
            <textarea
              value={brief}
              onChange={e=>setBrief(e.target.value)}
              spellCheck={false}
              className="scroll"
              style={{
                flex:1, minHeight:0, resize:'none',
                background:'var(--paper-2)', border:'1px solid var(--line)',
                borderRadius:'var(--r-lg)', padding:'18px 20px',
                fontFamily:'var(--serif)', fontSize:16, lineHeight:1.55, color:'var(--ink)',
                outline:'none',
              }}/>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 4px 0', fontSize:11, color:'var(--ink-4)'}}>
              <span>plain English · ~120 words is plenty</span>
              <div style={{display:'flex', gap:8}}>
                <button className="btn ghost" style={{padding:'4px 8px'}}><I.spark/>Re-draft</button>
                <button className="btn ghost" style={{padding:'4px 8px'}}>Templates</button>
              </div>
            </div>
          </div>

          <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--ink-3)'}}>
            <Dot color="var(--accent)" size={6}/>
            <span>Drafted live as you type. Edits below the fold are kept.</span>
          </div>
        </div>

        {/* right: the live spec */}
        <div className="scroll" style={{display:'flex', flexDirection:'column', minHeight:0, overflowY:'auto', background:'var(--paper-2)'}}>
          <div style={{padding:'26px 32px 8px', display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
            <div style={{display:'flex', gap:14, alignItems:'center'}}>
              <Blob seed={drafted.name} size={42}/>
              <div>
                <div className="eyebrow">DRAFT WORKSHOP</div>
                <div className="serif" style={{fontSize:24, fontWeight:500, letterSpacing:'-0.01em'}}>{drafted.name}</div>
                <div style={{fontSize:12, color:'var(--ink-3)', marginTop:2, maxWidth:380}}>{drafted.description}</div>
              </div>
            </div>
            <span className="chip accent"><Dot color="var(--accent)"/>auto-drafting</span>
          </div>

          <div style={{padding:'10px 32px 24px', display:'flex', flexDirection:'column', gap:14}}>
            <SpecRow title="Rubric" badge={`${drafted.rubric.length} criteria · v0 draft`} action="Open editor →">
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {drafted.rubric.map(c=>(
                  <div key={c.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:8, alignItems:'center', padding:'8px 10px', background:'var(--paper)', borderRadius:8, border:'1px solid var(--line-2)'}}>
                    <span className="mono" style={{fontSize:10.5, color:'var(--ink-4)'}}>{c.id}</span>
                    <span style={{fontSize:12.5}}>{c.t}</span>
                    <span className="chip" style={{fontSize:9.5, padding:'1px 6px'}}>{c.kind}</span>
                    <span style={{fontSize:10, color:'var(--ink-4)', fontStyle:'italic'}}>{c.src}</span>
                  </div>
                ))}
              </div>
            </SpecRow>

            <SpecRow title="Judge" badge={`${drafted.judge.model} · ${drafted.judge.prompt}`} action="Configure →">
              <div style={{padding:'10px 12px', background:'var(--paper)', borderRadius:8, border:'1px solid var(--line-2)', fontSize:12, color:'var(--ink-3)', lineHeight:1.5, fontFamily:'var(--mono)'}}>
                You are grading consumer-fintech support replies. Use criteria c1–c4. For c1 mark binary. For c2–c4 score 1–5 with one-line rationale.
              </div>
            </SpecRow>

            <SpecRow title="Trace pool" badge={drafted.pool.size} action="Tune sampler →">
              <div style={{padding:'12px 14px', background:'var(--paper)', borderRadius:8, border:'1px solid var(--line-2)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <div>
                  <div className="eyebrow" style={{marginBottom:6}}>SOURCE</div>
                  <div style={{fontSize:12.5, fontWeight:500}}>{drafted.pool.source}</div>
                  <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>connected · pulling representative sample</div>
                </div>
                <div>
                  <div className="eyebrow" style={{marginBottom:6}}>SAMPLING (FIRST SPRINT)</div>
                  <div style={{fontSize:12.5, fontWeight:500}}>{drafted.pool.sampling}</div>
                  <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>updates as more traces are seen</div>
                </div>
              </div>
            </SpecRow>

            <SpecRow title="SMEs" badge={`${drafted.smes.length} invited · 1 facilitator`} action="Manage →">
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {drafted.smes.map(s=>(
                  <span key={s} className="chip" style={{padding:'4px 8px'}}>
                    <Avatar name={s} size={16}/>{s} · SME
                  </span>
                ))}
                <span className="chip"><Avatar name="You" size={16}/>You · facilitator</span>
                <button className="btn ghost" style={{padding:'2px 8px', fontSize:11.5}}><I.plus/>Add</button>
              </div>
            </SpecRow>

            <div style={{display:'flex', alignItems:'center', gap:10, padding:'14px 16px', background:'var(--paper)', borderRadius:'var(--r-lg)', border:'1px dashed var(--line)'}}>
              <I.spark/>
              <div style={{flex:1, fontSize:12, color:'var(--ink-3)', lineHeight:1.5}}>
                <strong style={{color:'var(--ink-2)'}}>Next:</strong> a <strong style={{color:'var(--ink)'}}>2-hour live bootstrap sprint</strong> with 15 traces and the 3 SMEs above. You can adjust before launching.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecRow({ title, badge, action, children }){
  return (
    <div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6}}>
        <div style={{display:'flex', alignItems:'baseline', gap:8}}>
          <span className="eyebrow">{title}</span>
          {badge && <span style={{fontSize:11, color:'var(--ink-3)'}}>{badge}</span>}
        </div>
        {action && <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>{action}</button>}
      </div>
      {children}
    </div>
  );
}

function WCHeader({ subtitle, right }){
  return (
    <div style={{padding:'14px 24px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--paper)'}}>
      <div style={{display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--ink-3)'}}>
        <span style={{color:'var(--ink-2)', fontWeight:600}}>JBW</span>
        <I.chev/>
        <span>Workshops</span>
        <I.chev/>
        <span style={{color:'var(--ink)', fontWeight:600}}>{subtitle}</span>
      </div>
      {right}
    </div>
  );
}

// ── Variation B: "Recipe + canvas" ─────────────────────────────────────────
// Pick a domain recipe, customize the four owned things on one long page.
// Suggestive AI: defaults pre-filled per recipe, you edit in place.
function WorkshopCreateB(){
  const [recipe, setRecipe] = useS_wc('support');
  const recipes = [
    { id:'support', label:'Support agent',  blurb:'tone, factual, money-safety',         seed:'support-agent', n:14820 },
    { id:'clinical', label:'Clinical advice', blurb:'safety, tone, completeness',        seed:'clinical',      n:8210 },
    { id:'translate',label:'Translation',     blurb:'fidelity, register, code preserved', seed:'translate',     n:3950 },
    { id:'finance',  label:'Finance summary', blurb:'numerical accuracy, attribution',   seed:'finance',       n:2120 },
    { id:'blank',    label:'Blank',          blurb:'start from scratch',                 seed:'blank',         n:0 },
  ];
  const cur = recipes.find(r=>r.id===recipe);

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper-2)', fontSize:13}}>
      <WCHeader subtitle="New workshop · from recipe" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Save as draft</button>
          <button className="btn primary"><I.check/>Create & stage first sprint</button>
        </div>
      }/>

      {/* recipe row */}
      <div style={{padding:'18px 28px 14px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <div className="eyebrow" style={{marginBottom:10}}>START FROM A RECIPE</div>
        <div style={{display:'grid', gridTemplateColumns:`repeat(${recipes.length}, 1fr)`, gap:10}}>
          {recipes.map(r=>{
            const sel = r.id===recipe;
            return (
              <button key={r.id} onClick={()=>setRecipe(r.id)} className="card"
                style={{textAlign:'left', padding:'12px 14px', background: sel?'var(--paper)':'var(--paper-2)',
                  borderColor: sel?'var(--ink)':'var(--line)', borderWidth: sel?2:1,
                  display:'flex', flexDirection:'column', gap:8, cursor:'pointer'}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <Blob seed={r.seed} size={24} subtle={!sel}/>
                  <span style={{fontWeight:600}}>{r.label}</span>
                </div>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>{r.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* canvas */}
      <div className="scroll" style={{flex:1, overflowY:'auto', padding:'24px 28px 32px'}}>
        <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:24, alignItems:'start', marginBottom:22}}>
          <Blob seed={cur.seed} size={64}/>
          <div>
            <div className="eyebrow" style={{marginBottom:6}}>WORKSHOP NAME</div>
            <input defaultValue={`${cur.id}-eval`} className="serif"
              style={{width:'100%', maxWidth:520, fontFamily:'var(--serif)', fontSize:30, fontWeight:500, letterSpacing:'-0.01em',
                border:'none', outline:'none', background:'transparent', color:'var(--ink)', padding:'2px 0', borderBottom:'1px dashed var(--line)'}}/>
            <input defaultValue={`Calibrate the ${cur.label.toLowerCase()} — ${cur.blurb}.`}
              style={{width:'100%', maxWidth:620, fontSize:13, color:'var(--ink-2)', marginTop:8,
                border:'none', outline:'none', background:'transparent', padding:'2px 0', borderBottom:'1px dashed var(--line)'}}/>
          </div>
        </div>

        {/* the four-owned-things grid */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          {/* Rubric */}
          <div className="card" style={{padding:'16px 18px'}}>
            <PanelHead label="Rubric" hint={`v0 · 4 starter criteria`} action="Edit"/>
            <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:10}}>
              {[
                { t:'Factual accuracy', k:'binary' },
                { t:'Tone fit for audience', k:'likert' },
                { t:'Safety / harm avoidance', k:'likert' },
                { t:'Resolution clarity', k:'likert' },
              ].map((c,i)=>(
                <div key={i} style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10, padding:'8px 10px', background:'var(--paper-2)', borderRadius:6, fontSize:12.5}}>
                  <span>{c.t}</span><span className="chip" style={{fontSize:9.5}}>{c.k}</span>
                </div>
              ))}
              <button className="btn ghost" style={{justifyContent:'flex-start', padding:'6px 8px'}}><I.plus/>Add criterion</button>
            </div>
            <div style={{marginTop:10, padding:'8px 10px', background:'oklch(0.96 0.04 268)', borderRadius:6, fontSize:11, color:'oklch(0.4 0.15 268)', display:'flex', alignItems:'center', gap:6}}>
              <I.spark/> Drafted from "{cur.label}" recipe.
            </div>
          </div>

          {/* Judge */}
          <div className="card" style={{padding:'16px 18px'}}>
            <PanelHead label="Judge" hint="claude-haiku-4-5 · v0 prompt" action="Edit"/>
            <div style={{marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <Field label="Model" value="claude-haiku-4-5"/>
              <Field label="Temperature" value="0.0"/>
              <Field label="Prompt template" value={`${cur.id}-judge · v0`} span={2}/>
            </div>
            <div className="dotline" style={{margin:'12px 0'}}/>
            <div className="eyebrow" style={{marginBottom:6}}>SCORING SHAPE</div>
            <div style={{display:'flex', gap:6}}>
              <span className="chip accent" style={{padding:'3px 8px'}}>per-criterion · 1–5</span>
              <span className="chip" style={{padding:'3px 8px'}}>+ rationale</span>
            </div>
          </div>

          {/* Trace pool — emphasized for "representative sampling" */}
          <div className="card" style={{padding:'16px 18px', gridColumn:'1 / -1', background:'linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)'}}>
            <PanelHead label="Trace pool" hint={`mlflow · ${cur.id}-q4 · ${cur.n.toLocaleString()} traces`} action="Tune sampler"/>
            <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:18, marginTop:14, alignItems:'stretch'}}>
              {/* sampler */}
              <div>
                <div className="eyebrow" style={{marginBottom:8}}>REPRESENTATIVE SAMPLE · DRAWN BY JUDGE</div>
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'8px 10px', background:'var(--paper)', borderRadius:6, border:'1px solid var(--line-2)'}}>
                    <span style={{fontSize:12}}>Stratify by</span>
                    <select defaultValue="topic+feedback" style={{fontSize:12, background:'transparent', border:'1px solid var(--line)', borderRadius:4, padding:'2px 6px'}}>
                      <option>topic+feedback</option><option>topic only</option><option>random</option><option>cluster centroid</option>
                    </select>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'8px 10px', background:'var(--paper)', borderRadius:6, border:'1px solid var(--line-2)'}}>
                    <span style={{fontSize:12}}>Pool size for first sprint</span>
                    <span className="tnum" style={{fontSize:12, fontWeight:600}}>50 traces</span>
                  </div>
                  <div style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10, alignItems:'center', padding:'8px 10px', background:'var(--paper)', borderRadius:6, border:'1px solid var(--line-2)'}}>
                    <span style={{fontSize:12}}>Distribution updates</span>
                    <span className="chip accent" style={{padding:'2px 8px'}}>as sprints run</span>
                  </div>
                </div>
                <div style={{marginTop:10, padding:'10px 12px', background:'var(--paper-3)', borderRadius:6, fontSize:11.5, color:'var(--ink-3)', lineHeight:1.5}}>
                  Each completed sprint feeds its rated traces back as priors for the next sample — keeping the pool representative as production drifts.
                </div>
              </div>

              {/* summaries preview */}
              <div>
                <div className="eyebrow" style={{marginBottom:8}}>SUMMARY PREVIEW · 3 OF 50</div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {[
                    {id:'tr_a01', topic:'billing', sum:'User questions a duplicate $9.99 charge after switching plans mid-cycle. Agent acknowledges, requests transaction id, files refund.'},
                    {id:'tr_a02', topic:'transfer', sum:'External transfer pending 4 days. Agent explains ACH window, escalates if not posted by EOD.'},
                    {id:'tr_a03', topic:'login', sum:'2FA loop after device change. Agent walks through reset; confirms identity via last-4.'},
                  ].map(t=>(
                    <div key={t.id} style={{padding:'8px 10px', background:'var(--paper)', borderRadius:6, border:'1px solid var(--line-2)'}}>
                      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
                        <span className="mono" style={{fontSize:10.5, color:'var(--ink-4)'}}>{t.id}</span>
                        <span className="chip" style={{fontSize:9.5, padding:'1px 6px'}}>{t.topic}</span>
                      </div>
                      <span style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.45}}>{t.sum}</span>
                    </div>
                  ))}
                </div>
                <button className="btn ghost" style={{marginTop:8, fontSize:11, padding:'4px 8px'}}>See all summaries →</button>
              </div>
            </div>
          </div>

          {/* SMEs */}
          <div className="card" style={{padding:'16px 18px', gridColumn:'1 / -1'}}>
            <PanelHead label="Participants" hint="invite by email · or pick from team" action="Add"/>
            <div style={{marginTop:10, display:'grid', gridTemplateColumns:'1.2fr auto 1fr', gap:18, alignItems:'flex-start'}}>
              <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                {[
                  {n:'You', r:'facilitator'},
                  {n:'Alice Chen', r:'SME'},
                  {n:'Bo Tanaka', r:'SME'},
                  {n:'Carla Mendes', r:'SME'},
                  {n:'Devon Park', r:'developer'},
                ].map(p=>(
                  <span key={p.n} className="chip" style={{padding:'4px 8px'}}>
                    <Avatar name={p.n} size={16}/>
                    {p.n} <span style={{color:'var(--ink-4)'}}>· {p.r}</span>
                  </span>
                ))}
                <span className="chip" style={{padding:'4px 10px', borderStyle:'dashed'}}><I.plus/>Invite</span>
              </div>
              <div style={{width:1, alignSelf:'stretch', background:'var(--line-2)'}}/>
              <div>
                <div className="eyebrow" style={{marginBottom:6}}>ROLES</div>
                <div style={{display:'flex', flexDirection:'column', gap:4, fontSize:11.5, color:'var(--ink-3)'}}>
                  <span><strong style={{color:'var(--ink-2)'}}>Facilitator</strong> — runs sprints, edits rubric &amp; judge.</span>
                  <span><strong style={{color:'var(--ink-2)'}}>SME</strong> — grades traces.</span>
                  <span><strong style={{color:'var(--ink-2)'}}>Developer</strong> — observes signals, ships fixes.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHead({ label, hint, action }){
  return (
    <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
      <div style={{display:'flex', alignItems:'baseline', gap:10}}>
        <span style={{fontSize:14, fontWeight:600}}>{label}</span>
        {hint && <span style={{fontSize:11, color:'var(--ink-3)'}}>{hint}</span>}
      </div>
      {action && <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>{action}</button>}
    </div>
  );
}

function Field({ label, value, span }){
  return (
    <div style={{gridColumn: span?`span ${span}`:'auto'}}>
      <div className="eyebrow" style={{marginBottom:4}}>{label}</div>
      <div style={{padding:'7px 10px', background:'var(--paper-2)', border:'1px solid var(--line-2)', borderRadius:5, fontSize:12.5, color:'var(--ink-2)', fontFamily: label==='Prompt template'?'var(--mono)':'var(--sans)'}}>{value}</div>
    </div>
  );
}

// ── Variation C: "Foundation builder" — sampling-first ─────────────────────
// Long-form page that puts the trace-pool sampling problem front and center.
// (User explicitly called out: "how does the developer get a representative
// sample from MLflow, and how do summaries look".)
function WorkshopCreateC(){
  const stages = [
    { label:'All traces',     n:14820, w:'100%' },
    { label:'After cleaning', n:11240, w:'78%'  },
    { label:'Topic-balanced', n:2400,  w:'42%'  },
    { label:'First sample',   n:50,    w:'18%'  },
  ];
  const topics = [
    { name:'billing',     n:42, pct:28 },
    { name:'transfers',   n:36, pct:24 },
    { name:'login/auth',  n:24, pct:16 },
    { name:'card disputes', n:18, pct:12 },
    { name:'investments', n:15, pct:10 },
    { name:'other',       n:15, pct:10 },
  ];
  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper)', fontSize:13}}>
      <WCHeader subtitle="New workshop · foundation builder" right={
        <div style={{display:'flex', gap:6}}>
          <button className="btn ghost">Skip sampling for now</button>
          <button className="btn primary"><I.check/>Found workshop</button>
        </div>
      }/>

      <div style={{flex:1, display:'grid', gridTemplateColumns:'320px 1fr', minHeight:0}}>
        {/* left rail: foundation ladder */}
        <div style={{borderRight:'1px solid var(--line)', padding:'24px 22px', display:'flex', flexDirection:'column', gap:18, background:'var(--paper-2)'}}>
          <div>
            <div className="eyebrow" style={{marginBottom:6}}>FOUNDATION</div>
            <div className="serif" style={{fontSize:22, fontWeight:500, lineHeight:1.15, letterSpacing:'-0.01em'}}>
              The four things a workshop owns.
            </div>
            <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:6, lineHeight:1.5}}>
              Each lives across many sprints. Get the trace pool right first — it's the substrate for everything else.
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:2}}>
            {[
              {n:1, l:'Trace pool', s:'mlflow · prod-support-q2', state:'active'},
              {n:2, l:'Rubric',     s:'4 starter criteria',       state:'next'},
              {n:3, l:'Judge',      s:'claude-haiku · v0 prompt', state:'next'},
              {n:4, l:'Participants', s:'1 facilitator · 0 SMEs', state:'next'},
            ].map(s=>{
              const live = s.state==='active';
              return (
                <div key={s.n} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12, alignItems:'center', padding:'10px 8px', borderRadius:8, background: live?'var(--paper)':'transparent'}}>
                  <span style={{
                    width:24, height:24, borderRadius:999,
                    background: live?'var(--ink)':'var(--paper-3)',
                    color: live?'var(--paper)':'var(--ink-3)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:600,
                    border: live?'none':'1px solid var(--line)'
                  }}>{s.n}</span>
                  <div>
                    <div style={{fontSize:13, fontWeight: live?600:500, color: live?'var(--ink)':'var(--ink-2)'}}>{s.l}</div>
                    <div style={{fontSize:11, color:'var(--ink-4)'}}>{s.s}</div>
                  </div>
                  {live && <Dot color="var(--accent)"/>}
                </div>
              );
            })}
          </div>

          <div className="dotline"/>

          <div>
            <div className="eyebrow" style={{marginBottom:8}}>NAME &amp; DOMAIN</div>
            <input defaultValue="support-agent-eval" style={{width:'100%', padding:'8px 10px', border:'1px solid var(--line)', borderRadius:6, fontSize:13, background:'var(--paper)', outline:'none', fontFamily:'var(--mono)'}}/>
            <input defaultValue="Consumer fintech support agent" style={{marginTop:6, width:'100%', padding:'8px 10px', border:'1px solid var(--line)', borderRadius:6, fontSize:12.5, background:'var(--paper)', outline:'none'}}/>
          </div>

          <div style={{marginTop:'auto', padding:'10px 12px', background:'var(--paper)', borderRadius:'var(--r)', border:'1px solid var(--line-2)', fontSize:11.5, color:'var(--ink-3)', lineHeight:1.55}}>
            After founding, we'll <strong style={{color:'var(--ink-2)'}}>auto-stage a 2-hour bootstrap sprint</strong> using these 50 traces. You can edit before launching.
          </div>
        </div>

        {/* main: sampling */}
        <div className="scroll" style={{overflowY:'auto', padding:'26px 36px 32px'}}>
          <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:18}}>
            <div>
              <div className="eyebrow" style={{marginBottom:6}}>STEP 1 OF 4 · TRACE POOL</div>
              <div className="serif" style={{fontSize:30, fontWeight:500, letterSpacing:'-0.01em', lineHeight:1.1}}>
                What does a representative sample look like?
              </div>
              <div style={{fontSize:13, color:'var(--ink-3)', marginTop:8, maxWidth:560, lineHeight:1.5}}>
                We use a judge to summarize each trace and stratify by topic + feedback. The first 50 set the prior; subsequent sprints update it.
              </div>
            </div>
            <span className="chip accent"><Dot color="var(--accent)"/>judge sampling · live</span>
          </div>

          {/* funnel */}
          <div className="card" style={{padding:'18px 20px'}}>
            <div className="eyebrow" style={{marginBottom:12}}>FUNNEL · MLFLOW → SAMPLE</div>
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {stages.map((s,i)=>(
                <div key={s.label} style={{display:'grid', gridTemplateColumns:'160px 1fr 70px', alignItems:'center', gap:12}}>
                  <span style={{fontSize:12.5, color:'var(--ink-2)'}}>{s.label}</span>
                  <div style={{position:'relative', height:14, background:'var(--line-2)', borderRadius:3, overflow:'hidden'}}>
                    <div style={{position:'absolute', inset:0, width:s.w,
                      background: i===stages.length-1?'var(--accent)':`oklch(0.6 0.1 ${260 - i*30})`,
                      opacity: i===stages.length-1?1:0.6}}/>
                  </div>
                  <span className="tnum" style={{fontSize:12, textAlign:'right', fontWeight: i===stages.length-1?600:400}}>{s.n.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* topic balance + summaries */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:16, marginTop:16}}>
            <div className="card" style={{padding:'16px 18px'}}>
              <div className="eyebrow" style={{marginBottom:10}}>TOPIC BALANCE · 50 SAMPLE</div>
              <div style={{display:'flex', flexDirection:'column', gap:7}}>
                {topics.map(t=>(
                  <div key={t.name} style={{display:'grid', gridTemplateColumns:'110px 1fr 36px', alignItems:'center', gap:10, fontSize:12}}>
                    <span style={{color:'var(--ink-3)'}}>{t.name}</span>
                    <div style={{height:8, background:'var(--paper-2)', borderRadius:2, overflow:'hidden', border:'1px solid var(--line-2)'}}>
                      <div style={{height:'100%', width:`${t.pct*3.2}%`, background:'var(--accent)', opacity:0.75}}/>
                    </div>
                    <span className="tnum" style={{fontSize:11, textAlign:'right'}}>{t.n}</span>
                  </div>
                ))}
              </div>
              <div className="dotline" style={{margin:'12px 0'}}/>
              <div style={{fontSize:11.5, color:'var(--ink-3)', lineHeight:1.5}}>
                Distribution mirrors prod within ±3pp on each topic. You can rebalance manually before founding.
              </div>
            </div>

            <div className="card" style={{padding:'16px 18px'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
                <span className="eyebrow">JUDGE-WRITTEN SUMMARIES · QUALITY CHECK</span>
                <span className="chip"><I.bot/>claude-haiku-4-5</span>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:8}}>
                {[
                  {id:'tr_a01', topic:'billing', q:'good',
                   sum:'User questions a duplicate $9.99 charge after switching plans mid-cycle. Agent acknowledges, requests transaction id, files refund.'},
                  {id:'tr_a02', topic:'transfers', q:'good',
                   sum:'External transfer pending 4 days. Agent explains ACH window, escalates if not posted by EOD.'},
                  {id:'tr_a03', topic:'card disputes', q:'flag',
                   sum:'[short] Agent told user to "wait and see" — summary may be over-trimming.'},
                  {id:'tr_a04', topic:'login/auth', q:'good',
                   sum:'2FA loop after device change. Agent walks through reset; confirms identity via last-4.'},
                ].map(t=>{
                  const c = t.q==='flag'?'var(--warn)':'var(--good)';
                  return (
                    <div key={t.id} style={{display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, padding:'10px 12px', background:'var(--paper-2)', borderRadius:6, alignItems:'flex-start'}}>
                      <Dot color={c} size={7}/>
                      <div style={{minWidth:0}}>
                        <div style={{display:'flex', gap:6, alignItems:'center', marginBottom:3}}>
                          <span className="mono" style={{fontSize:10.5, color:'var(--ink-4)'}}>{t.id}</span>
                          <span className="chip" style={{fontSize:9.5, padding:'1px 6px'}}>{t.topic}</span>
                        </div>
                        <span style={{fontSize:12, color:'var(--ink-2)', lineHeight:1.45}}>{t.sum}</span>
                      </div>
                      <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}}>open</button>
                    </div>
                  );
                })}
              </div>
              <div style={{marginTop:10, display:'flex', gap:8, alignItems:'center'}}>
                <button className="btn ghost"><I.spark/>Regenerate flagged</button>
                <button className="btn ghost">See all 50 →</button>
                <span style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>3 flagged out of 50</span>
              </div>
            </div>
          </div>

          <div style={{marginTop:18, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span style={{fontSize:11.5, color:'var(--ink-3)'}}>Step 1 of 4 — rubric, judge, participants follow.</span>
            <button className="btn primary">Next: Rubric →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WorkshopCreateA, WorkshopCreateB, WorkshopCreateC });
