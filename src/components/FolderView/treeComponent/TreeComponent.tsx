import { TFolder, Notice } from 'obsidian';
import React, { useState, useMemo, useEffect } from 'react';
import FileTreeAlternativePlugin from 'main';
import { FaFolder, FaFolderOpen, FaChevronRight } from 'react-icons/fa';
import { createFolderTap } from '../../../folderTap';
import { FOLDER_SELECTED } from '../../MainView/duoActions';
import Dropzone from 'react-dropzone';
import { IoMdArrowDropright } from 'utils/icons';
import * as recoilState from 'recoil/pluginState';
import { useRecoilState } from 'recoil';
import useLongPress from 'hooks/useLongPress';
import { getColorfulFolderClassName, getColorfulFolderContentsClassName } from 'utils/Utils';

type TreeProps = {
    open?: boolean;
    content?: string;
    onClick?: Function;
    onDoubleClick: Function;
    onContextMenu?: Function;
    type?: any;
    style?: any;
    children?: any;
    isRootFolder?: boolean;
    folder: TFolder;
    plugin: FileTreeAlternativePlugin;
};

export default function Tree(props: TreeProps) {
    // Global States
    const [openFolders, setOpenFolders] = useRecoilState(recoilState.openFolders);
    const [folderFileCountMap] = useRecoilState(recoilState.folderFileCountMap);
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);

    const [, setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [, setTopFocus] = useRecoilState(recoilState.topFolderFocus);
    const [pending, setPending] = useState(false);
    const gesture = useMemo(() => createFolderTap(280, setPending), []);
    useEffect(() => { gesture.cancel(); return gesture.cancel; }, [activeFolderPath, gesture]);
    // All explicit navigation and nested controls cancel a pending folder activation.
    useEffect(() => {
        const cancel = (event: Event) => {
            const target = event.target as Element;
            if (!target.closest?.(`[data-path="${CSS.escape(props.folder.path)}"] .fjgduo-folder-block`)) gesture.cancel();
        };
        document.addEventListener('pointerdown', cancel, true);
        return () => document.removeEventListener('pointerdown', cancel, true);
    }, [gesture, props.folder.path]);
    const goToParent = () => {
        const current = props.plugin.app.vault.getAbstractFileByPath(activeFolderPath || '/');
        if (!(current instanceof TFolder) || !current.parent) return;
        setTopFocus(false); setFocusedFolder(current.parent); setActiveFolderPath(current.parent.path);
        window.dispatchEvent(new CustomEvent(FOLDER_SELECTED, { detail: current.parent }));
    };
    const longPressEvents = useLongPress((e: React.TouchEvent) => {
        gesture.cancel(); props.onContextMenu(e);
    }, 500);

    // Local States
    const [open, setOpen] = useState<boolean>(props.open);
    const [highlight, setHightlight] = useState<boolean>(false);

    const isFolderActive = props.folder.path === activeFolderPath;
    const colorfulFolderClassName = getColorfulFolderClassName(props.folder.path, props.plugin);
    const colorfulFolderContentsClassName = getColorfulFolderContentsClassName(props.folder.path, props.plugin);

    // --> For state update from outside of the component
    useEffect(() => setOpen(props.open), [props.open]);

    // --> Icon to be toggled between min(-) and plus(+) Each click sets openFolders Main Component state to save in settings
    const toggle = () => {
        if (props.children) {
            // Set State in Main Component for Keeping Folders Open
            if (!open) {
                setOpenFolders([...openFolders, props.folder.path]);
            } else {
                const newOpenFolders = openFolders.filter((openFolder) => props.folder.path !== openFolder);
                setOpenFolders(newOpenFolders);
            }
            // Set State Open for the Folder
            setOpen(!open);
        }
    };

    // --> Function After an External File Dropped into Folder Name
    const onDrop = (files: File[]) => {
        files.map(async (file) => {
            file.arrayBuffer().then((arrayBuffer) => {
                props.plugin.app.vault.adapter.writeBinary(props.folder.path + '/' + file.name, arrayBuffer);
            });
        });
    };

    // --> Click Events
    const folderNameClickEvent = (ev: React.MouseEvent) => {
        if (props.plugin.settings.folderNote && ev.shiftKey) {
            gesture.cancel();
            const fileFullPath = `${props.folder.path}/${props.folder.name}.md`;
            const folderNoteFile = props.plugin.app.vault.getAbstractFileByPath(fileFullPath);
            props.plugin.app.workspace.openLinkText(fileFullPath, '/', false);
        } else {
            if (ev.detail === 0) { gesture.cancel(); props.onClick(); }
            else gesture.tap(() => props.onClick(), goToParent);
        }
    };
    const folderContextMenuEvent = (e: React.MouseEvent) => { gesture.cancel(); e.preventDefault(); props.onContextMenu(e); };

    const folderNameDoubleClickEvent = (ev: React.MouseEvent) => {
        ev.preventDefault(); // The two click events already resolved the gesture.
    };

    // --> Folder Count Map
    const folderCount = folderFileCountMap[props.folder.path];

    // --> Drag and Drop Actions
    const dropFileOrFolder = (e: React.DragEvent<HTMLDivElement>) => {
        let data = e.dataTransfer.getData('application/json');
        if (data !== '') {
            let dataJson = JSON.parse(data);
            // File Drop
            if (dataJson['filePath']) {
                const filePath = dataJson.filePath;
                // check if file exists
                let file = props.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file) {
                    props.plugin.app.vault.rename(file, `${props.folder.path}/${file.name}`);
                } else {
                    new Notice('Couldnt find the file');
                }
            }
            // Folder Drop
            else if (dataJson['folderPath']) {
                const folderPath = dataJson.folderPath;
                let folder = props.plugin.app.vault.getAbstractFileByPath(folderPath);
                if (folder) {
                    if (!props.folder.path.startsWith(folder.path)) {
                        props.plugin.app.vault.rename(folder, `${props.folder.path}/${folder.name}`);
                    } else {
                        new Notice('You cant move folder under its child');
                    }
                } else {
                    new Notice('Couldnt find the folder');
                }
            }
        }
        setHightlight(false);
        e.dataTransfer.clearData();
    };

    const onFolderDragStart = (e: React.DragEvent<HTMLDivElement>, folder: TFolder) => {
        gesture.cancel();
        e.dataTransfer.setData('application/json', JSON.stringify({ folderPath: folder.path }));

        let dragManager = (props.plugin.app as any).dragManager;
        if (!dragManager?.dragFile || !dragManager?.onDragStart) { new Notice('Drag is unavailable. Use the folder menu to move this folder.'); return; }
        const dragData = dragManager.dragFile(e.nativeEvent, folder);
        dragManager.onDragStart(e.nativeEvent, dragData);
    };

    return (
        <Dropzone
            onDrop={onDrop}
            noClick={true}
            onDragEnter={() => setHightlight(true)}
            onDragLeave={() => setHightlight(false)}
            onDropAccepted={() => setHightlight(false)}
            onDropRejected={() => setHightlight(false)}>
            {({ getRootProps, getInputProps }) => (
                <React.Fragment>
                    <div
                        style={{ ...props.style }}
                        className="fjgduo-treeview"
                        draggable
                        onDragStart={(e) => onFolderDragStart(e, props.folder)}
                        onDrop={(e) => dropFileOrFolder(e)}
                        onDragOver={() => setHightlight(true)}
                        onDragLeave={() => setHightlight(false)}>
                        <div
                            {...getRootProps({ className: 'dropzone' })}
                            className={
                                'fjgduo-folder-element' +
                                colorfulFolderClassName +
                                (highlight ? ' drag-entered' : '') +
                                (isFolderActive ? ' is-folder-active' : '')
                            }
                            data-path={props.folder.path}>
                            <input {...getInputProps()} />

                            <div className="fjgduo-folder-line">
                                {props.children && <button className="fjgduo-icon-div" data-ignore-swipe="true" aria-label={`Expand or collapse ${props.folder.name}`} aria-expanded={open} onClick={e => {e.stopPropagation(); gesture.cancel(); toggle();}}>
                                    <FaChevronRight className="fjgduo-expand-chevron" aria-hidden="true" />
                                </button>}

                                <div
                                    className={`fjgduo-folder-block${pending ? ' is-tap-pending' : ''}`}
                                    data-ignore-swipe="true"
                                    role="button" tabIndex={0} aria-label={`Open ${props.folder.name} folder`} title="Tap to open; double-tap to go up one folder" onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();gesture.cancel();props.onClick();}else if(e.key==='ArrowLeft'){e.preventDefault();gesture.cancel();goToParent();}}}
                                    onClick={folderNameClickEvent}
                                    onDoubleClick={folderNameDoubleClickEvent}
                                    onContextMenu={folderContextMenuEvent}
                                    {...longPressEvents}>
                                    {isFolderActive || open ? <FaFolderOpen className="fjgduo-folder-glyph" aria-hidden="true"/> : <FaFolder className="fjgduo-folder-glyph" aria-hidden="true"/>}
                                    <div className="fjgduo-folder-type" style={{ marginRight: props.type ? 10 : 0 }}>
                                        {props.type}
                                    </div>
                                    <div
                                        className={`fjgduo-folder-name ${isFolderActive ? 'is-folder-active' : ''}${
                                            props.isRootFolder ? ' is-root-folder' : ''
                                        }`}>
                                        {props.content}{' '}
                                        {props.plugin.settings.folderNote && props.folder.children.some((f) => f.name === `${props.folder.name}.md`) ? (
                                            <IoMdArrowDropright size={10} className="fjgduo-folder-note-icon" />
                                        ) : (
                                            ''
                                        )}
                                    </div>
                                    {props.plugin.settings.folderCount && (
                                        <div className="fjgduo-folder-count">
                                            <span className="fjgduo-nav-file-tag">{folderCount ? (open ? folderCount.open : folderCount.closed) : 0}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    {props.children && (
                        <div
                            className={'fjgduo-folder-contents' + colorfulFolderContentsClassName}
                            style={{
                                height: open ? 'auto' : 0,
                                opacity: open ? 1 : 0,
                                display: open ? 'inherit' : 'none',
                            }}>
                            {props.children}
                        </div>
                    )}
                </React.Fragment>
            )}
        </Dropzone>
    );
}
