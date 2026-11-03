const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:['tests/browser/fixture.tsx'],bundle:true,outfile:'tests/browser/fixture.js',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},alias:{obsidian:require('path').resolve('tests/browser/obsidian.ts')},tsconfig:'tsconfig.json'});
