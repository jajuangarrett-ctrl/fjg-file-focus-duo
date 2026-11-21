import { FileView, Modal, Platform, TFile, WorkspaceMobileDrawer, setIcon, type App } from 'obsidian';
import type FileTreeAlternativePlugin from '../main';
import { VaultLiveSession, type LiveState } from './session';
import { VaultLiveTools, type VaultPort, type VaultSearchRequest } from './vault-tools';
import { VaultSearchResultsContent, VaultSearchResultsModal } from './search-results';
import { canSplitVoice, followVoiceViewport, VOICE_SPLIT_MIN_WIDTH } from './presentation';

export class VaultVoiceModal extends Modal {
  private session?: VaultLiveSession;
  private closed = false;
  private presentation: 'shown' | 'minimizing' | 'minimized' | 'split' | 'closing' = 'shown';
  private initialized = false;
  private restoreRequested = false;
  private stopViewport?: () => void;
  private stopWorkspaceViewport?: () => void;
  private workspaceHost?: HTMLElement;
  private workspaceWidth = 0;
  private splitPanel?: HTMLElement;
  private manualNoteOnly = false;
  private pendingSplit = false;
  private restoreDock?: HTMLElement;
  private quickMute?: HTMLButtonElement;
  private restoreButton?: HTMLButtonElement;
  private restoreStatus?: HTMLElement;
  private mobileResults?: VaultSearchResultsContent;
  private mobileResultsArea?: HTMLElement;
  private mobileResultsBody?: HTMLElement;
  private backToChat?: HTMLButtonElement;
  private chat!: HTMLElement;
  private scrollArea!: HTMLElement;
  private minimizeButton?: HTMLButtonElement;
  private audioDock?: HTMLElement;
  private audioAnchor!: Comment;
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
  private textToggle!: HTMLButtonElement;
  private composer!: HTMLFormElement;
  private textInput!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private pendingText = '';
  private backendBusy = false;
  private awaitingTextReply = false;
  private connectedMessage = '';
  private expandButton!: HTMLButtonElement;
  private sourcePaths = new Set<string>();
  private resultsModal?: VaultSearchResultsModal;
  private lastSpeaker = '';
  private lastText?: HTMLElement;
  private plugin: FileTreeAlternativePlugin;
  private voiceSelection: { folder: string; note: string };
  private release: () => void;

