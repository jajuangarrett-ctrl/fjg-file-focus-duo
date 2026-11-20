import React, {useEffect, useRef, useState} from 'react';
import {IoIosSearch} from 'react-icons/io';
import {DuoAction} from './duoActions';
import {renderActionButtons} from './AllButtonsModal';

export function ShortcutPanel({sections, run, context}: {sections:()=>[string,DuoAction[]][]; run:(action:DuoAction,event?:MouseEvent)=>void; context:string}) {
    const host=useRef<HTMLDivElement>(null);
    const [searchOpen,setSearchOpen]=useState(false);
    const wasSearchOpen=useRef(false);
    useEffect(()=>{
        const node=host.current;
        if(!node)return;
        const old=node.querySelector('input');
        const query=searchOpen ? old?.value || '' : '';
        const focused=document.activeElement===old;
        const selection=focused && old ? [old.selectionStart,old.selectionEnd,old.selectionDirection] as const : undefined;
        const activeButton=node.contains(document.activeElement) && document.activeElement instanceof HTMLButtonElement
            ? document.activeElement.dataset.actionId : undefined;
        node.replaceChildren();
        renderActionButtons(node,sections(),run,{compact:true});
        const search=node.querySelector('input');
        if(search){
            search.hidden=!searchOpen;search.value=query;search.dispatchEvent(new Event('input'));
            if(searchOpen && (focused || !wasSearchOpen.current)){
                search.focus({preventScroll:focused});
                if(selection)search.setSelectionRange(...selection);
            } else if(activeButton) {
                Array.from(node.querySelectorAll<HTMLButtonElement>('button[data-action-id]:not([hidden])'))
                    .find(button=>button.dataset.actionId===activeButton)?.focus({preventScroll:true});
            }
        }
        wasSearchOpen.current=searchOpen;
    });
    return <section className="duo-shortcuts" aria-label="File Focus shortcuts">
        <div className="duo-shortcut-header">
            <p className="duo-shortcut-context" title={`Selected folder: ${context}`} aria-label={`Selected folder: ${context}`}>{context}</p>
            <button type="button" data-ignore-swipe="true" aria-label="Find a button" title="Find a button" aria-expanded={searchOpen} onClick={()=>setSearchOpen(value=>!value)}><IoIosSearch aria-hidden="true"/></button>
        </div>
        <div ref={host}/>
    </section>;
}
