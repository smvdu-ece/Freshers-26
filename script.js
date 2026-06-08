/* ============================================================
   FIESTA DE FRESHERS — Google login + live contributions
   ------------------------------------------------------------
   ALLOWED_DOMAINS = only these email domains may sign in.
   Firebase config below enables the live, shared bar.
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBS6g593Tzr8c-w3NNe5ej4erIAXzA15oo",
  authDomain: "freshers-26.firebaseapp.com",
  projectId: "freshers-26",
  storageBucket: "freshers-26.firebasestorage.app",
  messagingSenderId: "566795663580",
  appId: "1:566795663580:web:4147de852c048261b49c19",
  measurementId: "G-VDRX1RRYJE"
};
const ALLOWED_DOMAINS = ["smvdu.ac.in"];   // <-- only these email domains can log in
const GOAL = 1740;
/* ---- Version A: direct UPI + manual verify (no gateway) ---- */
const UPI_ID    = "7654201815@upi";                 // <-- the UPI ID that RECEIVES the money
const UPI_NAME  = "Freshers-26";                    // name shown in the payer's UPI app
const ADMIN_EMAILS = ["25bec079@smvdu.ac.in"];     // who can verify & approve payments

const LIVE = !!FIREBASE_CONFIG.apiKey;
let user = null;            // { email, name }
let data = {};              // email -> amount  (live snapshot or preview memory)
let payFilter = "all";      // payments list filter: all/gold/full/partial/pending/paid
let payMethod = "UPI";
let fb = null, unsub = null;
let myPending = 0, unsubMyPending = null, mySubs = [];
let remainingAmt = GOAL, allSubs = [];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const loginOverlay = $("#loginOverlay"), payOverlay = $("#payOverlay"), adminOverlay = $("#adminOverlay"), toast = $("#toast");
function money(n){ return "\u20b9" + Number(n||0).toLocaleString("en-IN"); }
function showToast(m){ toast.textContent = m; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2800); }
function openM(o){ o.classList.add("show"); }
function closeM(o){ o.classList.remove("show"); }
function msg(t,cls){ const m=$("#loginMsg"); m.textContent=t||""; m.className="lmsg "+(cls||""); }
function domainOK(email){
  const at = (email||"").lastIndexOf("@"); if(at<0) return false;
  const dom = email.slice(at+1).toLowerCase();
  return ALLOWED_DOMAINS.some(d => dom===d || dom.endsWith("."+d));
}
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>{ const o=x.closest(".overlay"); if(o) o.classList.remove("show"); });
[loginOverlay,payOverlay,adminOverlay,document.getElementById("mySubsOverlay"),document.getElementById("payListOverlay")].forEach(o=>o&&o.addEventListener("click",e=>{ if(e.target===o) closeM(o); }));

/* ---------- mobile hamburger menu ---------- */
const navLinks = document.getElementById("navLinks"), hamburger = document.getElementById("hamburger");
hamburger.onclick = ()=>{ navLinks.classList.toggle("open"); hamburger.classList.toggle("open"); };
navLinks.querySelectorAll("a").forEach(a=> a.onclick=()=>{ navLinks.classList.remove("open"); hamburger.classList.remove("open"); });

/* ---------- paint the bar + stats ---------- */
function repaint(){
  let total=0, count=0;
  for(const k in data){ const a=data[k]||0; total += a; if(a>0) count++; }
  const mine = user ? (data[user.email]||0) : 0;
  const pend = user ? (myPending||0) : 0;
  const pct = Math.min(mine/GOAL,1)*100;
  $("#barFill").style.width = pct + "%";
  $("#barPending").style.width = Math.min((mine+pend)/GOAL,1)*100 + "%";
  const note = $("#barPendingNote");
  if(pend>0){ note.style.display="flex"; note.textContent = money(pend) + " pending approval"; }
  else { note.style.display="none"; }
  $("#paidAmt").textContent = money(mine);
  $("#barPct").textContent = Math.round(pct) + "% complete";
  $("#barLeft").textContent = mine>=GOAL ? (mine>GOAL ? money(mine-GOAL)+" extra \u2726" : "Goal reached \u2726") : money(GOAL-mine)+" to go";
  $("#doneBadge").style.display = mine>=GOAL ? "flex" : "none";
  $("#totalRaised").textContent = money(total);
  $("#contribCount").textContent = count;
  $("#yourTotal").textContent = money(mine);
  const yp = $("#yourPending");
  if(yp){
    if(pend>0){ yp.style.display="block"; yp.textContent = "+" + money(pend) + " pending"; }
    else { yp.style.display="none"; yp.textContent=""; }
  }
  remainingAmt = Math.max(GOAL - mine - pend, 0);
  $("#contribBtn").textContent = !user ? "Login to contribute" : (remainingAmt>0 ? ("Contribute " + money(remainingAmt)) : "Contribute extra");
  if($("#payListOverlay").classList.contains("show")) renderPayments();
}

