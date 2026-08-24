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
// ── Allowed email patterns ─────────────────────────────────────────
// 25bec0…@smvdu.ac.in   → senior (2025 batch) — sees contribution section
// 26bec…@smvdu.ac.in    → fresher (2026 batch) — sees registration section
const ALLOWED_DOMAINS = ["smvdu.ac.in"];   // kept for hd hint in Google provider
const SENIOR_RE  = /^25bec0[^@]+@smvdu\.ac\.in$/i;
const FRESHER_RE = /^26bec[^@]+@smvdu\.ac\.in$/i;
// Manually-authorised emails outside the batch patterns:
const EXTRA_SENIORS  = ["sujitsingh8389@gmail.com",
                        "kumarsujit73775@gmail.com"];         // log in as senior
const EXTRA_FRESHERS = ["25f2001633@ds.study.iitm.ac.in"];     // log in as junior
function emailAllowed(email){
  const e=(email||"").toLowerCase().trim();
  return SENIOR_RE.test(e) || FRESHER_RE.test(e)
      || EXTRA_SENIORS.includes(e) || EXTRA_FRESHERS.includes(e);
}
function userRole(email){
  const e=(email||"").toLowerCase().trim();
  if(SENIOR_RE.test(e) || EXTRA_SENIORS.includes(e)) return "senior";
  return "fresher";
}
const GOAL = 1699;
/* ---- Version A: direct UPI + manual verify (no gateway) ---- */
const UPI_ID    = "7654201815@upi";                 // <-- the UPI ID that RECEIVES the money
const UPI_NAME  = "Freshers-26";                    // name shown in the payer's UPI app
const ADMIN_EMAILS = ["25bec079@smvdu.ac.in"];
const REG_ADMIN    = "25bec079@smvdu.ac.in"; // approves registrations (same as contribution admin)
const OWNER_EMAIL  = "25bec079@smvdu.ac.in"; // only the owner can create/remove budget categories
/* Budget admins may file expense requests and nothing else: no contributions
   panel, no registrations, no payment requests, no sheet sync. Everything they
   add waits for the owner like any other pending expense. */
/* Keep this list identical to isBudgetAdmin() in the Firestore rules — this one
   only decides what the UI shows; the rules decide what actually gets written. */
const BUDGET_ADMINS = [
  "kumarsujit73775@gmail.com",
  "25bec031@smvdu.ac.in",
  "25bec038@smvdu.ac.in",
  "25bec075@smvdu.ac.in",
  "25bec021@smvdu.ac.in",
  "25bec063@smvdu.ac.in"
];
const REG_FEE      = 0;       // juniors register free; 0 hides the whole payment half
const FEE_ENABLED  = REG_FEE > 0;   // one switch: set REG_FEE back above 0 to restore it
/* reCAPTCHA v3 site key for App Check. Public by design — the SECRET key
   lives only in the Firebase console and must never appear here. */
const RECAPTCHA_SITE_KEY = "6LeNs4gtAAAAAKy5umBdUeaqy8GxmFWnVN5KqTkU";
const SHEET_URL    = "https://script.google.com/macros/s/AKfycbz3Sbgb6LRmr4fh8WFHjXCqezUnkrQH8M7h4fTPY0EncC7Q20Wq48IXzOCN5uWj_6SV/exec";  // Google Apps Script Web App URL
const SHEET_SECRET = "freshers26";                  // must match SECRET in the Apps Script
/* ---- Budget usage lives in Firebase (Firestore doc: budget/main).
   Admins edit it on the site — set total, add/remove expenses. Everyone sees it live. ---- */

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
const payOverlay = $("#payOverlay"), adminOverlay = $("#adminOverlay"), toast = $("#toast");
function money(n){ return "\u20b9" + Number(n||0).toLocaleString("en-IN"); }
function showToast(m){ toast.textContent = m; toast.classList.add("show"); setTimeout(()=>toast.classList.remove("show"),2800); }
function openM(o){ o.classList.add("show"); }
function closeM(o){ o.classList.remove("show"); }
function msg(t,cls){ const m=$("#loginMsg"); if(m){ m.textContent=t||""; m.className="lmsg "+(cls||""); } }
/* domainOK replaced by emailAllowed — see top of file */
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=()=>{ const o=x.closest(".overlay"); if(o) o.classList.remove("show"); });
[payOverlay,adminOverlay,document.getElementById("mySubsOverlay"),document.getElementById("payListOverlay")].forEach(o=>o&&o.addEventListener("click",e=>{ if(e.target===o) closeM(o); }));

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
  $("#extraBtn").style.display = "";   // always available — past the goal it's the only way to add more
  // Top-up chips: ₹199 completes 1500 → 1699 (goal), ₹301 completes 1699 → 2000 (gold).
  // Each only appears in the window where paying it lands exactly on that milestone.
  const c199=$("#chip199"); if(c199) c199.style.display = (mine>=GOAL-199 && mine<GOAL) ? "" : "none";
  const c301=$("#chip301"); if(c301) c301.style.display = (mine>=GOAL && mine<2000) ? "" : "none";
  // Total Raised = senior contributions + juniors (approved freshers × REG_FEE)
  const juniorTotalAmt = (typeof juniorRegs !== "undefined" ? juniorRegs.length : 0) * REG_FEE;
  const combinedRaised = total + juniorTotalAmt;
  seniorRaised = total;                 // 2025-2029 batch only
  $("#totalRaised").textContent = money(combinedRaised);
  totalRaised = combinedRaised;         // share with the Budget Usage modal
  // feed the raised-breakdown overlay
  const _rs=$("#raisedSeniors"),_rj=$("#raisedJuniors"),_rg=$("#raisedGrand");
  if(_rs)_rs.textContent=money(total);
  if(_rj)_rj.textContent=money(juniorTotalAmt);
  if(_rg)_rg.textContent=money(combinedRaised);
  if($("#budgetOverlay") && $("#budgetOverlay").classList.contains("show")) renderBudget();
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
  let payTotal=0;
  ROSTER.forEach(p=>{ const a=data[p.email]||0; payTotal+=a; if(a>=2000) gold++; else if(a>=GOAL) full++; else if(a>0) part++; else none++; });
  $("#paySummary").innerHTML = '<span class="s-gold">'+gold+' gold</span> · <span class="s-g">'+full+' full</span> · <span class="s-y">'+part+' partial</span> · <span class="s-r">'+none+' pending</span>';
  const _pt=$("#payTotalAmt"); if(_pt) _pt.textContent=money(payTotal);
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
const _raisedStat=$("#raisedStat"); if(_raisedStat) _raisedStat.onclick=()=>{ repaint(); openM($("#raisedOverlay")); };
$("#contribStat").onclick   = ()=>{ $("#paySearch").value=""; setPayFilter("all"); openM($("#payListOverlay")); };
$("#yourStat").onclick = ()=>{ openM($("#mySubsOverlay")); renderMySubs(); };

/* ---------- budget usage (stored in Firebase: doc budget/main) ---------- */
let budgetData = { items: [], categories: [] };  // live snapshot of doc budget/main
let budgetFilter = "__all";       // which category chip is selected in the list below
let payFormFor = null;            // id of the item whose "request paid" form is open
/* Items filed before approvals existed have no status — treat them as approved
   so nothing that was already live silently disappears. */
function isApproved(it){ return !it || it.status !== "pending"; }
function budgetApprovedItems(){ return (budgetData.items||[]).filter(isApproved); }
/* Pending expenses are internal: admins see them, contributors don't. */
function budgetVisibleItems(){ return isBudgetAdmin() ? (budgetData.items||[]) : budgetApprovedItems(); }
function isOwner(){ return !!user && user.email === OWNER_EMAIL; }
function isBudgetAdmin(){ return isAdmin() || (!!user && BUDGET_ADMINS.indexOf(user.email) > -1); }
/* Only whoever filed the expense may ask for it to be marked paid — they are
   the one holding the receipt. Items filed before `by` was recorded have no
   owner to fall back on, so the owner picks those up. */
function canRequestPay(it){
  if(!it || it.paid || !isApproved(it) || it.payReq) return false;
  if(!isBudgetAdmin()) return false;
  const me = (user && user.email) || "";
  return it.by ? it.by === me : isOwner();
}
let unsubBudget = null;
let totalRaised = 0;              // combined raised (seniors + juniors), used by Budget Usage modal
let seniorRaised = 0;             // 2025-2029 batch contributions only
function _bEsc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function budgetRef(){ return fb.doc(fb.db, "budget", "main"); }

function subscribeBudget(){
  if(!LIVE || !fb){ renderBudget(); return; }
  if(unsubBudget) return;                       // already listening
  unsubBudget = fb.onSnapshot(budgetRef(), snap=>{
    const d = snap.exists() ? (snap.data()||{}) : {};
    budgetData = {
      items: Array.isArray(d.items) ? d.items : [],
      categories: Array.isArray(d.categories) ? d.categories : []
    };
    renderBudget();
  }, err=>{ console.error("budget sub", err); });
}

/* Every category to offer: the owner-defined list, plus any category already
   used by an item (so nothing disappears if a category is later removed). */
function budgetCatList(){
  const out = (budgetData.categories||[]).map(c=>String(c||"").trim()).filter(Boolean);
  budgetVisibleItems().forEach(it=>{
    const c = String(it.category||"").trim();
    if(c && out.indexOf(c) < 0) out.push(c);
  });
  return out;
}

function renderCatOptions(){
  const sel = $("#inBudgetCat"); if(!sel) return;
  const cur = sel.value;
  const cats = budgetCatList();
  sel.innerHTML = '<option value="">Category (required)</option>'
    + cats.map(c=> '<option value="'+_bEsc(c)+'">'+_bEsc(c)+'</option>').join("");
  if(cats.indexOf(cur) > -1) sel.value = cur;   // keep what the admin had picked
}

/* Owner-only chips for removing a category. Removing one never touches the
   expenses already filed under it \u2014 they keep their category text. */
function renderCatAdmin(){
  const box = $("#catAdmin"); if(!box) return;
  box.style.display = isOwner() ? "block" : "none";
  if(!isOwner()) return;
  const chips = $("#catChips"); if(!chips) return;
  const cats = (budgetData.categories||[]).map(c=>String(c||"").trim()).filter(Boolean);
  chips.innerHTML = cats.length
    ? cats.map(c=> '<span class="cat-chip">'+_bEsc(c)+'<button class="cat-x" data-cat="'+_bEsc(c)+'" title="Remove">\u00d7</button></span>').join("")
    : '<span class="hint">No categories yet \u2014 add one above.</span>';
  chips.querySelectorAll(".cat-x").forEach(b=> b.onclick = ()=> removeBudgetCategory(b.dataset.cat));
}

