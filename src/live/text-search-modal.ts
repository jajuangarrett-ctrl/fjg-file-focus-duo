import { Modal, TFile, type App } from 'obsidian';
import type FileTreeAlternativePlugin from '../main';
import { VaultLiveTools, type VaultSearchResult } from './vault-tools';
import { VaultTextSearchSession } from './text-search-session';

/** Same advanced search backend as voice, with explicit submission and no microphone. */
export class VaultTextSearchModal extends Modal {
  private closed = false;
  private busy = false;
  private opening = false;
  private generation = 0;
  private input!: HTMLTextAreaElement;
  private submit!: HTMLButtonElement;
  private stopButton!: HTMLButtonElement;
  private status!: HTMLElement;
  private transcript!: HTMLElement;
  private results!: HTMLElement;
  private session!: VaultTextSearchSession;
  private matches = new Map<string, VaultSearchResult['matches'][number]>();
  private plugin: FileTreeAlternativePlugin;
  private selection: { folder: string; note: string };
  private choose: (path: string) => Promise<void>;
  private release: () => void;

  constructor(app: App, plugin: FileTreeAlternativePlugin, selection: { folder: string; note: string }, choose: (path: string) => Promise<void>, release: () => void) {
    super(app); this.plugin = plugin; this.selection = selection; this.choose = choose; this.release = release;
  }
  onOpen(): void {
    this.modalEl.addClass('fjgduo-vault-text-search-modal');
    this.titleEl.setText('Ask your vault');
    this.contentEl.createEl('p', { text: 'Uses the same AI model and vault search as voice. Sending shares your question, vault name, selected paths and relevant note excerpts with OpenAI. API charges may apply. Your microphone stays off in this text window.', cls: 'fjgduo-vault-live-caption' });
    this.contentEl.createEl('p', { text: this.plugin.settings.liveApiKey?.trim() ? 'Uses the key saved in File Focus Duo.' : 'Uses the key saved in Objective Manager without copying or saving it in Duo.', cls: 'fjgduo-vault-live-caption' });
    const form = this.contentEl.createEl('form', { cls: 'fjgduo-vault-text-search-form' });
    const label = form.createEl('label', { text: 'Your question' });
    this.input = label.createEl('textarea', { placeholder: 'Find my notes about summer planning and summarize the next steps.', attr: { 'aria-label': 'Your question', maxlength: '8000', rows: '3' } });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void this.ask(); }
    });
    this.submit = form.createEl('button', { text: 'Send to AI', cls: 'mod-cta', attr: { type: 'submit' } });
    form.addEventListener('submit', event => { event.preventDefault(); void this.ask(); });
    this.stopButton = form.createEl('button', { text: 'Stop search', attr: { type: 'button' } });
    this.stopButton.disabled = true;
    this.stopButton.addEventListener('click', () => {
      this.generation++; this.session.stop(); this.session = this.createSession(); this.setBusy(false);
      this.status.setText('Search stopped. Your next question starts a new conversation.'); this.input.focus();
    });
    this.status = this.contentEl.createEl('p', { text: 'Type a question, then press Send to AI. Enter sends; Shift+Enter adds a line.', attr: { role: 'status', 'aria-live': 'polite' } });
    this.transcript = this.contentEl.createDiv({ cls: 'fjgduo-vault-text-transcript', attr: { role: 'log', 'aria-label': 'Typed conversation', 'aria-live': 'polite' } });
    this.results = this.contentEl.createDiv({ cls: 'fjgduo-vault-text-search-results' });
    this.session = this.createSession(); this.input.focus();
  }
  onClose(): void { this.closed = true; this.generation++; this.session?.stop(); this.release(); }

  private createSession(): VaultTextSearchSession {
    let session: VaultTextSearchSession;
    const file = (path: string) => {
      const target = this.app.vault.getAbstractFileByPath(path);
      if (!(target instanceof TFile)) throw new Error('The note no longer exists.');
      return target;
    };
    const unavailable = async () => { throw new Error('Typed search is read-only.'); };
    const tools = new VaultLiveTools({
      files: () => this.app.vault.getFiles().map(target => ({ path: target.path, size: target.stat.size })),
      read: path => this.app.vault.read(file(path)), process: unavailable, create: unavailable,
      exists: path => !!this.app.vault.getAbstractFileByPath(path), open: unavailable
    }, () => !this.closed && session.active, () => {}, path => {
      if (!this.closed && session === this.session) {
        if (!this.matches.has(path)) this.matches.set(path, { path, size: 0 });
        this.renderResults();
      }
    }, result => {
      if (this.closed || session !== this.session) return;
      result.matches.forEach(entry => this.matches.set(entry.path, entry));
      this.status.setText(`Reading results… ${result.coverage}`); this.renderResults();
    });
    session = new VaultTextSearchSession((name, args) => tools.execute(name, args));
    return session;
  }
  private async ask(): Promise<void> {
    if (this.closed || this.busy) return;
    const question = this.input.value.trim();
    if (!question) { this.status.setText('Enter a question first.'); this.input.focus(); return; }
    const generation = ++this.generation;
    const session = this.session;
    this.setBusy(true); this.matches.clear(); this.results.empty();
    this.status.setText('Searching with AI…');
    const turn = this.transcript.createDiv();
    turn.createEl('p', { text: `You: ${question}` });
    try {
      const key = await this.plugin.resolveVoiceApiKey();
      if (this.closed || generation !== this.generation) return;
      const context = JSON.stringify({ vault: this.app.vault.getName(), local_date: new Date().toLocaleDateString('en-CA'),
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, selected_folder: this.selection.folder,
        selected_note: this.selection.note || this.app.workspace.getActiveFile()?.path || '',
        search_scope: 'Entire vault unless the user requests a folder' });
      const answer = await session.ask(key, this.plugin.settings.liveBackendModel, context, question);
      if (this.closed || generation !== this.generation) return;
      turn.createEl('p', { text: `Assistant: ${answer}` });
      this.input.value = ''; this.status.setText('Answer ready. Ask a follow-up or open a note below.');
      while (this.transcript.children.length > 12) this.transcript.firstElementChild?.remove();
    } catch (error) {
      if (!this.closed && generation === this.generation) {
        this.status.setText(error instanceof Error ? error.message : 'Could not finish the search. Please try again.');
        turn.createEl('p', { text: 'Search did not finish. No note changes were made.' });
      }
    } finally {
      if (!this.closed && generation === this.generation) { this.setBusy(false); this.input.focus(); }
    }
  }
  private setBusy(busy: boolean): void {
    this.busy = busy; this.submit.disabled = busy; this.stopButton.disabled = !busy;
    this.submit.setText(busy ? 'Searching…' : 'Send to AI'); this.input.disabled = busy;
    this.results.setAttribute('aria-busy', String(busy));
  }
  private renderResults(): void {
    this.results.empty();
    this.results.createEl('h3', { text: 'Notes found' });
    const list = this.results.createEl('ul', { cls: 'fjgduo-vault-search-list', attr: { 'aria-label': 'Vault search results' } });
    for (const entry of Array.from(this.matches.values()).slice(0, 80)) {
      const item = list.createEl('li');
      const link = item.createEl('a', { text: entry.path.split('/').pop() || entry.path, href: '#', cls: 'internal-link', attr: { 'data-href': entry.path, 'aria-label': `Open ${entry.path}` } });
      link.addEventListener('click', async event => {
        event.preventDefault();
        if (this.closed || this.opening || this.busy) return;
        this.opening = true;
        try { await this.choose(entry.path); this.session.selectedNote(entry.path); this.close(); }
        catch { if (!this.closed) this.status.setText('That note could not be opened. Search again if it moved.'); }
        finally { this.opening = false; }
      });
      item.createEl('div', { text: entry.path, cls: 'fjgduo-vault-search-path' });
    }
  }
}
