import React, {useEffect, useRef} from 'react';
import {DuoAction} from './duoActions';
import {renderActionButtons} from './AllButtonsModal';

export function ShortcutPanel({sections, run, context}: {sections:()=>[string,DuoAction[]][]; run:(action:DuoAction,event?:MouseEvent)=>void; context:string}) {
    const host=useRef<HTMLDivElement>(null);
    useEffect(()=>{
        const node=host.current;
        if(!node)return;
        const old=node.querySelector('input');
        const query=old?.value || '';
        const focused=document.activeElement===old;
        node.replaceChildren();
        renderActionButtons(node,sections(),run);
        const search=node.querySelector('input');
        if(search){search.value=query;search.dispatchEvent(new Event('input'));if(focused)search.focus();}
    });
    return <section className="duo-shortcuts" aria-label="File Focus shortcuts">
        <p className="duo-shortcut-context">Selected folder: {context}</p>
        <div ref={host}/>
    </section>;
}
