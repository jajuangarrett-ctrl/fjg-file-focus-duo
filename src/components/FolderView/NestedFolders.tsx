import { menuPosition, trashWithFallback, DuoPreview } from 'utils/duoRuntime';
import { FOLDER_SELECTED } from 'components/MainView/duoActions';
import React, { useMemo } from 'react';
import { TFolder, Menu, Notice } from 'obsidian';
import { FolderTree } from 'utils/types';
import FileTreeAlternativePlugin from 'main';
import Tree from 'components/FolderView/treeComponent/TreeComponent';
import { useRecoilState } from 'recoil';
import * as recoilState from 'recoil/pluginState';
import * as Util from 'utils/Utils';
import { VaultChangeModal, MoveSuggestionModal, ConfirmationModal } from 'modals';
import * as newFileUtils from 'utils/newFile';

interface NestedFoldersProps {
    plugin: FileTreeAlternativePlugin;
    folderTree: FolderTree;
}

export function NestedFolders(props: NestedFoldersProps) {
    const plugin = props.plugin;
    const app = plugin.app;
    let rootFolder = app.vault.getRoot();

    // Global States
    const [openFolders] = useRecoilState(recoilState.openFolders);
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [excludedFolders, setExcludedFolders] = useRecoilState(recoilState.excludedFolders);
    const [focusedFolder, setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [, setTopFolderFocus] = useRecoilState(recoilState.topFolderFocus);
    const [folderFileCountMap] = useRecoilState(recoilState.folderFileCountMap);
    const [_view, setView] = useRecoilState(recoilState.view);

    const handleFolderNameClick = (folderPath: string) => {
        setActiveFolderPath(folderPath);
        window.dispatchEvent(new CustomEvent(FOLDER_SELECTED, {detail: app.vault.getAbstractFileByPath(folderPath)}));
    };

    const focusOnFolder = (folder: TFolder) => {
        setTopFolderFocus(!folder.isRoot());
        setFocusedFolder(folder);
        setActiveFolderPath(folder.path);
    };

    const getSortedFolderTree = (folderTree: FolderTree[]) => {
        let newTree: FolderTree[] = [...folderTree];
        newTree = newTree.sort((a, b) => {
            if (plugin.settings.sortFoldersBy === 'name') {
                return a.folder.name.localeCompare(b.folder.name, 'en', { numeric: true });
            } else if (plugin.settings.sortFoldersBy === 'item-number') {
                let aCount = folderFileCountMap[a.folder.path] ? folderFileCountMap[a.folder.path].closed : 0;
                let bCount = folderFileCountMap[b.folder.path] ? folderFileCountMap[b.folder.path].closed : 0;
                return bCount - aCount;
            }
        });
        return newTree;
    };

    const handleFolderContextMenu = (params: { event: MouseEvent | TouchEvent; folder: TFolder }) => {
        let { event, folder } = params;

        // Event Undefined Correction
        let e = event;
        if (event === undefined) e = window.event as MouseEvent;

        // Menu Items
        const folderMenu = new Menu();

        // Focus Items
        if (Util.hasChildFolder(folder)) {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Focus on Folder')
                    .setIcon('fjgduo-zoomInIcon')
                    .onClick(() => focusOnFolder(folder));
            });
        }

        if (!focusedFolder.isRoot()) {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Focus Back to Root')
                    .setIcon('fjgduo-zoomOutIcon')
                    .onClick(() => focusOnFolder(rootFolder));
            });
        }

        // CRUD Items
        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('New Folder')
                .setIcon('folder')
                .onClick((ev: MouseEvent) => {
                    let vaultChangeModal = new VaultChangeModal(plugin, folder, 'create folder');
                    vaultChangeModal.open();
                });
        });

        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('Delete')
                .setIcon('trash')
                .onClick((ev: MouseEvent) => {
                    let confirmationModal = new ConfirmationModal(
                        plugin,
                        `Are you sure you want to delete folder "${folder.name}" and all folders & files under it?`,
                        () => {
                            let deleteOption = plugin.settings.deleteFileOption;
                            if (deleteOption === 'permanent') {
                                plugin.app.vault.delete(folder, true);
                            } else if (deleteOption === 'system-trash') {
                                trashWithFallback(plugin.app, folder, true);
                            } else if (deleteOption === 'trash') {
                                trashWithFallback(plugin.app, folder, false);
                            }
                            if (activeFolderPath === folder.path) {
                                setActiveFolderPath('');
                                setView('folder');
                            }
                        }
                    );
                    confirmationModal.open();
                });
        });

        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('Rename')
                .setIcon('pencil')
                .onClick((ev: MouseEvent) => {
                    let vaultChangeModal = new VaultChangeModal(plugin, folder, 'rename');
                    vaultChangeModal.open();
                });
        });

        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('New File')
                .setIcon('document')
                .onClick((ev: MouseEvent) => {
                    Util.createNewFile(ev as unknown as React.MouseEvent<Element, MouseEvent>, folder.path, plugin);
                });
        });

        // Move Item
        {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Move folder to...')
                    .setIcon('paper-plane')
                    .onClick((ev: MouseEvent) => {
                        let folderMoveModal = new MoveSuggestionModal(app, folder);
                        folderMoveModal.open();
                    });
            });
        }

        folderMenu.addItem((menuItem) => {
            menuItem
                .setTitle('Add to Excluded Folders')
                .setIcon('switch')
                .onClick((ev: MouseEvent) => {
                    setExcludedFolders([...excludedFolders, folder.path]);
                });
        });

        // Folder Note Open & Create & Delete (If folder note loaded, avoid duplicate create, delete buttons)
        const folderNotePath = `${folder.path}/${folder.name}.md`;
        let folderNoteExists = folder.children.some((f) => `${folder.name}.md` === f.name);

        if (folderNoteExists) {
            folderMenu.addItem((menuItem) => {
                menuItem
                    .setTitle('Open Folder Note')
                    .setIcon('go-to-file')
                    .onClick((ev: MouseEvent) => {
                        const note = plugin.app.vault.getAbstractFileByPath(folderNotePath);
                        if (note) newFileUtils.openFile({file: Util.TFile2OZFile(note as any), app:plugin.app,newLeaf:false});
                    });
            });
        }

        if (!Util.pluginIsLoaded(plugin.app, 'folder-note-core')) {
            // Delete Folder Note Button
            if (folderNoteExists) {
                folderMenu.addItem((menuItem) => {
                    menuItem
                        .setTitle('Delete Folder Note')
                        .setIcon('trash')
                        .onClick((ev: MouseEvent) => {
                            const folderNoteFile = plugin.app.vault.getAbstractFileByPath(folderNotePath);
                            if (folderNoteFile) new ConfirmationModal(plugin,`Delete folder note ${folderNoteFile.name}?`,()=>plugin.settings.deleteFileOption === 'permanent' ? plugin.app.vault.delete(folderNoteFile,true).catch(error=>new Notice(`Delete failed: ${error.message}`)) : trashWithFallback(plugin.app,folderNoteFile,plugin.settings.deleteFileOption === 'system-trash')).open();
                        });
                });
            }
            // Create Folder Note Button
            else {
                folderMenu.addItem((menuItem) => {
                    menuItem
                        .setTitle('Create Folder Note')
                        .setIcon('create-new')
                        .onClick(async (ev: MouseEvent) => {
                            newFileUtils.createNewMarkdownFile(plugin, folder, folder.name, `# ${folder.name}`);
                        });
                });
            }
        }

        // Trigger
        app.workspace.trigger('file-menu', folderMenu, folder, 'file-explorer');
        if (e instanceof MouseEvent) {
            folderMenu.showAtPosition(menuPosition(e));
        } else {
            folderMenu.showAtPosition(menuPosition(e));
        }
        return false;
    };

    if (!props.folderTree.children) return null;

    let sortedFolderTree = useMemo(
        () => getSortedFolderTree(props.folderTree.children),
        [props.folderTree.children, excludedFolders, plugin.settings.sortFoldersBy]
    );

    return (
        <React.Fragment>
            {Array.isArray(props.folderTree.children) &&
                sortedFolderTree.map((child) => {
                    const isOpen = openFolders.contains(child.folder.path);
                    const hasChildFolders = plugin.isMobilePerformanceModeEnabled()
                        ? Util.hasVisibleChildFolder(child.folder, plugin, excludedFolders)
                        : child.children.length > 0;
                    const nestedFolderTree =
                        plugin.isMobilePerformanceModeEnabled() && isOpen
                            ? Util.createFolderTree({
                                  startFolder: child.folder,
                                  plugin,
                                  excludedFolders,
                                  recursive: false,
                              })
                            : child;

                    return (
                        <React.Fragment key={child.folder.path}>
                            {hasChildFolders ? (
                                <Tree
                                    plugin={plugin}
                                    content={child.folder.name}
                                    open={isOpen}
                                    onClick={() => handleFolderNameClick(child.folder.path)}
                                    onDoubleClick={() => focusOnFolder(child.folder)}
                                    onContextMenu={(e: MouseEvent | TouchEvent) =>
                                        handleFolderContextMenu({
                                            event: e,
                                            folder: child.folder,
                                        })
                                    }
                                    folder={child.folder}>
                                    {(!plugin.isMobilePerformanceModeEnabled() || isOpen) && (
                                        <NestedFolders plugin={plugin} folderTree={nestedFolderTree} />
                                    )}
                                </Tree>
                            ) : (
                                <Tree
                                    plugin={plugin}
                                    content={child.folder.name}
                                    onClick={() => handleFolderNameClick(child.folder.path)}
                                    onDoubleClick={() => focusOnFolder(child.folder)}
                                    onContextMenu={(e: MouseEvent) =>
                                        handleFolderContextMenu({
                                            event: e,
                                            folder: child.folder,
                                        })
                                    }
                                    folder={child.folder}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
        </React.Fragment>
    );
}
