import { Modal, TFile, type App } from 'obsidian';
import type FileTreeAlternativePlugin from '../main';
import { VaultLiveSession, type LiveState } from './session';
import { VaultLiveTools, type VaultPort } from './vault-tools';
import { VaultSearchResultsModal } from './search-results';
import { VaultTextSearchModal } from './text-search-modal';

export class VaultVoiceModal extends Modal {
  private session?: VaultLiveSession;
  private closed = false;
  private muted = false;
  private status!: HTMLElement;
  private inputStatus!: HTMLElement;
  private coverage!: HTMLElement;
  private transcript!: HTMLElement;
  private saved!: HTMLElement;
  private sources!: HTMLElement;
  private audio!: HTMLAudioElement;
  private startButton!: HTMLButtonElement;
  private muteButton!: HTMLButtonElement;
  private endButton!: HTMLButtonElement;
  private expandButton!: HTMLButtonElement;
  private sourcePaths = new Set<string>();
  private resultsModal?: VaultSearchResultsModal;
  private textSearchModal?: VaultTextSearchModal;
  private lastSpeaker = '';
  private lastText?: HTMLElement;
  private plugin: FileTreeAlternativePlugin;
  private voiceSelection: { folder: string; note: string };
  private release: () => void;

  constructor(app: App, plugin: FileTreeAlternativePlugin, selection: { folder: string; note: string }, release: () => void) {
    super(app); this.plugin = plugin; this.voiceSelection = selection; this.release = release;
  }
  onOpen(): void {
    this.titleEl.setText('Talk to your vault');
    this.modalEl.addClass('fjgduo-vault-live-modal');
    const root = this.contentEl;
    root.createEl('p', { cls: 'fjgduo-vault-live-intro', text: 'Ask about your notes, capture a thought, or say what to update. Clear edits save immediately.' });
    root.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Starting sends microphone audio, the vault name, selected paths and relevant note excerpts to OpenAI. API charges may apply. ' + (this.plugin.settings.liveApiKey?.trim() ? 'Uses the key saved in File Focus Duo.' : 'Uses the key saved in Objective Manager for this conversation without copying or saving it in Duo.') });
    this.status = root.createEl('p', { cls: 'fjgduo-vault-live-status', text: 'Microphone off — review the details before starting', attr: { role: 'status', 'aria-live': 'polite' } });
    this.inputStatus = root.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Microphone off.', attr: { role: 'status', 'aria-live': 'polite', 'aria-label': 'Microphone input' } });
    this.coverage = root.createEl('p', { cls: 'fjgduo-vault-live-coverage', attr: { role: 'status' } });
    const controls = root.createDiv({ cls: 'fjgduo-vault-live-controls' });
    this.startButton = controls.createEl('button', { text: this.startLabel(), cls: 'mod-cta' });
    this.startButton.addEventListener('click', () => void this.start());
    this.muteButton = controls.createEl('button', { text: 'Mute microphone', attr: { 'aria-pressed': 'false' } });
    this.muteButton.disabled = true;
    this.muteButton.addEventListener('click', () => {
      this.muted = !this.muted; this.session?.mute(this.muted);
      this.muteButton.setText(this.muted ? 'Unmute microphone' : 'Mute microphone');
      this.muteButton.setAttribute('aria-pressed', String(this.muted));
      this.status.setText(this.muted ? 'Microphone muted' : 'Ready — start speaking');
    });
    this.endButton = controls.createEl('button', { text: 'End conversation' });
    this.endButton.disabled = true; this.endButton.addEventListener('click', () => this.session?.end());
    const textSearchButton = controls.createEl('button', { text: 'Type a search', attr: { 'aria-label': 'Type a search of the entire vault' } });
    textSearchButton.addEventListener('click', () => this.openTextSearch());
    this.expandButton = controls.createEl('button', { text: 'Expand conversation', cls: 'fjgduo-vault-live-expand' });
    this.expandButton.addEventListener('click', () => this.setCompact(false));
    this.audio = root.createEl('audio', { attr: { controls: '', autoplay: '', 'aria-label': 'Assistant voice playback' } });
    this.transcript = root.createDiv({ cls: 'fjgduo-vault-live-transcript', attr: { role: 'log', 'aria-label': 'Conversation', 'aria-live': 'polite' } });
    this.transcript.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Try: “Find my notes about summer planning” or “Add this thought to my meeting note.”' });
    this.sources = root.createDiv({ cls: 'fjgduo-vault-live-sources', attr: { 'aria-label': 'Source notes' } });
    this.saved = root.createDiv({ cls: 'fjgduo-vault-live-saved', attr: { role: 'log', 'aria-label': 'Saved changes', 'aria-live': 'polite' } });
  }
  private openTextSearch(): void {
    if (this.closed || this.textSearchModal) return;
    this.textSearchModal = new VaultTextSearchModal(this.app, this.plugin, this.voiceSelection, async path => {
      if (this.closed) return;
      await this.showNote(path); this.addSource(path);
      if (this.session?.active) this.session.selectedNote(path);
    }, () => { this.textSearchModal = undefined; });
    this.textSearchModal.open();
  }
  private startLabel(): string {
    return this.plugin.settings.liveApiKey?.trim() ? 'Agree and start conversation' : 'Use Objective Manager key and start';
  }
  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('The note no longer exists.');
    return file;
  }
  async start(): Promise<void> {
    if (this.closed || this.startButton.disabled) return;
    this.startButton.disabled = true; this.session?.dispose(); this.muted = false;
    this.muteButton.setText('Mute microphone'); this.muteButton.setAttribute('aria-pressed', 'false');
    this.lastSpeaker = ''; this.lastText = undefined;
    const port: VaultPort = {
      files: () => this.app.vault.getFiles().map((file) => ({ path: file.path, size: file.stat.size })),
      read: (path) => this.app.vault.read(this.file(path)),
      process: async (path, change) => {
        if (typeof this.app.vault.process !== 'function') throw new Error('Update Obsidian to use atomic note edits.');
        await this.app.vault.process(this.file(path), change);
      },
      create: async (path, content) => { await this.app.vault.create(path, content); },
      exists: (path) => !!this.app.vault.getAbstractFileByPath(path),
      open: (path) => this.showNote(path)
    };
    let session: VaultLiveSession;
    const tools = new VaultLiveTools(port, () => !this.closed && session.active, (path, message) => {
      if (!this.closed) this.saved.createEl('p', { text: `${message}: ${path}` });
    }, (path) => this.addSource(path), (result, request) => {
      if (this.closed) return;
      this.coverage.setText(result.coverage);
      if (this.resultsModal) { this.resultsModal.update(result, request); return; }
      if (result.matches.length < 2) return;
      this.resultsModal = new VaultSearchResultsModal(this.app, result, request, async (path) => {
        await this.showNote(path); this.addSource(path); session.selectedNote(path);
      }, async (next) => { await tools.execute('search_vault', JSON.stringify(next)); }, () => { this.resultsModal = undefined; });
      this.resultsModal.open();
    });
    session = new VaultLiveSession(this.audio, {
      state: (state, message) => this.setState(state, message),
      inputStatus: message => { if (!this.closed) this.inputStatus.setText(message); },
      transcript: (speaker, delta) => this.addTranscript(speaker, delta),
      execute: (name, args) => tools.execute(name, args)
    });
    this.session = session; this.setState('connecting', 'Connecting… Please wait before speaking.');
    try {
      const key = await this.plugin.resolveVoiceApiKey();
      if (this.closed || this.session !== session) return;
      const context = JSON.stringify({ vault: this.app.vault.getName(), local_date: new Date().toLocaleDateString('en-CA'),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, selected_folder: this.voiceSelection.folder,
        selected_note: this.voiceSelection.note || this.app.workspace.getActiveFile()?.path || '', search_scope: 'Entire vault unless the user requests a folder' });
      await session.start(key, this.plugin.settings.liveBackendModel, context);
    } catch { session.dispose(); this.setState('error', 'Could not read the saved key. Check the Vault voice API key in File Focus Duo settings; no connection was made.'); }
  }
  onClose(): void { this.closed = true; this.textSearchModal?.close(); this.resultsModal?.close(); this.session?.end(); this.release(); }
  shutdown(): void { this.session?.end(); this.session?.dispose(); this.close(); }
  private setState(state: LiveState, message: string): void {
    if (this.closed) return;
    this.status.setText(message); this.status.dataset.state = state;
    this.startButton.setText(state === "connecting" ? "Connecting…" : state === "connected" ? "Conversation active" : this.startLabel());
    this.status.setAttribute("aria-busy", String(state === "connecting"));
    this.startButton.disabled = ['connecting', 'connected', 'ending'].includes(state);
    this.muteButton.disabled = state !== 'connected'; this.endButton.disabled = !['connecting', 'connected'].includes(state);
  }
  private addSource(path: string): void {
    if (this.closed || this.sourcePaths.has(path)) return;
    this.sourcePaths.add(path);
    const button = this.sources.createEl('button', { text: path.split('/').pop() || path, attr: { title: path, 'aria-label': `Open source ${path}` } });
    button.addEventListener('click', () => void this.showNote(path).then(() => this.session?.selectedNote(path)).catch(() => this.status.setText('The source note could not be opened.')));
  }
  private async showNote(path: string): Promise<void> {
    const file = this.file(path);
    const existing = this.app.workspace.getLeavesOfType('markdown').find((leaf) => leaf.getViewState().state?.file === path);
    const leaf = existing || this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
    this.voiceSelection.note = path;
    if (file.parent) await this.plugin.revealFolderPath(file.parent.path);
    await this.app.workspace.revealLeaf(leaf);
    this.setCompact(true);
  }
  private setCompact(compact: boolean): void {
    this.modalEl.classList.toggle('is-compact', compact);
    this.modalEl.closest('.modal-container')?.classList.toggle('fjgduo-vault-live-compact-host', compact);
  }
  private addTranscript(speaker: string, delta: string): void {
    if (this.closed) return;
    if (!this.lastText || speaker !== this.lastSpeaker) {
      const line = this.transcript.createEl('p'); line.createEl('strong', { text: `${speaker}: ` });
      this.lastText = line.createSpan(); this.lastSpeaker = speaker;
    }
    this.lastText.appendText(delta);
    while (this.transcript.children.length > 80) this.transcript.firstElementChild?.remove();
    this.transcript.scrollTop = this.transcript.scrollHeight;
  }
}
