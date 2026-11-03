import { App, Modal, Notice, Platform, TAbstractFile, TFile, MarkdownRenderer, Component } from 'obsidian';
export function menuPosition(event: any) {
    const e = event?.nativeEvent || event;
    const point = e?.touches?.[0] || e?.changedTouches?.[0] || e;
    return {x: Number.isFinite(point?.clientX) ? point.clientX : 24, y:Number.isFinite(point?.clientY) ? point.clientY : 64};
}
export async function trashWithFallback(app: App, file: TAbstractFile, system: boolean) {
    try {
        if(system && Platform.isMobile) new Notice('Using Obsidian .trash on this device.');
        await app.vault.trash(file, system && !Platform.isMobile);
    } catch(error) { new Notice(`Could not move to trash: ${error instanceof Error ? error.message : String(error)}`); }
}
export class DuoPreview extends Modal {
    private renderer = new Component();
    constructor(app:App, private file:TFile){super(app);this.modalEl.classList.add('fjgduo-modal');}
    async onOpen(){
        this.renderer.load();
        this.titleEl.setText(this.file.basename);
        if(this.file.extension !== 'md'){ new Notice('Preview supports Markdown. Use Open in a new tab for this file.'); this.close();return; }
        try {await MarkdownRenderer.render(this.app, await this.app.vault.cachedRead(this.file),this.contentEl,this.file.path,this.renderer);}
        catch(error){new Notice(`Preview unavailable: ${error instanceof Error ? error.message : String(error)}`);this.close();}
    }
    onClose(){this.renderer.unload();this.contentEl.empty();}
}
