import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFolderTap} from '../src/folderTap.ts';
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test('single tap opens once after the double-tap window',async()=>{let opens=0,backs=0;const g=createFolderTap(20);g.tap(()=>opens++,()=>backs++);assert.equal(opens,0);await pause(35);assert.deepEqual([opens,backs],[1,0]);});
test('double tap only goes up, without transient child navigation',async()=>{let opens=0,backs=0;const g=createFolderTap(20);g.tap(()=>opens++,()=>backs++);g.tap(()=>opens++,()=>backs++);await pause(35);assert.deepEqual([opens,backs],[0,1]);});
test('navigation/disposal cancellation prevents delayed open',async()=>{let opens=0;const states:boolean[]=[];const g=createFolderTap(20,p=>states.push(p));g.tap(()=>opens++,()=>{});g.cancel();await pause(35);assert.equal(opens,0);assert.deepEqual(states,[true,false]);});
