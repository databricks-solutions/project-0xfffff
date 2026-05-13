// JBW v2 — Workspace (sprint control surface)
// Three directions over the same four-column spine:
//   Data Source  ->  Review Feed  ->  Grading  ->  Confidence
//
// A · Control Room       — compact four-column control surface, dense.
// B · Activity Monitor   — timeline/training-run feel, metrics over time.
// C · Narrative          — "what needs to happen next", lineage-forward.

const { useState: useS_ws } = React;

// ───────────────────────────────────────────────────────────────────
// Shared mock data for the workspace
// ───────────────────────────────────────────────────────────────────
const SPRINT = {
  name: 'Warfarin advice — calibration sprint #3',
  system: 'CareCopilot v0.7',
  systemDesc: 'Patient-facing clinical advice agent · GPT-4o + retrieval over MedlinePlus & internal protocol library',
  systemHref: '#system/carecopilot/v0.7',
  rubric: 'Clinical-advice rubric v0.4',
  judge: 'judge-clinical@v0.4 (baseline aligned)',
  started: '3d 14h ago',
  remaining: '4d 10h',
  goals: [
    { key:'human',     label:'Human agreement',         abbr:'IRR',    target:0.80, value:0.71, prev:0.66, trend:[0.59,0.61,0.66,0.66,0.69,0.71,0.71], status:'rising' },
    { key:'judge',     label:'Judge–human agreement',   abbr:'JHA',    target:0.85, value:0.74, prev:0.71, trend:[0.68,0.69,0.70,0.71,0.72,0.73,0.74], status:'rising' },
    { key:'conf',      label:'Judge confidence',        abbr:'Conf',   target:0.90, value:0.72, prev:0.70, trend:[0.71,0.71,0.70,0.70,0.71,0.72,0.72], status:'flat' },
    { key:'construct', label:'Construct validity',      abbr:'CV',     target:0.80, value:0.58, prev:0.55, trend:[0.50,0.52,0.55,0.55,0.55,0.57,0.58], status:'stuck' },
  ],
};

const TRACE_SOURCE = {
  name: 'mlflow.experiments / clinical-advice-prod',
  total: 4218,
  sampled: 64,
  reviewed: 47,
  diversity: { topic: 0.78, tool: 0.42, novelty: 0.61 },
  buckets: [
    { label:'warfarin / anticoag',  n: 18, color:'var(--rose)' },
    { label:'pediatric dosing',     n: 12, color:'var(--amber)' },
    { label:'mental health triage', n: 9,  color:'var(--violet)' },
    { label:'chronic disease',      n: 14, color:'var(--emerald)' },
    { label:'other',                n: 11, color:'var(--ink-4)' },
  ],
  gaps: ['no traces with tool errors', 'low coverage of pediatric dosing'],
};

const REVIEW_ACTIVITY = [
  { who:'Alice Chen',  state:'reviewing', trace:'tr_82af', when:'now',  scored:14 },
  { who:'Bo Tanaka',   state:'commented', trace:'tr_91ce', when:'2m',   scored:11 },
  { who:'Carla Mendes',state:'reviewing', trace:'tr_4b07', when:'now',  scored:9  },
  { who:'Faye Olsen',  state:'idle',      trace:'—',       when:'15m',  scored:6  },
];

const TASKS = [
  { kind:'review',    label:'27 traces awaiting blind review',           sme:'2 SMEs needed', priority:'med' },
  { kind:'reaction',  label:'9 traces awaiting judge-reaction pass',     sme:'Alice or Bo',   priority:'high' },
  { kind:'discuss',   label:'3 unresolved discussions on c2 (safety)',   sme:'physician SME', priority:'high' },
  { kind:'patch',     label:'2 memory patches awaiting approval',        sme:'any senior SME',priority:'med' },
];

const CRITERIA = [
  { id:'c1', title:'Factual accuracy',  type:'binary', irr:0.83, jha:0.91, n:47, lineage:6, status:'stable' },
  { id:'c2', title:'Clinical safety',   type:'likert', irr:0.41, jha:0.62, n:47, lineage:11,status:'unstable', flag:'split candidate' },
  { id:'c3', title:'Tone for audience', type:'likert', irr:0.66, jha:0.78, n:47, lineage:4, status:'stable' },
  { id:'c4', title:'Completeness',      type:'likert', irr:0.71, jha:0.81, n:47, lineage:3, status:'stable' },
  { id:'c5', title:'Citation discipline',type:'free',  irr:0.55, jha:null, n:32, lineage:2, status:'low coverage' },
];

const RECOMMENDATIONS = [
  { kind:'blocker', title:'Construct validity is stuck at 0.58',
    why:'Judge agrees with SMEs on c1 but high SME disagreement on c2 caps overall validity.',
    do:'Split c2 (Clinical safety) into vitals-check and contraindication-check.',
    impact:'+0.08 expected on JHA · +0.10 expected on CV' },
  { kind:'sme', title:'9 high-information traces need physician review',
    why:'Judge is confident but model output likely wrong (confident-wrongness pattern).',
    do:'Route to Alice or Bo with reaction question framed around vitals.',
    impact:'unblocks rubric split decision' },
  { kind:'data', title:'Add 8 pediatric-dosing traces',
    why:'Topic coverage 0.42 (tool diversity) lowers construct validity ceiling.',
    do:'Pull tool-heavy traces from last 7d; novelty filter > 0.6.',
    impact:'opens c4 measurement' },
];

// ───────────────────────────────────────────────────────────────────
// Atoms
// ───────────────────────────────────────────────────────────────────
function MetricRing({ value, target, size=44, stroke=4, color='var(--accent)' }){
  const r = (size - stroke)/2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value/target));
  const dash = c * pct;
  return (
    <svg width={size} height={size} style={{transform:'rotate(-90deg)', flex:'none'}}>
      <circle cx={size/2} cy={size/2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none"/>
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
    </svg>
  );
}

