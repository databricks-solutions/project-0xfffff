// JBW v2 — Grading (CUJ: Elicit Rubric Criteria + Improve Evaluation Confidence)
// Three directions:
//   A · Criterion deep-dive — one criterion at a time, full lineage + alignment
//   B · Rubric matrix       — heatmap of criteria × traces, AI vs human deltas
//   C · Versions & lineage  — diff and lineage across rubric versions

const CRIT_DETAIL = {
  id:'c2', title:'Clinical safety', type:'likert (1–5)', version:'v0.4 · proposed split',
  desc:'Does the response avoid safety-relevant omissions (vitals, contraindications) and stay within safe-recommendation bounds?',
  irr: 0.41, jha: 0.62, n: 47,
  byScore: [3,8,14,16,6],
  smeJudge: [
    [4,3],[5,5],[3,2],[2,1],[5,4],[4,4],[3,3],[2,4],[5,5],[3,2],
    [4,3],[5,5],[3,4],[2,4],[5,4],[3,3],[1,3],[4,4],[5,4],[3,2],
  ],
  lineage: {
    traces: ['tr_82af','tr_aa12','tr_91ce','tr_d31e'],
    threads: ['#11 vitals-first','#7 ER memory scope'],
    judgements: 11,
  },
  proposals: [
    { kind:'split', label:'split into c2a · vitals-check (binary) + c2b · contraindications (likert)', impact:'+0.10 CV expected · IRR projected 0.78 / 0.66', state:'pending' },
    { kind:'hurdle', label:'gate scoring on vitals presence', impact:'will lower mean score; expected JHA +0.04', state:'rejected' },
  ],
};

const ALL_CRITERIA = [
  { id:'c1', t:'Factual accuracy',  irr:0.83, jha:0.91, n:47, status:'stable' },
  { id:'c2', t:'Clinical safety',   irr:0.41, jha:0.62, n:47, status:'split candidate' },
  { id:'c3', t:'Tone for audience', irr:0.66, jha:0.78, n:47, status:'stable' },
  { id:'c4', t:'Completeness',      irr:0.71, jha:0.81, n:47, status:'stable' },
  { id:'c5', t:'Citation discipline',irr:0.55, jha:null, n:32, status:'low coverage' },
];

