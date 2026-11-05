import { TFile, TFolder } from 'obsidian';
import { atom } from 'recoil';
import { FileTreeViewMode, FolderTree, FolderFileCountMap, OZFile } from 'utils/types';

export const view = atom({
    key: 'fjgduo-fileTreeViewState',
    default: 'folder' as FileTreeViewMode,
});

export const activeFolderPath = atom({
    key: 'fjgduo-fileTreeActiveFolderPathState',
    default: '',
});

export const activeOZFile = atom({
    key: 'fjgduo-fileTreeActiveOZFile',
    default: null as OZFile,
});

export const excludedFolders = atom({
    key: 'fjgduo-fileTreeExcludedFoldersState',
    default: [] as string[],
});

export const excludedExtensions = atom({
    key: 'fjgduo-fileTreeExcludedExtensions',
    default: [] as string[],
});

export const folderFileCountMap = atom({
    key: 'fjgduo-fileTreeFolderFileCountMapState',
    default: {} as FolderFileCountMap,
});

export const folderTree = atom({
    key: 'fjgduo-fileTreeFolderTreeState',
    default: null as FolderTree,
    dangerouslyAllowMutability: true,
});

export const ozFileList = atom({
    key: 'fjgduo-fileTreeOzFileListState',
    default: [] as OZFile[],
});

export const ozPinnedFileList = atom({
    key: 'fjgduo-fileTreeOzPinnedFilesState',
    default: [] as OZFile[],
});

export const openFolders = atom({
    key: 'fjgduo-fileTreeOpenFoldersState',
    default: [] as string[],
});

export const showSubFolders = atom({
    key: 'fjgduo-showSubFoldersInVault',
    default: false,
});

export const focusedFolder = atom({
    key: 'fjgduo-fileTreeFocusedFolder',
    default: null as TFolder,
    dangerouslyAllowMutability: true,
});

/** Explicit top-folder focus, separate from normal mobile drill-down. */
export const topFolderFocus = atom({key: "fjgduo-topFolderFocus", default:false});