function MetricSpark({ values, w=120, h=28, color='var(--accent)', target }){
  const max = Math.max(...values, target||0, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v,i)=>[ (i/(values.length-1))*w, h - ((v-min)/span)*(h-3) - 1.5 ]);
  const d = 'M ' + pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' L ');
  const ty = target!=null ? h - ((target-min)/span)*(h-3) - 1.5 : null;
  return (
    <svg width={w} height={h} style={{display:'block'}}>
      {ty!=null && <line x1="0" y1={ty} x2={w} y2={ty} stroke="var(--ink-4)" strokeDasharray="2 3" strokeWidth="1" opacity="0.6"/>}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.4" fill={color}/>
    </svg>
  );
}

function GoalCard({ g, layout='stack' }){
  const pct = Math.round(g.value*100);
  const tgt = Math.round(g.target*100);
  const delta = g.value - g.prev;
  const trendColor = g.status==='stuck' ? 'var(--bad)' : g.status==='rising' ? 'var(--good)' : 'var(--ink-3)';
  const trendLabel = g.status==='stuck' ? 'stuck' : g.status==='rising' ? `+${(delta*100).toFixed(1)}%` : 'flat';
  return (
    <div style={{display:'flex', flexDirection:layout==='row'?'row':'column', gap: layout==='row'?12:8, padding:'10px 12px', borderRadius:'var(--r)', background:'var(--paper)', border:'1px solid var(--line)', minWidth:0}}>
      <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
        <span className="eyebrow">{g.label}</span>
        <span style={{fontSize:10, color:trendColor, fontFamily:'var(--mono)'}}>{trendLabel}</span>
      </div>
      <div style={{display:'flex', alignItems:'baseline', gap:6}}>
        <span className="tnum" style={{fontSize:22, fontWeight:600, letterSpacing:'-0.01em'}}>{pct}</span>
        <span style={{fontSize:11, color:'var(--ink-3)'}}>/ {tgt} target</span>
      </div>
      <MetricSpark values={g.trend} target={g.target} w={layout==='row'?100:160} h={26} color={trendColor}/>
    </div>
  );
}

function ColumnHeader({ idx, title, subtitle, accent }){
  return (
    <div style={{display:'flex', flexDirection:'column', gap:2, padding:'12px 14px', borderBottom:'1px solid var(--line)'}}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span className="mono" style={{fontSize:10, padding:'1px 6px', borderRadius:4, background:accent||'var(--paper-3)', color:'var(--ink-2)', fontWeight:600}}>{String(idx).padStart(2,'0')}</span>
        <span style={{fontSize:13, fontWeight:600}}>{title}</span>
      </div>
      <span style={{fontSize:11, color:'var(--ink-3)', lineHeight:1.4}}>{subtitle}</span>
    </div>
  );
}

