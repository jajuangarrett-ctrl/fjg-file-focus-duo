import React, { useState, useRef, useEffect } from 'react';
import FileTreeAlternativePlugin from 'main';
import { MainFolder } from 'components/FolderView/MainFolder';
import { FileComponent } from 'components/FileView/FileComponent';
import { FocusPanel } from 'components/FocusView/FocusPanel';
import { FocusPanelMode } from 'utils/types';

export const SingleViewVertical = (props: { plugin: FileTreeAlternativePlugin; focusMode?: FocusPanelMode }) => {
    let { plugin, focusMode } = props;

    const [dividerOnMove, setDividerOnMove] = useState<boolean>(false);
    const [folderPaneHeight, setFolderPaneHeight] = useState<number>(null);
    const [clientY, setClientY] = useState<number>(null);

    let folderPaneRef = useRef<HTMLDivElement>();
    let dividerRef = useRef<HTMLDivElement>();

    let heightSetting = localStorage.getItem(plugin.keys.customHeightKey);

    useEffect(() => {
        if (folderPaneHeight) {
            localStorage.setItem(plugin.keys.customHeightKey, folderPaneHeight.toString());
        }
    }, [folderPaneHeight]);

    function touchMouseStart(e: React.PointerEvent<HTMLDivElement>) {
        if (e.type !== 'drag' && (e.target as Element).id !== 'fjgduo-tree-divider') return;
        e.preventDefault();
        setDividerOnMove(true);
        let height = dividerRef.current.offsetTop - folderPaneRef.current.offsetTop;
        setFolderPaneHeight(height);
        setClientY(e.nativeEvent.clientY);
    }

    function touchMouseMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!dividerOnMove) return;
        e.preventDefault();
        setFolderPaneHeight(Math.max(88, Math.min(folderPaneRef.current.parentElement.clientHeight - 180, folderPaneHeight + (e.nativeEvent.clientY - clientY))));
        setClientY(e.nativeEvent.clientY);
    }

    function touchMouseEnd(e: React.PointerEvent<HTMLDivElement>) {
        if (!dividerOnMove) return;
        e.preventDefault();
        setDividerOnMove(false);
        setClientY(e.nativeEvent.clientY);
    }

    return (
        // Register Move & End Events for All File Tree Leaf
        <div className="fjgduo-tree-container" onPointerMove={(e) => touchMouseMove(e)} onPointerUp={(e) => touchMouseEnd(e)}>
            <div
                className="fjgduo-folder-pane"
                ref={folderPaneRef}
                style={{ height: folderPaneHeight ? `${folderPaneHeight}px` : heightSetting && heightSetting !== '' ? `${heightSetting}px` : '50%' }}>
                <MainFolder plugin={plugin} />
            </div>

            {/* Mouse Down Event only For Divider */}
            <div
                id="fjgduo-tree-divider"
                ref={dividerRef}
                onClick={(e) => e.preventDefault()}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); touchMouseStart(e); }}
                style={{touchAction:'none'}}
                className={dividerOnMove ? 'active-divider' : ''}></div>

            <div className="fjgduo-file-list-pane">
                {focusMode ? <FocusPanel plugin={plugin} mode={focusMode} /> : <FileComponent plugin={plugin} />}
            </div>
        </div>
    );
};

export const SingleViewHorizontal = (props: { plugin: FileTreeAlternativePlugin; focusMode?: FocusPanelMode }) => {
    let { plugin, focusMode } = props;

    const [dividerOnMove, setDividerOnMove] = useState<boolean>(false);
    const [folderPaneWidth, setFolderPaneWidth] = useState<number>(null);
    const [clientX, setClientX] = useState<number>(null);

    let folderPaneRef = useRef<HTMLDivElement>();
    let dividerRef = useRef<HTMLDivElement>();

    let widthSetting = localStorage.getItem(plugin.keys.customWidthKey);

    useEffect(() => {
        if (folderPaneWidth) {
            localStorage.setItem(plugin.keys.customWidthKey, folderPaneWidth.toString());
        }
    }, [folderPaneWidth]);

    function touchMouseStart(e: React.PointerEvent<HTMLDivElement>) {
        if (e.type !== 'drag' && (e.target as Element).id !== 'fjgduo-tree-divider-horizontal') return;
        e.preventDefault();
        setDividerOnMove(true);
        let width = dividerRef.current.offsetLeft - folderPaneRef.current.offsetLeft;
        setFolderPaneWidth(width);
        setClientX(e.nativeEvent.clientX);
    }

    function touchMouseMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!dividerOnMove) return;
        e.preventDefault();
        setFolderPaneWidth(Math.max(120, Math.min(folderPaneRef.current.parentElement.clientWidth - 220, folderPaneWidth + (e.nativeEvent.clientX - clientX))));
        setClientX(e.nativeEvent.clientX);
    }

    function touchMouseEnd(e: React.PointerEvent<HTMLDivElement>) {
        if (!dividerOnMove) return;
        e.preventDefault();
        setDividerOnMove(false);
        setClientX(e.nativeEvent.clientX);
    }

    return (
        // Register Move & End Events for All File Tree Leaf
        <div className="fjgduo-tree-container-horizontal" onPointerMove={(e) => touchMouseMove(e)} onPointerUp={(e) => touchMouseEnd(e)}>
            <div
                className="fjgduo-folder-pane-horizontal"
                ref={folderPaneRef}
                style={{ width: folderPaneWidth ? `${folderPaneWidth}px` : widthSetting && widthSetting !== '' ? `${widthSetting}px` : '50%' }}>
                <MainFolder plugin={plugin} />
            </div>

            {/* Mouse Down Event only For Divider */}
            <div
                id="fjgduo-tree-divider-horizontal"
                ref={dividerRef}
                onClick={(e) => e.preventDefault()}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); touchMouseStart(e); }}
                style={{touchAction:'none'}}
                className={dividerOnMove ? 'active-divider' : ''}></div>

            <div className="fjgduo-file-list-pane-horizontal">
                {focusMode ? <FocusPanel plugin={plugin} mode={focusMode} /> : <FileComponent plugin={plugin} />}
            </div>
        </div>
    );
};
