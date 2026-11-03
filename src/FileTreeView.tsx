import { ItemView, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import { Root, createRoot } from 'react-dom/client';
import FileTreeAlternativePlugin from './main';
import MainTreeComponent from './components/MainView/MainComponent';
import { RecoilRoot } from 'recoil';
import { shouldActivateDeferredView } from './mobilePerformance';

export class FileTreeView extends ItemView {
    plugin: FileTreeAlternativePlugin;
    currentFolderPath: string;
    root: Root | undefined;
    deferredActivationObserver: IntersectionObserver | undefined;
    deferredActivationFrame: number | undefined;

    constructor(leaf: WorkspaceLeaf, plugin: FileTreeAlternativePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.contentEl.classList.add('fjgduo-host');
        this.contentEl.style.paddingInline = '0';
    }

    getViewType(): string {
        return this.plugin?.VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.plugin?.VIEW_DISPLAY_TEXT;
    }

    getIcon(): string {
        return this.plugin?.ICON;
    }

    async onClose() {
        this.destroy();
    }

    destroy() {
        this.stopDeferredActivation();
        if (this.root) {
            this.root.unmount();
            this.root = undefined;
            this.plugin.unregisterMountedFileTreeView(this);
        }
        this.contentEl.empty();
    }

    async onOpen(): Promise<void> {
        this.destroy();
        if (this.plugin.getMobilePerformancePolicy(false).mountReactTree) {
            this.activate();
        } else {
            this.armDeferredActivation();
        }
    }

    onResize(): void {
        this.scheduleDeferredActivationCheck();
    }

    activate() {
        if (this.root) return;
        this.stopDeferredActivation();
        this.constructFileTree(this.app.vault.getRoot().path, '');
    }

    activateWhenVisible() {
        if (!this.root && this.isDeferredViewVisible()) this.activate();
    }

    isReactTreeMounted() {
        return Boolean(this.root);
    }

    armDeferredActivation() {
        this.contentEl.empty();
        const placeholder = this.contentEl.createDiv({ cls: 'fjg-file-focus-duo-deferred' });
        placeholder.createDiv({ cls: 'fjg-file-focus-duo-deferred__title', text: 'FJG File Focus Duo is ready.' });
        placeholder.createDiv({
            cls: 'fjg-file-focus-duo-deferred__description',
            text: 'Folders load when this sidebar becomes visible.',
        });
        const loadButton = placeholder.createEl('button', {
            cls: 'mod-cta fjg-file-focus-duo-deferred__button',
            text: 'Load folders',
        });
        loadButton.type = 'button';
        loadButton.addEventListener('click', () => this.activate(), { once: true });

        if (typeof window.IntersectionObserver === 'function') {
            this.deferredActivationObserver = new window.IntersectionObserver((entries) => {
                if (entries.some((entry) => entry.isIntersecting)) this.scheduleDeferredActivationCheck();
            });
            this.deferredActivationObserver.observe(this.contentEl);
        }

        this.scheduleDeferredActivationCheck();
    }

    scheduleDeferredActivationCheck() {
        if (this.root || this.deferredActivationFrame !== undefined) return;
        this.deferredActivationFrame = window.requestAnimationFrame(() => {
            this.deferredActivationFrame = undefined;
            this.activateWhenVisible();
        });
    }

    isDeferredViewVisible() {
        const rect = this.contentEl.getBoundingClientRect();
        const style = window.getComputedStyle(this.contentEl);
        return shouldActivateDeferredView({
            isConnected: this.contentEl.isConnected,
            display: style.display,
            visibility: style.visibility,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        });
    }

    stopDeferredActivation() {
        this.deferredActivationObserver?.disconnect();
        this.deferredActivationObserver = undefined;
        if (this.deferredActivationFrame !== undefined) {
            window.cancelAnimationFrame(this.deferredActivationFrame);
            this.deferredActivationFrame = undefined;
        }
    }

    constructFileTree(folderPath: string, vaultChange: string) {
        this.destroy();
        this.root = createRoot(this.contentEl);
        this.plugin.registerMountedFileTreeView(this);
        this.root.render(
            <div className="fjgduo-tree-plugin-view">
                <RecoilRoot>
                    <MainTreeComponent fileTreeView={this} plugin={this.plugin} />
                </RecoilRoot>
            </div>
        );
    }
}