function FlowArrow({ size=12 }){
  return (
    <svg width={size} height={size+6} viewBox="0 0 12 18" style={{flex:'none', color:'var(--ink-4)'}}>
      <path d="M3 1 L9 9 L3 17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SystemHeader({ compact=false }){
  return (
    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, padding: compact?'10px 18px':'14px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
      <div style={{display:'flex', alignItems:'center', gap:12, minWidth:0}}>
        <Blob seed={SPRINT.system} size={compact?26:32}/>
        <div style={{minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{fontSize:13, fontWeight:600}}>{SPRINT.system}</span>
            <a href={SPRINT.systemHref} style={{fontSize:11, color:'var(--accent)', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:3}}>
              system version ↗
            </a>
            <span className="chip"><Dot color="var(--good)"/>sprint live · {SPRINT.started}</span>
          </div>
          <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{SPRINT.systemDesc}</div>
        </div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span style={{fontSize:11, color:'var(--ink-3)'}}>{SPRINT.rubric} · {SPRINT.judge}</span>
        <button className="btn"><I.diff/>diff vs sprint #2</button>
        <button className="btn primary"><I.spark/>Optimizer</button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Direction A · Control Room (compact four-column control surface)
// ───────────────────────────────────────────────────────────────────
function WorkspaceA(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13, color:'var(--ink)'}}>
      <SystemHeader/>

      {/* metric strip */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'var(--line)', borderBottom:'1px solid var(--line)'}}>
        {SPRINT.goals.map(g=>(
          <div key={g.key} style={{background:'var(--paper)', padding:'10px 14px', display:'flex', alignItems:'center', gap:12}}>
            <MetricRing value={g.value} target={g.target} color={g.status==='stuck'?'var(--bad)':g.status==='flat'?'var(--ink-3)':'var(--accent)'}/>
            <div style={{minWidth:0}}>
              <div className="eyebrow">{g.abbr} · {g.label}</div>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <span className="tnum" style={{fontSize:18, fontWeight:600}}>{(g.value*100).toFixed(0)}</span>
                <span style={{fontSize:10, color:'var(--ink-3)'}}>/ {(g.target*100).toFixed(0)}</span>
                <span style={{fontSize:10, color: g.status==='stuck'?'var(--bad)':'var(--good)', marginLeft:4}}>
                  {g.status==='stuck' ? '◇ stuck' : `+${((g.value-g.prev)*100).toFixed(1)}`}
                </span>
              </div>
            </div>
            <div style={{marginLeft:'auto'}}>
              <MetricSpark values={g.trend} w={70} h={22} color={g.status==='stuck'?'var(--bad)':'var(--ink-2)'} target={g.target}/>
            </div>
          </div>
        ))}
      </div>

      {/* four columns */}
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1.05fr 1.15fr 1.3fr 1.05fr', gap:1, background:'var(--line)'}}>

        {/* col 1 — Data Source */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <ColumnHeader idx={1} title="Data Source" subtitle="Trace pool · diversity · targeted adds"/>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:12, overflow:'auto'}} className="scroll">
            <div style={{display:'flex', flexDirection:'column', gap:4}}>
              <div className="eyebrow">trace source</div>
              <div className="mono" style={{fontSize:11, color:'var(--ink-2)'}}>{TRACE_SOURCE.name}</div>
              <div style={{fontSize:11, color:'var(--ink-3)'}}>{TRACE_SOURCE.total.toLocaleString()} prod traces · {TRACE_SOURCE.sampled} sampled · {TRACE_SOURCE.reviewed} reviewed</div>
            </div>

            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:6}}>starter sample · diversity</div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {Object.entries(TRACE_SOURCE.diversity).map(([k,v])=>(
                  <div key={k} style={{display:'flex', alignItems:'center', gap:8}}>
                    <span style={{fontSize:11, color:'var(--ink-3)', width:60, textTransform:'capitalize'}}>{k}</span>
                    <div style={{flex:1, height:5, background:'var(--paper-3)', borderRadius:3, overflow:'hidden'}}>
                      <div style={{width:`${v*100}%`, height:'100%', background: v<0.5?'var(--warn)':'var(--accent)'}}/>
                    </div>
                    <span className="tnum mono" style={{fontSize:10, color:'var(--ink-2)', width:30, textAlign:'right'}}>{v.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6}}>sample composition</div>
              <div style={{display:'flex', flexDirection:'column', gap:5}}>
                {TRACE_SOURCE.buckets.map(b=>(
                  <div key={b.label} style={{display:'flex', alignItems:'center', gap:8, fontSize:11}}>
                    <Dot color={b.color} size={8}/>
                    <span style={{flex:1, color:'var(--ink-2)'}}>{b.label}</span>
                    <span className="tnum mono" style={{color:'var(--ink-3)'}}>{b.n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{padding:'10px 12px', background:'oklch(0.97 0.04 75)', borderColor:'oklch(0.86 0.08 75)'}}>
              <div className="eyebrow" style={{color:'oklch(0.45 0.13 75)', marginBottom:4}}>coverage gap</div>
              {TRACE_SOURCE.gaps.map(g=>(
                <div key={g} style={{fontSize:11, color:'oklch(0.4 0.12 75)', display:'flex', gap:6, alignItems:'flex-start', marginBottom:3}}>
                  <span>·</span><span>{g}</span>
                </div>
              ))}
              <button className="btn" style={{marginTop:6, fontSize:11}}><I.plus/>Add targeted traces</button>
            </div>
          </div>
        </div>

        {/* col 2 — Review Feed */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <ColumnHeader idx={2} title="Review Feed" subtitle="SME activity · human agreement · discussion"/>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:12, overflow:'auto'}} className="scroll">

            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <MetricRing value={SPRINT.goals[0].value} target={SPRINT.goals[0].target} size={36}/>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>IRR 0.71 → 0.80</div>
                <div style={{fontSize:11, color:'var(--ink-3)'}}>+0.05 in last 24h · 4 SMEs reviewing</div>
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6}}>live SME activity</div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {REVIEW_ACTIVITY.map(r=>(
                  <div key={r.who} style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
                    <Avatar name={r.who} size={20}/>
                    <span style={{fontWeight:500}}>{r.who.split(' ')[0]}</span>
                    <span style={{fontSize:11, color:'var(--ink-3)'}}>
                      {r.state==='reviewing' && <>blind-reviewing <span className="mono">{r.trace}</span></>}
                      {r.state==='commented' && <>commented on <span className="mono">{r.trace}</span></>}
                      {r.state==='idle'      && <>idle</>}
                    </span>
                    <span style={{marginLeft:'auto', fontSize:10, color:'var(--ink-4)'}} className="mono">{r.when}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6}}>review tasks</div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {TASKS.map((t,i)=>(
                  <div key={i} className="card" style={{padding:'8px 10px', display:'flex', flexDirection:'column', gap:4}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <span className={`chip ${t.priority==='high'?'bad':'warn'}`} style={{fontSize:10}}>{t.kind}</span>
                      <span style={{fontSize:11.5, color:'var(--ink-2)', flex:1}}>{t.label}</span>
                    </div>
                    <div style={{fontSize:10.5, color:'var(--ink-3)', display:'flex', justifyContent:'space-between'}}>
                      <span>route to: {t.sme}</span>
                      <a style={{color:'var(--accent)'}}>open feed →</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{padding:'10px 12px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <I.comment/><span className="eyebrow">discussion</span>
                <span className="chip bad" style={{fontSize:10}}>3 unresolved</span>
              </div>
              <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.45}}>
                <span style={{fontWeight:500}}>Bo Tanaka</span> on c2 ·{' '}
                <span style={{color:'var(--ink-3)'}}>"Vitals first for any bleed — rubric should require it."</span>
              </div>
              <a style={{fontSize:11, color:'var(--accent)', display:'inline-block', marginTop:4}}>open discussion pane →</a>
            </div>
          </div>
        </div>

        {/* col 3 — Grading */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <ColumnHeader idx={3} title="Grading" subtitle="Rubric · assessments · alignment evidence"/>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:12, overflow:'auto'}} className="scroll">

            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <MetricRing value={SPRINT.goals[1].value} target={SPRINT.goals[1].target} size={36}/>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>Judge–human 0.74 → 0.85</div>
                <div style={{fontSize:11, color:'var(--ink-3)'}}>5 criteria · 47 assessments · 1 split candidate</div>
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6, display:'flex', justifyContent:'space-between'}}>
                <span>rubric criteria</span>
                <span style={{color:'var(--ink-4)'}}>IRR · JHA · lineage</span>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:1, background:'var(--line)', border:'1px solid var(--line)', borderRadius:'var(--r)'}}>
                {CRITERIA.map(c=>(
                  <div key={c.id} style={{background:'var(--paper)', padding:'9px 10px', display:'flex', alignItems:'center', gap:10}}>
                    <span className="mono" style={{fontSize:10, color:'var(--ink-3)', width:22}}>{c.id}</span>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:12, fontWeight:500, display:'flex', alignItems:'center', gap:6}}>
                        {c.title}
                        {c.flag && <span className="chip warn" style={{fontSize:9}}>{c.flag}</span>}
                      </div>
                      <div style={{fontSize:10, color:'var(--ink-4)', textTransform:'lowercase'}} className="mono">{c.type}</div>
                    </div>
                    <span className="tnum mono" style={{fontSize:11, color: c.irr<0.5?'var(--bad)':'var(--ink-2)', width:36, textAlign:'right'}}>{c.irr.toFixed(2)}</span>
                    <span className="tnum mono" style={{fontSize:11, color: c.jha==null?'var(--ink-4)':c.jha<0.7?'var(--bad)':'var(--ink-2)', width:36, textAlign:'right'}}>{c.jha?c.jha.toFixed(2):'—'}</span>
                    <a className="mono" style={{fontSize:10, color:'var(--accent)', width:28, textAlign:'right'}}>{c.lineage}↗</a>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6}}>human ↔ AI assessments · last 47</div>
              <ScatterMatch/>
            </div>

            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:4}}>rubric lineage · c2 · clinical safety</div>
              <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.5}}>
                criterion <span className="mono">c2</span> derived from{' '}
                <a style={{color:'var(--accent)'}}>4 traces</a>,{' '}
                <a style={{color:'var(--accent)'}}>2 discussion threads</a>, and{' '}
                <a style={{color:'var(--accent)'}}>3 SME judgements</a>{' '}
                <span style={{color:'var(--ink-3)'}}>· last edited by Bo Tanaka 2h ago</span>
              </div>
            </div>
          </div>
        </div>

        {/* col 4 — Confidence */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <ColumnHeader idx={4} title="Confidence" subtitle="Construct validity · readiness · blockers"/>
          <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:12, overflow:'auto'}} className="scroll">

            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              <GoalCard g={SPRINT.goals[2]}/>
              <GoalCard g={SPRINT.goals[3]}/>
            </div>

            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow" style={{marginBottom:6}}>SME feedback still needed</div>
              <div style={{display:'flex', alignItems:'baseline', gap:6, marginBottom:6}}>
                <span className="tnum" style={{fontSize:22, fontWeight:600}}>~31</span>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>more reactions to reach 0.85 JHA</span>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:4}}>
                <BarRow label="reactions on c2" value={9} max={20} color="var(--bad)"/>
                <BarRow label="memory patches"  value={2} max={5}  color="var(--warn)"/>
                <BarRow label="discussion votes"value={6} max={10} color="var(--accent)"/>
              </div>
            </div>

            <div className="card" style={{padding:'10px 12px', borderColor:'oklch(0.86 0.07 25)', background:'oklch(0.98 0.02 25)'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                <Dot color="var(--bad)"/>
                <span className="eyebrow" style={{color:'oklch(0.42 0.16 25)'}}>blocker</span>
              </div>
              <div style={{fontSize:12, fontWeight:500, marginBottom:3}}>{RECOMMENDATIONS[0].title}</div>
              <div style={{fontSize:11, color:'var(--ink-3)', lineHeight:1.45, marginBottom:6}}>{RECOMMENDATIONS[0].why}</div>
              <div style={{fontSize:11, color:'var(--ink-2)', lineHeight:1.45}}><span style={{fontWeight:500}}>Recommend:</span> {RECOMMENDATIONS[0].do}</div>
              <div style={{fontSize:10.5, color:'var(--good)', marginTop:6}} className="mono">{RECOMMENDATIONS[0].impact}</div>
            </div>

            <div>
              <div className="eyebrow" style={{marginBottom:6}}>readiness</div>
              <ReadinessBar/>
              <div style={{fontSize:11, color:'var(--ink-3)', marginTop:6, lineHeight:1.45}}>
                Sprint not ready to close. Construct validity must reach <span className="mono" style={{color:'var(--ink-2)'}}>0.80</span> and the c2 split must merge before judge v0.5 can promote.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarRow({ label, value, max, color }){
  return (
    <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11}}>
      <span style={{flex:1, color:'var(--ink-3)'}}>{label}</span>
      <div style={{width:80, height:5, background:'var(--paper-3)', borderRadius:3, overflow:'hidden'}}>
        <div style={{width:`${(value/max)*100}%`, height:'100%', background:color}}/>
      </div>
      <span className="tnum mono" style={{color:'var(--ink-2)', width:42, textAlign:'right'}}>{value}/{max}</span>
    </div>
  );
}

