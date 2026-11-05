import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceFailure } from '../src/live/failure.ts';

test('voice errors identify key, model and quota failures without echoing provider input', () => {
  assert.match(voiceFailure(401), /rejected the API key/);
  assert.match(voiceFailure(404), /GPT-Live-1/);
  assert.match(voiceFailure(429, { code: 'insufficient_quota' }), /billing/);
  assert.match(voiceFailure(undefined, { code: 'model_not_found' }), /backend model/);
  assert.match(voiceFailure(400), /configuration/);
  const privateValue = 'private-note-and-key';
  assert.ok(!voiceFailure(500, { code: privateValue, type: privateValue }).includes(privateValue));
});
