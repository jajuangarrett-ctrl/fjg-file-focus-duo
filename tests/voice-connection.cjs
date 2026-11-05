// Synthetic transport only. No credential files, vault data, microphone or external API.
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const vm = require('node:vm');
(async()=>{
const built = (await esbuild.build({entryPoints:['src/live/session.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{
  name:'mock-obsidian', setup(build){build.onResolve({filter:/^obsidian$/},()=>({path:'obsidian',namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const Platform={isMobile:false}; export const requestUrl=(...args)=>globalThis.voiceRequest(...args);',loader:'js'}));}
}]})).outputFiles[0].text;

let requestCount=0, micCount=0, reply, permissionDenied=false, peer, now=10000;
const track={enabled:true,muted:false,readyState:'live',stop(){this.readyState='ended';}};
class Channel extends EventTarget {readyState='open'; sent=[];send(value){this.sent.push(JSON.parse(value));}close(){this.readyState='closed';}event(value){this.dispatchEvent(Object.assign(new Event('message'),{data:JSON.stringify(value)}));}}
class Peer extends EventTarget {
  connectionState='connected'; iceGatheringState='complete'; localDescription={sdp:'synthetic-offer'}; channel=new Channel(); closed=false;
  constructor(){super();peer=this;}addTrack(){}createDataChannel(){return this.channel;}async createOffer(){return this.localDescription;}async setLocalDescription(){}async setRemoteDescription(value){this.answer=value;}
  async getStats(){return new Map([['audio',{type:'outbound-rtp',kind:'audio',bytesSent:now}]]);}close(){this.closed=true;}
}
const context={module:{exports:{}},require,Error,Event,EventTarget,setTimeout,clearTimeout,Date:class extends Date{static now(){return now;}},crypto:require('node:crypto').webcrypto,
 navigator:{mediaDevices:{getUserMedia:async()=>{micCount++;if(permissionDenied)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},
 RTCPeerConnection:Peer,voiceRequest:async()=>{requestCount++;return reply;}};
vm.runInNewContext(built,context);
const {VaultLiveSession}=context.module.exports;
let states=[]; const audio={pause(){},srcObject:null};
const make=()=>{track.readyState='live';states=[];return new VaultLiveSession(audio,{state:(state,message)=>states.push({state,message}),transcript(){},execute:async()=>({})});};
let session=make();await session.start('', 'fixture-model','{}');assert.equal(micCount,0);assert.equal(requestCount,0);assert.match(states.at(-1).message,/No saved voice key/);
permissionDenied=true;session=make();await session.start('fixture-only','fixture-model','{}');assert.equal(requestCount,0);assert.match(states.at(-1).message,/Microphone access was denied/);assert.ok(peer.closed);
permissionDenied=false;reply={status:401,get json(){throw Error('private-provider-body');}};session=make();await session.start('fixture-only','fixture-model','{}');assert.match(states.at(-1).message,/HTTP 401/);assert.match(states.at(-1).message,/rejected the API key/);assert.equal(track.readyState,'ended');assert.ok(peer.closed);assert.ok(!states.at(-1).message.includes('private-provider-body'));
reply={status:201,json:{transport:{sdp:'synthetic-answer'}}};session=make();await session.start('fixture-only','fixture-model','{}');assert.equal(peer.answer.sdp,'synthetic-answer');peer.channel.event({type:'session.started'});await new Promise(resolve=>setImmediate(resolve));now+=500;await session.checkAudioReady();assert.equal(session.active,true);assert.equal(states.at(-1).state,'connected');
peer.channel.event({type:'response.event',event:{type:'response.failed',response:{error:{code:'model_not_found',message:'private-provider-body'}}}});assert.equal(states.at(-1).state,'error');assert.match(states.at(-1).message,/backend model/);assert.ok(!states.at(-1).message.includes('private-provider-body'));assert.equal(track.readyState,'ended');assert.equal(session.active,false);
console.log('PASS: missing key, microphone denial, non-JSON HTTP failure, connected audio readiness, backend model failure and cleanup (synthetic only).');
})().catch(error=>{console.error(error);process.exitCode=1;});
