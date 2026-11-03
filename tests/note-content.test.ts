import assert from 'node:assert/strict';
import test from 'node:test';
import { getPageText } from '../src/utils/noteContent.ts';

test('removes standard YAML frontmatter and the separating blank line', () => {
    const note = '---\ntitle: Example\ntags: []\n---\n\n# Page title\n\nPage body.';

    assert.equal(getPageText(note), '# Page title\n\nPage body.');
});

test('supports BOM, CRLF, and the YAML document-end delimiter', () => {
    const note = '\uFEFF---\r\ntitle: Example\r\n...\r\n\r\nPage body.';

    assert.equal(getPageText(note), 'Page body.');
});

test('copies notes without frontmatter unchanged', () => {
    const note = '# Page title\n\nPage body.';

    assert.equal(getPageText(note), note);
});

test('returns an empty string when the note contains only frontmatter', () => {
    assert.equal(getPageText('---\ntitle: Example\n---\n'), '');
});

