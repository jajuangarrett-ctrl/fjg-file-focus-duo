import FileTreeAlternativePlugin from './main';
import { PluginSettingTab, Setting, App, Notice } from 'obsidian';
import { LocalStorageHandler } from '@ozntel/local-storage-handler';
import { eventTypes } from 'utils/types';
import { DEFAULT_MOBILE_PERFORMANCE_MODE } from './mobilePerformance';

type FolderIcon = 'default' | 'box-folder' | 'icomoon' | 'typicon' | 'circle-gg';
export type SortType = 'name' | 'last-update' | 'created' | 'file-size';
export type FolderSortType = 'name' | 'item-number';
export type DeleteFileOption = 'trash' | 'permanent' | 'system-trash';
export type EvernoteViewOption = 'Disabled' | 'Horizontal' | 'Vertical';

const DEFAULT_EXCLUDED_FOLDERS = ['AI Team/_codex_task_logs', 'Artifacts/Agent Mission Control/runner-logs'].join(', ');

export interface FileTreeAlternativePluginSettings {
    liveApiKey: string;
    liveBackendModel: string;
    openViewOnStart: boolean;
    mobilePerformanceMode: boolean;
    ribbonIcon: boolean;
    followActiveFile: boolean;
    showRootFolder: boolean;
    showFilesFromSubFolders: boolean;
    showOnlySupportedFileTypes: boolean;
    searchFunction: boolean;
    allSearchOnlyInFocusedFolder: boolean;
    showFilesFromSubFoldersButton: boolean;
    revealActiveFileButton: boolean;
    excludedExtensions: string;
    excludedFolders: string;
    hideAttachments: boolean;
    attachmentsFolderName: string;
    folderIcon: FolderIcon;
    colorfulFolders: boolean;
    folderCount: boolean;
    folderCountOption: string;
    duoColumnWidth: number;
    duoDesktopLegacyLayout: boolean;
    evernoteView: EvernoteViewOption;
    filePreviewOnHover: boolean;
    iconBeforeFileName: boolean;
    sortFilesBy: SortType;
    sortReverse: boolean;
    sortFoldersBy: FolderSortType;
    fixedHeaderInFileList: boolean;
    createdYaml: boolean;
    fileNameIsHeader: boolean;
    folderNote: boolean;
    deleteFileOption: DeleteFileOption;
    showFileNameAsFullPath: boolean;
    bookmarksEvents: boolean;
    focusMaxRecentFiles: number;
    focusShowPaths: boolean;
    focusOpenInNewTab: boolean;
}

export const DEFAULT_SETTINGS: FileTreeAlternativePluginSettings = {
    liveApiKey: '',
    liveBackendModel: 'gpt-5.6-terra',
    openViewOnStart: true,
    mobilePerformanceMode: DEFAULT_MOBILE_PERFORMANCE_MODE,
    ribbonIcon: true,
    followActiveFile: true,
    showRootFolder: true,
    showFilesFromSubFolders: true,
    showOnlySupportedFileTypes: false,
    searchFunction: true,
    allSearchOnlyInFocusedFolder: false,
    showFilesFromSubFoldersButton: true,
    revealActiveFileButton: false,
    excludedExtensions: '',
    excludedFolders: DEFAULT_EXCLUDED_FOLDERS,
    hideAttachments: false,
    attachmentsFolderName: 'attachments',
    folderIcon: 'default',
    colorfulFolders: false,
    folderCount: true,
    folderCountOption: 'notes',
    duoColumnWidth: 560,
    duoDesktopLegacyLayout: false,
    evernoteView: 'Vertical',
    filePreviewOnHover: false,
    iconBeforeFileName: true,
    sortFilesBy: 'name',
    sortReverse: false,
    sortFoldersBy: 'name',
    fixedHeaderInFileList: true,
    createdYaml: false,
    fileNameIsHeader: false,
    folderNote: false,
    deleteFileOption: 'trash',
    showFileNameAsFullPath: false,
    bookmarksEvents: false,
    focusMaxRecentFiles: 30,
    focusShowPaths: true,
    focusOpenInNewTab: true,
};

export class FileTreeAlternativePluginSettingsTab extends PluginSettingTab {
    plugin: FileTreeAlternativePlugin;

