import { TFile, TFolder, App, Keymap, Platform } from 'obsidian';
import FileTreeAlternativePlugin from 'main';
import { FolderFileCountMap, FolderTree, OZFile, BookmarksPluginItem } from 'utils/types';
import { VaultChangeModal } from 'modals';

declare const app: App;

const SUPPORTED_FILE_EXTENSIONS = new Set([
    'base', // Obsidian Bases, including Universal Dashboard launchers.
    'pdf',
    'doc',
    'docx',
    'rtf',
    'txt',
    'odt',
    'ott',
    'pages',
    'xls',
    'xlsx',
    'xlsm',
    'xlt',
    'xltx',
    'csv',
    'tsv',
    'html',
    'htm',
    'xhtml',
    'mht',
    'mhtml',
    'jpg',
    'jpeg',
    'png',
    'md',
    'epub',
    'excalidraw',
]);

// Helper Function To Get List of Files
export const getFilesUnderPath = (params: {
    path: string;
    plugin: FileTreeAlternativePlugin;
    excludedExtensions: string[];
    excludedFolders: string[];
    getAllFiles?: boolean;
}): OZFile[] => {
    const { path, plugin, getAllFiles, excludedExtensions, excludedFolders } = params;
    var filesUnderPath: OZFile[] = [];
    // Root browsing shows direct root files only; explicit all: search still searches the vault.
    var showFilesFromSubFolders = getAllFiles ? true : path !== '' && path !== '/' && plugin.settings.showFilesFromSubFolders;
    var folderObj = plugin.app.vault.getAbstractFileByPath(path);
    recursiveFx(folderObj as TFolder, plugin.app);
    function recursiveFx(folderObj: TFolder, app: App) {
        if (folderObj instanceof TFolder && folderObj.children) {
            for (let child of folderObj.children) {
                if (child instanceof TFile) {
                    if (shouldExcludeFile({ file: child, plugin, excludedExtensions, excludedFolders })) continue;
                    filesUnderPath.push(TFile2OZFile(child));
                }
                if (child instanceof TFolder && showFilesFromSubFolders) recursiveFx(child, app);
            }
        }
    }
    return filesUnderPath;
};

export const shouldExcludeFile = (params: {
    file: TFile;
    plugin: FileTreeAlternativePlugin;
    excludedExtensions?: string[];
    excludedFolders?: string[];
}): boolean => {
    const { file, plugin, excludedExtensions = [], excludedFolders = [] } = params;
    const extension = file.extension.toLowerCase();

    if (plugin.settings.showOnlySupportedFileTypes && !SUPPORTED_FILE_EXTENSIONS.has(extension)) return true;
    if (excludedExtensions.map((excluded) => excluded.trim().replace(/^\./, '').toLowerCase()).includes(extension)) return true;
    if (plugin.settings.hideAttachments && file.path.toLowerCase().includes(plugin.settings.attachmentsFolderName.toLowerCase())) return true;
    if (isPathInExcludedFolder(file.path, excludedFolders)) return true;

    return false;
};

export const settingListToArray = (value: string): string[] => {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
};