function budgetItemsFor(key){
  const items = budgetVisibleItems();
  if(key === "__all")  return items;
  if(key === "__none") return items.filter(it=> !String(it.category||"").trim());
  return items.filter(it=> String(it.category||"").trim() === key);
}

function renderBudgetFilters(){
  const wrap = $("#budgetFilters"); if(!wrap) return;
  const items = budgetVisibleItems();
  const hasUncat = items.some(it=> !String(it.category||"").trim());
  const keys = ["__all"].concat(budgetCatList()).concat(hasUncat ? ["__none"] : []);
  if(keys.indexOf(budgetFilter) < 0) budgetFilter = "__all";   // selected category vanished
  if(!items.length){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = keys.map(k=>{
    const label = k==="__all" ? "All" : (k==="__none" ? "Uncategorised" : k);
    const sub   = budgetItemsFor(k).reduce((t,it)=> t + (Number(it.amount)||0), 0);
    return '<button class="bchip'+(k===budgetFilter?' active':'')+'" data-cat="'+_bEsc(k)+'">'
         + _bEsc(label) + '<span class="bchip-n">'+money(sub)+'</span></button>';
  }).join("");
  wrap.querySelectorAll(".bchip").forEach(b=> b.onclick = ()=>{ budgetFilter = b.dataset.cat; renderBudget(); });
}

function renderBudget(){
  const list  = $("#budgetList");
  const admin = isBudgetAdmin();   // may file an expense request
  const payAdmin = isAdmin();      // may also request/approve payments and sync
  const owner = isOwner();
  $("#budgetAdmin").style.display = admin ? "block" : "none";
  const syncBtn = $("#syncBudgetBtn");
  if(syncBtn) syncBtn.style.display = payAdmin ? "" : "none";
  renderCatOptions();
  renderCatAdmin();
  renderBudgetFilters();

  /* Only approved expenses count towards the public numbers. A pending one
     hasn't been agreed yet, so it must not move the needle for contributors. */
  const approved  = budgetApprovedItems();
  const needed    = approved.reduce((t,it)=> t + (Number(it.amount)||0), 0);
  const used      = approved.reduce((t,it)=> t + (it.paid ? (Number(it.amount)||0) : 0), 0);
  const remaining = totalRaised - used;

  $("#budgetNeeded").textContent = needed>0 ? money(needed) : "\u20b9-";
  const tn = $("#totalNeed"); if(tn) tn.textContent = needed>0 ? money(needed) : "\u20b9-";  // mirror on the contribution card
  $("#budgetTotal").textContent  = money(totalRaised);
  $("#budgetUsed").textContent   = money(used);
  $("#budgetLeft").textContent   = money(remaining);
  $("#budgetBarFill").style.width = (totalRaised>0 ? Math.min(Math.max(used/totalRaised,0),1)*100 : 0) + "%";

  if(!LIVE || !fb){ list.innerHTML = '<p class="hint">Connect Firebase to enable the live budget.</p>'; return; }
  if(!budgetVisibleItems().length){ list.innerHTML = '<p class="hint">No expenses added yet.</p>'; return; }
  const view = budgetItemsFor(budgetFilter);
  if(!view.length){ list.innerHTML = '<p class="hint">No expenses in this category yet.</p>'; return; }

  list.innerHTML = view.map(it=>{
    const paid    = !!it.paid;
    const pending = !isApproved(it);
    const req     = it.payReq || null;

    const proof = it.proof
      ? '<a class="bproof" href="'+_bEsc(it.proof)+'" target="_blank" rel="noopener">Proof ›</a>'
      : '<span class="bproof none">—</span>';

    /* The status cell says something different to each of the three audiences:
       the owner gets the decision buttons, a budget admin gets the request
       button, everyone else gets a plain read-only label. */
    let status;
    if(pending){
      status = owner
        ? '<button class="bstatus approve" data-approve="'+_bEsc(it.id)+'">Approve</button>'
          + '<button class="bstatus reject" data-reject="'+_bEsc(it.id)+'">Reject</button>'
        : '<span class="bstatus pending">Awaiting approval</span>';
    } else if(paid){
      status = owner
        ? '<button class="bstatus paid" data-unpay="'+_bEsc(it.id)+'">Paid \u2713</button>'
        : '<span class="bstatus paid">Paid</span>';
    } else if(req){
      status = owner
        ? '<button class="bstatus approve" data-paypprove="'+_bEsc(it.id)+'">Approve payment</button>'
          + '<button class="bstatus reject" data-paydecline="'+_bEsc(it.id)+'">Decline</button>'
        : '<span class="bstatus pending">Payment requested</span>';
    } else {
      /* Same form for both, but the owner's submission applies straight away
         while an admin's becomes a request. Either way a proof link is
         attached before anything reads as paid. */
      status = canRequestPay(it)
        ? '<button class="bstatus unpaid" data-request="'+_bEsc(it.id)+'">'+(owner?'Mark paid':'Request paid')+'</button>'
        : '<span class="bstatus unpaid">Not paid</span>';
    }

    /* An approval isn't final — the owner can pull anything back to pending,
       which also clears any payment on it. */
    if(owner && !pending){
      status += '<button class="bstatus reject" data-unapprove="'+_bEsc(it.id)+'">Unapprove</button>';
    }

    // Only the owner may delete outright; an admin's own pending item is still theirs to withdraw.
    const canDelete = owner || (admin && pending && it.by && user && it.by === user.email);
    const del = canDelete ? '<button class="bdel" data-id="'+_bEsc(it.id)+'" title="Remove">×</button>' : '<span></span>';

    const cat  = it.category ? '<span class="bcat">'+_bEsc(it.category)+'</span>' : '';
    const note = it.msg ? '<div class="bnote">'+_bEsc(it.msg)+'</div>' : '';
    const flag = pending ? '<span class="bflag">Pending</span>' : '';

    /* Add `admin &&` to both lines below to hide the filer's email from non-admins.
       bby-col is its own grid cell left of the amount (desktop); bby-inline sits
       with the chips on narrow screens. The empty span still has to be printed or
       rows without an email would shift a column left. */
    const byCol    = '<span class="bby bby-col">'+(it.by ? _bEsc(it.by) : '')+'</span>';
    const byInline = it.by ? '<span class="bby bby-inline">by '+_bEsc(it.by)+'</span>' : '';

    // Details of a pending payment request — admins only, since it's internal
    let reqBox = '';
    if(req && admin && !paid){
      const rAmt = Number(req.amount) || 0;
      const changed = rAmt > 0 && rAmt !== (Number(it.amount)||0);
      reqBox = '<div class="breq"><b>Payment requested</b>'
             + (req.by ? ' by '+_bEsc(req.by) : '')
             + (changed ? '<br><span class="bamt-change">Amount: '+money(it.amount)+' \u2192 '+money(rAmt)+'</span>' : '')
             + (req.proof ? '<br>Proof: <a href="'+_bEsc(req.proof)+'" target="_blank" rel="noopener">'+_bEsc(req.proof)+'</a>' : '')
             + (req.msg ? '<br>'+_bEsc(req.msg) : '')
             + '</div>';
    }

    // Inline form, shown in place when this admin clicked "Request paid"
    let form = '';
    if(payFormFor === it.id){
      form = '<div class="breq-form">'
           + '<label class="breq-lbl">Amount actually paid (\u20b9)</label>'
           + '<input type="number" id="reqAmt" min="1" step="1" value="'+(Number(it.amount)||0)+'">'
           + '<input type="text" id="reqProof" placeholder="Proof link (required)" value="'+_bEsc(it.proof||"")+'">'
           + '<input type="text" id="reqMsg" maxlength="200" placeholder="'+(owner?'Note about this payment (optional)':'Message for the owner (optional)')+'">'
           + '<div class="breq-actions">'
           + '<button class="bbtn solid" data-submitreq="'+_bEsc(it.id)+'">'+(owner?'Mark paid':'Send request')+'</button>'
           + '<button class="bbtn" data-cancelreq="1">Cancel</button>'
           + '</div></div>';
    }

    return '<div class="brow'+(pending?' is-pending':'')+'">'
         + '<div class="bmain"><div class="bwhere">'+_bEsc(it.where)+flag+'</div>'
         + note + reqBox + form
         + '<div class="bmeta">'+status+cat+byInline+'</div></div>'
         + byCol + '<span class="bamt">'+money(it.amount)+'</span>'+proof+del+'</div>';
  }).join("");

  list.querySelectorAll("[data-approve]").forEach(b=>     b.onclick = ()=> approveBudgetItem(b.dataset.approve));
  list.querySelectorAll("[data-reject]").forEach(b=>      b.onclick = ()=> rejectBudgetItem(b.dataset.reject));
  list.querySelectorAll("[data-unapprove]").forEach(b=>   b.onclick = ()=> unapproveBudgetItem(b.dataset.unapprove));
  list.querySelectorAll("[data-unpay]").forEach(b=>       b.onclick = ()=> toggleBudgetPaid(b.dataset.unpay));
  list.querySelectorAll("[data-request]").forEach(b=>     b.onclick = ()=> openPayRequest(b.dataset.request));
  list.querySelectorAll("[data-submitreq]").forEach(b=>   b.onclick = ()=> submitPayRequest(b.dataset.submitreq));
  list.querySelectorAll("[data-cancelreq]").forEach(b=>   b.onclick = ()=> { payFormFor = null; renderBudget(); });
  list.querySelectorAll("[data-paypprove]").forEach(b=>   b.onclick = ()=> approvePayment(b.dataset.paypprove));
  list.querySelectorAll("[data-paydecline]").forEach(b=>  b.onclick = ()=> declinePayment(b.dataset.paydecline));
  list.querySelectorAll(".bdel").forEach(b=>              b.onclick = ()=> deleteBudgetItem(b.dataset.id));
}

async function addBudgetItem(){
  if(!isBudgetAdmin()) return;
  const where = $("#inBudgetWhere").value.trim();
  const amount = Number($("#inBudgetAmt").value);
  const proof = $("#inBudgetProof").value.trim();
  const category = $("#inBudgetCat") ? $("#inBudgetCat").value.trim() : "";
  const msg = $("#inBudgetMsg") ? $("#inBudgetMsg").value.trim().slice(0,200) : "";
  if(!where){ showToast("Add what it's for"); return; }
  if(!(amount>0)){ showToast("Add a valid amount"); return; }
  if(!category){
    showToast(budgetCatList().length ? "Pick a category" : "No categories yet \u2014 ask the owner to add one");
    return;
  }
  const by = (user && user.email) || "";   // who filed this expense
  /* Nothing enters the budget on its own say-so — every expense waits for the
     owner, including one the owner filed. Keeps the record honest and means
     the flow looks the same no matter who is signed in. */
  const item = { id: "b" + Date.now() + Math.floor(Math.random()*1000),
                 where, amount, proof, category, msg, by, status: "pending",
                 paid:false, payReq:null, at: Date.now() };
  try{
    await fb.setDoc(budgetRef(), { items: [ ...(budgetData.items||[]), item ] }, { merge:true });
    $("#inBudgetWhere").value = ""; $("#inBudgetAmt").value = ""; $("#inBudgetProof").value = "";
    if($("#inBudgetCat")) $("#inBudgetCat").value = "";
    if($("#inBudgetMsg")) $("#inBudgetMsg").value = "";
    showToast(isOwner() ? "Added \u2014 approve it below to publish \u2726"
                        : "Sent to the owner for approval \u2726");
  }catch(e){ console.error(e); showToast("Couldn't add — check permissions"); }
}

/* ---------- owner decisions ---------- */
async function approveBudgetItem(id){
  if(!isOwner()) return;
  await patchBudgetItem(id, it=> ({ ...it, status:"approved" }), "Expense approved \u2726");
}

/* Undo an approval: back to pending, and any payment on it is dropped too,
   since the proof was accepted under the approval being withdrawn. */
async function unapproveBudgetItem(id){
  if(!isOwner()) return;
  const it = (budgetData.items||[]).find(x=> x.id===id);
  const wasPaid = it && it.paid;
  if(!confirm('Send "' + (it ? it.where : "this expense") + '" back to pending?'
     + (wasPaid ? " It is currently marked paid — that will be cleared." : ""))) return;
  await patchBudgetItem(id, x=> ({ ...x, status:"pending", paid:false, payReq:null }),
                        "Moved back to pending");
}

async function rejectBudgetItem(id){
  if(!isOwner()) return;
  const it = (budgetData.items||[]).find(x=> x.id===id);
  if(!confirm('Reject "' + (it ? it.where : "this expense") + '"? It will be removed from the list.')) return;
  await deleteBudgetItem(id, true);
}

async function approvePayment(id){
  if(!isOwner()) return;
  await patchBudgetItem(id, it=>{
    const r = it.payReq || {};
    return { ...it,
      paid: true,
      // the request's figures replace the estimate that was filed originally
      amount: (Number(r.amount) > 0) ? Number(r.amount) : it.amount,
      proof: r.proof || it.proof || "",
      msg:   r.msg   || it.msg   || "",
      payReq: null };
  }, "Payment approved \u2726");
}

async function declinePayment(id){
  if(!isOwner()) return;
  await patchBudgetItem(id, it=> ({ ...it, payReq:null }), "Payment request declined");
}

/* ---------- budget-admin requests ---------- */
function openPayRequest(id){
  const it = (budgetData.items||[]).find(x=> x.id===id);
  if(!canRequestPay(it)){ showToast("Only whoever added this expense can request payment"); return; }
  payFormFor = id;
  renderBudget();
}

async function submitPayRequest(id){
  const item = (budgetData.items||[]).find(x=> x.id===id);
  if(!canRequestPay(item)){ showToast("Only whoever added this expense can request payment"); return; }
  const proofEl = $("#reqProof"), msgEl = $("#reqMsg"), amtEl = $("#reqAmt");
  const proof = proofEl ? proofEl.value.trim() : "";
  const msg   = msgEl ? msgEl.value.trim().slice(0,200) : "";
  /* The listed amount is an estimate; this is what was actually paid. Falls back
     to the original if the field is missing, so nothing can zero out an item. */
  const amount = amtEl ? Number(amtEl.value) : Number(item.amount)||0;
  if(!(amount > 0)){ showToast("Enter the amount that was actually paid"); return; }
  if(!proof){ showToast(isOwner() ? "Add the payment proof link" : "Add a proof link so the owner can verify it"); return; }
  const who = (user && user.email) || "";
  payFormFor = null;
  if(isOwner()){
    // The approver is already here — no point queuing a request to themselves.
    await patchBudgetItem(id, it=> ({ ...it, paid:true, amount, proof, msg: msg || it.msg || "", payReq:null }),
                          "Marked paid \u2726");
    return;
  }
  await patchBudgetItem(id, it=> ({ ...it, payReq: { by: who, amount, proof, msg, at: Date.now() } }),
                        "Sent to the owner for approval \u2726");
}

/* ---------- shared writers ---------- */
// One place that reads the list, swaps a single item and writes it back.
async function patchBudgetItem(id, fn, okMsg){
  const next = (budgetData.items||[]).map(it=> it.id===id ? fn(it) : it);
  try{
    await fb.setDoc(budgetRef(), { items: next }, { merge:true });
    if(okMsg) showToast(okMsg);
  }catch(e){ console.error(e); showToast("Couldn't update — check permissions"); }
}

/* Owner-only, and only ever to UNDO a payment — marking something paid always
   goes through a request so the proof link is captured. */
async function toggleBudgetPaid(id){
  if(!isOwner()){ showToast("Only the owner can change a payment"); return; }
  await patchBudgetItem(id, it=> ({ ...it, paid:false, payReq:null }), "Marked not paid");
}

async function deleteBudgetItem(id, quiet){
  const it = (budgetData.items||[]).find(x=> x.id===id);
  const mine = it && it.by && user && it.by === user.email && !isApproved(it);
  if(!isOwner() && !(isBudgetAdmin() && mine)){
    showToast("Only the owner can remove an approved expense");
    return;
  }
  const next = (budgetData.items||[]).filter(x=> x.id !== id);
  try{
    await fb.setDoc(budgetRef(), { items: next }, { merge:true });
    showToast(quiet ? "Expense rejected" : "Expense removed");
  }catch(e){ console.error(e); showToast("Couldn't remove — check permissions"); }
}

/* ---------- categories (owner only) ---------- */
async function addBudgetCategory(){
  if(!isOwner()){ showToast("Only the owner can add categories"); return; }
  const inp = $("#inNewCat"); if(!inp) return;
  const name = inp.value.trim().slice(0,40);
  if(!name){ showToast("Type a category name"); return; }
  const cats = (budgetData.categories||[]).map(c=>String(c||"").trim()).filter(Boolean);
  if(cats.some(c=> c.toLowerCase() === name.toLowerCase())){ showToast("That category already exists"); return; }
  try{
    await fb.setDoc(budgetRef(), { categories: [...cats, name] }, { merge:true });
    inp.value = "";
    showToast("Category added \u2726");
  }catch(e){ console.error(e); showToast("Couldn't add \u2014 check permissions"); }
}

async function removeBudgetCategory(name){
  if(!isOwner()) return;
  const used = (budgetData.items||[]).filter(it=> String(it.category||"").trim() === name).length;
  const warn = used
    ? "Remove \"" + name + "\"? " + used + " expense(s) already filed under it keep the label, but no new expense can use it."
    : "Remove category \"" + name + "\"?";
  if(!confirm(warn)) return;
  const next = (budgetData.categories||[]).filter(c=> String(c||"").trim() !== name);
  try{
    await fb.setDoc(budgetRef(), { categories: next }, { merge:true });
    showToast("Category removed");
  }catch(e){ console.error(e); showToast("Couldn't remove \u2014 check permissions"); }
}

/* Push the WHOLE expense list to the Sheet in one request.
   The Apps Script wipes and rewrites the Expenses tab from this array,
   so deletes and edits reconcile and rows can never duplicate. */
async function syncBudgetToSheet(){
  if(!isAdmin()) return;
  if(!SHEET_URL){ showToast("Sheet URL not set"); return; }
  const items = budgetApprovedItems().map(it=>({
    id: it.id||"", where: it.where||"", category: it.category||"",
    amount: Number(it.amount)||0, proof: it.proof||"", msg: it.msg||"", by: it.by||"",
    paid: !!it.paid, at: Number(it.at)||0
  }));
  const idToken = await sheetToken();
  fetch(SHEET_URL, {
    method:"POST", mode:"no-cors",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: SHEET_SECRET, idToken, type:"expense", items })
  }).catch(e=>console.error("budget sheet sync", e));
  showToast("Syncing " + items.length + " expense(s) to the sheet\u2026");
}

