// Administrator-only daily range query and secure handoff to the existing exam site.
// No student name or schedule is written to the URL or to local storage.
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const parts=(date=new Date())=>Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).filter(x=>["year","month","day"].includes(x.type)).map(x=>[x.type,x.value]));
export const kstDate=()=>{const p=parts();return p.year+"-"+p.month+"-"+p.day};
const shift=(iso,diff)=>new Date(Date.parse(iso+"T12:00:00Z")+diff*86400000).toISOString().slice(0,10);
function fromCommand(text){
 const q=String(text||"").trim();
 if(!/(전체|애들|학생|신도중|예일여중)/.test(q)||!/(범위|시험지|출력)/.test(q))return null;
 const today=kstDate();let date=today;
 if(/모레/.test(q))date=shift(today,2);
 else if(/내일/.test(q))date=shift(today,1);
 else if(/어제/.test(q))date=shift(today,-1);
 const iso=q.match(/\b(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?\b/);
 const md=q.match(/(\d{1,2})월\s*(\d{1,2})일?/);
 if(iso)date=[iso[1],iso[2].padStart(2,"0"),iso[3].padStart(2,"0")].join("-");
 else if(md)date=today.slice(0,4)+"-"+md[1].padStart(2,"0")+"-"+md[2].padStart(2,"0");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+"T12:00:00Z").toISOString().slice(0,10)!==date)return null;
 return {date,school:q.includes("신도중")?"신도중":q.includes("예일여중")?"예일여중":null,wantsPrint:/출력|인쇄/.test(q)};
}
const BOOK_IDS={"onlyone-voca":"onlyone","neungyul-headwords":"neunglyul","neungyul-basic":"neunglyulBase","neungyul-light":"neunglyulLite","priority-beginner":"priorityBeginner"};
const canonical=(name)=>/^DAY\s*0*(\d+)$/i.test(name)?("Day "+String(Number(name.match(/\d+/)[0])).padStart(2,"0")):name.trim();
function rangeUnits(s,units){
 const list=units.filter(x=>x.category_key===s.category_key);
 let orders=[...(Array.isArray(s.carry_unit_orders)?s.carry_unit_orders:[])];
 if(Number.isInteger(s.unit_order))orders.push(s.unit_order);
 const original=list.find(x=>x.unit_order===s.unit_order)?.label||"";
 if(s.range_label.trim()!==original&&orders.length===1){
   const match=s.range_label.match(/^DAY\s*0*(\d+)\s*[-~–]\s*(?:DAY\s*)?0*(\d+)(?:\s*복습)?$/i);
   if(match){const a=+match[1],b=+match[2];if(a<=b&&b-a<=65)orders=Array.from({length:b-a+1},(_,i)=>a+i);}
   else if(!/^DAY\s*0*\d+$/i.test(s.range_label.trim()))return null;
 }
 orders=[...new Set(orders)].sort((a,b)=>a-b);
 if(!orders.length)return null;
 const labels=orders.map(n=>list.find(x=>x.unit_order===n)?.label);
 if(labels.some(x=>!x))return null;
 return labels.map(canonical);
}
export function mountTodayManager({supabase,students,cats,units,notify=()=>{}}){
 const host=document.createElement("section");host.className="today-manager";
 host.innerHTML='<div class="today-manager-head"><div><h3>날짜별 전체 단어 범위</h3><p>관리자 전용 · 조회 후 보카 플랫폼으로 시험지 전달</p></div><div class="today-manager-controls"><input type="date" id="daily-date" aria-label="시험 날짜"/><select id="daily-school" aria-label="학교"><option value="">전체 학교</option></select><button type="button" class="pink-outline" id="daily-refresh">범위 조회</button><button type="button" class="pink-button" id="daily-print">시험지 전체 출력</button></div></div><div id="daily-result" class="daily-result">조회할 날짜를 선택하세요.</div>';
 const anchor=document.querySelector(".admin-columns");if(anchor)anchor.before(host);
 let byId=new Map(students.map(s=>[s.id,s]));
 const byCat=new Map(cats.map(c=>[c.key,c.name]));
 function syncRoster(){
   byId=new Map(students.map(s=>[s.id,s]));
   const selected=schoolField.value;
   const schools=[...new Set(students.filter(s=>s.active!==false).map(s=>s.school).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"));
   schoolField.innerHTML='<option value="">전체 학교</option>'+schools.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join("");
   if(schools.includes(selected))schoolField.value=selected;
 }
 const dateField=host.querySelector("#daily-date"),schoolField=host.querySelector("#daily-school"),result=host.querySelector("#daily-result");
 dateField.value=kstDate();
 let lastRows=[],lastDate="",lastDisplayRows=[],requestId=0;
 syncRoster();
 async function refresh(){
  const id=++requestId,date=dateField.value;
  const school=schoolField.value;
  lastDate="";
  result.textContent="일정을 조회하는 중…";
  try{
   const {data,error}=await supabase.from("schedules").select("id,student_id,study_date,range_label,category_key,unit_order,carry_unit_orders,is_done").eq("study_date",date).order("created_at");
   if(id!==requestId)return;
   if(error)throw error;
   syncRoster();
   const roster=students.filter(s=>s.active!==false&&(!school||s.school===school))
     .sort((a,b)=>a.school.localeCompare(b.school,"ko")||a.name.localeCompare(b.name,"ko"));
   const byStudent=new Map();
   const filtered=(data||[]).filter(r=>byId.has(r.student_id)&&byId.get(r.student_id).active!==false&&(!school||byId.get(r.student_id).school===school));
   for(const r of filtered){
     if(!byStudent.has(r.student_id))byStudent.set(r.student_id,[]);
     byStudent.get(r.student_id).push(r);
   }
   const scheduled=roster.filter(s=>byStudent.has(s.id)).length;
   const missing=roster.length-scheduled;
   lastRows=filtered;
   lastDate=date;
   lastDisplayRows=[];
   const visibleRows=roster.map(student=>{
     const items=byStudent.get(student.id)||[];
     if(!items.length){
       lastDisplayRows.push(student.school+" "+student.name+" · 해당 날짜 미배정");
       return '<div class="daily-table-row is-unscheduled"><span>'+esc(student.school)+' · <b>'+esc(student.name)+'</b></span><span class="daily-unassigned">해당 날짜 미배정</span><span>—</span></div>';
     }
     return items.map(r=>{
       const category=byCat.get(r.category_key)||"직접 입력";
       lastDisplayRows.push(student.school+" "+student.name+" · "+category+" "+r.range_label+(r.is_done?" ✓":""));
       return '<div class="daily-table-row"><span>'+esc(student.school)+' · <b>'+esc(student.name)+'</b></span><span><small>'+esc(category)+'</small><br>'+esc(r.range_label)+'</span><span>'+(r.is_done?"✓":"○")+'</span></div>';
     }).join("");
   }).join("");
   result.innerHTML='<p class="daily-counts">전체 '+roster.length+'명 · 일정 배정 '+scheduled+'명 · 미배정 '+missing+'명</p>'+
      (roster.length?'<div class="daily-table-head"><span>학생</span><span>교재 · 단어 범위</span><span>완료</span></div>'+visibleRows:'<p>해당 학교에 등록된 학생이 없습니다.</p>');
  }catch(e){
   if(id!==requestId)return;
   lastRows=[];lastDisplayRows=[];lastDate="";
   result.textContent="조회 실패: "+(e.message||String(e));
  }
 }
 function payload(){
  if(lastDate!==dateField.value)throw Error("변경한 날짜로 먼저 다시 조회해 주세요.");
  const selected=lastRows,groups=new Map(),errors=[];
  for(const r of selected){
   const s=byId.get(r.student_id),bookId=BOOK_IDS[r.category_key],names=rangeUnits(r,units);
   if(!s||!bookId||!names){errors.push((s?.name||"알 수 없음")+" · "+r.range_label);continue;}
   const key=s.id+"|"+bookId;
   if(!groups.has(key))groups.set(key,{name:s.name,bookId,examDate:lastDate,names:[]});
   const group=groups.get(key);group.names=[...new Set([...group.names,...names])];
  }
  if(errors.length)throw Error("인쇄 범위를 정확히 해석하지 못한 일정이 있어요. 직접 수정한 범위를 확인해 주세요: "+errors.join(", "));
  if(!groups.size)throw Error("출력할 학생 일정이 없습니다.");
  if(groups.size>100)throw Error("한 번에 최대 100개 시험지 그룹까지 전달합니다.");
  return {type:"ONLYONE_VOCA_DATA_V1",nonce:crypto.randomUUID(),students:[...groups.values()]};
 }
 function print(){
  let data;try{data=payload()}catch(e){notify(e.message,true);return;}
  const url=location.origin+"/voca-platform/?onlyone-import=1";
  let popup;const timeout=window.setTimeout(()=>{window.removeEventListener("message",send);notify("시험지 플랫폼이 연결되지 않았어요. 팝업과 배포 상태를 확인해 주세요.",true)},16000);
  function send(event){
   if(event.origin!==location.origin||event.source!==popup||event.data?.type!=="ONLYONE_VOCA_READY_V1")return;
   window.clearTimeout(timeout);window.removeEventListener("message",send);
   popup.postMessage(data,location.origin);
   notify(data.students.length+"명(교재별) 범위를 시험지 플랫폼으로 전달했습니다.");
  }
  window.addEventListener("message",send);
  popup=window.open(url,"_blank");
  if(!popup){window.clearTimeout(timeout);window.removeEventListener("message",send);notify("팝업이 차단됐어요. 팝업을 허용해 주세요.",true);}
 }
 host.querySelector("#daily-refresh").onclick=()=>void refresh();
 host.querySelector("#daily-print").onclick=()=>{if(lastDate!==dateField.value){notify("먼저 선택한 날짜를 조회해 주세요.",true);return;}print()};
 schoolField.onchange=()=>void refresh();
 async function handleCommand(text){
  const parsed=fromCommand(text);if(!parsed)return null;
  dateField.value=parsed.date;schoolField.value=parsed.school||"";
  await refresh();
  if(lastDate!==parsed.date)return {message:"해당 날짜 조회에 실패했어요. 다시 조회해 주세요.",details:[]};
  const message=parsed.date+" 전체 학생 범위 ("+lastDisplayRows.length+"개 표시)";
  if(parsed.wantsPrint)return {message:message+" · 범위가 배정된 학생만 출력할 수 있어요. 위의 '시험지 전체 출력'을 눌러 주세요.",details:lastDisplayRows};
  return {message,details:lastDisplayRows};
 }
 void refresh();
 return {refresh,handleCommand};
}
