import { menuPosition, trashWithFallback, DuoPreview } from 'utils/duoRuntime';
import React from 'react';
import { DuoActionsRef, FOLDER_SELECTED } from 'components/MainView/duoActions';
import Tree from 'components/FolderView/treeComponent/TreeComponent';
import FileTreeAlternativePlugin from 'main';
import ConditionalRootFolderWrapper from 'components/FolderView/ConditionalWrapper';
import { useRecoilState } from 'recoil';
import * as recoilState from 'recoil/pluginState';
import { NestedFolders } from 'components/FolderView/NestedFolders';
import { TFolder, Menu, Notice, Platform } from 'obsidian';
import { VaultChangeModal } from 'modals';
import * as Icons from 'utils/icons';
import { FolderSortType } from 'settings';
import useForceUpdate from 'hooks/ForceUpdate';
import { FolderTree, eventTypes } from 'utils/types';
import * as FileTreeUtils from 'utils/Utils';
import { LuMic } from 'react-icons/lu';

interface FolderProps {
    plugin: FileTreeAlternativePlugin;
    actionsRef?: DuoActionsRef;
    adaptive?: boolean;
}

const FOLDER_NAVIGATOR_COMMAND_ID = 'fjg-note-navigator-toolbar:open-folder-navigator';
const OMNISEARCH_COMMAND_ID = 'omnisearch:show-modal';
const VAULT_CONTROL_CENTER_COMMAND_ID = 'vault-control-center:open-vault-control-center';
const FJG_TASK_MANAGER_COMMAND_ID = 'fjg-task-manager:open-dashboard';
const AGENDA_CENTER_COMMAND_ID = 'agenda-capture:open-agenda-center';
const AI_TASK_TAGGER_PLUGIN_ID = 'ai-task-tagger';

interface ToolbarButtonProps {
    label: string;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    children: React.ReactNode;
    active?: boolean;
    disabled?: boolean;
    pressed?: boolean;
    className?: string;
}

