/** Shared, inert content classifier. No DOM parsing, execution, assets or network. */
export const HTML_CLASSIFICATION_PREFIX = 64 * 1024;
export function classifyHtmlContent(text: string): boolean {
  let prefix = text.slice(0, HTML_CLASSIFICATION_PREFIX).replace(/^\uFEFF/, "").trimStart();
  // Leading comments and an XML declaration are common in generated/XHTML pages.
  for (let n = 0; n < 64; n++) {
    if (prefix.startsWith("<!--")) {
      const end = prefix.indexOf("-->");
      if (end < 0) return false;
      prefix = prefix.slice(end + 3).trimStart();
    } else if (/^<\?xml\s/i.test(prefix)) {
      const end = prefix.indexOf("?>");
      if (end < 0) return false;
      prefix = prefix.slice(end + 2).trimStart();
    } else break;
  }
  if (/^<!doctype\s+html(?=\s|>)[^<>]*>/i.test(prefix)) return true;
  if (/^<(?:html|head|body)(?:\s[^<>]*|\s*)>/i.test(prefix)) return true;
  // Fragments must start with actual structural markup and contain a matching
  // closing tag. Prose/fences/escaped examples and lone script/style are not pages.
  const fragment = /^<(main|article|section|div|p|h[1-6]|table|ul|ol|form|nav|header|footer|aside|figure|blockquote|pre|details|dl)(?:\s[^<>]*|\s*)>/i.exec(prefix);
  return !!fragment && new RegExp("</" + fragment[1] + "\\s*>", "i").test(prefix.slice(fragment[0].length));
}

export function isHtmlBrowseExtension(extension: string): boolean {
    return /^(?:html|htm)$/i.test(extension);
}

export const MAX_HTML_BROWSE_BYTES = 8 * 1024 * 1024;

interface HtmlCandidate {
    path: string;
    stat: { ctime: number; mtime: number; size: number };
}

interface ReadEntry {
    revision: string;
    verified?: boolean;
    promise: Promise<boolean>;
}

/** Keep only a boolean per version in memory; never retain HTML source. */
export class HtmlFileClassification<File extends HtmlCandidate> {
    private readonly cache = new WeakMap<File, ReadEntry>();
    private readonly queue: Array<() => Promise<void>> = [];
    private running = 0;

    private readonly read: (file: File) => Promise<string>;

    constructor(read: (file: File) => Promise<string>) {
        this.read = read;
    }

    verified(file: File): boolean | undefined {
        return this.current(file)?.verified;
    }

    invalidate(file: File): void {
        this.cache.delete(file);
    }

    verify(file: File): Promise<boolean> {
        const existing = this.current(file);
        if (existing) return existing.promise;
        let finish: (valid: boolean) => void;
        const promise = new Promise<boolean>((resolve) => { finish = resolve; });
        const entry = { promise, revision: this.revision(file) } as ReadEntry;
        this.cache.set(file, entry);
        this.queue.push(async () => {
            if (this.current(file) !== entry) { finish(false); return; }
            try {
                const valid = file.stat.size <= MAX_HTML_BROWSE_BYTES && classifyHtmlContent(await this.read(file));
                if (this.current(file) !== entry) { finish(false); return; }
                entry.verified = valid;
                finish(valid);
            } catch {
                // A transient file-access failure can be retried when next browsed.
                if (this.current(file) === entry) this.invalidate(file);
                finish(false);
            }
        });
        this.pump();
        return promise;
    }

    private current(file: File): ReadEntry | undefined {
        const entry = this.cache.get(file);
        return entry?.revision === this.revision(file) ? entry : undefined;
    }

    private revision(file: File): string {
        return `${file.path}\n${file.stat.ctime}:${file.stat.mtime}:${file.stat.size}`;
    }

    private pump(): void {
        // Mobile adapters read whole files: classify the head and limit concurrent I/O.
        while (this.running < 3 && this.queue.length) {
            const next = this.queue.shift()!;
            this.running++;
            void next().finally(() => {
                this.running--;
                this.pump();
            });
        }
    }
}
