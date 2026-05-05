// JBW v2 — backend architecture diagrams.
// Two variants:
//   A · Layered composition  (services + datastores + protocols)
//   B · Runtime trace loop   (trace → judge → rater → rubric update)

const { useMemo: useM_arch, useState: useS_arch } = React;

// ---------- shared atoms -----------------------------------------------------

function ArchFrame({ title, eyebrow, legend, children }){
  return (
    <div style={{
      width:'100%', height:'100%',
      background:'var(--paper)',
      display:'flex', flexDirection:'column',
      fontFamily:'var(--sans)', color:'var(--ink)',
    }}>
      <div style={{
        padding:'18px 24px 14px',
        display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        gap:24,
        borderBottom:'1px solid var(--line-2)',
        background:'linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)',
      }}>
        <div>
          <div className="eyebrow" style={{marginBottom:6}}>{eyebrow}</div>
          <div style={{fontFamily:'var(--serif)', fontSize:24, fontWeight:600, letterSpacing:'-0.01em'}}>{title}</div>
        </div>
        {legend ? (
          <div style={{display:'flex', gap:14, flexWrap:'wrap'}}>
            {legend.map((l,i)=>(
              <div key={i} style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--ink-3)'}}>
                <span style={{
                  width:18, height:0,
                  borderTop: l.dashed ? `2px dashed ${l.color}` : `2px solid ${l.color}`,
                }}/>
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{flex:1, position:'relative', overflow:'hidden'}}>
        {children}
      </div>
    </div>
  );
}

// A small svg layer, sized to its parent, used for connectors
function ConnectorLayer({ children }){
  return (
    <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none'}} aria-hidden="true">
      <defs>
        <marker id="arrowInk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)"/>
        </marker>
        <marker id="arrowAcc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/>
        </marker>
        <marker id="arrowEm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--emerald)"/>
        </marker>
        <marker id="arrowRo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--rose)"/>
        </marker>
      </defs>
      {children}
    </svg>
  );
}

// Service node — used in variant A
function Node({ x, y, w=180, h=66, title, sub, kind='svc', accent }){
  const palette = {
    svc:    { bg:'var(--paper)',     bd:'var(--line)',   ic:'var(--ink-3)' },
    edge:   { bg:'var(--paper-2)',   bd:'var(--line)',   ic:'var(--ink-3)' },
    store:  { bg:'oklch(0.97 0.01 80)',    bd:'var(--line)',   ic:'var(--amber)' },
    ext:    { bg:'oklch(0.96 0.012 268)',  bd:'oklch(0.86 0.04 268)', ic:'var(--accent)' },
    queue:  { bg:'oklch(0.97 0.01 165)', bd:'oklch(0.88 0.04 165)', ic:'var(--emerald)' },
  }[kind] || {};
  return (
    <div style={{
      position:'absolute', left:x, top:y, width:w, height:h,
      background: palette.bg,
      border:`1px solid ${accent || palette.bd}`,
      borderRadius:'var(--r)',
      boxShadow:'var(--shadow-1)',
      padding:'8px 12px',
      display:'flex', flexDirection:'column', justifyContent:'center',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
        <NodeIcon kind={kind} color={accent || palette.ic}/>
        <div style={{fontSize:12.5, fontWeight:600, color:'var(--ink)'}}>{title}</div>
      </div>
      <div className="mono" style={{fontSize:10, color:'var(--ink-3)', marginLeft:18}}>{sub}</div>
    </div>
  );
}

function NodeIcon({ kind, color }){
  const sw = 1.6;
  const common = { width:11, height:11, fill:'none', stroke:color, strokeWidth:sw, strokeLinecap:'round', strokeLinejoin:'round' };
  switch(kind){
    case 'store':
      return <svg {...common} viewBox="0 0 24 24"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>;
    case 'queue':
      return <svg {...common} viewBox="0 0 24 24"><path d="M3 12h4M9 12h4M15 12h6"/><path d="m18 9 3 3-3 3"/></svg>;
    case 'edge':
      return <svg {...common} viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>;
    case 'ext':
      return <svg {...common} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    default:
      return <svg {...common} viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h6"/></svg>;
  }
}

// Lane band — pastel section background
function Lane({ x, y, w, h, label, hue }){
  return (
    <div style={{
      position:'absolute', left:x, top:y, width:w, height:h,
      background:`oklch(0.985 0.012 ${hue})`,
      border:`1px dashed oklch(0.88 0.02 ${hue})`,
      borderRadius:'var(--r-lg)',
    }}>
      <div className="eyebrow" style={{position:'absolute', top:8, left:12, color:`oklch(0.45 0.06 ${hue})`}}>{label}</div>
    </div>
  );
}

// ============================================================================
// VARIANT A — Layered composition
// ============================================================================

function ArchitectureA(){
  // Coordinates picked to fit a 1280x820 artboard (header eats ~70px → ~750 usable)

  // Lanes (left x=24, right x=1232)
  const lanes = [
    { y: 24,  h: 110, label:'CLIENTS',                    hue: 270 },
    { y: 144, h: 90,  label:'EDGE · API · AUTH',          hue: 268 },
    { y: 244, h: 200, label:'CORE SERVICES',              hue: 220 },
    { y: 454, h: 110, label:'ASYNC · INFERENCE',          hue: 165 },
    { y: 574, h: 150, label:'DATA · STORAGE',             hue: 75  },
  ];

  // Nodes
  const nodes = [
    // clients
    { id:'web',   x: 80,  y: 50,  w: 220, title:'Web app',           sub:'React · this canvas',         kind:'edge' },
    { id:'rate',  x: 320, y: 50,  w: 220, title:'Reviewer client',   sub:'feed · margin notes',         kind:'edge' },
    { id:'sme',   x: 560, y: 50,  w: 220, title:'SME inbox',         sub:'email · webhook',             kind:'edge' },
    { id:'cli',   x: 800, y: 50,  w: 220, title:'CLI / SDK',          sub:'trace ingest',                kind:'edge' },
    { id:'sso',   x: 1040,y: 50,  w: 168, title:'SSO / IdP',          sub:'OIDC',                        kind:'ext' },

    // edge layer
    { id:'gw',    x: 80,  y: 165, w: 280, title:'API gateway',       sub:'REST + websocket',            kind:'svc' },
    { id:'auth',  x: 380, y: 165, w: 220, title:'Auth · sessions',   sub:'workspaces · roles',          kind:'svc' },
    { id:'rl',    x: 620, y: 165, w: 200, title:'Rate-limit · audit',sub:'per-workspace',               kind:'svc' },
    { id:'wsg',   x: 840, y: 165, w: 220, title:'Realtime gateway',  sub:'rater presence · live diff',  kind:'svc' },

    // core services
    { id:'work',  x: 80,  y: 270, w: 200, title:'Workshop service',  sub:'rubric + judge + traces',     kind:'svc', accent:'var(--accent)' },
    { id:'sprint',x: 300, y: 270, w: 200, title:'Sprint orchestrator',sub:'convergence loop',           kind:'svc', accent:'var(--accent)' },
    { id:'rub',   x: 520, y: 270, w: 200, title:'Rubric service',    sub:'versioned criteria',          kind:'svc', accent:'var(--accent)' },
    { id:'judge', x: 740, y: 270, w: 200, title:'Judge service',     sub:'prompt + scoring fn',         kind:'svc', accent:'var(--accent)' },
    { id:'queue', x: 960, y: 270, w: 200, title:'Rater queue',       sub:'assign · SLA · dedup',        kind:'svc', accent:'var(--accent)' },

    { id:'cal',   x: 80,  y: 360, w: 220, title:'Calibration metrics',sub:'IRR · judge acc · drift',    kind:'svc' },
    { id:'snap',  x: 320, y: 360, w: 200, title:'Snapshot service',  sub:'rubric+judge versions',       kind:'svc' },
    { id:'noti',  x: 540, y: 360, w: 200, title:'Notify · webhook',  sub:'SMEs · digests',              kind:'svc' },
    { id:'feed',  x: 760, y: 360, w: 200, title:'Feed assembly',     sub:'doc + margins · cards',       kind:'svc' },
    { id:'sme_s', x: 980, y: 360, w: 180, title:'SME directory',     sub:'people · tags',               kind:'svc' },

    // async / inference
    { id:'bus',   x: 80,  y: 480, w: 260, title:'Event bus',         sub:'workshop.* · sprint.* · trace.*', kind:'queue' },
    { id:'work_q',x: 360, y: 480, w: 220, title:'Job runner',         sub:'sprint runs · backfill',     kind:'queue' },
    { id:'judge_r',x:600, y: 480, w: 240, title:'Judge runtime',     sub:'LLM pool · batch + stream',   kind:'queue' },
    { id:'embed', x: 860, y: 480, w: 220, title:'Embedding worker',  sub:'trace vectors',               kind:'queue' },
    { id:'llm',   x: 1100,y: 480, w: 110, title:'LLM provider',      sub:'external',                    kind:'ext' },

    // data
    { id:'pg',    x: 80,  y: 600, w: 200, title:'Postgres',          sub:'workshops · sprints · runs',  kind:'store' },
    { id:'tp',    x: 300, y: 600, w: 200, title:'Trace pool',        sub:'columnar · object-backed',    kind:'store' },
    { id:'vec',   x: 520, y: 600, w: 200, title:'Vector store',      sub:'trace + criterion',           kind:'store' },
    { id:'obj',   x: 740, y: 600, w: 200, title:'Object store',      sub:'snapshots · attachments',     kind:'store' },
    { id:'oltp',  x: 960, y: 600, w: 200, title:'Metrics warehouse', sub:'IRR · acc · timeseries',      kind:'store' },
  ];

  const nodeMap = useM_arch(()=> Object.fromEntries(nodes.map(n=>[n.id,n])), []);

  // Edges: { from, to, kind, dashed, fromSide, toSide, bend }
  const edges = [
    // clients → edge
    { from:'web',  to:'gw',  kind:'sync' },
    { from:'rate', to:'gw',  kind:'sync' },
    { from:'sme',  to:'noti',kind:'sync', dashed:true },
    { from:'cli',  to:'gw',  kind:'sync' },
    { from:'gw',   to:'auth',kind:'sync' },
    { from:'auth', to:'sso', kind:'sync', dashed:true },
    { from:'rate', to:'wsg', kind:'realtime' },

    // edge → core
    { from:'gw',   to:'work',  kind:'sync' },
    { from:'gw',   to:'sprint',kind:'sync' },
    { from:'gw',   to:'rub',   kind:'sync' },
    { from:'gw',   to:'judge', kind:'sync' },
    { from:'gw',   to:'queue', kind:'sync' },
    { from:'wsg',  to:'queue', kind:'realtime' },
    { from:'wsg',  to:'feed',  kind:'realtime' },

    // core lateral
    { from:'sprint',to:'rub',   kind:'sync' },
    { from:'sprint',to:'judge', kind:'sync' },
    { from:'sprint',to:'snap',  kind:'sync' },
    { from:'judge', to:'cal',   kind:'sync' },
    { from:'queue', to:'feed',  kind:'sync' },
    { from:'queue', to:'sme_s', kind:'sync' },
    { from:'noti',  to:'sme_s', kind:'sync' },

    // core → async
    { from:'sprint', to:'bus',     kind:'event' },
    { from:'work',   to:'bus',     kind:'event' },
    { from:'rub',    to:'bus',     kind:'event' },
    { from:'bus',    to:'work_q',  kind:'event' },
    { from:'work_q', to:'judge_r', kind:'event' },
    { from:'judge_r',to:'llm',     kind:'sync', dashed:true },
    { from:'bus',    to:'embed',   kind:'event' },

    // async → data
    { from:'work_q', to:'pg',   kind:'sync' },
    { from:'judge_r',to:'tp',   kind:'sync' },
    { from:'embed',  to:'vec',  kind:'sync' },
    { from:'judge_r',to:'oltp', kind:'sync' },
    { from:'snap',   to:'obj',  kind:'sync' },
    { from:'cal',    to:'oltp', kind:'sync' },

    // core → data direct
    { from:'work',   to:'pg',  kind:'sync' },
    { from:'rub',    to:'pg',  kind:'sync' },
    { from:'queue',  to:'pg',  kind:'sync' },
    { from:'feed',   to:'tp',  kind:'sync' },
  ];

  // edge color/style
  const styleFor = (k)=>{
    if (k==='event')    return { color:'var(--emerald)', dash:'4 4', marker:'arrowEm' };
    if (k==='realtime') return { color:'var(--rose)',    dash:'2 3', marker:'arrowRo' };
    return { color:'var(--ink-3)', dash:null, marker:'arrowInk' };
  };

  // Compute orthogonal-ish edge between two rectangles
  function path(a, b){
    const ax = a.x + (a.w||180)/2, ay = a.y + 33;
    const bx = b.x + (b.w||180)/2, by = b.y + 33;
    // route via mid-y if rows differ, else direct
    if (Math.abs(ay - by) < 20){
      // same row
      return `M${ax},${ay} L${bx},${by}`;
    }
    const my = (ay + by) / 2;
    return `M${ax},${ay} C${ax},${my} ${bx},${my} ${bx},${by}`;
  }

  return (
    <ArchFrame
      eyebrow="A · Layered composition"
      title="JBW v2 · backend architecture"
      legend={[
        { color:'var(--ink-3)',   label:'sync (HTTP / RPC)' },
        { color:'var(--emerald)', label:'event (bus)',        dashed:true },
        { color:'var(--rose)',    label:'realtime (ws)',      dashed:true },
      ]}
    >
      {/* Lanes */}
      {lanes.map((l,i)=>(
        <Lane key={i} x={24} y={l.y} w={1208} h={l.h} label={l.label} hue={l.hue}/>
      ))}

      {/* Connectors */}
      <ConnectorLayer>
        {edges.map((e,i)=>{
          const a = nodeMap[e.from], b = nodeMap[e.to];
          if (!a || !b) return null;
          const s = styleFor(e.kind);
          return (
            <path key={i}
              d={path(a,b)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.4}
              strokeDasharray={s.dash || (e.dashed ? '3 3' : null)}
              markerEnd={`url(#${s.marker})`}
              opacity={0.85}
            />
          );
        })}
      </ConnectorLayer>

      {/* Nodes */}
      {nodes.map(n => <Node key={n.id} {...n}/>)}
    </ArchFrame>
  );
}

// ============================================================================
// VARIANT B — Runtime: trace → judge → rater → rubric loop
// ============================================================================

function StepCard({ x, y, w=200, h=130, n, title, sub, bullets, accent='var(--accent)' }){
  return (
    <div style={{
      position:'absolute', left:x, top:y, width:w, height:h,
      background:'var(--paper)',
      border:'1px solid var(--line)',
      borderRadius:'var(--r-lg)',
      boxShadow:'var(--shadow-2)',
      padding:'12px 14px',
      display:'flex', flexDirection:'column',
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
        <span style={{
          width:20, height:20, borderRadius:999,
          background:accent, color:'var(--paper)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:11, fontWeight:600,
        }}>{n}</span>
        <div style={{fontSize:13, fontWeight:600}}>{title}</div>
      </div>
      <div className="mono" style={{fontSize:10, color:'var(--ink-3)', marginBottom:6}}>{sub}</div>
      <ul style={{margin:0, padding:0, listStyle:'none', fontSize:11, color:'var(--ink-2)', lineHeight:1.5}}>
        {bullets.map((b,i)=>(
          <li key={i} style={{display:'flex', gap:6, alignItems:'flex-start'}}>
            <span style={{color:'var(--ink-4)', flex:'none'}}>·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceTag({ x, y, w=160, label, sub, hue=220 }){
  return (
    <div style={{
      position:'absolute', left:x, top:y, width:w, height:42,
      background:`oklch(0.985 0.012 ${hue})`,
      border:`1px solid oklch(0.9 0.02 ${hue})`,
      borderRadius:'var(--r)',
      padding:'5px 10px',
      display:'flex', flexDirection:'column', justifyContent:'center',
    }}>
      <div style={{fontSize:11.5, fontWeight:600, color:'var(--ink)'}}>{label}</div>
      <div className="mono" style={{fontSize:9.5, color:'var(--ink-3)'}}>{sub}</div>
    </div>
  );
}

function ArchitectureB(){
  // Six steps along a curved spine
  const steps = [
    { n:1, x: 50,  y: 100, title:'Ingest',
      sub:'POST /traces · CLI · webhook',
      bullets:[
        'CLI / SDK pushes prompt+response',
        'PII redaction on the edge',
        'fanned to bus as trace.created',
      ] },
    { n:2, x: 300, y: 100, title:'Pool',
      sub:'workshop trace pool',
      bullets:[
        'append-only, columnar',
        'tags · filters · saved views',
        'embedding worker fills vector index',
      ] },
    { n:3, x: 550, y: 100, title:'Judge',
      sub:'LLM-as-judge runtime',
      bullets:[
        'pulls active rubric snapshot',
        'batch + streaming inference',
        'writes per-criterion score + rationale',
      ] },
    { n:4, x: 800, y: 100, title:'Assign',
      sub:'rater queue',
      bullets:[
        'samples disagreement + uncertainty',
        'enforces overlap (3 raters / trace)',
        'pushes presence over websocket',
      ] },
    { n:5, x: 800, y: 320, title:'Rate',
      sub:'reviewer feed',
      bullets:[
        'doc + margin notes · card-stack',
        'criteria-bound highlights',
        'rater.judged event per criterion',
      ] },
    { n:6, x: 550, y: 320, title:'Calibrate',
      sub:'metrics service',
      bullets:[
        'IRR per criterion · judge accuracy',
        'flags drift / rubric ambiguity',
        'feeds the convergence dashboard',
      ] },
    { n:7, x: 300, y: 320, title:'Edit rubric',
      sub:'rubric service',
      bullets:[
        'criterion add / split / sharpen',
        'judge prompt re-tune',
        'preview vs golden traces',
      ] },
    { n:8, x: 50,  y: 320, title:'Promote',
      sub:'sprint orchestrator',
      bullets:[
        'snapshot rubric+judge versions',
        'sprint.completed → next sprint baseline',
        'rolls forward to workshop',
      ] },
  ];

  // Service tags floating between
  const tags = [
    { x: 30,  y: 250, label:'Ingest API',          sub:'edge · auth',         hue:268 },
    { x: 305, y: 250, label:'Trace pool · Vector', sub:'object · pgvector',   hue:75  },
    { x: 555, y: 250, label:'Judge runtime',       sub:'LLM pool',            hue:220 },
    { x: 805, y: 250, label:'Queue · Realtime',    sub:'ws · presence',       hue:165 },

    { x: 30,  y: 470, label:'Snapshot · Postgres', sub:'versions · audit',    hue:75  },
    { x: 305, y: 470, label:'Rubric service',      sub:'criteria graph',      hue:268 },
    { x: 555, y: 470, label:'Calibration metrics', sub:'IRR · accuracy',      hue:330 },
    { x: 805, y: 470, label:'Feed assembly',       sub:'doc · cards',         hue:165 },
  ];

  // Path between centers of step boxes
  const order = [0,1,2,3,4,5,6,7];
  // step bounding info
  const stepRect = (s)=>({ cx: s.x+100, cy: s.y+65, l:s.x, r:s.x+200, t:s.y, b:s.y+130 });

  return (
    <ArchFrame
      eyebrow="B · Runtime trace loop"
      title="JBW v2 · trace → judge → rater → rubric"
      legend={[
        { color:'var(--accent)',  label:'control flow' },
        { color:'var(--emerald)', label:'event',           dashed:true },
        { color:'var(--rose)',    label:'realtime',        dashed:true },
      ]}
    >
      {/* big background loop hint */}
      <svg style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none'}}>
        <defs>
          <linearGradient id="loopGrad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--indigo)" stopOpacity="0.10"/>
            <stop offset="1" stopColor="var(--fuchsia)" stopOpacity="0.10"/>
          </linearGradient>
        </defs>
        <rect x="40" y="90" width="980" height="380" rx="120" ry="120" fill="url(#loopGrad)"/>
      </svg>

      {/* connectors between steps along the loop */}
      <ConnectorLayer>
        {order.slice(0,-1).map((i)=>{
          const a = stepRect(steps[i]);
          const b = stepRect(steps[i+1]);
          // top row: 1→2→3→4 horizontal
          // 4→5 vertical
          // 5→6→7→8 horizontal back
          let d;
          if (a.cy === b.cy && a.cx < b.cx){
            d = `M${a.r},${a.cy} L${b.l},${b.cy}`;
          } else if (a.cy === b.cy && a.cx > b.cx){
            d = `M${a.l},${a.cy} L${b.r},${b.cy}`;
          } else if (a.cx === b.cx){
            d = `M${a.cx},${a.b} L${b.cx},${b.t}`;
          } else {
            d = `M${a.cx},${a.cy} L${b.cx},${b.cy}`;
          }
          // mark some segments as event/realtime
          const eventSteps = new Set(['1-2','2-3','5-6']); // emerald
          const rtSteps    = new Set(['4-5']);              // rose
          const key = `${i+1}-${i+2}`;
          const color = rtSteps.has(key) ? 'var(--rose)'
                      : eventSteps.has(key) ? 'var(--emerald)'
                      : 'var(--accent)';
          const dash  = rtSteps.has(key) ? '2 3'
                      : eventSteps.has(key) ? '4 4'
                      : null;
          const marker= rtSteps.has(key) ? 'arrowRo'
                      : eventSteps.has(key) ? 'arrowEm'
                      : 'arrowAcc';
          return (
            <path key={i} d={d} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray={dash} markerEnd={`url(#${marker})`}/>
          );
        })}
        {/* loop-close: step 8 back to step 1 */}
        {(()=>{
          const a = stepRect(steps[7]);
          const b = stepRect(steps[0]);
          const d = `M${a.l},${a.cy} C${a.l-30},${a.cy} ${b.l-30},${b.cy} ${b.l},${b.cy}`;
          return <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeDasharray="6 4" markerEnd="url(#arrowAcc)"/>;
        })()}
      </ConnectorLayer>

      {/* Step cards */}
      {steps.map(s => <StepCard key={s.n} {...s}/>)}

      {/* Service tags rail */}
      {tags.map((t,i) => <ServiceTag key={i} {...t}/>)}

      {/* External LLM and clients column on the right */}
      <div style={{position:'absolute', left:1060, top:90, bottom:30, width:180,
        display:'flex', flexDirection:'column', gap:10}}>
        <div className="eyebrow" style={{marginBottom:4}}>EXTERNAL</div>
        {[
          { t:'LLM provider', s:'judge inference',     hue:268 },
          { t:'SSO / IdP',    s:'OIDC',                hue:220 },
          { t:'Email · Webhook',s:'SME notifications', hue:165 },
        ].map((e,i)=>(
          <div key={i} style={{
            border:`1px solid oklch(0.88 0.03 ${e.hue})`,
            background:`oklch(0.98 0.014 ${e.hue})`,
            borderRadius:'var(--r)',
            padding:'10px 12px',
          }}>
            <div style={{fontSize:12, fontWeight:600}}>{e.t}</div>
            <div className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{e.s}</div>
          </div>
        ))}

        <div className="eyebrow" style={{marginTop:14, marginBottom:4}}>DATA</div>
        {[
          { t:'Postgres',         s:'workshops · runs',  hue:75  },
          { t:'Object store',     s:'snapshots',         hue:75  },
          { t:'Metrics warehouse',s:'IRR timeseries',    hue:75  },
        ].map((e,i)=>(
          <div key={i} style={{
            border:`1px solid oklch(0.88 0.03 ${e.hue})`,
            background:`oklch(0.98 0.014 ${e.hue})`,
            borderRadius:'var(--r)',
            padding:'10px 12px',
          }}>
            <div style={{fontSize:12, fontWeight:600}}>{e.t}</div>
            <div className="mono" style={{fontSize:10, color:'var(--ink-3)'}}>{e.s}</div>
          </div>
        ))}
      </div>

      {/* footer caption */}
      <div style={{position:'absolute', left:50, bottom:14, fontSize:11, color:'var(--ink-3)', maxWidth:980}}>
        One sprint = one full lap. The convergence loop is what tightens IRR and judge accuracy across versions; each promotion raises the floor for the next sprint.
      </div>
    </ArchFrame>
  );
}

Object.assign(window, { ArchitectureA, ArchitectureB });