function ReadinessBar(){
  const segs = [
    { label:'data',     pct:0.78, color:'var(--accent)' },
    { label:'IRR',      pct:0.71/0.80, color:'var(--accent)' },
    { label:'JHA',      pct:0.74/0.85, color:'var(--warn)' },
    { label:'CV',       pct:0.58/0.80, color:'var(--bad)' },
  ];
  return (
    <div style={{display:'flex', flexDirection:'column', gap:3}}>
      {segs.map(s=>(
        <div key={s.label} style={{display:'flex', alignItems:'center', gap:8}}>
          <span style={{fontSize:10, width:30, color:'var(--ink-3)'}} className="mono">{s.label}</span>
          <div style={{flex:1, height:6, background:'var(--paper-3)', borderRadius:3, overflow:'hidden'}}>
            <div style={{width:`${Math.min(100, s.pct*100)}%`, height:'100%', background:s.color}}/>
          </div>
          <span className="mono" style={{fontSize:10, color:'var(--ink-3)', width:32, textAlign:'right'}}>{Math.round(s.pct*100)}%</span>
        </div>
      ))}
    </div>
  );
}

function ScatterMatch(){
  // mocked SME-vs-judge scores — points along/near a diagonal with some outliers
  const pts = [
    [4,4],[5,5],[3,3],[2,4],[5,4],[4,5],[3,2],[4,4],[5,5],[2,2],
    [4,3],[5,5],[3,4],[2,3],[5,5],[3,3],[1,3],[4,4],[5,4],[3,2],
    [4,4],[2,1],[5,5],[3,4],[4,3],[5,4],[2,2],[3,3],[4,5],[1,2],
  ];
  const W = 220, H = 90, pad = 10;
  return (
    <div className="card" style={{padding:'10px 12px'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
        {/* diagonal */}
        <line x1={pad} y1={H-pad} x2={W-pad} y2={pad} stroke="var(--line)" strokeDasharray="2 3"/>
        {/* points */}
        {pts.map(([sx,sy],i)=>{
          const x = pad + (sx-1)/4 * (W-2*pad);
          const y = H-pad - (sy-1)/4 * (H-2*pad);
          const off = Math.abs(sx-sy);
          const c = off>=2 ? 'var(--bad)' : off===1 ? 'var(--warn)' : 'var(--good)';
          return <circle key={i} cx={x} cy={y} r="3" fill={c} fillOpacity="0.7"/>;
        })}
        <text x={pad} y={H-1} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)">SME →</text>
        <text x={W-pad-20} y={pad+4} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)">↑ judge</text>
      </svg>
      <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:4, display:'flex', justifyContent:'space-between'}}>
        <span>26 of 30 within ±1 · 4 outliers (c2)</span>
        <a style={{color:'var(--accent)'}}>open Grading →</a>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Direction B · Activity Monitor (training-run feel)