$("#budgetBtn").onclick = ()=>{ openM($("#budgetOverlay")); renderBudget(); subscribeBudget(); };
const _ns = $("#needStat"); if(_ns) _ns.onclick = ()=>{ openM($("#budgetOverlay")); renderBudget(); subscribeBudget(); };
$("#addBudgetItem").onclick = addBudgetItem;
const _sb = $("#syncBudgetBtn"); if(_sb) _sb.onclick = syncBudgetToSheet;
const _ac = $("#addCatBtn"); if(_ac) _ac.onclick = addBudgetCategory;
const _nc = $("#inNewCat"); if(_nc) _nc.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); addBudgetCategory(); } });
const _bo = $("#budgetOverlay"); if(_bo) _bo.addEventListener("click", e=>{ if(e.target===_bo) closeM(_bo); });
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


/* ══════════════════════════════════════════════════════════════════
   LOGIN GATE — show / hide
══════════════════════════════════════════════════════════════════ */
const _gate = document.getElementById("gateOverlay");
function showGate(){
  _gate.classList.remove("hidden");
  document.documentElement.classList.add("gate-open");
}
function hideGate(){
  _gate.classList.add("hidden");
  document.documentElement.classList.remove("gate-open");
}
function gateMsg(t,cls){ const m=document.getElementById("gateMsg"); if(m){ m.textContent=t||""; m.className="lmsg "+(cls||""); } }

