// Inspired by Fold Magic 0.3.0, MIT, copyright 2026 Tailnet 4
// https://github.com/SnakeJaeger/fold-magic. This implementation is original.
export type FoldProfile = 'unknown' | 'compact' | 'expanded';
export type FoldPose = 'unlabeled' | 'folded' | 'unfolded' | 'drawer' | 'keyboard' | 'rotation' | 'split' | 'resume';
export type FoldCause = 'attach' | 'root-resize' | 'window-resize' | 'viewport-resize' | 'viewport-scroll' |
    'layout-change' | 'visible-resume' | 'settings' | 'layout-commit' | 'inspect' | 'pose';
export interface FoldTuning {
    columnWidth: number;
    hysteresis: number;
    settle: number;
    debug: boolean;
    compactTypography?: boolean;
    compactSidebarWidth?: number;
    expandedSidebarWidth?: number;
    expandedColumnWidth?: number;
}

export function foldNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function normalize(settings: FoldTuning): FoldTuning {
    return {
        columnWidth: foldNumber(settings.columnWidth, 560, 440, 1000),
        hysteresis: foldNumber(settings.hysteresis, 24, 0, 80),
        settle: foldNumber(settings.settle, 120, 0, 500),
        debug: settings.debug === true,
        compactTypography: settings.compactTypography === true,
        compactSidebarWidth: foldNumber(settings.compactSidebarWidth, 0, 120, 1000),
        expandedSidebarWidth: foldNumber(settings.expandedSidebarWidth, 0, 120, 1000),
        expandedColumnWidth: foldNumber(settings.expandedColumnWidth, 0, 120, 1000),
    };
}

/** Width describes the available panel, not the physical hinge posture. */
export function resolveFoldProfile(width: number, threshold: number, hysteresis: number, previous: FoldProfile = 'unknown'): FoldProfile {
    if (!Number.isFinite(width) || width <= 0) return previous;
    if (width >= threshold) return 'expanded';
    if (width <= threshold - hysteresis) return 'compact';
    return previous;
}

type Timer = number;
type Measurement = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };
const profiles = ['unknown', 'compact', 'expanded'] as const;
const poses = ['unlabeled', 'folded', 'unfolded', 'drawer', 'keyboard', 'rotation', 'split', 'resume'] as const;
const profileClass = (profile: FoldProfile) => 'fjgduo-fold-' + profile;
const traceLimit = 80;
const safeBodyClasses = ['is-mobile', 'is-tablet', 'is-phone', 'is-ios', 'is-android', 'theme-dark', 'theme-light'];
const mediaQueries = ['(orientation: portrait)', '(pointer: coarse)', '(hover: none)', '(prefers-reduced-motion: reduce)'];
const numberChanged = (first: number, second: number) => Math.abs(first - second) >= .5;
const geometry = (r: DOMRect): Rect => ({x: r.x, y: r.y, width: r.width, height: r.height});

interface TraceRow {
    at: string;
    view: number;
    causes: FoldCause[];
    from: FoldProfile;
    to: FoldProfile;
    pose: FoldPose;
    window: { width: number; height: number; dpr: number };
    viewport?: { width: number; height: number; scale: number; offsetLeft: number; offsetTop: number };
    orientation?: { type: string; angle: number };
    media: Array<{ query: string; matches: boolean }>;
    bodyClasses: string[];
    safeArea: number[] | null;
    panel: Rect;
    scrollers: Array<Rect & { scrollTop: number; scrollHeight: number; clientHeight: number }>;
}

interface ViewHandle {
    id: number;
    root: HTMLElement;
    profile: FoldProfile;
    request(cause: FoldCause): void;
    reconcile(): void;
    dispose(): void;
}

/** Owned and constructed only while fold-aware layout is enabled. */
export class FoldLayoutController {
    private settings: FoldTuning;
    private disposed = false;
    private handles = new Map<HTMLElement, ViewHandle>();
    private history: TraceRow[] = [];
    private nextView = 0;
    private pose: FoldPose = 'unlabeled';

    constructor(settings: FoldTuning) { this.settings = normalize(settings); }