/* ---------- payments roster ---------- */
const NAMES = ["AAYUSH MONDAL","ABHIJEET GOYAL","ABHINANDAN KUMAR","ABHIRAJ BADHAN","ADITI SINGH","ADITYA ATHMIA","ADITYA KUMAR","ADITYA SHARMA","ADITYA SONKAR","ADVAIT KHAJURIA","AJAY KUMAR","AJAY KUMAR","AKASH KUMAR","AKSHAT SHIRSHWAR","ALISHA GANDOTRA","ALOK KUMAR","AMICHAND KUMHAR","AMIT SHARMA","ANANAYA BHAGAT","ANIKET KUMAR","ANKIT GANGWAR","ANKIT KUMAR SINGH","ANKIT VERMA","ANSH ANDOTRA","ANUBHAV SHARMA","ARYAN CHATURVEDI","ARYAN VERMA","ASHISH RANJAN","AVNISH RAJ","AYUSH SINGH YADAV","AYUSHMAN SINGH","BANTI KUMAR","CHAITANYA SHARMA","CHENNOJU HARSHITH KUMAR","CHINTALA RAM CHARAN TEJA","DEEPAK KUMAR","DHIRAJ KUMAR","DIPIKA SINHA","DIVYA RANI","HARSH RAJ","HARSH RAJ","JATIN SHARMA","KARTIK CHAUHAN","KRISHNA KRISHNANSHU BALI","LAKSHYA SACHDEVA","MANISH BAGOTIA","MANSI","MD GULAM MURSHID","MILIND WAGDRE","MOHD YUSUF IMRAN","MRIGAANKA BHAGAT","NITIN KUMAR","PATTIMI HEMANTHKUMAR","PIYUSH KUMAR","PIYUSH KUMAR","PRAGATI VERMA","PRAGYA SINGH","PRANAV KALOTRA","PRIYANSHU SHARMA","RAGHAV TIWARI","RAJ HARSH KUMAR","RAKESH KUMAR","RAMLEEN KAUR RANA","RITU RAJ","SAKSH SHARMA","SAMBHAV GUPTA","SAMEER KUMAR YADAV","SANDEEP KUMAR YADAV","SANJAN KUMAR","SARVAJEET SONKAR","SAURAV SINGH RAWAT","SHALWI KUMARI","SHANTANU PANDA","SHAURYA VEER ARORA","SHIVAM KUMAR","SHUBHAM KASHAV","SONAM","SOURYA GUPTA","SUJIT KUMAR","SUMIT RAJ","SUMIT VERMA","SURAJ BHARGAV","TANISH SHARMA","UTKARSH CHANDRAVANSHI","VANSH ABROL","VANSH PRATAP SINGH","VIDHAN PRAKASH SAIN","VINAMRATA","VISHNU KUMAR DIXIT","YOGESH"];
const EXCLUDE = [1,46,84];
const ROSTER = [];
for(let n=1;n<=90;n++){ if(EXCLUDE.includes(n)) continue; ROSTER.push({ email:"25bec"+String(n).padStart(3,"0")+"@smvdu.ac.in", name:NAMES[n-1] }); }
function renderPayments(){
  const q = ($("#paySearch").value||"").toLowerCase();
  let gold=0, full=0, part=0, none=0;
  ROSTER.forEach(p=>{ const a=data[p.email]||0; if(a>=2000) gold++; else if(a>=GOAL) full++; else if(a>0) part++; else none++; });
  $("#paySummary").innerHTML = '<span class="s-gold">'+gold+' gold</span> · <span class="s-g">'+full+' full</span> · <span class="s-y">'+part+' partial</span> · <span class="s-r">'+none+' pending</span>';
  const match = (a)=> payFilter==="gold" ? a>=2000
    : payFilter==="full" ? (a>=GOAL && a<2000)
    : payFilter==="partial" ? (a>0 && a<GOAL)
    : payFilter==="pending" ? a===0
    : payFilter==="paid" ? a>0 : true;
  const rows = ROSTER
    .map(p=>({ email:p.email, name:p.name, amt:data[p.email]||0 }))
    .filter(p=> (p.email.includes(q) || p.name.toLowerCase().includes(q)) && match(p.amt))
    .sort((a,b)=> b.amt - a.amt)
    .map(p=>{
      const cls = p.amt>=2000 ? "gold" : (p.amt>=GOAL ? "g" : (p.amt>0 ? "y" : "r"));
      return '<div class="prow"><span class="dot '+cls+'"></span><span class="pe"><span class="pn">'+p.name+'</span><span class="pem">'+p.email+'</span></span><span class="pa">'+money(p.amt)+'</span></div>';
    }).join("");
  $("#payList").innerHTML = rows || '<div class="prow" style="justify-content:center;color:var(--muted)">No matches</div>';
}
function setPayFilter(f){
  payFilter = f;
  document.querySelectorAll("#payFilters .fchip").forEach(x=> x.classList.toggle("on", x.dataset.filter===f));
  renderPayments();
}
document.querySelectorAll("#payFilters .fchip").forEach(c=> c.onclick=()=> setPayFilter(c.dataset.filter));
$("#seePaymentsBtn").onclick = ()=>{ $("#paySearch").value=""; setPayFilter("all"); openM($("#payListOverlay")); };
$("#contribStat").onclick   = ()=>{ $("#paySearch").value=""; setPayFilter("paid"); openM($("#payListOverlay")); };
$("#yourStat").onclick = ()=>{ openM($("#mySubsOverlay")); renderMySubs(); };
function renderMySubs(){
  const box = $("#mySubsList");
  if(!user){ box.innerHTML = '<p class="hint">Login to see your submissions.</p>'; return; }
  if(!mySubs.length){ box.innerHTML = '<p class="hint">No submissions yet.</p>'; return; }
  box.innerHTML = "";
  mySubs.forEach((s,i)=>{
    const st = (s.status||"pending");
    const el = document.createElement("div");
    el.className = "sub-row";
    el.innerHTML = '<div class="si"></div><div class="sb"><div class="sa"></div><div class="su"></div><div class="snote"></div></div><span class="badge"></span>';
    el.querySelector(".si").textContent = "#" + (i+1);
    el.querySelector(".sa").textContent = money(Number(s.amount)||0);
    el.querySelector(".su").textContent = "UTR " + (s.utr||"");
    const sn = el.querySelector(".snote");
    if(s.note){ sn.textContent = "\u201c" + s.note + "\u201d"; } else { sn.style.display="none"; }
    const b = el.querySelector(".badge");
    b.classList.add(st);
    b.textContent = st.charAt(0).toUpperCase() + st.slice(1);
    box.appendChild(el);
  });
}
$("#paySearch").addEventListener("input", renderPayments);

