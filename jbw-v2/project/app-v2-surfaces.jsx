// JBW v2 — entry for the new-surfaces-only canvas
const { useState: useS_v2app } = React;

function AppV2(){
  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "accent": "indigo"
  }/*EDITMODE-END*/;
  const [tw, setTw] = useTweaks ? useTweaks(tweakDefaults) : [tweakDefaults, ()=>{}];

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
        <DCSection id="review-feed" title="Review Feed — curate &amp; codify"
          subtitle="The SME/Developer surface for curating and reviewing traces. Starter feed from setup, optimizer additions (judge-uncertain, novel clusters), natural-language adds, blind/reaction passes, Discussion Pane companion, and a clear path from a single judgement to rubric criterion or judge improvement. Workshop scenario: warfarin · split safety criterion.">
          <DCArtboard id="rf-a" label="A · Reviewer cockpit"  width={1480} height={900}><ReviewFeedA/></DCArtboard>
          <DCArtboard id="rf-b" label="B · Curator's stream"   width={1480} height={900}><ReviewFeedB/></DCArtboard>
          <DCArtboard id="rf-c" label="C · Pair view (blind | reaction)"  width={1480} height={900}><ReviewFeedC/></DCArtboard>
        </DCSection>

        <DCSection id="grading" title="Grading — rubric, assessments, alignment"
          subtitle="Where SME judgement becomes rubric and AI judgement. Criteria + versions, human and AI assessments, judge-human alignment, lineage from criterion to source traces / spans / discussions, and proposed split / merge / refine / hurdle changes. Rubric is the public interface; one or many judges may exist underneath.">
          <DCArtboard id="gr-a" label="A · Criterion deep-dive" width={1480} height={900}><GradingA/></DCArtboard>
          <DCArtboard id="gr-b" label="B · Rubric matrix"       width={1480} height={900}><GradingB/></DCArtboard>
          <DCArtboard id="gr-c" label="C · Versions &amp; lineage" width={1480} height={900}><GradingC/></DCArtboard>
        </DCSection>

        <DCSection id="eval-ops" title="Evaluation Ops — production loop"
          subtitle="The production ops surface. Drift, judge confidence, construct validity. Which rubric/judge are running. Lineage from production issue back to rubric/judge/feed evidence. Recommendations across the four levers (collect SME judgement, revise rubric, improve judge, remediate model/system) and the path that drafts a new sprint when signals require intervention.">
          <DCArtboard id="eo-a" label="A · Production console"  width={1480} height={900}><EvalOpsA/></DCArtboard>
          <DCArtboard id="eo-b" label="B · Incident lineage"     width={1480} height={900}><EvalOpsB/></DCArtboard>
          <DCArtboard id="eo-c" label="C · Sprint trigger"       width={1480} height={900}><EvalOpsC/></DCArtboard>
        </DCSection>

        <DCSection id="settings" title="Settings &amp; Setup handoff"
          subtitle="Setup is a prerequisite, not a CUJ. Three takes on durable Project settings + first-run handoff that drains into a starter Workspace, Review Feed, and first sprint goals — without making setup look like the main product journey or a disconnected wizard.">
          <DCArtboard id="st-a" label="A · Project settings (durable)" width={1280} height={860}><SettingsA/></DCArtboard>
          <DCArtboard id="st-b" label="B · Setup → Workspace handoff"  width={1280} height={860}><SettingsB/></DCArtboard>
          <DCArtboard id="st-c" label="C · Living settings (sidebar)"  width={1280} height={860}><SettingsC/></DCArtboard>
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

ReactDOM.createRoot(document.getElementById('root')).render(<AppV2/>);