  constructor(app: App, plugin: FileTreeAlternativePlugin, selection: { folder: string; note: string }, release: () => void) {
    super(app); this.plugin = plugin; this.voiceSelection = selection; this.release = release;
  }
  openResponsive(): void {
    if (this.closed || this.initialized) return;
    this.initializeContent();
    if (Platform.isMobile) {
      // Prefer attaching the chat locally, with no modal/backdrop, at launch.
      // This works alongside any existing native note or an empty workspace.
      this.presentation = 'minimized';
      this.watchWorkspace(true);
      if (this.splitPanel) return;
    }
    this.open();
  }
  private initializeContent(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.buildContent();
  }
  onOpen(): void {
    this.presentation = 'shown';
    this.initializeContent();
    if (Platform.isMobile) {
      this.containerEl.classList.add('fjgduo-vault-live-mobile-host');
      this.minimizeButton?.setText(this.app.workspace.getActiveFile() ? 'Show Note' : 'Minimize');
      this.stopViewport = followVoiceViewport(this.containerEl, width => {
        this.containerEl.classList.toggle('fjgduo-vault-live-narrow', width < VOICE_SPLIT_MIN_WIDTH);
      });
      this.watchWorkspace();
    }
  }
  private buildContent(): void {
    this.titleEl.setText('Talk to your vault');
    this.modalEl.addClass('fjgduo-vault-live-modal');
    const body = this.contentEl;
    const chat = this.chat = body.createDiv({ cls: 'fjgduo-vault-live-chat' });
    const root = this.scrollArea = chat.createDiv({ cls: 'fjgduo-vault-live-scroll' });
    if (Platform.isMobile) {
      const minimize = this.minimizeButton = this.titleEl.ownerDocument.createElement('button');
      minimize.type = 'button'; minimize.className = 'fjgduo-vault-live-minimize'; minimize.textContent = 'Minimize';
      minimize.title = 'Show the note and keep the conversation open';
      minimize.addEventListener('click', () => this.showNoteOnly());
      minimize.setAttribute('data-ignore-swipe', '');
      this.titleEl.after(minimize);
      this.mobileResultsArea = body.createDiv({ cls: 'fjgduo-vault-live-mobile-results' });
      this.mobileResultsArea.hidden = true;
      const header = this.mobileResultsArea.createDiv({ cls: 'fjgduo-vault-live-results-header' });
      header.createEl('h2', { text: 'Choose a search result' });
      this.backToChat = header.createEl('button', { text: 'Back to Chat' });
      this.backToChat.addEventListener('click', () => this.closeMobileResults(true));
      this.mobileResultsBody = this.mobileResultsArea.createDiv({ cls: 'fjgduo-vault-live-results-body' });
    }
    root.createEl('p', { cls: 'fjgduo-vault-live-intro', text: 'Ask about your notes, capture a thought, or say what to update. Clear edits save immediately.' });
    root.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Starting voice or sending text shares your messages, the vault name, selected paths and relevant note excerpts with OpenAI. Voice also sends microphone audio; starting with text keeps the microphone off. Spoken replies are on. API charges may apply. ' + (this.plugin.settings.liveApiKey?.trim() ? 'Uses the key saved in File Focus Duo.' : 'Uses the key saved in Objective Manager for this conversation without copying or saving it in Duo.') });
    this.status = (Platform.isMobile ? chat : root).createEl('p', { cls: 'fjgduo-vault-live-status', text: 'Microphone off — review the details before starting', attr: { role: 'status', 'aria-live': 'polite' } });
    this.inputStatus = root.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Microphone off.', attr: { role: 'status', 'aria-live': 'polite', 'aria-label': 'Microphone input' } });
    this.coverage = root.createEl('p', { cls: 'fjgduo-vault-live-coverage', attr: { role: 'status' } });
    const controls = root.createDiv({ cls: 'fjgduo-vault-live-controls' });
    this.startButton = controls.createEl('button', { text: this.startLabel(), cls: 'mod-cta' });
    this.startButton.addEventListener('click', () => void this.start());
    this.muteButton = controls.createEl('button', { text: 'Mute microphone', attr: { 'aria-pressed': 'false' } });
    this.muteButton.disabled = true;
    this.muteButton.addEventListener('click', () => this.toggleMute());
    this.endButton = controls.createEl('button', { text: 'End conversation' });
    this.endButton.disabled = true; this.endButton.addEventListener('click', () => this.session?.end());
    this.expandButton = controls.createEl('button', { text: 'Expand conversation', cls: 'fjgduo-vault-live-expand' });
    this.expandButton.addEventListener('click', () => this.setCompact(false));
    this.textToggle = controls.createEl('button', { text: 'Type a message', attr: { 'aria-expanded': 'false' } });
    this.textToggle.addEventListener('click', () => {
      this.composer.hidden = !this.composer.hidden;
      this.textToggle.setAttribute('aria-expanded', String(!this.composer.hidden));
      if (!this.composer.hidden) {
        this.textInput.focus();
        if (Platform.isMobile) this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
      }
    });
    this.composer = (Platform.isMobile ? chat : root).createEl('form', { cls: 'fjgduo-vault-live-composer', attr: { 'data-ignore-swipe': '' } });
    this.composer.hidden = true;
    const label = this.composer.createEl('label', { text: 'Message to your vault assistant' });
    this.textInput = label.createEl('textarea', { placeholder: 'Type the same request you would say…', attr: { 'aria-label': 'Message to your vault assistant', rows: '3', maxlength: '8000', enterkeyhint: 'send', 'data-ignore-swipe': '' } });
    this.sendButton = this.composer.createEl('button', { text: 'Send message', cls: 'mod-cta', attr: { type: 'submit', 'data-ignore-swipe': '' } });
    this.composer.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Same conversation, AI tools and spoken replies as voice. Enter sends; Shift+Enter adds a line. Clear requested edits save immediately.' });
    this.composer.addEventListener('submit', event => { event.preventDefault(); void this.sendText(); });
    // A physical touch uses the click's activation directly instead of relying on native form submission.
    this.sendButton.addEventListener('click', event => { event.preventDefault(); void this.sendText(); });
    this.textInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void this.sendText(); }
    });
    this.audio = root.createEl('audio', { attr: { controls: '', autoplay: '', playsinline: '', 'aria-label': 'Assistant voice playback' } });
    this.audioAnchor = root.ownerDocument.createComment('voice playback position');
    this.audio.before(this.audioAnchor);
    this.transcript = root.createDiv({ cls: 'fjgduo-vault-live-transcript', attr: { role: 'log', 'aria-label': 'Conversation', 'aria-live': 'polite' } });
    this.transcript.createEl('p', { cls: 'fjgduo-vault-live-caption', text: 'Try: “Find my notes about summer planning” or “Add this thought to my meeting note.”' });
    this.sources = root.createDiv({ cls: 'fjgduo-vault-live-sources', attr: { 'aria-label': 'Source notes' } });
    this.saved = root.createDiv({ cls: 'fjgduo-vault-live-saved', attr: { role: 'log', 'aria-label': 'Saved changes', 'aria-live': 'polite' } });
  }
  private startLabel(): string {
    return this.plugin.settings.liveApiKey?.trim() ? 'Agree and start conversation' : 'Use Objective Manager key and start';
  }
  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error('The note no longer exists.');
    return file;
  }
  private async sendText(): Promise<void> {
    if (this.closed || this.sendButton.disabled) return;
    const text = this.textInput.value.trim();
    if (!text) { this.status.setText('Type a message first.'); this.textInput.focus(); return; }
    if (this.session?.active) {
      try { this.lastSpeaker = ''; this.session.sendText(text); this.textInput.value = ''; this.markTextSent(); }
      catch (error) { this.status.setText(error instanceof Error ? error.message : 'Could not send the message.'); }
      return;
    }
    this.pendingText = text;
    await this.start(true);
  }
  async start(textOnly = false): Promise<void> {
    if (this.closed || this.startButton.disabled) return;
    if (this.session?.active && this.session.isTextOnly && !textOnly) {
      this.startButton.disabled = true; await this.session.enableMicrophone(); return;
    }
    this.startButton.disabled = true; this.session?.dispose(); this.muted = false; this.backendBusy = false; this.awaitingTextReply = false;
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
      if (this.mobileResults) { this.mobileResults.update(result, request); return; }
      if (this.resultsModal) { this.resultsModal.update(result, request); return; }
      if (result.matches.length < 2) return;
      const choose = async (path: string) => {
        await this.showNote(path); this.addSource(path); session.selectedNote(path);
      };
      const more = async (next: VaultSearchRequest) => { await tools.execute('search_vault', JSON.stringify(next)); };
      if (this.mobileResultsArea && this.mobileResultsBody) {
        this.mobileResults = new VaultSearchResultsContent(this.mobileResultsBody, result, request, choose, more, () => this.closeMobileResults(),
          busy => { if (this.backToChat) this.backToChat.disabled = busy; });
        this.textInput.blur();
        this.chat.hidden = true;
        this.mobileResultsArea.hidden = false;
        if (this.presentation === 'shown' || this.presentation === 'split') this.backToChat?.focus({ preventScroll: true });
        this.paintRestoreButton();
        return;
      }
      this.resultsModal = new VaultSearchResultsModal(this.app, result, request, choose, more, () => { this.resultsModal = undefined; });
      this.resultsModal.open();
    });
    session = new VaultLiveSession(this.audio, {
      state: (state, message) => this.setState(state, message),
      busy: busy => {
        this.backendBusy = busy;
        if (!busy && this.awaitingTextReply) {
          this.awaitingTextReply = false;
          if (!this.closed && this.status.dataset.state === 'connected')
            this.status.setText(this.muted ? 'Microphone muted' : this.connectedMessage);
        }
        this.refreshSend();
      },
      inputStatus: message => { if (!this.closed) this.inputStatus.setText(message); },
      transcript: (speaker, delta) => this.addTranscript(speaker, delta),
      execute: (name, args) => tools.execute(name, args)
    });
    this.session = session; this.setState('connecting', textOnly ? 'Connecting for typed messages… Microphone off.' : 'Connecting… Please wait before speaking.');
    if (textOnly) session.prepareTextInput();
    try {
      const key = await this.plugin.resolveVoiceApiKey();
      if (this.closed || this.session !== session) return;
      const context = JSON.stringify({ vault: this.app.vault.getName(), local_date: new Date().toLocaleDateString('en-CA'),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, selected_folder: this.voiceSelection.folder,
        selected_note: this.voiceSelection.note || this.app.workspace.getActiveFile()?.path || '', search_scope: 'Entire vault unless the user requests a folder' });
      await session.start(key, this.plugin.settings.liveBackendModel, context, textOnly);
    } catch { session.dispose(); this.setState('error', 'Could not read the saved key. Check the Vault voice API key in File Focus Duo settings; no connection was made.'); }
  }
  close(): void {
    if (this.closed || this.presentation === 'closing' || this.presentation === 'minimizing') return;
    if (this.presentation === 'minimized' || this.presentation === 'split') { this.finish(); return; }
    this.presentation = 'closing';
    this.session?.end();
    super.close();
  }
  onClose(): void {
    this.stopViewport?.(); this.stopViewport = undefined;
    this.containerEl.classList.remove('fjgduo-vault-live-handoff');
    if (this.closed) return;
    if (this.presentation === 'minimizing') {
      this.presentation = 'minimized';
      if (this.restoreRequested) {
        this.restoreRequested = false;
        queueMicrotask(() => this.restoreChat());
      } else if (this.pendingSplit && this.isWideWorkspace()) {
        this.pendingSplit = false;
        this.mountSplit();
      } else this.showRestoreButton();
      return;
    }
    this.finish();
  }
  shutdown(): void {
    this.session?.end(); this.session?.dispose();
    if (this.presentation === 'minimizing') { this.finish(); return; }
    this.close();
  }
  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopViewport?.(); this.stopViewport = undefined;
    this.stopWorkspaceViewport?.(); this.stopWorkspaceViewport = undefined;
    this.clearSplit();
    this.removeRestoreButton(); this.audioDock?.remove();
    this.resultsModal?.close(); this.session?.end(); this.release();
  }
  restoreChat(): void {
    if (this.closed || !Platform.isMobile) return;
    if (this.presentation === 'minimizing') { this.restoreRequested = true; return; }
    if (this.presentation === 'split') { this.focusMobileChat(); return; }
    if (this.presentation !== 'minimized') return;
    this.manualNoteOnly = false;
    if (this.isWideWorkspace()) { this.mountSplit(); return; }
    this.removeRestoreButton();
    this.shouldRestoreSelection = true;
    this.open();
    this.restoreAudio();
    this.focusMobileChat();
  }
  private focusMobileChat(): void {
    if (this.mobileResults) this.backToChat?.focus({ preventScroll: true });
    else {
      const title = this.splitPanel?.querySelector<HTMLElement>('.fjgduo-vault-live-split-title') ?? this.titleEl;
      title.tabIndex = -1; title.focus({ preventScroll: true });
    }
  }
  private closeMobileResults(focus = false): void {
    if (!this.mobileResultsArea || !this.mobileResults) return;
    this.mobileResults = undefined;
    this.mobileResultsBody?.empty();
    this.mobileResultsArea.hidden = true;
    this.chat.hidden = false;
    this.paintRestoreButton();
    if (focus) this.textToggle.focus({ preventScroll: true });
  }
  private watchWorkspace(collapseOverlayDrawers = false): void {
    if (this.stopWorkspaceViewport) return;
    const workspaceEl = this.app.workspace.containerEl;
    const root = workspaceEl?.querySelector<HTMLElement>(':scope > .workspace-split.mod-root') ??
      workspaceEl?.querySelector<HTMLElement>('.workspace-split.mod-root');
    if (!root?.isConnected || root.ownerDocument !== this.modalEl.ownerDocument) return;
    this.workspaceHost = root;

    // Translation caused by an unpinned sliding drawer leaves layout width unchanged,
    // but can temporarily clip the root. Use true layout width only to decide whether
    // to dismiss the overlay; docking below still requires enough visible space.
    const win = root.ownerDocument.defaultView;
    const potentialWidth = Math.min(root.clientWidth, win?.visualViewport?.width ?? win?.innerWidth ?? 0);
    if (collapseOverlayDrawers && canSplitVoice(potentialWidth, false) && !root.querySelector(':scope > .fjg-live-lane')) {
      this.collapseNativeDrawers();
    }

    this.stopWorkspaceViewport = followVoiceViewport(root, width => {
      this.workspaceWidth = width;
      if (this.closed) return;
      if (this.isWideWorkspace()) this.sizeSplit();
      if (this.presentation === 'split' && !this.isWideWorkspace()) {
        const wasChatFocused = !!this.splitPanel?.contains(root.ownerDocument.activeElement);
        this.unmountSplit();
        if (wasChatFocused) this.restoreChat();
      } else if (!this.manualNoteOnly && this.isWideWorkspace()) {
        if (this.presentation === 'minimized') this.mountSplit();
        else if (this.presentation === 'shown') {
          // The initial measurement can run inside Obsidian's native Modal.open().
          queueMicrotask(() => {
            if (!this.manualNoteOnly && this.isWideWorkspace()) this.minimizeMobile(true);
          });
        }
      }
    }, true);
  }
  private collapseNativeDrawers(): void {
    const { leftSplit, rightSplit } = this.app.workspace;
    if (leftSplit instanceof WorkspaceMobileDrawer && !leftSplit.collapsed) leftSplit.collapse();
    if (rightSplit instanceof WorkspaceMobileDrawer && !rightSplit.collapsed) rightSplit.collapse();
  }
  private isWideWorkspace(): boolean {
    const host = this.workspaceHost;
    return !!host?.isConnected && !host.querySelector(':scope > .fjg-live-lane') &&
      canSplitVoice(this.workspaceWidth, this.presentation === 'split');
  }
  private mountSplit(): void {
    const host = this.workspaceHost;
    if (!host || this.presentation !== 'minimized' || !this.isWideWorkspace()) return;
    this.pendingSplit = false;
    this.removeRestoreButton();
    this.presentation = 'split';
    this.sizeSplit();
    host.classList.add('fjgduo-vault-live-split-root');
    const pane = this.splitPanel = host.createEl('aside', {
      cls: 'fjgduo-vault-live-split-pane fjgduo-vault-live-mobile-host', attr: { 'aria-label': 'Talk to your vault' }
    });
    const header = pane.createDiv({ cls: 'fjgduo-vault-live-split-header' });
    header.createEl('h2', { cls: 'fjgduo-vault-live-split-title', text: 'Talk to your vault' });
    const actions = header.createDiv({ cls: 'fjgduo-vault-live-split-actions' });
    const note = actions.createEl('button', {
      text: this.app.workspace.getActiveFile() ? 'Show Note' : 'Hide Chat',
      cls: 'fjgduo-vault-live-note-only', attr: { type: 'button', 'data-ignore-swipe': '' }
    });
    note.addEventListener('click', () => this.showNoteOnly());
    const close = actions.createEl('button', { attr: { type: 'button', 'aria-label': 'Close conversation', 'data-ignore-swipe': '' } });
    setIcon(close, 'x'); close.addEventListener('click', () => this.close());
    pane.append(this.chat, this.mobileResultsArea!);
    this.restoreAudio();
  }
  private unmountSplit(): void {
    if (this.presentation !== 'split') return;
    this.parkAudio();
    this.contentEl.append(this.chat, this.mobileResultsArea!);
    this.clearSplit();
    this.presentation = 'minimized';
    this.showRestoreButton();
  }
  private sizeSplit(): void {
    const host = this.workspaceHost;
    if (!host) return;
    const size = `${Math.round(Math.max(288, Math.min(390, this.workspaceWidth * 0.42)))}px`;
    if (host.style.getPropertyValue('--fjgduo-voice-pane-width') !== size) host.style.setProperty('--fjgduo-voice-pane-width', size);
  }
  private clearSplit(): void {
    this.splitPanel?.remove(); this.splitPanel = undefined;
    this.workspaceHost?.classList.remove('fjgduo-vault-live-split-root');
    this.workspaceHost?.style.removeProperty('--fjgduo-voice-pane-width');
  }
  private showNoteOnly(): void {
    this.manualNoteOnly = true;
    if (this.presentation === 'split') this.unmountSplit();
    else this.minimizeMobile();
  }
  private parkAudio(): void {
    if (this.audioDock) return;
    const doc = this.modalEl.ownerDocument;
    this.audioDock = doc.createElement('div'); this.audioDock.hidden = true;
    doc.body.append(this.audioDock);
    this.audioDock.append(this.audio);
  }
  private restoreAudio(): void {
    this.audioAnchor.after(this.audio);
    this.audioDock?.remove(); this.audioDock = undefined;
  }
  private minimizeMobile(toSplit = false): void {
    if (this.closed || this.presentation !== 'shown') return;
    this.pendingSplit = toSplit;
    this.presentation = 'minimizing';
    this.containerEl.classList.add('fjgduo-vault-live-handoff');
    // Release Obsidian's native modal keymap/history scope without ending the call.
    this.textInput.blur();
    this.parkAudio();
    this.shouldRestoreSelection = false;
    super.close();
  }
  private showRestoreButton(): void {
    const doc = this.modalEl.ownerDocument;
    const dock = this.restoreDock = doc.createElement('div');
    dock.className = 'fjgduo-vault-live-restore-dock';
    const button = this.restoreButton = dock.createEl('button', { cls: 'fjgduo-vault-live-restore', attr: { type: 'button' } });
    button.setAttribute('data-ignore-swipe', '');
    button.createSpan({ text: 'Show Chat' });
    this.restoreStatus = button.createSpan({ cls: 'fjgduo-vault-live-restore-status' });
    button.addEventListener('click', () => this.restoreChat());
    const mute = this.quickMute = dock.createEl('button', { cls: 'fjgduo-vault-live-quick-mute', attr: { type: 'button', 'data-ignore-swipe': '' } });
    mute.addEventListener('click', () => this.toggleMute());
    this.paintRestoreButton();
    doc.body.append(dock);
  }
  private removeRestoreButton(): void {
    this.restoreDock?.remove();
    this.restoreDock = undefined; this.restoreButton = undefined; this.restoreStatus = undefined; this.quickMute = undefined;
  }
  private toggleMute(): void {
    if (!this.session?.active || this.session.isTextOnly) return;
    this.muted = !this.muted; this.session.mute(this.muted);
    this.muteButton.setText(this.muted ? 'Unmute microphone' : 'Mute microphone');
    this.muteButton.setAttribute('aria-pressed', String(this.muted));
    this.status.setText(this.muted ? 'Microphone muted' : 'Ready — start speaking');
    this.paintRestoreButton();
  }
  private paintRestoreButton(): void {
    if (!this.restoreButton || !this.restoreStatus || !this.quickMute) return;
    const state = this.status.dataset.state;
    const hasMic = this.session?.active && !this.session.isTextOnly;
    const micOn = hasMic && !this.muted;
    const detail = micOn ? 'Mic on' : this.mobileResults ? 'Results' : state === 'connecting' ? 'Connecting'
      : state === 'error' ? 'Disconnected' : this.session?.active ? (this.muted ? 'Muted' : 'Mic off') : '';
    this.restoreButton.classList.toggle('is-mic-on', Boolean(micOn));
    this.restoreStatus.setText(detail);
    this.restoreStatus.hidden = !detail;
    this.quickMute.hidden = !hasMic;
    const label = this.muted ? 'Unmute microphone' : 'Mute microphone';
    this.quickMute.setAttribute('aria-label', label);
    this.quickMute.title = label;
    setIcon(this.quickMute, this.muted ? 'mic-off' : 'mic');
  }
  private refreshSend(): void {
    if (!this.sendButton || this.closed) return;
    const connecting = ['connecting', 'ending'].includes(this.status.dataset.state || '');
    this.sendButton.disabled = connecting || this.backendBusy;
    this.sendButton.setText(this.backendBusy ? 'Assistant working…' : connecting ? 'Connecting…' : 'Send message');
  }
  private markTextSent(): void {
    this.awaitingTextReply = true;
    this.status.setText('Message sent. Waiting for the assistant…');
  }
  private setState(state: LiveState, message: string): void {
    if (this.closed) return;
    if (state === 'connected') this.connectedMessage = message;
    this.status.setText(message); this.status.dataset.state = state;
    this.startButton.setText(state === "connecting" ? "Connecting…" : state === "connected" ? (this.session?.isTextOnly ? 'Turn on microphone' : 'Conversation active') : this.startLabel());
    this.status.setAttribute("aria-busy", String(state === "connecting"));
    this.startButton.disabled = ['connecting', 'ending'].includes(state) || (state === 'connected' && !this.session?.isTextOnly);
    this.muteButton.disabled = state !== 'connected' || !!this.session?.isTextOnly; this.endButton.disabled = !['connecting', 'connected'].includes(state);
    if (state === 'connected' && this.pendingText) {
      const text = this.pendingText; this.pendingText = '';
      try { this.lastSpeaker = ''; this.session!.sendText(text); if (this.textInput.value.trim() === text) this.textInput.value = ''; this.markTextSent(); }
      catch (error) { this.status.setText(error instanceof Error ? error.message : 'Could not send the message.'); }
    }
    if (['error', 'ended'].includes(state)) { this.pendingText = ''; this.backendBusy = false; this.awaitingTextReply = false; }
    this.refreshSend();
    this.paintRestoreButton();
  }
  private addSource(path: string): void {
    if (this.closed || this.sourcePaths.has(path)) return;
    this.sourcePaths.add(path);
    const button = this.sources.createEl('button', { text: path.split('/').pop() || path, attr: { title: path, 'aria-label': `Open source ${path}` } });
    button.addEventListener('click', () => void this.showNote(path).then(() => this.session?.selectedNote(path)).catch(() => this.status.setText('The source note could not be opened.')));
  }
  private async showNote(path: string): Promise<void> {
    const canPresent = () => !this.closed && this.presentation !== 'closing';
    if (!canPresent()) throw new Error('Conversation closed.');
    const file = this.file(path);
    const workspace = this.app.workspace;
    if (Platform.isMobile) {
      // Prefer the active exact document, then an existing exact root tab.
      // Never replace an unrelated, pinned, linked or sidebar tab.
      const opensFile = (leaf: typeof workspace.activeLeaf): boolean => {
        if (!leaf || leaf.getRoot() !== workspace.rootSplit) return false;
        if (leaf.view instanceof FileView) return leaf.view.file?.path === path;
        return leaf.isDeferred && leaf.getViewState().state?.file === path;
      };
      let existing = opensFile(workspace.activeLeaf) ? workspace.activeLeaf : null;
      if (!existing) workspace.iterateRootLeaves(leaf => { if (!existing && opensFile(leaf)) existing = leaf; });
      const leaf = existing || workspace.getLeaf('tab');
      if (!existing) await leaf.openFile(file, { active: false });
      if (!canPresent()) throw new Error('Conversation closed.');
      await workspace.revealLeaf(leaf);
      if (!canPresent()) throw new Error('Conversation closed.');
      workspace.setActiveLeaf(leaf, { focus: false });
      // Do not reveal the folder on this route: that opens the drawer in front of the note.
      this.collapseNativeDrawers();
      this.voiceSelection.note = path;
      this.splitPanel?.querySelector<HTMLButtonElement>('.fjgduo-vault-live-note-only')?.setText('Show Note');
      this.closeMobileResults();
      if (this.presentation === 'shown') this.minimizeMobile(this.isWideWorkspace());
      else if (this.presentation === 'minimized' && !this.manualNoteOnly && this.isWideWorkspace()) this.mountSplit();
      else if (this.presentation === 'minimizing' && !this.manualNoteOnly && this.isWideWorkspace()) this.pendingSplit = true;
      return;
    }
    const existing = workspace.getLeavesOfType('markdown').find((leaf) => leaf.getViewState().state?.file === path);
    const leaf = existing || workspace.getLeaf('tab');
    await leaf.openFile(file);
    this.voiceSelection.note = path;
    if (file.parent) await this.plugin.revealFolderPath(file.parent.path);
    await workspace.revealLeaf(leaf);
    this.setCompact(true);
  }
  private setCompact(compact: boolean): void {
    this.modalEl.classList.toggle('is-compact', compact);
    this.modalEl.closest('.modal-container')?.classList.toggle('fjgduo-vault-live-compact-host', compact);
  }
  private addTranscript(speaker: string, delta: string): void {
    if (this.closed) return;
    const scroller = this.scrollArea;
    const follow = Platform.isMobile && !this.chat.hidden && (this.presentation === 'shown' || this.presentation === 'split') &&
      (speaker === 'You' || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48);
    if (!this.lastText || speaker !== this.lastSpeaker) {
      const line = this.transcript.createEl('p'); line.createEl('strong', { text: `${speaker}: ` });
      this.lastText = line.createSpan(); this.lastSpeaker = speaker;
    }
    this.lastText.appendText(delta);
    while (this.transcript.children.length > 80) this.transcript.firstElementChild?.remove();
    this.transcript.scrollTop = this.transcript.scrollHeight;
    if (follow) scroller.scrollTop = scroller.scrollHeight;
  }
}