/* ══════════════════════════════════════════════════════════════════
   ROLE — switch between contribution view (senior) and
           registration view (fresher / special)
══════════════════════════════════════════════════════════════════ */
function applyRole(email){
  const role = userRole(email);
  const cSec    = document.getElementById("contribute");
  const rSec    = document.getElementById("fresher-reg");
  const navLink = document.getElementById("contributeNavLink");
  const adminUser = isAdmin() || isRegAdmin();
  if(adminUser){
    // Admin sees BOTH sections: contributions + registration admin panel
    if(cSec)    cSec.style.display = "";
    if(rSec)    rSec.style.display = "";
    if(navLink){ navLink.href="#contribute"; navLink.textContent="Contribute"; }
    // Admin doesn't fill the registration form — hide form + done card,
    // show only the section heading + "View Registrations" button.
    const _ff=document.getElementById("regFormWrap"); if(_ff)_ff.style.display="none";
    const _fd=document.getElementById("regDone"); if(_fd)_fd.style.display="none";
    const _sub=document.querySelector("#fresher-reg .sec-sub");
    if(_sub)_sub.textContent="Review and approve fresher registrations for Freshers'26.";
    subscribeJuniors();
    refreshRegAdminUI();   // shows "View Registrations" admin button
  } else if(role==="senior"){
    if(cSec)    cSec.style.display = "";
    if(rSec)    rSec.style.display = "none";
    if(navLink){ navLink.href="#contribute"; navLink.textContent="Contribute"; }
    const hero=document.getElementById("heroCtaBtn");
    if(hero){ hero.setAttribute("href","#contribute"); hero.textContent="Contribute to '26"; }
    const et=document.getElementById("entryTicketNav");
    if(et){ et.setAttribute("href","#reg26"); et.textContent="Entry Ticket"; }
    subscribeJuniors();
  } else {
    if(cSec)    cSec.style.display = "none";
    if(rSec)    rSec.style.display = "";
    if(navLink){ navLink.href="#fresher-reg"; navLink.textContent="Register"; }
    const hero=document.getElementById("heroCtaBtn");
    if(hero){ hero.setAttribute("href","#fresher-reg"); hero.textContent="Register for Freshers'26"; }
    // Entry Ticket nav stays as Entry Ticket → the ticket section
    const et=document.getElementById("entryTicketNav");
    if(et){ et.setAttribute("href","#reg26"); et.textContent="Entry Ticket"; }
    populateRegForm(); loadRegStatus(); /* loadRegStatus calls refreshRegAdminUI */
  }
  hideGate();
}

/* ══════════════════════════════════════════════════════════════════
   REGISTRATION FORM — freshers / special email only
══════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════
   REGISTRATION — photo, QR, submit, admin
══════════════════════════════════════════════════════════════════ */
let regPhotoData = null;
function isRegAdmin(){ return !!user && user.email === REG_ADMIN; }

function initRegQr(){
  const link="upi://pay?pa="+encodeURIComponent(UPI_ID)+"&pn="+encodeURIComponent(UPI_NAME)+"&am="+REG_FEE+"&cu=INR&tn="+encodeURIComponent("Freshers26Reg");
  const img=document.getElementById("regQr");
  if(img) img.src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data="+encodeURIComponent(link);
  const dlBtn=document.getElementById("regDownloadQr");
  if(dlBtn) dlBtn.onclick=()=>{
    const url="https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=16&data="+encodeURIComponent(link);
    fetch(url).then(r=>r.blob()).then(blob=>{
      const u=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=u; a.download="freshers26-entry-fee-qr.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(u),1500);
      showToast("QR downloaded \u2014 scan to pay "+money(REG_FEE));
    }).catch(()=>window.open(url,"_blank"));
  };
}

async function resizePhoto(file,size){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        canvas.width=size; canvas.height=size;
        const ctx=canvas.getContext("2d");
        const min=Math.min(img.width,img.height);
        ctx.drawImage(img,(img.width-min)/2,(img.height-min)/2,min,min,0,0,size,size);
        resolve(canvas.toDataURL("image/jpeg",0.75));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
(function(){
  const pi=document.getElementById("regPhotoInput");
  if(pi) pi.addEventListener("change",async e=>{
    const file=e.target.files[0]; if(!file) return;
    regPhotoData=await resizePhoto(file,260);
    const img=document.getElementById("regPhotoImg"),init=document.getElementById("regPhotoInitial");
    if(img){img.src=regPhotoData;img.style.display="";}
    if(init)init.style.display="none";
  });
})();

function populateRegForm(){
  if(!user) return;
  const ni=document.getElementById("regName");
  if(ni && !ni.value) ni.value=user.name||"";
  const init=document.getElementById("regPhotoInitial");
  if(init) init.textContent=(user.name||"?")[0].toUpperCase();
  // Entry No. from email pattern
  const ri=document.getElementById("regRoll"),ei=document.getElementById("regEmail");
  if(ei) ei.value=user.email;
  if(ri){
    const m=user.email.match(/^(26bec\d+)@smvdu\.ac\.in$/i);
    ri.value=m?m[1].toUpperCase():user.email.split("@")[0].toUpperCase();
  }
  initRegQr();
}

async function loadRegStatus(){
  if(!LIVE||!fb||!user) return;
  try{
    const snap=await fb.getDoc(fb.doc(fb.db,"registrations26",user.email));
    if(snap.exists()){ showRegDone(snap.data()); subscribeMyReg(); }
  }catch(e){ console.error("reg check",e); }
  refreshRegAdminUI();
}

/* With no fee there is nothing to scan or reference, so the QR, the download
   button and the UTR field come out rather than sitting there showing \u20b90. */
/* No fee, so the QR / UTR half of the ticket has nothing to hold. Rather than
   hiding it and leaving the ticket lopsided, that half becomes what a stub
   actually is: the tear-off part, with ADMIT ONE, the year and a barcode. */
(function applyFeeMode(){
  if(FEE_ENABLED) return;
  const sub = document.querySelector("#fresher-reg .sec-sub");
  if(sub) sub.textContent = "You\u2019re the new ECE family. Fill in your details to claim your pass \u2014 it\u2019s free.";
  ["rdAmountRow","rdUtrRow"].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display="none"; });

  const right = document.querySelector(".reg-right");
  if(!right) return;
  right.classList.add("reg-stub");
  right.innerHTML =
      '<div class="stub-rot">Admit One</div>'
    + '<div class="stub-mid">'
    +   '<div class="stub-kicker">F\u00eate des Freshers</div>'
    +   '<div class="stub-year">2K26</div>'
    +   '<div class="stub-rule"></div>'
    +   '<div class="stub-bars" aria-hidden="true"></div>'
    +   '<div class="stub-no">No. <span id="stubRoll">\u2014</span></div>'
    + '</div>';

  // The stub shows the entry number once it is filled in from the signed-in email.
  const roll = document.getElementById("regRoll"), out = document.getElementById("stubRoll");
  const syncRoll = ()=>{ if(out) out.textContent = (roll && roll.value.trim()) || "\u2014"; };
  syncRoll();
  setTimeout(syncRoll, 800);
  setTimeout(syncRoll, 2500);
})();

async function submitReg(){
  if(!user) return;
  const name=(document.getElementById("regName").value||"").trim();
  const phone=(document.getElementById("regPhone").value||"").trim();
  /* #regUtr no longer exists when the fee is off — the stub replaced that
     half of the ticket. Reading .value off null threw here, before the
     try/catch, so the submit button appeared to do nothing at all. */
  const utrEl=document.getElementById("regUtr");
  const utr=((utrEl && utrEl.value)||"").trim();
  if(!name){ showToast("Enter your full name"); return; }
  if(!/^[6-9]\d{9}$/.test(phone)){ showToast("Enter a valid 10-digit phone number"); return; }
  // Nothing to pay, so nothing to reference.
  if(FEE_ENABLED && utr.trim().length < 3){ showToast("Enter a payment reference or \"cash\""); return; }
  if(!regPhotoData){ showToast("Please upload your photo first"); return; }
  const btn=document.getElementById("regBtn"); btn.disabled=true; btn.textContent="Submitting\u2026";
  const m=user.email.match(/^(26bec\d+)@smvdu\.ac\.in$/i);
  const roll=m?m[1].toUpperCase():user.email.split("@")[0].toUpperCase();
  try{
    const payload={email:user.email,name,phone,roll,utr,amount:REG_FEE,photoData:regPhotoData,status:"pending"};
    if(LIVE) await fb.setDoc(fb.doc(fb.db,"registrations26",user.email),{...payload,at:fb.serverTimestamp()});
    const cb=document.getElementById("regCancelBtn"); if(cb)cb.style.display="none";
    showSuccessPopup(); showRegDone(payload); subscribeMyReg();
  }catch(e){
    console.error("reg submit",e); showToast("Submission failed: "+(e.code||e.message));
    btn.disabled=false; btn.textContent="Submit Registration";
  }
}
const _regBtn=document.getElementById("regBtn");
if(_regBtn) _regBtn.onclick=submitReg;

function showSuccessPopup(){
  const pop=document.createElement("div");
  pop.style.cssText="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78);backdrop-filter:blur(10px);";
  pop.innerHTML='<div style="text-align:center;padding:48px 40px;background:#16161a;border:1px solid rgba(212,175,55,.35);border-radius:20px;max-width:340px;width:90%"><div style="font-size:3.5rem;line-height:1;background:linear-gradient(135deg,#f3e08a,#d4af37);-webkit-background-clip:text;background-clip:text;color:transparent;">✦</div><h3 style="font-family:Cinzel,serif;color:#e7c96a;font-size:1.35rem;margin:16px 0 8px">Successfully Submitted!</h3><p style="color:#9a988f;font-size:.88rem;line-height:1.65">Your registration is pending admin approval.<br>Check back here for your status.</p></div>';
  document.body.appendChild(pop);
  setTimeout(()=>{pop.style.transition="opacity .5s";pop.style.opacity="0";setTimeout(()=>pop.remove(),500);},2800);
}

