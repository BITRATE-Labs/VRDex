import assert from 'node:assert/strict';
import test from 'node:test';
import { bounded, createHttpControl } from '../../workers/restream/event-worker.mjs';

const request = fetcher => createHttpControl({url:'https://example.test',token:'private-test-token',fetcher});
for (const [status,category,retryable] of [
  [400,'request-rejected',false],[401,'request-rejected',false],[403,'request-rejected',false],
  [408,'timeout',true],[429,'rate-limit',true],[500,'server-error',true],[503,'server-error',true],
]) test(`HTTP ${status} control failure has a fixed category and retry policy`,async()=>{
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  const control=request(async()=>new Response(body,{status}));
  await assert.rejects(control('observeProgram',{}),error=>{
    assert.equal(error.operation,'observeProgram');assert.equal(error.category,category);assert.equal(error.retryable,retryable);
    assert.ok(!JSON.stringify(error).includes('private-test-token'));return true;
  });
  assert.equal(cancelled,true);
});

test('network failures are retryable without retaining provider error text',async()=>{
  const control=request(async()=>{throw new TypeError('private-test-token https://private-provider.invalid');});
  await assert.rejects(control('renewSession',{}),error=>{
    assert.equal(error.category,'network');assert.equal(error.retryable,true);
    assert.ok(!String(error).includes('private'));assert.ok(!JSON.stringify(error).includes('private'));return true;
  });
});
for(const body of ['not json',JSON.stringify({status:'error',errorMessage:'private-test-token'})])
  test(`malformed or rejected successful HTTP response stays terminal: ${body.startsWith('{')?'rejected':'malformed'}`,async()=>{
    const control=request(async()=>new Response(body));
    await assert.rejects(control('refreshConfiguration',{}),error=>{
      assert.equal(error.retryable,false);assert.ok(!String(error).includes('private'));return true;
    });
  });

test('successful control response remains unchanged',async()=>{
  const value={granted:true,epoch:7};
  const control=request(async()=>new Response(JSON.stringify({status:'success',value})));
  assert.deepEqual(await control('renewSession',{}),value);
});


for(const status of [401,403]) test(`HTTP ${status} stays terminal when body cancellation never settles`,async()=>{
  const body=new ReadableStream({cancel:()=>new Promise(()=>{})});
  const control=request(async()=>new Response(body,{status}));
  await assert.rejects(bounded(()=>control('observeProgram',{}),20),error=>error.category==='request-rejected'&&error.retryable===false);
});

test('oversized control response stays terminal when cancellation never settles',async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(262145));},cancel:()=>new Promise(()=>{})});
  const control=request(async()=>new Response(body));
  await assert.rejects(bounded(()=>control('observeProgram',{}),20),error=>error.category==='invalid-response'&&error.retryable===false);
});
