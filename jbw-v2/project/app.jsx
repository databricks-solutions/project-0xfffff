// JBW v2 — entry: assembles the design canvas with all variations.

const { useState: useS_app } = React;

function App(){
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "showLabels": true,
    "accent": "indigo",
    "density": "comfortable",
    "edges": true
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
        <DCSection id="workspace" title="Workspace — sprint control surface"
          subtitle="Three directions on the V2 Workspace for a workshop-as-short-sprint. Same four-column spine — Data Source → Review Feed → Grading → Confidence — rendered as a control room, an activity monitor, and a narrative.">
          <DCArtboard id="ws-a" label="A · Control room"      width={1440} height={880}>
            <WorkspaceA/>
          </DCArtboard>
          <DCArtboard id="ws-b" label="B · Activity monitor"   width={1440} height={880}>
            <WorkspaceB/>
          </DCArtboard>
          <DCArtboard id="ws-c" label="C · Narrative"          width={1440} height={880}>
            <WorkspaceC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="review-feed" title="Review Feed — curate &amp; codify"
          subtitle="The SME/Developer surface for curating and reviewing traces. Starter feed from setup, optimizer additions (judge-uncertain, novel clusters), natural-language adds, blind/reaction passes, Discussion Pane companion, and a clear path from a single judgement to rubric criterion or judge improvement. Workshop scenario: warfarin · split safety criterion.">
          <DCArtboard id="rf-a" label="A · Reviewer cockpit"  width={1480} height={900}>
            <ReviewFeedA/>
          </DCArtboard>
          <DCArtboard id="rf-b" label="B · Curator's stream"   width={1480} height={900}>
            <ReviewFeedB/>
          </DCArtboard>
          <DCArtboard id="rf-c" label="C · Pair view (blind | reaction)"  width={1480} height={900}>
            <ReviewFeedC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="grading" title="Grading — rubric, assessments, alignment"
          subtitle="Where SME judgement becomes rubric and AI judgement. Criteria + versions, human and AI assessments, judge-human alignment, lineage from criterion to source traces / spans / discussions, and proposed split / merge / refine / hurdle changes. Rubric is the public interface; one or many judges may exist underneath.">
          <DCArtboard id="gr-a" label="A · Criterion deep-dive" width={1480} height={900}>
            <GradingA/>
          </DCArtboard>
          <DCArtboard id="gr-b" label="B · Rubric matrix"       width={1480} height={900}>
            <GradingB/>
          </DCArtboard>
          <DCArtboard id="gr-c" label="C · Versions &amp; lineage" width={1480} height={900}>
            <GradingC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="eval-ops" title="Evaluation Ops — production loop"
          subtitle="The production ops surface. Drift, judge confidence, construct validity. Which rubric/judge are running. Lineage from production issue back to rubric/judge/feed evidence. Recommendations across the four levers (collect SME judgement, revise rubric, improve judge, remediate model/system) and the path that drafts a new sprint when signals require intervention.">
          <DCArtboard id="eo-a" label="A · Production console"  width={1480} height={900}>
            <EvalOpsA/>
          </DCArtboard>
          <DCArtboard id="eo-b" label="B · Incident lineage"     width={1480} height={900}>
            <EvalOpsB/>
          </DCArtboard>
          <DCArtboard id="eo-c" label="C · Sprint trigger"       width={1480} height={900}>
            <EvalOpsC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="settings" title="Settings &amp; Setup handoff"
          subtitle="Setup is a prerequisite, not a CUJ. Three takes on durable Project settings + first-run handoff that drains into a starter Workspace, Review Feed, and first sprint goals — without making setup look like the main product journey or a disconnected wizard.">
          <DCArtboard id="st-a" label="A · Project settings (durable)" width={1280} height={860}>
            <SettingsA/>
          </DCArtboard>
          <DCArtboard id="st-b" label="B · Setup → Workspace handoff"  width={1280} height={860}>
            <SettingsB/>
          </DCArtboard>
          <DCArtboard id="st-c" label="C · Living settings (sidebar)"  width={1280} height={860}>
            <SettingsC/>
          </DCArtboard>
        </DCSection>

        <DCSection id="setup-ia" title="Setup IA — workflow over durable settings"
          subtitle="How V2 represents Setup as a real workflow whose outputs are evergreen Project settings. Three IA patterns over the same seven artifacts (profile · trace source · rubric · judge · trace pool · participants · sprint defaults). Sprint creation reuses the same shell.">
          <DCArtboard id="setup-a" label="A · Guided settings rail" width={1280} height={820}>
            <SetupA/>
          </DCArtboard>
          <DCArtboard id="setup-b" label="B · Workflow shell"        width={1280} height={820}>
            <SetupB/>
          </DCArtboard>
          <DCArtboard id="setup-c" label="C · Setup command center"   width={1280} height={820}>
            <SetupC/>
          </DCArtboard>
        </DCSection>

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
        <TweakSection title="Setup · Command Center">
          <TweakToggle label="Show dependency edges" value={tw.edges!==false} onChange={v=>{
            setTw('edges', v);
            document.documentElement.dataset.edges = v ? 'on' : 'off';
          }}/>
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