/* Live listener — updates student badge when admin approves/rejects */
let unsubMyReg=null;
function subscribeMyReg(){
  if(unsubMyReg){ unsubMyReg(); unsubMyReg=null; }
  if(!LIVE||!fb||!user) return;
  unsubMyReg=fb.onSnapshot(fb.doc(fb.db,"registrations26",user.email),snap=>{
    if(!snap.exists()) return;
    const d=snap.data();
    // Full state refresh — showRegDone handles approved / pending / rejected
    showRegDone(d);
  },err=>console.error("my-reg snapshot",err));
}
function showRegDone(d){
  const fw=document.getElementById("regFormWrap"),rd=document.getElementById("regDone");
  if(fw) fw.style.display="none";
  if(rd) rd.style.display="";
  const name=d.name||user.name||"";
  const el_n=document.getElementById("rscName"),el_e=document.getElementById("rscEmail");
  if(el_n) el_n.textContent=name;
  if(el_e) el_e.textContent=user.email;
  const badge=document.getElementById("rscBadge");
  const st=d.status||"pending";
  if(badge){badge.textContent=st==="approved"?"Approved ✓":st==="rejected"?"Rejected":"Pending Approval";badge.className="reg-badge "+st;}
  const img=document.getElementById("rscPhotoImg"),init=document.getElementById("rscPhotoInitial");
  if(d.photoData){if(img){img.src=d.photoData;img.style.display="";}if(init)init.style.display="none";}
  else{if(init){init.textContent=name[0]?.toUpperCase()||"?";init.style.display="";}}
  window._myRegData=d;
  const card=document.getElementById("regSubmittedCard");
  if(card) card.onclick=()=>openRegDetails(d);
  /* Any status → show Update button (re-opens form; submitting sends back for approval) */
  let rrbtn=document.getElementById("reregBtn");
  {
    if(!rrbtn){
      rrbtn=document.createElement("button"); rrbtn.id="reregBtn";
      rrbtn.style.cssText="margin:20px auto 0;display:block;";
      if(rd) rd.appendChild(rrbtn);
    }
    rrbtn.textContent = st==="rejected" ? "Re-submit" : "Update Details";
    rrbtn.className = st==="rejected" ? "btn solid" : "btn ghost";
    rrbtn.style.display="block";
    rrbtn.onclick=()=>{
      if(rd) rd.style.display="none";
      if(fw) fw.style.display="";
      const ni=document.getElementById("regName"); if(ni&&d.name)ni.value=d.name;
      const ph=document.getElementById("regPhone"); if(ph&&d.phone)ph.value=d.phone;
      const ut=document.getElementById("regUtr"); if(ut&&d.utr)ut.value=d.utr;
      if(d.photoData){
        regPhotoData=d.photoData;
        const pi=document.getElementById("regPhotoImg"),ii=document.getElementById("regPhotoInitial");
        if(pi){pi.src=d.photoData;pi.style.display="";}
        if(ii)ii.style.display="none";
      }
      populateRegForm();
      // Show cancel × so they can back out without changing anything
      const cb=document.getElementById("regCancelBtn");
      if(cb){ cb.style.display=""; cb.onclick=()=>{ if(fw)fw.style.display="none"; if(rd)rd.style.display=""; cb.style.display="none"; }; }
      showToast("Edit your details and submit \u2014 it will go back for approval.");
    };
  }
  refreshRegAdminUI();
}

function openRegDetails(d){
  const o=document.getElementById("regDetailsOverlay"); if(!o) return;
  const s=d.status||"pending";
  const b=document.getElementById("rdStatus");
  if(b){b.textContent=s==="approved"?"Approved \u2713":s==="rejected"?"Rejected":"Pending Approval";b.className="reg-badge "+s;}
  [["rdName",d.name],["rdRoll",d.roll],["rdEmail",d.email||user.email],["rdPhone",d.phone],["rdAmount","\u20b9"+(d.amount??REG_FEE)],["rdUtr",d.utr]].forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=v||"\u2014";});
  const cRow=document.getElementById("rdCommentRow"),cEl=document.getElementById("rdComment");
  if(d.adminComment){if(cEl)cEl.textContent=d.adminComment;if(cRow)cRow.style.display="";}else{if(cRow)cRow.style.display="none";}
  const img=document.getElementById("rdPhotoImg"),init=document.getElementById("rdPhotoInitial");
  if(d.photoData){if(img){img.src=d.photoData;img.style.display="";}if(init)init.style.display="none";}
  else{if(init){init.textContent=(d.name||"?")[0]?.toUpperCase()||"?";init.style.display="";}}
  openM(o);
}
(function(){
  const o=document.getElementById("regDetailsOverlay");
  if(o) o.addEventListener("click",e=>{if(e.target===o)closeM(o);});
})();

/* ── Reg Admin ── */
let allRegs=[],unsubRegs=null,raTab="pending",raOpt={};
function refreshRegAdminUI(){
  const btn=document.getElementById("regAdminBtn"),sb=document.getElementById("syncRegBtn");
  if(!btn) return;
  if(isRegAdmin()){btn.style.display="";if(sb)sb.style.display="inline-flex";subscribeRegAdmin();}
  else{btn.style.display="none";if(sb)sb.style.display="none";}
}
function subscribeRegAdmin(){
  if(!LIVE||!fb||unsubRegs) return;
  unsubRegs=fb.onSnapshot(fb.collection(fb.db,"registrations26"),snap=>{
    const rows=[]; snap.forEach(d=>rows.push(d.data())); allRegs=rows;
    const tot=rows.length,pend=rows.filter(r=>(r.status||"pending")==="pending").length,app=rows.filter(r=>r.status==="approved").length;
    const _t=document.getElementById("raTotalCount"),_p=document.getElementById("raPendingCount"),_a=document.getElementById("raApprovedCount"),_amt=document.getElementById("raTotalAmount");
    if(_t)_t.textContent=tot;if(_p)_p.textContent=pend;if(_a)_a.textContent=app;
    if(_amt)_amt.textContent=money(app*REG_FEE);
    renderRegAdmin();
  },err=>console.error("regs snapshot",err));
}
function renderRegAdmin(){
  const box=document.getElementById("regAdminList"); if(!box) return;
  const term=((document.getElementById("regAdminSearch")&&document.getElementById("regAdminSearch").value)||"").trim().toLowerCase();
  const eff=r=>raOpt[r.email]||r.status||"pending";
  const pendCount=allRegs.filter(r=>eff(r)==="pending").length,appCount=allRegs.length-pendCount;
  const pt=document.getElementById("raTabPending"),at2=document.getElementById("raTabApproved");
  if(pt)pt.textContent="Pending"+(pendCount?" ("+pendCount+")":"");
  if(pt)pt.textContent="Pending"+(pendCount?" ("+pendCount+")":"");
  if(at2)at2.textContent="Previous"+(appCount?" ("+appCount+")":"");
  let rows=allRegs.filter(r=>raTab==="approved"?eff(r)!=="pending":eff(r)==="pending");
  if(term)rows=rows.filter(r=>((r.name||"")+" "+(r.email||"")).toLowerCase().includes(term));
  rows.sort((a,b)=>((b.at&&b.at.seconds)||0)-((a.at&&a.at.seconds)||0));
  if(!rows.length){box.innerHTML="<p class=\"hint\">"+(raTab==="approved"?"No approved registrations yet.":"No pending registrations \u2014 all caught up \u2726")+"</p>";return;}
  box.innerHTML="";
  rows.forEach(r=>{
    const st=eff(r),el=document.createElement("div"); el.className="admin-row";
    // ⚠ Don't put base64 photoData in innerHTML — it breaks HTML parsing and disables buttons
    el.innerHTML=`
      <div class="top" style="display:flex;align-items:center;gap:10px">
        <div class="ra-photo-sm ra-photo-target"></div>
        <div>
          <span class="nm">${_esc(r.name||r.email)}</span>
          &nbsp;<span class="reg-badge ${st}">${st.charAt(0).toUpperCase()+st.slice(1)}</span>
        </div>
      </div>
      <div class="meta">${_esc(r.email)} &middot; ${_esc(r.roll||"")} &middot; &#8377;${r.amount??REG_FEE} &middot; UTR: ${_esc(r.utr||"—")}</div>
      <div class="meta" style="margin-top:2px">Phone: ${_esc(r.phone||"—")}</div>
      ${r.adminComment?`<div class="meta" style="color:var(--gold-soft);margin-top:4px;font-style:italic">Note: ${_esc(r.adminComment)}</div>`:""}
      <input class="msg-in ra-comment-in" type="text" maxlength="120"
             placeholder="Optional note to student (e.g. bring college ID)"
             value="${_esc(r.adminComment||"")}"
             style="margin:10px 0 4px;width:100%;background:#0c0c0e;border:1px solid var(--line);color:var(--ink);padding:9px 12px;border-radius:6px;font-family:Jost,sans-serif;font-size:.85rem;">
      <div class="acts">
        <button class="btn solid ap" type="button">Approve</button>
        <button class="btn ghost danger rj" type="button">Reject</button>
      </div>`;
    // Set photo AFTER innerHTML (static class avoids invalid-selector crash)
    const photoEl=el.querySelector(".ra-photo-target");
    if(photoEl){
      const psrc=r.photoData||r.photoUrl;
      if(psrc){ photoEl.style.backgroundImage="url('"+psrc+"')"; }
      else { photoEl.innerHTML="<span>"+(((r.name||"?")[0])||"?").toUpperCase()+"</span>"; }
    }
    el.querySelector(".ap").onclick=()=>{const c=el.querySelector(".ra-comment-in")?.value.trim()||"";raOpt[r.email]="approved";renderRegAdmin();approveReg(r,c);};
    el.querySelector(".rj").onclick=()=>{const c=el.querySelector(".ra-comment-in")?.value.trim()||"";raOpt[r.email]="rejected";renderRegAdmin();rejectReg(r.email,c);};
    box.appendChild(el);
  });
function _safeId(s){ return (s||"").replace(/[^a-z0-9]/gi,"_"); }
function _esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
}
document.querySelectorAll("[data-ratab]").forEach(b=>{b.onclick=()=>{raTab=b.dataset.ratab;document.querySelectorAll(".ratab").forEach(x=>x.classList.toggle("on",x.dataset.ratab===raTab));renderRegAdmin();};});
(function(){
  const s=document.getElementById("regAdminSearch"); if(s)s.oninput=renderRegAdmin;
  const ao=document.getElementById("regAdminOverlay"); if(ao)ao.addEventListener("click",e=>{if(e.target===ao)closeM(ao);});
  const rabtn=document.getElementById("regAdminBtn");
  if(rabtn)rabtn.onclick=()=>{const s2=document.getElementById("regAdminSearch");if(s2)s2.value="";raTab="pending";document.querySelectorAll(".ratab").forEach(b=>b.classList.toggle("on",b.dataset.ratab==="pending"));renderRegAdmin();openM(ao);};
  const srsb=document.getElementById("syncRegSheetBtn"); if(srsb)srsb.onclick=syncAllRegsToSheet;
  const srb=document.getElementById("syncRegBtn"); if(srb)srb.onclick=syncAllRegsToSheet;
})();
async function approveReg(r,comment){
  try{
    const upd={status:"approved",approvedAt:fb.serverTimestamp()};
    if(comment) upd.adminComment=comment; else upd.adminComment="";
    await fb.setDoc(fb.doc(fb.db,"registrations26",r.email),upd,{merge:true});
    showToast("Approved \u2726"); delete raOpt[r.email];   // sheet updates only via the Sync button
  }catch(e){delete raOpt[r.email];renderRegAdmin();showToast("Failed: "+(e.code||e.message));}
}
async function rejectReg(email,comment){
  try{
    const upd={status:"rejected",rejectedAt:fb.serverTimestamp()};
    if(comment) upd.adminComment=comment; else upd.adminComment="";
    await fb.setDoc(fb.doc(fb.db,"registrations26",email),upd,{merge:true});
    showToast("Rejected"); delete raOpt[email];
  }catch(e){delete raOpt[email];renderRegAdmin();showToast("Failed: "+(e.code||e.message));}
}
async function syncRegSheet(email){
  if(!SHEET_URL||!fb||!email) return;
  try{
    const snap=await fb.getDoc(fb.doc(fb.db,"registrations26",email)); if(!snap.exists()) return;
    const d=snap.data()||{};
    const idToken = await sheetToken();
    fetch(SHEET_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({secret:SHEET_SECRET,idToken,type:"registration",name:d.name||"",entryNo:d.roll||"",email:d.email||"",phone:d.phone||"",amount:(d.amount??REG_FEE),utr:d.utr||"",photoData:d.photoData||"",status:d.status||"pending"})
    }).catch(e=>console.error("reg sheet sync",e));
  }catch(e){console.error("syncRegSheet",e);}
}
function syncAllRegsToSheet(){
  if(!SHEET_URL){ showToast("Sheet URL not set"); return; }
  // Push ALL registrations so approvals AND rejections both reconcile.
  // The Apps Script writes approved ones and removes any that are no longer approved.
  const emails=Array.from(new Set(allRegs.map(r=>r.email).filter(Boolean)));
  if(!emails.length){ showToast("No registrations to sync yet"); return; }
  emails.forEach((em,i)=>setTimeout(()=>syncRegSheet(em),i*250));
  const appCount=allRegs.filter(r=>r.status==="approved").length;
  showToast("Syncing "+emails.length+" registration(s) \u2014 "+appCount+" approved \u2726");
}