// ─────────────────────────────────────────────────────────────────
// A · Criterion deep-dive
// ─────────────────────────────────────────────────────────────────
function GradingA(){
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <GRHeader sub="Criterion deep-dive · one criterion · alignment evidence · lineage · discussion"/>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'240px 1fr 320px', gap:1, background:'var(--line)'}}>
        {/* rubric rail */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
            <span className="eyebrow">rubric · clinical-advice v0.4</span>
          </div>
          <div style={{flex:1, overflow:'auto'}} className="scroll">
            {ALL_CRITERIA.map(c=>(
              <div key={c.id} style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', borderLeft: c.id==='c2'?'2px solid var(--accent)':'2px solid transparent', background: c.id==='c2'?'oklch(0.97 0.03 268)':'transparent'}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{c.id}</span>
                  <span style={{fontSize:11.5, fontWeight: c.id==='c2'?600:500}}>{c.t}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:6, marginTop:4, fontSize:10}} className="mono">
                  <span style={{color: c.irr<0.5?'var(--bad)':'var(--ink-3)'}}>IRR {c.irr.toFixed(2)}</span>
                  <span style={{color:'var(--ink-4)'}}>·</span>
                  <span style={{color: !c.jha?'var(--ink-4)':c.jha<0.7?'var(--bad)':'var(--ink-3)'}}>JHA {c.jha?c.jha.toFixed(2):'—'}</span>
                </div>
                {c.status!=='stable' && <div style={{fontSize:10, color:'var(--bad)', marginTop:3}}>◇ {c.status}</div>}
              </div>
            ))}
            <button className="btn ghost" style={{margin:'10px', fontSize:11}}><I.plus/>Add criterion</button>
          </div>
        </div>

        {/* main */}
        <div style={{background:'var(--paper)', overflow:'auto', padding:'18px 24px'}} className="scroll">
          <div style={{maxWidth:760}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <span className="mono" style={{fontSize:11, padding:'2px 6px', background:'var(--paper-3)', borderRadius:4}}>c2</span>
              <span className="serif" style={{fontSize:22, fontWeight:500, letterSpacing:'-0.01em'}}>{CRIT_DETAIL.title}</span>
              <span className="chip warn" style={{fontSize:10}}>{CRIT_DETAIL.version.split(' · ')[1]}</span>
            </div>
            <div className="mono" style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>{CRIT_DETAIL.type} · {CRIT_DETAIL.n} assessments</div>
            <p style={{fontSize:13, lineHeight:1.55, color:'var(--ink-2)', marginTop:10, maxWidth:660}}>{CRIT_DETAIL.desc}</p>

            {/* alignment */}
            <div style={{marginTop:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
              <div className="card" style={{padding:'12px 14px'}}>
                <div className="eyebrow">human ↔ AI · alignment</div>
                <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                  <span className="tnum" style={{fontSize:24, fontWeight:600}}>0.62</span>
                  <span style={{fontSize:11, color:'var(--ink-3)'}}>JHA · target 0.85</span>
                </div>
                <GRScatterMatrix pts={CRIT_DETAIL.smeJudge}/>
                <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:4}}>14 of 20 within ±1 · 6 outliers (judge under-penalizes vitals omission)</div>
              </div>
              <div className="card" style={{padding:'12px 14px'}}>
                <div className="eyebrow">human ↔ human · IRR</div>
                <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                  <span className="tnum" style={{fontSize:24, fontWeight:600, color:'var(--bad)'}}>0.41</span>
                  <span style={{fontSize:11, color:'var(--ink-3)'}}>across {CRIT_DETAIL.n} · target 0.80</span>
                </div>
                <GRHistogram values={CRIT_DETAIL.byScore}/>
                <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:4}}>SMEs disagree mostly on 2 vs 4 — vitals-check ambiguity.</div>
              </div>
            </div>

            {/* proposals */}
            <div style={{marginTop:18}}>
              <div className="eyebrow">proposed changes</div>
              <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:6}}>
                {CRIT_DETAIL.proposals.map((p,i)=>(
                  <div key={i} className="card" style={{padding:'10px 12px', borderColor: p.state==='pending'?'oklch(0.85 0.06 268)':'var(--line)', background: p.state==='pending'?'oklch(0.99 0.01 268)':'var(--paper)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <span className={`chip ${p.state==='pending'?'accent':''}`} style={{fontSize:10}}>{p.kind}</span>
                      <span style={{fontSize:12, fontWeight:500}}>{p.label}</span>
                      <span style={{flex:1}}/>
                      <span className="mono" style={{fontSize:10, color:'var(--ink-4)'}}>{p.state}</span>
                    </div>
                    <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>{p.impact}</div>
                    {p.state==='pending' && <div style={{display:'flex', gap:6, marginTop:8}}>
                      <button className="btn primary" style={{fontSize:11}}>Apply split</button>
                      <button className="btn" style={{fontSize:11}}>Preview lineage migration</button>
                      <button className="btn ghost" style={{fontSize:11}}>Reject</button>
                    </div>}
                  </div>
                ))}
              </div>
            </div>

            {/* lineage */}
            <div style={{marginTop:18}}>
              <div className="eyebrow">rubric lineage · sources</div>
              <GRLineageTree/>
              <div style={{fontSize:11, color:'var(--ink-3)', marginTop:6}}>
                c2 derived from {CRIT_DETAIL.lineage.traces.length} traces, {CRIT_DETAIL.lineage.threads.length} discussion threads, {CRIT_DETAIL.lineage.judgements} SME judgements. From a trace or thread you can navigate the other way.
              </div>
            </div>

            {/* underlying judges */}
            <div style={{marginTop:18}}>
              <div className="eyebrow">underlying judges · rubric API</div>
              <div className="card" style={{padding:'10px 12px', marginTop:6}}>
                <div style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.5}}>
                  c2 is judged by <span className="mono">judge-clinical-safety@v0.4</span> + a coverage-gap probe. After split: c2a will use a binary checker (regex + LLM), c2b will keep the likert judge with updated guidelines.
                </div>
                <div style={{display:'flex', gap:6, marginTop:8, alignItems:'center'}}>
                  <span className="chip mono" style={{fontSize:10}}>judge-clinical-safety@v0.4</span>
                  <span className="chip mono" style={{fontSize:10}}>vitals-probe (proposed)</span>
                  <span style={{flex:1}}/>
                  <a style={{fontSize:11, color:'var(--accent)'}}>view judge guidelines ↗</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* discussion pane on criterion */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', gap:6}}>
            <I.comment/><span style={{fontSize:12, fontWeight:600}}>Discussion · c2</span>
            <span className="chip bad" style={{fontSize:9.5, marginLeft:'auto'}}>1 unresolved</span>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:12}} className="scroll">
            <GRDThread who="Bo Tanaka" when="2h" tag="too narrow" text='For any bleed I want vitals before a checklist. The rubric should require a vitals-check or this scores 2.'/>
            <GRDThread who="Alice Chen" when="1h" tag="changed my mind" text='Agree on requiring it. Could be a hurdle on c2 rather than a separate criterion.'/>
            <GRDThread who="optimizer" when="45m" tag="proposed" text='Proposing split: c2a · vitals-check (binary) · c2b · contraindication-check (likert). Lineage preserves Bo&apos;s thread.'/>
          </div>
        </div>
      </div>
    </div>
  );
}

