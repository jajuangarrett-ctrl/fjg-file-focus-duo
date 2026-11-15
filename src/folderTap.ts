/** Delay only pointer clicks so a double tap never opens the child first. */
export function createFolderTap(delay = 280, feedback: (pending: boolean) => void = () => {}) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; feedback(false); };
    return {
        cancel,
        tap(open: () => void, parent: () => void) {
            if (timer !== null) { cancel(); parent(); return; }
            feedback(true);
            timer = setTimeout(() => { timer = null; feedback(false); open(); }, delay);
        },
    };
}