export const isPathInExcludedFolder = (path: string, excludedFolders: string[]): boolean => {
    const normalizedPath = normalizeVaultPath(path);
    return excludedFolders.some((folder) => {
        const normalizedFolder = normalizeVaultPath(folder);
        return normalizedFolder !== '' && (normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`));
    });
};

const normalizeVaultPath = (path: string): string => {
    return path.replace(/^\/+|\/+$/g, '');
};

const rootFolderColorCache = new WeakMap<FileTreeAlternativePlugin, Map<string, number>>();

export const invalidateRootFolderColorCache = (plugin: FileTreeAlternativePlugin): void => {
    rootFolderColorCache.delete(plugin);
};

export const getColorfulFolderClassName = (folderPath: string, plugin: FileTreeAlternativePlugin): string => {
    if (!plugin.settings.colorfulFolders) return '';

    const normalizedPath = normalizeVaultPath(folderPath);
    const pathParts = normalizedPath.split('/').filter(Boolean);
    if (pathParts.length === 0) return ' fjgduo-folder-colorful fjgduo-folder-colorful-root fjgduo-folder-colorful-0';

    const rootFolderName = pathParts[0];
    const colorIndex = getRootFolderColorIndex(rootFolderName, plugin);
    const depthClass = pathParts.length === 1 ? 'fjgduo-folder-colorful-root' : 'fjgduo-folder-colorful-child';

    return ` fjgduo-folder-colorful ${depthClass} fjgduo-folder-colorful-${colorIndex}`;
};

export const getColorfulFolderContentsClassName = (folderPath: string, plugin: FileTreeAlternativePlugin): string => {
    if (!plugin.settings.colorfulFolders) return '';

    return ` fjgduo-folder-contents-colorful ${getColorfulColorClassName(folderPath, plugin)}`;
};

export const getColorfulFileClassName = (file: OZFile, plugin: FileTreeAlternativePlugin): string => {
    if (!plugin.settings.colorfulFolders) return '';

    return ` fjgduo-file-colorful ${getColorfulColorClassName(file.parent.path, plugin)}`;
};

export const getColorfulHeaderClassName = (folderPath: string, plugin: FileTreeAlternativePlugin): string => {
    if (!plugin.settings.colorfulFolders) return '';

    return ` fjgduo-file-tree-header-colorful ${getColorfulColorClassName(folderPath, plugin)}`;
};

const getColorfulColorClassName = (folderPath: string, plugin: FileTreeAlternativePlugin): string => {
    const normalizedPath = normalizeVaultPath(folderPath);
    const pathParts = normalizedPath.split('/').filter(Boolean);
    if (pathParts.length === 0) return 'fjgduo-folder-colorful-0';

    const rootFolderName = pathParts[0];
    return `fjgduo-folder-colorful-${getRootFolderColorIndex(rootFolderName, plugin)}`;
};

const getRootFolderColorIndex = (rootFolderName: string, plugin: FileTreeAlternativePlugin): number => {
    let colorMap = rootFolderColorCache.get(plugin);

    if (!colorMap) {
        colorMap = new Map(
            plugin.app.vault
                .getRoot()
                .children.filter((child): child is TFolder => child instanceof TFolder)
                .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
                .map((folder, index) => [folder.name, index % 12])
        );
        rootFolderColorCache.set(plugin, colorMap);
    }

    return colorMap.get(rootFolderName) ?? hashFolderName(rootFolderName) % 12;
};

const hashFolderName = (folderName: string): number => {
    return folderName.split('').reduce((hash, character) => hash + character.charCodeAt(0), 0);
};

// Converted from TFile to OZFile
export const TFile2OZFile = (t: TFile): OZFile => {
    return {
        path: t.path,
        basename: t.basename,
        extension: t.extension,
        stat: {
            mtime: t.stat.mtime,
            ctime: t.stat.ctime,
            size: t.stat.size,
        },
        parent: {
            path: t.parent.path,
        },
        isFolderNote: isFolderNote(t),
    };
};

// Check if the file is a folder note
export const isFolderNote = (t: TFile) => {
    return t.extension === 'md' && t.basename === t.parent.name;
};

// Helper Function to Create Folder Tree
export const createFolderTree = (params: {
    startFolder: TFolder;
    excludedFolders: string[];
    plugin: FileTreeAlternativePlugin;
    recursive?: boolean;
}): FolderTree => {
    const { startFolder, excludedFolders, plugin, recursive: buildRecursively = true } = params;
    let fileTree: { folder: TFolder; children: any } = { folder: startFolder, children: [] };
    function recursive(folder: TFolder, object: { folder: TFolder; children: any }) {
        if (!(folder && folder.children)) return;
        for (let child of folder.children) {
            if (child instanceof TFolder) {
                let childFolder: TFolder = child as TFolder;
                if (shouldExcludeFolder(childFolder, plugin, excludedFolders)) continue;
                let newObj: { folder: TFolder; children: any } = { folder: childFolder, children: [] };
                object.children.push(newObj);
                if (buildRecursively && childFolder.children) recursive(childFolder, newObj);
            }
        }
    }
    recursive(startFolder, fileTree);
    return fileTree;
};

export const shouldExcludeFolder = (folder: TFolder, plugin: FileTreeAlternativePlugin, excludedFolders: string[]): boolean =>
    (plugin.settings.hideAttachments && folder.path.toLowerCase().includes(plugin.settings.attachmentsFolderName.toLowerCase())) ||
    (excludedFolders.length > 0 && isPathInExcludedFolder(folder.path, excludedFolders));

export const hasVisibleChildFolder = (folder: TFolder, plugin: FileTreeAlternativePlugin, excludedFolders: string[]): boolean =>
    folder.children.some((child) => child instanceof TFolder && !shouldExcludeFolder(child, plugin, excludedFolders));

// Create Folder File Count Map
export const getFolderNoteCountMap = (plugin: FileTreeAlternativePlugin) => {
    const counts: FolderFileCountMap = {};
    let files: TFile[];
    if (plugin.settings.folderCountOption === 'notes') {
        files = plugin.app.vault.getMarkdownFiles();
    } else {
        files = plugin.app.vault.getFiles();
    }

    files = files.filter(
        (file) =>
            !shouldExcludeFile({
                file,
                plugin,
                excludedExtensions: settingListToArray(plugin.settings.excludedExtensions),
                excludedFolders: settingListToArray(plugin.settings.excludedFolders),
            })
    );

    // Filter Folder Note Files
    if (plugin.settings.folderNote) {
        files = files.filter((f) => f.extension !== 'md' || (f.extension === 'md' && f.basename !== f.parent.name));
    }

    files.forEach((file) => {
        for (let folder = file.parent; folder != null; folder = folder.parent) {
            // -> Create object if doesn't exist
            if (!counts[folder.path]) counts[folder.path] = { open: 0, closed: 0 };
            // -> Create number for open state
            if (folder == file.parent) counts[folder.path].open = 1 + counts[folder.path].open;
            // -> Create number for closed state
            counts[folder.path].closed = 1 + counts[folder.path].closed;
        }
    });
    return counts;
};

const getPathParts = (path: string) => {
    const parts = normalizeVaultPath(path).split('/').filter(Boolean);
    const fileName = parts.pop() || '';
    const extensionSeparator = fileName.lastIndexOf('.');
    const extension = extensionSeparator >= 0 ? fileName.slice(extensionSeparator + 1).toLowerCase() : '';
    const basename = extensionSeparator >= 0 ? fileName.slice(0, extensionSeparator) : fileName;

    return {
        basename,
        extension,
        parentName: parts[parts.length - 1] || '',
        parentPath: parts.join('/'),
    };
};

const shouldCountFileAtPath = (plugin: FileTreeAlternativePlugin, path: string): boolean => {
    const { basename, extension, parentName } = getPathParts(path);
    const excludedExtensions = settingListToArray(plugin.settings.excludedExtensions).map((item) => item.toLowerCase());
    const excludedFolders = settingListToArray(plugin.settings.excludedFolders);

    if (plugin.settings.folderCountOption === 'notes' && extension !== 'md') return false;
    if (plugin.settings.showOnlySupportedFileTypes && !SUPPORTED_FILE_EXTENSIONS.has(extension)) return false;
    if (excludedExtensions.includes(extension)) return false;
    if (plugin.settings.hideAttachments && path.toLowerCase().includes(plugin.settings.attachmentsFolderName.toLowerCase())) return false;
    if (isPathInExcludedFolder(path, excludedFolders)) return false;
    if (plugin.settings.folderNote && extension === 'md' && basename === parentName) return false;

    return true;
};

const adjustFolderCountsForPath = (counts: FolderFileCountMap, path: string, delta: 1 | -1): void => {
    const { parentPath } = getPathParts(path);
    const ancestors: string[] = [];
    let currentPath = parentPath;

    while (true) {
        ancestors.push(currentPath === '' ? '/' : currentPath);
        if (currentPath === '') break;
        const separator = currentPath.lastIndexOf('/');
        currentPath = separator >= 0 ? currentPath.slice(0, separator) : '';
    }

    ancestors.forEach((folderPath, index) => {
        const current = counts[folderPath] || { open: 0, closed: 0 };
        const nextOpen = Math.max(0, current.open + (index === 0 ? delta : 0));
        const nextClosed = Math.max(0, current.closed + delta);

        if (nextOpen === 0 && nextClosed === 0) delete counts[folderPath];
        else counts[folderPath] = { open: nextOpen, closed: nextClosed };
    });
};

export const updateFolderNoteCountMap = (params: {
    counts: FolderFileCountMap;
    plugin: FileTreeAlternativePlugin;
    file: TFile;
    changeType: 'create' | 'delete' | 'rename';
    oldPath?: string;
}): FolderFileCountMap => {
    const { counts, plugin, file, changeType, oldPath } = params;
    const nextCounts: FolderFileCountMap = { ...counts };

    if ((changeType === 'delete' || changeType === 'rename') && oldPath && shouldCountFileAtPath(plugin, oldPath)) {
        adjustFolderCountsForPath(nextCounts, oldPath, -1);
    } else if (changeType === 'delete' && shouldCountFileAtPath(plugin, file.path)) {
        adjustFolderCountsForPath(nextCounts, file.path, -1);
    }

    if ((changeType === 'create' || changeType === 'rename') && shouldCountFileAtPath(plugin, file.path)) {
        adjustFolderCountsForPath(nextCounts, file.path, 1);
    }

    return nextCounts;
};

// Check if folder has child folder
export const hasChildFolder = (folder: TFolder): boolean => {
    let children = folder.children;
    for (let child of children) {
        if (child instanceof TFolder) return true;
    }
    return false;
};

// Files out of Md should be listed with extension badge - Md without extension
export const getFileNameAndExtension = (fullName: string) => {
    var index = fullName.lastIndexOf('.');
    return {
        fileName: fullName.substring(0, index),
        extension: fullName.substring(index + 1),
    };
};

// Returns all parent folder paths
export const getParentFolderPaths = (file: TFile): string[] => {
    let folderPaths: string[] = ['/'];
    let parts: string[] = file.parent.path.split('/');
    let current: string = '';
    for (let i = 0; i < parts.length; i++) {
        current += `${i === 0 ? '' : '/'}` + parts[i];
        folderPaths.push(current);
    }
    return folderPaths;
};

// Extracts the Folder Name from the Full Folder Path
export const getFolderName = (folderPath: string, app: App) => {
    if (folderPath === '/') return app.vault.getName();
    let index = folderPath.lastIndexOf('/');
    if (index !== -1) return folderPath.substring(index + 1);
    return folderPath;
};

export const internalPluginLoaded = (pluginName: string, app: App) => {
    // @ts-ignore
    return app.internalPlugins.plugins[pluginName]?._loaded;
};

export const openInternalLink = (event: React.MouseEvent<Element, MouseEvent>, link: string, app: App) => {
    app.workspace.openLinkText(link, '/', Keymap.isModifier(event as unknown as MouseEvent, 'Mod') || 1 === event.button);
};

export const pluginIsLoaded = (app: App, pluginId: string) => {
    // @ts-ignore
    return app.plugins.getPlugin(pluginId);
};

export const platformIsMobile = () => {
    return Platform.isMobile;
};

export const createNewFile = async (e: React.MouseEvent | null, folderPath: string, plugin: FileTreeAlternativePlugin) => {
    let targetFolder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!targetFolder) return;
    let modal = new VaultChangeModal(plugin, targetFolder, 'create note');
    modal.open();
};

export const getBookmarksPluginItems = (): BookmarksPluginItem[] => {
    return (app as any).internalPlugins.plugins['bookmarks'].instance.items as BookmarksPluginItem[];
};

export const getBookmarkTitle = (title: string): BookmarksPluginItem => {
    let bookmarkItems = getBookmarksPluginItems();
    let titleParts = title.split('/');
    let currentItem: BookmarksPluginItem = bookmarkItems.find((b) => b.title === titleParts[0]);
    for (let i = 1; i < titleParts.length; i++) {
        currentItem = currentItem.items.find((b) => b.title === titleParts[i]);
    }
    return currentItem;
};
