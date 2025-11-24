const fs=require('fs');
const src=fs.readFileSync('d:/Software/Projects/AI _Project/Prediccion_Psicologia/app.js','utf8');
const idxs=[]; let i=0;
while(true){ const p=src.indexOf('catch', i); if(p===-1) break; idxs.push(p); i=p+5; }
console.log('found', idxs.length, 'catch tokens');
for(let k=0;k<idxs.length;k++){
  const pos=idxs[k];
  const upto=src.slice(0,pos);
  try{ new Function(upto); }catch(e){ console.log('parse failed when slicing before catch #'+(k+1)+' at pos', pos); console.log(e.toString()); process.exit(0); }
}
console.log('No failure before any catch tokens; full parse may fail later');
