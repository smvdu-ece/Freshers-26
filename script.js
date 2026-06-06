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
const RAZORPAY_KEY_ID = "rzp_test_Sy3RPG1Q1JAf3e";   // Razorpay Key ID (test). Live key replaces this later. NEVER put the Key Secret here.

const LIVE = !!FIREBASE_CONFIG.apiKey;
let user = null;            // { email, name }
let data = {};              // email -> amount  (live snapshot or preview memory)
let payMethod = "UPI";
let fb = null, unsub = null;

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const loginOverlay = $("#loginOverlay"), payOverlay = $("#payOverlay"), toast = $("#toast");
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
[loginOverlay,payOverlay,document.getElementById("payListOverlay")].forEach(o=>o&&o.addEventListener("click",e=>{ if(e.target===o) closeM(o); }));

/* ---------- mobile hamburger menu ---------- */
const navLinks = document.getElementById("navLinks"), hamburger = document.getElementById("hamburger");
hamburger.onclick = ()=>{ navLinks.classList.toggle("open"); hamburger.classList.toggle("open"); };
navLinks.querySelectorAll("a").forEach(a=> a.onclick=()=>{ navLinks.classList.remove("open"); hamburger.classList.remove("open"); });

/* ---------- paint the bar + stats ---------- */
function repaint(){
  let total=0, count=0;
  for(const k in data){ total += data[k]; count++; }
  const mine = user ? (data[user.email]||0) : 0;
  const pct = Math.min(mine/GOAL,1)*100;
  $("#barFill").style.width = pct + "%";
  $("#paidAmt").textContent = money(mine);
  $("#barPct").textContent = Math.round(pct) + "% complete";
  $("#barLeft").textContent = mine>=GOAL ? (mine>GOAL ? money(mine-GOAL)+" extra \u2726" : "Goal reached \u2726") : money(GOAL-mine)+" to go";
  $("#doneBadge").style.display = mine>=GOAL ? "flex" : "none";
  $("#totalRaised").textContent = money(total);
  $("#contribCount").textContent = count;
  $("#yourTotal").textContent = money(mine);
  var _lp=$("#loginToPay"), _pb=$("#payButtons");
  if(_lp) _lp.style.display = user ? "none" : "inline-flex";
  if(_pb) _pb.style.display = user ? "flex" : "none";
  if($("#payListOverlay").classList.contains("show")) renderPayments();
}

/* ---------- payments roster ---------- */
const NAMES = ["AAYUSH MONDAL","ABHIJEET GOYAL","ABHINANDAN KUMAR","ABHIRAJ BADHAN","ADITI SINGH","ADITYA ATHMIA","ADITYA KUMAR","ADITYA SHARMA","ADITYA SONKAR","ADVAIT KHAJURIA","AJAY KUMAR","AJAY KUMAR","AKASH KUMAR","AKSHAT SHIRSHWAR","ALISHA GANDOTRA","ALOK KUMAR","AMICHAND KUMHAR","AMIT SHARMA","ANANAYA BHAGAT","ANIKET KUMAR","ANKIT GANGWAR","ANKIT KUMAR SINGH","ANKIT VERMA","ANSH ANDOTRA","ANUBHAV SHARMA","ARYAN CHATURVEDI","ARYAN VERMA","ASHISH RANJAN","AVNISH RAJ","AYUSH SINGH YADAV","AYUSHMAN SINGH","BANTI KUMAR","CHAITANYA SHARMA","CHENNOJU HARSHITH KUMAR","CHINTALA RAM CHARAN TEJA","DEEPAK KUMAR","DHIRAJ KUMAR","DIPIKA SINHA","DIVYA RANI","HARSH RAJ","HARSH RAJ","JATIN SHARMA","KARTIK CHAUHAN","KRISHNA KRISHNANSHU BALI","LAKSHYA SACHDEVA","MANISH BAGOTIA","MANSI","MD GULAM MURSHID","MILIND WAGDRE","MOHD YUSUF IMRAN","MRIGAANKA BHAGAT","NITIN KUMAR","PATTIMI HEMANTHKUMAR","PIYUSH KUMAR","PIYUSH KUMAR","PRAGATI VERMA","PRAGYA SINGH","PRANAV KALOTRA","PRIYANSHU SHARMA","RAGHAV TIWARI","RAJ HARSH KUMAR","RAKESH KUMAR","RAMLEEN KAUR RANA","RITU RAJ","SAKSH SHARMA","SAMBHAV GUPTA","SAMEER KUMAR YADAV","SANDEEP KUMAR YADAV","SANJAN KUMAR","SARVAJEET SONKAR","SAURAV SINGH RAWAT","SHALWI KUMARI","SHANTANU PANDA","SHAURYA VEER ARORA","SHIVAM KUMAR","SHUBHAM KASHAV","SONAM","SOURYA GUPTA","SUJIT KUMAR","SUMIT RAJ","SUMIT VERMA","SURAJ BHARGAV","TANISH SHARMA","UTKARSH CHANDRAVANSHI","VANSH ABROL","VANSH PRATAP SINGH","VIDHAN PRAKASH SAIN","VINAMRATA","VISHNU KUMAR DIXIT","YOGESH"];
const EXCLUDE = [1,46,84];
const ROSTER = [];
for(let n=1;n<=90;n++){ if(EXCLUDE.includes(n)) continue; ROSTER.push({ email:"25bec"+String(n).padStart(3,"0")+"@smvdu.ac.in", name:NAMES[n-1] }); }
function renderPayments(){
  const q = ($("#paySearch").value||"").toLowerCase();
  let full=0, part=0, none=0;
  ROSTER.forEach(p=>{ const a=data[p.email]||0; if(a>=GOAL) full++; else if(a>0) part++; else none++; });
  $("#paySummary").innerHTML = '<span class="s-g">'+full+' full</span> · <span class="s-y">'+part+' partial</span> · <span class="s-r">'+none+' pending</span>';
  const rows = ROSTER.filter(p=> p.email.includes(q) || p.name.toLowerCase().includes(q)).map(p=>{
    const amt = data[p.email]||0;
    const cls = amt>=GOAL ? "g" : (amt>0 ? "y" : "r");
    return '<div class="prow"><span class="dot '+cls+'"></span><span class="pe"><span class="pn">'+p.name+'</span><span class="pem">'+p.email+'</span></span><span class="pa">'+money(amt)+'</span></div>';
  }).join("");
  $("#payList").innerHTML = rows || '<div class="prow" style="justify-content:center;color:var(--muted)">No matches</div>';
}
$("#seePaymentsBtn").onclick = ()=>{ $("#paySearch").value=""; renderPayments(); openM($("#payListOverlay")); };
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
}

