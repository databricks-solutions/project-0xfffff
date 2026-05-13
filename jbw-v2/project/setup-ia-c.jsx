// JBW v2 — Setup IA · Variation C: SETUP COMMAND CENTER.
//
// "Setup is a dependency map. Each artifact is a node; edges are
// 'unlocks'. The map is the IA — same view drives setup, sprint creation,
// and post-setup maintenance. Click a node to open its settings sheet
// in-place; the map stays as orientation."
//
// Tweak: dependency edges can be toggled off (we listen for a CSS class
// on document.documentElement set by the host's tweaks panel).

const { useState: useS_setupC, useEffect: useE_setupC } = React;

// Layout: position artifacts on a 3-column grid encoding dependency depth.
// col 0: roots (no prereqs that are also artifacts)
// col 1: depends on col 0
// col 2: depends on col 1
// (Hand-tuned — small set, no need for a real layout engine.)
const NODE_POS = {
  profile: { col:0, row:0 },
  source:  { col:0, row:1 },
  people:  { col:0, row:2 },
  rubric:  { col:1, row:0 },
  judge:   { col:1, row:1 },
  pool:    { col:2, row:0 },
  sprint:  { col:2, row:1 },
};

const COL_W = 250;
const ROW_H = 110;
const PAD_X = 80;
const PAD_Y = 60;

function nodeXY(id){
  const p = NODE_POS[id];
  return { x: PAD_X + p.col*COL_W, y: PAD_Y + p.row*ROW_H };
}

