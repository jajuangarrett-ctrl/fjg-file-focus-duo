import { Plugin, addIcon, TAbstractFile, TFile, TFolder, Notice, Platform, WorkspaceLeaf } from 'obsidian';
import { FileTreeView } from './FileTreeView';
import { ZoomInIcon, ZoomOutIcon, ZoomOutDoubleIcon, LocationIcon, SpaceIcon } from './utils/icons';
import { FileTreeAlternativePluginSettings, FileTreeAlternativePluginSettingsTab, DEFAULT_SETTINGS } from './settings';
import { FileTreeViewMode, VaultChange, VaultChangeDetail, eventTypes } from 'utils/types';
import { getBookmarkTitle } from 'utils/Utils';
import { ensureNoteProperties, ensureNotePropertiesWithNotice, isMarkdownFile } from 'utils/noteProperties';
import { getPageText } from 'utils/noteContent';
import { DebouncedBatchQueue, getMobilePerformancePolicy } from './mobilePerformance';
import { VaultVoiceModal } from './live/modal';

const FileFocusIcon = `
    <g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 29c0-7 5-12 12-12h17l10 10h29c7 0 12 5 12 12v17H12Z" />
        <path d="M29 56v12h42" />
        <path d="M46 68v10" />
        <path d="M71 68v10" />
        <rect x="35" y="78" width="22" height="15" rx="4" />
        <rect x="60" y="78" width="22" height="15" rx="4" />
    </g>
`;

const FileFocusTrashIcon = `
    <g fill="currentColor" stroke="none" transform="translate(6.25 0) scale(0.1953125)">
        <path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z" />
    </g>
`;

const INBOX_MORNING_BRIEF_PATH = 'Artifacts/Inbox Morning Brief/Inbox Morning Brief.html';
const DELETE_CURRENT_FILE_COMMAND_ID = 'app:delete-file';
const FILE_FOCUS_TRASH_ICON = 'fjg-file-focus-duo-trash';

export default class FileTreeAlternativePlugin extends Plugin {
    private vaultVoiceModal: VaultVoiceModal | null = null;
    settings: FileTreeAlternativePluginSettings;
    lastActiveFile: TFile | null = null;
    ribbonIconEl: HTMLElement | undefined = undefined;
    inboxMorningBriefRibbonIconEl: HTMLElement | undefined = undefined;
    ribbonMutationObserver: MutationObserver | undefined = undefined;
    folderRevealListeners = new Set<(folder: TFolder) => void>();
    mountedFileTreeViews = new Set<FileTreeView>();
    hydratingFileTreeLeaves = new WeakSet<WorkspaceLeaf>();
    mobileVaultChangeQueue = new DebouncedBatchQueue<VaultChangeDetail>(
        250,
        (change) => `${change.changeType}:${change.oldPath}:${change.file.path}`,
        (changes) => {
            window.dispatchEvent(new CustomEvent(eventTypes.vaultChanges, { detail: { changes } }));
        }
    );

    keys = {
        activeFolderPathKey: 'fjgFileFocusDuo-ActiveFolderPath',
        pinnedFilesKey: 'fjgFileFocusDuo-PinnedFiles',
        openFoldersKey: 'fjgFileFocusDuo-OpenFolders',
        customHeightKey: 'fjgFileFocusDuo-CustomHeight',
        customWidthKey: 'fjgFileFocusDuo-CustomWidth',
        focusedFolder: 'fjgFileFocusDuo-FocusedFolder',
    };

    // File Tree View Variables
    VIEW_TYPE = 'fjg-file-focus-duo-view';
    VIEW_DISPLAY_TEXT = 'FJG File Focus Duo';
    ICON = 'fjg-file-focus-duo';

