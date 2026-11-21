import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveToolLoop } from '../src/live/tool-loop.ts';
import { canSplitVoice } from '../src/live/presentation.ts';

test('typed response IDs route null and omitted delegation events without assigning ambiguous tool items', async () => {
  const calls: string[] = [], outgoing: Record<string, any>[] = [];
  const loop = new LiveToolLoop(async (_name, _args, callId) => (calls.push(callId), { ok: true }), event => outgoing.push(event));
  const emit = (event: Record<string, unknown>, delegation?: string | null) =>
    loop.handle({ type: 'response.event', ...(delegation === undefined ? {} : { delegation_id: delegation }), event });
  const create = (id: string, delegation?: string | null) => emit({ type: 'response.created', response: { id } }, delegation);
  const complete = (id: string, delegation?: string | null) => emit({ type: 'response.completed', response: { id } }, delegation);
  const item = (callId: string, responseId?: string, delegation?: string | null) => emit({
    type: 'response.output_item.done', response_id: responseId,
    item: { type: 'function_call', call_id: callId, name: 'search_vault', arguments: '{}' }
  }, delegation);
  await create('voice', 'voice-id');
  await create('typed-a', null);
  await create('typed-b');
  await item('ambiguous', undefined, null);
  await item('not-created', 'missing');
  await item('wrong-delegation', 'voice', 'other-id');
  await item('typed-a', 'typed-a', null);
  await item('typed-b', 'typed-b');
  await item('voice', undefined, 'voice-id');
  await item('typed-a', 'typed-a', null);
  await complete('typed-b');
  await complete('voice', 'voice-id');
  await complete('typed-a', null);
  await complete('typed-a');
  assert.deepEqual(calls, ['typed-b', 'voice', 'typed-a']);
  assert.deepEqual(outgoing.filter(e => e.type === 'response.item.create').map(e => e.item.call_id), calls);
  assert.equal(outgoing.filter(e => e.type === 'response.create').length, 3);
});

test('wide voice layout follows pane width and stays stable near the cutoff', () => {
  for (const width of [0, 390, 679]) assert.equal(canSplitVoice(width, true), false);
  for (const width of [680, 719]) {
    assert.equal(canSplitVoice(width, false), false);
    assert.equal(canSplitVoice(width, true), true);
  }
  assert.equal(canSplitVoice(720, false), true);
});