function GRHeader({ sub }){
  return (
    <div style={{padding:'12px 22px', borderBottom:'1px solid var(--line)', background:'var(--paper)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <a style={{fontSize:11, color:'var(--ink-3)'}}>← Workspace</a>
          <span style={{fontSize:11, color:'var(--ink-4)'}}>/</span>
          <span style={{fontSize:13, fontWeight:600}}>Grading</span>
          <span className="chip">rubric v0.4 · 5 criteria · 47 assessments</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>{sub}</div>
      </div>
      <div style={{display:'flex', gap:8}}>
        <button className="btn"><I.diff/>versions</button>
        <button className="btn primary"><I.spark/>Optimizer · 1 proposal</button>
      </div>
    </div>
  );
}

function GRDThread({ who, when, tag, text }){
  return (
    <div style={{display:'flex', gap:8}}>
      <Avatar name={who} size={22}/>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontSize:11.5, fontWeight:500}}>{who}</span>
          <span className="mono" style={{fontSize:10, color:'var(--ink-4)'}}>{when}</span>
          <span className="chip" style={{fontSize:9.5, marginLeft:'auto'}}>{tag}</span>
        </div>
        <div dangerouslySetInnerHTML={{__html:text}} style={{fontSize:11.5, color:'var(--ink-2)', lineHeight:1.45, marginTop:3}}/>
      </div>
    </div>
  );
}

function GRScatterMatrix({ pts }){
  const W=240, H=110, pad=12;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block', marginTop:6}}>
      <line x1={pad} y1={H-pad} x2={W-pad} y2={pad} stroke="var(--line)" strokeDasharray="2 3"/>
      {pts.map(([sx,sy],i)=>{
        const x = pad + (sx-1)/4 * (W-2*pad);
        const y = H-pad - (sy-1)/4 * (H-2*pad);
        const off = Math.abs(sx-sy);
        const c = off>=2 ? 'var(--bad)' : off===1 ? 'var(--warn)' : 'var(--good)';
        return <circle key={i} cx={x} cy={y} r="3.2" fill={c} fillOpacity="0.65"/>;
      })}
      <text x={pad} y={H-2} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)">SME →</text>
      <text x={W-pad-22} y={pad+4} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)">↑ judge</text>
    </svg>
  );
}

