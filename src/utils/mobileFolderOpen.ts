import { App, FileView, Notice, TFile, Workspace, WorkspaceLeaf } from 'obsidian';

type MobileFolderTabs = { previous?: WorkspaceLeaf; pending?: Promise<void> };

const tabsByWorkspace = new WeakMap<Workspace, MobileFolderTabs>();
const deferredDocumentTypes = new Set(['markdown', 'pdf', 'image', 'audio', 'video', 'canvas', 'bases']);

const tabsFor = (workspace: Workspace): MobileFolderTabs => {
    let tabs = tabsByWorkspace.get(workspace);
    if (!tabs) {
        tabs = {};
        tabsByWorkspace.set(workspace, tabs);
    }
    return tabs;
};

const isDocument = (leaf: WorkspaceLeaf): boolean => {
    if (leaf.view instanceof FileView && leaf.view.file instanceof TFile) return true;
    // A deferred view is a placeholder. Inspect its saved state without loading it.
    if (!leaf.isDeferred) return false;
    const viewState = leaf.getViewState();
    return deferredDocumentTypes.has(viewState.type) && typeof viewState.state?.file === 'string' && viewState.state.file.length > 0;
};

export const rememberMobileFolderDocument = (workspace: Workspace, leaf: WorkspaceLeaf | null) => {
    // Keep a pinned document as the most recent selection; never pick an older
    // unrelated document when the most recent one is pinned.
    if (leaf && leaf.getRoot() === workspace.rootSplit && isDocument(leaf)) tabsFor(workspace).previous = leaf;
};

const reusableLeaf = (workspace: Workspace, previous?: WorkspaceLeaf): WorkspaceLeaf | undefined => {
    if (!previous) return undefined;
    // Revalidate membership: a closed leaf may still have its former parent/view.
    let attached = false;
    workspace.iterateRootLeaves(leaf => { if (leaf === previous) attached = true; });
    if (!attached || previous.getRoot() !== workspace.rootSplit || !isDocument(previous)) return undefined;
    const state = previous.getViewState();
    return !state.pinned && !state.group ? previous : undefined;
};

export const openMobileFolderFile = (app: App, path: string): Promise<void> => {
    const { workspace, vault } = app;
    const tabs = tabsFor(workspace);
    const open = async () => {
        try {
            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) { new Notice('File not found.'); return; }
            rememberMobileFolderDocument(workspace, workspace.activeLeaf);
            const previous = reusableLeaf(workspace, tabs.previous);
            const openIn = async (leaf: WorkspaceLeaf) => {
                await leaf.openFile(file, { eState: { focus: true } });
                workspace.setActiveLeaf(leaf, { focus: true });
                rememberMobileFolderDocument(workspace, leaf);
            };
            if (previous) {
                try { await openIn(previous); return; }
                catch { /* The document tab might have closed after selection. */ }
            }
            // Never fall back to getLeaf(false) on this route: the active view
            // could be Duo itself, a pinned tab, or an unrelated dashboard.
            await openIn(workspace.getLeaf(true));
        } catch (error) {
            new Notice(`Could not open file: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    // Wait for the first new document tab to resolve before a second quick tap
    // picks its destination.
    const pending = (tabs.pending ?? Promise.resolve()).then(open);
    tabs.pending = pending;
    const clear = () => { if (tabs.pending === pending) delete tabs.pending; };
    void pending.then(clear, clear);
    return pending;
};
