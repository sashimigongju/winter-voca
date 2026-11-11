import { mountAdmin, mountStudent } from "./schedule.js";
// Supabase browser client. Publishable keys are safe to ship with a browser app.
// Never put a service_role or sb_secret key in this file.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const supabase = createClient(
  "https://jacgyoeelysvzycjrnlo.supabase.co",
  "sb_publishable_csRJ2AG42WLSOZy910cd8A_29y5AGf0",
  { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } },
);
const root = document.querySelector("#app");
let currentUser = null;
let navigationVersion = 0;
const route = () => (location.hash.split("?")[0] || "#/").slice(1);
const escapeHTML = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function render(html){ root.innerHTML=html; }
function message(text, error=false){ const box=document.querySelector("#message"); if(box){box.textContent=text;box.className="message"+(error?" error":"");box.hidden=false;} }
function go(path){location.hash="#"+path;if(route()===path) void navigate();}
function shell(content){
  render('<header class="pink-header"><div class="pink-header-inner"><div class="pink-logo"><b>one</b><span>Onlyone Edu 1:1<small>은평점</small></span></div><div class="header-tools"><span>'+escapeHTML(currentUser?.email)+'</span><button id="signout" class="tiny-button">로그아웃</button></div></div></header><main class="layout">'+content+'</main>');
  document.querySelector("#signout").onclick=async()=>{await supabase.auth.signOut();go("/login");};
}
async function verifiedUser(){const {data,error}=await supabase.auth.getUser();if(error||!data.user)return null;return data.user;}
async function isAdmin(){const {data,error}=await supabase.from("admins").select("id").eq("id",currentUser.id).maybeSingle();if(error)throw error;return Boolean(data);}
function login(reset=false){
  render('<main class="center"><section class="panel"><div class="brand">ONLYONE EDU · WINTER VOCA</div><h1>'+(reset?"비밀번호 재설정":"관리자 로그인")+'</h1><p class="muted">'+(reset?"이메일로 재설정 링크를 전송합니다.":"인가된 관리자만 학생 정보와 학습 일정에 접근할 수 있습니다.")+'</p><form id="login" class="stack"><label>이메일<input type="email" name="email" autocomplete="email" required /></label>'+(reset?"":'<label>비밀번호<input type="password" name="password" autocomplete="current-password" required minlength="6" /></label>')+'<button class="primary" type="submit">'+(reset?"재설정 이메일 보내기":"로그인")+'</button><button class="link-button" type="button" id="swap">'+(reset?"로그인으로 돌아가기":"비밀번호를 잊으셨나요?")+'</button><p id="message" hidden></p></form></section></main>');
  document.querySelector("#swap").onclick=()=>go(reset?"/login":"/reset");
  document.querySelector("#login").onsubmit=async e=>{
    e.preventDefault();const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;
    const form=new FormData(e.currentTarget);const email=String(form.get("email")).trim();const password=String(form.get("password")??"");
    try{
      if(reset){
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+"#/update-password"});
        if(error)throw error;message("재설정 이메일을 확인해 주세요.");
      }else{
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error)throw error;go("/admin");
      }
    }catch(err){message(err.message,true);}finally{btn.disabled=false;}
  };
}
function updatePassword(){
  render('<main class="center"><section class="panel"><div class="brand">ONLYONE EDU</div><h1>새 비밀번호 설정</h1><form id="password-form" class="stack"><label>새 비밀번호<input name="password" type="password" minlength="8" autocomplete="new-password" required /></label><button class="primary">변경하기</button><p id="message" hidden></p></form></section></main>');
  document.querySelector("#password-form").onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector("button");btn.disabled=true;try{const {error}=await supabase.auth.updateUser({password:new FormData(e.currentTarget).get("password")});if(error)throw error;message("변경되었습니다. 관리자 화면으로 이동하세요.");setTimeout(()=>go("/admin"),1200);}catch(err){message(err.message,true);}finally{btn.disabled=false;}};
}
function denied(){
  shell('<section class="card"><h2>접근 권한이 없습니다</h2><p class="muted">로그인은 성공했지만 관리자 명단에 등록되지 않은 계정입니다. 프로젝트 소유자에게 관리자 등록을 요청하세요.</p></section>');
}
function adminPage(){void mountAdmin({supabase,shell});}
async function loadStudents(){
  const table=document.querySelector("#students");if(!table)return;
  const {data,error}=await supabase.from("students").select("id,name,school,grade,active,created_at").order("created_at",{ascending:false});
  if(!document.querySelector("#students"))return;
  if(error){table.innerHTML='<p class="message error">'+escapeHTML(error.message)+'</p>';return;}
  if(!data?.length){table.innerHTML='<p class="muted">등록된 학생이 없습니다.</p>';return;}
  table.innerHTML='<div style="overflow-x:auto"><table class="data"><thead><tr><th>이름</th><th>학교</th><th>학년</th><th>상태</th><th>관리</th></tr></thead><tbody>'+data.map(s=>'<tr><td>'+escapeHTML(s.name)+'</td><td>'+escapeHTML(s.school)+'</td><td>'+escapeHTML(s.grade)+'</td><td>'+(s.active?"활성":"비활성")+'</td><td><button class="secondary" data-id="'+escapeHTML(s.id)+'" data-active="'+s.active+'">'+(s.active?"비활성화":"활성화")+'</button></td></tr>').join("")+'</tbody></table></div>';
  table.querySelectorAll("button[data-id]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const {error}=await supabase.from("students").update({active:btn.dataset.active!=="true"}).eq("id",btn.dataset.id);if(error){message(error.message,true);btn.disabled=false;}else await loadStudents();});
}
async function navigate(){
  const id=++navigationVersion;
  const path=route();
  if(path==="/login"||path==="/reset"){login(path==="/reset");return;}
  if(path.startsWith("/student/") && /^[a-f0-9]{64}$/i.test(path.slice(9))){void mountStudent({token:path.slice(9),root});return;}
  render('<main class="center"><p>권한을 확인하는 중입니다…</p></main>');
  const user=await verifiedUser();if(id!==navigationVersion)return;
  currentUser=user;
  if(!user){go("/login");return;}
  if(path==="/update-password"){updatePassword();return;}
  try{const allowed=await isAdmin();if(id!==navigationVersion)return;if(!allowed){denied();return;}if(path!=="/admin"){go("/admin");return;}adminPage();}
  catch(e){render('<main class="center"><section class="panel"><h1>연결 오류</h1><p class="message error">'+escapeHTML(e.message)+'</p><button class="secondary" id="retry">다시 시도</button></section></main>');document.querySelector("#retry").onclick=()=>navigate();}
}
window.addEventListener("hashchange",()=>void navigate());
supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"){currentUser=null;go("/login");}else if(event==="PASSWORD_RECOVERY")go("/update-password");});
void navigate();
