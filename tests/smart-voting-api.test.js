import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../server/node-db.js';
import {createApp} from '../server/app.js';
import {datePlus} from '../server/domain.js';
import {localDate} from '../server/voting.js';
test('shared seasonal round, ten-YES limit, durable resume, early finish and cooked history',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'smart-vote-')),file=join(dir,'db.sqlite');
 let db=openDatabase(file),server,base;const cookies={};
 async function start(){server=createApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));base=`http://127.0.0.1:${server.address().port}/api`;}
 async function send(user,path,method='GET',body,status=200){const r=await fetch(base+path,{method,headers:{...(cookies[user]?{Cookie:cookies[user]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));if(r.headers.get('set-cookie'))cookies[user]=r.headers.get('set-cookie').split(';')[0];return data;}
 try{
 await start();await send('shani','/setup','POST',{adminPassword:'shani-password-1',jamesPassword:'james-password-1',xanderPassword:'xander-password-1'});
 for(const id of ['james','xander'])await send(id,'/login','POST',{userId:id,password:id+'-password-1'});
 let state=await send('shani','/state'),round=state.rounds[0];
 const pools=await Promise.all(['james','xander'].map(u=>send(u,'/state')));
 for(const s of pools)assert.deepEqual(s.rounds[0].recipeIds,round.recipeIds);
 const season=round.season,date=round.local_date;
 await send('shani','/seasonal-weight','PUT',{weight:.2});
 assert.equal((await send('shani','/state')).rounds[0].season,season);
 for(let i=0;i<2;i++)await send('shani','/votes','PUT',{roundId:round.id,recipeId:round.recipeIds[i],choice:i?'maybe':'no'});
 for(let i=2;i<12;i++)await send('shani','/votes','PUT',{roundId:round.id,recipeId:round.recipeIds[i],choice:'yes'});
 await send('shani','/votes','PUT',{roundId:round.id,recipeId:round.recipeIds[12],choice:'yes'},400);
 await new Promise(r=>server.close(r));db.close();db=openDatabase(file);await start();
 state=await send('shani','/state');assert.equal(state.votes.filter(v=>v.choice==='yes').length,10);assert.equal(state.rounds[0].local_date,date);
 await send('shani','/votes','PUT',{roundId:round.id,recipeId:round.recipeIds[11],choice:null});
 await send('shani','/votes','PUT',{roundId:round.id,recipeId:round.recipeIds[12],choice:'yes'});
 await send('james',`/rounds/${round.id}/finish`,'POST',{});
 assert.ok((await send('shani','/state')).rounds[0].finishedUsers.includes('james'));
 const plan={title:'Smart plan',roundId:round.id,startDate:localDate(),days:7,attendees:['shani','james','xander'],portions:3,leftovers:false};
 await send('shani','/menus/generate','POST',plan,400);
 const m=await send('shani','/menus/generate','POST',{...plan,provisional:true});
 state=await send('shani','/state');const dinner=state.menus.find(x=>x.id===m.id).days.find(d=>d.kind==='cook');
 const now=localDate(),weekday=new Date(now+'T12:00:00Z').getUTCDay();const lastSunday=datePlus(now,-((weekday+6)%7)-1);
 await send('shani',`/menu-days/${dinner.id}/cooked`,'POST',{date:lastSunday,diners:3});
 await send('shani','/rounds','POST',{title:'Next round'});
 state=await send('shani','/state');assert.ok(!state.rounds[0].recipeIds.includes(dinner.recipe_id));
 assert.equal(state.cookedMeals[0].cooked_date,lastSunday);
 // Planned but unconfirmed recipes are not excluded.
 const another=state.menus[0].days.find(d=>d.recipe_id&&d.recipe_id!==dinner.recipe_id);assert.ok(state.rounds[0].recipeIds.includes(another.recipe_id));
 const req=await send('xander','/requests','POST',{message:'2 boxes of soda',category:'grocery'});
 await send('shani',`/menus/${m.id}/approve`,'POST',{});
 await send('shani','/shopping/manual','POST',{menuId:m.id,name:'Soda',quantity:2,unit:'box',section:'Beverages',requestId:(await send("shani","/state")).requests[0].id},400);
 }finally{if(server)await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
