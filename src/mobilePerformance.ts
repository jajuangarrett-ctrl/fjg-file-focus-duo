export interface MobilePerformancePolicyInput {
    enabled: boolean;
    isMobile: boolean;
    openViewOnStart: boolean;
    explicitlyOpened: boolean;
    mountedViewCount: number;
}

export const DEFAULT_MOBILE_PERFORMANCE_MODE = false;

export interface MobilePerformancePolicy {
    active: boolean;
    attachViewOnLayoutReady: boolean;
    revealViewOnLayoutReady: boolean;
    mountReactTree: boolean;
    buildFolderTreeRecursively: boolean;
    dispatchViewRefreshes: boolean;
}

export const getMobilePerformancePolicy = (input: MobilePerformancePolicyInput): MobilePerformancePolicy => {
    const active = input.enabled && input.isMobile;

    return {
        active,
        // Performance mode defers the React tree, not the lightweight sidebar leaf.
        // Keeping the leaf attached lets a restored mobile tab activate when shown.
        attachViewOnLayoutReady: input.openViewOnStart,
        revealViewOnLayoutReady: input.openViewOnStart,
        // If the user asks File Focus to open on launch, mount the reduced
        // mobile tree immediately. Waiting for a visibility callback here can
        // leave a restored native sidebar leaf blank until an explicit command
        // opens it. Deep branches remain deferred by the recursive-build policy.
        mountReactTree: !active || input.openViewOnStart || input.explicitlyOpened,
        buildFolderTreeRecursively: !active,
        dispatchViewRefreshes: !active || input.mountedViewCount > 0,
    };
};

export interface DeferredViewVisibilityInput {
    isConnected: boolean;
    display: string;
    visibility: string;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
    viewportWidth: number;
    viewportHeight: number;
}

export const shouldActivateDeferredView = (input: DeferredViewVisibilityInput): boolean =>
    input.isConnected &&
    input.display !== 'none' &&
    input.visibility !== 'hidden' &&
    input.width > 0 &&
    input.height > 0 &&
    input.right > 0 &&
    input.bottom > 0 &&
    input.left < input.viewportWidth &&
    input.top < input.viewportHeight;

type ScheduleTimeout = (callback: () => void, delayMs: number) => number;
type CancelTimeout = (timeoutId: number) => void;

export class DebouncedBatchQueue<T> {
    private readonly pendingItems = new Map<string, T>();
    private timeoutId: number | null = null;
    private readonly delayMs: number;
    private readonly getKey: (item: T) => string;
    private readonly onFlush: (items: T[]) => void;
    private readonly scheduleTimeout: ScheduleTimeout;
    private readonly cancelTimeout: CancelTimeout;

    constructor(
        delayMs: number,
        getKey: (item: T) => string,
        onFlush: (items: T[]) => void,
        scheduleTimeout: ScheduleTimeout = (callback, delay) => window.setTimeout(callback, delay),
        cancelTimeout: CancelTimeout = (timeoutId) => window.clearTimeout(timeoutId)
    ) {
        this.delayMs = delayMs;
        this.getKey = getKey;
        this.onFlush = onFlush;
        this.scheduleTimeout = scheduleTimeout;
        this.cancelTimeout = cancelTimeout;
    }

    enqueue(item: T): void {
        this.pendingItems.set(this.getKey(item), item);
        if (this.timeoutId !== null) this.cancelTimeout(this.timeoutId);
        this.timeoutId = this.scheduleTimeout(() => this.flush(), this.delayMs);
    }

    flush(): void {
        if (this.timeoutId !== null) {
            this.cancelTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.pendingItems.size === 0) return;

        const items = Array.from(this.pendingItems.values());
        this.pendingItems.clear();
        this.onFlush(items);
    }

    clear(): void {
        if (this.timeoutId !== null) {
            this.cancelTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.pendingItems.clear();
    }

    get size(): number {
        return this.pendingItems.size;
    }
}
