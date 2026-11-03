import { TAbstractFile, TFolder, TFile } from 'obsidian';

export type FileTreeViewMode = 'folder' | 'file' | 'recent' | 'bookmarks';
export type FocusPanelMode = 'recent' | 'bookmarks';

export interface FocusRecentFileEntry {
    path: string;
    basename: string;
    extension: string;
    timestamp: number;
}

export type BookmarkType = 'group' | 'folder' | 'file' | 'graph' | 'search' | 'url';

export interface FocusBookmarkItem {
    ctime?: number;
    type: BookmarkType;
    title?: string;
    items?: FocusBookmarkItem[];
    path?: string;
    subpath?: string;
    query?: string;
    url?: string;
}

export interface CoreBookmarksPluginInstance {
    items: FocusBookmarkItem[];
    openBookmark: (bookmark: FocusBookmarkItem, type: 'tab' | boolean, eState?: { focus: boolean }) => Promise<void>;
}

export interface CoreFileExplorerPluginInstance {
    revealInFolder: (path: TFolder | TFile) => void;
}

export interface CoreGlobalSearchPluginInstance {
    openGlobalSearch: (query: string) => void;
}

export interface CoreWebViewerPluginInstance {
    openUrl: (url: string, newLeaf: boolean) => void;
    options?: {
        openExternalURLs?: boolean;
    };
}

export interface AppWithInternalPlugins {
    internalPlugins?: {
        getEnabledPluginById: (pluginId: string) => unknown;
        plugins?: Record<string, { instance?: unknown; _loaded?: boolean }>;
    };
}

export interface OZFile {
    path: string;
    basename: string;
    extension: string;
    stat: {
        mtime: number;
        ctime: number;
        size: number;
    };
    parent: {
        path: string;
    };
    isFolderNote: boolean;
}

export interface FolderFileCountMap {
    [key: string]: {
        open: number;
        closed: number;
    };
}

export interface FolderTree {
    folder: TFolder;
    children: FolderTree[];
}

// --> app.vault.config
export interface ObsidianVaultConfig {
    newLinkFormat: 'shortest' | 'relative' | 'absolute';
    useMarkdownLinks: boolean;
}

export type VaultChange = 'create' | 'delete' | 'rename' | 'modify';

export interface VaultChangeDetail {
    file: TAbstractFile;
    changeType: VaultChange;
    oldPath: string;
}

export class CustomVaultChangeEvent extends Event {
    detail: VaultChangeDetail;
}

export class CustomVaultChangeBatchEvent extends Event {
    detail: {
        changes: VaultChangeDetail[];
    };
}

export const eventTypes = {
    activeFileChange: 'fjgduo-event-active-file-change',
    followActiveFileChange: 'fjg-file-focus-duo-follow-active-file-change',
    refreshView: 'fjgduo-event-refresh-view',
    revealFile: 'fjgduo-event-reveal-file',
    revealFolder: 'fjgduo-event-reveal-folder',
    vaultChange: 'fjgduo-event-vault-change',
    vaultChanges: 'fjg-file-focus-duo-vault-changes',
    createNewNote: 'fjgduo-event-create-new-note',
    openFocusPanel: 'fjg-file-focus-duo-open-panel',
};

export interface BookmarksPluginItem {
    type: 'file' | 'group' | 'search' | 'folder';
    ctime: number;
    path: string;
    title: string; // data-path from the element
    items: BookmarksPluginItem[];
}
