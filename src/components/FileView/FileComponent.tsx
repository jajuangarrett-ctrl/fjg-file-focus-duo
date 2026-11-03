import React, { useState, useEffect, useMemo } from 'react';
import { Notice, TFile, requestUrl } from 'obsidian';
import Dropzone from 'react-dropzone';
import * as Icons from 'utils/icons';
import FileTreeAlternativePlugin from 'main';
import { OZFile } from 'utils/types';
import * as Util from 'utils/Utils';
import * as recoilState from 'recoil/pluginState';
import { useRecoilState } from 'recoil';
import useForceUpdate from 'hooks/ForceUpdate';
import useLongPress from 'hooks/useLongPress';
import * as FileViewHandlers from 'components/FileView/handlers';
import { ensureNotePropertiesWithNotice, isMarkdownFile } from 'utils/noteProperties';
import { getPageText } from 'utils/noteContent';
import LazyLoad from 'react-lazy-load';
import { DuoActionsRef } from 'components/MainView/duoActions';
import { VirtualFiles } from 'components/MainView/VirtualFiles';

interface FilesProps {
    plugin: FileTreeAlternativePlugin;
    actionsRef?: DuoActionsRef;
    adaptive?: boolean;
    wide?: boolean;
}

const SEMANTIC_LINK_SUGGESTIONS_COMMAND_ID = 'semantic-graph-builder:open-link-suggestions';
const AUTO_TITLE_COMMAND_ID = 'auto-title:generate-title';
const DELETE_CURRENT_FILE_COMMAND_ID = 'app:delete-file';
const MOVE_CURRENT_FILE_COMMAND_ID = 'file-explorer:move-file';

const QUICK_FORMAT_SYSTEM_PROMPT = `You are an AI Markdown formatting assistant for Franklin Garrett.

Your task is to deeply format the user's active Obsidian note into clean Markdown.

Rules:
- Preserve every substantive idea, item, name, date, number, folder name, link, instruction, and action item from the source.
- Do not summarize, shorten, invent, delete, or add unsupported content.
- Correct obvious spelling, punctuation, capitalization, and spacing errors when the intent is clear.
- Remove duplicate bullet characters, pasted bullet symbols, broken indentation, and accidental list artifacts.
- If the source has pasted bullet symbols, partially formatted bullets, hanging wrapped lines, or indented fragments, actively rewrite them into clean Markdown bullets and nested bullets.
- Use one H1 title when the source has a clear title.
- Use H2 headings for major sections.
- Use Markdown bullets and nested bullets where they make the note easier to scan.
- Keep existing Markdown links, wiki links, URLs, tags, tasks, and code blocks intact.
- Preserve the order of the source unless nearby lines clearly belong under the same heading or nested bullet.
- Do not return the source unchanged unless it is already clean, coherent Markdown with headings and properly nested bullets.
- Output only the formatted Markdown note. Do not include a preamble, explanation, comments, or a wrapping code fence.`;

interface AIGrammarSettings {
    provider?: string;
    apiKey?: string;
    anthropicModel?: string;
    openaiModel?: string;
}

interface AIGrammarPluginInstance {
    settings?: AIGrammarSettings;
}

const stripWrappingCodeFence = (content: string) => {
    const trimmed = content.trim();
    const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
    return match ? match[1].trim() : trimmed;
};

const splitFrontmatter = (content: string) => {
    const match = content.match(/^(---\s*\n[\s\S]*?\n---)(\s*\n)?([\s\S]*)$/);

    if (!match) {
        return {
            frontmatter: '',
            body: content,
        };
    }

    return {
        frontmatter: match[1],
        body: match[3] || '',
    };
};

const getAIGrammarSettings = (plugin: FileTreeAlternativePlugin) => {
    const plugins = (plugin.app as any).plugins;
    const aiGrammarPlugin = plugins?.getPlugin?.('ai-grammar-corrector') as AIGrammarPluginInstance | null | undefined;
    return aiGrammarPlugin?.settings;
};

