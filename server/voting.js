import { datePlus } from './domain.js';
export const localDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const seasonFor = date => ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Fall','Fall','Fall','Winter'][Number(date.slice(5,7))-1];
export function seasonTags(r) {
  if (['shepherds-pie','short-ribs','cider-pork','pumpkin-curry','mushroom-chicken','beef-ragu'].includes(r.id) || r.tags?.includes('New for fall')) return ['Fall'];
  if (['chimichurri','thai-beef','crispy-salmon','lamb-burgers'].includes(r.id)) return ['Summer'];
  return ['All seasons'];
}
export function cookedWindow(history, date) {
  const weekday = new Date(date+'T12:00:00Z').getUTCDay();
  const monday = datePlus(date,-((weekday+6)%7));
  return {excluded: new Set(history.filter(h=>h.cooked_date>=datePlus(monday,-7)&&h.cooked_date<monday).map(h=>h.recipe_id)),recent:new Set(history.filter(h=>h.cooked_date>=datePlus(date,-14)&&h.cooked_date<=date).map(h=>h.recipe_id))};
}
export function candidatePool(recipes, history, date, weight=.6) {
  const {excluded,recent}=cookedWindow(history,date), season=seasonFor(date);
  const eligible=recipes.filter(r=>r.category==='Dinner'&&!r.archived&&!excluded.has(r.id));
  const seasonal=[], other=[];
  for(const r of eligible) ((r.seasons||seasonTags(r)).includes(season)?seasonal:other).push(r);
  for(const group of [seasonal,other]) group.sort((a,b)=>Number(recent.has(a.id))-Number(recent.has(b.id))||a.id.localeCompare(b.id));
  const out=[]; while(seasonal.length||other.length) {
    const group=seasonal.length && (!other.length || out.filter(r=>(r.seasons||seasonTags(r)).includes(season)).length < (out.length+1)*weight) ? seasonal:other;
    out.push(group.shift());
  } return out;
}
export const voteSummary = votes => ({score:votes.reduce((n,v)=>n+({yes:3,maybe:1,no:0}[v.choice]||0),0), unanimous:['shani','james','xander'].every(id=>votes.some(v=>v.user_id===id&&v.choice==='yes'))});
export const votingDone = (votes,total,finished=false) => finished || votes.filter(v=>v.choice==='yes').length>=10 || votes.length>=total;