    attach(root: HTMLElement, onProfile: (profile: FoldProfile | null) => void): () => void {
        if (this.disposed || this.handles.has(root)) return () => {};
        const doc = root.ownerDocument;
        const win = doc.defaultView;
        if (!win) return () => {};
        const visual = win.visualViewport;
        const listeners: Array<() => void> = [];
        let frame: Timer | undefined, timer: Timer | undefined, overlay: HTMLElement | undefined;
        let alive = true, initialized = false;
        let sample: Measurement | undefined;
        let requested = new Set<FoldCause>();
        let pending = new Set<FoldCause>();
        const listen = (target: EventTarget, name: string, fn: EventListener): void => {
            target.addEventListener(name, fn);
            listeners.push(() => target.removeEventListener(name, fn));
        };
        const clearTimer = (): void => {
            if (timer === undefined) return;
            win.clearTimeout(timer);
            timer = undefined;
        };
        const read = (): Measurement | undefined => {
            if (!root.isConnected || doc.visibilityState === 'hidden' || root.getClientRects().length === 0) return undefined;
            const style = win.getComputedStyle(root);
            if (style.visibility === 'hidden' || style.visibility === 'collapse') return undefined;
            const {x, y, width, height} = root.getBoundingClientRect();
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
            if (x + width <= 0 || y + height <= 0 || x >= win.innerWidth || y >= win.innerHeight) return undefined;
            return {width, height};
        };
        const removeOverlay = (): void => {
            overlay?.remove();
            overlay = undefined;
        };
        const paint = (): void => {
            if (!initialized) return;
            for (const profile of profiles) root.classList.toggle(profileClass(profile), view.profile === profile);
            root.classList.toggle('fjgduo-fold-tight', Boolean(this.settings.compactTypography && view.profile === 'compact'));
            const sidebar = view.profile === 'compact' ? this.settings.compactSidebarWidth : view.profile === 'expanded' ? this.settings.expandedSidebarWidth : 0;
            const column = view.profile === 'expanded' ? this.settings.expandedColumnWidth : 0;
            if (sidebar) root.style.setProperty('--fjgduo-fold-sidebar-width', sidebar + 'px');
            else root.style.removeProperty('--fjgduo-fold-sidebar-width');
            if (column) root.style.setProperty('--fjgduo-fold-column-width', column + 'px');
            else root.style.removeProperty('--fjgduo-fold-column-width');
            if (!this.settings.debug || !sample) { removeOverlay(); return; }
            if (!overlay || overlay.parentNode !== root) {
                overlay = doc.createElement('output');
                overlay.className = 'fjgduo-fold-overlay';
                root.appendChild(overlay);
            }
            overlay.textContent = `Fold: ${view.profile} | panel ${sample.width.toFixed(1)} × ${sample.height.toFixed(1)} | ${this.pose}`;
        };
        const resolve = (measurement: Measurement): FoldProfile =>
            resolveFoldProfile(measurement.width, this.settings.columnWidth, this.settings.hysteresis, view.profile);
        const significant = (first: Measurement, second: Measurement): boolean =>
            numberChanged(first.width, second.width) || resolve(first) !== resolve(second);
        const commit = (causes: FoldCause[]): void => {
            if (!alive || !sample) return;
            const from = view.profile;
            const next = resolve(sample);
            view.profile = next;
            if (!initialized || next !== from) {
                initialized = true;
                onProfile(next);
                if (!alive) return;
            }
            paint();
            // Do not read a full diagnostic snapshot for every intermediate resize sample.
            this.record(view, from, causes);
        };
        const settle = (): void => {
            clearTimer();
            if (!alive) return;
            if (!this.settings.settle) {
                const causes = Array.from(pending);
                pending.clear();
                commit(causes);
                return;
            }
            timer = win.setTimeout(() => {
                timer = undefined;
                if (!alive) return;
                const newest = read();
                if (!newest) {
                    sample = undefined;
                    pending.clear();
                    removeOverlay();
                    return;
                }
                if (sample && significant(newest, sample)) {
                    sample = newest;
                    pending.add('root-resize');
                    settle();
                    return;
                }
                sample = newest;
                const causes = Array.from(pending);
                pending.clear();
                commit(causes);
            }, this.settings.settle);
        };
        const measure = (causes: FoldCause[]): void => {
            if (!alive) return;
            const previous = sample;
            sample = read();
            if (!sample) {
                clearTimer();
                pending.clear();
                removeOverlay();
                return;
            }
            if (!initialized) { commit(causes); return; }
            if (!previous || significant(sample, previous) || causes.includes('settings')) {
                causes.forEach(cause => pending.add(cause));
                settle();
            } else if (pending.size) {
                causes.forEach(cause => pending.add(cause));
            } else if (causes.some(cause => cause === 'visible-resume' || cause === 'pose' || cause === 'inspect')) {
                this.record(view, view.profile, causes);
            }
            if (this.settings.debug) paint();
        };
        const observer = typeof win.ResizeObserver === 'function'
            ? new win.ResizeObserver(() => view.request('root-resize')) : undefined;

        const view: ViewHandle = {
            id: ++this.nextView,
            root,
            profile: 'unknown',
            request: (cause) => {
                if (!alive) return;
                requested.add(cause);
                if (frame !== undefined) return;
                frame = win.requestAnimationFrame(() => {
                    frame = undefined;
                    if (!alive) return;
                    const causes = Array.from(requested);
                    requested.clear();
                    measure(causes);
                });
            },
            reconcile: () => {
                if (!this.settings.debug) removeOverlay();
                if (initialized) paint();
                view.request('settings');
            },
            dispose: () => {
                if (!alive) return;
                alive = false;
                if (this.handles.get(root) === view) this.handles.delete(root);
                clearTimer();
                if (frame !== undefined) win.cancelAnimationFrame(frame);
                requested.clear();
                pending.clear();
                observer?.disconnect();
                listeners.forEach(stop => stop());
                if (initialized) onProfile(null);
                removeOverlay();
                for (const profile of profiles) root.classList.remove(profileClass(profile));
                root.classList.remove('fjgduo-fold-tight');
                root.style.removeProperty('--fjgduo-fold-sidebar-width');
                root.style.removeProperty('--fjgduo-fold-column-width');
            },
        };
        this.handles.set(root, view);
        observer?.observe(root, {box: 'border-box'});
        listen(win, 'resize', () => view.request('window-resize'));
        listen(win, 'pageshow', () => view.request('visible-resume'));
        if (visual) {
            listen(visual, 'resize', () => view.request('viewport-resize'));
            listen(visual, 'scroll', () => view.request('viewport-scroll'));
        }
        listen(doc, 'visibilitychange', () => {
            if (doc.visibilityState === 'hidden') {
                clearTimer();
                if (frame !== undefined) win.cancelAnimationFrame(frame);
                frame = undefined;
                requested.clear();
                pending.clear();
                sample = undefined;
                removeOverlay();
            } else view.request('visible-resume');
        });
        measure(['attach']);
        return view.dispose;
    }

