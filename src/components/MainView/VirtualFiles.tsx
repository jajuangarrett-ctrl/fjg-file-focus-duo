import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OZFile } from 'utils/types';
export const FILE_ROW_HEIGHT = 44;
/** Bound DOM work even when Include files from subfolders returns a large vault. */
export function VirtualFiles({ files, render, layoutKey }: { layoutKey: string; files: OZFile[]; render: (file: OZFile) => React.ReactNode }) {
    const element = useRef<HTMLDivElement>(null);
    const [range, setRange] = useState({start: 0, end: 24});
    useLayoutEffect(() => {
        const list = element.current;
        const scroll = list?.closest('.duo-pane') as HTMLElement;
        if (!list || !scroll) return;
        let frame = 0;
        const measure = () => {
            const offset = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
            const start = Math.max(0, Math.floor((scroll.scrollTop - offset) / FILE_ROW_HEIGHT) - 4);
            const end = Math.min(files.length, Math.max(start + 1, Math.ceil((scroll.scrollTop - offset + scroll.clientHeight) / FILE_ROW_HEIGHT) + 4));
            setRange(old => old.start === start && old.end === end ? old : {start, end});
        };
        const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
        scroll.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update); observer.observe(scroll); observer.observe(list);
        measure();
        return () => { cancelAnimationFrame(frame); scroll.removeEventListener('scroll', update); observer.disconnect(); };
    }, [files, layoutKey]);
    useEffect(() => {
        let frame=0, second=0, third=0;
        const reveal=(event:Event) => {
            const path=(event as CustomEvent<string>).detail;
            const index=files.findIndex(file=>file.path===path);
            if(index<0)return;
            cancelAnimationFrame(frame);cancelAnimationFrame(second);cancelAnimationFrame(third);
            frame=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{third=requestAnimationFrame(()=>{
                const list=element.current, scroll=list?.closest('.duo-pane') as HTMLElement;
                if(!list || !scroll || !list.getClientRects().length)return;
                const offset=list.getBoundingClientRect().top-scroll.getBoundingClientRect().top+scroll.scrollTop;
                const pinned=scroll.classList.contains('duo-main-scroll') && Boolean(scroll.querySelector('.duo-toolbar-fixed')) ? 44 : 0;
                scroll.scrollTop=offset+index*FILE_ROW_HEIGHT-pinned;
            });});});
        };
        window.addEventListener('fjgduo-reveal-file-row',reveal);
        return ()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second);cancelAnimationFrame(third);window.removeEventListener('fjgduo-reveal-file-row',reveal);};
    },[files]);
    return <div ref={element} className="duo-virtual-files" role="list" aria-label="Files" style={{height: files.length * FILE_ROW_HEIGHT}}>
        {files.slice(range.start, range.end).map((file, index) => <div role="listitem" key={file.path} style={{position:'absolute', top:(index + range.start) * FILE_ROW_HEIGHT, height: FILE_ROW_HEIGHT, width:'100%'}}>{render(file)}</div>)}
    </div>;
}
