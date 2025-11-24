const fs=require('fs');
const src=fs.readFileSync('d:/Software/Projects/AI _Project/Prediccion_Psicologia/app.js','utf8');
let inSingle=false,inDouble=false,inBack=false,esc=false;
let braceStack=[];
for(let i=0;i<src.length;i++){
  const ch=src[i];
  if(esc){ esc=false; continue; }
  if(ch==='\\') { esc=true; continue; }
  if(inSingle){ if(ch==="'") inSingle=false; continue; }
  if(inDouble){ if(ch==='"') inDouble=false; continue; }
  if(inBack){ if(ch==='`') inBack=false; continue; }
  if(ch==="'") { inSingle=true; continue; }
  if(ch==='"') { inDouble=true; continue; }
  if(ch==='`') { inBack=true; continue; }
  if(ch==='{') braceStack.push({ch:'{',pos:i});
  if(ch==='}'){
    if(braceStack.length===0){ console.log('Unmatched } at', i); break; }
    braceStack.pop();
  }
}
if(braceStack.length>0){ console.log('Unclosed { at pos', braceStack[braceStack.length-1].pos); } else { console.log('Braces balanced'); }
