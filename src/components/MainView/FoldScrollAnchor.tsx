import React from 'react';
import type { FoldProfile } from '../../foldLayout';

type Area = 'main' | 'folders' | 'files';
type Anchor = { target: HTMLElement; offset: number };
type Position = { primary: Area; anchors: Partial<Record<Area, Anchor>> };
const preparedHandoffs = new WeakMap<HTMLElement, Position | null>();
const recentOwners = new WeakMap<HTMLElement, Area>();
/** Capture while the old classes and tuning still apply, before root.render is queued. */
export function prepareFoldScrollHandoff(root: HTMLElement): void {
    const host = root.querySelector<HTMLElement>('.duo-navigator');
    if (host && !preparedHandoffs.has(host)) preparedHandoffs.set(host, capture(host, recentOwners.get(host)));
}

type Props = React.PropsWithChildren<{
    host: React.RefObject<HTMLDivElement>;
    profile?: FoldProfile;
    remeasure?: () => void;
    navigation: readonly [string, string, number, boolean, boolean];
    hasNavigationPending: () => boolean;
    wide: boolean;
}>;

function visible(el: HTMLElement | null): el is HTMLElement {
    return Boolean(el?.isConnected && el.getClientRects().length && el.clientHeight > 0 && el.clientWidth > 0);
}

function frameTop(owner: HTMLElement) {
    const rect = owner.getBoundingClientRect();
    const toolbar = owner.classList.contains('duo-main-scroll') ? owner.querySelector<HTMLElement>('.duo-toolbar-fixed') : null;
    return Math.max(rect.top, toolbar?.getBoundingClientRect().bottom ?? rect.top);
}

function capture(host: HTMLElement, recentOwner: Area | undefined): Position | null {
    const main = host.querySelector<HTMLElement>('.duo-main-scroll');
    if (!visible(main)) return null;
    const columns = host.querySelector<HTMLElement>('.duo-columns');
    if (!visible(columns)) return { primary: 'main', anchors: { main: { target: main, offset: main.scrollTop } } };
    const folders = columns.querySelector<HTMLElement>('.duo-folder-column');
    const files = columns.querySelector<HTMLElement>('.duo-file-column');
    const fileContent = files?.querySelector<HTMLElement>('.duo-file-content');
    const wide = host.classList.contains('duo-wide') && visible(files) && files.classList.contains('duo-pane');
    const anchors: Position['anchors'] = {};
    const makeAnchor = (owner: HTMLElement, target: HTMLElement): Anchor =>
        ({ target, offset: frameTop(owner) - target.getBoundingClientRect().top });
    if (wide) {
        if (visible(folders)) anchors.folders = makeAnchor(folders, folders.firstElementChild as HTMLElement || folders);
        anchors.files = makeAnchor(files, fileContent || files);
        const focus = host.ownerDocument.activeElement;
        const focusInFiles = files.contains(focus);
        const editingFileSearch = focusInFiles && focus?.matches('input, textarea, [contenteditable=true]');
        const primary = editingFileSearch ? 'files' :
            recentOwner === 'files' || recentOwner === 'folders' ? recentOwner :
            focusInFiles || files.scrollTop > 0 ? 'files' : 'folders';
        return { primary, anchors };
    }
    const inFiles = visible(files) && (files.contains(host.ownerDocument.activeElement) ||
        files.getBoundingClientRect().top <= frameTop(main) + 1);
    const primary = inFiles ? 'files' : visible(folders) ? 'folders' : 'main';
    const target = primary === 'files' ? fileContent || files! : primary === 'folders' ? folders! : main;
    // A main-pane anchor's reference is its scroll origin, not its moving viewport.
    anchors[primary] = target === main ? { target, offset: main.scrollTop } : makeAnchor(main, target);
    return { primary, anchors };
}

function restore(host: HTMLElement, position: Position) {
    const main = host.querySelector<HTMLElement>('.duo-main-scroll');
    if (!visible(main)) return;
    const files = host.querySelector<HTMLElement>('.duo-file-column');
    const folders = host.querySelector<HTMLElement>('.duo-folder-column');
    const wide = host.classList.contains('duo-wide') && visible(files) && files.classList.contains('duo-pane');
    if (wide && position.primary !== 'main') main.scrollTop = 0;
    for (const area of (wide ? ['main', 'folders', 'files'] as const : [position.primary])) {
        const anchor = position.anchors[area];
        const owner = wide && area !== 'main' ? area === 'files' ? files : folders : main;
        if (!anchor || !visible(owner) || !visible(anchor.target)) continue;
        if (area === 'main') owner.scrollTop = anchor.offset;
        else owner.scrollTop += anchor.target.getBoundingClientRect().top + anchor.offset - frameTop(owner);
    }
}

