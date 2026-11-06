(()=>{'use strict';
 const base='https://flova-evaluation-feedback.qiya649018.chatgpt.site/planner-comparison/index.html';
 const link=(id,target,label)=>{const a=document.createElement('a');a.className='collab-feedback';a.textContent=label;a.href=base+'#'+new URLSearchParams({case:id,feedback:target});a.target='_blank';a.rel='noopener';a.dataset.collab='1';return a;};
 function enhance(){const id=new URLSearchParams(location.hash.slice(1)).get('case');
  const hero=document.querySelector('.hero');if(hero&&!document.querySelector('.collab-banner')){const b=document.createElement('aside');b.className='collab-banner';const text=document.createElement('div');text.innerHTML='<strong>评估共评版已开放</strong><span>每条标准与评分都可以反馈，大家的意见会统一保存、回收统计。</span>';b.append(text);const a=document.createElement('a');a.href=base+(id?'#case='+encodeURIComponent(id):'');a.textContent='进入共评版 ↗';a.className='collab-main';a.target='_blank';a.rel='noopener';b.append(a);hero.after(b);}
  document.querySelectorAll('tr[data-case]').forEach(row=>{const cell=row.querySelector('td:last-child');if(cell&&!cell.querySelector('[data-collab]')){cell.textContent='';cell.append(link(row.dataset.case,'planner:case','反馈 ↗'));}});
  if(!id)return;
  if(hero&&!hero.querySelector('[data-collab]'))hero.append(link(id,'planner:case','反馈这条用例 ↗'));
  document.querySelectorAll('.rstandard').forEach(cell=>{if(cell.querySelector('[data-collab]'))return;const ci=cell.querySelector('.criterionname')?.textContent.split(' / ')[0]?.trim();if(!ci)return;cell.append(link(id,'rubric:'+ci,'反馈此标准 ↗'));let n=cell.nextElementSibling;for(const arm of ['reference','terra','deepseek']){if(n){n.append(link(id,'absolute:'+arm+':'+ci,'反馈此评分 ↗'));n=n.nextElementSibling;}}});
  document.querySelectorAll('.paircard').forEach((card,i)=>card.querySelectorAll('.pairrow').forEach(row=>{if(!row.querySelector('[data-collab]')){const pi=row.querySelector('.pairname')?.textContent.split(' · ')[0]?.trim();if(pi)row.append(link(id,'pair:'+['terra','deepseek'][i]+':'+pi,'反馈此双向结论 ↗'));}}));
 }
 document.addEventListener('click',e=>{if(e.target.closest('[data-collab]'))e.stopPropagation();},true);document.addEventListener('keydown',e=>{if(e.target.closest('[data-collab]'))e.stopPropagation();},true);
 new MutationObserver(enhance).observe(document.querySelector('#app'),{childList:true,subtree:true});enhance();
})();
