import assert from 'node:assert/strict';
import test from 'node:test';
import { canRead, editBody, noteRevision, vaultPath, VaultLiveTools, type VaultPort } from '../src/live/vault-tools.ts';

function fixture(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let active = true;
  const changes: string[] = []; const sources: string[] = [];
  const port: VaultPort = {
    files: () => [...files].map(([path, text]) => ({ path, size: text.length })),
    read: async (path) => { if (!files.has(path)) throw Error('Missing'); return files.get(path)!; },
    create: async (path, content) => { if (files.has(path)) throw Error('Exists'); files.set(path, content); },
    process: async (path, change) => { files.set(path, change(files.get(path)!)); },
    exists: (path) => files.has(path) || ['Notes', 'Other'].includes(path),
    open: async () => {}
  };
  const tools = new VaultLiveTools(port, () => active, (path) => changes.push(path), (path) => sources.push(path));
  const call = (name: string, args: unknown) => tools.execute(name, JSON.stringify(args));
  return { files, port, tools, call, changes, sources, stop: () => { active = false; } };
}

test('vault search covers folders, returns exact source paths and excludes hidden configuration and credentials', async () => {
  const f = fixture({ 'Notes/Plan.md': 'Summer support', 'Other/Plan.md': 'Summer programs', '.obsidian/data.json': 'Summer secret', 'Passwords/Key.md': 'Summer secret', 'Notes/Attachment.pdf': 'binary' });
  const result = await f.call('search_vault', { query: 'Summer', folder: '', mode: 'contents', offset: 0 }) as any;
  assert.equal(result.matches.length, 2); assert.equal(result.search_complete, true);
  const binary = await f.call('search_vault', { query: 'Attachment', folder: '', mode: 'filenames', offset: 0 }) as any;
  assert.equal(binary.matches[0].path, 'Notes/Attachment.pdf');
  const read = await f.call('read_note', { path: 'Notes/Attachment.pdf', offset: 0 }) as any;
  assert.match(read.error, /Binary/);
});

test('search covers files beyond the old scan limit while note reading remains paged', async () => {
  const f = fixture(Object.fromEntries(Array.from({ length: 405 }, (_, i) => [`Notes/${String(i).padStart(3, '0')}.md`, i === 404 ? 'Needle' : 'Other'])));
  const first = await f.call('search_vault', { query: 'Needle', folder: '', mode: 'contents', offset: 0 }) as any;
  assert.equal(first.search_complete, true); assert.equal(first.next_offset, null);
  assert.equal(first.matches[0].path, 'Notes/404.md'); assert.equal(first.scanned_files, 405);
  f.files.set('Notes/Long.md', 'x'.repeat(15000));
  const read = await f.call('read_note', { path: 'Notes/Long.md', offset: 0 }) as any;
  assert.equal(read.text.length, 12000); assert.equal(read.next_offset, 12000);
});

test('exact edits preserve frontmatter, wiki links and literal replacement characters', async () => {
  const content = '---\ntitle: Planning\ntags: [keep]\n---\n\n# Planning\n\nBudget is pending.\n\n[[Source]]\n';
  const f = fixture({ 'Notes/Plan.md': content });
  const read = await f.call('read_note', { path: 'Notes/Plan.md', offset: 0 }) as any;
  const edited = await f.call('edit_note', { path: 'Notes/Plan.md', expected_revision: read.revision, operation: 'replace', old_text: 'Budget is pending.', new_text: 'Budget is $100.' }) as any;
  assert.equal(edited.saved, true); assert.equal(f.files.get('Notes/Plan.md'), content.replace('Budget is pending.', 'Budget is $100.'));
  assert.equal(f.changes.length, 1); assert.ok(f.sources.includes('Notes/Plan.md'));
  assert.throws(() => editBody(content, 'replace', 'tags: [keep]', 'tags: [changed]'), /note body/);
  assert.throws(() => editBody('repeat repeat', 'replace', 'repeat', 'new'), /more than once/);
});

test('stale revisions, concurrent edits and stopped sessions never overwrite a note', async () => {
  const f = fixture({ 'Notes/Plan.md': 'Original' });
  const args = { path: 'Notes/Plan.md', expected_revision: await noteRevision('Original'), operation: 'append', old_text: '', new_text: 'Addendum' };
  f.files.set('Notes/Plan.md', 'User changed');
  await assert.rejects(f.call('edit_note', args), /changed since/);
  f.files.set('Notes/Plan.md', 'Original');
  f.port.process = async (path, change) => { f.files.set(path, 'Concurrent update'); change('Concurrent update'); };
  await assert.rejects(f.call('edit_note', args), /changed while/);
  assert.equal(f.files.get('Notes/Plan.md'), 'Concurrent update');
  f.stop(); await assert.rejects(f.call('create_note', { path: 'Notes/New.md', content: 'New' }), /ended/);
  assert.equal(f.changes.length, 0);
});

test('creation, append and safe path boundaries prevent overwrite, duplicates and traversal', async () => {
  const f = fixture();
  const created = await f.call('create_note', { path: 'Notes/Voice.md', content: '# Voice\n\nOriginal' }) as any;
  await assert.rejects(f.call('create_note', { path: 'Notes/Voice.md', content: 'Overwrite' }), /already exists/);
  await assert.rejects(f.call('create_note', { path: 'Missing/Voice.md', content: 'New' }), /existing folder/);
  const update = await f.call('edit_note', { path: 'Notes/Voice.md', expected_revision: created.revision, operation: 'append', old_text: '', new_text: 'Progress' }) as any;
  assert.ok(f.files.get('Notes/Voice.md')?.endsWith('Progress\n'));
  await assert.rejects(f.call('edit_note', { path: 'Notes/Voice.md', expected_revision: update.revision, operation: 'append', old_text: '', new_text: 'Progress' }), /duplicate/);
  for (const path of ['../outside.md', '/absolute.md', '.obsidian/plugins/key.md', 'Notes/../outside.md', 'Notes\\outside.md', 'AGENTS.md']) assert.throws(() => vaultPath(path));
  assert.equal(canRead('Notes/Safe.md'), true);
  await assert.rejects(f.call('create_note', { path: 'AI Team/BKM/Agent System/Memory Brief.md', content: 'Overwrite rules' }), /Governance/);
});

test('ranked search scans beyond early matches, respects deep scope and reports exclusions', async () => {
 const f=fixture(Object.fromEntries(Array.from({length:450},(_,i)=>[`Early/${i}.md`,'Budget item'])));
 f.files.set('Z/Deep/Nested/Student Budget.md','Student budgets and staffing');
 f.files.set('Z/Deep/Nested/Large.md','x'.repeat(512001));f.files.set('Z/Deep/Nested/Report.pdf','binary');
 const all=await f.call('search_vault',{query:'student budget',folder:'',mode:'contents',offset:0}) as any;
 assert.equal(all.matches[0].path,'Z/Deep/Nested/Student Budget.md');assert.equal(all.total_matches,451);assert.equal(all.scanned_files,451);assert.equal(all.next_offset,20);assert.equal(all.search_complete,false);assert.equal(all.excluded_files,1);
 const scoped=await f.call('search_vault',{query:'student budgets',folder:'Z/Deep',mode:'contents',offset:0}) as any;
 assert.equal(scoped.matches.length,1);assert.equal(scoped.skipped_this_page,1);assert.match(scoped.coverage,/Z\/Deep/);
 const page=await f.call('search_vault',{query:'budget',folder:'Early',mode:'contents',offset:440}) as any;
 assert.equal(page.matches.length,10);assert.equal(page.next_offset,null);assert.equal(page.scanned_files,450);
});
