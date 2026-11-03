import React from 'react';
export interface DuoAction { id: string; title: string; run: (event?: any) => unknown; visible?: boolean; }
export type DuoActionsRef = React.MutableRefObject<DuoAction[]>;
export const FOLDER_SELECTED = 'fjgduo-folder-selected';
export const FOCUS_SEARCH = 'fjgduo-focus-search';
