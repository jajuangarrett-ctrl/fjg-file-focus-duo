const fs=require('fs');const crypto=require('crypto');
for(const name of ['manifest.json','styles.css'])fs.copyFileSync(name,`dist/${name}`);
const hashes=Object.fromEntries(['main.js','manifest.json','styles.css'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(`dist/${name}`)).digest('hex')]));
fs.writeFileSync('dist/SHA256SUMS.json',JSON.stringify(hashes,null,2)+'\n');
fs.copyFileSync('dist/main.js','main.js');
fs.copyFileSync('dist/SHA256SUMS.json','SHA256SUMS.json');
console.log('Duo runtime prepared in dist/ and repository root. No vault installation performed.');
