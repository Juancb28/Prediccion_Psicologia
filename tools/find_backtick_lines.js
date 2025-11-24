const fs=require('fs');
const s=fs.readFileSync('d:/Software/Projects/AI _Project/Prediccion_Psicologia/app.js','utf8');
let line=1; for(let i=0;i<s.length;i++){ if(s[i]=='\n') line++; if(s[i]=='`'){ console.log('backtick at line', line, 'pos', i); const start=Math.max(0,i-40); console.log(s.slice(start,i+40).replace(/\n/g,'\\n')); }}