function SetupC(){
  const [open, setOpen] = useS_setupC(null);  // null = map view; otherwise an artifact id
  const [edges, setEdges] = useS_setupC(true);

  // listen for tweak signal — 'data-edges' attribute on root toggled by tweaks panel
  useE_setupC(()=>{
    const root = document.documentElement;
    const update = ()=> setEdges(root.dataset.edges !== 'off');
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes:true, attributeFilter:['data-edges'] });
    return ()=> obs.disconnect();
  }, []);

  const cur = open ? ARTIFACTS.find(a=>a.id===open) : null;

  return (
    <div style={{width:'100%', height:'100%', display:'flex', flexDirection:'column', background:'var(--paper-2)', fontSize:13}}>
      <SetupHeader kind="Setup · command center" right={
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{fontSize:11, color:'var(--ink-3)'}}>{PROGRESS.done}/{PROGRESS.total} · {PROGRESS.pct}%</span>
          <button className="btn ghost" style={{padding:'4px 8px', fontSize:11}} onClick={()=>{
            const root = document.documentElement;
            root.dataset.edges = root.dataset.edges==='off' ? 'on' : 'off';
          }}>{edges?'Hide':'Show'} dependency edges</button>
          <button className="btn primary"><I.spark/>{NEXT_OP.op}</button>
        </div>
      }/>

      <div style={{flex:1, position:'relative', minHeight:0, display:'flex'}}>
        {/* MAP */}
        <div style={{flex: cur?1:1.6, position:'relative', overflow:'hidden', borderRight: cur?'1px solid var(--line)':'none', transition:'flex .2s'}}>
          {/* legend bar */}
          <div style={{position:'absolute', top:14, left:18, right:18, display:'flex', justifyContent:'space-between', alignItems:'center', zIndex:2}}>
            <div className="eyebrow">DEPENDENCY MAP · 7 ARTIFACTS</div>
            <div style={{display:'flex', gap:10, fontSize:10.5, color:'var(--ink-3)', alignItems:'center'}}>
              <Legend color="var(--good)" label="configured"/>
              <Legend color="var(--accent)" label="in progress"/>
              <Legend color="var(--ink-4)" label="todo / blocked" outline/>
              <span style={{width:1, height:12, background:'var(--line)'}}/>
              <span>→ unlocks</span>
            </div>
          </div>

          <DependencyMap focusId={open} onPick={setOpen} edgesOn={edges}/>

          {/* footer — next-best */}
          <div style={{position:'absolute', left:18, right:18, bottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'10px 14px', background:'var(--paper)', border:'1px solid var(--line)', borderRadius:'var(--r)', boxShadow:'var(--shadow-1)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <Blob seed={NEXT_OP.id} size={22}/>
              <div>
                <div className="eyebrow" style={{marginBottom:2}}>NEXT BEST ACTION</div>
                <div style={{fontSize:13, fontWeight:600}}>{NEXT_OP.op}</div>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--ink-3)'}}>
              <span>unblocks</span>
              {ARTIFACTS.filter(a=>a.blocks.includes(NEXT_OP.id)).map(a=>(
                <span key={a.id} className="chip" style={{padding:'2px 7px', fontSize:10}}>{a.label}</span>
              ))}
            </div>
            <button className="btn primary" onClick={()=>setOpen(NEXT_OP.id)}>Open →</button>
          </div>
        </div>

        {/* SHEET — opens when a node is selected */}
        {cur && (
          <div className="scroll" style={{width:520, flexShrink:0, overflowY:'auto', background:'var(--paper)'}}>
            <div style={{padding:'18px 22px 12px', borderBottom:'1px solid var(--line-2)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12}}>
              <div>
                <div className="eyebrow" style={{marginBottom:5}}>PROJECT SETTINGS · {cur.label.toUpperCase()}</div>
                <div className="serif" style={{fontSize:22, fontWeight:500, letterSpacing:'-0.005em'}}>{cur.label}</div>
                <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:4}}>{cur.summary}</div>
              </div>
              <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6}}>
                <StatePill state={cur.state}/>
                <button className="btn ghost" style={{padding:'2px 6px', fontSize:11}} onClick={()=>setOpen(null)}><I.x/>Close</button>
              </div>
            </div>
            <div style={{padding:'12px 0'}}>
              <SettingsBody artifact={cur}/>
            </div>
            <div style={{padding:'12px 22px', borderTop:'1px solid var(--line-2)', background:'var(--paper-2)'}}>
              <div className="eyebrow" style={{marginBottom:6}}>EDGES</div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {cur.blocks.length>0 && (
                  <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11.5}}>
                    <span style={{color:'var(--ink-3)'}}>requires</span>
                    {cur.blocks.map(b=>{
                      const dep = ARTIFACTS.find(x=>x.id===b);
                      return <button key={b} className="chip" style={{padding:'2px 7px', cursor:'pointer'}} onClick={()=>setOpen(b)}>← {dep.label}</button>;
                    })}
                  </div>
                )}
                {ARTIFACTS.filter(a=>a.blocks.includes(cur.id)).length>0 && (
                  <div style={{display:'flex', alignItems:'center', gap:6, fontSize:11.5}}>
                    <span style={{color:'var(--ink-3)'}}>unlocks</span>
                    {ARTIFACTS.filter(a=>a.blocks.includes(cur.id)).map(a=>(
                      <button key={a.id} className="chip" style={{padding:'2px 7px', cursor:'pointer'}} onClick={()=>setOpen(a.id)}>{a.label} →</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label, outline }){
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:5}}>
      <span style={{width:8, height:8, borderRadius:4, background: outline?'transparent':color, border: outline?`1.5px solid ${color}`:'none'}}/>
      <span>{label}</span>
    </span>
  );
}

