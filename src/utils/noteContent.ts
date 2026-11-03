const FRONTMATTER_PATTERN = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export const getPageText = (noteText: string): string => {
    const frontmatter = noteText.match(FRONTMATTER_PATTERN);
    if (!frontmatter) return noteText;

    return noteText.slice(frontmatter[0].length).replace(/^(?:\r?\n)+/, '');
};
