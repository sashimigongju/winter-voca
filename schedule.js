// Private admin schedule management + read-only student link.
// Supabase RLS is authoritative: all admin writes are checked server-side.
const H=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=id=>document.getElementById(id);
const fmtDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const today=()=>fmtDate(new Date());
const nextMonday=()=>{
  const d=new Date();
  const daysAhead=((8-d.getDay())%7)||7;
  d.setDate(d.getDate()+daysAhead);
  return fmtDate(d);
};
const shiftMonth=(ym,offset)=>{const [y,m]=ym.split("-").map(Number);const d=new Date(y,m-1+offset,1);return fmtDate(d).slice(0,7)};
const formatMonth=ym=>{const [y,m]=ym.split("-");return y+"년 "+Number(m)+"월"};
const showDay=s=>{const d=new Date(s+"T12:00:00");return (d.getMonth()+1).toString().padStart(2,"0")+"." +d.getDate().toString().padStart(2,"0")+" ("+"일월화수목금토"[d.getDay()]+")"};
const asError=e=>e?.message||"요청을 처리하지 못했습니다.";
const uuid=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
const studentUrl=token=>location.origin+location.pathname+"#/student/"+token;
const monthRows=(data,month)=>data.filter(x=>x.study_date?.startsWith(month));
function tableRows(rows,categoryMap,{admin=false}={}){
 if(!rows.length)return '<div class="empty">이 달에 등록된 일정이 없습니다.</div>';
 return rows.map(s=>'<div class="schedule-row" data-id="'+H(s.id)+'"><span class="schedule-date">'+showDay(s.study_date)+'</span><div class="schedule-word"><strong>'+H(s.range_label)+'</strong><small>'+H(categoryMap[s.category_key]||s.category_name||"직접 입력")+'</small></div><div class="completion">'+(admin?'<button type="button" class="done-toggle '+(s.is_done?"done":"")+'" data-action="done" data-id="'+H(s.id)+'" aria-label="완료 표시 변경">'+(s.is_done?"✓":"")+'</button>':'<span class="readonly-done '+(s.is_done?"done":"")+'" aria-label="'+(s.is_done?"완료":"미완료")+'">'+(s.is_done?"✓":"")+'</span>')+'</div>'+(admin?'<div class="schedule-actions"><button type="button" data-action="edit" data-id="'+H(s.id)+'">수정</button><button type="button" data-action="delete" data-id="'+H(s.id)+'">삭제</button></div>':"")+'</div>').join("");
}
export async function mountStudent({token,root}){
 document.title="개인 단어 스케줄표 | Onlyone Edu";
 const base="https://jacgyoeelysvzycjrnlo.supabase.co/functions/v1/student-schedule";
 let month=today().slice(0,7),schedules=[],student=null;
 const header='<header class="pink-header"><div class="pink-header-inner"><a class="site-logo" href="#/" aria-label="온리원에듀"><img src="./assets/onlyone-pink-logo.webp" alt="Onlyone Edu 1:1" /></a></div></header>';
 root.innerHTML=header+'<main class="student-wrap"><div id="student-content"><div class="empty">개인 일정을 안전하게 불러오는 중…</div></div></main>';
 try{
  const response=await fetch(base+"?token="+encodeURIComponent(token),{method:"GET",headers:{"apikey":"sb_publishable_csRJ2AG42WLSOZy910cd8A_29y5AGf0"}});
  const payload=await response.json();
  if(!response.ok)throw new Error(response.status===404?"개인 링크가 올바르지 않거나 비활성화되었습니다.":(payload.error||"일정을 불러오지 못했습니다."));
  student=payload.student;schedules=payload.schedules||[];
 }catch(e){$("student-content").innerHTML='<section class="student-error"><h1>일정을 확인할 수 없습니다</h1><p>'+H(asError(e))+'</p></section>';return;}
 function draw(){
  const rows=monthRows(schedules,month);
  const completed=rows.filter(s=>s.is_done).length;
  $("student-content").innerHTML='<h1 class="student-heading">개인 단어 스케줄표</h1><section class="student-profile"><h2>'+H(student.name)+'</h2><p>'+H(student.school)+' '+H(student.grade)+' &nbsp; | &nbsp; '+Number(month.split("-")[1])+'월 학습 일정</p></section><div class="month-toolbar"><div><strong>'+formatMonth(month)+'</strong><small>총 '+rows.length+'개 중 '+completed+'개 완료</small></div><div class="month-arrows"><button id="student-prev" aria-label="이전 달">‹</button><button id="student-next" aria-label="다음 달">›</button><button id="student-print" class="print-button">인쇄</button></div></div><div class="schedule-table"><div class="schedule-head"><span>날짜</span><span>단어 범위</span><span>완료</span></div>'+tableRows(rows,{})+'</div>';
  $("student-prev").onclick=()=>{month=shiftMonth(month,-1);draw()};
  $("student-next").onclick=()=>{month=shiftMonth(month,1);draw()};
  $("student-print").onclick=()=>window.print();
 }
 draw();
}
export async function mountAdmin({supabase,shell}){
 document.title="단어 학습 관리 | Onlyone Edu";
 const state={students:[],cats:[],units:[],schedules:[],selected:null,month:today().slice(0,7),filter:""};
 let life=true,loadSeq=0;
 const content='<div class="admin-intro"><div><h2>개인 단어 스케줄표 <em>· 관리</em></h2><p id="student-total">학생을 불러오는 중입니다.</p></div><button id="view-student" class="pink-outline" type="button">학생 화면 보기</button></div><div class="admin-columns"><aside class="admin-side"><h3>학생 목록</h3><input id="student-search" placeholder="이름 · 학교 검색" aria-label="학생 검색"/><div id="student-list" class="student-list"></div><div class="side-add"><h3>새 학생 등록</h3><form id="student-add-form"><label>이름<input name="name" placeholder="학생 이름" required maxlength="50"/></label><label>학교<input name="school" placeholder="예: 예일여중" required maxlength="50"/></label><label>학년<input name="grade" placeholder="중3" maxlength="20"/></label><button type="submit" class="pink-outline full">+ 학생 추가</button></form></div></aside><section class="admin-main" id="student-detail"><div class="empty">왼쪽에서 학생을 선택해 주세요.</div></section></div>';
 shell(content);
 const note=(msg,error=false)=>{let t=$("admin-toast");if(!t){t=document.createElement("div");t.id="admin-toast";document.body.append(t)}t.textContent=msg;t.className=error?"admin-toast toast-error":"admin-toast";setTimeout(()=>{if(t.textContent===msg)t.classList.add("hidden")},3900)};
 const check=({error})=>{if(error)throw error};
 const init=async()=>{try{
   const [students,cats,units]=await Promise.all([
     supabase.from("students").select("id,name,school,grade,active,public_token,created_at").order("school").order("name"),
     supabase.from("vocab_categories").select("key,name,day_count,unit_count,sort_order").order("sort_order"),
     supabase.from("vocab_units").select("category_key,unit_order,label").order("category_key").order("unit_order")
   ]);
   check(students);check(cats);check(units);
   if(!life)return;
   state.students=students.data??[];state.cats=cats.data??[];state.units=units.data??[];
   renderList();
   if(state.students.length) await choose(state.students[0].id);
 }catch(e){note(asError(e),true);$("student-detail").innerHTML='<div class="empty">데이터를 불러오지 못했습니다. '+H(asError(e))+'</div>'}};
 $("student-search").oninput=e=>{state.filter=e.target.value;renderList()};
 $("student-add-form").onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector("button");btn.disabled=true;const data=new FormData(e.currentTarget);try{
   const result=await supabase.from("students").insert({name:String(data.get("name")).trim(),school:String(data.get("school")).trim(),grade:String(data.get("grade")).trim()||"중3"}).select("id,name,school,grade,active,public_token,created_at").single();check(result);state.students.push(result.data);e.currentTarget.reset();renderList();await choose(result.data.id);note("학생이 등록되었습니다.");
 }catch(err){note(asError(err),true)}finally{btn.disabled=false}};
 $("view-student").onclick=()=>{const s=state.students.find(x=>x.id===state.selected);if(!s)return note("학생을 먼저 선택해 주세요.",true);window.open(studentUrl(s.public_token),"_blank","noopener,noreferrer")};
 function renderList(){
   $("student-total").textContent="전체 학생 "+state.students.length+"명 · 관리자 전용";
   const selected=state.students.filter(s=>(s.name+" "+s.school).toLowerCase().includes(state.filter.toLowerCase()));
   const bySchool={};for(const s of selected)(bySchool[s.school]??=[]).push(s);
   $("student-list").innerHTML=Object.entries(bySchool).map(([school,ss])=>'<div class="school-group"><small>'+H(school)+' ('+ss.length+'명)</small>'+ss.map(s=>'<button data-student="'+H(s.id)+'" class="student-entry '+(s.id===state.selected?"selected":"")+'"><span>'+H(s.name)+'</span><small>'+(s.active?"":"비활성 · ")+H(s.grade)+'</small></button>').join("")+'</div>').join("")||'<div class="empty">등록된 학생이 없습니다.</div>';
   document.querySelectorAll("[data-student]").forEach(b=>b.onclick=()=>choose(b.dataset.student));
 }
 const getCategory=()=>state.cats.find(x=>x.key===$("auto-category")?.value);
 const unitsOf=key=>state.units.filter(x=>x.category_key===key);
 const options=(arr,selectVal,key,label)=>arr.map(x=>'<option value="'+H(x[key])+'" '+(String(x[key])===String(selectVal)?"selected":"")+'>'+H(x[label])+'</option>').join("");
 async function choose(id){
  state.selected=id;state.month=today().slice(0,7);renderList();
  const s=state.students.find(x=>x.id===id);if(!s)return;
  $("student-detail").innerHTML='<div class="empty">학생 일정을 불러오는 중…</div>';
  await refreshSchedules(id);
 }
 async function refreshSchedules(id=state.selected){
  const serial=++loadSeq;
  const result=await supabase.from("schedules").select("id,student_id,study_date,range_label,category_key,unit_order,is_done,created_at").eq("student_id",id).order("study_date").order("created_at");
  if(serial!==loadSeq||!life||id!==state.selected)return;
  if(result.error){note(asError(result.error),true);return}
  state.schedules=result.data??[];drawDetail();
 }
 function catSelect(id,selected){
  return '<select id="'+id+'">'+options(state.cats,selected,"key","name")+'</select>';
 }
 function unitSelect(id,key,selected){
  return '<select id="'+id+'">'+options(unitsOf(key),selected,"unit_order","label")+'</select>';
 }
 function drawDetail(){
  const student=state.students.find(x=>x.id===state.selected);
  if(!student){$("student-detail").innerHTML='<div class="empty">학생을 선택해 주세요.</div>';return}
  const cat=state.cats[0]?.key||"";
  const rows=monthRows(state.schedules,state.month);
  const categoryMap=Object.fromEntries(state.cats.map(c=>[c.key,c.name]));
  const completed=state.schedules.filter(x=>x.is_done).length;
  $("student-detail").innerHTML=
   '<div class="detail-heading"><div><h3>'+H(student.name)+' <small>'+H(student.school)+' '+H(student.grade)+'</small></h3><p>등록된 학습 '+state.schedules.length+'개 · 완료 '+completed+'개</p></div><div class="detail-actions"><button id="edit-student" class="tiny-button">학생 정보 수정</button><button id="deactivate-student" class="tiny-button">'+(student.active?"비활성화":"활성화")+'</button></div></div>'+
   '<section class="detail-block"><h4>개인 링크</h4><div class="copy-row"><input id="student-url" value="'+H(studentUrl(student.public_token))+'" readonly/><button id="copy-link" class="pink-outline">복사</button><button id="open-link" class="tiny-button">열기</button></div><button id="regenerate-link" class="tiny-button">링크 재발급</button></section>'+
   '<section class="detail-block"><h4>스케줄 자동 생성</h4><div class="field-grid"><label>단어장'+catSelect("auto-category",cat)+'</label><label>시작 범위'+unitSelect("auto-unit",cat,1)+'</label><label>시작일<input id="auto-date" type="date" value="'+nextMonday()+'"/></label><label>학습 횟수<input id="auto-count" type="number" min="1" max="365" value="10"/></label></div><label class="weekday-label">학습 요일</label><div class="weekday-controls">'+["일","월","화","수","목","금","토"].map((d,i)=>'<label><input type="checkbox" value="'+i+'" '+([1,2,3,4,5].includes(i)?"checked":"")+'/> '+d+'</label>').join("")+'</div><button id="auto-generate" class="pink-button">일정 자동 배정</button></section>'+
   '<section class="detail-block"><h4>직접 일정 추가</h4><div class="field-grid"><label>날짜<input id="manual-date" type="date" value="'+nextMonday()+'"/></label><label>단어장'+catSelect("manual-category",cat)+'</label><label>단어 범위'+unitSelect("manual-unit",cat,1)+'</label><label>직접 입력 (선택)<input id="manual-label" placeholder="예: DAY 01–03 복습"/></label></div><button id="manual-add" class="pink-outline">+ 일정 추가</button></section>'+
   '<section class="detail-block schedule-section"><div class="month-toolbar"><div><h4>학습 일정</h4><small>'+formatMonth(state.month)+' · '+rows.filter(r=>r.is_done).length+'/'+rows.length+' 완료</small></div><div class="month-arrows"><button id="prev-month">‹</button><span>'+formatMonth(state.month)+'</span><button id="next-month">›</button><button id="print-month" class="tiny-button">인쇄</button></div></div><div class="schedule-table admin-schedule"><div class="schedule-head"><span>날짜</span><span>단어 범위</span><span>완료</span><span>관리</span></div>'+tableRows(rows,categoryMap,{admin:true})+'</div><div id="edit-slot"></div></section>';
  $("auto-category").onchange=()=>{$("auto-unit").innerHTML=unitSelect("unused",$("auto-category").value,1).replace(/^<select[^>]*>|<\/select>$/g,"")};
  $("manual-category").onchange=()=>{$("manual-unit").innerHTML=unitSelect("unused",$("manual-category").value,1).replace(/^<select[^>]*>|<\/select>$/g,"")};
  $("copy-link").onclick=async()=>{try{await navigator.clipboard.writeText(studentUrl(student.public_token));note("학생 개인 링크를 복사했습니다.")}catch{const el=$("student-url");el.select();document.execCommand("copy");note("링크 복사를 시도했습니다.")}};
  $("open-link").onclick=()=>window.open(studentUrl(student.public_token),"_blank","noopener,noreferrer");
  $("regenerate-link").onclick=async()=>{if(!confirm("기존 학생 링크는 더 이상 작동하지 않습니다. 새 링크를 발급할까요?"))return;try{const token=uuid();const result=await supabase.from("students").update({public_token:token}).eq("id",student.id).select("public_token").single();check(result);student.public_token=result.data.public_token;drawDetail();note("새 학생 링크를 발급했습니다.")}catch(e){note(asError(e),true)}};
  $("deactivate-student").onclick=async()=>{try{const result=await supabase.from("students").update({active:!student.active}).eq("id",student.id).select("active").single();check(result);student.active=result.data.active;drawDetail();renderList();note("학생 상태를 변경했습니다.")}catch(e){note(asError(e),true)}};
  $("edit-student").onclick=()=>editStudent(student);
  $("auto-generate").onclick=()=>generate();
  $("manual-add").onclick=()=>manualAdd();
  $("prev-month").onclick=()=>{state.month=shiftMonth(state.month,-1);drawDetail()};
  $("next-month").onclick=()=>{state.month=shiftMonth(state.month,1);drawDetail()};
  $("print-month").onclick=()=>printMonth(student,rows,categoryMap);
  document.querySelectorAll("button[data-action]").forEach(button=>button.onclick=()=>scheduleAction(button.dataset.action,button.dataset.id));
 }
 function editStudent(student){
  const name=prompt("학생 이름",student.name);if(name===null)return;
  const school=prompt("학교",student.school);if(school===null)return;
  const grade=prompt("학년",student.grade);if(grade===null)return;
  if(!name.trim()||!school.trim()){note("이름과 학교는 필수입니다.",true);return;}
  (async()=>{try{const r=await supabase.from("students").update({name:name.trim(),school:school.trim(),grade:grade.trim()||"중3"}).eq("id",student.id).select().single();check(r);Object.assign(student,r.data);renderList();drawDetail();note("학생 정보를 변경했습니다.")}catch(e){note(asError(e),true)}})();
 }
 async function generate(){
  const cat=$("auto-category").value, start=Number($("auto-unit").value), date=$("auto-date").value,count=Number($("auto-count").value);
  const days=[...document.querySelectorAll(".weekday-controls input:checked")].map(x=>Number(x.value));
  if(!date||!days.length||!Number.isInteger(count)||count<1||count>365)return note("시작일, 학습 요일, 횟수를 확인해 주세요.",true);
  const units=unitsOf(cat);const startIdx=units.findIndex(x=>x.unit_order===start);
  if(startIdx<0)return note("유효한 시작 단원을 선택해 주세요.",true);
  const category=state.cats.find(x=>x.key===cat);
  // DAY 01–60 are regular study units. Extra vocabulary sections are only
  // sequenced if the teacher deliberately starts within those extra sections.
  const available=start<=category.day_count ? category.day_count-start+1 : units.length-startIdx;
  const actualCount=Math.min(count,available);
  if(actualCount<=0)return note("배정할 수 있는 단원이 없습니다.",true);
  let d=new Date(date+"T12:00:00");const drafts=[],existing=new Set(state.schedules.map(x=>x.study_date+"|"+x.category_key+"|"+x.unit_order));
  for(let i=0,safety=0;i<actualCount&&safety<2500;safety++,d.setDate(d.getDate()+1)){
   if(!days.includes(d.getDay()))continue;
   const unit=units[startIdx+i];const dateStr=fmtDate(d);
   if(existing.has(dateStr+"|"+cat+"|"+unit.unit_order))return note("이미 동일한 날짜와 단어 범위가 있습니다. 중복 일정은 생성하지 않았습니다.",true);
   drafts.push({student_id:state.selected,study_date:dateStr,category_key:cat,unit_order:unit.unit_order,range_label:unit.label,is_done:false});i++;
  }
  if(drafts.length!==actualCount)return note("일정 계산에 실패했습니다.",true);
  if(!confirm(drafts.length+"개의 학습 일정을 추가할까요? 기존 일정은 유지됩니다."))return;
  $("auto-generate").disabled=true;
  try{for(let i=0;i<drafts.length;i+=100){const r=await supabase.from("schedules").insert(drafts.slice(i,i+100));check(r)}state.month=drafts[0].study_date.slice(0,7);await refreshSchedules();note(drafts.length+"개의 일정이 추가되었습니다.")}catch(e){note(asError(e),true);await refreshSchedules()}
 }
 async function manualAdd(){
  const cat=$("manual-category").value;const unit=unitsOf(cat).find(x=>x.unit_order===Number($("manual-unit").value));const label=$("manual-label").value.trim()||unit?.label;const date=$("manual-date").value;
  if(!date||!label)return note("날짜와 단어 범위를 선택해 주세요.",true);
  if(label.length>100)return note("일정 이름은 100자 이하로 입력해 주세요.",true);
  $("manual-add").disabled=true;
  try{const r=await supabase.from("schedules").insert({student_id:state.selected,study_date:date,category_key:cat,unit_order:unit?.unit_order,range_label:label});check(r);state.month=date.slice(0,7);await refreshSchedules();note("일정을 추가했습니다.")}catch(e){note(asError(e),true)}finally{const btn=$("manual-add");if(btn)btn.disabled=false}
 }
 async function scheduleAction(action,id){
  const s=state.schedules.find(x=>x.id===id);if(!s)return;
  if(action==="done"){try{check(await supabase.from("schedules").update({is_done:!s.is_done}).eq("id",id));s.is_done=!s.is_done;drawDetail()}catch(e){note(asError(e),true)}return}
  if(action==="delete"){if(!confirm(showDay(s.study_date)+" "+s.range_label+" 일정을 삭제할까요?"))return;try{check(await supabase.from("schedules").delete().eq("id",id));await refreshSchedules();note("일정을 삭제했습니다.")}catch(e){note(asError(e),true)}return}
  if(action==="edit"){
   const slot=$("edit-slot");
   const c=s.category_key||state.cats[0]?.key;
   slot.innerHTML='<div class="edit-panel"><h4>일정 수정</h4><div class="field-grid"><label>날짜<input id="edit-date" type="date" value="'+H(s.study_date)+'"/></label><label>단어장'+catSelect("edit-category",c)+'</label><label>범위'+unitSelect("edit-unit",c,s.unit_order)+'</label><label>표시 내용<input id="edit-label" maxlength="100" value="'+H(s.range_label)+'"/></label></div><div class="edit-actions"><button id="save-edit" class="pink-button">저장</button><button id="cancel-edit" class="tiny-button">취소</button></div></div>';
   $("edit-category").onchange=()=>{$("edit-unit").innerHTML=unitSelect("unused",$("edit-category").value,1).replace(/^<select[^>]*>|<\/select>$/g,"")};
   $("cancel-edit").onclick=()=>slot.innerHTML="";
   $("save-edit").onclick=async()=>{
    const cat=$("edit-category").value,order=Number($("edit-unit").value),label=$("edit-label").value.trim(),date=$("edit-date").value;
    if(!label||!date)return note("날짜와 표시 내용을 입력하세요.",true);
    try{const r=await supabase.from("schedules").update({study_date:date,category_key:cat,unit_order:order,range_label:label}).eq("id",id);check(r);state.month=date.slice(0,7);await refreshSchedules();note("일정을 수정했습니다.")}catch(e){note(asError(e),true)}
   };
   slot.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
 }
 function printMonth(student,rows,categoryMap){
  const win=window.open("","_blank","width=880,height=950");if(!win)return note("팝업이 차단되어 있습니다.",true);
  win.document.write('<!doctype html><html lang="ko"><head><meta charset="UTF-8"/><title>'+H(student.name)+' 단어 스케줄표</title><style>body{font-family:sans-serif;margin:35px;color:#262626}h1{font-size:26px}h2{font-size:19px;border-left:4px solid #e975a4;padding-left:12px}table{border-collapse:collapse;width:100%;margin-top:25px}td,th{border-bottom:1px solid #ddd;padding:13px;text-align:left;font-size:13px}th{background:#fdf0f6}small{color:#777}@media print{body{margin:15mm}}</style></head><body><h1>개인 단어 스케줄표</h1><h2>'+H(student.name)+' · '+H(student.school)+' '+H(student.grade)+' · '+formatMonth(state.month)+'</h2><table><thead><tr><th>날짜</th><th>단어 범위</th><th>완료</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+showDay(x.study_date)+'</td><td>'+H(x.range_label)+'<br/><small>'+H(categoryMap[x.category_key]||"직접 입력")+'</small></td><td>'+(x.is_done?"✓":"○")+'</td></tr>').join("")+'</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>');win.document.close();
 }
 await init();
}
