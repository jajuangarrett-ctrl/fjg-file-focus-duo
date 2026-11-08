// Synthetic transport only. No credential files, vault data, microphone or external API.
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const vm = require('node:vm');
(async () => {
  const built = (await esbuild.build({
    entryPoints: ['src/live/session.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{name: 'mock-obsidian', setup(build) {
      build.onResolve({filter: /^obsidian$/}, () => ({path: 'obsidian', namespace: 'mock'}));
      build.onLoad({filter: /.*/, namespace: 'mock'}, () => ({
        contents: 'export const Platform={isMobile:globalThis.mobile}; export const requestUrl=(...args)=>globalThis.voiceRequest(...args);', loader: 'js'
      }));
    }}]
  })).outputFiles[0].text;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  function fixture({mobile = true, denied = false, response = {status: 201, json: {transport: {sdp: 'synthetic-answer'}}}} = {}) {
    let now = 10000, peer, micCalls = 0, apiCalls = 0, timerId = 0, audioContext, requestBody;
    let stats = () => new Map([['audio', {type: 'outbound-rtp', kind: 'audio', bytesSent: now}]]);
    const timers = new Map(), states = [], inputs = [], transcripts = [], executed = [];
    const track = {enabled: true, muted: false, readyState: 'live', stop() {this.readyState = 'ended';}};
    const silentTrack = {enabled: true, muted: false, readyState: 'live', stop() {this.readyState = 'ended';}};
    const silentStream = {getTracks: () => [silentTrack], getAudioTracks: () => [silentTrack]};
    class AudioContext {
      state = 'suspended'; source = {connect() {}, start() {}, stop() {}};
      constructor() {audioContext = this;}
      createMediaStreamDestination() {return {stream: silentStream};}
      createOscillator() {return this.source;}
      createGain() {return {gain: {value: 1}, connect() {}};}
      async resume() {this.state = 'running';} async close() {this.state = 'closed';}
    }
    class Channel extends EventTarget {
      readyState = 'open'; sent = [];
      send(value) {this.sent.push(JSON.parse(value));}
      close() {this.readyState = 'closed';}
      event(value) {this.dispatchEvent(Object.assign(new Event('message'), {data: JSON.stringify(value)}));}
    }
    class Peer extends EventTarget {
      connectionState = 'connected'; iceGatheringState = 'complete'; localDescription = {sdp: 'synthetic-offer'};
      channel = new Channel(); closed = false;
      constructor() {super(); peer = this;}
      addTrack(track) {this.track=track;return {replaceTrack:async next=>{this.track=next;}};} createDataChannel() {return this.channel;} async createOffer() {return this.localDescription;}
      async setLocalDescription() {} async setRemoteDescription(value) {this.answer = value;}
      async getStats() {return stats();} close() {this.closed = true;}
    }
    const context = {module: {exports: {}}, require, Error, Event, EventTarget, AudioContext, mobile,
      setTimeout(fn) {const id = ++timerId; timers.set(id, fn); return id;}, clearTimeout(id) {timers.delete(id);},
      Date: class extends Date {static now() {return now;}}, crypto: require('node:crypto').webcrypto,
      navigator: {mediaDevices: {getUserMedia: async () => {
        micCalls++; if (denied) throw Object.assign(new Error('denied'), {name: 'NotAllowedError'});
        return {getTracks: () => [track], getAudioTracks: () => [track]};
      }}}, RTCPeerConnection: Peer, voiceRequest: async options => {apiCalls++; requestBody=JSON.parse(options.body); return response;}
    };
    vm.runInNewContext(built, context);
    const session = new context.module.exports.VaultLiveSession({pause() {}, srcObject: null}, {
      state: (state, message) => states.push({state, message}),
      inputStatus: message => inputs.push(message), transcript: (speaker, text) => transcripts.push({speaker, text}),
      execute: async (name, args, id) => {assert.equal(session.active, true, 'tools must wait for readiness'); executed.push({name, args, id}); return {fixture: true};}
    });
    return {session, track, states, inputs, transcripts, executed, timers,
      get peer() {return peer;}, get audioContext() {return audioContext;}, get requestBody() {return requestBody;}, silentTrack, get micCalls() {return micCalls;}, get apiCalls() {return apiCalls;},
      advance: ms => {now += ms;}, setStats: next => {stats = next;},
      start: (textOnly=false) => session.start('fixture-only', 'fixture-model', '{}', textOnly),
      event: event => peer.channel.event(event),
      started: async () => {peer.channel.event({type: 'session.started'}); await settle();},
      ready: async () => {now += mobile ? 4000 : 500; await session.checkAudioReady(); await settle();}
    };
  }
  const envelope = (event, delegation = 'fixture-delegation') => ({type: 'response.event', delegation_id: delegation, event});
  const created = id => envelope({type: 'response.created', response: {id}});
  const item = (id, call = 'fixture-call') => envelope({type: 'response.output_item.done', response_id: id, item: {type: 'function_call', call_id: call, name: 'search_vault', arguments: '{"query":"synthetic"}'}});
  const completed = id => envelope({type: 'response.completed', response: {id}});
  let passed = 0;
  async function check(name, run) {await run(); passed++; console.log(`PASS: ${name}`);}

  await check('missing key and denied microphone never call the API', async () => {
    const missing = fixture(); await missing.session.start('', 'fixture-model', '{}');
    assert.equal(missing.micCalls, 0); assert.equal(missing.apiCalls, 0); assert.match(missing.states.at(-1).message, /No saved voice key/);
    const denied = fixture({denied: true}); await denied.start();
    assert.equal(denied.apiCalls, 0); assert.match(denied.states.at(-1).message, /Microphone access was denied/); assert.ok(denied.peer.closed);
  });
  await check('non-JSON HTTP errors are actionable and release the microphone', async () => {
    const f = fixture({response: {status: 401, get json() {throw Error('private-provider-body');}}}); await f.start();
    assert.match(f.states.at(-1).message, /HTTP 401.*rejected the API key/); assert.equal(f.track.readyState, 'ended'); assert.ok(f.peer.closed);
    assert.ok(!f.states.at(-1).message.includes('private-provider-body')); assert.equal(f.timers.size, 0);
  });
  await check('complete mobile warm-up response waits, then executes once in order', async () => {
    const f = fixture(); await f.start(); await f.started();
    f.event(created('early')); f.event(item('early')); f.event(completed('early')); await settle();
    assert.equal(f.executed.length, 0); assert.equal(f.session.active, false);
    await f.ready(); assert.equal(f.session.active, true); assert.equal(f.executed.length, 1);
    assert.deepEqual(f.peer.channel.sent.map(e => e.type), ['response.item.create', 'response.create']);
    f.event(completed('early')); await settle(); assert.equal(f.executed.length, 1);
    f.session.dispose(); assert.equal(f.timers.size, 0);
  });
  await check('response begun during warm-up can complete after readiness', async () => {
    const f = fixture(); await f.start(); await f.started(); f.event(created('crossing')); f.event(item('crossing'));
    await f.ready(); assert.equal(f.executed.length, 0); f.event(completed('crossing')); await settle();
    assert.equal(f.executed.length, 1); f.session.dispose();
  });
  await check('ending during warm-up discards queued work and stops microphone', async () => {
    const f = fixture(); await f.start(); await f.started(); f.event(created('cancelled')); f.event(item('cancelled')); f.event(completed('cancelled'));
    f.session.end(); await f.ready(); f.event({type: 'session.closed'}); await settle();
    assert.equal(f.executed.length, 0); assert.equal(f.track.readyState, 'ended'); assert.equal(f.session.active, false); assert.equal(f.timers.size, 0);
  });
  await check('backend failure during warm-up terminates safely without private error text', async () => {
    const f = fixture(); await f.start(); await f.started();
    f.event(envelope({type: 'response.failed', response: {error: {code: 'model_not_found', message: 'private-provider-body'}}}));
    assert.equal(f.states.at(-1).state, 'error'); assert.match(f.states.at(-1).message, /backend model/);
    assert.ok(!f.states.at(-1).message.includes('private-provider-body')); assert.equal(f.track.readyState, 'ended'); assert.equal(f.timers.size, 0);
  });
  await check('input feedback distinguishes local sound, quiet, unsupported levels, mute and recognized speech', async () => {
    const f = fixture(); await f.start(); await f.started(); await f.ready();
    f.setStats(() => new Map([['source', {type: 'media-source', kind: 'audio', audioLevel: 0.2}]]));
    await f.session.checkInput(); assert.match(f.inputs.at(-1), /sound detected/);
    f.advance(11000); f.setStats(() => new Map([['source', {type: 'media-source', kind: 'audio', audioLevel: 0}]]));
    await f.session.checkInput(); assert.match(f.inputs.at(-1), /microphone is quiet/);
    f.setStats(() => new Map()); await f.session.checkInput(); assert.match(f.inputs.at(-1), /does not report input levels/);
    f.session.mute(true); await f.session.checkInput(); assert.equal(f.inputs.at(-1), 'Microphone muted.');
    f.session.mute(false); f.track.muted = true; await f.session.checkInput(); assert.match(f.inputs.at(-1), /not providing audio/);
    f.track.muted = false; f.event({type: 'session.input_transcript.delta', delta: 'Synthetic words'});
    await f.session.checkInput(); assert.equal(f.inputs.at(-1), 'Speech recognized by OpenAI.');
    assert.equal(f.transcripts.length, 1); assert.ok(!f.inputs.join(' ').includes('Synthetic words'));
    f.session.dispose(); assert.equal(f.timers.size, 0); assert.equal(f.inputs.at(-1), 'Microphone off.');
  });
  await check('queued warm-up events are bounded and never execute after overflow', async () => {
    const f = fixture(); await f.start(); await f.started();
    for (let i = 0; i < 257; i++) f.event(created('overflow-' + i));
    assert.equal(f.states.at(-1).state, 'error'); assert.match(f.states.at(-1).message, /before the microphone was ready/);
    await f.ready(); assert.equal(f.executed.length, 0); assert.equal(f.timers.size, 0);
  });
  await check('typed startup preserves full tools/model and never opens the microphone', async () => {
    const f = fixture(); assert.equal(f.apiCalls, 0); await f.start(true); await f.started();
    assert.equal(f.micCalls, 0); assert.equal(f.apiCalls, 1); assert.equal(f.session.active, true); assert.equal(f.session.isTextOnly, true);
    assert.equal(f.requestBody.session.delegation.responses.model, 'fixture-model');
    assert.deepEqual(f.requestBody.session.delegation.responses.tools.map(t => t.name), ['search_vault','read_note','edit_note','create_note','open_note']);
    f.session.sendText('Find summer plans and summarize the next steps.');
    assert.deepEqual(f.peer.channel.sent.map(e => e.type), ['session.thinking.append','response.item.create','response.create']);
    assert.equal(f.peer.channel.sent[1].item.content[0].text, 'Find summer plans and summarize the next steps.');
    assert.equal(f.transcripts.at(-1).speaker, 'You');
    assert.throws(() => f.session.sendText('duplicate'), /Wait for the current/);
    f.event(created('typed-one')); f.event(completed('typed-one')); await settle();
    f.session.sendText('Now append my update to that note.'); assert.equal(f.apiCalls, 1); assert.equal(f.micCalls, 0);
    f.session.end(); assert.equal(f.silentTrack.readyState, 'ended'); f.event({type:'session.closed'}); await settle();
    assert.equal(f.audioContext.state, 'closed'); assert.throws(() => f.session.sendText('late'), /connect/);
  });
  await check('typed turn waits for full tool continuation before accepting a new message', async () => {
    const f=fixture(); await f.start(true); await f.started(); f.session.sendText('Find my note');
    f.event(created('tools')); f.event(item('tools')); f.event(completed('tools')); await settle();
    assert.equal(f.executed.length,1); assert.throws(()=>f.session.sendText('too early'),/current request/);
    assert.equal(f.peer.channel.sent.at(-1).type,'response.create');
    f.event(created('answer')); f.event(completed('answer')); await settle();
    f.session.sendText('Follow up'); f.session.dispose();
  });
  await check('microphone switches on only by explicit action and keeps the same conversation', async () => {
    const f=fixture(); await f.start(true); await f.started(); const peer=f.peer;
    await f.session.enableMicrophone(); assert.equal(f.micCalls,1); assert.equal(f.apiCalls,1);
    assert.equal(f.peer,peer); assert.equal(f.session.isTextOnly,false); assert.equal(f.silentTrack.readyState,'ended'); assert.equal(f.audioContext.state,'closed');
    f.session.sendText('Typed while voice is on'); assert.equal(f.micCalls,1); f.session.dispose();
    const denied=fixture({denied:true}); await denied.start(true); await denied.started(); await denied.session.enableMicrophone();
    assert.equal(denied.session.active,true); assert.equal(denied.session.isTextOnly,true); denied.session.sendText('Still typing'); denied.session.dispose();
  });

  console.log(`${passed} synthetic voice scenarios passed. No actual microphone, keys, vault content or network used.`);
})().catch(error => {console.error(error); process.exitCode = 1;});
