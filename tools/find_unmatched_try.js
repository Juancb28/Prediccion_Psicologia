const fs=require('fs');
const src=fs.readFileSync('d:/Software/Projects/AI _Project/Prediccion_Psicologia/app.js','utf8');
let inSingle=false,inDouble=false,inBack=false,esc=false;
let stack=[];
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
  // lookahead for try or catch as whole words
  if(src.slice(i,i+3)==='try' && /[^a-zA-Z0-9_$]/.test(src[i+3]||' ')){
    stack.push({type:'try',pos:i});
    i+=2; continue;
  }
  if(src.slice(i,i+5)==='catch' && /[^a-zA-Z0-9_$]/.test(src[i+5]||' ')){
    if(stack.length===0){ console.log('Unmatched catch at',i); process.exit(0); }
    // pop the last try
    let last=stack.pop();
    i+=4; continue;
  }
}
if(stack.length>0){ console.log('Unmatched try at', stack[stack.length-1]); } else { console.log('All try/catch paired'); }
