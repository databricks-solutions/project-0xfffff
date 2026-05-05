// JBW v2 — entry: assembles the design canvas with all variations.

const { useState: useS_app } = React;

function App(){
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "showLabels": true,
    "accent": "indigo",
    "density": "comfortable"
  }/*EDITMODE-END*/;
  const [tw, setTw] = useTweaks ? useTweaks(tweakDefaults) : [tweakDefaults, ()=>{}];

  // accent recolor
  React.useEffect(()=>{
    const map = {
      indigo:  'oklch(0.62 0.18 268)',
      fuchsia: 'oklch(0.66 0.24 330)',
      emerald: 'oklch(0.55 0.13 165)',
      rose:    'oklch(0.65 0.21 18)',
    };
    document.documentElement.style.setProperty('--accent', map[tw.accent] || map.indigo);
  }, [tw.accent]);

  return (
    <>
      <DesignCanvas>
        <DCSection id="workshop-create" title="Workshop — day-one bootstrap"
          subtitle="Where a developer founds a long-lived workshop: rubric, judge, trace pool, SMEs. Three on-ramps from generative to opinionated.">
          <DCArtboard id="wc-a" label="A · Conversational brief" width={1280} height={820}>
            <WorkshopCreateA/>
          </DCArtboard>
          <DCArtboard id="wc-b" label="B · Recipe + canvas"      width={1280} height={820}>
            <WorkshopCreateB/>
          </DCArtboard>
          <DCArtboard id="wc-c" label="C · Foundation builder"   width={1280} height={820}>
            <WorkshopCreateC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="sprint-create" title="Sprint — push the rubric &amp; judge forward"
          subtitle="Inside an existing workshop. Each sprint snapshots the current rubric+judge, runs the convergence loop, promotes new versions on completion.">
          <DCArtboard id="sc-a" label="A · Mode + preset"   width={1280} height={820}>
            <SprintCreateA/>
          </DCArtboard>
          <DCArtboard id="sc-b" label="B · Targets-first dial" width={1280} height={820}>
            <SprintCreateB/>
          </DCArtboard>
          <DCArtboard id="sc-c" label="C · Diff from last"     width={1280} height={820}>
            <SprintCreateC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="dashboard" title="Facilitator dashboard"
          subtitle="The view a session lead stares at while raters work. Two takes — a live cockpit and a phased project plan.">
          <DCArtboard id="dash-a" label="A · Session cockpit" width={1280} height={820}>
            <DashboardA/>
          </DCArtboard>
          <DCArtboard id="dash-b" label="B · Pass plan"        width={1280} height={820}>
            <DashboardB/>
          </DCArtboard>
          <DCArtboard id="dash-c" label="C · Trace funnel"      width={1280} height={820}>
            <DashboardC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="feed" title="Reviewer feed"
          subtitle="Where a rater actually does the work. A document-style canvas with margin notes, and a card-stack 'shorts' flow for fast triage.">
          <DCArtboard id="feed-a" label="A · Document + margin notes" width={1280} height={820}>
            <FeedA/>
          </DCArtboard>
          <DCArtboard id="feed-b" label="B · Card-stack triage"        width={1280} height={820}>
            <FeedB/>
          </DCArtboard>
        </DCSection>

        <DCSection id="architecture" title="Backend architecture"
          subtitle="How the services compose, and how a trace travels through the system. Two takes — a layered composition and a runtime loop.">
          <DCArtboard id="arch-a" label="A · Layered composition" width={1280} height={820}>
            <ArchitectureA/>
          </DCArtboard>
          <DCArtboard id="arch-b" label="B · Runtime trace loop"  width={1280} height={820}>
            <ArchitectureB/>
          </DCArtboard>
        </DCSection>

        <DCSection id="rubric" title="Rubric / judge edit"
          subtitle="Where rubric criteria are crafted and tuned against human raters and a judge model. Three takes: workshop with live preview, typed-block builder, and a calibration-first view.">
          <DCArtboard id="rb-a" label="A · Workshop"     width={1280} height={820}>
            <RubricA/>
          </DCArtboard>
          <DCArtboard id="rb-b" label="B · Block builder" width={1280} height={820}>
            <RubricB/>
          </DCArtboard>
          <DCArtboard id="rb-c" label="C · Calibration"   width={1280} height={820}>
            <RubricC/>
          </DCArtboard>
          <DCArtboard id="rb-d" label="D · Versions"      width={1280} height={820}>
            <RubricD/>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakRadio label="Accent" value={tw.accent} options={[
            {value:'indigo', label:'Indigo'},
            {value:'fuchsia', label:'Fuchsia'},
            {value:'emerald', label:'Emerald'},
            {value:'rose', label:'Rose'},
          ]} onChange={v=>setTw('accent', v)}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
