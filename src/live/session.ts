import { Platform, requestUrl } from "obsidian";
import { LiveToolLoop } from "./tool-loop";
import { voiceFailure } from "./failure";
import { backendInstructions, LIVE_INSTRUCTIONS, LIVE_TOOLS } from "./vault-tools";

export type LiveState = "idle" | "connecting" | "connected" | "ending" | "ended" | "error";
export interface LiveCallbacks {
  state: (state: LiveState, message: string) => void;
  inputStatus?: (message: string) => void;
  busy?: (busy: boolean) => void;
  transcript: (speaker: "You" | "Assistant", delta: string) => void;
  execute: (name: string, args: string, id: string) => Promise<unknown>;
}

export function liveRequest(sdp: string, backendModel: string, context: string) {
  return { session: { model: "gpt-live-1", instructions: LIVE_INSTRUCTIONS,
    delegation: { type: "responses", responses: { model: backendModel, instructions: backendInstructions(context),
      tools: LIVE_TOOLS, tool_choice: "auto", parallel_tool_calls: false, max_output_tokens: 1800 } } },
    transport: { type: "webrtc", sdp } };
}

/** Runs in Obsidian's trusted plugin runtime, using its native HTTP API for the saved key. */
export class VaultLiveSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private microphone?: MediaStream;
  private ready = false;
  private textOnly = false;
  private audioContext?: AudioContext;
  private silentSource?: OscillatorNode;
  private sender?: RTCRtpSender;
  private backendResponses = new Set<string>();
  private pendingResponses = 0;
  private backendBusy = false;
  private sessionStarted = false;
  private readinessTimer?: ReturnType<typeof setTimeout>;
  private audioStableSince = 0;
  private lastAudioBytes = 0;
  private lastAudioProgress = 0;
  private playbackBlocked = false;
  private disposed = false;
  private ending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private loop: LiveToolLoop;
  private pendingBackendEvents: Record<string, any>[] = [];
  private inputTimer?: ReturnType<typeof setTimeout>;
  private connectedAt = 0;
  private inputRecognized = false;
  private lastInputStatus = '';
  constructor(private audio: HTMLAudioElement, private callbacks: LiveCallbacks) {
    this.loop = new LiveToolLoop(callbacks.execute, (event) => this.send(event));
  }
  get active(): boolean { return this.ready && !this.disposed && !this.ending; }
  get isTextOnly(): boolean { return this.textOnly; }

  sendText(text: string): void {
    const message = text.trim();
    if (!message || message.length > 8000) throw new Error('Enter a message of up to 8,000 characters.');
    if (!this.active || this.channel?.readyState !== 'open') throw new Error('Wait for the conversation to connect.');
    if (this.backendBusy) throw new Error('Wait for the current request to finish before sending another.');
    // Supported Live typed-input protocol: exact user text enters the same backend conversation.
    this.send({ type: 'session.thinking.append', delegation_id: null, content: 'The user has submitted a typed message to your backend. Treat it like spoken input and speak the resulting answer aloud.' });
    this.send({ type: 'response.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: message }] } });
    this.send({ type: 'response.create' });
    this.callbacks.transcript('You', message);
  }

  async enableMicrophone(): Promise<void> {
    if (!this.active || !this.textOnly) return;
    let microphone: MediaStream | undefined;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!this.active) { microphone.getTracks().forEach(track => track.stop()); return; }
      const track = microphone.getAudioTracks()[0];
      if (!track || !this.sender) throw new Error('No microphone track was available.');
      await this.sender.replaceTrack(track);
      if (!this.active) { microphone.getTracks().forEach(track => track.stop()); return; }
      this.microphone?.getTracks().forEach(track => track.stop());
      this.microphone = microphone; this.textOnly = false;
      this.silentSource?.stop(); this.silentSource = undefined;
      void this.audioContext?.close().catch(() => {}); this.audioContext = undefined;
      this.connectedAt = Date.now(); this.inputRecognized = false;
      this.callbacks.state('connected', 'Microphone on — you can speak or type.');
      void this.checkInput();
    } catch {
      microphone?.getTracks().forEach(track => track.stop());
      if (this.active) this.callbacks.state('connected', 'Microphone unavailable. You can keep typing.');
    }
  }

  private async silentInput(): Promise<MediaStream> {
    const Audio = globalThis.AudioContext || (globalThis as any).webkitAudioContext;
    if (!Audio) throw new Error('Text with spoken replies is not supported on this device.');
    const context: AudioContext = this.audioContext = new Audio();
    const destination = context.createMediaStreamDestination();
    const source = this.silentSource = context.createOscillator();
    const gain = context.createGain(); gain.gain.value = 0;
    source.connect(gain); gain.connect(destination); source.start();
    // Generated silence keeps the Live audio clock moving without recording the user.
    const resume = context.resume();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([resume, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Tap Send again to allow audio playback.')), 5000); })]); }
    finally { clearTimeout(timeout); }
    if (context.state !== 'running') throw new Error('Tap Send again to allow audio playback.');
    return destination.stream;
  }

  async start(apiKey: string, backendModel: string, context: string, textOnly = false): Promise<void> {
    if (this.disposed) return;
    this.textOnly = textOnly;
    this.callbacks.state("connecting", textOnly ? "Connecting for typed messages… Microphone off." : "Connecting… Please wait before speaking.");
    try {
      if (!apiKey.trim()) throw new Error("No saved voice key was found. Add a key in File Focus Duo settings or save one in Objective Manager before starting.");
      if ((!textOnly && !navigator.mediaDevices?.getUserMedia) || typeof RTCPeerConnection === "undefined") throw new Error("Live voice is not supported on this device.");
      const peer = this.peer = new RTCPeerConnection();
      peer.addEventListener("track", (event) => {
        if (this.disposed || this.ending) return;
        this.audio.srcObject = new MediaStream([event.track]);
        void this.audio.play().catch(() => {
          this.playbackBlocked = true;
          if (this.active) this.callbacks.state("connected", "Ready — start speaking. Press play below to hear replies.");
        });
      });
      // Start from the user's click; never automatically reopen a microphone after disconnecting.
      const microphone = textOnly ? await this.silentInput() : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.disposed) { microphone.getTracks().forEach((track) => track.stop()); return; }
      this.microphone = microphone;
      for (const track of microphone.getAudioTracks()) this.sender = peer.addTrack(track, microphone);
      const channel = this.channel = peer.createDataChannel("oai-events");
      channel.addEventListener("message", ({ data }) => {
        try { this.onEvent(JSON.parse(data)); }
        catch { this.fail("The voice connection returned an unreadable event."); }
      });
      channel.addEventListener("close", () => {
        if (!this.disposed) this.fail("Voice connection closed. Any saved changes remain saved. Start again to reconnect.");
      });
      peer.addEventListener("connectionstatechange", () => {
        if (!this.disposed && ["failed", "disconnected"].includes(peer.connectionState)) this.fail("Voice disconnected. Any saved changes remain saved. Start again to reconnect.");
      });
      await peer.setLocalDescription(await peer.createOffer());
      await this.waitForIce(peer);
      if (this.disposed) return;
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Could not prepare the microphone connection.");
      this.timer = setTimeout(() => this.fail("Voice connection timed out. Check your network and API model access, then try again."), 30000);
      const response = await requestUrl({ url: "https://api.openai.com/v1/live/sessions", method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(liveRequest(sdp, backendModel, context)), throw: false });
      if (this.disposed) return;
      if (response.status >= 400) {
        let error: { code?: unknown; type?: unknown } | undefined;
        try { error = response.json?.error; } catch { /* Non-JSON failures still report status safely. */ }
        throw new Error(`Voice connection failed (HTTP ${response.status}). ${voiceFailure(response.status, error)}`);
      }
      let answer: unknown;
      try { answer = response.json?.transport?.sdp; } catch { /* Do not expose a provider response body. */ }
      if (typeof answer !== "string" || !answer.trim()) throw new Error("OpenAI did not return a voice connection answer. Update the plugin and check API model access.");
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
      // POST starts the session. Wait for session.started; never send session.start.
    } catch (error) {
      if (!this.disposed) this.fail(error instanceof Error && error.name === "NotAllowedError"
        ? "Microphone access was denied. Allow Obsidian microphone access in system settings and try again."
        : error instanceof Error ? error.message : "Could not connect voice.");
    }
  }

  mute(muted: boolean): void {
    if (this.textOnly) return;
    this.microphone?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    if (this.active) this.setInputStatus(muted ? 'Microphone muted.' : 'Microphone on — waiting for recognized speech.');
  }

  selectedNote(path: string): void {
    if (!this.active) return;
    const content = `The user selected this exact search result: ${JSON.stringify(path)}. It is now open. Use it as the current note for follow-up references. Selection alone is not a new edit request.`;
    this.send({ type: 'session.thinking.append', delegation_id: null, content });
    this.send({ type: 'response.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: content }] } });
  }

  end(): void {
    if (this.disposed || this.ending) return;
    this.ending = true;
    this.loop.stop();
    this.pendingBackendEvents = [];
    clearTimeout(this.inputTimer);
    this.setInputStatus('Microphone off.');
    // End immediately disables input and further writes; keep the channel for final usage.
    this.mute(true);
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.audio.pause();
    if (this.sessionStarted && this.channel?.readyState === "open") {
      this.callbacks.state("ending", "Ending conversation…");
      this.send({ type: "session.close" });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.dispose(); this.callbacks.state("ended", "Conversation ended; final usage was not received."); }, 5000);
    } else {
      this.dispose();
      this.callbacks.state("ended", "Conversation ended.");
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.pendingBackendEvents = [];
    clearTimeout(this.timer);
    clearTimeout(this.readinessTimer);
    clearTimeout(this.inputTimer);
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.silentSource?.stop(); this.silentSource = undefined;
    void this.audioContext?.close().catch(() => {}); this.audioContext = undefined;
    this.backendResponses.clear(); this.pendingResponses = 0; this.updateBusy();
    this.channel?.close();
    this.peer?.close();
    this.audio.pause();
    this.audio.srcObject = null;
    this.ready = false;
    this.setInputStatus('Microphone off.');
  }

  private onEvent(event: Record<string, any>): void {
    if (this.disposed) return;
    if (event.type === "session.started") {
      if (this.sessionStarted || this.ending) return;
      this.sessionStarted = true;
      if (this.textOnly) {
        this.ready = true; clearTimeout(this.timer);
        this.setInputStatus('Microphone off — type your message. Spoken replies are on.');
        this.callbacks.state('connected', 'Ready — type your message. Microphone off.');
      } else {
        this.callbacks.state("connecting", "Warming up microphone… Please wait before speaking.");
        void this.checkAudioReady();
      }
    } else if (event.type === "session.closed") {
      this.dispose();
      this.callbacks.state("ended", "Conversation ended.");
    } else if (event.type === "error") {
      this.fail(`${voiceFailure(undefined, event.error)} Ended the connection; saved changes remain saved.`);
    } else if (["session.input_transcript.delta", "session.output_transcript.delta"].includes(event.type) && typeof event.delta === "string") {
      if (event.type === 'session.input_transcript.delta' && event.delta.trim()) {
        this.inputRecognized = true;
        if (this.active) this.setInputStatus('Speech recognized by OpenAI.');
      }
      this.callbacks.transcript(event.type === "session.input_transcript.delta" ? "You" : "Assistant", event.delta);
    } else if (event.type === "response.event" && event.event?.type === "response.failed") {
      this.fail(`The vault assistant failed. ${voiceFailure(undefined, event.event.response?.error)} Saved changes remain saved.`);
    } else if (event.type === "response.event" && this.sessionStarted && !this.ending) {
      // Lifecycle events can arrive before the phone's audio warm-up completes.
      // Preserve their order, but allow no vault tool execution until active.
      if (this.active) this.handleBackendEvent(event);
      else if (["response.created", "response.output_item.done", "response.completed", "response.failed", "response.cancelled", "response.incomplete"].includes(event.event?.type)) {
        if (this.pendingBackendEvents.length >= 256) this.fail('Too much assistant work arrived before the microphone was ready. Start a new conversation.');
        else this.pendingBackendEvents.push(event);
      }
    }
  }

  /** A session event alone does not establish that the phone audio path is sending. */
  private async checkAudioReady(): Promise<void> {
    if (this.disposed || this.ending || this.ready) return;
    try {
      const peer = this.peer;
      const track = this.microphone?.getAudioTracks()[0];
      let bytes = 0;
      if (peer?.connectionState === "connected" && track?.readyState === "live" && !track.muted && track.enabled) {
        const stats = await peer.getStats();
        stats.forEach((report) => {
          if (report.type === "outbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) bytes += report.bytesSent || 0;
        });
      }
      if (this.disposed || this.ending) return;
      if (bytes > this.lastAudioBytes) {
        if (!this.audioStableSince) this.audioStableSince = Date.now();
        this.lastAudioProgress = Date.now();
      }
      if (bytes > 0 && this.audioStableSince && Date.now() - this.lastAudioProgress < 1500) {
        // Conservative mobile warm-up for reported loss of the opening phrase.
        // Packet flow is transport evidence, not proof of server speech recognition.
        if (Date.now() - this.audioStableSince >= (Platform.isMobile ? 3500 : 200)) {
          this.ready = true;
          clearTimeout(this.timer);
          this.connectedAt = Date.now();
          const pending = this.pendingBackendEvents;
          this.pendingBackendEvents = [];
          for (const event of pending) this.handleBackendEvent(event);
          this.callbacks.state("connected", this.playbackBlocked ? "Ready — start speaking. Press play below to hear replies." : "Ready — start speaking");
          void this.checkInput();
          return;
        }
      } else {
        this.audioStableSince = 0;
      }
      this.lastAudioBytes = bytes;
    } catch {
      this.audioStableSince = 0;
    }
    this.readinessTimer = setTimeout(() => void this.checkAudioReady(), 200);
  }

  private handleBackendEvent(event: Record<string, any>): void {
    const nested = event.event;
    const id = nested?.response?.id;
    if (nested?.type === 'response.created' && typeof id === 'string') {
      this.pendingResponses = Math.max(0, this.pendingResponses - 1); this.backendResponses.add(id); this.updateBusy();
    }
    void this.loop.handle(event).then(() => {
      if (['response.completed', 'response.cancelled', 'response.incomplete', 'response.failed'].includes(nested?.type) && typeof id === 'string') {
        this.backendResponses.delete(id); this.updateBusy();
      }
    }).catch(() => this.fail("Could not finish a vault request. Check the note before trying the change again."));
  }

  private updateBusy(): void {
    this.backendBusy = this.pendingResponses > 0 || this.backendResponses.size > 0;
    this.callbacks.busy?.(this.backendBusy);
  }

  private setInputStatus(message: string): void {
    if (message === this.lastInputStatus) return;
    this.lastInputStatus = message;
    this.callbacks.inputStatus?.(message);
  }

  /** Local numeric WebRTC levels only; never record, persist or transmit diagnostics. */
  private async checkInput(): Promise<void> {
    clearTimeout(this.inputTimer);
    if (!this.active || this.textOnly) return;
    const track = this.microphone?.getAudioTracks()[0];
    let message: string;
    if (!track || track.readyState !== 'live' || track.muted) message = 'The phone microphone is not providing audio. Check microphone permission and the Bluetooth route.';
    else if (!track.enabled) message = 'Microphone muted.';
    else if (this.inputRecognized) message = 'Speech recognized by OpenAI.';
    else {
      let level: number | undefined;
      try {
        const stats = await this.peer?.getStats();
        stats?.forEach(report => {
          if (report.type === 'media-source' && report.kind === 'audio' && typeof report.audioLevel === 'number') level = Math.max(level ?? 0, report.audioLevel);
        });
      } catch { /* Level reporting is optional on mobile WebRTC implementations. */ }
      if (!this.active) return;
      if (level !== undefined && level > 0.01) message = 'Microphone sound detected — waiting for recognized speech.';
      else if (Date.now() - this.connectedAt >= 10000) message = level === undefined
        ? 'No speech recognized yet. This phone does not report input levels; check microphone permission and the Bluetooth route.'
        : 'No speech recognized and the microphone is quiet. Check microphone permission and the Bluetooth route.';
      else message = 'Microphone on — waiting for recognized speech.';
    }
    if (!this.active) return;
    this.setInputStatus(message);
    this.inputTimer = setTimeout(() => void this.checkInput(), 500);
  }

  private send(event: Record<string, unknown>): void {
    if (!this.disposed && this.channel?.readyState === "open") {
      if (event.type === 'response.create') { this.pendingResponses++; this.updateBusy(); }
      this.channel.send(JSON.stringify({ event_id: crypto.randomUUID(), ...event }));
    }
  }

  private fail(message: string): void {
    if (this.disposed) return;
    this.dispose();
    this.callbacks.state("error", message);
  }

  private waitForIce(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        if (peer.iceGatheringState !== "complete") return;
        clearTimeout(timeout); peer.removeEventListener("icegatheringstatechange", done); resolve();
      };
      const timeout = setTimeout(() => { peer.removeEventListener("icegatheringstatechange", done); reject(new Error("Timed out preparing voice. Check your network.")); }, 10000);
      peer.addEventListener("icegatheringstatechange", done); done();
    });
  }
}