function GRHistogram({ values }){
  const max = Math.max(...values);
  return (
    <div style={{display:'flex', alignItems:'flex-end', gap:8, height:80, marginTop:8}}>
      {values.map((v,i)=>(
        <div key={i} style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3}}>
          <div style={{width:'100%', height: (v/max)*60, background: i===1||i===3?'var(--bad)':'var(--accent)', opacity:0.8, borderRadius:'3px 3px 0 0'}}/>
          <span className="mono" style={{fontSize:9, color:'var(--ink-3)'}}>{i+1}</span>
        </div>
      ))}
    </div>
  );
}

function GRLineageTree(){
  return (
    <svg width="100%" viewBox="0 0 660 130" style={{display:'block', marginTop:6}}>
      {/* sources */}
      {[
        {x:8,y:8,label:'tr_82af · warfarin',color:'var(--cyan)'},
        {x:8,y:30,label:'tr_aa12 · MH triage',color:'var(--cyan)'},
        {x:8,y:52,label:'tr_91ce · 10-K',color:'var(--cyan)'},
        {x:8,y:74,label:'tr_d31e · pediatric',color:'var(--cyan)'},
        {x:8,y:96,label:'thread #11 · vitals',color:'var(--accent)'},
      ].map((n,i)=>(
        <g key={i}>
          <rect x={n.x} y={n.y} width="160" height="14" rx="3" fill="var(--paper)" stroke={n.color}/>
          <text x={n.x+5} y={n.y+10} fontSize="9.5" fill="var(--ink-2)" fontFamily="var(--mono)">{n.label}</text>
          <path d={`M 168 ${n.y+7} C 230 ${n.y+7}, 250 60, 290 60`} fill="none" stroke={n.color} strokeWidth="1" opacity="0.5"/>
        </g>
      ))}
      {/* center criterion */}
      <rect x={290} y={48} width="100" height="24" rx="4" fill="oklch(0.95 0.05 268)" stroke="var(--accent)"/>
      <text x={340} y={64} fontSize="11" fill="var(--ink)" textAnchor="middle" fontWeight="600">c2 · safety</text>
      {/* downstream */}
      {[
        {x:430,y:18,label:'judge-clinical@v0.4',color:'var(--emerald)'},
        {x:430,y:50,label:'47 assessments',color:'var(--violet)'},
        {x:430,y:82,label:'2 prod incidents',color:'var(--bad)'},
      ].map((n,i)=>(
        <g key={i}>
          <path d={`M 390 60 C 410 60, 415 ${n.y+7}, 430 ${n.y+7}`} fill="none" stroke={n.color} strokeWidth="1" opacity="0.5"/>
          <rect x={n.x} y={n.y} width="200" height="14" rx="3" fill="var(--paper)" stroke={n.color}/>
          <text x={n.x+5} y={n.y+10} fontSize="9.5" fill="var(--ink-2)" fontFamily="var(--mono)">{n.label}</text>
        </g>
      ))}
      <text x={86} y={126} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="middle">sources</text>
      <text x={340} y={126} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="middle">criterion</text>
      <text x={530} y={126} fontSize="9" fill="var(--ink-4)" fontFamily="var(--mono)" textAnchor="middle">downstream uses</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// B · Rubric matrix
// ─────────────────────────────────────────────────────────────────
function GradingB(){
  // mock: 5 criteria × 14 traces, store [sme, judge] per cell or null
  const traces = ['tr_82af','tr_aa12','tr_91ce','tr_4b07','tr_d31e','tr_7b22','tr_9914','tr_2271','tr_3105','tr_8819','tr_4404','tr_5602','tr_6193','tr_7777'];
  const seed = (i,j)=>(i*7+j*3)%9;
  const matrix = ALL_CRITERIA.map((c,i)=>traces.map((t,j)=>{
    const s = seed(i,j);
    if (s===0 && i===4) return null;
    const sme = 1 + (s % 5);
    const judge = Math.max(1, Math.min(5, sme + ((s%3)-1) + (i===1?(j%2?-1:1):0)));
    return [sme, judge];
  }));
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <GRHeader sub="Rubric matrix · criteria × traces · color = SME-judge delta · click a cell to open the trace"/>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'1fr 320px', gap:1, background:'var(--line)'}}>
        <div style={{background:'var(--paper)', overflow:'auto', padding:'18px 22px'}} className="scroll">
          <div style={{display:'flex', gap:18, marginBottom:14}}>
            <span className="chip good"><span style={{width:8,height:8,background:'var(--good)',borderRadius:2,display:'inline-block'}}/> match (Δ=0)</span>
            <span className="chip warn"><span style={{width:8,height:8,background:'var(--warn)',borderRadius:2,display:'inline-block'}}/> ±1</span>
            <span className="chip bad"><span style={{width:8,height:8,background:'var(--bad)',borderRadius:2,display:'inline-block'}}/> ≥ ±2</span>
            <span className="chip"><span style={{width:8,height:8,background:'var(--paper-3)',border:'1px solid var(--line)',borderRadius:2,display:'inline-block'}}/> not assessed</span>
          </div>

          <div style={{display:'grid', gridTemplateColumns:`200px repeat(${traces.length}, 28px) 60px 60px`, gap:2, alignItems:'center'}}>
            <div/>
            {traces.map(t=><div key={t} className="mono" style={{fontSize:8.5, color:'var(--ink-4)', writingMode:'vertical-rl', transform:'rotate(180deg)', height:60, lineHeight:1}}>{t}</div>)}
            <div className="eyebrow" style={{fontSize:9, textAlign:'right'}}>IRR</div>
            <div className="eyebrow" style={{fontSize:9, textAlign:'right'}}>JHA</div>

            {ALL_CRITERIA.map((c,i)=>(
              <React.Fragment key={c.id}>
                <div style={{display:'flex', flexDirection:'column', gap:2}}>
                  <span style={{fontSize:11.5, fontWeight:500}}>{c.t}</span>
                  <span className="mono" style={{fontSize:9.5, color:'var(--ink-4)'}}>{c.id}</span>
                </div>
                {matrix[i].map((cell,j)=>{
                  if (!cell) return <div key={j} style={{width:28, height:28, background:'var(--paper-3)', border:'1px solid var(--line)', borderRadius:3}}/>;
                  const [sme,jud]=cell;
                  const off = Math.abs(sme-jud);
                  const bg = off>=2?'oklch(0.85 0.14 25)':off===1?'oklch(0.9 0.1 75)':'oklch(0.88 0.1 160)';
                  return (
                    <div key={j} style={{width:28, height:28, background:bg, borderRadius:3, position:'relative', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>
                      <span className="mono" style={{fontSize:9, color:'var(--ink)', fontWeight:600}}>{sme}</span>
                      <span style={{position:'absolute', bottom:1, right:2, fontSize:7.5, color:'var(--ink-3)'}} className="mono">{jud}</span>
                    </div>
                  );
                })}
                <div className="mono tnum" style={{fontSize:10.5, textAlign:'right', color: c.irr<0.5?'var(--bad)':'var(--ink-2)'}}>{c.irr.toFixed(2)}</div>
                <div className="mono tnum" style={{fontSize:10.5, textAlign:'right', color: !c.jha?'var(--ink-4)':c.jha<0.7?'var(--bad)':'var(--ink-2)'}}>{c.jha?c.jha.toFixed(2):'—'}</div>
              </React.Fragment>
            ))}
          </div>

          <div style={{marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <div className="card" style={{padding:'12px 14px'}}>
              <div className="eyebrow">human ↔ AI · all criteria</div>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                <span className="tnum" style={{fontSize:24, fontWeight:600}}>0.74</span>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>JHA · target 0.85 · +0.06 last 24h</span>
              </div>
            </div>
            <div className="card" style={{padding:'12px 14px'}}>
              <div className="eyebrow">delta heat · 235 cells</div>
              <div style={{display:'flex', gap:8, marginTop:6}}>
                <GRStat label="match" v="62%"/>
                <GRStat label="±1" v="29%"/>
                <GRStat label="≥±2" v="9%" bad/>
              </div>
            </div>
          </div>
        </div>

        {/* right: cell drilldown */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}>
            <div className="eyebrow">selected · c2 × tr_82af</div>
            <div style={{fontSize:12, fontWeight:600, marginTop:3}}>warfarin · INR 4.8 nosebleed</div>
          </div>
          <div style={{flex:1, overflow:'auto', padding:'12px 14px'}} className="scroll">
            <div className="card" style={{padding:'10px 12px', marginBottom:10}}>
              <div className="eyebrow">SME assessments</div>
              <div style={{display:'flex', flexDirection:'column', gap:5, marginTop:6}}>
                {[['Alice',4],['Bo',2],['Carla',3]].map(([who,s])=>(
                  <div key={who} style={{display:'flex', alignItems:'center', gap:6, fontSize:11}}>
                    <Avatar name={who} size={18}/><span>{who}</span><span style={{flex:1}}/>
                    <span className="tnum mono" style={{fontWeight:600}}>{s}/5</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{padding:'10px 12px', marginBottom:10}}>
              <div className="eyebrow">judge · v0.4</div>
              <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, marginTop:6}}>
                <I.bot/><span>judge-clinical-safety</span><span style={{flex:1}}/>
                <span className="tnum mono" style={{fontWeight:600}}>4/5</span>
              </div>
              <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:6, lineHeight:1.4}}>"Plan correctly avoids reflexive vitamin K. Tone slightly clinical."</div>
            </div>
            <div className="card" style={{padding:'10px 12px'}}>
              <div className="eyebrow">disagreement signal</div>
              <div style={{fontSize:11, color:'var(--ink-2)', marginTop:6, lineHeight:1.45}}>Bo's 2 vs others' 4 indicates the vitals-first ambiguity that c2 split would resolve.</div>
              <button className="btn" style={{fontSize:11, marginTop:8}}>Open trace · pass 2</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GRStat({ label, v, bad }){
  return (
    <div style={{flex:1, padding:'6px 8px', borderRadius:'var(--r-sm)', background:'var(--paper-2)', border:'1px solid var(--line)'}}>
      <span className="eyebrow">{label}</span>
      <div className="tnum" style={{fontSize:18, fontWeight:600, color: bad?'var(--bad)':'var(--ink)'}}>{v}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// C · Versions & lineage
// ─────────────────────────────────────────────────────────────────
function GradingC(){
  const versions = [
    { v:'v0.4', when:'now',   author:'Bo Tanaka', n:5, jha:0.74, note:'added c5 citation; c2 split candidate' },
    { v:'v0.3', when:'2d ago',author:'optimizer', n:4, jha:0.68, note:'c2 introduced (clinical safety)' },
    { v:'v0.2', when:'3d ago',author:'developer', n:3, jha:0.63, note:'tone criterion split into audience-specific' },
    { v:'v0.1', when:'setup', author:'optimizer', n:3, jha:0.59, note:'starter rubric from system description' },
  ];
  return (
    <div style={{width:'100%', height:'100%', background:'var(--paper-2)', display:'flex', flexDirection:'column', fontSize:13}}>
      <GRHeader sub="Versions & lineage · what changed, why, and what re-attaches"/>
      <div style={{flex:1, minHeight:0, display:'grid', gridTemplateColumns:'260px 1fr', gap:1, background:'var(--line)'}}>
        {/* version rail */}
        <div style={{background:'var(--paper-2)', display:'flex', flexDirection:'column', minHeight:0}}>
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--line)', background:'var(--paper)'}}><span className="eyebrow">rubric versions</span></div>
          <div style={{flex:1, overflow:'auto'}} className="scroll">
            {versions.map((v,i)=>(
              <div key={v.v} style={{padding:'12px 14px', borderBottom:'1px solid var(--line)', borderLeft: i===0?'2px solid var(--accent)':'2px solid transparent', background: i===0?'oklch(0.97 0.03 268)':'transparent'}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <span className="mono" style={{fontSize:11, fontWeight:600}}>{v.v}</span>
                  <span style={{fontSize:10.5, color:'var(--ink-4)'}}>{v.when}</span>
                  <span style={{flex:1}}/>
                  <span className="mono tnum" style={{fontSize:10, color:'var(--ink-3)'}}>JHA {v.jha.toFixed(2)}</span>
                </div>
                <div style={{fontSize:11, color:'var(--ink-2)', marginTop:4, lineHeight:1.4}}>{v.note}</div>
                <div style={{fontSize:10, color:'var(--ink-4)', marginTop:4}}>by {v.author} · {v.n} criteria</div>
              </div>
            ))}
          </div>
        </div>

        {/* diff */}
        <div style={{background:'var(--paper)', overflow:'auto', padding:'18px 24px'}} className="scroll">
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
            <span style={{fontSize:13}}>diff</span>
            <span className="chip mono" style={{fontSize:10}}>v0.3</span>
            <span style={{color:'var(--ink-4)'}}>→</span>
            <span className="chip accent mono" style={{fontSize:10}}>v0.4 (proposed)</span>
            <span style={{flex:1}}/>
            <button className="btn">Show metric impact</button>
            <button className="btn primary">Promote v0.4</button>
          </div>

          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            <GRDiffRow kind="add" id="c5" title="Citation discipline" body="When sources are referenced, are they verifiable and necessary?" sub="proposed by Carla · derived from 2 traces"/>
            <GRDiffRow kind="split" id="c2" title="Clinical safety → c2a vitals + c2b contraindications" body="Atomic decomposition. c2a binary, c2b likert. Hurdle on c2a gates c2b scoring." sub="lineage migration: 11 SME judgements re-attach to c2b · 4 to c2a"/>
            <GRDiffRow kind="edit" id="c3" title="Tone for audience" body="Edited: examples added for patient-facing vs analyst register." sub="judge guidelines updated to match"/>
            <GRDiffRow kind="keep" id="c1" title="Factual accuracy" body="Unchanged · IRR 0.83 · JHA 0.91" sub=""/>
          </div>

          <div style={{marginTop:18}}>
            <div className="eyebrow" style={{marginBottom:6}}>downstream effects when promoted</div>
            <div className="card" style={{padding:'12px 14px'}}>
              <div style={{display:'flex', flexDirection:'column', gap:6, fontSize:11.5, color:'var(--ink-2)'}}>
                <GREffect label="judge-clinical-safety@v0.4" change="re-prompted with split criteria; regression vs anchor set"/>
                <GREffect label="judge v0.5" change="will be created and shadow-evaluated; ready when ≥0.85 anchor stability"/>
                <GREffect label="42 prod traces" change="re-scored under v0.4 in shadow; differences surface in Eval Ops"/>
                <GREffect label="thread #11 (Bo · vitals-first)" change="resolves; remains linked as lineage source for c2a"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GRDiffRow({ kind, id, title, body, sub }){
  const c = {add:'var(--good)', split:'var(--accent)', edit:'var(--warn)', keep:'var(--ink-4)'}[kind];
  const sym = {add:'+', split:'⇄', edit:'~', keep:'·'}[kind];
  return (
    <div style={{display:'flex', gap:10, padding:'10px 12px', borderRadius:'var(--r)', background: kind==='keep'?'transparent':'var(--paper-2)', border:'1px solid var(--line)'}}>
      <div style={{width:24, color:c, fontSize:18, fontFamily:'var(--mono)', fontWeight:600, lineHeight:1}}>{sym}</div>
      <div style={{flex:1}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{id}</span>
          <span style={{fontSize:12.5, fontWeight:500}}>{title}</span>
          <span className="chip" style={{fontSize:9.5, marginLeft:'auto', color:c, borderColor:c}}>{kind}</span>
        </div>
        <div style={{fontSize:11, color:'var(--ink-2)', marginTop:4, lineHeight:1.5}}>{body}</div>
        {sub && <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:3}} className="mono">{sub}</div>}
      </div>
    </div>
  );
}

function GREffect({ label, change }){
  return (
    <div style={{display:'flex', gap:10}}>
      <span className="mono" style={{fontSize:10.5, color:'var(--ink-3)', minWidth:200}}>{label}</span>
      <span style={{flex:1}}>{change}</span>
    </div>
  );
}

Object.assign(window, { GradingA, GradingB, GradingC });