// ───────────────────────────────────────────────────────────────────
function WorkspaceB(){
  const days = ['day 1','day 2','day 3','day 4 (now)','day 5','day 6','day 7'];
  const events = [
    { d:0.4, kind:'data',     label:'starter sample · 32 traces',          who:'optimizer' },
    { d:0.9, kind:'review',   label:'first 12 blind reviews',              who:'Alice, Bo' },
    { d:1.3, kind:'rubric',   label:'c2 introduced · clinical safety',     who:'Bo' },
    { d:1.7, kind:'judge',    label:'judge v0.3 · baseline aligned',       who:'optimizer' },
    { d:2.1, kind:'data',     label:'+12 anticoagulation traces',          who:'developer' },
    { d:2.5, kind:'review',   label:'judge-reaction pass · 18 reactions',  who:'Alice, Carla' },
    { d:2.8, kind:'rubric',   label:'c5 added · citation discipline',      who:'Carla' },
    { d:3.0, kind:'judge',    label:'judge v0.4 · +0.06 JHA',              who:'optimizer' },
    { d:3.3, kind:'discuss',  label:'thread on vitals-first opens',        who:'Bo' },
    { d:3.5, kind:'now',      label:'NOW · construct validity stuck',      who:'' },
  ];
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <SystemHeader/>

      {/* metric trajectory */}
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
          <span className="eyebrow">sprint trajectories · 7 days</span>
          <span style={{fontSize:11, color:'var(--ink-3)'}}>treat each metric like a training-run loss; watch slopes, not states</span>
        </div>
        <TrajectoryChart/>
      </div>

      {/* timeline + columns */}
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'180px 1fr', gap:1, background:'var(--line)'}}>

        {/* timeline rail */}
        <div style={{background:'var(--paper-2)', padding:'14px 14px', display:'flex', flexDirection:'column', gap:0, overflow:'auto'}} className="scroll">
          <div className="eyebrow" style={{marginBottom:10}}>activity timeline</div>
          <div style={{position:'relative', paddingLeft:18}}>
            <div style={{position:'absolute', left:6, top:6, bottom:6, width:1, background:'var(--line)'}}/>
            {events.map((e,i)=>{
              const c = e.kind==='now'?'var(--bad)':
                        e.kind==='data'?'var(--cyan)':
                        e.kind==='review'?'var(--accent)':
                        e.kind==='rubric'?'var(--violet)':
                        e.kind==='judge'?'var(--emerald)':'var(--amber)';
              return (
                <div key={i} style={{position:'relative', paddingBottom:14, opacity: e.kind==='now'?1:0.96}}>
                  <span style={{position:'absolute', left:-15, top:3, width:9, height:9, borderRadius:5, background:c, boxShadow: e.kind==='now'?'0 0 0 3px oklch(0.95 0.06 25)':'none'}}/>
                  <div style={{fontSize:11.5, fontWeight: e.kind==='now'?600:500, color:'var(--ink-2)', lineHeight:1.35}}>{e.label}</div>
                  <div style={{fontSize:10, color:'var(--ink-4)'}} className="mono">{`d${e.d.toFixed(1)} · ${e.who||'—'}`}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* the four columns, but as activity feeds */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'var(--line)', minHeight:0}}>
          <ActivityCol idx={1} title="Data Source" goal={null} accent="var(--cyan)">
            <ActivityRow t="d0.4" kind="add" text="32 starter traces from prod (last 30d)"/>
            <ActivityRow t="d2.1" kind="add" text="+12 warfarin/anticoagulation traces"/>
            <ActivityRow t="d3.2" kind="flag" text="coverage gap · pediatric dosing 0.42"/>
            <ActivityRow t="d3.4" kind="propose" text="optimizer: add 8 pediatric-dosing traces?"/>
            <Mini label="diversity" v={0.78}/>
            <Mini label="topic coverage" v={0.61}/>
            <Mini label="tool coverage" v={0.42} bad/>
          </ActivityCol>

          <ActivityCol idx={2} title="Review Feed" goal={SPRINT.goals[0]} accent="var(--accent)">
            <ActivityRow t="d0.9" kind="review" text="Alice · 4 blind reviews"/>
            <ActivityRow t="d2.5" kind="review" text="judge-reaction pass · 18 reactions"/>
            <ActivityRow t="d3.3" kind="discuss" text="Bo · thread: vitals-first for any bleed"/>
            <ActivityRow t="d3.5" kind="flag" text="9 reactions still outstanding on c2"/>
            <Mini label="IRR" v={0.71} target={0.80}/>
            <Mini label="reactions/day" v={0.65}/>
            <Mini label="discussion depth" v={0.58}/>
          </ActivityCol>

          <ActivityCol idx={3} title="Grading" goal={SPRINT.goals[1]} accent="var(--violet)">
            <ActivityRow t="d1.3" kind="rubric" text="c2 added · clinical safety (likert)"/>
            <ActivityRow t="d1.7" kind="judge" text="judge v0.3 baseline aligned · JHA 0.68"/>
            <ActivityRow t="d2.8" kind="rubric" text="c5 added · citation discipline"/>
            <ActivityRow t="d3.0" kind="judge" text="judge v0.4 · JHA 0.74 (+0.06)"/>
            <ActivityRow t="d3.4" kind="propose" text="split candidate · c2 → c2a vitals · c2b contraindications"/>
            <Mini label="JHA" v={0.74} target={0.85}/>
            <Mini label="rubric stability" v={0.62}/>
          </ActivityCol>

          <ActivityCol idx={4} title="Confidence" goal={SPRINT.goals[3]} accent="var(--bad)">
            <ActivityRow t="d3.5" kind="flag" text="construct validity stuck · 0.55→0.58 over 36h"/>
            <ActivityRow t="d3.5" kind="propose" text="resolve c2 ambiguity to unstick CV"/>
            <ActivityRow t="d3.5" kind="propose" text="re-engage Alice for 9 reactions"/>
            <Mini label="judge confidence" v={0.72} target={0.90}/>
            <Mini label="construct validity" v={0.58} target={0.80} bad/>
            <Mini label="readiness" v={0.46}/>
          </ActivityCol>
        </div>
      </div>
    </div>
  );
}

