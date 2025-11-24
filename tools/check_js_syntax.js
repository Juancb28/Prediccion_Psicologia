const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(file, 'utf8');
try{
  new Function(src);
  console.log('PARSE_OK');
}catch(e){
  console.error('PARSE_ERROR');
  console.error(e && e.stack || e);
  process.exit(2);
}