/* ---------- login ---------- */
$("#loginBtn").onclick = async ()=>{
  if(user){
    if(LIVE && fb){ try{ await fb.signOut(fb.auth); }catch(e){} }
    user=null; refreshUserUI(); repaint(); showToast("Logged out");
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
    refreshUserUI(); closeM(loginOverlay); repaint();
    showToast("Welcome, Demo Student! (preview)");
  }
};

/* ---------- pay ---------- */
function wantPay(defaultAmt){
  if(!user){ openM(loginOverlay); showToast("Please login first"); return; }
  $("#inAmt").value = defaultAmt; updatePayBtn(); openM(payOverlay);
}
// Login gate for the Razorpay payment buttons (login required before paying)
$("#loginToPay").onclick = ()=>{ openM(loginOverlay); };
$("#inAmt").addEventListener("input", updatePayBtn);
document.querySelectorAll(".chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
  c.classList.add("on"); $("#inAmt").value=c.dataset.amt; updatePayBtn();
});
function updatePayBtn(){ $("#doPay").textContent = "Pay " + money(Number($("#inAmt").value)||0); }
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
function payNow(amt){
  if(amt<1){ return; }
  if(!user){ closeM(payOverlay); openM(loginOverlay); return; }
  closeM(payOverlay);
  // Real payment via Razorpay when a Key ID is configured
  if(RAZORPAY_KEY_ID && typeof Razorpay !== "undefined"){
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: Math.round(amt*100),         // amount in paise
      currency: "INR",
      name: "F\u00eate des Freshers '26",
      description: "Freshers'26 contribution",
      prefill: { name: user.name, email: user.email },
      notes: { email: user.email },
      theme: { color: "#d4af37" },
      handler: function(response){ saveContribution(amt, response.razorpay_payment_id); },
      modal: { ondismiss: function(){ showToast("Payment cancelled"); } }
    };
    const rzp = new Razorpay(options);
    rzp.on("payment.failed", function(resp){
      showToast("Payment failed: " + ((resp.error && resp.error.description) || ""));
    });
    rzp.open();
  } else {
    // No gateway configured yet -> record directly (demo / preview)
    saveContribution(amt, null);
  }
}
$("#doPay").onclick = ()=>{
  const amt = Number($("#inAmt").value)||0;
  if(amt<100){ showToast("Minimum contribution is \u20b9100"); $("#inAmt").focus(); return; }
  payNow(amt);
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
      refreshUserUI(); repaint();
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