    update(settings: FoldTuning): void {
        if (this.disposed) return;
        const old = this.settings;
        this.settings = normalize(settings);
        if (Object.keys(this.settings).every(key => this.settings[key as keyof FoldTuning] === old[key as keyof FoldTuning])) return;
        this.handles.forEach(view => view.reconcile());
    }

    signal(cause: FoldCause = 'layout-change'): void {
        this.handles.forEach(view => view.request(cause));
    }

    setPose(pose: FoldPose): void {
        if (this.disposed || !poses.includes(pose)) return;
        this.pose = pose;
        this.signal('pose');
    }

    traceText(): string {
        if (this.disposed) return '[]';
        this.handles.forEach(view => this.record(view, view.profile, ['inspect']));
        return JSON.stringify(this.history, null, 2);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.handles.forEach(view => view.dispose());
        this.handles.clear();
        this.history = [];
    }

    private record(view: ViewHandle, from: FoldProfile, causes: FoldCause[]): void {
        const root = view.root;
        const doc = root.ownerDocument;
        const win = doc.defaultView;
        if (!win || !root.isConnected || doc.visibilityState === 'hidden' || !root.getClientRects().length) return;
        const viewport = win.visualViewport;
        const vv = viewport ? {width: viewport.width, height: viewport.height, scale: viewport.scale,
            offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop} : undefined;
        const orientation = win.screen?.orientation;
        const probe = doc.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;inset:0 auto auto 0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
        root.appendChild(probe);
        const inset = win.getComputedStyle(probe);
        const insets = [inset.paddingTop, inset.paddingRight, inset.paddingBottom, inset.paddingLeft].map(value => parseFloat(value));
        probe.remove();
        const scrollers = Array.from(root.querySelectorAll<HTMLElement>('.duo-main-scroll, .duo-pane, .oz-nav-file-tree')).slice(0, 8)
            .map(el => ({...geometry(el.getBoundingClientRect()), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight}));
        const row: TraceRow = {
            at: new Date().toISOString(), view: view.id, causes, from, to: view.profile, pose: this.pose,
            window: {width: win.innerWidth, height: win.innerHeight, dpr: win.devicePixelRatio},
            viewport: vv,
            orientation: orientation && {type: orientation.type, angle: orientation.angle},
            media: mediaQueries.map(query => ({query, matches: win.matchMedia?.(query).matches ?? false})),
            bodyClasses: safeBodyClasses.filter(name => doc.body?.classList.contains(name)),
            safeArea: insets.every(Number.isFinite) ? insets : null,
            panel: geometry(root.getBoundingClientRect()), scrollers,
        };
        if (this.history.length >= traceLimit) this.history.shift();
        this.history.push(row);
    }
}