    constructor(app: App, plugin: FileTreeAlternativePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    refreshView() {
        let evt = new CustomEvent(eventTypes.refreshView, {});
        window.dispatchEvent(evt);
    }

    display(): void {
        let { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setName('Duo two-column minimum width').setDesc('Panel width in CSS pixels. 560 separates the four measured Duo layouts; tune after device testing.').addText(text => text.setValue(String(this.plugin.settings.duoColumnWidth)).onChange(async value => { const width = Number(value); if (Number.isFinite(width) && width >= 440 && width <= 1000) { this.plugin.settings.duoColumnWidth = width; await this.plugin.saveSettings(); this.refreshView(); } }));
        new Setting(containerEl).setName('Use legacy desktop layout').setDesc('Desktop only. Restore the Evernote layout setting below. Mobile always uses the adaptive navigator.').addToggle(toggle => toggle.setValue(this.plugin.settings.duoDesktopLegacyLayout).onChange(async value => { this.plugin.settings.duoDesktopLegacyLayout = value; await this.plugin.saveSettings(); this.refreshView(); }));

        new Setting(containerEl).setName('Vault voice API key').setDesc('Optional. Stored in plain text in this plugin’s data.json. Leave empty to use the existing device key without copying it here.')
            .addText((text) => { text.inputEl.type = 'password'; text.setValue(this.plugin.settings.liveApiKey).onChange(async (value) => {
                this.plugin.settings.liveApiKey = value.trim(); await this.plugin.saveSettings();
            }); });
        new Setting(containerEl).setName('Vault voice backend model').setDesc('GPT-Live-1 handles speech; this model searches and edits notes.')
            .addText((text) => text.setValue(this.plugin.settings.liveBackendModel).onChange(async (value) => {
                this.plugin.settings.liveBackendModel = value.trim() || 'gpt-5.6-terra'; await this.plugin.saveSettings();
            }));

        let lsh = new LocalStorageHandler({});

        /* ------------- Buy Me a Coffee ------------- */

        const coffeeDiv = containerEl.createDiv('coffee');
        coffeeDiv.addClass('fjgduo-coffee-div');
        const coffeeLink = coffeeDiv.createEl('a', { href: 'https://ko-fi.com/L3L356V6Q' });
        const coffeeImg = coffeeLink.createEl('img', {
            attr: {
                src: 'https://cdn.ko-fi.com/cdn/kofi2.png?v=3',
            },
        });
        coffeeImg.height = 45;

        /* ------------- General Settings ------------- */

        containerEl.createEl('h2', { text: 'General' });

        new Setting(containerEl)
            .setName('Evernote View')
            .setDesc('Turn on if you want to see the folders and files in a single view without switching between views. Similar experience to Evernote.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('Disabled', 'Disabled')
                    .addOption('Horizontal', 'Horizontal')
                    .addOption('Vertical', 'Vertical')
                    .setValue(this.plugin.settings.evernoteView)
                    .onChange((value: EvernoteViewOption) => {
                        this.plugin.settings.evernoteView = value;
                        this.plugin.saveSettings();
                        this.refreshView();
                    });
            });

        new Setting(containerEl)
            .setName('Ribbon Icon')
            .setDesc('Turn on if you want Ribbon Icon for activating the File Tree.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.ribbonIcon).onChange((value) => {
                    this.plugin.settings.ribbonIcon = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshIconRibbon();
                })
            );

        new Setting(containerEl)
            .setName('Open on Start')
            .setDesc('Open and show File Focus during startup on desktop and mobile.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.openViewOnStart).onChange((value) => {
                    this.plugin.settings.openViewOnStart = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Bookmarks Event Listener (Shift + Click)')
            .setDesc(
                'This will enable to reveal file or folder from core bookmarks plugin.' +
                    'Because there is no API yet to overwrite the default behaviour for Bookmarks plugin,' +
                    'this will add an event to reveal file if you click on bookmark name using shift'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.bookmarksEvents).onChange((value) => {
                    this.plugin.settings.bookmarksEvents = value;
                    if (value) {
                        this.plugin.bookmarksAddEventListener();
                    } else {
                        this.plugin.bookmarksRemoveEventListener();
                    }
                    this.plugin.saveSettings();
                })
            );

