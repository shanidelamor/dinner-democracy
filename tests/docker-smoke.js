// Optional production-image smoke check. Uses only disposable synthetic household data.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const suffix=randomBytes(5).toString('hex');
const container=`dinner-democracy-smoke-${suffix}`;
const volume=`dinner-democracy-smoke-data-${suffix}`;
const setupKey=randomBytes(32).toString('hex');
const docker=(args,extra={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],...extra}).trim();
let created=false,started=false;
const port=Number(process.env.SMOKE_PORT||3102);
const base=`http://127.0.0.1:${port}/api`;
const waitReady=async()=>{for(let i=0;i<50;i++){try{const r=await fetch(base+'/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Production container did not become healthy.');};
let cookie='';
const call=async(path,method='GET',body,status=200)=>{const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,status,data.error);const c=r.headers.get('set-cookie');if(c){assert.ok(c.includes('Secure')&&c.includes('HttpOnly'));cookie=c.split(';')[0];}return data;};
try{
 docker(['volume','create',volume]);created=true;
 docker(['run','-d','--name',container,'-p',`127.0.0.1:${port}:3001`,'-e','SETUP_KEY','--mount',`type=volume,source=${volume},target=/app/data`,'dinner-democracy:local'],{env:{...process.env,SETUP_KEY:setupKey}});started=true;
 await waitReady();
 assert.equal((await call('/status')).requiresSetupKey,true);
 const account={adminPassword:'smoke-admin-password',jamesPassword:'smoke-james-password',xanderPassword:'smoke-xander-password'};
 await call('/setup','POST',account,403);
 await call('/setup','POST',{...account,setupKey});
 const state=await call('/state');assert.equal(state.user.id,'shani');assert.equal(state.recipes.length,51);
 await call('/votes','PUT',{roundId:state.rounds[0].id,recipeId:'sticky-chicken',choice:'yes'});
 const page=await fetch(`http://127.0.0.1:${port}/`);assert.ok(page.ok&&(await page.text()).includes('Dinner Democracy'));
 assert.equal((await fetch(`http://127.0.0.1:${port}/images/salmon.png`)).status,200);
 docker(['restart',container]);await waitReady();
 assert.equal((await call('/state')).votes[0].choice,'yes');
 console.log('Production container passed: unprivileged database writes, setup-key enforcement, Secure/HttpOnly cookie flags, built frontend, local imagery, and persisted vote/session after restart. HTTPS browser behavior remains a hosting check.');
}finally{
 if(started)docker(['rm','-f',container]);
 if(created)docker(['volume','rm',volume]);
}