/* ---------- memories carousel ---------- */
// Slides pull from Files/photo1.JPG ... photo26.JPG (uppercase .JPG).
// Any file that doesn't exist is skipped automatically. Change 26 to add/remove.
const MEMORIES = Array.from({length:26}, (_,i)=> "Files/photo" + (i+1) + ".JPG");
(function(){
  const car=$("#memCarousel"), track=$("#memTrack"), dotsWrap=$("#memDots");
  let idx=0;
  MEMORIES.forEach(src=>{
    const s=document.createElement("div"); s.className="slide";
    const img=document.createElement("img"); img.alt="Freshers'25 memory"; img.loading="lazy";
    img.onerror=()=>{ s.remove(); refresh(); };
    img.src=src; s.appendChild(img); track.appendChild(s);
  });
  function refresh(){
    const n=track.children.length;
    if(idx>=n) idx=Math.max(0,n-1);
    track.style.transform="translateX("+(-idx*100)+"%)";
    dotsWrap.innerHTML="";
    for(let i=0;i<n;i++){ const d=document.createElement("span"); d.className="dotc"+(i===idx?" on":""); d.onclick=()=>{idx=i;refresh();}; dotsWrap.appendChild(d); }
    const many=n>1;
    $("#memPrev").style.display=many?"grid":"none";
    $("#memNext").style.display=many?"grid":"none";
    dotsWrap.style.display=many?"flex":"none";
  }
  function go(d){ const n=track.children.length; if(!n) return; idx=(idx+d+n)%n; refresh(); }
  $("#memPrev").onclick=()=>go(-1);
  $("#memNext").onclick=()=>go(1);
  let timer=setInterval(()=>go(1),4500);
  car.addEventListener("mouseenter",()=>clearInterval(timer));
  car.addEventListener("mouseleave",()=>{ clearInterval(timer); timer=setInterval(()=>go(1),4500); });
  // swipe (touch) + drag (mouse)
  let sx=null;
  car.addEventListener("touchstart",e=>sx=e.touches[0].clientX,{passive:true});
  car.addEventListener("touchend",e=>{ if(sx===null)return; const dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>40) go(dx<0?1:-1); sx=null; });
  car.addEventListener("mousedown",e=>sx=e.clientX);
  car.addEventListener("mouseup",e=>{ if(sx===null)return; const dx=e.clientX-sx; if(Math.abs(dx)>40) go(dx<0?1:-1); sx=null; });
  refresh();
})();

