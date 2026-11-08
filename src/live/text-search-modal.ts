import { Modal, type App } from 'obsidian';
import { searchVaultLocally, type VaultPort, type VaultSearchRequest, type VaultSearchResult } from './vault-tools';

/** Typed search is local and read-only, independent of the live voice session. */
export class VaultTextSearchModal extends Modal {
  private closed = false;
  private busy = false;
  private opening = false;
  private generation = 0;
  private input!: HTMLInputElement;
  private mode!: HTMLSelectElement;
  private submit!: HTMLButtonElement;
  private status!: HTMLElement;
  private results!: HTMLElement;
  private request?: VaultSearchRequest;
  private entries = new Map<string, VaultSearchResult['matches'][number]>();
  private port: Pick<VaultPort, 'files' | 'read'>;
  private choose: (path: string) => Promise<void>;
  private release: () => void;

  constructor(app: App, port: Pick<VaultPort, 'files' | 'read'>, choose: (path: string) => Promise<void>, release: () => void) {
    super(app); this.port = port; this.choose = choose; this.release = release;
  }

  onOpen(): void {
    this.closed = false;
    this.modalEl.addClass('fjgduo-vault-text-search-modal');
    this.titleEl.setText('Search your vault');
    this.contentEl.createEl('p', { text: 'Search the entire vault locally. No microphone or API key is needed.', cls: 'fjgduo-vault-live-caption' });
    const form = this.contentEl.createEl('form', { cls: 'fjgduo-vault-text-search-form' });
    const label = form.createEl('label', { text: 'Search terms' });
    this.input = label.createEl('input', { type: 'search', placeholder: 'e.g. summer planning', attr: { 'aria-label': 'Search terms', maxlength: '300', enterkeyhint: 'search' } });
    const modeLabel = form.createEl('label', { text: 'Search in' });
    this.mode = modeLabel.createEl('select', { attr: { 'aria-label': 'Search in' } });
    this.mode.createEl('option', { text: 'Note text and file paths', value: 'contents' });
    this.mode.createEl('option', { text: 'File names and paths only', value: 'filenames' });
    this.submit = form.createEl('button', { text: 'Search vault', cls: 'mod-cta', attr: { type: 'submit' } });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void this.search({ query: this.input.value.trim(), folder: '', mode: this.mode.value, offset: 0 });
    });
    this.status = this.contentEl.createEl('p', { text: 'Enter a few words and press Search vault.', attr: { role: 'status', 'aria-live': 'polite' } });
    this.results = this.contentEl.createDiv({ cls: 'fjgduo-vault-text-search-results' });
    this.input.focus();
  }

  onClose(): void { this.closed = true; this.generation++; this.release(); }

  private async search(request: VaultSearchRequest): Promise<void> {
    if (this.closed || this.busy) return;
    if (!request.query.trim()) { this.status.setText('Enter some search terms first.'); this.input.focus(); return; }
    const generation = ++this.generation;
    this.setBusy(true);
    this.status.setText('Searching your vault…');
    if (request.offset === 0) { this.entries.clear(); this.results.empty(); }
    try {
      const result = await searchVaultLocally(this.port, { ...request }, () => {
        if (this.closed || generation !== this.generation) throw new Error('Search cancelled.');
      });
      if (this.closed || generation !== this.generation) return;
      this.request = request;
      result.matches.forEach(entry => this.entries.set(entry.path, entry));
      this.status.setText(result.total_matches ? `${this.entries.size} of ${result.total_matches} matches shown. ${result.coverage}` : `No matches. Try different words or file names. ${result.coverage}`);
      this.renderResults(result);
    } catch {
      if (!this.closed && generation === this.generation) this.status.setText('Search could not finish. Please try again.');
    } finally {
      if (!this.closed && generation === this.generation) this.setBusy(false);
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.submit.disabled = busy;
    this.submit.setText(busy ? 'Searching…' : 'Search vault');
    this.input.disabled = busy; this.mode.disabled = busy;
    this.results.setAttribute('aria-busy', String(busy));
    this.results.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = busy; });
  }

  private renderResults(result: VaultSearchResult): void {
    this.results.empty();
    const list = this.results.createEl('ul', { cls: 'fjgduo-vault-search-list', attr: { 'aria-label': 'Vault search results' } });
    for (const entry of this.entries.values()) {
      const item = list.createEl('li');
      const link = item.createEl('a', { text: entry.path.split('/').pop() || entry.path, href: '#', cls: 'internal-link', attr: { 'data-href': entry.path, 'aria-label': `Open ${entry.path}` } });
      link.addEventListener('click', async event => {
        event.preventDefault();
        if (this.closed || this.opening || this.busy) return;
        this.opening = true;
        try { await this.choose(entry.path); if (!this.closed) this.close(); }
        catch { if (!this.closed) this.status.setText('That result could not be opened. Search again if it moved.'); }
        finally { this.opening = false; }
      });
      item.createEl('div', { text: entry.path, cls: 'fjgduo-vault-search-path' });
      if (entry.excerpt) item.createEl('p', { text: entry.excerpt, cls: 'fjgduo-vault-search-excerpt' });
    }
    if (result.next_offset !== null) {
      const more = this.results.createEl('button', { text: 'Show more matches', attr: { type: 'button' } });
      more.addEventListener('click', () => void this.search({ ...this.request!, offset: result.next_offset! }));
    }
  }
}