function ActivityCol({ idx, title, goal, accent, children }){
  return (
    <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
      <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{String(idx).padStart(2,'0')}</span>
          <span style={{fontSize:12.5, fontWeight:600}}>{title}</span>
          <span style={{flex:1}}/>
          {goal && <span className="mono" style={{fontSize:10, color: goal.status==='stuck'?'var(--bad)':'var(--good)'}}>
            {(goal.value*100).toFixed(0)}/{(goal.target*100).toFixed(0)}
          </span>}
        </div>
      </div>
      <div style={{padding:'10px 12px', display:'flex', flexDirection:'column', gap:6, overflow:'auto'}} className="scroll">
        {children}
      </div>
    </div>
  );
}

function ActivityRow({ t, kind, text }){
  const c = kind==='flag'?'var(--bad)':
            kind==='propose'?'var(--warn)':
            kind==='judge'?'var(--emerald)':
            kind==='rubric'?'var(--violet)':
            kind==='discuss'?'var(--accent)':
            kind==='review'?'var(--accent)':'var(--cyan)';
  return (
    <div style={{display:'flex', gap:8, fontSize:11.5, lineHeight:1.4, padding:'4px 0', borderBottom:'1px dashed var(--line-2)'}}>
      <span className="mono" style={{fontSize:10, color:'var(--ink-4)', width:30, flex:'none'}}>{t}</span>
      <Dot color={c} size={6} style={{marginTop:5}}/>
      <span style={{color:'var(--ink-2)'}}>{text}</span>
    </div>
  );
}

function Mini({ label, v, target, bad }){
  const c = bad ? 'var(--bad)' : 'var(--accent)';
  return (
    <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, marginTop:2}}>
      <span style={{flex:1, color:'var(--ink-3)'}}>{label}</span>
      <div style={{width:60, height:4, background:'var(--paper-3)', borderRadius:2, overflow:'hidden'}}>
        <div style={{width:`${Math.min(100, v*100)}%`, height:'100%', background:c}}/>
        {target!=null && <div style={{position:'relative', top:-4, left:`${target*100}%`, width:1, height:4, background:'var(--ink-3)'}}/>}
      </div>
      <span className="tnum mono" style={{fontSize:10, color:'var(--ink-2)', width:30, textAlign:'right'}}>{v.toFixed(2)}</span>
    </div>
  );
}