/* ══════════════════════════════════════════════════════════════════
   JUNIORS' CONTRIBUTIONS — approved fresher registrations,
   visible to senior (25bec) students.
══════════════════════════════════════════════════════════════════ */
let juniorRegs=[], unsubJuniors=null;
function subscribeJuniors(){
  if(!LIVE||!fb||unsubJuniors) return;
  try{
    const q=fb.query(fb.collection(fb.db,"registrations26"),fb.where("status","==","approved"));
    unsubJuniors=fb.onSnapshot(q,snap=>{
      const rows=[]; snap.forEach(d=>rows.push(d.data())); juniorRegs=rows;
      paintJuniorStat();
      repaint();   // refresh combined Total Raised
      if(document.getElementById("juniorOverlay")&&document.getElementById("juniorOverlay").classList.contains("show")) renderJuniors();
    },err=>console.error("juniors snapshot",err));
  }catch(e){ console.error("subscribeJuniors",e); }
}
function paintJuniorStat(){
  const t=document.getElementById("juniorTotal");
  if(t) t.textContent=money(juniorRegs.length*REG_FEE);
}
function renderJuniors(){
  const box=document.getElementById("juniorList"); if(!box) return;
  const c=document.getElementById("jrCount"),tot=document.getElementById("jrTotal");
  if(c)c.textContent=juniorRegs.length;
  if(tot)tot.textContent=money(juniorRegs.length*REG_FEE);
  if(!juniorRegs.length){ box.innerHTML='<p class="hint">No approved registrations yet.</p>'; return; }
  const sorted=[...juniorRegs].sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  box.innerHTML="";
  sorted.forEach(r=>{
    const el=document.createElement("div"); el.className="jr-row";

    // Photo (build as element — avoids invalid CSS selectors from digit-leading emails)
    const photo=document.createElement("div"); photo.className="jr-photo";
    const src=r.photoData||r.photoUrl;
    if(src){ photo.style.backgroundImage="url('"+src+"')"; }
    else { photo.innerHTML="<span>"+(((r.name||"?")[0])||"?").toUpperCase()+"</span>"; }

    const info=document.createElement("div"); info.className="jr-info";
    const nm=document.createElement("div"); nm.className="jr-name"; nm.textContent=r.name||r.email||"";
    const em=document.createElement("div"); em.className="jr-email"; em.textContent=r.email||"";
    info.appendChild(nm); info.appendChild(em);

    const amt=document.createElement("div"); amt.className="jr-amt gold-text";
    amt.textContent=money(r.amount??REG_FEE);

    el.appendChild(photo); el.appendChild(info); el.appendChild(amt);
    box.appendChild(el);
  });
}
/* Wire junior stat button — same top-level pattern as the working stats */
const _juniorStatBtn = document.getElementById("juniorStat");
if(_juniorStatBtn){
  _juniorStatBtn.onclick = function(){
    try { renderJuniors(); } catch(e){ console.error("renderJuniors error", e); }
    const ov = document.getElementById("juniorOverlay");
    if(ov) openM(ov);
  };
}
const _juniorOv = document.getElementById("juniorOverlay");
if(_juniorOv){
  _juniorOv.addEventListener("click", function(e){ if(e.target===_juniorOv) closeM(_juniorOv); });
}

/* ══════════════════════════════════════════════════════════════════
   GATE Google button — triggers Firebase sign-in from the gate page
══════════════════════════════════════════════════════════════════ */
document.getElementById("gateGoogleBtn").onclick = async ()=>{
  if(LIVE){
    if(!fb){ gateMsg("Still connecting \u2014 try again in a second.","err"); return; }
    const btn=document.getElementById("gateGoogleBtn"); btn.disabled=true; gateMsg("Opening Google sign-in\u2026","ok");
    try{
      const provider=new fb.GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      await fb.signInWithPopup(fb.auth,provider); gateMsg("");
    }catch(e){
      const code=e&&e.code?e.code:"";
      if(code==="auth/popup-blocked"){
        try{ const p=new fb.GoogleAuthProvider(); p.setCustomParameters({prompt:"select_account"}); await fb.signInWithRedirect(fb.auth,p); }
        catch(e2){ gateMsg("Couldn't open sign-in.","err"); }
      } else if(code==="auth/popup-closed-by-user"||code==="auth/cancelled-popup-request"){ gateMsg(""); }
      else { gateMsg("Sign-in failed: "+(code||e.message||e),"err"); }
      document.getElementById("gateGoogleBtn").disabled=false;
    }
  } else {
    // Preview: sign in as senior by default
    user={ email:"25bec001@smvdu.ac.in", name:"Demo Student" };
    applyRole(user.email); refreshUserUI(); subscribeMyPending(); repaint();
    showToast("Welcome, Demo Student! (preview — senior view)");
  }
};

/* ---------- login ---------- */
$("#loginBtn").onclick = async ()=>{
  if(user){
    if(LIVE && fb){ try{ await fb.signOut(fb.auth); }catch(e){} /* onAuthStateChanged → showGate */ }
    else { user=null; showGate(); refreshUserUI(); subscribeMyPending(); repaint(); showToast("Logged out"); }
  } else { showGate(); }
};

