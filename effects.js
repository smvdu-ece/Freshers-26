/* ============================================================
   FÊTE DES FRESHERS — 3D atmosphere + motion  (effects.js)
   Purely visual. Loads after script.js and touches no app logic,
   so login / contributions / payments / budget are untouched.
   Honours prefers-reduced-motion and degrades gracefully if the
   Three.js CDN is unavailable.
   ============================================================ */
(function(){
  const REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 0. reveal failsafe ----------
     Runs in this separate script, so even if script.js throws before its own
     reveal observer attaches, sections below the hero can never stay black. */
  function initReveals(){
    try{
      if(!("IntersectionObserver" in window)){
        document.querySelectorAll(".reveal").forEach(function(e){ e.classList.add("in"); });
        return;
      }
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){
          if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll(".reveal:not(.in)").forEach(function(e){ io.observe(e); });
      // last-resort: if anything is still hidden a moment after load, show it
      window.addEventListener("load", function(){
        setTimeout(function(){
          document.querySelectorAll(".reveal:not(.in)").forEach(function(e){
            var r = e.getBoundingClientRect();
            if(r.top < window.innerHeight && r.bottom > 0) e.classList.add("in");
          });
        }, 1200);
      });
    }catch(err){
      document.querySelectorAll(".reveal").forEach(function(e){ e.classList.add("in"); });
    }
  }

  /* ---------- 1. ambient 3D background: golden dust + faceted diamonds ---------- */
  function initBackground(){
    if(REDUCE || typeof THREE === "undefined") return;
    const canvas = document.getElementById("bg3d");
    if(!canvas) return;

    let renderer;
    try{ renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true }); }
    catch(e){ return; }                              // no WebGL -> stay 2D
    renderer.setClearColor(0x000000, 0);

    const scene  = new THREE.Scene();
    scene.fog    = new THREE.FogExp2(0x0a0a0c, 0.055);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
    camera.position.z = 17;

    // drifting golden dust
    const COUNT = 620;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    for(let i = 0; i < COUNT; i++){
      pos[i*3]   = (Math.random() - 0.5) * 48;
      pos[i*3+1] = (Math.random() - 0.5) * 32;
      pos[i*3+2] = (Math.random() - 0.5) * 32;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xe7c96a, size: 0.075, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    scene.add(dust);

    // faceted gold diamonds — the brand's diamond motif, in 3D
    const diamonds = [];
    const dGeo = new THREE.OctahedronGeometry(1, 0);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, wireframe: true, transparent: true, opacity: 0.30 });
    for(let i = 0; i < 7; i++){
      const m = new THREE.Mesh(dGeo, baseMat.clone());
      const s = 0.7 + Math.random() * 1.9;
      m.scale.set(s, s * 1.5, s);
      m.position.set((Math.random()-0.5)*36, (Math.random()-0.5)*22, (Math.random()-0.5)*12 - 5);
      m.userData = {
        rx: (Math.random()-0.5)*0.0035,
        ry: 0.0018 + Math.random()*0.004,
        phase: Math.random()*Math.PI*2,
        amp: 0.4 + Math.random()*0.7
      };
      scene.add(m); diamonds.push(m);
    }

    // pointer + scroll parallax targets
    let tmx = 0, tmy = 0, mx = 0, my = 0, scrollY = window.scrollY || 0;
    window.addEventListener("pointermove", e => {
      tmx = e.clientX / window.innerWidth - 0.5;
      tmy = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
    window.addEventListener("scroll", () => { scrollY = window.scrollY || window.pageYOffset || 0; }, { passive: true });

    function resize(){
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    const clock = new THREE.Clock();
    let running = true;
    function loop(){
      if(!running) return;
      requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      mx += (tmx - mx) * 0.04;
      my += (tmy - my) * 0.04;
      dust.rotation.y = t * 0.02 + mx * 0.4;
      dust.rotation.x = my * 0.25;
      for(const m of diamonds){
        m.rotation.x += m.userData.rx;
        m.rotation.y += m.userData.ry;
        m.position.y += Math.sin(t * 0.5 + m.userData.phase) * 0.0022 * m.userData.amp;
      }
      camera.position.x += (mx * 3.2 - camera.position.x) * 0.05;
      camera.position.y += ((-my * 2.2 + scrollY * 0.002) - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    document.addEventListener("visibilitychange", () => {
      running = !document.hidden;
      if(running) loop();
    });
    loop();
  }

  /* ---------- 2. mouse-reactive 3D tilt on cards ---------- */
  function initTilt(){
    if(REDUCE) return;
    document.querySelectorAll("[data-tilt]").forEach(card => {
      const MAX = Number(card.dataset.tilt) || 8;
      const glare = document.createElement("span");
      glare.className = "tilt-glare";
      card.appendChild(glare);

      let tx = 0, ty = 0, cx = 0, cy = 0, lift = 0, active = false, raf = null;

      function run(){
        const tl = active ? -6 : 0;
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        lift += (tl - lift) * 0.12;
        card.style.transform =
          `perspective(950px) rotateX(${cx.toFixed(2)}deg) rotateY(${cy.toFixed(2)}deg) translateY(${lift.toFixed(2)}px)`;
        if(Math.abs(tx-cx) > 0.04 || Math.abs(ty-cy) > 0.04 || Math.abs(tl-lift) > 0.04){
          raf = requestAnimationFrame(run);
        } else {
          raf = null;
          if(!active) card.style.transform = "";       // hand back to CSS hover when settled
        }
      }
      function kick(){ if(!raf) raf = requestAnimationFrame(run); }

      card.addEventListener("pointerenter", () => { active = true; card.classList.add("tilting"); kick(); });
      card.addEventListener("pointermove", e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        tx = (0.5 - py) * MAX;
        ty = (px - 0.5) * MAX;
        glare.style.background =
          `radial-gradient(circle at ${(px*100).toFixed(1)}% ${(py*100).toFixed(1)}%, rgba(231,201,106,.26), transparent 55%)`;
        kick();
      });
      card.addEventListener("pointerleave", () => {
        active = false; card.classList.remove("tilting");
        tx = 0; ty = 0; glare.style.background = "transparent";
        kick();
      });
    });
  }

  function tagTiltTargets(){
    [[".contrib-shell", 6], [".dcard", 11], [".reg26", 5]].forEach(([sel, deg]) => {
      document.querySelectorAll(sel).forEach(el => {
        if(!el.hasAttribute("data-tilt")) el.setAttribute("data-tilt", String(deg));
      });
    });
  }

  /* ---------- 3. hero parallax (photo recedes, text floats) ---------- */
  function initHeroParallax(){
    if(REDUCE) return;
    const frame = document.querySelector(".hero .photo-frame");
    const inner = document.querySelector(".hero-inner");
    if(!frame) return;
    let raf = null;
    window.addEventListener("scroll", () => {
      if(raf) return;
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        frame.style.transform = `translateY(${(y*0.22).toFixed(1)}px) scale(${(1 + Math.min(y,600)*0.0004).toFixed(4)})`;
        if(inner) inner.style.transform = `translateY(${(y*-0.08).toFixed(1)}px)`;
        raf = null;
      });
    }, { passive: true });
  }

  function start(){
    initReveals();
    tagTiltTargets();
    initBackground();
    initTilt();
    initHeroParallax();
  }
  if(document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();