        containerEl.createEl('h2', { text: 'FJG File Focus Duo' });

        new Setting(containerEl)
            .setName('Mobile performance mode')
            .setDesc(
                'Mobile only. Keeps File Focus unmounted during startup, builds deeper folders only as you open them, and groups live refreshes. The change is immediate: the mobile panel closes, then you can reopen it from the ribbon or command. Desktop behavior is unchanged.'
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.mobilePerformanceMode).onChange(async (value) => {
                    this.plugin.settings.mobilePerformanceMode = value;
                    await this.plugin.saveSettings();
                    await this.plugin.applyMobilePerformanceModeChange();
                    new Notice(
                        value
                            ? 'Mobile performance mode is on. Reopen File Focus when you need it.'
                            : 'Mobile performance mode is off. The standard File Focus behavior is restored.'
                    );
                })
            );

        new Setting(containerEl)
            .setName('Follow active note')
            .setDesc('Automatically show and select the open note on desktop. Mobile following remains disabled for stability.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.followActiveFile).onChange(async (value) => {
                    await this.plugin.setFollowActiveFile(value);
                })
            );

        new Setting(containerEl)
            .setName('Max recent notes')
            .setDesc('How many recently opened notes and canvases to show in the File Focus recent panel.')
            .addText((text) => {
                text.inputEl.type = 'number';
                text.setPlaceholder(String(DEFAULT_SETTINGS.focusMaxRecentFiles))
                    .setValue(String(this.plugin.settings.focusMaxRecentFiles))
                    .onChange((value) => {
                        const parsed = Number.parseInt(value, 10);
                        this.plugin.settings.focusMaxRecentFiles = Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_SETTINGS.focusMaxRecentFiles;
                        this.plugin.saveSettings();
                        this.refreshView();
                    });
            });

        new Setting(containerEl)
            .setName('Show paths in focus panels')
            .setDesc('Show vault paths under recent notes and bookmarks.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.focusShowPaths).onChange((value) => {
                    this.plugin.settings.focusShowPaths = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Open focus items in new tabs')
            .setDesc('Open recent notes and bookmark files in a new Obsidian tab.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.focusOpenInNewTab).onChange((value) => {
                    this.plugin.settings.focusOpenInNewTab = value;
                    this.plugin.saveSettings();
                })
            );

        /* ------------- Folder Pane Settings ------------- */

        containerEl.createEl('h2', { text: 'Folder Pane Settings' });

        new Setting(containerEl)
            .setName('Folder Icons')
            .setDesc('Change the default folder icons your preferred option')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('default', 'Default')
                    .addOption('box-folder', 'Box Icons')
                    .addOption('icomoon', 'IcoMoon Icons')
                    .addOption('typicon', 'Typicons')
                    .addOption('circle-gg', 'Circle GG')
                    .setValue(this.plugin.settings.folderIcon)
                    .onChange((value: FolderIcon) => {
                        this.plugin.settings.folderIcon = value;
                        this.plugin.saveSettings();
                        this.refreshView();
                    });
            });

        new Setting(containerEl)
            .setName('Colorful folders')
            .setDesc('Use the bundled Pastel Dreams folder colors inside the FJG File Focus Duo folder pane.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.colorfulFolders).onChange((value) => {
                    this.plugin.settings.colorfulFolders = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Show Root Folder')
            .setDesc(`Turn on if you want your Root Folder "${this.plugin.app.vault.getName()}" to be visible in the file tree`)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showRootFolder).onChange((value) => {
                    this.plugin.settings.showRootFolder = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Folder Count')
            .setDesc('Turn on if you want see the number of notes/files under file tree.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.folderCount).onChange((value) => {
                    this.plugin.settings.folderCount = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshTreeLeafs();
                })
            );

        new Setting(containerEl)
            .setName('Folder Count Details')
            .setDesc('Select which files you want to be included into count')
            .addDropdown((dropdown) => {
                dropdown.addOption('notes', 'Notes');
                dropdown.addOption('files', 'All Files');
                dropdown.setValue(this.plugin.settings.folderCountOption);
                dropdown.onChange((option) => {
                    this.plugin.settings.folderCountOption = option;
                    this.plugin.saveSettings();
                    this.refreshView();
                });
            });

        new Setting(containerEl)
            .setName('Folder Note')
            .setDesc(
                `Turn this option on if you want to create Folder Note same as Folder Note Plugin. 
                By default, Click will open the list of files. You need to use "Shift+Click" to open the folder note. If folder has a folder note, 
                you will see an arrow icon on the right side of folder. The note created as a folder note is hidden in the file list.`
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.folderNote).onChange((value) => {
                    this.plugin.settings.folderNote = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                });
            });

        /* ------------- File Pane Settings ------------- */
        containerEl.createEl('h2', { text: 'File Pane Settings' });

        new Setting(containerEl)
            .setName('Include Files From Subfolders to the File List')
            .setDesc(`Turn on this option if you want to see the list of files from all subfolders in addition to the selected folder`)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showFilesFromSubFolders).onChange((value) => {
                    this.plugin.settings.showFilesFromSubFolders = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Toggle Button for Include Files from Subfolders')
            .setDesc(`Turn on this option if you want to have an additional button on the top of the file list to toggle "Include Files From Subfolders"`)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showFilesFromSubFoldersButton).onChange((value) => {
                    this.plugin.settings.showFilesFromSubFoldersButton = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Only show supported document file types')
            .setDesc('When enabled, the file pane only shows Markdown and Bases dashboards plus supported document, spreadsheet, web, ebook, and Excalidraw files.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.showOnlySupportedFileTypes).onChange((value) => {
                    this.plugin.settings.showOnlySupportedFileTypes = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshTreeLeafs();
                })
            );

        new Setting(containerEl)
            .setName('Reveal Active File in File Tree Button')
            .setDesc(
                `Turn on this option if you want to have an additional button to reveal the active file in the file tree. It will set the folder and file pane accordingly.`
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.revealActiveFileButton).onChange((value) => {
                    this.plugin.settings.revealActiveFileButton = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Search in File List')
            .setDesc(`Turn on this option if you want to enable search function to filter files by name.`)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.searchFunction).onChange((value) => {
                    this.plugin.settings.searchFunction = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('All & Tag Search only in Focused Folder')
            .setDesc(
                `"all:" and "tag:" searches by default looks for all files in your vault. Turn on this option if you want search only in Focused Folder`
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.allSearchOnlyInFocusedFolder).onChange((value) => {
                    this.plugin.settings.allSearchOnlyInFocusedFolder = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Icon Before File Name')
            .setDesc('Turn on if you want to file icon before the file name in the file list.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.iconBeforeFileName).onChange((value) => {
                    this.plugin.settings.iconBeforeFileName = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Preview File on Hover')
            .setDesc('Turn on if you want to preview the files once you hover on them within the file list holding Ctrl/Cmd button.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.filePreviewOnHover).onChange((value) => {
                    this.plugin.settings.filePreviewOnHover = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Fixed Buttons and Header in File Pane')
            .setDesc('Turn on if you want buttons and header to be not scrolled within the file list.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.fixedHeaderInFileList).onChange((value) => {
                    this.plugin.settings.fixedHeaderInFileList = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                })
            );

        new Setting(containerEl)
            .setName('Show file names as full path')
            .setDesc('Turn on if you want to see the full path within the file name list rather than only file name')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.showFileNameAsFullPath).onChange((value) => {
                    this.plugin.settings.showFileNameAsFullPath = value;
                    this.plugin.saveSettings();
                    this.refreshView();
                });
            });

        new Setting(containerEl)
            .setName('Deleted File Destination')
            .setDesc('Select where you want files to be moved once they are deleted')
            .addDropdown((dropdown) => {
                dropdown.addOption('permanent', 'Delete Permanently');
                dropdown.addOption('trash', 'Move to Obsidian Trash');
                dropdown.addOption('system-trash', 'Move to System Trash');
                dropdown.setValue(this.plugin.settings.deleteFileOption);
                dropdown.onChange((option: DeleteFileOption) => {
                    this.plugin.settings.deleteFileOption = option;
                    this.plugin.saveSettings();
                });
            });

        /* ------------- Exclusion Settings ------------- */
        containerEl.createEl('h2', { text: 'File Creation' });

        containerEl.createEl('p', { text: 'The settings below are only applicable if the plus (+) button within the file pane of the plugin is used.' });

        new Setting(containerEl)
            .setName('Created information in YAML')
            .setDesc('Turn on if you want plugin to include created YAML key with the time of creation')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.createdYaml).onChange((value) => {
                    this.plugin.settings.createdYaml = value;
                    this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Set File Name as Header 1')
            .setDesc('Turn on if you want plugin to add the initial file name as main header in the created file.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.fileNameIsHeader).onChange((value) => {
                    this.plugin.settings.fileNameIsHeader = value;
                    this.plugin.saveSettings();
                });
            });

        /* ------------- Exclusion Settings ------------- */

        containerEl.createEl('h2', { text: 'Exclude Settings' });

        new Setting(containerEl)
            .setName('Hide Attachments')
            .setDesc(`It will hide "attachments" folder from the view and any file under this folder from the file list`)
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.hideAttachments).onChange((value) => {
                    this.plugin.settings.hideAttachments = value;
                    this.plugin.saveSettings();
                    this.plugin.refreshTreeLeafs();
                })
            );

        new Setting(containerEl)
            .setName('Excluded File Extensions')
            .setDesc(
                `Provide extension of files, which you want to exclude from listing in file tree, divided by comma. i.e. 'png, pdf, jpeg'.
            You need to reload the vault or use "Reload File Tree" button below to make changes effective.`
            )
            .addTextArea((text) =>
                text.setValue(this.plugin.settings.excludedExtensions).onChange((value) => {
                    this.plugin.settings.excludedExtensions = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Excluded Folder Paths')
            .setDesc(
                `Provide full path of folders, which you want to exclude from listing in file tree, divided by comma. i.e. 'Personal/Attachments, Work/Documents/Folders'.
            All subfolders are going to be excluded, as well. You need to reload the vault or use "Reload File Tree" button below to make changes effective.`
            )
            .addTextArea((text) =>
                text.setValue(this.plugin.settings.excludedFolders).onChange((value) => {
                    this.plugin.settings.excludedFolders = value;
                    this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setDesc(
                'Use this button to reload the file tree. Reloading the file tree is required for some of the settings. You can also restart your vault to have same effect.'
            )
            .addButton((button) => {
                button
                    .setClass('reload-fjgduo-tree-button')
                    .setTooltip('Click here to reload the file tree')
                    .setButtonText('Reload File Tree')
                    .onClick((e) => {
                        this.plugin.refreshTreeLeafs();
                    });
            });

        /* ------------- Clear Data ------------- */
        containerEl.createEl('h2', { text: 'Clear Data' });

        new Setting(containerEl)
            .setName('Clear All Cache Data')
            .setDesc(
                `This button will clear the following cache data: "Last position of the divider" & "List of expanded folders in the folder pane", 
                & "Last active folder path". It will not touch your settings above and list of pinned files. It is recommended to do this clearing once in a while.`
            )
            .addButton((button) => {
                let b = button
                    .setTooltip('Click here to clear the cache data')
                    .setButtonText('Click for Clearing the Cache')
                    .onClick(async () => {
                        localStorage.removeItem('fjgFileFocusDuo-column-ratio');
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.customHeightKey });
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.customWidthKey });
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.openFoldersKey });
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.activeFolderPathKey });
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.focusedFolder });
                        this.plugin.refreshTreeLeafs();
                        new Notice('The plugin cache is cleared...');
                    });
            });

        new Setting(containerEl)
            .setName('Clear Pinned Files')
            .setDesc(`This button will clear the pinned files in the file list pane.`)
            .addButton((button) => {
                let b = button
                    .setTooltip('Click here to clear the pinned files')
                    .setButtonText('Click for Clearing the Pinned files')
                    .onClick(async () => {
                        lsh.removeFromLocalStorage({ key: this.plugin.keys.pinnedFilesKey });
                        this.plugin.refreshTreeLeafs();
                        new Notice('The pinned files are cleared...');
                    });
            });
    }
}
