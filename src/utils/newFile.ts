import FileTreeAlternativePlugin from 'main';
import { stripIndents } from 'common-tags';
import dayjs from 'dayjs';
import { TFile, TFolder, App, Notice, Platform } from 'obsidian';
import { eventTypes, OZFile } from 'utils/types';

export const openFile = async (props: { file: OZFile; app: App; newLeaf: boolean; leafBySplit?: boolean; subpath?: string }) => {
    const { file, app, newLeaf, leafBySplit } = props;
    const fileToOpen = app.vault.getAbstractFileByPath(file.path);
    if (!(fileToOpen instanceof TFile)) { new Notice('File not found.'); return; }
    try {
        // Do not replace the navigator itself when it lives in a full tab.
        let leaf;
        try { leaf = app.workspace.getLeaf(newLeaf || app.workspace.activeLeaf?.view?.getViewType() === 'fjg-file-focus-duo-view'); }
        catch { new Notice('New tab unavailable; using the current tab.'); leaf = app.workspace.getLeaf(false); }
        if (leafBySplit) {
            if (Platform.isMobile) { new Notice('Opening in a new tab on mobile.'); leaf=app.workspace.getLeaf(true); }
            else { try {leaf=app.workspace.createLeafBySplit(leaf,'vertical');} catch {new Notice('Split unavailable; opening a new tab.');leaf=app.workspace.getLeaf(true);} }
        }
        app.workspace.setActiveLeaf(leaf,{focus:true});
        try {await leaf.openFile(fileToOpen,{eState:{focus:true,subpath:props.subpath}});}
        catch {new Notice('New tab unavailable; opening in the current tab.'); await app.workspace.getLeaf(false).openFile(fileToOpen);}
    } catch(error){new Notice(`Could not open file: ${error instanceof Error ? error.message : String(error)}`);}
};

export const getFileCreateString = (params: { plugin: FileTreeAlternativePlugin; fileName: string }): string => {
    const { plugin, fileName } = params;

    return stripIndents`
    ${
        plugin.settings.createdYaml
            ? `
        ---
        created: ${dayjs(new Date()).format('YYYY-MM-DD hh:mm:ss')}
        ---
        `
            : ''
    }
    ${plugin.settings.fileNameIsHeader ? `# ${fileName}` : ''}
    `;
};

export const createNewMarkdownFile = async (plugin: FileTreeAlternativePlugin, folder: TFolder, newFileName: string, content?: string) => {
    // @ts-ignore
    const newFile = await plugin.app.fileManager.createNewMarkdownFile(folder, newFileName);
    if (content && content !== '') await plugin.app.vault.modify(newFile, content);
    openFile({ file: newFile, app: plugin.app, newLeaf: false });
    let evt = new CustomEvent(eventTypes.activeFileChange, { detail: { filePath: newFile.path } });
    window.dispatchEvent(evt);
};

export const openFileInNewTab = (app: App, file: OZFile) => {
    openFile({ file: file, app: app, newLeaf: true });
};

export const openFileInNewTabGroup = (app: App, file: OZFile) => {
    openFile({ file: file, app: app, newLeaf: false, leafBySplit: true });
};