const formatNoteContentWithAI = async (content: string, settings: AIGrammarSettings) => {
    const { frontmatter, body } = splitFrontmatter(content);
    const bodyToFormat = body.trim();

    if (!bodyToFormat) return content;

    const formattedBody =
        settings.provider === 'openai'
            ? await callOpenAIFormatter(bodyToFormat, settings)
            : await callAnthropicFormatter(bodyToFormat, settings);
    const cleanedBody = stripWrappingCodeFence(formattedBody);

    return frontmatter ? `${frontmatter}\n\n${cleanedBody}\n` : `${cleanedBody}\n`;
};

const callAnthropicFormatter = async (content: string, settings: AIGrammarSettings) => {
    const res = await requestUrl({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': settings.apiKey || '',
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: settings.anthropicModel || 'claude-sonnet-4-5',
            max_tokens: 8192,
            temperature: 0.2,
            system: QUICK_FORMAT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `Format this Obsidian note body into clean Markdown:\n\n${content}` }],
        }),
        throw: false,
    });

    if (res.status === 401) throw new Error('Invalid Anthropic API key (401). Check AI Grammar Corrector settings.');
    if (res.status === 429) throw new Error('Anthropic rate limit hit (429). Wait a moment and try again.');
    if (res.status >= 400) {
        const apiMsg = (res.json?.error?.message as string) || res.text || 'unknown error';
        throw new Error(`Anthropic API ${res.status}: ${apiMsg}`);
    }

    const output = res.json?.content?.[0]?.text;
    if (typeof output !== 'string') throw new Error('Anthropic returned an unexpected response shape.');
    return output;
};