/* ---------- user chip ---------- */
function refreshUserUI(){
  const tag = $("#userTag");
  if(user){
    tag.style.display="flex";
    $("#userName").textContent = user.name;
    $("#userAv").textContent = (user.name.trim()[0]||"?").toUpperCase();
    $("#loginBtn").textContent = "Logout";
  } else {
    tag.style.display="none";
    $("#loginBtn").textContent = "Login";
  }
  refreshAdminUI();
}

/* ---------- login ---------- */
$("#loginBtn").onclick = async ()=>{
  if(user){
    if(LIVE && fb){ try{ await fb.signOut(fb.auth); }catch(e){} }
    user=null; refreshUserUI(); subscribeMyPending(); repaint(); showToast("Logged out");
  } else { msg(""); openM(loginOverlay); }
};

$("#googleBtn").onclick = async ()=>{
  if(LIVE){
    if(!fb){ msg("Still connecting to Firebase \u2014 try again in a second.","err"); return; }
    $("#googleBtn").disabled = true; msg("Opening Google sign-in\u2026","ok");
    try{
      const provider = new fb.GoogleAuthProvider();
      provider.setCustomParameters({ hd: ALLOWED_DOMAINS[0], prompt: "select_account" });
      await fb.signInWithPopup(fb.auth, provider);
      // onAuthStateChanged enforces the domain and updates the UI
      msg(""); closeM(loginOverlay);
    }catch(e){
      const code = e && e.code ? e.code : "";
      if(code === "auth/popup-blocked"){
        try{ const p = new fb.GoogleAuthProvider(); p.setCustomParameters({hd:ALLOWED_DOMAINS[0]}); await fb.signInWithRedirect(fb.auth, p); }
        catch(e2){ msg("Couldn't open Google sign-in.","err"); }
      } else if(code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request"){
        msg("");
      } else {
        msg("Sign-in failed: " + (code || e.message || e), "err");
      }
    }
    $("#googleBtn").disabled = false;
  } else {
    // preview demo login
    user = { email: "demo@"+ALLOWED_DOMAINS[0], name: "Demo Student" };
    refreshUserUI(); subscribeMyPending(); closeM(loginOverlay); repaint();
    showToast("Welcome, Demo Student! (preview)");
  }
};

