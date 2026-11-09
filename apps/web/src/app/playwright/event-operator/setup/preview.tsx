"use client";
import { useState } from "react";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { EventBroadcastSetupForm, type BroadcastSetupState } from "../../../_components/event-broadcast-setup";
export function SetupFixture(){
  const [state,setState]=useState<BroadcastSetupState>({connection:null,activeTest:null,canConfigure:true});
  return <><div aria-label="Fixture controls" className="flex gap-4 p-3"><button onClick={()=>setState(value=>({...value,activeTest:value.activeTest ? {...value.activeTest,state:"passed"} : null}))}>Complete worker proof</button><button onClick={()=>setState(value=>({...value,activeTest:value.activeTest ? {...value.activeTest,state:"failed"} : null}))}>Fail test</button></div><EventBroadcastSetupForm currentSlug="fixture" eventPath="/playwright/event-operator" eventTitle="Afterglow Harbor Sessions" state={state} onStart={async revision=>{setState(value=>({...value,activeTest:{jobId:"fixture-job" as Id<"eventBroadcastConnectionTests">,revision,state:"running",deadlineAt:Date.now()+60000}}));}} onCancel={async()=>setState(value=>({...value,activeTest:value.activeTest ? {...value.activeTest,state:"cancelled"} : null}))}/></>;
}