/** No DOM of its own, and no subscriptions until a fold profile is applied. */
export class FoldScrollAnchor extends React.Component<Props, Record<string, never>, Position | null> {
    private stopTracking?: () => void;
    private cancelRestore?: () => void;

    getSnapshotBeforeUpdate(prev: Props): Position | null {
        const changed = prev.profile !== this.props.profile || prev.wide !== this.props.wide;
        if (prev.profile === undefined && this.props.profile === undefined) return null;
        const host = this.props.host.current;
        const prepared = host ? preparedHandoffs.get(host) : undefined;
        if (host) preparedHandoffs.delete(host);
        const navigationChanged = prev.navigation.some((value, index) => this.props.navigation[index] !== value);
        if (navigationChanged || this.props.hasNavigationPending()) {
            this.cancelRestore?.();
            return null;
        }
        if (!changed) return null;
        this.cancelRestore?.();
        return prepared !== undefined ? prepared : host ? capture(host, recentOwners.get(host)) : null;
    }

    componentDidMount() { this.updateTracking(); }

    componentDidUpdate(_prev: Props, _state: Record<string, never>, position: Position | null) {
        this.updateTracking();
        const host = this.props.host.current;
        if (!host || !position) return;
        if (this.props.profile === undefined) {
            // Finish the legacy handoff in this commit, with no surviving fold callbacks.
            restore(host, position);
            return;
        }
        const win = host.ownerDocument.defaultView;
        if (!win) return;
        let first = 0, second = 0;
        this.cancelRestore = () => {
            win.cancelAnimationFrame(first);
            win.cancelAnimationFrame(second);
            this.cancelRestore = undefined;
        };
        first = win.requestAnimationFrame(() => {
            second = win.requestAnimationFrame(() => {
                this.cancelRestore = undefined;
                if (this.props.host.current !== host || !visible(host) || this.props.hasNavigationPending()) return;
                restore(host, position);
                this.props.remeasure?.();
            });
        });
    }

    componentWillUnmount() {
        this.cancelRestore?.();
        this.stopTracking?.();
    }

    private updateTracking() {
        if (this.props.profile === undefined) {
            this.cancelRestore?.();
            this.stopTracking?.();
            this.stopTracking = undefined;
            const host = this.props.host.current;
            if (host) {
                recentOwners.delete(host);
                preparedHandoffs.delete(host);
            }
            return;
        }
        const host = this.props.host.current;
        const win = host?.ownerDocument.defaultView;
        if (!host || !win || this.stopTracking) return;
        const input = (evt: Event) => {
            const target = evt.target instanceof Element && evt.target.ownerDocument === host.ownerDocument ? evt.target : null;
            if (target?.closest('.duo-file-column')) recentOwners.set(host, 'files');
            else if (target?.closest('.duo-folder-column')) recentOwners.set(host, 'folders');
            cancel();
        };
        const scroll = (evt: Event) => {
            // Scrollbar, keyboard, and programmatic reveal may scroll without a pointer event.
            // Don't let browsers' layout clamping pulse change ownership during a handoff.
            if (preparedHandoffs.has(host) || this.cancelRestore) return;
            const target = evt.target as HTMLElement | null;
            if (target?.scrollTop && target.classList?.contains('duo-file-column')) recentOwners.set(host, 'files');
            if (target?.scrollTop && target.classList?.contains('duo-folder-column')) recentOwners.set(host, 'folders');
        };
        const cancel = () => {
            if (preparedHandoffs.has(host)) preparedHandoffs.set(host, null);
            this.cancelRestore?.();
        };
        const visibility = () => {
            if (host.ownerDocument.visibilityState === 'hidden') cancel();
        };
        const inputEvents = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
        const jumpEvents = ['fjgduo-reveal-file-row', 'fjgduo-folder-selected', 'fjg-vcc-folder-context', 'fjgduo-show-root-files'];
        for (const evt of inputEvents) host.addEventListener(evt, input, {capture: true, passive: true});
        host.addEventListener('scroll', scroll, {capture: true, passive: true});
        host.ownerDocument.addEventListener('visibilitychange', visibility);
        for (const evt of jumpEvents) win.addEventListener(evt, cancel);
        this.stopTracking = () => {
            for (const evt of inputEvents) host.removeEventListener(evt, input, true);
            host.removeEventListener('scroll', scroll, true);
            host.ownerDocument.removeEventListener('visibilitychange', visibility);
            for (const evt of jumpEvents) win.removeEventListener(evt, cancel);
            recentOwners.delete(host);
            preparedHandoffs.delete(host);
        };
    }

    render() { return this.props.children; }
}