function ToolbarButton({ label, onClick, children, active = false, disabled = false, pressed, className = '' }: ToolbarButtonProps) {
    return (
        <button
            type="button"
            className={`fjgduo-nav-action-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            disabled={disabled}
            onClick={onClick}>
            {children}
        </button>
    );
}

export function MainFolder(props: FolderProps) {
    const treeStyles = { color: 'var(--text-muted)', fill: '#c16ff7', width: '100%' };
    const plugin = props.plugin;
    const app = plugin.app;
    const rootFolder = app.vault.getRoot();

    // Global States
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [view, setView] = useRecoilState(recoilState.view);
    const [folderTree] = useRecoilState(recoilState.folderTree);
    const [focusedFolder, setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [_openFolders, setOpenFolders] = useRecoilState(recoilState.openFolders);
    const [activeOzFile] = useRecoilState(recoilState.activeOZFile);
    const [followActiveFile, setFollowActiveFile] = React.useState(plugin.settings.followActiveFile);

    React.useEffect(() => {
        const handleFollowActiveFileChange = (event: Event) => {
            setFollowActiveFile((event as CustomEvent<{ value: boolean }>).detail.value);
        };

        window.addEventListener(eventTypes.followActiveFileChange, handleFollowActiveFileChange);
        return () => window.removeEventListener(eventTypes.followActiveFileChange, handleFollowActiveFileChange);
    }, []);

    // Force Update
    const forceUpdate = useForceUpdate();

    const focusOnFolder = (folder: TFolder) => {
        setFocusedFolder(folder);
        setActiveFolderPath(folder.path);
    };

    const openFocusPanel = (panel: 'recent' | 'bookmarks') => {
        setView(panel);
    };

    const toggleFollowActiveFile = () => {
        void plugin.setFollowActiveFile(!followActiveFile);
    };

    const createFolder = (underFolder: TFolder) => {
        let vaultChangeModal = new VaultChangeModal(plugin, underFolder, 'create folder');
        vaultChangeModal.open();
    };

    const createFolderInCurrentFolder = () => {
        const activeFolder = activeFolderPath ? app.vault.getAbstractFileByPath(activeFolderPath) : null;
        if (activeFolder instanceof TFolder) {
            createFolder(activeFolder);
            return;
        }

        createFolder(focusedFolder instanceof TFolder ? focusedFolder : rootFolder);
    };

    const getSelectedFolder = () => {
        const activeFolder = activeFolderPath ? app.vault.getAbstractFileByPath(activeFolderPath) : null;
        if (activeFolder instanceof TFolder) return activeFolder;
        if (focusedFolder instanceof TFolder) return focusedFolder;
        return rootFolder;
    };

    const openVaultControlCenter = async () => {
        const commands = (app as any).commands;

        if (!commands?.executeCommandById?.(VAULT_CONTROL_CENTER_COMMAND_ID)) {
            new Notice('Enable or install the Vault Control Center plugin to use this home button.');
        }
    };

    const openTaskManagerDashboard = () => {
        const commands = (app as any).commands;

        if (!commands?.commands?.[FJG_TASK_MANAGER_COMMAND_ID] || !commands?.executeCommandById) {
            new Notice('Enable or update FJG Task Manager to open the Task Dashboard.');
            return;
        }

        commands.executeCommandById(FJG_TASK_MANAGER_COMMAND_ID);
    };

    const openAgendaCenter = () => {
        const commands = (app as any).commands;

        if (!commands?.commands?.[AGENDA_CENTER_COMMAND_ID] || !commands?.executeCommandById) {
            new Notice('Enable or update Agenda Capture to open the Agenda Center.');
            return;
        }

        commands.executeCommandById(AGENDA_CENTER_COMMAND_ID);
    };

    const openUniversalDashboard = () => {
        const dashboard = (app as any).plugins?.getPlugin?.('universal-use-dashboard');
        if (!dashboard?.openDashboard) {
            new Notice('Enable FJG Universal Dashboard to open the selected folder as a dashboard.');
            return;
        }
        void dashboard.openDashboard(getSelectedFolder()).catch((error: Error) => new Notice(error.message));
    };

    const reviewSelectedFolderTags = () => {
        const aiTaskTagger = (app as any).plugins?.getPlugin?.(AI_TASK_TAGGER_PLUGIN_ID);

        if (!aiTaskTagger?.openFolderBatch) {
            new Notice('Enable or update AI Task Tagger to review tags for the selected folder.');
            return;
        }

        aiTaskTagger.openFolderBatch(getSelectedFolder());
    };

    const handleRootFolderContextMenu = (event: MouseEvent, folder: TFolder) => {
        // Event Undefined Correction
        let e = event;
        if (event === undefined) e = window.event as MouseEvent;

        // Menu Items
        const folderMenu = new Menu();

        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('New Folder')
                .setIcon('folder')
                .onClick((ev: MouseEvent) => createFolder(folder));
        });

        if (!props.adaptive && !folder.isRoot()) {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Focus Back to Root')
                    .setIcon('fjgduo-zoomOutDoubleIcon')
                    .onClick(() => focusOnFolder(rootFolder));
            });
        }

        if (!props.adaptive && folder.parent && !folder.parent.isRoot() && folder.parent !== focusedFolder) {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Focus to Parent Folder')
                    .setIcon('fjgduo-zoomOutIcon')
                    .onClick(() => focusOnFolder(folder.parent));
            });
        }

        // Trigger
        app.workspace.trigger('root-folder-menu', folderMenu, folder);
        folderMenu.showAtPosition(menuPosition(e));
        return false;
    };

    // --> Collapse, Expland Button Functions
    const collapseAllFolders = () => setOpenFolders([]);

    const explandAllFolders = () => {
        let newOpenFolders: string[] = [];
        const treeToExpand = plugin.isMobilePerformanceModeEnabled()
            ? FileTreeUtils.createFolderTree({
                  startFolder: focusedFolder,
                  plugin,
                  excludedFolders: FileTreeUtils.settingListToArray(plugin.settings.excludedFolders),
                  recursive: true,
              })
            : folderTree;

        if (!treeToExpand) return;

        newOpenFolders.push(treeToExpand.folder.path);

        const recursiveFx = (folderTreeChildren: FolderTree[]) => {
            for (let folderTreeChild of folderTreeChildren) {
                newOpenFolders.push(folderTreeChild.folder.path);
                if (folderTreeChild.children.length > 0) {
                    recursiveFx(folderTreeChild.children);
                }
            }
        };

        recursiveFx(treeToExpand.children);
        setOpenFolders(newOpenFolders);
    };

    const triggerFolderSortOptions = (e: React.MouseEvent) => {
        const sortMenu = new Menu();

        const changeSortSettingTo = (newValue: FolderSortType) => {
            plugin.settings.sortFoldersBy = newValue;
            plugin.saveSettings();
            forceUpdate();
        };

        sortMenu.addItem((menuItem) => {
            menuItem.setTitle('Folder Name (A to Z)');
            menuItem.onClick((ev: MouseEvent) => {
                changeSortSettingTo('name');
            });
        });

        if (plugin.settings.folderCount) {
            sortMenu.addItem((menuItem) => {
                menuItem.setTitle('Item Numbers (Bigger to Smaller)');
                menuItem.onClick((ev: MouseEvent) => {
                    changeSortSettingTo('item-number');
                });
            });
        }

        // Trigger
        plugin.app.workspace.trigger('sort-menu', sortMenu);
        sortMenu.showAtPosition(menuPosition(e));
        return false;
    };

    const openFolderNavigator = () => {
        const commands = (app as any).commands;
        if (!commands?.commands?.[FOLDER_NAVIGATOR_COMMAND_ID] || !commands?.executeCommandById) {
            new Notice('Enable or update FJG Note Navigator Toolbar to open Folder Navigator.');
            return;
        }
        commands.executeCommandById(FOLDER_NAVIGATOR_COMMAND_ID);
    };

    const openOmnisearch = () => {
        const commands = (plugin.app as any).commands;

        if (!commands?.commands?.[OMNISEARCH_COMMAND_ID] || !commands?.executeCommandById) {
            new Notice('Omnisearch command is not available.');
            return;
        }

        commands.executeCommandById(OMNISEARCH_COMMAND_ID);
    };

    const copySelectedVaultFolderPath = async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        const folderPath = activeOzFile?.parent?.path || activeFile?.parent?.path || activeFolderPath;

        if (!folderPath) {
            new Notice('Select a note first.');
            return;
        }

        const copyPath = folderPath === '/' ? '/' : folderPath;
        try {
            await navigator.clipboard.writeText(copyPath);
            new Notice(`Copied folder path: ${copyPath}`);
        } catch (error) {
            new Notice(`Could not copy folder path: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleFolderNameDoubleClick = (folder: TFolder) => {
        if (!folder.isRoot()) focusOnFolder(folder.parent);
    };

    if (props.actionsRef) props.actionsRef.current = [
        { id: 'home', title: 'Open Vault Control Center', run: openVaultControlCenter },
        { id: 'brief', title: 'Open Inbox Morning Brief', run: () => plugin.openInboxMorningBrief() },
        { id: 'tasks', title: 'Open FJG Task Manager Dashboard', run: openTaskManagerDashboard },
        { id: 'agenda', title: 'Open Agenda Center', run: openAgendaCenter },
        { id: 'voice', title: 'Talk to your vault', run: () => plugin.openVaultVoice({folder: getSelectedFolder().path, note: activeOzFile?.path || ''}) },
        { id: 'dashboard', title: 'Open selected folder dashboard', run: openUniversalDashboard },
        { id: 'new-folder', title: 'New Folder', run: createFolderInCurrentFolder },
        { id: 'folder-tags', title: 'Review Selected Folder Tags with AI', run: reviewSelectedFolderTags },
        { id: 'folder-navigator', title: 'Open Folder Navigator', run: openFolderNavigator },
        { id: 'omnisearch', title: 'Open Omnisearch', run: openOmnisearch },
        { id: 'follow', title: `Follow active note: ${followActiveFile ? 'on' : 'off'}`, run: () => Platform.isMobile ? new Notice('Follow active note is desktop-only. Use Reveal Active File from the command palette.') : toggleFollowActiveFile() },
        { id: 'folder-sort', title: 'Folder sorting options', run: triggerFolderSortOptions },
        { id: 'folder-path', title: 'Copy Selected Note Folder Path', run: copySelectedVaultFolderPath },
        { id: 'collapse', title: 'Collapse all folders', run: collapseAllFolders },
        { id: 'expand', title: 'Expand all folders', run: explandAllFolders },
    ];

    return (
        <div className="fjgduo-folders-tree-wrapper">
            {!props.adaptive && <div className="fjgduo-folders-action-items fjgduo-tree-header-fixed">
                <ToolbarButton label="Open Vault Control Center" onClick={() => void openVaultControlCenter()}>
                    <Icons.FaHome />
                </ToolbarButton>
                <ToolbarButton
                    label="Open Inbox Morning Brief"
                    onClick={(): void => {
                        void plugin.openInboxMorningBrief();
                    }}>
                    <Icons.SunriseIcon />
                </ToolbarButton>
                <ToolbarButton label="Open FJG Task Manager Dashboard" onClick={openTaskManagerDashboard}>
                    <Icons.LuListChecks />
                </ToolbarButton>
                <ToolbarButton label="Open Agenda Center" onClick={openAgendaCenter} className="fjg-agenda-center-button">
                    <Icons.MdEventNote />
                </ToolbarButton>
                <ToolbarButton
                    label="Talk to your vault with GPT-Live"
                    className="fjg-vault-voice-button"
                    onClick={() => plugin.openVaultVoice({ folder: getSelectedFolder().path, note: activeOzFile?.path || '' })}>
                    <LuMic aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton label="Open selected folder dashboard" onClick={openUniversalDashboard}>
                    <Icons.LuLayoutDashboard />
                </ToolbarButton>
                <ToolbarButton label="Create Folder in Current Folder" onClick={() => createFolderInCurrentFolder()}>
                    <Icons.MdOutlineCreateNewFolder />
                </ToolbarButton>
                <ToolbarButton label="Review Selected Folder Tags with AI" onClick={reviewSelectedFolderTags}>
                    <Icons.FaTags />
                </ToolbarButton>
                <ToolbarButton label="Open Omnisearch" onClick={openOmnisearch}>
                    <Icons.IoIosSearch />
                </ToolbarButton>
                <ToolbarButton
                    label={Platform.isMobile ? 'Follow active note is available on desktop' : `Follow active note: ${followActiveFile ? 'on' : 'off'}`}
                    onClick={toggleFollowActiveFile}
                    active={followActiveFile}
                    pressed={followActiveFile}
                    disabled={Platform.isMobile}
                    className="fjg-follow-active-note-button">
                    <Icons.BiCurrentLocation />
                </ToolbarButton>
                <ToolbarButton label="Sorting Options" onClick={triggerFolderSortOptions}>
                    <Icons.CgSortAz />
                </ToolbarButton>
                <ToolbarButton label="Recent Notes" onClick={() => openFocusPanel('recent')} active={view === 'recent'}>
                    <Icons.FaHistory />
                </ToolbarButton>
                <ToolbarButton label="Bookmarks" onClick={() => openFocusPanel('bookmarks')} active={view === 'bookmarks'}>
                    <Icons.FaRegBookmark />
                </ToolbarButton>
                <ToolbarButton label="Copy Selected Note Folder Path" onClick={() => void copySelectedVaultFolderPath()}>
                    <Icons.BiCopy />
                </ToolbarButton>
                <ToolbarButton label="Collapse Folders" onClick={collapseAllFolders}>
                    <Icons.CgChevronDoubleUp />
                </ToolbarButton>
                <ToolbarButton label="Expand Folders" onClick={explandAllFolders}>
                    <Icons.CgChevronDoubleDown />
                </ToolbarButton>
            </div>}
            <ConditionalRootFolderWrapper
                condition={(focusedFolder && !focusedFolder.isRoot()) || (focusedFolder && focusedFolder.isRoot && plugin.settings.showRootFolder)}
                wrapper={(children) => {
                    return (
                        <Tree
                            plugin={plugin}
                            content={focusedFolder.isRoot() ? plugin.app.vault.getName() : focusedFolder.name}
                            open
                            isRootFolder={focusedFolder.isRoot()}
                            style={treeStyles}
                            onClick={() => {setActiveFolderPath(focusedFolder.path); window.dispatchEvent(new CustomEvent(FOLDER_SELECTED,{detail:focusedFolder}));}}
                            onDoubleClick={() => handleFolderNameDoubleClick(focusedFolder)}
                            folder={focusedFolder}
                            onContextMenu={(e: MouseEvent) => handleRootFolderContextMenu(e, focusedFolder)}>
                            {children}
                        </Tree>
                    );
                }}>
                {folderTree && <NestedFolders plugin={plugin} folderTree={folderTree} />}
            </ConditionalRootFolderWrapper>
        </div>
    );
}
