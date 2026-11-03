import { Modal, Notice, type App } from 'obsidian';
import type { VaultSearchRequest, VaultSearchResult } from './vault-tools';

export class VaultSearchResultsModal extends Modal {
  private opening = false;
  private entries = new Map<string, VaultSearchResult['matches'][number]>();
  private request: VaultSearchRequest;
  private result: VaultSearchResult;
  private choose: (path: string) => Promise<void>;
  private more: (request: VaultSearchRequest) => Promise<void>;
  private release: () => void;
  constructor(app: App, result: VaultSearchResult, request: VaultSearchRequest, choose: (path: string) => Promise<void>,
    more: (request: VaultSearchRequest) => Promise<void>, release: () => void) {
    super(app); this.result = result; this.request = request; this.choose = choose; this.more = more; this.release = release;
    result.matches.forEach((entry) => this.entries.set(entry.path, entry));
  }
  onOpen(): void { this.modalEl.addClass('fjgduo-vault-search-modal'); this.render(); }
  onClose(): void { this.release(); }
  update(result: VaultSearchResult, request: VaultSearchRequest): void {
    if (request.query !== this.request.query || request.folder !== this.request.folder || request.mode !== this.request.mode || request.offset === 0) this.entries.clear();
    this.request = request; this.result = result;
    result.matches.forEach((entry) => this.entries.set(entry.path, entry)); this.render();
  }
  private render(): void {
    this.titleEl.setText('Choose a search result'); this.contentEl.empty();
    this.contentEl.createEl('p', { text: this.request.query ? `Matches for “${this.request.query}”` : 'Notes and files in your vault' });
    this.contentEl.createEl('p', { cls: 'fjgduo-vault-live-caption', text: `${this.entries.size} of ${this.result.total_matches} matches shown. ${this.result.coverage}` });
    const list = this.contentEl.createEl('ul', { cls: 'fjgduo-vault-search-list' });
    for (const entry of this.entries.values()) {
      const item = list.createEl('li');
      const link = item.createEl('a', { text: entry.path.split('/').pop() || entry.path, href: '#', cls: 'internal-link', attr: { 'data-href': entry.path, 'aria-label': `Open ${entry.path}` } });
      link.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation();
        if (this.opening) return;
        this.opening = true;
        try { await this.choose(entry.path); this.close(); }
        catch { new Notice('That result could not be opened. Search again if the note moved.'); }
        finally { this.opening = false; }
      });
      item.createEl('div', { text: entry.path, cls: 'fjgduo-vault-search-path' });
      if (entry.excerpt) item.createEl('p', { text: entry.excerpt, cls: 'fjgduo-vault-search-excerpt' });
    }
    if (!this.entries.size) this.contentEl.createEl('p', { text: 'No matches on this page.' });
    if (this.result.next_offset !== null) {
      const button = this.contentEl.createEl('button', { text: 'Show more matches' });
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await this.more({ ...this.request, offset: this.result.next_offset! }); }
        catch { button.disabled = false; new Notice('Could not fetch more results. The voice session may have ended.'); }
      });
    }
  }
}