/* ---------- pay ---------- */
function wantPay(amt, fixed){
  if(!user){ showGate(); showToast("Please login first"); return; }
  if(fixed){
    $("#amtSection").style.display = "none";   // fixed amount -> no amount entry
    $("#inAmt").value = amt;
    $("#payTo").style.display = "";            // show QR/button straight away
  } else {
    $("#amtSection").style.display = "";       // custom -> show amount entry
    $("#inAmt").value = "";
    isMini = false;
    document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
    $("#payTo").style.display = "none";        // hide QR/button until valid amount entered
  }
  $("#inUtr").value = "";
  updatePayBtn(); openM(payOverlay);
}
// Full amount -> pay the remaining toward the goal, no amount entry
$("#contribBtn").onclick = ()=>{
  if(!user){ showGate(); showToast("Please login first"); return; }
  if(remainingAmt > 0) wantPay(remainingAmt, true);
  else wantPay(0, false);                      // goal met -> custom extra
};
// Custom amount -> show the amount box first
$("#extraBtn").onclick   = ()=> wantPay(0, false);
$("#inAmt").addEventListener("input", ()=>{ isMini=false; document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on")); updatePayBtn(); });
document.querySelectorAll(".chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("on"));
  c.classList.add("on");
  isMini = MINI_AMTS.indexOf(Number(c.dataset.amt)) > -1;   // sub-500 top-ups, chip-only
  $("#inAmt").value=c.dataset.amt; updatePayBtn();
});
function upiLink(amt){
  return "upi://pay?pa=" + encodeURIComponent(UPI_ID)
       + "&pn=" + encodeURIComponent(UPI_NAME)
       + (amt>0 ? "&am=" + amt : "")
       + "&cu=INR&tn=" + encodeURIComponent("Freshers26");
}
const MINI_AMTS = [199, 301];   // the only amounts allowed below ₹500, and only via their chip
/* Once someone's APPROVED total has cleared the goal the ₹500 floor no longer
   applies — they've done their bit, so any top-up they want to make is fine. */
function goalCleared(){ return !!user && (data[user.email]||0) >= GOAL; }
let isMini = false;   // true when a top-up chip is the active selection
function updatePayBtn(){
  const amt = Number($("#inAmt").value)||0;
  $("#payAmtLbl").textContent = money(amt);
  const a = $("#openUpi"); if(a) a.setAttribute("href", upiLink(amt));
  const img = $("#upiQr"); if(img) img.src = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=" + encodeURIComponent(upiLink(amt));
  // custom mode: only reveal the QR once a VALID amount is entered
  // valid = ₹500+  OR  a top-up amount via its chip
  if($("#amtSection").style.display !== "none"){
    const valid = (amt>=500) || goalCleared() || (isMini && MINI_AMTS.indexOf(amt) > -1);
    $("#payTo").style.display = valid ? "" : "none";
    // live warning when amount is entered but below ₹500 (and not a top-up chip case)
    const warn = $("#amtWarn");
    if(warn){
      const showWarn = amt>0 && amt<500 && !goalCleared() && !(isMini && MINI_AMTS.indexOf(amt) > -1);
      warn.style.display = showWarn ? "block" : "none";
    }
  }
}
function downloadQR(){
  const amt = Number($("#inAmt").value)||0;
  const url = "https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=16&data=" + encodeURIComponent(upiLink(amt));
  fetch(url).then(r=>r.blob()).then(blob=>{
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u; a.download = "freshers-upi-" + (amt||"qr") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(u), 1500);
    showToast("QR downloaded \u2014 open it in your UPI app to pay");
  }).catch(()=>{ window.open(url, "_blank"); });
}
function initPayTo(){
  // "Pay with UPI" deep link only works on phones — hide it on laptops (QR + download still shown)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if(!isMobile){ const o=$("#openUpi"); if(o) o.style.display="none"; }
  updatePayBtn();
}
const _dq = $("#downloadQr"); if(_dq) _dq.onclick = downloadQR;
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
  if(!user){ closeM(payOverlay); showGate(); showToast("Please login first"); return; }
  if(amt<1){ showToast("Enter an amount"); $("#inAmt").focus(); return; }
  const customMode = $("#amtSection").style.display !== "none";
  if(customMode && amt < 500 && !goalCleared()){
    if(!(isMini && MINI_AMTS.indexOf(amt) > -1)){ showToast("Minimum contribution is \u20b9500"); $("#inAmt").focus(); return; }
  }
  utr = (utr||"").trim();
  // Letters, digits, spaces and - _ / so "cash", "Cash - paid to Sujit" etc. all work.
  if(!/^[a-zA-Z0-9][a-zA-Z0-9 _\-\/]{2,49}$/.test(utr)){
    showToast("Enter a UPI Ref No. / UTR, or \"cash\""); $("#inUtr").focus(); return;
  }
  if(!LIVE){
    closeM(payOverlay); $("#inUtr").value="";
    showToast("Submitted for verification (preview)");
    return;
  }
  /* Keyed by the UTR so the same reference can't be submitted twice. Free text
     is NOT unique — two people writing "cash" would collide on one doc id, and
     the second write would be refused as an update to someone else's row — so
     anything that isn't a genuine-looking reference gets a per-person suffix.
     Slashes are stripped either way: they aren't legal in a document id. */
  const looksLikeRef = /^[a-zA-Z0-9]{6,}$/.test(utr) && /[0-9]/.test(utr);
  const docId = looksLikeRef ? utr
    : (utr.replace(/[^a-zA-Z0-9 _-]/g,"").replace(/\s+/g,"-").slice(0,40)
       + "-" + user.email.split("@")[0] + "-" + Date.now());
  fb.setDoc(fb.doc(fb.db,"pending",docId), {
    email: user.email, name: user.name,
    amount: amt, utr: utr,
    status: "pending", at: fb.serverTimestamp()
  })
    .then(()=>{ closeM(payOverlay); $("#inUtr").value=""; showToast("Submitted \u2726 — it'll show on the bar once verified"); })
    .catch(e=>{
      /* permission-denied has two very different causes: the account isn't
         allowed to create a pending doc, or this exact UTR already exists
         (a create then reads as an update, which only the admin may do). */
      const msg = (e.code === "permission-denied")
        ? "That reference has already been submitted, or this account isn't allowed to submit."
        : ("Couldn't submit: " + (e.code||e.message));
      showToast(msg); console.error(e);
    });
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
let optStatus = {};   // doc id -> optimistic status, applied instantly on tap until the server confirms
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
    /* Keep the document id alongside the data. It used to equal the UTR, but a
       free-text ref like "cash" gets a suffixed id, so approve/reject must
       address the doc by its real id, never by r.utr. */
    const rows = []; snap.forEach(d=> rows.push(Object.assign({ id: d.id }, d.data())));
    allSubs = rows;
    // drop optimistic overrides the server has now confirmed
    for(const id in optStatus){
      const real = rows.find(r=> r.id === id);
      if(real && (real.status||"pending") === optStatus[id]) delete optStatus[id];
    }
    renderAdmin();
  }, err=>console.error("pending snapshot", err));
}
function renderAdmin(){
  const box = $("#adminList");
  const term = (($("#adminSearch") && $("#adminSearch").value) || "").trim().toLowerCase();
  const eff = r => optStatus[r.id] || r.status || "pending";
  const isPending = r => eff(r) === "pending";

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
    const st = optStatus[r.id] || r.status || "pending";
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
    el.querySelector(".ap").onclick = ()=>{ const note=msgIn.value; optStatus[r.id]="approved"; renderAdmin(); approvePending(r.id, note); };
    el.querySelector(".rj").onclick = ()=>{ const note=msgIn.value; optStatus[r.id]="rejected"; renderAdmin(); rejectPending(r.id, note); };
    box.appendChild(el);
  });
}
function approvePending(id, note){
  let email = null;
  fb.runTransaction(fb.db, async (t)=>{
    const pRef = fb.doc(fb.db,"pending",id);
    const pSnap = await t.get(pRef);
    if(!pSnap.exists()) return;
    const p = pSnap.data();
    email = p.email;
    if(p.status === "approved"){ t.update(pRef, { note:(note||"").trim() }); return; } // already credited
    const cRef = fb.doc(fb.db,"contributions", p.email);
    const cSnap = await t.get(cRef);
    const prev = cSnap.exists() ? (Number(cSnap.data().amount)||0) : 0;
    t.set(cRef, {
      email: p.email, name: p.name,
      amount: prev + (Number(p.amount)||0),
      lastPaymentId: "utr:" + (p.utr || id),
      updatedAt: fb.serverTimestamp()
    }, { merge:true });
    t.update(pRef, { status:"approved", note:(note||"").trim(), approvedAt: fb.serverTimestamp() });
  })
    .then(()=>{ showToast("Approved \u2726"); })   // sheet updates only via the Sync button
    .catch(e=>{ delete optStatus[id]; renderAdmin(); showToast("Approve failed: " + (e.code||e.message)); console.error(e); });
}
function rejectPending(id, note){
  let email = null;
  fb.runTransaction(fb.db, async (t)=>{
    const pRef = fb.doc(fb.db,"pending",id);
    const pSnap = await t.get(pRef);
    if(!pSnap.exists()) return;
    const p = pSnap.data();
    email = p.email;
    if(p.status === "rejected"){ t.update(pRef, { note:(note||"").trim() }); return; }
    if(p.status === "approved"){            // reverse a previous approval
      const cRef = fb.doc(fb.db,"contributions", p.email);
      const cSnap = await t.get(cRef);
      const prev = cSnap.exists() ? (Number(cSnap.data().amount)||0) : 0;
      t.set(cRef, { amount: Math.max(prev - (Number(p.amount)||0), 0), updatedAt: fb.serverTimestamp() }, { merge:true });
    }
    t.update(pRef, { status:"rejected", note:(note||"").trim(), rejectedAt: fb.serverTimestamp() });
  })
    .then(()=>{ showToast("Rejected"); })   // sheet updates only via the Sync button
    .catch(e=>{ delete optStatus[id]; renderAdmin(); showToast("Reject failed: " + (e.code||e.message)); console.error(e); });
}

/* ══════════════════════════════════════════════════════════════════
   VENUE GALLERY — 2 photos + 2 interactive 360° views.
   Manual only: no autoplay, no timers. Advances on arrows, dots,
   arrow keys and swipe.

   The 360° slides embed Google's own photosphere viewer, so they
   stay drag-to-look interactive. Both pano IDs were taken from the
   share links for The Sanjeevani Resort. `preview` is Google's own
   still of the same sphere, shown until the user opts in — that
   keeps two WebGL contexts from spinning up on every page view.
══════════════════════════════════════════════════════════════════ */
const PANO_BASE_1 = "https://lh3.googleusercontent.com/gpms-cs-s/AFP8RcP8u_yEh7bcq8P3HdUrQ7DOii4vU4emZfQzPaTqjoi_wPEjRBW5z8c38Fx2AlFubiAN1Q241DsFrbFN2QAfL7ZKowSMpxSXzGP0w3zzH4QnNGyNVgTZElKdA2fLk5BflWdtFSA";
const PANO_BASE_2 = "https://lh3.googleusercontent.com/gpms-cs-s/AFP8RcOmnM0FukBLoHOCoNOZxR0XWZF1Z3D7LRUIOZFJ_-aTNJG_YPOoaigk64uH7A93n4pNqmdS0M_-Js9QC9rdRbKFxnQVy9VClEmrG7WKjtCjCpKWwzG9iDYAB8OYJftr2V6-TxUb7g";

const VENUE_SLIDES = [
  { kind:"photo", src:"Files/venue1.JPG", caption:"The Sanjeevani Resort" },
  { kind:"photo", src:"Files/venue2.JPG", caption:"The Sanjeevani Resort" },
  /* `sphere` is the full equirectangular frame (2:1); `preview` is the same
     sphere flattened, shown as the still until the viewer is opened. Both come
     from Google's photo CDN — only the size suffix differs. */
  { kind:"pano", sphere:PANO_BASE_1+"=w4096-h2048",
                 preview:PANO_BASE_1+"=w1200-h675-k-no", caption:"360° view" },
  { kind:"pano", sphere:PANO_BASE_2+"=w4096-h2048",
                 preview:PANO_BASE_2+"=w1200-h675-k-no", caption:"360° view" }
];

let vgIndex = 0, vgOpened = {};   // vgOpened: which pano slides the user has activated
let vgViewer = null;              // the live three.js viewer, if one is open

/* Load three.js once, on demand. Nothing is fetched unless someone actually
   opens a 360° view, so page weight is unchanged for everyone else. */
let threeReady = null;
function loadThree(){
  if(threeReady) return threeReady;
  threeReady = new Promise((res, rej)=>{
    if(window.THREE) return res(window.THREE);
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    sc.onload  = ()=> res(window.THREE);
    sc.onerror = ()=> rej(new Error("three.js failed to load"));
    document.head.appendChild(sc);
  });
  return threeReady;
}

/* Equirectangular viewer: the panorama is painted on the INSIDE of a sphere
   with the camera at its centre. That projection is what makes it read as a
   real 360° view rather than a stretched flat photo. Drag to look, scroll to zoom. */
