import { App, Modal, setIcon } from 'obsidian';
import { DuoAction } from './duoActions';

const icons: Record<string,string> = {
    back:'arrow-left', folders:'folder-open', root:'home', 'root-files':'files', recent:'history', bookmarks:'bookmark',
    home:'house', brief:'sunrise', tasks:'list-checks', agenda:'calendar', voice:'mic', dashboard:'layout-dashboard',
    'new-folder':'folder-plus', 'folder-tags':'tags', 'folder-navigator':'folder-search', omnisearch:'search', follow:'locate',
    'folder-sort':'arrow-down-a-z', 'folder-path':'copy', collapse:'chevrons-up', expand:'chevrons-down',
    search:'search', 'new-note':'file-plus', 'delete-note':'trash', 'quick-format':'wand-sparkles', reveal:'locate-fixed',
    properties:'refresh-cw', 'move-note':'folder-input', 'auto-title':'type', 'semantic-links':'link',
    'copy-text':'clipboard', 'copy-path':'copy', subfolders:'folders', 'file-sort':'arrow-down-a-z',
};

/** A searchable home for the original toolbar actions, without taking space from file rows. */
export class AllButtonsModal extends Modal {
    constructor(app:App, private sections:[string,DuoAction[]][], private run:(action:DuoAction,event?:MouseEvent)=>void) {
        super(app);
        this.modalEl.classList.add('fjgduo-modal','duo-all-buttons');
    }
    onOpen() {
        this.titleEl.textContent='All File Focus buttons';
        renderActionButtons(this.contentEl, this.sections, (action,event)=>{this.close();this.run(action,event);});
    }

    onClose(){this.contentEl.replaceChildren();}
}

/** Shared action list for the sidebar and optional modal. */
export function renderActionButtons(container:HTMLElement, sections:[string,DuoAction[]][], run:(action:DuoAction,event?:MouseEvent)=>void) {
        const search=document.createElement('input');
        search.type='search'; search.placeholder='Find a button…'; search.setAttribute('aria-label','Find a button');
        container.appendChild(search);
        const hint=document.createElement('p');
        hint.className='duo-buttons-hint'; hint.textContent='Folder buttons use the selected folder. Note buttons use the current note.';
        container.appendChild(hint);
        const groups:{section:HTMLElement;buttons:HTMLButtonElement[]}[]=[];
        for (const [title,actions] of sections) {
            const section=document.createElement('section');
            const heading=document.createElement('h3'); heading.textContent=title; section.appendChild(heading);
            const grid=document.createElement('div'); grid.className='duo-buttons-grid'; section.appendChild(grid);
            const buttons:HTMLButtonElement[]=[];
            for (const action of actions.filter(a=>a.visible!==false)) {
                const button=document.createElement('button'); button.type='button'; button.dataset.actionId=action.id;
                const icon=document.createElement('span'); icon.setAttribute('aria-hidden','true'); setIcon(icon,icons[action.id] || 'circle');
                const label=document.createElement('span'); label.textContent=action.title;
                button.append(icon,label);
                button.addEventListener('click',event=>{run(action,event);});
                grid.appendChild(button); buttons.push(button);
            }
            container.appendChild(section); groups.push({section,buttons});
        }
        const empty=document.createElement('p'); empty.textContent='No matching buttons.'; empty.hidden=true; empty.setAttribute('role','status'); container.appendChild(empty);
        search.addEventListener('input',()=>{
            const query=search.value.trim().toLocaleLowerCase(); let count=0;
            for (const {section,buttons} of groups) {
                let visible=0;
                for (const button of buttons) {button.hidden=!button.textContent?.toLocaleLowerCase().includes(query); if(!button.hidden)visible++;}
                section.hidden=visible===0;count+=visible;
            }
            empty.hidden=count!==0;
        });
}
