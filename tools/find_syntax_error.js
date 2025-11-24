const fs=require('fs');
const path=require('path');
const file=path.join(__dirname,'..','app.js');
const src=fs.readFileSync(file,'utf8');
const lines=src.split('\n');
let low=0, high=lines.length;
let bad=-1;
while(low<high){
  const mid=Math.floor((low+high)/2);
  const chunk=lines.slice(0,mid).join('\n');
  try{
    new Function(chunk);
    low=mid+1;
  }catch(e){
    bad=mid;
    high=mid;
  }
}
if(bad===-1) console.log('No error found in chunks'); else console.log('Error around line', bad);