function TrajectoryChart(){
  const W=860, H=120, pad=22;
  const series = SPRINT.goals.map((g,i)=>({
    label: g.label,
    color: g.status==='stuck'?'var(--bad)':['var(--accent)','var(--violet)','var(--cyan)','var(--bad)'][i],
    target: g.target,
    values: g.trend,
    status: g.status,
  }));
  return (
    <div style={{display:'flex', gap:14, alignItems:'flex-start'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{flex:1, height:120}}>
        {/* gridlines */}
        {[0.5,0.7,0.9].map(y=>{
          const yy = H-pad - (y-0.4)/0.6 * (H-2*pad);
          return <g key={y}>
            <line x1={pad} y1={yy} x2={W-pad} y2={yy} stroke="var(--line)" strokeDasharray="2 4"/>
            <text x={6} y={yy+3} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)">{y.toFixed(1)}</text>
          </g>;
        })}
        {/* day labels */}
        {[0,1,2,3,4,5,6].map(d=>{
          const x = pad + (d/6)*(W-2*pad);
          return <text key={d} x={x} y={H-4} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="middle">d{d+1}</text>;
        })}
        {/* now marker at d4 */}
        <line x1={pad + (3/6)*(W-2*pad)} y1={pad/2} x2={pad + (3/6)*(W-2*pad)} y2={H-pad} stroke="var(--ink-3)" strokeDasharray="3 3"/>
        <text x={pad + (3/6)*(W-2*pad)+4} y={pad/2+8} fontSize="9" fill="var(--ink-3)" fontFamily="var(--mono)">now</text>
        {/* series */}
        {series.map((s,i)=>{
          const pts = s.values.map((v,idx)=>{
            const x = pad + (idx/(s.values.length-1))*(W-2*pad);
            const y = H-pad - (v-0.4)/0.6 * (H-2*pad);
            return [x,y];
          });
          // extrapolate dashed projection to target
          const last = pts[pts.length-1];
          const projX = pad + (6/6)*(W-2*pad);
          const projY = H-pad - (s.target-0.4)/0.6 * (H-2*pad);
          const d = 'M ' + pts.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' L ');
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1={last[0]} y1={last[1]} x2={projX} y2={projY} stroke={s.color} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.5"/>
              <circle cx={last[0]} cy={last[1]} r="3" fill={s.color}/>
              <circle cx={projX} cy={projY} r="3" fill="none" stroke={s.color}/>
            </g>
          );
        })}
      </svg>
      <div style={{display:'flex', flexDirection:'column', gap:5, minWidth:180}}>
        {series.map((s,i)=>(
          <div key={i} style={{display:'flex', alignItems:'center', gap:6, fontSize:11}}>
            <span style={{width:10, height:2, background:s.color}}/>
            <span style={{flex:1, color:'var(--ink-2)'}}>{s.label}</span>
            <span className="mono tnum" style={{color: s.status==='stuck'?'var(--bad)':'var(--ink-3)', fontSize:10}}>
              {(s.values[s.values.length-1]*100).toFixed(0)}/{(s.target*100).toFixed(0)}
              {s.status==='stuck'?' ◇':''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Direction C · Narrative ("what needs to happen next")
// ───────────────────────────────────────────────────────────────────
function WorkspaceC(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <SystemHeader/>

      {/* hero next-action */}
      <div style={{padding:'18px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:24, alignItems:'center'}}>
        <div>
          <div className="eyebrow" style={{color:'var(--bad)'}}>this sprint is stuck on construct validity</div>
          <div className="serif" style={{fontSize:24, fontWeight:500, lineHeight:1.25, marginTop:6, letterSpacing:'-0.01em'}}>
            Split <span className="mono" style={{fontSize:18, padding:'1px 6px', background:'var(--paper-3)', borderRadius:4}}>c2 · clinical safety</span> into two atomic criteria,
            then route 9 outstanding judge-reactions to a physician SME.
          </div>
          <div style={{fontSize:12.5, color:'var(--ink-3)', lineHeight:1.55, marginTop:8, maxWidth:720}}>
            SMEs disagree on whether a missing vitals check should fail c2 or just lower it. Until that ambiguity resolves, the judge can't get past 0.74 JHA and construct validity stays at 0.58. The optimizer expects this single change to move three of the four sprint metrics.
          </div>
          <div style={{display:'flex', gap:8, marginTop:14}}>
            <button className="btn primary"><I.spark/>Open the c2 split in Grading</button>
            <button className="btn">Send 9 reactions to Alice</button>
            <button className="btn ghost">Why this recommendation? ↗</button>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
          {SPRINT.goals.map(g=>(
            <div key={g.key} style={{padding:'10px 12px', borderRadius:'var(--r)', background: g.status==='stuck'?'oklch(0.97 0.04 25)':'var(--paper-2)', border:`1px solid ${g.status==='stuck'?'oklch(0.86 0.07 25)':'var(--line)'}`}}>
              <div className="eyebrow" style={{color: g.status==='stuck'?'var(--bad)':'var(--ink-3)'}}>{g.label}</div>
              <div style={{display:'flex', alignItems:'baseline', gap:4, marginTop:2}}>
                <span className="tnum" style={{fontSize:18, fontWeight:600}}>{(g.value*100).toFixed(0)}</span>
                <span style={{fontSize:10, color:'var(--ink-3)'}}>/ {(g.target*100).toFixed(0)}</span>
                {g.status==='stuck'
                  ? <span style={{fontSize:10, color:'var(--bad)', marginLeft:'auto'}}>stuck 36h</span>
                  : <span style={{fontSize:10, color:'var(--good)', marginLeft:'auto'}}>+{((g.value-g.prev)*100).toFixed(1)}</span>}
              </div>
              <MetricSpark values={g.trend} target={g.target} w={130} h={20}
                color={g.status==='stuck'?'var(--bad)':'var(--accent)'}/>
            </div>
          ))}
        </div>
      </div>

      {/* the four columns as a story */}
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:1, background:'var(--line)'}}>
        <NarrativeCol idx={1} title="Data Source"
          headline="Coverage is fine for this sprint."
          mood="ok"
          bullets={[
            { ok:true,  text:`${TRACE_SOURCE.sampled} traces sampled from ${TRACE_SOURCE.total.toLocaleString()} prod traces in the source experiment.` },
            { ok:true,  text:'Topic diversity 0.78 · novelty 0.61.' },
            { ok:false, text:'Tool-use coverage 0.42 — low; will cap c4 if next sprint needs it.' },
          ]}
          action={{ label:'Add 8 pediatric-dosing traces', sub:'optimizer suggestion · low priority for this sprint' }}
        />

        <NarrativeCol idx={2} title="Review Feed"
          headline="SMEs are reviewing. They disagree on c2."
          mood="warn"
          bullets={[
            { ok:true, text:'4 SMEs active; 47/64 traces blind-reviewed.' },
            { ok:true, text:'IRR 0.71, climbing about +0.05/24h.' },
            { ok:false, text:'9 traces still need a judge-reaction pass — all on c2.' },
            { ok:false, text:'1 unresolved discussion thread: Bo Tanaka on vitals-first.' },
          ]}
          action={{ label:'Open Discussion Pane on c2', sub:'1 unresolved thread · 3 typed reactions' }}
        />

        <NarrativeCol idx={3} title="Grading"
          headline="Judge agrees on 4 of 5 criteria. c2 is the bottleneck."
          mood="bad"
          bullets={[
            { ok:true, text:'Judge–human 0.74 (target 0.85). c1, c3, c4 all green.' },
            { ok:false, text:'c2 IRR 0.41 / JHA 0.62 — the only criterion failing both.' },
            { ok:false, text:'Optimizer flagged c2 as a split candidate 14h ago.' },
            { ok:true, text:'c2 lineage: 4 traces, 2 discussion threads, 3 SME judgements.' },
          ]}
          action={{ label:'Split c2 → c2a vitals · c2b contraindications', sub:'preview lineage migration · 11 source objects re-attach' }}
          lineage
        />

        <NarrativeCol idx={4} title="Confidence"
          headline="Not ready to close. One change unblocks three metrics."
          mood="bad"
          bullets={[
            { ok:false, text:'Construct validity stuck at 0.58 for 36h.' },
            { ok:true,  text:'Judge confidence 0.72, climbing slowly.' },
            { ok:false, text:'~31 more SME reactions needed for JHA 0.85.' },
            { ok:true,  text:'4d 10h remaining in sprint window.' },
          ]}
          action={{ label:'Promote judge v0.5 (locked)', sub:'will unlock when c2 resolves and CV ≥ 0.80' }}
        />
      </div>
    </div>
  );
}

function NarrativeCol({ idx, title, headline, mood, bullets, action, lineage }){
  const moodColor = mood==='bad'?'var(--bad)':mood==='warn'?'var(--warn)':'var(--good)';
  return (
    <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
      <div style={{padding:'12px 14px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:4}}>
          <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{String(idx).padStart(2,'0')}</span>
          <span style={{fontSize:12.5, fontWeight:600}}>{title}</span>
          <Dot color={moodColor} size={6} style={{marginLeft:4}}/>
        </div>
        <div className="serif" style={{fontSize:14, lineHeight:1.35, color:'var(--ink-2)'}}>{headline}</div>
      </div>
      <div style={{padding:'12px 14px', display:'flex', flexDirection:'column', gap:10, overflow:'auto', flex:1}} className="scroll">
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {bullets.map((b,i)=>(
            <div key={i} style={{display:'flex', gap:8, fontSize:11.5, lineHeight:1.45, color: b.ok?'var(--ink-2)':'var(--ink)'}}>
              <span style={{color: b.ok?'var(--good)':'var(--bad)', fontFamily:'var(--mono)', flex:'none', width:12}}>{b.ok?'·':'!'}</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>

        {lineage && <div className="card" style={{padding:'10px 12px'}}>
          <div className="eyebrow" style={{marginBottom:6}}>c2 lineage</div>
          <LineageMini/>
        </div>}

        <div style={{marginTop:'auto'}}>
          <div className="eyebrow" style={{marginBottom:5, color: mood==='bad'?'var(--bad)':'var(--ink-3)'}}>{mood==='bad'?'next action':mood==='warn'?'when ready':'no action'}</div>
          <div className="card" style={{padding:'10px 12px', background: mood==='bad'?'oklch(0.98 0.02 25)':'var(--paper)', borderColor: mood==='bad'?'oklch(0.86 0.07 25)':'var(--line)', display:'flex', flexDirection:'column', gap:3}}>
            <span style={{fontSize:12, fontWeight:500}}>{action.label}</span>
            <span style={{fontSize:10.5, color:'var(--ink-3)'}}>{action.sub}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineageMini(){
  // tiny dependency diagram: source objects -> c2 criterion
  return (
    <svg width="100%" viewBox="0 0 240 88" style={{display:'block'}}>
      {[
        {x:8,  y:8,  label:'tr_82af',     color:'var(--cyan)'},
        {x:8,  y:30, label:'tr_91ce',     color:'var(--cyan)'},
        {x:8,  y:52, label:'thread #11',  color:'var(--accent)'},
        {x:8,  y:74, label:'Bo · score 2',color:'var(--violet)'},
      ].map((n,i)=>(
        <g key={i}>
          <rect x={n.x} y={n.y} width="92" height="14" rx="3" fill="var(--paper)" stroke={n.color}/>
          <text x={n.x+5} y={n.y+10} fontSize="9.5" fill="var(--ink-2)" fontFamily="var(--mono)">{n.label}</text>
          <path d={`M ${n.x+92} ${n.y+7} C ${(n.x+92+170)/2} ${n.y+7}, ${(n.x+92+170)/2} 44, 170 44`} fill="none" stroke={n.color} strokeWidth="1" opacity="0.5"/>
        </g>
      ))}
      <rect x={170} y={32} width="64" height="24" rx="4" fill="oklch(0.95 0.05 268)" stroke="var(--accent)"/>
      <text x={202} y={48} fontSize="11" fill="var(--ink)" textAnchor="middle" fontWeight="600">c2 · safety</text>
    </svg>
  );
}

Object.assign(window, { WorkspaceA, WorkspaceB, WorkspaceC });