const callOpenAIFormatter = async (content: string, settings: AIGrammarSettings) => {
    const res = await requestUrl({
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${settings.apiKey || ''}`,
        },
        body: JSON.stringify({
            model: settings.openaiModel || 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
                { role: 'system', content: QUICK_FORMAT_SYSTEM_PROMPT },
                { role: 'user', content: `Format this Obsidian note body into clean Markdown:\n\n${content}` },
            ],
        }),
        throw: false,
    });

    if (res.status === 401) throw new Error('Invalid OpenAI API key (401). Check AI Grammar Corrector settings.');
    if (res.status === 429) throw new Error('OpenAI rate limit hit (429). Wait a moment and try again.');
    if (res.status >= 400) {
        const apiMsg = (res.json?.error?.message as string) || res.text || 'unknown error';
        throw new Error(`OpenAI API ${res.status}: ${apiMsg}`);
    }

    const output = res.json?.choices?.[0]?.message?.content;
    if (typeof output !== 'string') throw new Error('OpenAI returned an unexpected response shape.');
    return output;
};

export function FileComponent(props: FilesProps) {
    let searchInput = React.useRef<HTMLInputElement>(null);
    const plugin = props.plugin;

    // States Coming From Main Component
    const [_view, setView] = useRecoilState(recoilState.view);
    const [ozFileList, setOzFileList] = useRecoilState(recoilState.ozFileList);
    const [ozPinnedFiles] = useRecoilState(recoilState.ozPinnedFileList);
    const [activeFolderPath, setActiveFolderPath] = useRecoilState(recoilState.activeFolderPath);
    const [excludedExtensions] = useRecoilState(recoilState.excludedExtensions);
    const [excludedFolders] = useRecoilState(recoilState.excludedFolders);
    const [showSubFolders, setShowSubFolders] = useRecoilState(recoilState.showSubFolders);
    const [focusedFolder, _setFocusedFolder] = useRecoilState(recoilState.focusedFolder);
    const [activeOzFile] = useRecoilState(recoilState.activeOZFile);

    // Local States
    const [highlight, setHighlight] = useState<boolean>(false);
    const [searchPhrase, setSearchPhrase] = useState<string>('');
    const [searchBoxVisible, setSearchBoxVisible] = useState<boolean>(false);
    const [quickFormatRunning, setQuickFormatRunning] = useState<boolean>(false);
    const [treeHeader, setTreeHeader] = useState<string>(Util.getFolderName(activeFolderPath, plugin.app));
    const colorfulHeaderClassName = Util.getColorfulHeaderClassName(activeFolderPath, plugin);

    // Force Update
    const forceUpdate = useForceUpdate();

    // Folder Name Update once Active Folder Path Change
    useEffect(() => setTreeHeader(Util.getFolderName(activeFolderPath, plugin.app)), [activeFolderPath]);

    // File List Update once file visibility settings change
    useEffect(() => {
        setOzFileList(
            Util.getFilesUnderPath({
                path: activeFolderPath,
                plugin: plugin,
                excludedExtensions: excludedExtensions,
                excludedFolders: excludedFolders,
            })
        );
    }, [showSubFolders, excludedExtensions, excludedFolders, plugin.settings.showOnlySupportedFileTypes]);

    // To focus on Search box if visible set
    useEffect(() => {
        if (searchBoxVisible) searchInput.current?.focus();
    }, [searchBoxVisible]);

    const filesToList: OZFile[] = useMemo(
        () =>
            FileViewHandlers.sortedFiles({
                fileList: ozFileList,
                plugin: plugin,
                ozPinnedFiles: ozPinnedFiles,
            }),
        [excludedFolders, excludedExtensions, ozPinnedFiles, ozFileList, plugin.settings.sortFilesBy, plugin.settings.sortReverse]
    );

    // Go Back Button - Sets Main Component View to Folder
    const handleGoBack = (e: React.MouseEvent) => {
        setView('folder');
        setActiveFolderPath('');
    };

    // Toggle Search Box Visibility State
    const toggleSearchBox = () => {
        setSearchPhrase('');
        setSearchBoxVisible(!searchBoxVisible);
        setOzFileList(
            Util.getFilesUnderPath({
                path: activeFolderPath,
                plugin: plugin,
                excludedExtensions: excludedExtensions,
                excludedFolders: excludedFolders,
            })
        );
    };

    const toggleShowSubFolders = async () => {
        plugin.settings.showFilesFromSubFolders = !showSubFolders;
        await plugin.saveSettings();
        setShowSubFolders(!showSubFolders);
    };

    const copySelectedVaultFilePath = async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        const filePath = activeOzFile?.path || activeFile?.path;

        if (!filePath) {
            new Notice('Select a note first.');
            return;
        }

        try {
            await navigator.clipboard.writeText(filePath);
            new Notice(`Copied file path: ${filePath}`);
        } catch (error) {
            new Notice(`Could not copy file path: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const copySelectedNotePageText = async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        const selectedPath = activeOzFile?.path || activeFile?.path;
        const file = selectedPath ? plugin.app.vault.getAbstractFileByPath(selectedPath) : activeFile;

        if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
            new Notice('Select a Markdown note first.');
            return;
        }

        try {
            const noteText = await plugin.app.vault.cachedRead(file);
            await navigator.clipboard.writeText(getPageText(noteText));
            new Notice('Copied page text without properties.');
        } catch (error) {
            console.error('FJG File Focus Duo could not copy the selected note:', error);
            new Notice('Could not copy the page text to the clipboard.');
        }
    };

    const executeCommandById = async (commandId: string, unavailableNotice: string): Promise<boolean> => {
        const commands = (plugin.app as any).commands;

        if (!commands?.commands?.[commandId] || !commands?.executeCommandById) {
            new Notice(unavailableNotice);
            return false;
        }

        try { await Promise.resolve(commands.executeCommandById(commandId)); return true; }
        catch(error) { new Notice(`Command failed: ${error instanceof Error ? error.message : String(error)}`); return false; }
    };

    const openSemanticLinkSuggestions = (): void => {
        void executeCommandById(SEMANTIC_LINK_SUGGESTIONS_COMMAND_ID, 'Semantic Graph Builder command is not available.');
    };

    const generateAutoTitle = async () => {
        const commandStarted = await executeCommandById(AUTO_TITLE_COMMAND_ID, 'Auto Title command is not available.');
        if (!commandStarted) return;

        window.setTimeout(() => {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (isMarkdownFile(activeFile)) {
                void ensureNotePropertiesWithNotice(plugin, activeFile);
            }
        }, 1200);
    };
    const moveCurrentFile = (): void => void executeCommandById(MOVE_CURRENT_FILE_COMMAND_ID, 'Move current file command is not available.');
    const deleteCurrentFile = (): void => void executeCommandById(DELETE_CURRENT_FILE_COMMAND_ID, 'Delete current file command is not available.');

    const refreshCurrentNoteProperties = async () => {
        const activeFile = plugin.app.workspace.getActiveFile();
        const selectedPath = activeOzFile?.path || activeFile?.path;
        const file = selectedPath ? plugin.app.vault.getAbstractFileByPath(selectedPath) : activeFile;

        await ensureNotePropertiesWithNotice(plugin, file);
    };

    const quickFormatCurrentNote = async () => {
        if (quickFormatRunning) {
            new Notice('AI quick format is already running.');
            return;
        }

        const activeFile = plugin.app.workspace.getActiveFile();
        const selectedPath = activeOzFile?.path || activeFile?.path;
        const file = selectedPath ? plugin.app.vault.getAbstractFileByPath(selectedPath) : activeFile;

        if (!(file instanceof TFile)) {
            new Notice('Select a note first.');
            return;
        }

        if (file.extension.toLowerCase() !== 'md') {
            new Notice('Quick format only works on Markdown notes.');
            return;
        }

        const aiGrammarSettings = getAIGrammarSettings(plugin);

        if (!aiGrammarSettings) {
            new Notice('Enable AI Grammar Corrector before using AI quick format.');
            return;
        }

        if (!aiGrammarSettings.apiKey) {
            new Notice('Add an API key in AI Grammar Corrector settings before using AI quick format.');
            return;
        }

        setQuickFormatRunning(true);
        new Notice('AI formatting current note...');

        try {
            const originalContent = await plugin.app.vault.read(file);
            const formattedContent = await formatNoteContentWithAI(originalContent, aiGrammarSettings);

            if (formattedContent === originalContent) {
                new Notice('AI returned no formatting changes. The note was left unchanged.', 8000);
                return;
            }

            const latestContent = await plugin.app.vault.read(file);
            if (latestContent !== originalContent) {
                new Notice('The note changed while AI formatting was running. Nothing was written.');
                return;
            }

            await plugin.app.vault.modify(file, formattedContent);
            new Notice('AI formatted current note with Markdown.');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`AI quick format failed: ${message}`, 8000);
            console.error('FJG File Focus Duo AI quick format failed:', error);
        } finally {
            setQuickFormatRunning(false);
        }
    };

    const topIconSize = 19;

    if (props.actionsRef) props.actionsRef.current = [
        { id: 'search', title: 'Search files by name or tag', run: () => plugin.settings.searchFunction ? toggleSearchBox() : new Notice('File search is disabled in File Focus Duo settings.') },
        { id: 'new-note', title: 'Create a Note', run: (e) => Util.createNewFile(e || {}, activeFolderPath, plugin) },
        { id: 'delete-note', title: 'Delete Current File', run: deleteCurrentFile },
        { id: 'quick-format', title: 'Quick Format Current Note', run: quickFormatCurrentNote },
        { id: 'reveal', title: 'Reveal Active File', visible: plugin.settings.revealActiveFileButton, run: () => (plugin.app as any).commands.executeCommandById(`${plugin.manifest.id}:reveal-active-file`) },
        { id: 'properties', title: 'Refresh Note Properties', run: refreshCurrentNoteProperties },
        { id: 'move-note', title: 'Move Current File', run: moveCurrentFile },
        { id: 'auto-title', title: 'Generate Note Title', run: generateAutoTitle },
        { id: 'semantic-links', title: 'Open Semantic Link Suggestions', run: openSemanticLinkSuggestions },
        { id: 'copy-text', title: 'Copy Page Text Without Properties', run: copySelectedNotePageText },
        { id: 'copy-path', title: 'Copy Selected Note File Path', run: copySelectedVaultFilePath },
        { id: 'subfolders', title: `${showSubFolders ? 'Hide' : 'Include'} files from subfolders`, visible: plugin.settings.showFilesFromSubFoldersButton, run: toggleShowSubFolders },
        { id: 'file-sort', title: 'File sorting options', run: (e) => FileViewHandlers.sortFileListClickHandle({ e, plugin, forceUpdate }) },
    ];
    if (props.adaptive) return <Dropzone noClick onDrop={files => FileViewHandlers.handleOnDropFiles({files,activeFolderPath,plugin})}>
        {({getRootProps,getInputProps}) => <div {...getRootProps()} className="duo-file-content"><input {...getInputProps()}/>
        {searchBoxVisible && <div className="duo-search"><input aria-label="Search files by name or tag" type="search" ref={searchInput} value={searchPhrase} placeholder="Search… (all: / tag:)" onChange={(e) => FileViewHandlers.handleSearch({ e, plugin, activeFolderPath, setSearchPhrase, setTreeHeader, setOzFileList, excludedExtensions, excludedFolders, focusedFolder })} onKeyDown={(e) => { if (e.key === 'Escape') toggleSearchBox(); }} /></div>}
        {filesToList.length ? <VirtualFiles layoutKey={props.wide ? 'wide' : 'compact'} files={filesToList} render={(file) => <NavFile file={file} plugin={plugin} />} /> : <div className="duo-empty" role="status">No matching files in this folder.</div>}
    </div>}</Dropzone>;

    return (
        <React.Fragment>
            <Dropzone
                onDrop={(files) =>
                    FileViewHandlers.handleOnDropFiles({
                        files,
                        activeFolderPath,
                        plugin,
                    })
                }
                noClick={true}
                onDragEnter={() => setHighlight(true)}
                onDragLeave={() => setHighlight(false)}
                onDropAccepted={() => setHighlight(false)}
                onDropRejected={() => setHighlight(false)}>
                {({ getRootProps, getInputProps }) => (
                    <div {...getRootProps()} className={highlight ? 'drag-entered' : ''} style={{ width: '100%', height: '100%', position: 'relative' }}>
                        <input {...getInputProps()} />

                        <div className="fjgduo-explorer-container">
                            {/* Header */}
                            <div className={`fjgduo-file-tree-header-wrapper${plugin.settings.fixedHeaderInFileList ? ' fjgduo-tree-header-fixed' : ''}`}>
                                <div className="fjgduo-flex-container">
                                    <div className="fjgduo-nav-action-button" style={{ marginLeft: '0px' }}>
                                        {['Horizontal', 'Vertical'].includes(plugin.settings.evernoteView) ? (
                                            <Icons.IoIosCloseCircleOutline
                                                onClick={(e) => handleGoBack(e)}
                                                size={topIconSize}
                                                aria-label="Close File Pane"
                                            />
                                        ) : (
                                            <Icons.IoIosArrowBack
                                                onClick={(e) => handleGoBack(e)}
                                                size={topIconSize}
                                                aria-label="Go Back to Folder View"
                                            />
                                        )}
                                    </div>
                                    <div className="fjgduo-nav-action-button">
                                        <Icons.FaTrash onClick={deleteCurrentFile} size={topIconSize - 2} aria-label="Delete Current File" />
                                    </div>
                                    <div className="fjgduo-nav-action-button">
                                        <Icons.MdFormatListBulleted
                                            onClick={() => void quickFormatCurrentNote()}
                                            size={topIconSize + 1}
                                            aria-label="Quick Format Current Note"
                                        />
                                    </div>
                                    <div className="fjgduo-nav-buttons-right-block">
                                        {plugin.settings.revealActiveFileButton && (
                                            <div className="fjgduo-nav-action-button">
                                                <Icons.BiCurrentLocation
                                                    onClick={() => FileViewHandlers.handleRevealActiveFileButton({ plugin })}
                                                    size={topIconSize}
                                                    aria-label="Reveal Active File"
                                                />
                                            </div>
                                        )}
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.MdLocationOn
                                                onClick={() => void refreshCurrentNoteProperties()}
                                                size={topIconSize + 1}
                                                aria-label="Refresh Note Properties"
                                            />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.FaFolderOpen onClick={moveCurrentFile} size={topIconSize - 1} aria-label="Move Current File" />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.MdTitle onClick={() => void generateAutoTitle()} size={topIconSize} aria-label="Generate Auto Title" />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.FaProjectDiagram
                                                onClick={openSemanticLinkSuggestions}
                                                size={topIconSize - 1}
                                                aria-label="Open Semantic Link Suggestions"
                                            />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.MdContentCopy
                                                onClick={() => void copySelectedNotePageText()}
                                                size={topIconSize}
                                                aria-label="Copy Page Text Without Properties"
                                            />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.BiCopy
                                                onClick={() => void copySelectedVaultFilePath()}
                                                size={topIconSize}
                                                aria-label="Copy Selected Note File Path"
                                            />
                                        </div>
                                        {plugin.settings.showFilesFromSubFoldersButton && (
                                            <div className="fjgduo-nav-action-button">
                                                {showSubFolders ? (
                                                    <Icons.IoIosEyeOff
                                                        onClick={toggleShowSubFolders}
                                                        size={topIconSize}
                                                        aria-label="Hide Files from Sub-Folders"
                                                    />
                                                ) : (
                                                    <Icons.IoIosEye
                                                        onClick={toggleShowSubFolders}
                                                        size={topIconSize}
                                                        aria-label="Show Files from Sub-Folders"
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {plugin.settings.searchFunction && (
                                            <div className="fjgduo-nav-action-button">
                                                <Icons.IoIosSearch onClick={toggleSearchBox} size={topIconSize} aria-label="Search File by Name or Tag" />
                                            </div>
                                        )}
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.CgSortAz
                                                size={topIconSize + 2}
                                                onClick={(e) => {
                                                    FileViewHandlers.sortFileListClickHandle({ e, plugin, forceUpdate });
                                                }}
                                                aria-label="Sorting Options"
                                            />
                                        </div>
                                        <div className="fjgduo-nav-action-button">
                                            <Icons.IoIosAddCircle
                                                onClick={(e) => Util.createNewFile(e, activeFolderPath, plugin)}
                                                size={topIconSize}
                                                aria-label="Create a Note"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {searchBoxVisible && (
                                    <div className="fjgduo-input-container">
                                        <input
                                            type="search"
                                            placeholder="Search..."
                                            ref={searchInput}
                                            value={searchPhrase}
                                            onChange={(e) => {
                                                FileViewHandlers.handleSearch({
                                                    e,
                                                    plugin,
                                                    activeFolderPath,
                                                    setSearchPhrase,
                                                    setTreeHeader,
                                                    setOzFileList,
                                                    excludedExtensions,
                                                    excludedFolders,
                                                    focusedFolder,
                                                });
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    toggleSearchBox();
                                                }
                                            }}
                                        />
                                    </div>
                                )}

                                <div className={'fjgduo-file-tree-header' + colorfulHeaderClassName}>{treeHeader}</div>
                            </div>
                            {/* End: Header */}

                            {/* File List */}
                            <div
                                className={`fjgduo-file-tree-files${
                                    plugin.settings.fixedHeaderInFileList
                                        ? searchBoxVisible
                                            ? ' fjgduo-tree-files-fixed-with-search'
                                            : ' fjgduo-tree-files-fixed'
                                        : ''
                                }`}>
                                {filesToList.map((file, index) => {
                                    return (
                                        <LazyLoad height={22} key={index}>
                                            <NavFile file={file} plugin={plugin} />
                                        </LazyLoad>
                                    );
                                })}
                            </div>
                            {/* End: File List */}
                        </div>
                    </div>
                )}
            </Dropzone>
        </React.Fragment>
    );
}

/* ----------- SINGLE NAVFILE ELEMENT ----------- */

const NavFile = (props: { file: OZFile; plugin: FileTreeAlternativePlugin }) => {
    const { file, plugin } = props;

    const [ozPinnedFiles, setOzPinnedFiles] = useRecoilState(recoilState.ozPinnedFileList);
    const [activeOzFile, setActiveOzFile] = useRecoilState(recoilState.activeOZFile);

    const [hoverActive, setHoverActive] = useState<boolean>(false);

    const longPressEvents = useLongPress((e: React.TouchEvent) => {
        FileViewHandlers.triggerContextMenu({
            file,
            e,
            plugin,
            ozPinnedFiles,
            setOzPinnedFiles,
        });
    }, 500);

    useEffect(() => {
        const handleKeyDownEvent = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') {
                let el = document.querySelector(`.fjgduo-nav-file-title[data-path="${file.path}"]`);
                if (el) plugin.app.workspace.trigger('link-hover', {}, el, file.path, file.path);
            }
        };

        if (hoverActive && plugin.settings.filePreviewOnHover) {
            document.addEventListener('keydown', handleKeyDownEvent);
            return () => {
                document.removeEventListener('keydown', handleKeyDownEvent);
            };
        }
    }, [hoverActive]);

    const FileIcon = useMemo(
        () =>
            FileViewHandlers.getFileIcon({
                file,
            }),
        [plugin.settings.iconBeforeFileName, file]
    );

    const fileDisplayName = useMemo(() => {
        return plugin.settings.showFileNameAsFullPath ? Util.getFileNameAndExtension(file.path).fileName : file.basename;
    }, [plugin.settings.showFileNameAsFullPath, file.path]);
    const colorfulFileClassName = Util.getColorfulFileClassName(file, plugin);

    return (
        <div
            className={'fjgduo-nav-file' + colorfulFileClassName + (activeOzFile && activeOzFile.path === file.path ? ' is-active' : '')}
            key={file.path}
            role="button" tabIndex={0} aria-label={`Open ${file.basename}`}
            onKeyDown={e=>{if(e.key === 'Enter'||e.key === ' '){e.preventDefault();FileViewHandlers.openFile({e:e as any,file,plugin,setActiveOzFile});}}}
            draggable
            onDragStart={(e) =>
                FileViewHandlers.dragStarted({
                    e,
                    file,
                    plugin,
                })
            }
            onClick={(e) =>
                FileViewHandlers.openFile({
                    e,
                    file,
                    plugin,
                    setActiveOzFile,
                })
            }
            onAuxClick={(e) => FileViewHandlers.onAuxClick({ e, plugin, file })}
            onContextMenu={(e) =>
                FileViewHandlers.triggerContextMenu({
                    e,
                    file,
                    plugin,
                    ozPinnedFiles,
                    setOzPinnedFiles,
                })
            }
            onMouseEnter={(e) =>
                FileViewHandlers.mouseEnteredOnFile({
                    e,
                    file,
                    plugin,
                    setHoverActive,
                })
            }
            onMouseLeave={(e) => FileViewHandlers.mouseLeftFile({ e, file, setHoverActive })}
            {...longPressEvents}>
            <div className="fjgduo-nav-file-title" data-path={file.path}>
                <div className="fjgduo-nav-file-title-content">
                    {plugin.settings.iconBeforeFileName && <FileIcon className="fjgduo-nav-file-icon" size={15} />}
                    {fileDisplayName}
                </div>
                {ozPinnedFiles.some((f) => f.path === file.path) && <Icons.FaThumbtack className="fjgduo-nav-file-tag" size={14} />}
                {file.extension !== 'md' && <span className="fjgduo-nav-file-tag">{file.extension}</span>}
            </div>
        </div>
    );
};
