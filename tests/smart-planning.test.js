import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatePool,localDate,seasonFor,cookedWindow,voteSummary,votingDone} from '../server/voting.js';
import {shoppingList,generateDays,validateMenu} from '../server/domain.js';
import {recipes} from '../server/recipes.js';
import {openDatabase} from '../server/node-db.js';
const menu={id:1,status:'approved'};
const onion=(quantity,id='onion',unit='each')=>({id,name:id,quantity,unit,section:'Produce'});
const fixture=(id,ingredients)=>({id,title:id,servings:3,ingredients,category:'Dinner',protein:'Beef',cut:'Beef chuck',vegetables:'Carrots',cuisine:id});
const day=(id,recipe_id,portions=3)=>({id,recipe_id,kind:'cook',portions,date:`2026-10-${19+id}`,attendees:'["shani","james","xander"]'});
const list=(rs,days,extras={})=>shoppingList({menu,recipes:rs,days,tasks:[],...extras});
test('ten YES finishes; NO and MAYBE never contribute to goal',()=>{
 const votes=Array.from({length:20},(_,i)=>({choice:i%2?'no':'maybe'}));
 assert.equal(votingDone(votes,40),false);
 assert.equal(votingDone([...votes,...Array(9).fill({choice:'yes'})],40),false);
 assert.equal(votingDone([...votes,...Array(10).fill({choice:'yes'})],40),true);
 assert.equal(votingDone(votes,40,true),true);
 assert.equal(votingDone(votes,20),true);
});
test('round date uses Los Angeles at UTC season boundary',()=>{
 assert.equal(localDate(new Date('2026-12-01T03:00:00Z')),'2026-11-30');
 assert.equal(seasonFor(localDate(new Date('2026-12-01T03:00:00Z'))),'Fall');
 assert.equal(seasonFor('2026-12-01'),'Winter');
 assert.equal(seasonFor('2026-03-01'),'Spring');assert.equal(seasonFor('2026-06-01'),'Summer');
});
test('previous Monday–Sunday excludes actual cooking only, while 14 days deprioritizes',()=>{
 const h=[{recipe_id:'shepherds-pie',cooked_date:'2026-10-19'},{recipe_id:'short-ribs',cooked_date:'2026-10-25'},{recipe_id:'cider-pork',cooked_date:'2026-10-18'}];
 const pool=candidatePool(recipes,h,'2026-10-28');
 assert.ok(!pool.some(r=>['shepherds-pie','short-ribs'].includes(r.id)));
 assert.ok(pool.some(r=>r.id==='cider-pork'));
 assert.ok(cookedWindow(h,'2026-10-28').recent.has('cider-pork'));
 assert.deepEqual(candidatePool(recipes,h,'2026-10-28'),pool);
 assert.equal(new Set(pool.map(r=>r.id)).size,pool.length);
 assert.equal(candidatePool(recipes,h,'2026-10-28',0).length,pool.length);
});
test('family scores and unanimous priority preserve missing votes',()=>{
 assert.deepEqual(voteSummary([{user_id:'shani',choice:'yes'},{user_id:'james',choice:'maybe'}]),{score:4,unanimous:false});
 assert.deepEqual(voteSummary(['shani','james','xander'].map(user_id=>({user_id,choice:'yes'}))),{score:9,unanimous:true});
 assert.equal(voteSummary([{choice:'no'}]).score,0);
});
test('menu attends dietary rules, vegetables, per-day home choices and exact chicken cuts',()=>{
 const result=generateDays({recipes,votes:[],roundId:1,startDate:'2026-10-28',days:7,tacoDay:-1,leftovers:false,existing:[{date:'2026-10-29',kind:'out',attendees:'["shani"]',portions:1}]});
 assert.equal(result[1].kind,'out');
 validateMenu(result,recipes);
 for(const d of result.filter(d=>d.kind==='cook')) {
 const r=recipes.find(r=>r.id===d.recipe_id);assert.ok(r.vegetables);assert.ok(!['Fish','Shrimp'].includes(r.protein));if(r.protein==='Chicken')assert.ok(r.cut);
 }
});
test('fractional onions aggregate before rounding; red onions remain separate',()=>{
 const rs=[.5,.5,.25,.75].map((q,i)=>fixture(String(i),[onion(q)]));
 const items=list(rs,rs.map((r,i)=>day(i,r.id)));
 assert.equal(items[0].quantity,2);assert.equal(items[0].purchaseQuantity,2);
 const red=fixture('red',[onion(.25,'redOnion')]);
 const separated=list([...rs,red],[...rs.map((r,i)=>day(i,r.id)),day(5,'red')]);
 assert.equal(separated.length,2);assert.equal(separated.find(i=>i.ingredientId==='redOnion').purchaseQuantity,1);
});
test('servings and dish swaps recalculate use and purchases',()=>{
 const a=fixture('a',[onion(.5)]),b=fixture('b',[onion(.25)]);
 assert.equal(list([a,b],[day(1,'a',6)])[0].quantity,1);
 assert.equal(list([a,b],[day(1,'b',6)])[0].quantity,.5);
});
test('compatible volume and weight convert; no density guessing',()=>{
 const a=fixture('a',[onion(1,'oil','cup'),onion(1,'beef','lb')]);
 const b=fixture('b',[onion(2,'oil','tbsp'),onion(8,'beef','oz'),onion(3,'oil','oz')]);
 const items=list([a,b],[day(1,'a'),day(2,'b')]);
 assert.equal(items.find(i=>i.key==='oil:volume').quantity,270);
 assert.equal(items.find(i=>i.key==='beef:weight').quantity,24);
 assert.equal(items.filter(i=>i.ingredientId==='oil').length,2);
});
test('confirmed pantry subtracts compatibly then packages round without changing exact use',()=>{
 const a=fixture('a',[onion(2.5,'beef','lb')]);
 const items=list([a],[day(1,'a')],{inventory:[{ingredient_id:'beef',quantity:8,unit:'oz'}],purchaseRules:[{ingredient_id:'beef',package_size:1.5,unit:'lb'}]});
 assert.equal(items[0].quantity,40);assert.equal(items[0].requiredQuantity,32);assert.equal(items[0].purchaseQuantity,48);
 assert.equal(list([a],[day(1,'a')],{inventory:[{ingredient_id:'beef',quantity:200,unit:'cup'}]})[0].requiredQuantity,40);
});
test('only confirmed active grocery requests contribute, exact package quantities stay intact',()=>{
 const rs=[fixture('a',[onion(.5)])];
 const items=list(rs,[day(1,'a')],{manual:[{id:1,menu_id:1,active:1,name:'Soda',quantity:2,unit:'box',section:'Beverages',request_id:4},{id:2,menu_id:1,active:0,name:'Ice cream',quantity:1,unit:'pkg'}]});
 assert.equal(items.find(i=>i.name==='Soda').purchaseQuantity,2);assert.ok(!items.some(i=>i.name==='Ice cream'));
 assert.deepEqual(shoppingList({menu:{...menu,status:'draft'},recipes:rs,days:[],tasks:[]}),[]);
});
test('explicit canonical grocery request combines without a duplicate',()=>{
 const a=fixture('a',[onion(.5)]);
 const items=list([a],[day(1,'a')],{manual:[{id:1,menu_id:1,active:1,ingredient_id:'onion',quantity:1,unit:'each',name:'Yellow onion'}]});
 assert.equal(items.length,1);assert.equal(items[0].quantity,1.5);assert.equal(items[0].purchaseQuantity,2);
});
test('brisket tacos use cooking yield once and add only transformation ingredients',()=>{
 const days=[day(1,'brisket'),{...day(3,'brisket'),kind:'leftover',leftover_of:1,leftover_recipe_id:'brisket-tacos'}];
 validateMenu(days,recipes);
 const items=list(recipes,days);
 assert.equal(items.find(i=>i.ingredientId==='brisket').quantity,48);
 assert.ok(!items.some(i=>i.ingredientId==='cookedBrisket'));
 assert.equal(items.find(i=>i.ingredientId==='cornTortilla').quantity,9);
});
test('migration 5 is additive and repeatable; recipe season tags exist',()=>{
 const db=openDatabase(':memory:');
 assert.ok(db.prepare('SELECT 1 FROM schema_migrations WHERE version=5').get());
 for(const table of ['round_context','voter_progress','cooked_meals','purchase_rules','pantry_inventory','shopping_identity'])assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
 db.close();
});
test('non-equivalent ingredient forms remain separate',()=>{
 const a=fixture('a',[{...onion(.5),form:'raw'}]);
 const b=fixture('b',[{...onion(.5),form:'cooked'}]);
 assert.equal(list([a,b],[day(1,'a'),day(2,'b')]).length,2);
});
test('confirmed canonical family requests consolidate even without a recipe ingredient',()=>{
 const items=list([],[],{manual:[1,2].map(id=>({id,menu_id:1,active:1,ingredient_id:'soda',name:'Soda',quantity:2,unit:'box',section:'Beverages'}))});
 assert.equal(items.length,1);assert.equal(items[0].quantity,4);
});
test('pantry never reduces explicitly requested package quantities',()=>{
 const a=fixture('a',[onion(.5,'soda','box')]);
 const items=list([a],[day(1,'a')],{manual:[{id:1,menu_id:1,active:1,ingredient_id:'soda',quantity:2,unit:'box',name:'Soda'}],inventory:[{ingredient_id:'soda',quantity:10,unit:'box'}]});
 assert.equal(items[0].purchaseQuantity,2);
});
