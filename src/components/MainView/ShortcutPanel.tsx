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
        node.replaceChildren();
        renderActionButtons(node,sections(),run,{compact:true});
        const search=node.querySelector('input');
        if(search){
            search.hidden=!searchOpen;search.value=query;search.dispatchEvent(new Event('input'));
            if(searchOpen && (focused || !wasSearchOpen.current))search.focus();
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