async function openPano(host, url){
  host.innerHTML = '<div class="vg-loading">Loading 360° view\u2026</div>';
  let THREE;
  try{ THREE = await loadThree(); }
  catch(e){ host.innerHTML = '<div class="vg-loading">Could not load the 360° viewer.</div>'; return; }

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, host.clientWidth/host.clientHeight, 1, 1100);
  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight);

  const geo = new THREE.SphereGeometry(500, 60, 40);
  geo.scale(-1, 1, 1);   // flip inside-out so the texture faces the camera

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  loader.load(url, function(tex){
    host.innerHTML = "";
    host.appendChild(renderer.domElement);
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex })));

    let lon = 0, lat = 0, down = false, px = 0, py = 0, plon = 0, plat = 0, fov = 70;
    const el = renderer.domElement;
    el.style.cursor = "grab";

    const start = (x,y)=>{ down = true; px = x; py = y; plon = lon; plat = lat; el.style.cursor = "grabbing"; };
    const move  = (x,y)=>{ if(!down) return; lon = (px-x)*0.12 + plon; lat = (y-py)*0.12 + plat; };
    const end   = ()=>{ down = false; el.style.cursor = "grab"; };

    el.addEventListener("mousedown", e=>{ e.preventDefault(); start(e.clientX, e.clientY); });
    el.addEventListener("mousemove", e=> move(e.clientX, e.clientY));
    window.addEventListener("mouseup", end);
    // Touch drag must not scroll the page while someone is looking around.
    el.addEventListener("touchstart", e=>{ start(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
    el.addEventListener("touchmove",  e=>{ e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
    el.addEventListener("touchend", end, {passive:true});
    el.addEventListener("wheel", e=>{ e.preventDefault();
      fov = Math.max(25, Math.min(90, fov + e.deltaY*0.05));
      camera.fov = fov; camera.updateProjectionMatrix(); }, {passive:false});

    let alive = true;
    (function render(){
      if(!alive) return;
      requestAnimationFrame(render);
      lat = Math.max(-85, Math.min(85, lat));
      const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon);
      camera.lookAt(new THREE.Vector3(500*Math.sin(phi)*Math.cos(th), 500*Math.cos(phi), 500*Math.sin(phi)*Math.sin(th)));
      renderer.render(scene, camera);
    })();

    const onResize = ()=>{
      if(!host.clientWidth) return;
      camera.aspect = host.clientWidth/host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Free the GPU memory when the slide changes, or each visit leaks a context.
    vgViewer = { dispose(){ alive = false;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mouseup", end);
      tex.dispose(); geo.dispose(); renderer.dispose(); } };
  },
  undefined,
  function(){ host.innerHTML = '<div class="vg-loading">Could not load this 360° view.</div>'; });
}


/* The frame takes its shape from the first venue photo, so the slideshow is
   exactly as tall as venue1.JPG rather than a fixed 16:9 crop. Measured once
   from the real file; the 360° slides then match it. */
let vgRatio = null;
function applyVgRatio(img){
  if(vgRatio || !img.naturalWidth) return;
  vgRatio = img.naturalWidth + " / " + img.naturalHeight;
  const st = $("#vgStage"); if(st) st.style.aspectRatio = vgRatio;
}

function renderVenueGallery(){  const stage = $("#vgStage"), dots = $("#vgDots");
  if(!stage) return;
  const sl = VENUE_SLIDES[vgIndex];

  // Tear down any viewer from the slide we are leaving.
  if(vgViewer){ vgViewer.dispose(); vgViewer = null; }
  if(vgRatio) stage.style.aspectRatio = vgRatio;

  if(sl.kind === "photo"){
    /* Name the missing file rather than showing a broken-image icon — the
       usual cause is simply that it hasn't been uploaded to Files/ yet. */
    stage.innerHTML = '<img class="vg-img" src="'+sl.src+'" alt="'+_bEsc(sl.caption)+'" loading="lazy"'
                    + ' onerror="this.parentNode.innerHTML=\'<div class=&quot;vg-missing&quot;><b>Photo not found</b>'
                    + 'Upload it to <code>'+sl.src+'</code></div>\'">'
                    + '<span class="vg-cap">'+_bEsc(sl.caption)+'</span>';
  } else if(vgOpened[vgIndex]){
    openPano(stage, sl.sphere);
  } else {
    stage.innerHTML = '<img class="vg-img" src="'+_bEsc(sl.preview)+'" alt="360 degree view of the venue" loading="lazy">'
                    + '<span class="vg-badge">360°</span>'
                    + '<button class="vg-360" data-open360="1">↻ Look around</button>';
  }

  if(dots){
    dots.innerHTML = VENUE_SLIDES.map((s,i)=>
      '<button class="vg-dot'+(i===vgIndex?' on':'')+'" data-vg="'+i+'" aria-label="Slide '+(i+1)+'"></button>').join("");
    dots.querySelectorAll(".vg-dot").forEach(b=>
      b.onclick = ()=>{ vgIndex = Number(b.dataset.vg); renderVenueGallery(); });
  }
  const firstImg = stage.querySelector(".vg-img");
  if(firstImg && sl.kind === "photo"){
    if(firstImg.complete) applyVgRatio(firstImg);
    else firstImg.addEventListener("load", ()=> applyVgRatio(firstImg), {once:true});
  }
  const ob = stage.querySelector("[data-open360]");
  /* stopPropagation so the card-wide Maps handler can never intercept this. */
  if(ob) ob.onclick = (e)=>{ e.preventDefault(); e.stopPropagation();
                             vgOpened[vgIndex] = true; renderVenueGallery(); };
}

function vgGo(step){
  vgIndex = (vgIndex + step + VENUE_SLIDES.length) % VENUE_SLIDES.length;
  renderVenueGallery();
}

(function initVenueGallery(){
  const stage = $("#vgStage"); if(!stage) return;
  renderVenueGallery();
  const p = $("#vgPrev"), n = $("#vgNext");
  if(p) p.onclick = ()=> vgGo(-1);
  if(n) n.onclick = ()=> vgGo(1);

  // Arrow keys, but only while the gallery is on screen
  document.addEventListener("keydown", e=>{
    if(e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const r = stage.getBoundingClientRect();
    if(r.top > window.innerHeight || r.bottom < 0) return;
    vgGo(e.key === "ArrowRight" ? 1 : -1);
  });

  // Swipe between slides. The 360 viewer stops these on its own canvas,
  // so dragging to look around never changes slide.
  let x0 = null;
  stage.addEventListener("touchstart", e=>{ x0 = e.touches[0].clientX; }, {passive:true});
  stage.addEventListener("touchend", e=>{
    if(x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    /* Swipe only moves between photos. On a 360° slide a horizontal drag means
       "look around", so changing slide there would fight the viewer — use the
       arrows instead. */
    const onPano = VENUE_SLIDES[vgIndex].kind === "pano";
    if(!onPano && Math.abs(dx) > 45) vgGo(dx < 0 ? 1 : -1);
    x0 = null;
  }, {passive:true});
})();

/* ---------- Google Sheets sync ---------- */
/* The Apps Script no longer trusts SHEET_SECRET on its own — the secret ships
   in this file, so anyone could read it and POST to the endpoint. Instead we
   attach the signed-in user's Firebase ID token; the Apps Script verifies it
   with Google and refuses anything that isn't an admin. */
async function sheetToken(){
  try{
    return (fb && fb.auth && fb.auth.currentUser)
      ? await fb.auth.currentUser.getIdToken() : "";
  }catch(e){ console.error("id token", e); return ""; }
}
async function syncSheet(email){
  if(!SHEET_URL || !fb || !email) return;
  const idToken = await sheetToken();
  fb.getDocs(fb.query(fb.collection(fb.db,"pending"), fb.where("email","==",email))).then(snap=>{
    const subs = []; let anyName = "";
    snap.forEach(d=>{ const v=d.data()||{}; if(v.name) anyName = v.name; if(v.status==="approved") subs.push(v); });
    subs.sort((a,b)=>{
      const ta = (a.approvedAt&&a.approvedAt.seconds) || (a.at&&a.at.seconds) || 0;
      const tb = (b.approvedAt&&b.approvedAt.seconds) || (b.at&&b.at.seconds) || 0;
      return ta - tb;
    });
    const name = (subs[0] && subs[0].name) || anyName || email;
    const total = subs.reduce((t,s)=> t + (Number(s.amount)||0), 0);
    const payments = subs.slice(0,5).map(s=>({ amount: Number(s.amount)||0, utr: s.utr||"" }));
    fetch(SHEET_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: SHEET_SECRET, idToken, name, email, payments, total })
    }).catch(e=>console.error("sheet sync", e));
  }).catch(e=>console.error("sheet read", e));
}
function syncAllToSheet(){
  if(!SHEET_URL){ showToast("Set SHEET_URL in script.js first"); return; }
  // Sync EVERYONE who has any submission so approvals AND rejections both reconcile.
  const emails = Array.from(new Set(allSubs.map(s=>s.email).filter(Boolean)));
  if(!emails.length){ showToast("Nothing to sync yet"); return; }
  emails.forEach((em,i)=> setTimeout(()=> syncSheet(em), i*250));
  showToast("Syncing " + emails.length + " contributor(s) to the sheet\u2026");
}
const _ss = $("#syncSheetBtn"); if(_ss) _ss.onclick = syncAllToSheet;
async function initFirebase(){
  try{
    const appMod  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
    const fsMod   = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const app = appMod.initializeApp(FIREBASE_CONFIG);

    /* App Check — attaches a reCAPTCHA v3 attestation to every Firebase
       request, so requests from outside this page are rejected once
       enforcement is switched on in the Firebase console.
       Wrapped in its own try/catch on purpose: if the reCAPTCHA script is
       blocked (ad-blocker, offline, college firewall) the site must still
       load. While App Check is UNENFORCED that costs nothing; once you
       enforce, those users would be refused by Firebase either way. */
    try{
      const acMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js");
      acMod.initializeAppCheck(app, {
        provider: new acMod.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true
      });
    }catch(e){ console.warn("App Check unavailable", e); }

    // Force long-polling so reads/writes work on restrictive college / Wi-Fi networks
    const db = fsMod.initializeFirestore(app, { experimentalForceLongPolling: true });
    fb = { auth: authMod.getAuth(app), db, ...authMod, ...fsMod };
    subscribeBudget();   // keep the budget live regardless of whether the modal is open

    // complete a redirect sign-in if we came back from one
    try{ await fb.getRedirectResult(fb.auth); }catch(e){ console.warn("redirect result", e); }

    fb.onAuthStateChanged(fb.auth, async u=>{
      if(u){
        const email=(u.email||"").toLowerCase();
        if(!emailAllowed(email)){
          await fb.signOut(fb.auth);
          /* Name the account that was refused — otherwise a wrong-account sign-in
             and a stale script.js look identical from the outside. */
          gateMsg("Not authorised: " + email + " \u2014 only approved SMVDU / IITM student emails are permitted.","err");
          user=null; showGate();
        } else {
          user = { email, name: u.displayName || email.split("@")[0] };
          applyRole(email);
        }
      } else { user=null; showGate(); }
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
  initFirebase();
} else {
  const pb=$("#previewBanner"); if(pb) pb.classList.add("show");
}
refreshUserUI();
repaint();

/* ---------- image protection (casual-save deterrent) ---------- */
/* Photos render in the browser, so they can never be made truly un-saveable
   (DevTools / screenshots / the public GitHub repo all still expose them).
   This just blocks the easy routes for ordinary visitors: right-click
   "Save image" and dragging a photo out of the page. The UPI QR is excluded
   on purpose so people can still download it to pay. */
(function(){
  const isProtected = el => el && el.tagName === "IMG" && el.id !== "upiQr";
  document.addEventListener("contextmenu", e=>{ if(isProtected(e.target)) e.preventDefault(); });
  document.addEventListener("dragstart",  e=>{ if(isProtected(e.target)) e.preventDefault(); });
})();