/** Only return fixed, actionable messages: provider messages may echo private input. */
export function voiceFailure(status?: number, error?: { code?: unknown; type?: unknown }): string {
  const code = typeof error?.code === 'string' ? error.code : error?.type;
  if (status === 401 || code === 'invalid_api_key') return 'OpenAI rejected the API key. Update the key in File Focus Duo or Objective Manager settings.';
  if (code === 'insufficient_quota') return 'OpenAI API quota is exhausted. Check billing and project limits.';
  if (status === 429 || code === 'rate_limit_exceeded') return 'OpenAI rate or quota limit reached. Check project limits or try again later.';
  if ([403, 404].includes(status || 0) || ['model_not_found', 'model_not_available', 'permission_denied'].includes(String(code))) return 'Check that the key’s OpenAI project can use GPT-Live-1 and the configured Vault voice backend model.';
  if (status === 400 || code === 'invalid_request_error') return 'OpenAI rejected the voice configuration. Check the Vault voice backend model in File Focus Duo settings and update the plugin if needed.';
  return 'OpenAI could not complete the voice connection. Check the network and project status, then try again.';
}
