import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ORIGINS = new Set(["https://sashimigongju.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
type Command={intent:string;student?:string;school?:string;date?:string;book?:string;day?:number;sessions?:number;target?:string;label?:string;done?:boolean;month?:string;message?:string};
const pad=(x:number)=>String(x).padStart(2,"0");
function kstToday():string{
 const v=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return v.year+"-"+v.month+"-"+v.day;
}
function dateUTC(s:string){return new Date(s+"T12:00:00Z");}
function strDate(d:Date){return d.toISOString().slice(0,10);}
function addDays(s:string,n:number){const d=dateUTC(s);d.setUTCDate(d.getUTCDate()+n);return strDate(d);}
function getDow(s:string){return dateUTC(s).getUTCDay();}
function nextWeekday(s:string,steps=1){let d=s;for(let i=0;i<steps;i++){do{d=addDays(d,1);}while(getDow(d)===0||getDow(d)===6);}return d;}
function mondayOfNextWeek(s:string){const dow=(getDow(s)+6)%7;return addDays(s,7-dow);}
function parseDate(text:string,base=kstToday()):string|null{
 const iso=text.match(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/);
 if(iso){const d=iso[1]+"-"+pad(+iso[2])+"-"+pad(+iso[3]);return strDate(dateUTC(d))===d?d:null;}
 const md=text.match(/(?:\b(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/)||text.match(/\b(\d{1,2})[/.](\d{1,2})(?!\d)/);
 if(md){let year=+base.slice(0,4),month:number,day:number;if(md.length===4){year=+(md[1]||year);month=+md[2];day=+md[3];}else{month=+md[1];day=+md[2];}const d=year+"-"+pad(month)+"-"+pad(day);return strDate(dateUTC(d))===d?d:null;}
 // Choose the origin of a requested move ("오늘부터") over its destination ("내일로").
 const offsets:Record<string,number>={"그저께":-2,"그제":-2,"어제":-1,"오늘":0,"내일":1,"모레":2};
 const origin=text.match(/(그저께|그제|어제|오늘|내일|모레)(?:\s*(?:할|예정인|단어장|일정|수업|스케줄|학습|DAY\s*\d+)){0,2}\s*부터/)
  ||text.match(/(그저께|그제|어제|오늘|내일|모레)\s*(?:결석|휴강|빠졌|빠져|못\s*나)/);
 if(origin)return addDays(base,offsets[origin[1]]);
 const relative=text.match(/그저께|그제|어제|오늘|내일|모레/);
 if(relative)return addDays(base,offsets[relative[0]]);
 const weeks=text.match(/(다음\s*주|이번\s*주|차주)\s*(월|화|수|목|금|토|일)\s*요일?/);
 const single=text.match(/(월|화|수|목|금|토|일)요일/);
 const dowName=weeks?.[2]||single?.[1];
 if(dowName){
  const wanted={일:0,월:1,화:2,수:3,목:4,금:5,토:6}[dowName]!;
  if(weeks){const thisMonday=addDays(base,-((getDow(base)+6)%7));return addDays(thisMonday,(weeks[1].includes("다음")||weeks[1]==="차주"?7:0)+(wanted===0?6:wanted-1));}
  const delta=(wanted-getDow(base)+7)%7;return addDays(base,delta===0?7:delta);
 }
 return null;
}
function parseMonth(text:string,base=kstToday()):string|null{
 const full=text.match(/\b(20\d{2})[-./](0?[1-9]|1[0-2])\b/)||text.match(/(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월/);
 if(full)return full[1]+"-"+pad(+full[2]);
 const m=text.match(/(1[0-2]|0?[1-9])\s*월(?!\s*\d{1,2}\s*일)/);
 if(m)return base.slice(0,4)+"-"+pad(+m[1]);
 if(/이번\s*달|금월/.test(text))return base.slice(0,7);
 if(/다음\s*달|내달/.test(text)){const d=dateUTC(base.slice(0,7)+"-01");d.setUTCMonth(d.getUTCMonth()+1);return strDate(d).slice(0,7);}
 if(/지난\s*달|저번\s*달|전월/.test(text)){const d=dateUTC(base.slice(0,7)+"-01");d.setUTCMonth(d.getUTCMonth()-1);return strDate(d).slice(0,7);}
 return null;
}
const norm=(x:string)=>String(x||"").replace(/[\s()（）·_\-]/g,"").toLowerCase();
function bookFor(message:string,books:any[],hint=""){
 const aliases:[string,string[]][]=[
  ["neungyul-headwords",["능률보카 표제어","능률 표제어","표제어"]],
  ["neungyul-light",["능률보카 라이트","능률 라이트","능률라이트","라이트"]],
  ["neungyul-basic",["능률보카 기본","능률보카 어원편","능률 어원편","어원편","능률 어원","능률보카어원"]],
  ["onlyone-voca",["온리원보카","온리원 보카"]],
  ["priority-beginner",["우선순위","비기너"]]
 ];
 const needle=norm(hint||message);
 for(const c of books)if(needle.includes(norm(c.name))||needle===norm(c.key))return c;
 for(const [key,values] of aliases)if(values.some(x=>needle.includes(norm(x))))return books.find(x=>x.key===key);
 return null;
}
function studentFor(message:string,students:any[],hint=""){
 const t=norm(hint||message);
 // School matching is checked separately; names never infer authorization.
 const names=students.filter(s=>t.includes(norm(s.name)));
 const schoolHint=(hint||message).match(/(예일여중|신도중)/)?.[1]||(message.match(/(예일여중|신도중)/)?.[1]);
 const exact=schoolHint?names.filter(s=>s.school===schoolHint):names;
 return exact.length===1?exact[0]:exact.length>1?"ambiguous":null;
}
function inferred(text:string,students:any[],books:any[]):Command{
 const book=bookFor(text,books);
 const st=studentFor(text,students);
 const name=typeof st==="object"&&st?st.name:"";
 const school=typeof st==="object"&&st?st.school:"";
 const dayMatch=text.match(/DAY\s*0*(\d{1,3})/i)||text.match(/(\d{1,3})\s*(?:일차|단원)/);
 const day=dayMatch?+dayMatch[1]:0;
 const date=parseDate(text)||"";
 const sessions=+(text.match(/(\d{1,2})\s*(?:회|일간|개\s*일정)/)?.[1]||10);
 let intent="help";
 if(/(?:되돌|원래대로|복구|취소해|수정s*취소)/.test(text)&&/(?:방금|마지막|최근|변경|수정|일정|작업)/.test(text))intent="undo";
 else if(/(?:변경|작업|수정)s*(?:이력|내역|기록)|이력s*(?:보여|조회)/.test(text))intent="history";
 else if(/(?:미설정|미배정|누락|(?:일정|스케줄)(?:이|가)?\s*없|배정(?:이)?\s*안|진도\s*없|빈\s*(?:날|요일)|빠진\s*(?:날|일정|요일))/.test(text))intent="missing_students";
 else if(/(?:완료율|진도율|완료s*현황|진도s*현황|진도s*밀린|지연된|미완료s*학생)/.test(text))intent="progress_stats";
 else if(/(?:휴강|학교s*쉬|학년s*쉬|일괄|전체s*일정)/.test(text)&&/(?:학생들|학교|전체|학년|신도중|예일여중)/.test(text))intent="bulk_shift";
 else if(/복습/.test(text)&&/(?:추가|넣어|삽입|배정)/.test(text))intent="review_insert";
 else if(/단어장|보카|어원편|라이트|표제어|우선순위/.test(text)&&/이름(?:을|을\s+)?/.test(text)&&/(바꿔|변경|수정)/.test(text))intent=day?"rename_unit":"rename_book";
 else if(/결석|미뤄|밀어|연기|뒤로|하루\s*(?:씩)?\s*늦춰|일정\s*옮겨/.test(text))intent="shift";
 else if(/완료\s*(?:처리|표시|해줘)|미완료|완료로|체크해/.test(text))intent="mark_done";
 else if(/배정|일정\s*추가|스케줄\s*생성|DAY.+시작/.test(text))intent="assign";
 else if(book&&/(단원|분류|DAY|범위)\s*(?:목록|리스트|전체)|(?:목록|리스트|전체)\s*(?:단원|분류|DAY|범위)/i.test(text))intent="book_units";
 else if(/단어장|보카|어원편|라이트|표제어|우선순위/.test(text)&&( /목록|종류|뭐|알려|보여|현황/.test(text)))intent="list_books";
 else if(/(?:학생|학원)/.test(text)&&/목록|명단|몇\s*명|전부|전체/.test(text))intent="list_students";
 else if(name||/일정|스케줄|진도/.test(text))intent="student_schedule";
 let target="";
 const rename=text.match(/(?:이름|명칭|표시명)(?:을|를)?\s*(.+?)\s*(?:으)?로\s*(?:바꿔|변경|수정)/);
 if(rename)target=rename[1].trim();
 return {intent,student:name,school,date,book:book?.key||"",day,sessions,target,done:!/미완료|취소|해제/.test(text)};
}

function schoolFor(text:string,students:any[]):string|null {
 const found=[...new Set(students.map(s=>String(s.school)))].filter(x=>text.includes(x));
 return found.length===1?found[0]:null;
}
function periodFor(text:string,today:string){
 const offset=/다음\s*주|차주/.test(text)?7:/지난\s*주|저번\s*주|전주/.test(text)?-7:0;
 if(/(?:이번\s*주|다음\s*주|차주|지난\s*주|저번\s*주|전주)/.test(text)){
  const mon=addDays(today,-((getDow(today)+6)%7)+offset);
  return {start:mon,end:addDays(mon,6),label:mon+" ~ "+addDays(mon,6),kind:"week"};
 }
 const mon=parseMonth(text,today)||today.slice(0,7);
 const last=strDate(new Date(Date.UTC(+mon.slice(0,4),+mon.slice(5,7),0,12)));
 return {start:mon+"-01",end:last,label:mon,kind:"month"};
}
function reviewRange(text:string):[number,number]|null {
 const match=text.match(/DAY\s*0*(\d{1,3})\s*(?:[-~～–—]|부터)\s*(?:DAY\s*)?0*(\d{1,3})/i);
 if(match)return [+match[1],+match[2]];
 const single=text.match(/DAY\s*0*(\d{1,3})/i);
 return single?[+single[1],+single[1]]:null;
}

function lines(rows:string[]){return rows.join("\n");}
function formatDate(ymd:string){return ymd.slice(5).replace("-","/");}
function jsonReply(data:unknown,status=200,origin="https://sashimigongju.github.io"){
 return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"}});
}
Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 const cors=ORIGINS.has(origin)?origin:"https://sashimigongju.github.io";
 if(origin&&!ORIGINS.has(origin))return jsonReply({error:"허용되지 않은 요청입니다."},403,cors);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":cors,"Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}});
 if(req.method!=="POST")return jsonReply({error:"지원하지 않는 방식입니다."},405,cors);
 const header=req.headers.get("Authorization")||"";
 if(!/^Bearer\s+eyJ/.test(header))return jsonReply({error:"관리자 로그인이 필요합니다."},401,cors);
 const db=createClient(URL,ANON,{global:{headers:{Authorization:header}},auth:{persistSession:false,autoRefreshToken:false}});
 const jwt=header.replace(/^Bearer\s+/,"");
 const {data:{user},error:userErr}=await db.auth.getUser(jwt);
 if(userErr||!user)return jsonReply({error:"로그인 세션을 확인해 주세요."},401,cors);
 const admin=await db.from("admins").select("id").eq("id",user.id).maybeSingle();
 if(admin.error||!admin.data)return jsonReply({error:"관리자 권한이 필요합니다."},403,cors);
 let body:any;
 try{body=await req.json();}catch{return jsonReply({error:"요청 형식이 올바르지 않습니다."},400,cors);}
 if(body.action==="status")return jsonReply({ai_connected:false,mode:"무료 규칙 기반 명령"},200,cors);
 if(body.action==="apply"){
   const planId=String(body.plan_id||"");
   if(!/^[a-f0-9-]{36}$/i.test(planId))return jsonReply({error:"변경 요청이 올바르지 않습니다."},400,cors);
   const {data,error}=await db.rpc("admin_ai_apply",{p_plan_id:planId});
   if(error)return jsonReply({error:error.message},409,cors);
   return jsonReply({message:"변경을 저장했어요.",applied:data},200,cors);
 }
 if(body.action==="undo"){
   const historyId=String(body.history_id||"");
   if(!/^[a-f0-9-]{36}$/i.test(historyId))return jsonReply({error:"되돌리기 요청이 올바르지 않습니다."},400,cors);
   const {data,error}=await db.rpc("admin_ai_undo",{p_history_id:historyId});
   if(error)return jsonReply({error:error.message},409,cors);
   return jsonReply({message:"변경을 되돌렸어요.",applied:{...data,operation:"undo"}},200,cors);
 }
 if(body.action!=="chat"||typeof body.text!=="string"||body.text.trim().length<2||body.text.length>600)return jsonReply({error:"명령을 2~600자 이내로 입력해 주세요."},400,cors);
 const message=body.text.trim();
 try{
  const [studentsResult,booksResult]=await Promise.all([
   db.from("students").select("id,name,school,grade,active").order("name").limit(500),
   db.from("vocab_categories").select("key,name,day_count,unit_count,sort_order").order("sort_order")
  ]);
  if(studentsResult.error||booksResult.error)throw new Error("학생·단어장 정보를 불러오지 못했습니다.");
  const students=studentsResult.data||[],books=booksResult.data||[];
  const today=kstToday();
  const fallback=inferred(message,students,books);
  const cmd:Command=fallback;
  const intent=cmd.intent;
  const st=studentFor(message,students,cmd.student||"");
  const book=bookFor(message,books,cmd.book||"");
  const actualDate=cmd.date&&/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)?cmd.date:parseDate(message);
  const requestedMonth=parseMonth(message,today);
  const plan=async(operation:string,payload:Record<string,unknown>,summary:string,preview:string[])=>{
   const {data,error}=await db.from("admin_ai_plans").insert({admin_id:user.id,operation,payload,summary}).select("id,expires_at").single();
   if(error)throw new Error("미리보기를 저장할 수 없습니다: "+error.message);
   return {message:summary,preview,plan_id:data.id,expires_at:data.expires_at,confirm_required:true};
  };
  const needStudent=()=>{
   if(st==="ambiguous")throw new Error("동명이인이 있습니다. 학교를 함께 적어 주세요.");
   if(!st||typeof st!=="object")throw new Error("학생 이름을 확인할 수 없어요. 학생 이름과 학교를 함께 적어 주세요.");
   return st;
  };
  const checkRows=(v:any)=>{if(v.error)throw v.error;return v.data||[];};
  let result:Record<string,unknown>;
  if(intent==="history"){
   const data=checkRows(await db.from("admin_ai_history").select("id,summary,operation,created_at,undone_at")
     .order("created_at",{ascending:false}).limit(15));
   result={message:"관리자 명령 변경 이력 "+data.length+"건",details:data.length?data.map(x=>
     (x.undone_at?"[되돌림] ":"")+new Date(x.created_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+" · "+x.summary):
     ["아직 저장된 변경 이력이 없습니다."]};
  }else if(intent==="undo"){
   const histories=checkRows(await db.from("admin_ai_history").select("id,summary,changes,created_at,undone_at")
      .is("undone_at",null).order("created_at",{ascending:false}).limit(1));
   if(!histories.length)throw new Error("되돌릴 변경 이력이 없어요.");
   const h=histories[0],count=Array.isArray(h.changes)?h.changes.length:0;
   result={message:"최근 변경을 되돌릴까요?",preview:[h.summary,"대상 변경 "+count+"개","이후에 변경된 항목이 있다면 안전하게 중단됩니다."],
     undo_id:h.id,confirm_required:true};
  }else if(intent==="missing_students"){
   const school=schoolFor(message,students),group=students.filter(s=>s.active&&(!school||s.school===school));
   const ids=group.map(s=>s.id);
   const all=ids.length?checkRows(await db.from("schedules").select("student_id,study_date")
     .in("student_id",ids).order("study_date").limit(3000)):[];
   const withAny=new Set(all.map(x=>x.student_id));
   const none=group.filter(x=>!withAny.has(x.id));
   const details=["일정 미설정 "+none.length+"명: "+(none.map(x=>x.school+" "+x.name).join(", ")||"없음")];
   if(/이번\s*주|다음\s*주|이번\s*달|다음\s*달|\d{1,2}\s*월/.test(message)){
    const period=periodFor(message,today);
    const inPeriod=new Set(all.filter(x=>x.study_date>=period.start&&x.study_date<=period.end).map(x=>x.student_id));
    const noDates=group.filter(x=>withAny.has(x.id)&&!inPeriod.has(x.id));
    details.push(period.label+"에 등록된 일정이 없는 학생 "+noDates.length+"명: "+
      (noDates.map(x=>x.school+" "+x.name).join(", ")||"없음"));
    if(/누락|빈\s*(?:날|요일)|빠진\s*(?:날|일정|요일)/.test(message)){
      const gaps:string[]=[];
      for(const s of group){
        const dates=all.filter(x=>x.student_id===s.id&&x.study_date>=period.start&&x.study_date<=period.end).map(x=>x.study_date).sort();
        if(dates.length<2)continue;
        const had=new Set(dates),missing:string[]=[];
        for(let d=dates[0];d<=dates[dates.length-1];d=addDays(d,1)){
          if(getDow(d)!==0&&getDow(d)!==6&&!had.has(d))missing.push(formatDate(d));
        }
        if(missing.length)gaps.push(s.school+" "+s.name+": "+missing.join(", "));
      }
      details.push("학습 기간 사이 평일 공백 확인 후보 "+gaps.length+"명: "+(gaps.join(" / ")||"없음"));
    }
    details.push("※ 예정된 휴강 또는 학습 종료 여부는 별도 확인이 필요합니다.");
   }
   result={message:"학생 "+group.length+"명 · 일정 미설정 "+none.length+"명",details};
  }else if(intent==="progress_stats"){
   const student=st&&typeof st==="object"?st:null;
   if(st==="ambiguous")throw new Error("동명이인이 있어요. 학교를 함께 알려 주세요.");
   const school=schoolFor(message,students);
   const group=students.filter(s=>s.active&&(!school||s.school===school)&&(!student||s.id===student.id));
   const period=periodFor(message,today);
   const ids=group.map(s=>s.id);
   const rows=ids.length?checkRows(await db.from("schedules")
    .select("student_id,study_date,is_done").in("student_id",ids).gte("study_date",period.start).lte("study_date",period.end).limit(3000)):[];
   const done=rows.filter(x=>x.is_done).length,late=rows.filter(x=>!x.is_done&&x.study_date<today).length;
   const percent=rows.length?Math.round(done/rows.length*100):0;
   const byStudent=group.map(s=>{
    const sr=rows.filter(x=>x.student_id===s.id),sd=sr.filter(x=>x.is_done).length;
    const overdue=sr.filter(x=>!x.is_done&&x.study_date<today).length;
    return {name:s.school+" "+s.name,count:sr.length,done:sd,overdue};
   });
   const lateOnly=/지연|밀린|미완료\s*학생|늦은/.test(message);
   const chosen=lateOnly?byStudent.filter(x=>x.overdue>0):byStudent.filter(x=>x.count>0);
   result={message:period.label+" · 완료 "+done+"/"+rows.length+"개 ("+percent+"%) · 기한 경과 미완료 "+late+"개",
    details:chosen.length?chosen.map(x=>x.name+" · 완료 "+x.done+"/"+x.count+" · 경과 미완료 "+x.overdue):["해당 조건의 학습 일정이 없습니다."]};
  }else if(intent==="review_insert"){
   const student=needStudent(),range=reviewRange(message),date=actualDate;
   if(!range||range[0]<1||range[1]<range[0])throw new Error("복습 범위를 DAY 1~5처럼 지정해 주세요.");
   if(!date)throw new Error("복습할 날짜를 알려 주세요. 예: '이번 주 금요일'");
   let selectedBook=book;
   if(!selectedBook){
    const recent=checkRows(await db.from("schedules").select("category_key").eq("student_id",student.id).not("category_key","is",null).limit(100));
    const keys=[...new Set(recent.map(x=>x.category_key))];
    if(keys.length===1)selectedBook=books.find(x=>x.key===keys[0]);
    else throw new Error("학생의 단어장이 하나로 정해지지 않았어요. 복습할 단어장 이름을 함께 입력해 주세요.");
   }
   if(!selectedBook||range[1]>selectedBook.day_count)throw new Error("복습 범위가 단어장의 DAY 범위를 벗어났습니다.");
   const label="복습 · DAY "+String(range[0]).padStart(2,"0")+"~"+String(range[1]).padStart(2,"0");
   const existing=checkRows(await db.from("schedules").select("id").eq("student_id",student.id).eq("study_date",date)
      .eq("category_key",selectedBook.key).eq("unit_order",range[0]).limit(1));
   if(existing.length)throw new Error("같은 날 동일 DAY로 등록된 일정이 있어요. 다른 날짜를 선택해 주세요.");
   const row={student_id:student.id,study_date:date,range_label:label,category_key:selectedBook.key,unit_order:range[0]};
   result=await plan("review_insert",{rows:[row]},student.school+" "+student.name+" · "+date+" 복습 추가",
     [date+" · "+selectedBook.name+" · "+label,"기존 일정은 유지하며 복습 일정을 추가합니다."]);
  }else if(intent==="bulk_shift"){
   const school=schoolFor(message,students),date=actualDate;
   if(!school)throw new Error("일괄 휴강 처리할 학교를 정확히 지정해 주세요. 예: '신도중'");
   if(!date)throw new Error("휴강 날짜를 알려 주세요. 예: '다음 주 수요일'");
   const group=students.filter(x=>x.school===school&&x.active);
   if(!group.length)throw new Error("해당 학교에 활성 학생이 없습니다.");
   const all=checkRows(await db.from("schedules").select("id,student_id,study_date,range_label,is_done")
     .in("student_id",group.map(x=>x.id)).gte("study_date",date).order("study_date").limit(301));
   if(all.length>300)throw new Error("변경 대상이 300개를 초과해요. 학교를 나눠서 처리해 주세요.");
   const eligible=new Set(all.filter(x=>x.study_date===date).map(x=>x.student_id));
   if(!eligible.size)throw new Error(school+" 학생들 중 해당 휴강일에 배정된 일정이 없습니다.");
   const affected=all.filter(x=>eligible.has(x.student_id));
   if(affected.some(x=>x.is_done))throw new Error("변경 대상에 완료된 일정이 있어요. 먼저 확인해 주세요.");
   const studentName=new Map(group.map(x=>[x.id,x.name]));
   const changes=affected.map(x=>({id:x.id,student_id:x.student_id,before_date:x.study_date,
      after_date:nextWeekday(x.study_date),before_done:x.is_done,before_label:x.range_label}));
   const preview=affected.slice(0,18).map((x,i)=>studentName.get(x.student_id)+" · "+formatDate(x.study_date)+
     " "+x.range_label+" → "+formatDate(changes[i].after_date));
   if(affected.length>18)preview.push("외 "+(affected.length-18)+"개 일정");
   result=await plan("bulk_shift",{rows:changes},school+" "+date+" 휴강 · "+eligible.size+"명 / "+affected.length+"개 일정 한 학습일 연기",preview);
  }else if(intent==="list_students"){
   const where=cmd.school||message.match(/(예일여중|신도중)/)?.[1]||"";
   const group=students.filter(x=>!where||x.school.includes(where));
   if(!group.length)result={message:"해당 학교에 등록된 학생이 없습니다."};
   else{
    const groupBy:Record<string,string[]>={};
    for(const x of group)(groupBy[x.school] ||= []).push(x.name);
    result={message:group.length+"명 등록되어 있어요.",details:Object.entries(groupBy).map(([k,names])=>k+" ("+names.length+"명)\n"+names.join(", "))};
   }
  }else if(intent==="list_books"||intent==="book_units"){
   if(intent==="book_units"&&book){
    const units=checkRows(await db.from("vocab_units").select("unit_order,label").eq("category_key",book.key).order("unit_order").limit(365));
    result={message:book.name+" · "+units.length+"개 분류",details:units.map(x=>x.label)};
   }else result={message:"등록된 단어장 "+books.length+"종",details:books.map(x=>x.name+" · DAY "+x.day_count+" · 총 "+x.unit_count+"분류")};
  }else if(intent==="student_schedule"){
   const student=needStudent();
   const month=requestedMonth||actualDate?.slice(0,7)||today.slice(0,7);
   const from=month+"-01",to=month+"-31";
   const rows=checkRows(await db.from("schedules").select("study_date,range_label,is_done,category_key").eq("student_id",student.id).gte("study_date",from).lte("study_date",to).order("study_date").limit(150));
   result={message:student.school+" "+student.name+" · "+month+" · "+rows.length+"개 일정",details:rows.length?rows.map(s=>formatDate(s.study_date)+" "+s.range_label+(s.is_done?" ✓":"")):["이 달에 등록된 일정이 없습니다."]};
  }else if(intent==="shift"){
   const student=needStudent(),date=actualDate;
   if(/(오늘|그날|해당일|그\s*날)\s*(일정|단어장|DAY)?\s*만/.test(message))throw new Error("이 명령은 그날 이후 전체 일정을 한 학습일씩 이동합니다. 그날만 이동하려면 기존 일정 화면에서 직접 수정해 주세요.");
   if(!date)throw new Error("결석 날짜가 필요해요. 예: '최세영 오늘 결석이니 오늘 일정부터 내일로 미뤄줘'");
   const rows=checkRows(await db.from("schedules").select("id,student_id,study_date,is_done,range_label,category_key").eq("student_id",student.id).gte("study_date",date).order("study_date").limit(101));
   if(!rows.length)throw new Error("해당 날짜 이후에 변경할 일정이 없습니다.");
   if(!rows.some(x=>x.study_date===date))throw new Error("해당 결석일에는 배정된 일정이 없어요. 다른 날짜를 지정해 주세요.");
   if(rows.length>100)throw new Error("변경할 일정이 100개를 넘습니다. 범위를 나눠서 요청해 주세요.");
   // Move all future lessons by one weekday; do not mutate completed lessons.
   if(rows.some(x=>x.is_done))throw new Error("완료된 일정이 포함돼 있어요. 완료 기록을 확인한 뒤 수동으로 조정해 주세요.");
   const changes=rows.map(x=>({id:x.id,student_id:x.student_id,before_date:x.study_date,after_date:nextWeekday(x.study_date),before_done:x.is_done,before_label:x.range_label}));
   const preview=rows.slice(0,12).map((x,i)=>formatDate(x.study_date)+" "+x.range_label+" → "+formatDate(changes[i].after_date)) ;
   result=await plan("shift",{rows:changes},student.school+" "+student.name+" · "+date+"부터 "+rows.length+"개 일정 한 학습일 연기",preview);
   if(rows.length>12)(result.preview as string[]).push("외 "+(rows.length-12)+"개 일정");
  }else if(intent==="assign"){
   const student=needStudent();
   if(!book)throw new Error("배정할 단어장 이름을 입력해 주세요.");
   const day=Number(cmd.day)||+(message.match(/DAY\s*(\d+)/i)?.[1]||0);
   if(!Number.isInteger(day)||day<1||day>book.day_count)throw new Error("시작 DAY는 1~"+book.day_count+" 사이에서 선택해 주세요.");
   const count=Math.min(Math.max(Number(cmd.sessions)||10,1),60,book.day_count-day+1);
   const start=actualDate||mondayOfNextWeek(today);
   const unitRows=checkRows(await db.from("vocab_units").select("unit_order,label").eq("category_key",book.key).gte("unit_order",day).lte("unit_order",day+count-1).order("unit_order"));
   if(unitRows.length!==count)throw new Error("단어장 분류를 확인할 수 없습니다.");
   let dt=start;const writes:any[]=[];
   for(const unit of unitRows){
    while([0,6].includes(getDow(dt)))dt=addDays(dt,1);
    writes.push({student_id:student.id,study_date:dt,range_label:unit.label,category_key:book.key,unit_order:unit.unit_order});
    dt=nextWeekday(dt);
   }
   const existing=checkRows(await db.from("schedules").select("study_date,category_key,unit_order").eq("student_id",student.id).gte("study_date",start).lte("study_date",writes[writes.length-1].study_date).limit(150));
   if(writes.some(x=>existing.some(y=>y.study_date===x.study_date&&y.category_key===x.category_key&&y.unit_order===x.unit_order)))throw new Error("동일한 날짜·DAY 일정이 이미 있습니다. 먼저 현재 일정을 확인해 주세요.");
   result=await plan("assign",{rows:writes},student.name+" · "+book.name+" DAY "+day+"부터 "+count+"회 배정",writes.slice(0,12).map(x=>formatDate(x.study_date)+" "+x.range_label));
   if(writes.length>12)(result.preview as string[]).push("외 "+(writes.length-12)+"개");
  }else if(intent==="mark_done"){
   const student=needStudent();
   const day=Number(cmd.day)||+(message.match(/DAY\s*(\d+)/i)?.[1]||0);
   const rows=checkRows(await db.from("schedules").select("id,student_id,study_date,range_label,is_done,unit_order").eq("student_id",student.id).order("study_date").limit(150));
   const matching=rows.filter(x=>(!actualDate||x.study_date===actualDate)&&(!day||x.unit_order===day));
   if(!actualDate&&!day)throw new Error("완료 처리할 날짜 또는 DAY를 알려 주세요.");
   if(matching.length!==1)throw new Error(matching.length?"여러 일정이 일치해요. 날짜와 DAY를 모두 알려 주세요.":"일치하는 일정을 찾지 못했어요.");
   const row=matching[0],done=typeof cmd.done==="boolean"?cmd.done:!/미완료|취소|해제/.test(message);
   if(row.is_done===done)return jsonReply({message:"이미 "+(done?"완료":"미완료")+" 상태입니다."},200,cors);
   result=await plan("mark_done",{rows:[{id:row.id,student_id:row.student_id,before_date:row.study_date,before_done:row.is_done,before_label:row.range_label,after_done:done}]},student.name+" "+formatDate(row.study_date)+" "+row.range_label+" → "+(done?"완료":"미완료"),[row.range_label+": "+(row.is_done?"완료":"미완료")+" → "+(done?"완료":"미완료")]);
  }else if(intent==="rename_book"||intent==="rename_unit"){
   if(!book)throw new Error("변경할 단어장 이름을 알려 주세요.");
   const after=String(cmd.target||fallback.target||"").trim();
   if(after.length<1||after.length>100)throw new Error("바꿀 이름을 '이름을 OO로 변경' 형식으로 적어 주세요.");
   if(intent==="rename_book"){
    result=await plan("rename_book",{category_key:book.key,before_name:book.name,after_name:after},"단어장 이름 변경",[book.name+" → "+after]);
   }else{
    const day=Number(cmd.day)||fallback.day||0;
    const unit=checkRows(await db.from("vocab_units").select("label,unit_order").eq("category_key",book.key).eq("unit_order",day).limit(1))[0];
    if(!unit)throw new Error("변경할 DAY를 알려 주세요.");
    result=await plan("rename_unit",{category_key:book.key,unit_order:day,before_label:unit.label,after_label:after},"단어 범위 이름 변경",[book.name+" "+unit.label+" → "+after]);
   }
  }else{
   result={message:"어떤 작업을 도와줄까요?",details:[
    "신도중 학생 목록 알려줘","최세영 11월 일정 보여줘","등록된 단어장 목록 보여줘",
    "최세영 11월 16일 결석해서 이후 일정 밀어줘",
    "김채원 능률 라이트 DAY 10부터 다음주 월요일 5회 배정해줘",
    "김서윤 11월 17일 완료 처리해줘"
   ]};
  }
  return jsonReply({...result,ai_connected:false,mode:"무료 규칙 기반 명령"},200,cors);
 }catch(err){return jsonReply({error:err instanceof Error?err.message:"요청을 처리할 수 없습니다."},400,cors);}
});
