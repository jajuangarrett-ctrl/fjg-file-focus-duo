import assert from 'node:assert/strict';
import test from 'node:test';
import { HtmlFileClassification, isHtmlBrowseExtension, classifyHtmlContent, MAX_HTML_BROWSE_BYTES } from '../src/utils/htmlFileClassification.ts';

test('only .html and .htm browse rows require markup validation', () => {
    for (const extension of ['html', 'HTML', 'htm', 'HTM']) assert.ok(isHtmlBrowseExtension(extension));
    for (const extension of ['md', 'txt', 'xhtml', 'mht', 'mhtml', 'pdf', 'html.txt']) assert.ok(!isHtmlBrowseExtension(extension));
});

test('complete HTML documents and structural fragments qualify without rendering', () => {
    for (const value of [
        '<!DOCTYPE html><html lang="en"><body><p>hello</p></body></html>',
        '\uFEFF \n<!--saved offline-->\n<!--second comment--><html>',
        '<head><title>Fixture</title></head>',
        '<?xml version="1.0"?>\n<!DOCTYPE html PUBLIC "Fixture"><html xmlns="http://www.w3.org/1999/xhtml"></html>',
        '<BODY><p>Examples',
        '<section data-name="fixture"><h2>Guide</h2></section>',
    ]) assert.ok(classifyHtmlContent(value), value);
    assert.ok(classifyHtmlContent('<!doctype html><script>' + 'a'.repeat(200_000) + '</script>'));
});

test('source text, escaped examples, bare markers and binary are not browse pages', () => {
    for (const value of [
        '', 'plain text', '# Practice\n\n<html><body>Example</body></html>', 'Go to <div>example</div> now',
        '```html\n<!doctype html>\n<html></html>\n```', '&lt;html&gt;', '---\ntitle: test\n---\n<html>',
        '<!doctype svg><svg></svg>', '<!doctype html ', '<!-- <html>', '<section>', '<divisible>text</divisible>', '\u0000<html>',
    ]) assert.equal(classifyHtmlContent(value), false, value);
});

function candidate(index: number) {
    return { path: `Fixture ${index}.html`, stat: { ctime: 1, mtime: 2, size: 42 } };
}

test('classification caches booleans by local file revision and limits parallel reads', async () => {
    let readCount = 0, active = 0, highWater = 0;
    const cache = new HtmlFileClassification(async () => {
        ++readCount;
        highWater = Math.max(highWater, ++active);
        await new Promise(resolve => setTimeout(resolve, 1));
        --active;
        return '<!doctype html><html></html>';
    });
    const files = Array.from({ length: 10 }, (_, i) => candidate(i));
    const first = cache.verify(files[0]);
    assert.equal(cache.verify(files[0]), first);
    assert.ok((await Promise.all([first, ...files.map(file => cache.verify(file))])).every(Boolean));
    assert.equal(highWater, 3);
    assert.equal(readCount, 10);
    assert.equal(cache.verified(files[0]), true);
    files[0].stat.mtime++;
    assert.equal(cache.verified(files[0]), undefined);
    assert.equal(await cache.verify(files[0]), true);
    assert.equal(readCount, 11);
});

test('unreadable file retries and late earlier content cannot override a modification', async () => {
    const file = candidate(0);
    let release: (contents: string) => void;
    let afterRead = false;
    let failRead = false;
    const cache = new HtmlFileClassification(async () => {
        if (failRead) throw new Error('temporary fixture read error');
        if (afterRead) return 'plain text';
        return new Promise(resolve => { release = resolve; });
    });
    const earlier = cache.verify(file);
    cache.invalidate(file);
    afterRead = true;
    assert.equal(await cache.verify(file), false);
    release!('<!doctype html><html></html>');
    assert.equal(await earlier, false);
    assert.equal(cache.verified(file), false);
    cache.invalidate(file);
    failRead = true;
    assert.equal(await cache.verify(file), false);
    assert.equal(cache.verified(file), undefined);
    failRead = false;
    assert.equal(await cache.verify(file), false);
    assert.equal(cache.verified(file), false);
});


test('HTML browsing does not read a file larger than the 8 MiB input bound', async () => {
    let reads = 0;
    const cache = new HtmlFileClassification(async () => {
        reads++;
        return '<!doctype html><html></html>';
    });
    const file = candidate(11);
    file.stat.size = MAX_HTML_BROWSE_BYTES + 1;
    assert.equal(await cache.verify(file), false);
    assert.equal(reads, 0);
    file.stat.size = MAX_HTML_BROWSE_BYTES;
    assert.equal(await cache.verify(file), true);
    assert.equal(reads, 1);
});
