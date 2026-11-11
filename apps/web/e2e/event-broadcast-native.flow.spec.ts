import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import { clerkTestAuthAvailability, createClerkTestAccount, deleteClerkTestAccountByEmail, signInClerkTestAccount } from './clerk-auth';

const run = promisify(execFile);
test.use({trace:'off',video:'off',screenshot:'off'});
test.describe.configure({retries:0});

test('candidate browser, real Convex and packaged native worker settle Stop and preserve authority fences @broadcast-native', async ({page,request,baseURL},info) => {
  test.skip(process.env.BROADCAST_NATIVE_ACCEPTANCE !== 'true', 'Explicit isolated native acceptance job only.');
  test.setTimeout(420000);
  if (process.env.PLAYWRIGHT_BASE_URL || process.env.CONVEX_URL !== 'http://127.0.0.1:3210' || !baseURL?.startsWith('http://localhost:'))
    throw Error('Fresh local browser/backend required.');
  const availability = clerkTestAuthAvailability();
  if (!availability.available) throw Error(availability.reason);
  const root = path.resolve('../..');
  const config = JSON.parse(await readFile(path.join(root,'.convex/local/default/config.json'),'utf8'));
  const applicationBuildId=(await readFile('.next/BUILD_ID','utf8')).trim();
  const image=(await run('docker',['image','inspect','vrdex-broadcast-native:ci','--format','{{.Id}}'],{timeout:10000})).stdout.trim();
  if(!applicationBuildId||!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Built candidate application and immutable worker image required.');
  const admin = new ConvexHttpClient('http://127.0.0.1:3210');
  if (!('setAdminAuth' in admin) || typeof admin.setAdminAuth !== 'function') throw Error('Local admin client unavailable.');
  admin.setAdminAuth(config.adminKey);
  const bridgeToken = randomUUID();
  const localEnv = async (name:string,value:string) => {
    // Same local admin endpoint used by Convex's CLI, without CLI startup inside the race.
    const response=await fetch('http://127.0.0.1:3210/api/update_environment_variables',{method:'POST',redirect:'error',signal:AbortSignal.timeout(2000),headers:{Authorization:`Convex ${config.adminKey}`,'Content-Type':'application/json'},body:JSON.stringify({changes:[{name,value}]})});
    if(!response.ok)throw Error('Local acceptance environment update failed.');
  };
  const id = `invite-${randomUUID()}`;
  const emails:string[] = [];
  const receipts:Record<string,unknown>[] = [];
  const helper = async (op:string,args:Record<string,unknown>={}) => {
    const response=await request.post('/api/e2e/club-staff',{headers:{'x-vrdex-e2e-token':process.env.VRDEX_E2E_BROWSER_TOKEN!},data:{op,runId:id,...args}});
    expect(response.status()).toBe(200); return response.json();
  };
  try {
    const account=await createClerkTestAccount(`${id}-owner`,{onEmailReserved:email=>emails.push(email)});
    await signInClerkTestAccount(page,account);
    const club=await helper('seed',{ownerClerkUserId:account.clerkUserId,publishForLocalBroadcast:true});
    const owner=new ConvexHttpClient('http://127.0.0.1:3210');
    const refreshAuth=async()=>{
      const jwt=await page.evaluate(async()=>{
      const sdk=window.Clerk;
      if(!sdk?.session)throw Error('Development Clerk session unavailable.');
      return sdk.session.getToken({template:'convex'});
      });
      if(typeof jwt!=='string')throw Error('Real development Clerk token required.');
      owner.setAuth(jwt);
    };
    await localEnv('VRDEX_EVENT_MEDIA_BRIDGE_TOKEN',bridgeToken);
    const registry=JSON.stringify([{key:'local-native',label:'Local native',credentialRef:'local-native/output',ownerCommunityProfileId:club.profileId,playbackLinks:[]}]);
    const workerMutation=(name:string,args:Record<string,unknown>)=>admin.mutation(makeFunctionReference<'mutation'>(`eventMediaWorker:${name}`),{bridgeToken,...args});
    for(const scenario of ['stop','cancelled','revoked']) {
      await refreshAuth();
      await localEnv('VRDEX_VRCDN_OUTPUT_ACCOUNTS_JSON',registry);
      const event=await owner.mutation(api.events.createCommunityEvent,{communitySlug:club.slug,title:`Native acceptance ${scenario}`,startAt:Date.now()+3600000,timezone:'UTC'});
      await owner.mutation(api.events.configureVrcdnOutput,{currentSlug:event.slug,key:'main',label:'Local receiver',outputAccountKey:'local-native',sourceConsentAccepted:true,destinationAuthorityAccepted:true,providerRulesAccepted:true,rightsClearedMediaAccepted:true,playbackLinks:[]});
      const status=async()=>{await refreshAuth();return owner.query(api.events.getEventMediaControlStatus,{currentSlug:event.slug});};
      await page.goto(`${baseURL}/${club.slug}/events/${event.slug}/operate`);
      await page.getByRole('button',{name:'Start',exact:true}).click();
      await expect.poll(async()=>(await status()).program?.activeSessionId).toBeTruthy();
      const sessionId=(await status()).program!.activeSessionId!;
      const dispatchId=`local-native-${scenario}`;
      expect((await workerMutation('admitDispatch',{eventId:event.eventId,sessionId,dispatchId})).granted).toBe(true);
      await workerMutation('recordDispatchedTask',{sessionId,dispatchId,taskArn:dispatchId,taskDefinitionArn:dispatchId});
      const capture=info.outputPath(`${scenario}.flv`);
      const sink=spawn('ffmpeg',['-hide_banner','-loglevel','error','-listen','1','-i','rtmp://127.0.0.1:1935/live/local-acceptance','-c','copy','-f','flv',capture],{stdio:'ignore'});
      const sinkExit=new Promise<number|null>(resolve=>sink.once('exit',resolve));
      const name=`vrdex-native-${scenario}-${randomUUID()}`;
      const child=spawn('docker',['run','--rm','-i','--name',name,'--network','host','--add-host','ingest.vrcdn.live:127.0.0.1','--cpus','4','--memory','4g','--mount',`type=bind,source=${path.join(root,'scripts/broadcast-native-acceptance-worker.mjs')},target=/acceptance.mjs,readonly`,image,'node','/acceptance.mjs'],{stdio:['pipe','pipe','pipe']});
      const closed=new Promise<number|null>(resolve=>child.once('exit',resolve));
      child.stdin.on('error',()=>{});
      const events:Record<string,unknown>[]=[];let buffer='';
      let observationPaused:()=>void=()=>{};
      const paused=new Promise<void>(resolve=>{observationPaused=resolve;});
      child.stdout.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);events.push(event);if(event.event==='observation-paused')observationPaused();}catch{}}});
      let diagnostics='';child.stderr.on('data',chunk=>{if(diagnostics.length<4096)diagnostics+=chunk.toString();});
      child.stdin.write(JSON.stringify({init:{url:'http://127.0.0.1:3210',token:bridgeToken,identity:{eventId:event.eventId,sessionId,workerId:dispatchId,epoch:0}}})+'\n');
      try {
        await expect.poll(async()=>(await status()).sessions.find(s=>s.sessionId===sessionId)?.status,{timeout:45000,message:'Native worker must publish real encoded output'}).toBe('hold');
        if(scenario==='stop') {
          await page.getByLabel('Or paste a link',{exact:true}).fill('https://media.w3.org/2010/05/sintel/trailer.mp4');
          await page.getByRole('button',{name:'Check source',exact:true}).click();
          await page.getByRole('button',{name:'Put trailer.mp4 on air',exact:true}).click();
          await page.getByRole('dialog').getByRole('button',{name:'Put trailer.mp4 on air',exact:true}).click();
          await expect.poll(async()=>(await status()).sessions.find(s=>s.sessionId===sessionId)?.status,{timeout:30000}).toBe('live');
          await page.screenshot({path:info.outputPath('candidate-native-live.png')});
        }
        await refreshAuth();
        await page.getByRole('button',{name:'Stop',exact:true}).click();
        child.stdin.write('{"arm":true}\n');
        await Promise.race([paused,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Native observation did not pause.')),5000))]);
        await page.getByRole('dialog').getByRole('button',{name:'Stop broadcast',exact:true}).click();
        await expect.poll(async()=>(await owner.query(api.events.getEventMediaControlStatus,{currentSlug:event.slug})).sessions.find(s=>s.sessionId===sessionId)?.status,{timeout:1500,intervals:[20,40,80]}).toBe('stopping');
        if(scenario==='cancelled')await owner.mutation(api.events.setCommunityEventCancelled,{currentSlug:event.slug,cancelled:true,reason:'Isolated native acceptance'});
        if(scenario==='revoked')await localEnv('VRDEX_VRCDN_OUTPUT_ACCOUNTS_JSON','[]');
        child.stdin.write('{"release":true}\n');
        await expect.poll(()=>events.some(e=>e.event==='native-worker-closed'),{timeout:20000}).toBe(true);
        await expect.poll(()=>child.exitCode,{timeout:10000}).toBe(0);
        await expect.poll(()=>sink.exitCode,{timeout:10000}).toBe(0);
        expect((await workerMutation('recordProcessStatus',{sessionId,taskArn:dispatchId,stopped:true})).accepted).toBe(true);
        expect((await workerMutation('completeTaskCleanup',{sessionId,taskArn:dispatchId})).accepted).toBe(true);
        const terminal=await status();
        const session=terminal.sessions.find(s=>s.sessionId===sessionId)!;
        expect(session.status).toBe(scenario==='stop'?'ended':'error');
        if(scenario==='stop')expect(terminal.commands.find(c=>c.sessionId===sessionId&&c.commandType==='stop_program')?.status).toBe('succeeded');
        const pausedResult=events.find(e=>e.event==='observation-result'&&typeof e.pausedMs==='number');
        expect(pausedResult?.kind).toBe(scenario==='stop'?'superseded':'fenced');
        expect(pausedResult?.pausedMs).toBeLessThan(3000);
        expect(events.some(e=>e.event==='event_worker_control_failure'&&e.category!=='authority-denied')).toBe(false);
        const {stdout}=await run('ffprobe',['-v','error','-show_streams','-of','json',capture],{timeout:10000});
        const streams=JSON.parse(stdout).streams;
        expect(streams.some((s:{codec_type:string})=>s.codec_type==='video')).toBe(true);
        expect(streams.some((s:{codec_type:string})=>s.codec_type==='audio')).toBe(true);
        await run('ffmpeg',['-v','error','-xerror','-i',capture,'-map','0:v:0','-frames:v','3','-f','null','-'],{timeout:10000});
        const audio=await run('ffmpeg',['-v','error','-xerror','-i',capture,'-map','0:a:0','-t','0.1','-f','s16le','pipe:1'],{timeout:10000,encoding:'buffer'});
        expect(audio.stdout.length).toBeGreaterThan(0);
        receipts.push({scenario,sessionStatus:session.status,workerExit:0,receiverExit:0,decodedVideoFrames:3,decodedPcmBytes:audio.stdout.length,streams:streams.map((s:{codec_type:string,codec_name:string})=>({type:s.codec_type,codec:s.codec_name})),events});
        await page.screenshot({path:info.outputPath(`candidate-${scenario}-terminal.png`)});
      } finally {
        if(!child.stdin.destroyed)child.stdin.write('{"release":true}\n');
        await run('docker',['stop','--time','5',name],{timeout:10000}).catch(()=>{});
        sink.kill('SIGTERM');
        await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,10000))]);
        await Promise.race([sinkExit,new Promise(resolve=>setTimeout(resolve,5000))]);
        if(diagnostics)await info.attach(`${scenario}-native-diagnostics`,{body:diagnostics,contentType:'text/plain'});
      }
    }
  } finally {
    await writeFile(info.outputPath('native-acceptance.json'),JSON.stringify({candidate:process.env.BROADCAST_CANDIDATE_HEAD,checkedOut:process.env.GITHUB_SHA,applicationBuildId,workerImage:image,nextMode:'production-build',environment:'isolated-local',differences:['development Clerk','local native RTMP receiver instead of VRCDN','Docker 4 CPU/4 GiB instead of qualified ECS 8 CPU/16 GiB','local enabled gate, no SSM/ECS admission APIs'],receipts},null,2));
    for(const email of emails){const cleanup=await deleteClerkTestAccountByEmail(email);expect(cleanup.checked&&cleanup.failed===0).toBe(true);}
  }
});
