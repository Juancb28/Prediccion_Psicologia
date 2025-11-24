const fs = require('fs');
const s = fs.readFileSync('d:/Software/Projects/AI _Project/Prediccion_Psicologia/app.js','utf8');
const b = s.match(/`/g) || [];
const db = s.match(/\$\{/g) || [];
console.log('backticks:', b.length, 'dollarBraces:', db.length);

// Robust scan: track template literal state, handle escapes and ${ } expressions
let inTemplate = false;
let escaped = false;
let exprDepth = 0; // depth inside ${ }
let lastOpenPos = -1;
let line = 1;
let lastOpenLine = -1;
for(let i=0;i<s.length;i++){
  const ch = s[i];
  if(ch === '\n') line++;
  if(!inTemplate){
    if(ch === '`' && !escaped){ inTemplate = true; lastOpenPos = i; lastOpenLine = line; }
  } else {
    if(ch === '`' && !escaped && exprDepth === 0){ inTemplate = false; }
    else if(ch === '$' && s[i+1] === '{' && !escaped){ exprDepth++; i++; }
    else if(ch === '{' && exprDepth>0 && !escaped){ exprDepth++; }
    else if(ch === '}' && exprDepth>0 && !escaped){ exprDepth--; }
  }
  escaped = (ch === '\\' && !escaped);
}
console.log('endsInTemplate:', inTemplate, 'lastOpenPos:', lastOpenPos, 'lastOpenLine:', lastOpenLine);
if(inTemplate){
  const ctx = s.slice(Math.max(0,lastOpenPos-120), Math.min(s.length, lastOpenPos+120));
  console.log('context around open backtick:\n' + ctx);
}
