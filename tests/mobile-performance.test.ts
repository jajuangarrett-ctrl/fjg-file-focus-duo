import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_MOBILE_PERFORMANCE_MODE,
    DebouncedBatchQueue,
    getMobilePerformancePolicy,
    shouldActivateDeferredView,
} from '../src/mobilePerformance.ts';

test('mobile performance mode defaults to the existing eager behavior when disabled', () => {
    assert.equal(DEFAULT_MOBILE_PERFORMANCE_MODE, false);
    const policy = getMobilePerformancePolicy({
        enabled: false,
        isMobile: true,
        openViewOnStart: true,
        explicitlyOpened: false,
        mountedViewCount: 0,
    });

    assert.equal(policy.active, false);
    assert.equal(policy.attachViewOnLayoutReady, true);
    assert.equal(policy.revealViewOnLayoutReady, true);
    assert.equal(policy.mountReactTree, true);
    assert.equal(policy.buildFolderTreeRecursively, true);
    assert.equal(policy.dispatchViewRefreshes, true);
});

test('mobile performance mode mounts the reduced tree when open on start is enabled', () => {
    const startupPolicy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: true,
        openViewOnStart: true,
        explicitlyOpened: false,
        mountedViewCount: 0,
    });
    const openedPolicy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: true,
        openViewOnStart: true,
        explicitlyOpened: true,
        mountedViewCount: 1,
    });

    assert.equal(startupPolicy.attachViewOnLayoutReady, true);
    assert.equal(startupPolicy.revealViewOnLayoutReady, true);
    assert.equal(startupPolicy.mountReactTree, true);
    assert.equal(startupPolicy.buildFolderTreeRecursively, false);
    assert.equal(startupPolicy.dispatchViewRefreshes, false);
    assert.equal(openedPolicy.mountReactTree, true);
    assert.equal(openedPolicy.dispatchViewRefreshes, true);
});

test('mobile performance mode still defers hidden startup work when open on start is disabled', () => {
    const hiddenStartupPolicy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: true,
        openViewOnStart: false,
        explicitlyOpened: false,
        mountedViewCount: 0,
    });
    const explicitlyOpenedPolicy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: true,
        openViewOnStart: false,
        explicitlyOpened: true,
        mountedViewCount: 0,
    });

    assert.equal(hiddenStartupPolicy.attachViewOnLayoutReady, false);
    assert.equal(hiddenStartupPolicy.revealViewOnLayoutReady, false);
    assert.equal(hiddenStartupPolicy.mountReactTree, false);
    assert.equal(hiddenStartupPolicy.buildFolderTreeRecursively, false);
    assert.equal(explicitlyOpenedPolicy.mountReactTree, true);
});

test('deferred mobile view activates only after it is connected and visible', () => {
    const visibleView = {
        isConnected: true,
        display: 'block',
        visibility: 'visible',
        width: 420,
        height: 700,
        top: 0,
        right: 420,
        bottom: 700,
        left: 0,
        viewportWidth: 430,
        viewportHeight: 932,
    };

    assert.equal(shouldActivateDeferredView(visibleView), true);
    assert.equal(shouldActivateDeferredView({ ...visibleView, isConnected: false }), false);
    assert.equal(shouldActivateDeferredView({ ...visibleView, display: 'none' }), false);
    assert.equal(shouldActivateDeferredView({ ...visibleView, left: -500, right: -80 }), false);
    assert.equal(shouldActivateDeferredView({ ...visibleView, width: 0 }), false);
});

test('desktop behavior is unchanged even when the mobile toggle is enabled', () => {
    const policy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: false,
        openViewOnStart: true,
        explicitlyOpened: false,
        mountedViewCount: 0,
    });

    assert.equal(policy.active, false);
    assert.equal(policy.attachViewOnLayoutReady, true);
    assert.equal(policy.revealViewOnLayoutReady, true);
    assert.equal(policy.mountReactTree, true);
    assert.equal(policy.buildFolderTreeRecursively, true);
    assert.equal(policy.dispatchViewRefreshes, true);
});

test('open on start controls both startup attachment and startup reveal', () => {
    const policy = getMobilePerformancePolicy({
        enabled: true,
        isMobile: true,
        openViewOnStart: false,
        explicitlyOpened: false,
        mountedViewCount: 0,
    });

    assert.equal(policy.attachViewOnLayoutReady, false);
    assert.equal(policy.revealViewOnLayoutReady, false);
    assert.equal(policy.mountReactTree, false);
});

test('refresh queue groups a burst and coalesces duplicate keys', () => {
    let scheduledCallback: (() => void) | null = null;
    let scheduledDelay = 0;
    const flushed: Array<Array<{ path: string; revision: number }>> = [];
    const queue = new DebouncedBatchQueue(
        250,
        (item: { path: string }) => item.path,
        (items) => flushed.push(items),
        (callback, delay) => {
            scheduledCallback = callback;
            scheduledDelay = delay;
            return 1;
        },
        () => undefined
    );

    queue.enqueue({ path: 'Notes/A.md', revision: 1 });
    queue.enqueue({ path: 'Notes/A.md', revision: 2 });
    queue.enqueue({ path: 'Notes/B.md', revision: 1 });

    assert.equal(queue.size, 2);
    assert.equal(scheduledDelay, 250);
    assert.ok(scheduledCallback);
    scheduledCallback?.();
    assert.deepEqual(flushed, [
        [
            { path: 'Notes/A.md', revision: 2 },
            { path: 'Notes/B.md', revision: 1 },
        ],
    ]);
    assert.equal(queue.size, 0);
});

test('clearing the refresh queue releases pending work without flushing', () => {
    let scheduledCallback: (() => void) | null = null;
    let cancelCount = 0;
    let flushCount = 0;
    const queue = new DebouncedBatchQueue(
        250,
        (item: { path: string }) => item.path,
        () => {
            flushCount += 1;
        },
        (callback) => {
            scheduledCallback = callback;
            return 7;
        },
        () => {
            cancelCount += 1;
        }
    );

    queue.enqueue({ path: 'Notes/A.md' });
    queue.clear();
    scheduledCallback?.();

    assert.equal(cancelCount, 1);
    assert.equal(queue.size, 0);
    assert.equal(flushCount, 0);
});