/* ---------- pay ---------- */
function wantPay(amt, fixed){
  if(!user){ openM(loginOverlay); showToast("Please login first"); return; }
  if(fixed){
    $("#amtSection").style.display = "none";   // fixed amount -> no amount entry
    $("#inAmt").value = amt;
    $("#payTo").style.display = "";            // show QR/button straight away
  } else {
    $("#amtSection").style.display = "";       // custom -> show amount entry
    $("#inAmt").value = "";
    document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
    $("#payTo").style.display = "none";        // hide QR/button until amount entered
  }
  $("#inUtr").value = "";
  updatePayBtn(); openM(payOverlay);
}
// Full amount -> pay the remaining toward the goal, no amount entry
$("#contribBtn").onclick = ()=>{
  if(!user){ openM(loginOverlay); showToast("Please login first"); return; }
  if(remainingAmt > 0) wantPay(remainingAmt, true);
  else wantPay(0, false);                      // goal met -> custom extra
};
// Custom amount -> show the amount box first
$("#extraBtn").onclick   = ()=> wantPay(0, false);
$("#inAmt").addEventListener("input", updatePayBtn);
document.querySelectorAll(".chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
  c.classList.add("on"); $("#inAmt").value=c.dataset.amt; updatePayBtn();
});
function upiLink(amt){
  return "upi://pay?pa=" + encodeURIComponent(UPI_ID)
       + "&pn=" + encodeURIComponent(UPI_NAME)
       + (amt>0 ? "&am=" + amt : "")
       + "&cu=INR&tn=" + encodeURIComponent("Freshers26");
}
function updatePayBtn(){
  const amt = Number($("#inAmt").value)||0;
  $("#payAmtLbl").textContent = money(amt);
  const link = upiLink(amt);          // amount included — for the direct "Pay with UPI" intent button
  const qrLink = upiLink(0);          // NO amount — a plain payee QR, so apps allow paying it from the gallery
  const a = $("#openUpi"); if(a) a.setAttribute("href", link);
  // amount-less QR — apps treat amount-bearing QRs from the gallery as risky and block them
  const img = $("#upiQr"); if(img) img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=" + encodeURIComponent(qrLink);
  // custom mode: only reveal the QR/button once an amount is entered
  if($("#amtSection").style.display !== "none"){
    $("#payTo").style.display = amt>0 ? "" : "none";
  }
}
function initPayTo(){
  // "Pay with UPI" deep link only works on phones — hide it on laptops (QR still shown)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if(!isMobile){ const o=$("#openUpi"); if(o) o.style.display="none"; }
  updatePayBtn();
}
initPayTo();
function saveContribution(amt, paymentId){
  if(LIVE){
    fb.setDoc(fb.doc(fb.db,"contributions",user.email), {
      email: user.email, name: user.name,
      amount: fb.increment(amt),
      lastPaymentId: paymentId || "manual",
      updatedAt: fb.serverTimestamp()
    }, { merge:true })
      .then(()=> showToast("Paid " + money(amt) + " \u2726"))
      .catch(e=>{ showToast("Payment received, bar update failed: " + (e.code||e.message)); console.error(e); });
  } else {
    data[user.email] = (data[user.email]||0) + amt; repaint();
    showToast("Paid " + money(amt) + " \u2726 (preview)");
  }
}
function submitPayment(amt, utr){
  if(!user){ closeM(payOverlay); openM(loginOverlay); showToast("Please login first"); return; }
  if(amt<1){ showToast("Enter an amount"); $("#inAmt").focus(); return; }
  const customMode = $("#amtSection").style.display !== "none";
  if(customMode && amt < 500){ showToast("Minimum contribution is \u20b9500"); $("#inAmt").focus(); return; }
  utr = (utr||"").trim();
  if(!/^[a-zA-Z0-9]{3,}$/.test(utr)){ showToast("Enter a valid UPI Ref No. / UTR"); $("#inUtr").focus(); return; }
  if(!LIVE){
    closeM(payOverlay); $("#inUtr").value="";
    showToast("Submitted for verification (preview)");
    return;
  }
  // store as a pending submission, keyed by the UTR so the same ref can't create duplicates
  fb.setDoc(fb.doc(fb.db,"pending",utr), {
    email: user.email, name: user.name,
    amount: amt, utr: utr,
    status: "pending", at: fb.serverTimestamp()
  })
    .then(()=>{ closeM(payOverlay); $("#inUtr").value=""; showToast("Submitted \u2726 — it'll show on the bar once verified"); })
    .catch(e=>{ showToast("Couldn't submit: " + (e.code||e.message)); console.error(e); });
}
$("#submitUtr").onclick = ()=>{
  submitPayment(Number($("#inAmt").value)||0, $("#inUtr").value);
};

/* ---------- Firebase ---------- */
function subscribe(){
  if(!LIVE || !fb) return;
  if(unsub) unsub();
  unsub = fb.onSnapshot(fb.collection(fb.db,"contributions"), snap=>{
    data = {};
    snap.forEach(d=>{ const v=d.data()||{}; data[(v.email||d.id)] = Number(v.amount)||0; });
    repaint();
  }, err=>console.error("snapshot error", err));
}

