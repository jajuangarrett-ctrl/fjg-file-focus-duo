import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoldLayoutController, foldNumber, resolveFoldProfile } from '../src/foldLayout.ts';
import type { FoldProfile, FoldTuning } from '../src/foldLayout.ts';

const settings: FoldTuning = {columnWidth: 560, hysteresis: 24, settle: 120, debug: false};
const resolve = (width: number, prior?: FoldProfile) => resolveFoldProfile(width, 560, 24, prior);

test('captured panel and viewport endpoints, exact hysteresis and invalid geometry', () => {
    for (const width of [264.23, 390, 382, 386]) assert.equal(resolve(width), 'compact');
    for (const width of [867, 871, 560, 561]) assert.equal(resolve(width), 'expanded');
    assert.equal(resolve(559), 'unknown');
    assert.equal(resolve(548, 'compact'), 'compact');
    assert.equal(resolve(548, 'expanded'), 'expanded');
    assert.equal(resolve(536, 'expanded'), 'compact');
    assert.equal(resolve(536.01, 'expanded'), 'expanded');
    assert.equal(resolveFoldProfile(560, 560, 0, 'compact'), 'expanded');
    assert.equal(resolveFoldProfile(559, 560, 0, 'expanded'), 'compact');
    for (const width of [0, -1, NaN, Infinity]) assert.equal(resolve(width, 'expanded'), 'expanded');
});

test('invalid numeric tuning falls back and range endpoints survive', () => {
    for (const value of [undefined, null, NaN, Infinity, '24', -1, 81]) assert.equal(foldNumber(value, 24, 0, 80), 24);
    assert.equal(foldNumber(0, 24, 0, 80), 0);
    assert.equal(foldNumber(80, 24, 0, 80), 80);
    assert.equal(foldNumber(500, 120, 0, 500), 500);
    assert.equal(foldNumber(501, 120, 0, 500), 120);
});

function fixture(width = 386) {
    let now = 0, next = 0, currentWidth = width, hidden = false, shown = true, attached = true;
    let liveObservers = 0;
    let observerCallback = () => {};
    const handles = new Set<string>();
    const style = new Map<string, string>();
    const frames = new Map<number, FrameRequestCallback>();
    const timers = new Map<number, {cb: () => void; due: number}>();
    const classes = new Set<string>(['fjgduo-host']);
    const nodes = new Set<Record<string, any>>();
    const bodyClasses = new Set(['is-ios', 'is-tablet', 'private-output']);
    const eventHandlers = new Map<string, EventListener>();
    const eventTarget = (id: string) => ({
        addEventListener(name: string, listener: EventListener) {
            const key = id + ':' + name;
            assert(!handles.has(key), 'duplicate ' + key);
            handles.add(key); eventHandlers.set(key, listener);
        },
        removeEventListener(name: string) {
            const key = id + ':' + name;
            handles.delete(key); eventHandlers.delete(key);
        },
    });
    const rect = () => ({x: 1, y: 2, width: currentWidth, height: 678});
    const computed = {visibility: 'visible', paddingTop: '3px', paddingRight: '4px', paddingBottom: '5px', paddingLeft: '6px'};
    const win = {
        ...eventTarget('win'),
        visualViewport: {...eventTarget('vv'), width: 386, height: 678, scale: 1, offsetLeft: 0, offsetTop: 0},
        innerWidth: 386, innerHeight: 678, devicePixelRatio: 2,
        screen: {orientation: {type: 'portrait-primary', angle: 0}},
        matchMedia: (query: string) => ({matches: query.includes('portrait')}),
        getComputedStyle: () => computed,
        ResizeObserver: class {
            constructor(cb: () => void) { observerCallback = cb; liveObservers++; }
            observe(_root: object, options: object) { assert.deepEqual(options, {box: 'border-box'}); }
            disconnect() { liveObservers--; }
        },
        requestAnimationFrame(cb: FrameRequestCallback) { frames.set(++next, cb); return next; },
        cancelAnimationFrame(id: number) { frames.delete(id); },
        setTimeout(cb: () => void, delay: number) { timers.set(++next, {cb, due: now + delay}); return next; },
        clearTimeout(id: number) { timers.delete(id); },
    };
    const doc = {
        ...eventTarget('doc'),
        defaultView: win,
        get visibilityState() { return hidden ? 'hidden' : 'visible'; },
        body: {classList: {contains: (value: string) => bodyClasses.has(value)}},
        createElement(kind: string) {
            const node: Record<string, any> = {kind, style: {}, remove() { nodes.delete(node); node.parentNode = null; }};
            return node;
        },
    };
    const root = {
        ownerDocument: doc,
        get isConnected() { return attached; },
        getBoundingClientRect: rect,
        getClientRects: () => shown ? [rect()] : [],
        querySelectorAll: () => [{
            getBoundingClientRect: rect, scrollTop: 31, scrollHeight: 1100, clientHeight: 678,
        }],
        appendChild(node: Record<string, any>) { nodes.add(node); node.parentNode = root; },
        classList: {
            toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
            remove(name: string) { classes.delete(name); },
        },
        style: {setProperty(name: string, value: string) { style.set(name, value); }, removeProperty(name: string) { style.delete(name); }},
    };
    const dispatch = (type: string) => eventHandlers.get(type)?.(new Event(type));
    return {
        root: root as unknown as HTMLElement, classes, style, handles, nodes, frames, timers,
        observers: () => liveObservers,
        observerCallback: () => observerCallback,
        notifyResize: () => observerCallback(),
        width(value: number) { currentWidth = value; },
        visible(value: boolean) { hidden = !value; dispatch('doc:visibilitychange'); },
        attached(value: boolean) { attached = value; },
        shown(value: boolean) { shown = value; },
        dispatch,
        frame() { const callbacks = Array.from(frames.values()); frames.clear(); callbacks.forEach(cb => cb(now)); },
        clock(ms: number) {
            now += ms;
            for (const [id, timer] of Array.from(timers.entries())) {
                if (timer.due > now || !timers.has(id)) continue;
                timers.delete(id);
                timer.cb();
            }
        },
    };
}

