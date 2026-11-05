import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backAction,breadcrumbLabel} from '../src/layoutNavigation.ts';
test('Back uses the current path parent, not a focused sibling',()=>{
 const folders=new Map([['a/b/c',{parent:'a/b'}],['a/b',{parent:'a'}],['a',{parent:'/'}]]);
 let path='a/b/c';
 for(const expected of ['a/b','a','/']){const parent=folders.get(path)!.parent;assert.equal(backAction({focusMode:false,topFocus:false,path,parent}),'parent');path=parent;assert.equal(path,expected);}
 assert.equal(backAction({focusMode:false,topFocus:false,path}),'close');
});
test('explicit focus clears first and recent/bookmarks return to folder view',()=>{
 assert.equal(backAction({focusMode:false,topFocus:true,path:'a/b',parent:'a'}),'clear-focus');
 assert.equal(backAction({focusMode:true,topFocus:true,path:'a/b',parent:'a'}),'exit-mode');
});
test('breadcrumbs preserve vault and last segment with middle ellipsis',()=>{
 assert.deepEqual(breadcrumbLabel('FJG Vault','a/b/c'),{first:'FJG Vault',last:'c',collapsed:true});
 assert.deepEqual(breadcrumbLabel('FJG Vault','a'),{first:'FJG Vault',last:'a',collapsed:false});
 assert.deepEqual(breadcrumbLabel('FJG Vault','/'),{first:'FJG Vault',last:'',collapsed:false});
});
