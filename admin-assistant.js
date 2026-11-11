// Free rules-based Onlyone admin assistant. It is never mounted on student routes.
const H = v => String(v ?? "").replace(/[&<>"']/g, x => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[x]));
const examples=[
  "단어 일정이 없는 학생들 알려줘",
  "이번 주 신도중 학생들 완료율 알려줘",
  "신도중 학생들 다음 주 수요일 휴강이니까 전체 일정 미뤄줘",
  "김채원 이번 주 금요일에 DAY 1~5 복습 추가해줘",
  "변경 이력 보여줘",
  "방금 수정한 일정 원래대로 돌려줘",
  "최세영 오늘 결석이니 오늘 일정부터 내일로 미뤄줘",
  "최세영 이번 달 일정 알려줘",
  "신도중 학생 명단 보여줘",
  "등록된 단어장 목록 보여줘"
];
const label=(s)=>s.replace(/\n/g,"<br>");
export function mountAdminAssistant({ supabase, onApplied=()=>{} }){
  const root=document.getElementById("admin-command-host");
  if(!root)return;
  root.innerHTML='<button class="helper-launch" type="button" id="helper-launch" aria-haspopup="dialog" aria-controls="helper-panel" aria-expanded="false"><span aria-hidden="true">✦</span> 일정 도우미</button>'+
    '<section id="helper-panel" class="helper-panel" aria-label="관리자 명령 도우미" role="dialog" hidden>'+
    '<header class="helper-top"><div class="helper-title"><span class="helper-stars" aria-hidden="true">✦</span><div><strong>Onlyone 도우미</strong><small>무료 · 관리자 전용</small></div></div><button id="helper-close" class="helper-icon" aria-label="닫기" type="button">×</button></header>'+
    '<div id="helper-messages" class="helper-messages" role="log" aria-live="polite" aria-relevant="additions"></div>'+
    '<form id="helper-form" class="helper-form"><label class="visually-hidden" for="helper-input">관리자 명령 입력</label><textarea id="helper-input" maxlength="600" rows="2" placeholder="예: 최세영 11월 16일 결석, 일정 밀어줘"></textarea><button type="submit" id="helper-send" aria-label="명령 전송">전송</button></form>'+
    '<div class="helper-hint">일정 변경은 확인 후 적용돼요.</div></section>';
  const popup=root.querySelector("#helper-panel");
  const launch=root.querySelector("#helper-launch");
  const log=root.querySelector("#helper-messages");
  const form=root.querySelector("#helper-form");
  const input=root.querySelector("#helper-input");
  const send=root.querySelector("#helper-send");
  let pending=null, busy=false;
  function setOpen(next){
    popup.hidden=!next; launch.setAttribute("aria-expanded",String(next));
    if(next)input.focus();
    else launch.focus();
  }
  launch.onclick=()=>setOpen(popup.hidden);
  root.querySelector("#helper-close").onclick=()=>setOpen(false);
  function scroll(){log.scrollTop=log.scrollHeight}
  function append(kind,html){
    const el=document.createElement("div");el.className="helper-bubble "+kind;el.innerHTML=html;log.append(el);scroll();return el;
  }
  function welcome(){
    append("assistant",'<p class="helper-message">무엇을 도와줄까요?</p><div class="helper-examples">'+examples.map(x=>'<button type="button" class="helper-example" data-example="'+H(x)+'">'+H(x)+'</button>').join("")+'</div>');
  }
  welcome();
  root.addEventListener("click",e=>{
    const ex=e.target.closest("button[data-example]");
    if(ex){input.value=ex.dataset.example;input.focus();return;}
    if(e.target.closest("#helper-cancel")) {
      const el=e.target.closest(".helper-preview");if(el){el.querySelector(".helper-actions")?.remove();const note=document.createElement("small");note.textContent="취소됨";el.append(note);}pending=null;return;
    }
    if(e.target.closest("#helper-apply"))void apply();
  });
  input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
  function lock(b){busy=b;send.disabled=b;input.disabled=b;send.textContent=b?"처리 중":"전송";}
  async function invoke(body){
    const {data:sessionData}=await supabase.auth.getSession();
    if(!sessionData?.session?.access_token)throw Error("관리자 로그인 세션이 필요해요.");
    const {data,error}=await supabase.functions.invoke("admin-ai",{body});
    if(error){
      let msg=error.message||"요청을 처리할 수 없어요.";
      if(error.context&&typeof error.context.json==="function"){
        try{const payload=await error.context.json();if(payload?.error)msg=payload.error;}catch{}
      }
      throw Error(msg);
    }
    if(data?.error)throw Error(data.error);
    return data||{};
  }
  async function sendCommand(text){
    if(busy)return;
    if(pending){
      append("assistant",'<p class="helper-message">먼저 이전 변경안을 적용하거나 취소해 주세요.</p>');return;
    }
    if(!text.trim())return;
    append("user","<p>"+H(text.trim())+"</p>");
    input.value="";lock(true);
    try{
      const result=await invoke({action:"chat",text:text.trim()});
      const details=Array.isArray(result.details)?result.details.slice(0,50):[];
      const preview=Array.isArray(result.preview)?result.preview.slice(0,100):[];
      let html='<p class="helper-message">'+H(result.message||"조회가 완료됐어요.")+'</p>';
      if(details.length)html+='<div class="helper-detail">'+details.map(x=>'<div>'+label(H(x))+'</div>').join("")+'</div>';
      if(result.confirm_required&&(result.plan_id||result.undo_id)){
        if(!preview.length)throw Error("미리보기 없는 변경은 실행할 수 없어요.");
        const isUndo=Boolean(result.undo_id);
        pending=isUndo?{action:"undo",history_id:result.undo_id}:{action:"apply",plan_id:result.plan_id};
        html+='<div class="helper-preview"><strong>'+(isUndo?"되돌리기 미리보기":"변경 미리보기")+'</strong><div class="helper-preview-rows">'+preview.map(x=>'<div>'+H(x)+'</div>').join("")+'</div><div class="helper-actions"><button type="button" id="helper-cancel" class="helper-secondary">취소</button><button type="button" id="helper-apply" class="helper-confirm">'+(isUndo?"되돌리기 실행":"확인 후 적용")+'</button></div><small>'+(isUndo?"되돌리기 후 다시 변경하려면 새 요청이 필요합니다.":"15분 내 승인 · 적용 후 화면을 갱신합니다.")+'</small></div>';
      }
      append("assistant",html);
    }catch(err){append("assistant error","<p>"+H(err.message||"명령을 해석하지 못했어요.")+"</p>");}
    finally{lock(false);}
  }
  form.onsubmit=e=>{e.preventDefault();void sendCommand(input.value);};
  async function apply(){
    if(!pending||busy)return;
    const command=pending;pending=null;lock(true);
    const button=root.querySelector("#helper-apply");
    if(button)button.disabled=true;
    try{
      const result=await invoke(command);
      append("assistant",'<p class="helper-message">✓ '+H(result.message||"변경을 저장했어요.")+'</p>');
      const actions=root.querySelector(".helper-preview .helper-actions");if(actions)actions.remove();
      try{await onApplied(result.applied||{})}catch{}
    }catch(err){append("assistant error","<p>"+H(err.message||"변경을 적용하지 못했어요. 다시 요청해 주세요.")+"</p>");}
    finally{lock(false);}
  }
}
