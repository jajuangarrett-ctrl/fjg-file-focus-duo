import { requestUrl } from 'obsidian';
import { backendInstructions, LIVE_TOOLS } from './vault-tools';

type Item = Record<string, any>;
type Reply = { status: number; json: any };
type Request = (options: { url: string; method: string; headers: Record<string, string>; body: string; throw: boolean }) => Promise<Reply>;
export const TEXT_SEARCH_TOOLS = LIVE_TOOLS.filter(tool => ['search_vault', 'read_note'].includes(tool.name));

/** Uses the same model, context, retrieval and reading as the voice backend. */
export class VaultTextSearchSession {
  private turns: Item[][] = [];
  private busy = false;
  private stopped = false;
  constructor(
    private execute: (name: string, args: string) => Promise<unknown>,
    private request: Request = requestUrl
  ) {}

  get active(): boolean { return this.busy && !this.stopped; }
  stop(): void { this.stopped = true; this.turns = []; }
  selectedNote(path: string): void {
    if (this.stopped || this.busy) return;
    this.turns.push([{ role: 'user', content: `I selected this exact source: ${JSON.stringify(path)}. Use it for follow-up references. This selection is not a new request.` }]);
    this.turns = this.turns.slice(-6);
  }
  private check(): void { if (this.stopped) throw new Error('Search cancelled.'); }

  async ask(apiKey: string, model: string, context: string, question: string): Promise<string> {
    this.check();
    if (this.busy) throw new Error('Wait for the current search to finish.');
    if (!question.trim() || question.length > 8000) throw new Error('Enter a question of up to 8,000 characters.');
    if (!apiKey.trim()) throw new Error('No saved API key was found. Add one in File Focus Duo or Objective Manager settings.');
    this.busy = true;
    const turn: Item[] = [{ role: 'user', content: question.trim() }];
    const calls = new Map<string, { signature: string; output: string }>();
    try {
      for (let step = 0; step < 8; step++) {
        this.check();
        const response = await this.request({
          url: 'https://api.openai.com/v1/responses', method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, store: false,
            instructions: backendInstructions(context) + '\nThis is typed advanced search. Use the same thorough search and note reading to answer, but only read-only search/read tools are available. Do not claim to create, edit or open notes. Provide exact source paths in answers. The user can open the displayed source links. Return your answer in text.',
            input: [...this.turns.flat(), ...turn], tools: TEXT_SEARCH_TOOLS,
            tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: 1800 }),
          throw: false
        });
        this.check();
        if (response.status >= 400) {
          if (response.status === 401) throw new Error('OpenAI rejected the API key. Update it in File Focus Duo or Objective Manager settings.');
          if (response.status === 429) throw new Error('OpenAI rate or quota limit reached. Check project limits or try again later.');
          if ([400, 403, 404].includes(response.status)) throw new Error('OpenAI rejected this request. Check access to the configured Vault voice backend model.');
          throw new Error('OpenAI could not complete the search. Check your connection and try again.');
        }
        let data: any;
        try { data = response.json; } catch { throw new Error('OpenAI returned an unreadable response. Please try again.'); }
        if (data?.status === 'incomplete') throw new Error('The answer exceeded its response limit. Try a narrower question.');
        if (!Array.isArray(data?.output)) throw new Error('OpenAI returned no answer. Please try again.');
        const output = data.output as Item[];
        turn.push(...output);
        const pending = output.filter(item => item.type === 'function_call');
        if (!pending.length) {
          const answer = output.filter(item => item.type === 'message' && item.role === 'assistant')
            .flatMap(item => Array.isArray(item.content) ? item.content : [])
            .map(part => part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : '')
            .filter(text => typeof text === 'string' && text.trim()).join('\n\n');
          if (!answer) throw new Error('OpenAI returned no text answer. Try a more specific question.');
          this.check(); this.turns.push(turn); this.turns = this.turns.slice(-6);
          return answer;
        }
        for (const call of pending) {
          this.check();
          if (typeof call.call_id !== 'string' || !call.call_id || typeof call.arguments !== 'string' || call.arguments.length > 60000
            || !TEXT_SEARCH_TOOLS.some(tool => tool.name === call.name)) throw new Error('The assistant requested an unsupported search action. No changes were made.');
          const signature = JSON.stringify([call.name, call.arguments]);
          const previous = calls.get(call.call_id);
          if (previous && previous.signature !== signature) throw new Error('The assistant returned conflicting tool calls. Please try again.');
          let result = previous?.output;
          if (result === undefined) {
            try { result = JSON.stringify(await this.execute(call.name, call.arguments)); }
            catch (error) { this.check(); result = JSON.stringify({ error: error instanceof Error ? error.message : 'The note could not be read.' }); }
            this.check(); calls.set(call.call_id, { signature, output: result });
          }
          turn.push({ type: 'function_call_output', call_id: call.call_id, output: result });
        }
      }
      throw new Error('This search reached its request limit. Try a narrower question.');
    } finally { this.busy = false; }
  }
}
