import { writeFile, mkdir, access } from 'node:fs/promises';
await mkdir('config',{recursive:true});await mkdir('.data',{recursive:true});
try{await access('config/collector-public-key.json');throw new Error('A collector key already exists. Rotate deliberately and preserve the old decryption key for retained snapshots.');}catch(e){if(e.code!=='ENOENT')throw e;}
const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['wrapKey','unwrapKey']);
await writeFile('config/collector-public-key.json',JSON.stringify(await crypto.subtle.exportKey('jwk',keys.publicKey),null,2)+'\n');
await writeFile('.data/collector-private-key.json',JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey)),{mode:0o600});
console.log('Public key created in config; private key created in the ignored .data directory. Store the private JSON as the server COVERAGE_PRIVATE_KEY secret.');