    async onload() {
        console.log('Loading FJG File Focus Duo Plugin');

        addIcon(this.ICON, FileFocusIcon);
        addIcon(FILE_FOCUS_TRASH_ICON, FileFocusTrashIcon);
        addIcon('fjgduo-zoomInIcon', ZoomInIcon);
        addIcon('fjgduo-zoomOutIcon', ZoomOutIcon);
        addIcon('fjgduo-zoomOutDoubleIcon', ZoomOutDoubleIcon);
        addIcon('fjgduo-locationIcon', LocationIcon);
        addIcon('fjgduo-spaceIcon', SpaceIcon);

        // Load Settings
        this.addSettingTab(new FileTreeAlternativePluginSettingsTab(this.app, this));
        await this.loadSettings();
        await this.importOriginalVisibilitySettings();
        this.lastActiveFile = this.app.workspace.getActiveFile();
        this.addCommand({ id: 'talk-to-vault', name: 'Talk to Your Vault', callback: () => this.openVaultVoice() });

        // Register File Tree View
        this.registerView(this.VIEW_TYPE, (leaf) => {
            return new FileTreeView(leaf, this);
        });

        // Event Listeners
        this.app.workspace.onLayoutReady(async () => {
            if (await this.importOriginalVisibilitySettings()) this.refreshTreeLeafs();
            this.scheduleRestoredLeafHydration();
            const policy = this.getMobilePerformancePolicy();
            await this.hydrateRestoredFileTreeLeafs(policy.mountReactTree);
            if (policy.attachViewOnLayoutReady) {
                await this.openFileTreeLeaf(policy.revealViewOnLayoutReady);
            }
        });

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', async (leaf) => {
                if (leaf?.getViewState().type !== this.VIEW_TYPE) return;
                await this.hydrateFileTreeLeaf(leaf, true);
                if (typeof (leaf.view as FileTreeView).activateWhenVisible === 'function') {
                    (leaf.view as FileTreeView).activateWhenVisible();
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                void this.hydrateRestoredFileTreeLeafs(this.getMobilePerformancePolicy().mountReactTree);
            })
        );

        // Add Command to Open File Tree Leaf
        this.addCommand({
            id: 'open-fjg-file-focus-duo-view',
            name: 'Open FJG File Focus Duo view',
            callback: async () => await this.openFileTreeLeaf(true),
        });

        this.addCommand({
            id: 'open-recent-notes-panel',
            name: 'Open Recent Notes in FJG File Focus Duo',
            callback: async () => await this.openFocusPanel('recent'),
        });

        this.addCommand({
            id: 'open-bookmarks-panel',
            name: 'Open Bookmarks in FJG File Focus Duo',
            callback: async () => await this.openFocusPanel('bookmarks'),
        });

        this.addCommand({
            id: 'open-inbox-morning-brief',
            name: 'Open Inbox Morning Brief',
            callback: async () => await this.openInboxMorningBrief(),
        });

        this.addCommand({
            id: 'refresh-note-properties',
            name: 'Refresh note properties',
            callback: async () => await ensureNotePropertiesWithNotice(this, this.app.workspace.getActiveFile()),
        });

        this.addCommand({
            id: 'delete-current-file',
            name: 'Delete current file',
            icon: FILE_FOCUS_TRASH_ICON,
            callback: () => void this.deleteCurrentFile(),
        });

        this.addCommand({
            id: 'copy-current-note-to-clipboard',
            name: 'Copy page text to clipboard',
            icon: 'copy',
            editorCallback: async (editor) => {
                try {
                    await navigator.clipboard.writeText(getPageText(editor.getValue()));
                    new Notice('Copied page text to clipboard.');
                } catch (error) {
                    console.error('FJG File Focus Duo could not copy the current note:', error);
                    new Notice('Could not copy the page text to the clipboard.');
                }
            },
        });

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.bookmarksEvents) {
                this.bookmarksAddEventListener();
            }
        });

        this.registerEvent(this.app.workspace.on('file-open', this.onFileOpen));

        this.addCommand({id:'match-original-visibility',name:'Match original hidden file settings',callback: async () => {
            if (!(this.app as any).plugins?.plugins?.['fjg-file-focus']?.settings) { new Notice('The original File Focus plugin is not loaded on this device. Your Duo filters are unchanged.'); return; }
            await this.importOriginalVisibilitySettings(true);
            this.refreshTreeLeafs();
            new Notice('Matched the original visibility settings. Python source/cache files remain hidden.');
        }});
        this.addCommand({id:'open-duo-tab',name:'Open File Focus Duo as a tab',callback: async () => {
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({type:this.VIEW_TYPE,active:true});
            this.app.workspace.revealLeaf(leaf);
        }});
        this.addCommand({id:'reset-duo-layout',name:'Reset Duo layout',callback: () => {
            localStorage.removeItem('fjgFileFocusDuo-column-ratio');
            localStorage.removeItem(this.keys.customHeightKey); localStorage.removeItem(this.keys.customWidthKey);
            new Notice('Duo layout reset. Reopen the Duo view to restore the default column width.');
        }});

        // Add Command to Reveal Active File
        this.addCommand({
            id: 'reveal-active-file',
            name: 'Reveal Active File',
            callback: async () => {
                const file = this.app.workspace.getActiveFile() || this.lastActiveFile;
                if (!file) { new Notice('Open a note first, then reveal it in File Focus Duo.'); return; }
                await this.openFileTreeLeaf(true);
                // Run custom event
                let event = new CustomEvent(eventTypes.revealFile, {
                    detail: {
                        file,
                    },
                });
                window.dispatchEvent(event);
            },
        });

        // Add Command to create a new file under active folder path
        this.addCommand({
            id: ' create-new-note',
            name: 'Create a New Note',
            callback: async () => {
                await this.openFileTreeLeaf(true);
                let event = new CustomEvent(eventTypes.createNewNote, {
                    detail: {},
                });
                window.dispatchEvent(event);
            },
        });

        // Add event listener for vault changes
        this.app.vault.on('create', this.onCreate);
        this.app.vault.on('delete', this.onDelete);
        this.app.vault.on('modify', this.onModify);
        this.app.vault.on('rename', this.onRename);

        // Ribbon Icon For Opening
        this.refreshIconRibbon();
    }

    onunload() {
        this.vaultVoiceModal?.shutdown();
        console.log('Unloading FJG File Focus Duo Plugin');
        this.mobileVaultChangeQueue.clear();
        this.detachFileTreeLeafs();
        // Remove event listeners
        this.app.vault.off('create', this.onCreate);
        this.app.vault.off('delete', this.onDelete);
        this.app.vault.off('modify', this.onModify);
        this.app.vault.off('rename', this.onRename);
        this.bookmarksRemoveEventListener();
    }

    // One-time, device-local import of visibility preferences only. Never copy credentials.
    async importOriginalVisibilitySettings(force = false): Promise<boolean> {
        const marker = `fjgFileFocusDuo-visibility-v1-${this.app.vault.getName()}`;
        if (!force && localStorage.getItem(marker)) return false;
        const original = (this.app as any).plugins?.plugins?.['fjg-file-focus']?.settings;
        const keys = ['excludedExtensions', 'excludedFolders', 'hideAttachments', 'attachmentsFolderName', 'showOnlySupportedFileTypes', 'folderNote', 'showRootFolder'] as const;
        if (original) {
            for (const key of keys) {
                if (typeof original[key] === typeof this.settings[key]) (this.settings as any)[key] = original[key];
            }
        }
        // Explicitly unwanted in Franklin's device screenshot; normalize leading dots and case.
        const extensions = new Set(this.settings.excludedExtensions.split(',').map(value => value.trim().replace(/^\./, '').toLowerCase()).filter(Boolean));
        extensions.add('py'); extensions.add('pyc');
        this.settings.excludedExtensions = Array.from(extensions).join(', ');
        await this.saveSettings();
        if (original) localStorage.setItem(marker, 'imported');
        return true;
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        this.settings.focusMaxRecentFiles = Number.isFinite(this.settings.focusMaxRecentFiles)
            ? Math.max(1, this.settings.focusMaxRecentFiles)
            : DEFAULT_SETTINGS.focusMaxRecentFiles;
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async setFollowActiveFile(value: boolean) {
        this.settings.followActiveFile = value;
        window.dispatchEvent(new CustomEvent(eventTypes.followActiveFileChange, { detail: { value } }));
        await this.saveSettings();

        if (value && this.shouldFollowActiveFile()) {
            this.dispatchActiveFileChange(this.app.workspace.getActiveFile());
        }
    }

    openVaultVoice(selection = { folder: '', note: '' }): void {
        if (this.vaultVoiceModal) return;
        this.vaultVoiceModal = new VaultVoiceModal(this.app, this, selection, () => { this.vaultVoiceModal = null; });
        this.vaultVoiceModal.open();
    }

    async resolveVoiceApiKey(): Promise<string> {
        if (this.settings.liveApiKey?.trim()) return this.settings.liveApiKey.trim();
        // Called only after the user chooses the session's explicit shared-key Start button.
        // Read the saved value without invoking Objective Manager's recovery/persistence logic.
        try {
            const saved = JSON.parse(await this.app.vault.adapter.read(`${this.app.vault.configDir}/plugins/fjg-task-manager/data.json`));
            return typeof saved.openAiApiKey === 'string' ? saved.openAiApiKey.trim() : '';
        } catch { return ''; }
    }

    getMobilePerformancePolicy = (explicitlyOpened = false) =>
        getMobilePerformancePolicy({
            enabled: this.settings?.mobilePerformanceMode ?? DEFAULT_SETTINGS.mobilePerformanceMode,
            isMobile: Platform.isMobile,
            openViewOnStart: this.settings?.openViewOnStart ?? DEFAULT_SETTINGS.openViewOnStart,
            explicitlyOpened,
            mountedViewCount: this.mountedFileTreeViews.size,
        });

    isMobilePerformanceModeEnabled = () => this.getMobilePerformancePolicy().active;

    shouldBuildFolderTreeRecursively = () => this.getMobilePerformancePolicy().buildFolderTreeRecursively;

    registerMountedFileTreeView = (view: FileTreeView) => {
        this.mountedFileTreeViews.add(view);
    };

    unregisterMountedFileTreeView = (view: FileTreeView) => {
        this.mountedFileTreeViews.delete(view);
        if (this.isMobilePerformanceModeEnabled() && this.mountedFileTreeViews.size === 0) {
            this.mobileVaultChangeQueue.clear();
        }
    };

    applyMobilePerformanceModeChange = async () => {
        if (!Platform.isMobile) return;

        this.mobileVaultChangeQueue.clear();
        this.detachFileTreeLeafs();
        if (this.settings.openViewOnStart) {
            await this.openFileTreeLeaf(false);
        }
    };

    openFocusPanel = async (view: FileTreeViewMode) => {
        await this.openFileTreeLeaf(true);
        window.dispatchEvent(new CustomEvent(eventTypes.openFocusPanel, { detail: { view } }));
    };

    deleteCurrentFile = async () => {
        const commands = (this.app as any).commands;
        if (!commands?.commands?.[DELETE_CURRENT_FILE_COMMAND_ID] || !commands?.executeCommandById) {
            new Notice('Delete current file is not available.');
            return;
        }

        await Promise.resolve(commands.executeCommandById(DELETE_CURRENT_FILE_COMMAND_ID));
    };

    revealFolderPath = async (folderPath: string) => {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) {
            throw new Error(`Folder not found: ${folderPath}`);
        }

        await this.openFileTreeLeaf(true);
        for (let attempt = 0; attempt < 12 && this.folderRevealListeners.size === 0; attempt += 1) {
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }
        if (this.folderRevealListeners.size === 0) {
            throw new Error('FJG File Focus Duo view is not ready.');
        }
        this.folderRevealListeners.forEach((listener) => listener(folder));
    };

    registerFolderRevealListener = (listener: (folder: TFolder) => void) => {
        this.folderRevealListeners.add(listener);
        return () => this.folderRevealListeners.delete(listener);
    };

    bookmarksEventHandler = async (event: Event) => {
        // Find the tree-item that includes the bookmarks plugin title
        let treeItem: Element = (event.target as any).closest('.tree-item');
        if (!treeItem) return;
        // If it exists, get the title of the bookmark
        let dataPath: string = treeItem.getAttribute('data-path');
        if (!dataPath || dataPath === '') return;
        // Find the bookmark from the items
        let bookmarkItem = getBookmarkTitle(dataPath);
        // Create Custom Menu only if Shift is Used
        if ((event as any).shiftKey) {
            if (!bookmarkItem) return;
            event.stopImmediatePropagation();
            if (bookmarkItem.type === 'file') {
                await this.openFileTreeLeaf(true);
                // Dispatch Reveal File Event
                let customEvent = new CustomEvent(eventTypes.revealFile, {
                    detail: {
                        file: this.app.vault.getAbstractFileByPath(bookmarkItem.path),
                    },
                });
                window.dispatchEvent(customEvent);
            } else if (bookmarkItem.type === 'folder') {
                event.stopImmediatePropagation();
                await this.openFileTreeLeaf(true);
                // Dispatch Reveal Folder Event
                let customEvent = new CustomEvent(eventTypes.revealFolder, {
                    detail: {
                        folder: this.app.vault.getAbstractFileByPath(bookmarkItem.path),
                    },
                });
                window.dispatchEvent(customEvent);
            } else {
                new Notice('Not a file or folder');
            }
        }
    };

    getBookmarksLeafElement = (): Element => {
        return document.querySelector('.workspace-leaf-content[data-type="bookmarks"]');
    };

    bookmarksAddEventListener = () => {
        let bookmarkLeafElement = this.getBookmarksLeafElement();
        if (bookmarkLeafElement) {
            bookmarkLeafElement.addEventListener('click', this.bookmarksEventHandler, true);
        }
    };

    bookmarksRemoveEventListener = () => {
        let bookmarkLeafElement = this.getBookmarksLeafElement();
        if (bookmarkLeafElement) {
            bookmarkLeafElement.removeEventListener('click', this.bookmarksEventHandler, true);
        }
    };

    triggerVaultChangeEvent = (file: TAbstractFile, changeType: VaultChange, oldPath?: string) => {
        if (this.isConfigFile(file)) return;
        const detail: VaultChangeDetail = {
            file,
            changeType,
            oldPath: oldPath ?? '',
        };
        const policy = this.getMobilePerformancePolicy();
        if (policy.active) {
            if (!policy.dispatchViewRefreshes) return;
            if (changeType === 'modify') {
                this.mobileVaultChangeQueue.enqueue(detail);
            } else {
                this.mobileVaultChangeQueue.flush();
                window.dispatchEvent(new CustomEvent(eventTypes.vaultChanges, { detail: { changes: [detail] } }));
            }
            return;
        }

        window.dispatchEvent(new CustomEvent(eventTypes.vaultChange, { detail }));
    };

    isConfigFile(file: TAbstractFile) {
        const configDir = this.app.vault.configDir;
        return file.path === configDir || file.path.startsWith(`${configDir}/`);
    }

    onCreate = (file: TAbstractFile) => {
        this.triggerVaultChangeEvent(file, 'create', '');
        if (isMarkdownFile(file)) {
            window.setTimeout(() => {
                this.ensureManagedNoteProperties(file);
            }, 500);
        }
    };
    onDelete = (file: TAbstractFile) => this.triggerVaultChangeEvent(file, 'delete', '');
    onModify = (file: TAbstractFile) => this.triggerVaultChangeEvent(file, 'modify', '');
    onRename = (file: TAbstractFile, oldPath: string) => {
        this.triggerVaultChangeEvent(file, 'rename', oldPath);
        if (isMarkdownFile(file)) {
            this.ensureManagedNoteProperties(file);
        }
    };

    onFileOpen = (file: TFile | null) => {
        if (file) this.lastActiveFile = file;
        if (this.shouldFollowActiveFile()) this.dispatchActiveFileChange(file);
    };

    shouldFollowActiveFile = () => this.settings.followActiveFile && !Platform.isMobile;

    dispatchActiveFileChange = (file: TFile | null) => {
        if (!file) return;
        window.dispatchEvent(new CustomEvent(eventTypes.activeFileChange, { detail: { filePath: file.path } }));
    };

    ensureManagedNoteProperties = async (file: TAbstractFile) => {
        if (!isMarkdownFile(file) || this.isConfigFile(file)) return;

        try {
            await ensureNoteProperties(this, file);
        } catch (error) {
            console.error('FJG File Focus Duo note property update failed:', error);
        }
    };

    refreshIconRibbon = () => {
        this.ribbonMutationObserver?.disconnect();
        this.ribbonIconEl?.remove();
        this.inboxMorningBriefRibbonIconEl?.remove();
        if (this.settings.ribbonIcon) {
            this.ribbonIconEl = this.addRibbonIcon(this.ICON, 'FJG File Focus Duo', async () => {
                await this.openFileTreeLeaf(true);
            });
            this.inboxMorningBriefRibbonIconEl = this.addRibbonIcon('sunrise', 'Open Inbox Morning Brief', async () => {
                await this.openInboxMorningBrief();
            });
            // Do not compete with the original plugin's pinned ribbon position.
            // Both commands remain available; Obsidian owns the order of Duo's icons.
        }
    };

    openInboxMorningBrief = async () => {
        const file = this.app.vault.getAbstractFileByPath(INBOX_MORNING_BRIEF_PATH);
        if (!(file instanceof TFile)) {
            new Notice(`Inbox Morning Brief not found: ${INBOX_MORNING_BRIEF_PATH}`);
            return;
        }

        await this.app.workspace.getLeaf(this.app.workspace.activeLeaf?.view?.getViewType() === this.VIEW_TYPE).openFile(file);
    };

    openFileTreeLeaf = async (showAfterAttach: boolean) => {
        const policy = this.getMobilePerformancePolicy(showAfterAttach);
        let leafs = await this.hydrateRestoredFileTreeLeafs(policy.mountReactTree);
        for (const leaf of leafs.filter((candidate) => !this.isFileTreeViewReady(candidate))) {
            leaf.detach();
        }
        leafs = leafs.filter((leaf) => this.isFileTreeViewReady(leaf));

        if (leafs.length == 0) {
            const leaf = this.app.workspace.getLeftLeaf(false);
            if (!leaf) throw new Error('FJG File Focus Duo could not create a left-sidebar view.');
            await leaf.setViewState({ type: this.VIEW_TYPE });
            await this.hydrateFileTreeLeaf(leaf, true);
            leafs = [leaf];
        }

        if (showAfterAttach || !this.isMobilePerformanceModeEnabled()) {
            leafs.forEach((leaf) => (leaf.view as FileTreeView).activate());
        }
        if (showAfterAttach) {
            // Revealing every copy races a tab against the sidebar on mobile.
            const target = leafs.find(leaf => leaf.getRoot() === this.app.workspace.leftSplit) || leafs.find(leaf => leaf === this.app.workspace.activeLeaf) || leafs[0];
            if (Platform.isMobile) await this.app.workspace.revealLeaf(target);
            else await Promise.all(leafs.map((leaf) => this.app.workspace.revealLeaf(leaf)));
            await this.waitForFileTreeViewReady();
        }
    };

    isFileTreeViewReady = (leaf: WorkspaceLeaf) => typeof (leaf.view as FileTreeView).activate === 'function';

    hydrateFileTreeLeaf = async (leaf: WorkspaceLeaf, forceLoad = false): Promise<void> => {
        if (this.isFileTreeViewReady(leaf) || this.hydratingFileTreeLeaves.has(leaf)) return;
        if (!forceLoad) return;

        this.hydratingFileTreeLeaves.add(leaf);
        try {
            // Obsidian Mobile restores background custom tabs as DeferredView
            // instances. Explicitly load the selected File Focus tab before
            // falling back to rebinding it; otherwise its native tab can be
            // present while its content area remains blank after a cold launch.
            if (leaf.isDeferred && typeof leaf.loadIfDeferred === 'function') {
                await leaf.loadIfDeferred();
            }
            if (this.isFileTreeViewReady(leaf)) return;

            await leaf.setViewState({ type: 'empty' });
            await leaf.setViewState({ type: this.VIEW_TYPE, active: Platform.isMobile });
            if (leaf.isDeferred && typeof leaf.loadIfDeferred === 'function') {
                await leaf.loadIfDeferred();
            }
        } catch (error) {
            console.error('FJG File Focus Duo could not rehydrate a restored sidebar leaf:', error);
        } finally {
            this.hydratingFileTreeLeaves.delete(leaf);
        }
    };

    hydrateRestoredFileTreeLeafs = async (forceLoad = false): Promise<WorkspaceLeaf[]> => {
        const leafs = this.app.workspace.getLeavesOfType(this.VIEW_TYPE);
        for (const leaf of leafs) {
            await this.hydrateFileTreeLeaf(leaf, forceLoad);
        }
        return leafs;
    };

    scheduleRestoredLeafHydration = () => {
        const retryDelays = Platform.isMobile ? [0, 250, 1000, 3000, 7000, 15000] : [0, 100, 500, 1500];
        retryDelays.forEach((delay) => {
            const timeoutId = window.setTimeout((): void => {
                void this.hydrateRestoredFileTreeLeafs(this.getMobilePerformancePolicy().mountReactTree);
            }, delay);
            this.register(() => window.clearTimeout(timeoutId));
        });
    };

    waitForFileTreeViewReady = async () => {
        for (let attempt = 0; attempt < 24 && this.folderRevealListeners.size === 0; attempt += 1) {
            await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }
    };

    detachFileTreeLeafs = () => {
        let leafs = this.app.workspace.getLeavesOfType(this.VIEW_TYPE);
        for (let leaf of leafs) {
            const view = leaf.view as FileTreeView;
            if (typeof view.destroy === 'function') view.destroy();
            leaf.detach();
        }
    };

    refreshTreeLeafs = () => {
        this.detachFileTreeLeafs();
        this.openFileTreeLeaf(true);
    };
}
