import { useEffect, useMemo, useState } from 'react';
import { TFile, Vault } from 'obsidian';
import { HtmlFileClassification, isHtmlBrowseExtension } from 'utils/htmlFileClassification';
import { OZFile } from 'utils/types';

const vaultClassifiers = new WeakMap<Vault, HtmlFileClassification<TFile>>();

function classifierFor(vault: Vault): HtmlFileClassification<TFile> {
    let classifier = vaultClassifiers.get(vault);
    if (!classifier) {
        classifier = new HtmlFileClassification(file => vault.read(file));
        vaultClassifiers.set(vault, classifier);
    }
    return classifier;
}

export function useVerifiedHtmlFiles(vault: Vault, files: OZFile[]): OZFile[] {
    const classifier = classifierFor(vault);
    const [revision, invalidate] = useState(0);
    const [checked, update] = useState(0);
    const candidates = useMemo(() => {
        const result = new Map<string, TFile>();
        for (const item of files) {
            if (!isHtmlBrowseExtension(item.extension)) continue;
            const file = vault.getAbstractFileByPath(item.path);
            if (file instanceof TFile) result.set(item.path, file);
        }
        return result;
    }, [vault, files]);

    useEffect(() => {
        if (!candidates.size) return;
        const listener = vault.on('modify', file => {
            if (file instanceof TFile && candidates.get(file.path) === file) {
                classifier.invalidate(file);
                invalidate(n => n + 1);
            }
        });
        return () => vault.offref(listener);
    }, [vault, classifier, candidates]);

    useEffect(() => {
        const pending = [...candidates.values()].filter(file => classifier.verified(file) === undefined);
        if (!pending.length) return;
        let current = true;
        void Promise.all(pending.map(file => classifier.verify(file))).then(() => {
            if (current) update(n => n + 1);
        });
        return () => { current = false; };
    }, [classifier, candidates, revision]);

    return useMemo(() => files.filter(item => {
        if (!isHtmlBrowseExtension(item.extension)) return true;
        const file = candidates.get(item.path);
        return !!file && classifier.verified(file) === true;
    }), [files, candidates, classifier, revision, checked]);
}