function DependencyMap({ focusId, onPick, edgesOn }){
  // SVG sized to the bounding box of all nodes + padding.
  const cols = Math.max(...Object.values(NODE_POS).map(p=>p.col)) + 1;
  const rows = Math.max(...Object.values(NODE_POS).map(p=>p.row)) + 1;
  const W = PAD_X*2 + (cols-1)*COL_W + 220;  // + node width approx
  const H = PAD_Y*2 + (rows-1)*ROW_H + 80;

  const NODE_W = 200;
  const NODE_H = 76;

  return (
    <div style={{position:'absolute', inset:0, padding:'56px 0 70px', overflow:'auto'}}>
      <div style={{position:'relative', width:W, height:H, margin:'0 auto'}}>
        {/* SVG edge layer */}
        {edgesOn && (
          <svg width={W} height={H} style={{position:'absolute', inset:0, pointerEvents:'none'}}>
            <defs>
              <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--ink-4)"/>
              </marker>
              <marker id="arr-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--accent)"/>
              </marker>
            </defs>
            {ARTIFACTS.flatMap(a => a.blocks.map(bId=>{
              const dep = ARTIFACTS.find(x=>x.id===bId);
              if (!dep) return null;
              const from = nodeXY(bId);
              const to   = nodeXY(a.id);
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H/2;
              const x2 = to.x;
              const y2 = to.y + NODE_H/2;
              const mx = (x1+x2)/2;
              const isActiveEdge = (a.id===focusId) || (bId===focusId);
              const stroke = isActiveEdge ? 'var(--accent)' : 'var(--line)';
              const sw = isActiveEdge ? 1.6 : 1;
              return <path key={`${a.id}-${bId}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2-6} ${y2}`}
                stroke={stroke} strokeWidth={sw} fill="none"
                markerEnd={`url(#${isActiveEdge?'arr-active':'arr'})`}/>;
            }))}
          </svg>
        )}

        {/* column headers */}
        {[0,1,2].map(c=>{
          const labels = ['ROOTS · STAND ALONE', 'DEPENDS ON ROOTS', 'OPERATIONAL · NEEDS ALL'];
          return (
            <div key={c} className="eyebrow" style={{
              position:'absolute', top: PAD_Y - 26, left: PAD_X + c*COL_W,
              width: NODE_W, fontSize:9.5, color:'var(--ink-4)'
            }}>{labels[c]}</div>
          );
        })}

        {/* nodes */}
        {ARTIFACTS.map(a=>{
          const {x,y} = nodeXY(a.id);
          const tone = STATE_TONE[a.state];
          const sel = a.id===focusId;
          const blocked = a.state==='blocked';
          return (
            <button key={a.id} onClick={()=>onPick(a.id)} disabled={blocked}
              style={{
                position:'absolute', left:x, top:y, width:NODE_W, height:NODE_H,
                background: a.state==='done'?'var(--paper-2)':'var(--paper)',
                border: sel?'1.5px solid var(--ink)':`1px solid ${a.state==='active'?'var(--accent)':'var(--line)'}`,
                borderRadius:'var(--r)',
                padding:'10px 12px',
                cursor: blocked?'not-allowed':'pointer',
                opacity: blocked?0.7:1,
                display:'flex', flexDirection:'column', gap:6,
                textAlign:'left',
                boxShadow: sel?'var(--shadow-2)':'var(--shadow-1)',
              }}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{
                  width:18, height:18, borderRadius:9,
                  background: a.state==='done'?'var(--good)': a.state==='active'?'var(--accent)':'var(--paper-3)',
                  color: (a.state==='done'||a.state==='active')?'var(--paper)':'var(--ink-3)',
                  border:'1px solid var(--line)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:600
                }}>
                  {a.state==='done' ? <I.check/> : ARTIFACTS.indexOf(a)+1}
                </span>
                <span style={{fontSize:12.5, fontWeight:600, color:'var(--ink)'}}>{a.label}</span>
                {blocked && <span style={{marginLeft:'auto', fontSize:10}}>🔒</span>}
              </div>
              <span style={{fontSize:10.5, color:'var(--ink-3)', lineHeight:1.4, overflow:'hidden', textOverflow:'ellipsis',
                display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>{a.summary}</span>
              <div style={{marginTop:'auto', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{fontSize:9.5, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'0.08em'}}>{a.hint}</span>
                <Dot color={tone.dot}/>
              </div>
            </button>
          );
        })}

        {/* sprint-creation hint floating off the end */}
        <div style={{
          position:'absolute',
          left: PAD_X + 2*COL_W + NODE_W + 24,
          top: PAD_Y + ROW_H/2 + 8,
          width: 180,
          padding:'10px 12px',
          background:'oklch(0.97 0.04 268)',
          border:'1px dashed oklch(0.75 0.1 268)',
          borderRadius:'var(--r)',
          fontSize:11, color:'oklch(0.35 0.15 268)',
          lineHeight:1.45,
        }}>
          <div className="eyebrow" style={{color:'oklch(0.4 0.15 268)', marginBottom:4}}>SAME MAP, NEXT TIME</div>
          Sprint creation reuses this view — each node becomes a version selector. Setup ≈ a sprint that creates the artifacts.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SetupC });
