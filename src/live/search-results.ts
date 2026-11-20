import { Modal, Notice, type App } from 'obsidian';
import type { VaultSearchRequest, VaultSearchResult } from './vault-tools';

/** The same result list can live inside mobile chat or in its desktop dialog. */
export class VaultSearchResultsContent {
  private opening = false;
  private entries = new Map<string, VaultSearchResult['matches'][number]>();
  private request!: VaultSearchRequest;
  private result!: VaultSearchResult;
  constructor(private root: HTMLElement, result: VaultSearchResult, request: VaultSearchRequest,
    private choose: (path: string) => Promise<void>, private more: (request: VaultSearchRequest) => Promise<void>,
    private onSelected: () => void, private onOpening: (busy: boolean) => void = () => {}) {
    this.update(result, request);
  }
  update(result: VaultSearchResult, request: VaultSearchRequest): void {
    if (!this.request || request.query !== this.request.query || request.folder !== this.request.folder || request.mode !== this.request.mode || request.offset === 0) this.entries.clear();
    this.request = request; this.result = result;
    result.matches.forEach((entry) => this.entries.set(entry.path, entry)); this.render();
  }
  private render(): void {
    const root = this.root;
    const previousScroll = root.querySelector('ul')?.scrollTop ?? 0;
    root.empty();
    root.createEl('p', { text: this.request.query ? `Matches for “${this.request.query}”` : 'Notes and files in your vault' });
    root.createEl('p', { cls: 'fjgduo-vault-live-caption', text: `${this.entries.size} of ${this.result.total_matches} matches shown. ${this.result.coverage}` });
    const list = root.createEl('ul', { cls: 'fjgduo-vault-search-list' });
    for (const entry of this.entries.values()) {
      const item = list.createEl('li');
      const link = item.createEl('a', { text: entry.path.split('/').pop() || entry.path, href: '#', cls: 'internal-link', attr: { 'data-href': entry.path, 'aria-label': `Open ${entry.path}` } });
      link.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation();
        if (this.opening) return;
        this.opening = true; this.onOpening(true);
        try { await this.choose(entry.path); this.onSelected(); }
        catch { new Notice('That result could not be opened. Search again if the note moved.'); }
        finally { this.opening = false; this.onOpening(false); }
      });
      item.createEl('div', { text: entry.path, cls: 'fjgduo-vault-search-path' });
      if (entry.excerpt) item.createEl('p', { text: entry.excerpt, cls: 'fjgduo-vault-search-excerpt' });
    }
    if (!this.entries.size) root.createEl('p', { text: 'No matches on this page.' });
    if (this.result.next_offset !== null) {
      const button = root.createEl('button', { text: 'Show more matches' });
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await this.more({ ...this.request, offset: this.result.next_offset! }); }
        catch { button.disabled = false; new Notice('Could not fetch more results. The voice session may have ended.'); }
      });
    }
    if (this.request.offset > 0) list.scrollTop = previousScroll;
  }
}

export class VaultSearchResultsModal extends Modal {
  private results?: VaultSearchResultsContent;
  constructor(app: App, private result: VaultSearchResult, private request: VaultSearchRequest,
    private choose: (path: string) => Promise<void>, private more: (request: VaultSearchRequest) => Promise<void>,
    private release: () => void) { super(app); }
  onOpen(): void {
    this.modalEl.addClass('fjgduo-vault-search-modal');
    this.titleEl.setText('Choose a search result');
    this.results = new VaultSearchResultsContent(this.contentEl, this.result, this.request, this.choose, this.more, () => this.close());
  }
  onClose(): void { this.release(); }
  update(result: VaultSearchResult, request: VaultSearchRequest): void { this.results?.update(result, request); }
}