test('coalesces signals, settles trailing meaningful resizes, resumes and disposes', () => {
    const f = fixture();
    const commits: Array<FoldProfile | null> = [];
    const controller = new FoldLayoutController(settings);
    const detach = controller.attach(f.root, profile => commits.push(profile));
    assert.deepEqual(commits, ['compact']);
    assert(f.classes.has('fjgduo-fold-compact'));
    assert.equal(f.observers(), 1);
    assert.equal(f.handles.size, 5);
    controller.attach(f.root, () => { throw Error('duplicate attach'); });
    f.width(871); f.notifyResize(); f.dispatch('win:resize'); f.dispatch('vv:resize'); controller.signal();
    assert.equal(f.frames.size, 1);
    f.frame();
    assert.equal(f.timers.size, 1);
    f.clock(100);
    assert.deepEqual(commits, ['compact']);
    f.width(867); f.notifyResize(); f.frame(); f.clock(119);
    assert.deepEqual(commits, ['compact']);
    f.clock(1);
    assert.deepEqual(commits, ['compact', 'expanded']);
    assert(f.classes.has('fjgduo-fold-expanded'));
    f.width(548); f.notifyResize(); f.frame(); f.clock(120);
    assert.deepEqual(commits, ['compact', 'expanded']);
    f.width(536); f.notifyResize(); f.frame();
    f.visible(false);
    assert.equal(f.timers.size, 0);
    f.clock(500);
    f.visible(true); f.frame(); f.clock(120);
    assert.deepEqual(commits, ['compact', 'expanded', 'compact']);
    f.width(871); f.notifyResize(); f.frame();
    const oldCallback = f.observerCallback();
    detach();
    oldCallback();
    f.clock(500);
    assert.deepEqual(commits, ['compact', 'expanded', 'compact', null]);
    assert.deepEqual(Array.from(f.classes), ['fjgduo-host']);
    assert.equal(f.handles.size + f.timers.size + f.frames.size + f.nodes.size + f.style.size + f.observers(), 0);
    controller.dispose();
    assert.equal(controller.traceText(), '[]');
});

test('zero/disconnected views defer initialization, then attach later without view remount', () => {
    const f = fixture(0);
    f.attached(false);
    const commits: Array<FoldProfile | null> = [];
    const controller = new FoldLayoutController(settings);
    controller.attach(f.root, profile => commits.push(profile));
    assert.deepEqual(commits, []);
    assert.deepEqual(Array.from(f.classes), ['fjgduo-host']);
    f.attached(true); f.shown(false); f.width(559); controller.signal(); f.frame();
    assert.deepEqual(commits, []);
    f.shown(true); controller.signal(); f.frame();
    assert.deepEqual(commits, ['unknown']);
    assert(f.classes.has('fjgduo-fold-unknown'));
    controller.update({...settings, columnWidth: 550, settle: 0});
    f.frame();
    assert.deepEqual(commits, ['unknown', 'expanded']);
    controller.dispose();
});

test('live debug, bounded and redacted traces, optional style cleanup, rapid controller restart', () => {
    const f = fixture(390);
    const commits: Array<FoldProfile | null> = [];
    const first = new FoldLayoutController(settings);
    first.attach(f.root, profile => commits.push(profile));
    assert.equal(f.nodes.size, 0);
    first.traceText(); // Inspect does not bypass the overlay toggle.
    assert.equal(f.nodes.size, 0);
    first.update({...settings, debug: true, compactTypography: true, compactSidebarWidth: 180});
    assert(f.classes.has('fjgduo-fold-tight'));
    assert.equal(f.nodes.size, 1);
    assert.equal(f.style.get('--fjgduo-fold-sidebar-width'), '180px');
    first.setPose('folded');
    f.frame(); f.clock(120);
    for (let n = 0; n < 85; n++) first.traceText();
    const raw = first.traceText();
    const rows = JSON.parse(raw);
    assert.equal(rows.length, 80);
    assert.equal(rows[79].pose, 'folded');
    assert.deepEqual(rows[79].safeArea, [3, 4, 5, 6]);
    assert.deepEqual(rows[79].bodyClasses, ['is-tablet', 'is-ios']);
    assert(!raw.includes('private-output'));
    first.update({...settings, debug: false});
    assert.equal(f.nodes.size, 0);
    f.width(900); f.notifyResize();
    first.dispose();
    const second = new FoldLayoutController(settings);
    second.attach(f.root, profile => commits.push(profile));
    assert.deepEqual(commits, ['compact', null, 'expanded']);
    assert.equal(f.observers(), 1);
    assert.equal(f.handles.size, 5);
    assert.equal(f.frames.size + f.timers.size + f.nodes.size + f.style.size, 0);
    second.dispose();
    assert.equal(f.handles.size + f.observers(), 0);
});