function subscribeMyPending(){
  if(unsubMyPending){ unsubMyPending(); unsubMyPending=null; }
  myPending = 0; mySubs = [];
  if(!LIVE || !fb || !user){ repaint(); return; }
  const q = fb.query(fb.collection(fb.db,"pending"), fb.where("email","==",user.email));
  unsubMyPending = fb.onSnapshot(q, snap=>{
    let p=0; const list=[];
    snap.forEach(d=>{ const v=d.data()||{}; list.push(v); if(v.status==="pending") p += Number(v.amount)||0; });
    list.sort((a,b)=> ((a.at&&a.at.seconds)||0) - ((b.at&&b.at.seconds)||0));
    mySubs = list; myPending = p; repaint();
    if($("#mySubsOverlay").classList.contains("show")) renderMySubs();
  }, err=>console.error("my-pending snapshot", err));
}
let unsubPending = null;
function isAdmin(){ return !!user && ADMIN_EMAILS.indexOf(user.email) > -1; }
function refreshAdminUI(){
  const btn = $("#adminBtn");
  if(!btn) return;
  if(isAdmin()){ btn.style.display = ""; subscribePending(); }
  else { btn.style.display = "none"; if(unsubPending){ unsubPending(); unsubPending=null; } }
}
let adminTab = "pending";
function syncAdminTabs(){
  document.querySelectorAll(".atab").forEach(b=> b.classList.toggle("on", b.dataset.tab===adminTab));
}
document.querySelectorAll(".atab").forEach(b=>{
  b.onclick = ()=>{ adminTab = b.dataset.tab; syncAdminTabs(); renderAdmin(); };
});
$("#adminBtn").onclick = ()=>{ if($("#adminSearch")) $("#adminSearch").value=""; adminTab="pending"; syncAdminTabs(); renderAdmin(); openM(adminOverlay); };
if($("#adminSearch")) $("#adminSearch").oninput = renderAdmin;
function subscribePending(){
  if(!LIVE || !fb || unsubPending) return;
  unsubPending = fb.onSnapshot(fb.collection(fb.db,"pending"), snap=>{
    const rows = []; snap.forEach(d=> rows.push(d.data()));
    allSubs = rows; renderAdmin();
  }, err=>console.error("pending snapshot", err));
}
function renderAdmin(){
  const box = $("#adminList");
  const term = (($("#adminSearch") && $("#adminSearch").value) || "").trim().toLowerCase();
  const isPending = r => (r.status || "pending") === "pending";

  // tab counts
  const pendCount = allSubs.filter(isPending).length;
  const prevCount = allSubs.length - pendCount;
  const ptab = $("#tabPending"), vtab = $("#tabPrevious");
  if(ptab) ptab.textContent = "Pending" + (pendCount ? (" ("+pendCount+")") : "");
  if(vtab) vtab.textContent = "Previous payments" + (prevCount ? (" ("+prevCount+")") : "");

  // only show rows for the active tab; search filters within it
  let rows = allSubs.filter(r => adminTab === "previous" ? !isPending(r) : isPending(r));
  if(term) rows = rows.filter(r => (((r.name||"")+" "+(r.email||"")+" "+(r.utr||"")).toLowerCase()).indexOf(term) > -1);
  rows.sort((a,b)=> ((b.at&&b.at.seconds)||0) - ((a.at&&a.at.seconds)||0));

  if(!rows.length){
    const msg = adminTab === "previous"
      ? (term ? "No previous payments match that search." : "No decided payments yet.")
      : (term ? "No pending payments match that search." : "No pending payments \u2014 all caught up \u2726");
    box.innerHTML = '<p class="hint">' + msg + '</p>';
    return;
  }
  box.innerHTML = "";
  rows.forEach(r=>{
    const st = r.status || "pending";
    const el = document.createElement("div");
    el.className = "admin-row";
    el.innerHTML =
      '<div class="top"><span class="nm"></span><span class="badge"></span></div>' +
      '<div class="meta"></div>' +
      '<input class="msg-in" type="text" maxlength="140" placeholder="Optional message (shown to them)">' +
      '<div class="acts"><button class="btn solid ap">Approve</button><button class="btn ghost danger rj">Reject</button></div>';
    el.querySelector(".nm").textContent = (r.name||r.email) + " \u00b7 " + money(Number(r.amount)||0);
    const b = el.querySelector(".badge"); b.classList.add(st); b.textContent = st.charAt(0).toUpperCase()+st.slice(1);
    el.querySelector(".meta").textContent = r.email + " \u00b7 UTR " + r.utr;
    const msgIn = el.querySelector(".msg-in");
    if(r.note) msgIn.value = r.note;
    el.querySelector(".ap").onclick = ()=> approvePending(r.utr, msgIn.value);
    el.querySelector(".rj").onclick = ()=> rejectPending(r.utr, msgIn.value);
    box.appendChild(el);
  });
}
function approvePending(utr, note){
  fb.runTransaction(fb.db, async (t)=>{
    const pRef = fb.doc(fb.db,"pending",utr);
    const pSnap = await t.get(pRef);
    if(!pSnap.exists()) return;
    const p = pSnap.data();
    if(p.status === "approved"){ t.update(pRef, { note:(note||"").trim() }); return; } // already credited
    const cRef = fb.doc(fb.db,"contributions", p.email);
    const cSnap = await t.get(cRef);
    const prev = cSnap.exists() ? (Number(cSnap.data().amount)||0) : 0;
    t.set(cRef, {
      email: p.email, name: p.name,
      amount: prev + (Number(p.amount)||0),
      lastPaymentId: "utr:" + utr,
      updatedAt: fb.serverTimestamp()
    }, { merge:true });
    t.update(pRef, { status:"approved", note:(note||"").trim(), approvedAt: fb.serverTimestamp() });
  })
    .then(()=> showToast("Approved \u2726"))
    .catch(e=>{ showToast("Approve failed: " + (e.code||e.message)); console.error(e); });
}
function rejectPending(utr, note){
  fb.runTransaction(fb.db, async (t)=>{
    const pRef = fb.doc(fb.db,"pending",utr);
    const pSnap = await t.get(pRef);
    if(!pSnap.exists()) return;
    const p = pSnap.data();
    if(p.status === "rejected"){ t.update(pRef, { note:(note||"").trim() }); return; }
    if(p.status === "approved"){            // reverse a previous approval
      const cRef = fb.doc(fb.db,"contributions", p.email);
      const cSnap = await t.get(cRef);
      const prev = cSnap.exists() ? (Number(cSnap.data().amount)||0) : 0;
      t.set(cRef, { amount: Math.max(prev - (Number(p.amount)||0), 0), updatedAt: fb.serverTimestamp() }, { merge:true });
    }
    t.update(pRef, { status:"rejected", note:(note||"").trim(), rejectedAt: fb.serverTimestamp() });
  })
    .then(()=> showToast("Rejected"))
    .catch(e=>{ showToast("Reject failed: " + (e.code||e.message)); console.error(e); });
}
async function initFirebase(){
  try{
    const appMod  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const fsMod   = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    // Force long-polling so reads/writes work on restrictive college / Wi-Fi networks
    const db = fsMod.initializeFirestore(app, { experimentalForceLongPolling: true });
    fb = { auth: authMod.getAuth(app), db, ...authMod, ...fsMod };

    // complete a redirect sign-in if we came back from one
    try{ await fb.getRedirectResult(fb.auth); }catch(e){ console.warn("redirect result", e); }

    fb.onAuthStateChanged(fb.auth, async u=>{
      if(u){
        if(!domainOK(u.email||"")){
          await fb.signOut(fb.auth);
          showToast("Use your @"+ALLOWED_DOMAINS[0]+" student email to sign in");
          user=null;
        } else {
          user = { email:(u.email||"").toLowerCase(), name: u.displayName || (u.email||"").split("@")[0] };
        }
      } else user=null;
      refreshUserUI(); subscribeMyPending(); repaint();
    });
    subscribe();
  }catch(e){
    console.error("Firebase failed to load/init", e);
    showToast("Couldn't connect to Firebase \u2014 check your config");
  }
}

/* ---------- scroll reveal ---------- */
const io = new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) e.target.classList.add("in"); }),{threshold:.12});
document.querySelectorAll(".reveal:not(.in)").forEach(el=>io.observe(el));

/* ---------- boot ---------- */
if(LIVE){
  $("#loginHint").innerHTML = "Sign in with your <strong style='color:var(--gold-soft)'>college Google account</strong> to contribute toward Freshers'26.";
  initFirebase();
} else {
  $("#previewBanner").classList.add("show");
  $("#loginHint").innerHTML = "<strong style='color:var(--gold-soft)'>Preview mode</strong> \u2014 the Google button signs you in instantly so you can try the flow.";
}
refreshUserUI();
repaint();