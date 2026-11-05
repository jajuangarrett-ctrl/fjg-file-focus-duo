/** Pure navigation decisions: never infer the parent from a selected sibling or stale tree focus. */
export function backAction(input: {focusMode:boolean; topFocus:boolean; path:string; parent?:string}): 'exit-mode'|'clear-focus'|'parent'|'close' {
    if(input.focusMode)return 'exit-mode';
    if(input.topFocus)return 'clear-focus';
    if(input.path && input.path!=='/' && input.parent!==undefined)return 'parent';
    return 'close';
}
export function breadcrumbLabel(vault:string,path:string) {
    const parts=path.split('/').filter(Boolean);
    return {first:vault,last:parts[parts.length-1] || '',collapsed:parts.length>1};
}
