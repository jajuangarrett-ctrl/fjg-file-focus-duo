// Shared Live Responses protocol, adapted from FJG Objective Manager 0.17.0.
type Event = Record<string, any>;
/** Tracks completed function items, not empty lifecycle snapshots. Serializes writes and deduplicates call IDs. */
export class LiveToolLoop {
  private responses = new Map<string, { calls: Event[]; finished: boolean; delegation?: string }>();
  private current = new Map<string, string>();
  private results = new Map<string, Promise<unknown>>();
  private chain: Promise<void> = Promise.resolve();
  private stopped = false;
  private execute: (name: string, args: string, id: string) => Promise<unknown>;
  private send: (event: Event) => void;
  constructor(execute: (name: string, args: string, id: string) => Promise<unknown>, send: (event: Event) => void) {
    this.execute = execute; this.send = send;
  }
  stop(): void { this.stopped = true; }
  handle(envelope: Event): Promise<void> {
    this.chain = this.chain.then(() => this.process(envelope));
    return this.chain;
  }
  private async process(envelope: Event): Promise<void> {
    if (this.stopped || envelope.type !== "response.event") return;
    const event = envelope.event;
    const rawDelegation = envelope.delegation_id;
    if (!event || (rawDelegation != null && typeof rawDelegation !== "string")) return;
    const delegation = typeof rawDelegation === "string" && rawDelegation ? rawDelegation : undefined;
    const explicitId = typeof event.response?.id === "string" && event.response.id ? event.response.id
      : typeof event.response_id === "string" && event.response_id ? event.response_id : undefined;
    if (event.type === "response.created") {
      if (explicitId && !this.responses.has(explicitId)) {
        if (delegation) this.current.set(delegation, explicitId);
        this.responses.set(explicitId, { calls: [], finished: false, delegation });
      }
      return;
    }
    // App-started typed responses may have a null or omitted delegation_id.
    // Without a delegation, only an explicit nested response ID can route an item.
    const id = explicitId ?? (delegation ? this.current.get(delegation) : undefined);
    const state = id ? this.responses.get(id) : undefined;
    if (!state || state.finished || (state.delegation && delegation && state.delegation !== delegation)) return;
    if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
      if (!state.calls.some((call) => call.call_id === event.item.call_id)) state.calls.push(event.item);
    }
    if (["response.failed", "response.cancelled", "response.incomplete"].includes(event.type)) { state.finished = true; return; }
    if (event.type !== "response.completed") return;
    state.finished = true;
    for (const call of state.calls) {
      if (this.stopped) return;
      if (typeof call.call_id !== "string" || typeof call.name !== "string" || typeof call.arguments !== "string") throw new Error("Invalid voice tool call.");
      let result = this.results.get(call.call_id);
      if (!result) {
        result = this.execute(call.name, call.arguments, call.call_id).catch((error) => ({ error: error instanceof Error ? error.message : "Task change failed." }));
        this.results.set(call.call_id, result);
      }
      const output = await result;
      if (this.stopped) return;
      this.send({ type: "response.item.create", item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) } });
    }
    if (state.calls.length && !this.stopped) this.send({ type: "response.create" });
  }
}
