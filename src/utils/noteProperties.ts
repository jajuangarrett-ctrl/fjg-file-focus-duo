import { Notice, TAbstractFile, TFile } from 'obsidian';
import FileTreeAlternativePlugin from 'main';

export const LOCATION_PROPERTY_NAME = 'location';
export const TAGS_PROPERTY_NAME = 'tags';
export const TITLE_PROPERTY_NAME = 'title';

const hasProperty = (frontmatter: Record<string, unknown>, propertyName: string) =>
    Object.prototype.hasOwnProperty.call(frontmatter, propertyName);

const isBlankStringProperty = (value: unknown) => typeof value === 'string' && value.trim().length === 0;

export const isMarkdownFile = (file: TAbstractFile | null | undefined): file is TFile => file instanceof TFile && file.extension === 'md';

export const getLocationPropertyValue = (file: TFile) => {
    const parentPath = file.parent?.path || '';
    return parentPath === '' || parentPath === '/' ? '/' : parentPath;
};

export const ensureNoteProperties = async (plugin: FileTreeAlternativePlugin, file: TFile) => {
    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
        if (!hasProperty(frontmatter, TITLE_PROPERTY_NAME) || isBlankStringProperty(frontmatter[TITLE_PROPERTY_NAME])) {
            frontmatter[TITLE_PROPERTY_NAME] = file.basename;
        }

        frontmatter[LOCATION_PROPERTY_NAME] = getLocationPropertyValue(file);

        if (!hasProperty(frontmatter, TAGS_PROPERTY_NAME) || frontmatter[TAGS_PROPERTY_NAME] == null) {
            frontmatter[TAGS_PROPERTY_NAME] = [];
        }
    });
};

export const ensureNotePropertiesWithNotice = async (plugin: FileTreeAlternativePlugin, file: TAbstractFile | null | undefined) => {
    if (!isMarkdownFile(file)) {
        new Notice('Select a Markdown note first.');
        return;
    }

    await ensureNoteProperties(plugin, file);
    new Notice('Updated title, location, and tags properties.');
};
