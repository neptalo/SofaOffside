/* =========================================================================
   CONFIGURACIÓN DE FIREBASE (RANKING MUNDIAL)
   ========================================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCXe8AmFFfQDC98A8Z4tXq6oKdbaPOkoJs",
  authDomain: "sofaoffside-ranking.firebaseapp.com",
  projectId: "sofaoffside-ranking",
  storageBucket: "sofaoffside-ranking.firebasestorage.app",
  appId: "1:937682695294:web:c87db5cbf320b32b7fd42f",
  messagingSenderId: "937682695294",
};

let db = null;
let RANK_COLLECTION = "ranking";
try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) { console.log("Firebase no configurado o error init (Modo Offline)"); }


/* =========================================================================
   BLOQUE 1: SISTEMA BASE
   ========================================================================= */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isMuted = false;
const btnMute = document.getElementById('btn-mute');
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

btnMute.addEventListener('click', () => { 
    isMuted = !isMuted; 
    btnMute.innerText = isMuted ? "🔇" : "🔊"; 
    btnMute.classList.toggle('muted', isMuted); 
});

function playSound(type) {
    if(isMuted) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    
    if (type === 'pop') {
        o.frequency.value = 800; g.gain.setValueAtTime(0.1, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        o.start(); o.stop(now + 0.1);
    } else if (type === 'whistle') {
        const o1 = audioCtx.createOscillator(), o2 = audioCtx.createOscillator();
        o1.connect(g); o2.connect(g); 
        o1.frequency.setValueAtTime(2000, now); o1.frequency.linearRampToValueAtTime(2200, now + 0.1);
        o2.frequency.setValueAtTime(2100, now);
        g.gain.setValueAtTime(0.2, now); g.gain.linearRampToValueAtTime(0, now + 0.4);
        o1.start(now); o1.stop(now + 0.4); o2.start(now); o2.stop(now + 0.4);
    } else if (type === 'tick') {
        o.type = 'square'; o.frequency.value = 600; g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        o.start(); o.stop(now + 0.05);
    } else if (type === 'beep_low') {
        o.type = 'sine'; o.frequency.value = 400; g.gain.setValueAtTime(0.1, now); g.gain.linearRampToValueAtTime(0, now + 0.1);
        o.start(); o.stop(now + 0.1);
    } else if (type === 'beep_high') {
        o.type = 'square'; o.frequency.value = 800; g.gain.setValueAtTime(0.1, now); g.gain.linearRampToValueAtTime(0, now + 0.3);
        o.start(); o.stop(now + 0.3);
    }
}

document.getElementById('nav-analysis').addEventListener('click', () => switchView('analysis'));
document.getElementById('nav-challenge').addEventListener('click', () => switchView('challenge'));

function switchView(viewName) {
    if(typeof stopAllTimers === 'function') stopAllTimers();
    document.getElementById('analysis-view').classList.toggle('hidden', viewName !== 'analysis');
    document.getElementById('challenge-view').classList.toggle('hidden', viewName !== 'challenge');
    document.getElementById('nav-analysis').classList.toggle('active', viewName === 'analysis');
    document.getElementById('nav-challenge').classList.toggle('active', viewName === 'challenge');
    
    const pcControls = document.getElementById('analysis-controls');
    if (pcControls) pcControls.style.display = (viewName === 'analysis' && !isTouchDevice) ? 'flex' : 'none';
    
    const mobileControls = document.getElementById('mobile-analysis-controls');
    if (mobileControls) mobileControls.classList.toggle('hidden', viewName !== 'analysis' || !isTouchDevice);

    const btnMark = document.getElementById('btn-mark-point');
    if (btnMark) btnMark.classList.toggle('hidden', viewName !== 'analysis' || !isTouchDevice);

    if(viewName !== 'analysis' && zoomLens) zoomLens.style.display = 'none';
    if(viewName === 'challenge') { showChallengeScreen('intro'); renderRanking(); }
}

/* =========================================================================
   BLOQUE 2: MÓDULO DE ANÁLISIS (CORE)
   ========================================================================= */
const ZOOM_LEVEL = 3; 
const COLORS = { guide: '#ffd700', def: '#ff3333', att: '#00ccff', ref: '#cc00ff', depth: '#00ff99', calc: '#ffffff' };

let analysisImg = new Image(); 
let step = 1; 
let pts = { p1: null, p2: null, p3: null, p4: null, vp: null, refTop: null, refBot: null, refDepthStart: null, refDepthEnd: null, def: null, defBody: null, defGround: null, att: null, attBody: null, attGround: null };
let markMode = 'foot'; 
let waitingForRefs = false; 
let refSubStep = 0; 
let currentActor = 'def'; 

// --- VARIABLES PARA EL ZOOM/PAN DEL RESULTADO ---
let cam = { x: 0, y: 0, zoom: 1 }; // Cámara para ver el resultado
let lastTouchDist = 0; // Para el gesto de pinza

const canvas = document.getElementById('canvas'); 
const ctx = canvas.getContext('2d');
const instructionBox = document.getElementById('instruction-box');
const toolsPanel = document.getElementById('analysis-tools-panel');
const modeSelector = document.getElementById('mode-selector');
const zoomLens = document.getElementById('zoom-lens');
const btnEvaluate = document.getElementById('btn-evaluate-big');
const btnDownload = document.getElementById('btn-download');
const btnToggleStats = document.getElementById('btn-toggle-stats');
const statsBox = document.getElementById('sofa-stats-box');
const btnMarkPoint = document.getElementById('btn-mark-point');
const btnFloatingReset = document.getElementById('btn-floating-reset');
const canvasTopControls = document.getElementById('canvas-top-controls');
const postAnalysisButtons = document.getElementById('post-analysis-buttons');
const resultActionsBlock = document.getElementById('result-actions-block');

let lastTouchPos = null;

document.getElementById('mode-foot').addEventListener('click', (e) => setMode('foot', e.target));
document.getElementById('mode-body').addEventListener('click', (e) => setMode('body', e.target));
const btnFloatReset = document.getElementById('btn-float-reset');
if(btnFloatReset) btnFloatReset.addEventListener('click', resetPoints);
const btnFloatNew = document.getElementById('btn-float-new');
if(btnFloatNew) btnFloatNew.addEventListener('click', () => location.reload());
const btnPostReset = document.getElementById('btn-post-reset');
if(btnPostReset) btnPostReset.addEventListener('click', resetPoints);
const btnPostNew = document.getElementById('btn-post-new');
if(btnPostNew) btnPostNew.addEventListener('click', () => location.reload());

if (btnMarkPoint) btnMarkPoint.addEventListener('click', () => { 
    if(isTouchDevice && step < 99 && lastTouchPos) {
        registerPoint(lastTouchPos);
        lastTouchPos = null;
        draw(); 
    }
});

if (btnFloatingReset) btnFloatingReset.addEventListener('click', resetPoints);

btnToggleStats.addEventListener('click', () => {
    if(statsBox.style.display === 'none' || statsBox.style.display === '') {
        statsBox.style.display = 'block';
        btnToggleStats.innerText = '📊 Ocultar Datos';
    } else {
        statsBox.style.display = 'none';
        btnToggleStats.innerText = '📊 Datos';
    }
});

function setMode(m, btn) {
    if(waitingForRefs) return; 
    markMode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if(markMode === 'body' && !pts.refTop) startRefSequence();
    else updateUI();
}

function startRefSequence() { waitingForRefs = true; refSubStep = 1; updateUI(); }

document.getElementById('file-input').addEventListener('change', (e) => {
    if(e.target.files && e.target.files[0]){
        const reader = new FileReader();
        reader.onload = (evt) => { analysisImg.onload = () => initSystem(); analysisImg.src = evt.target.result; };
        reader.readAsDataURL(e.target.files[0]);
    }
});

function initSystem() {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('video-picker-view').classList.add('hidden'); 
    document.getElementById('workspace').style.opacity = '1';
    
    const pcControls = document.getElementById('analysis-controls');
    if (pcControls) pcControls.style.display = isTouchDevice ? 'none' : 'flex';
    const mobileControls = document.getElementById('mobile-analysis-controls');
    if (mobileControls) mobileControls.classList.toggle('hidden', !isTouchDevice);
    const btnMark = document.getElementById('btn-mark-point');
    if (btnMark) btnMark.classList.toggle('hidden', !isTouchDevice);
    if (btnFloatingReset) btnFloatingReset.classList.remove('hidden');

    toolsPanel.style.display = 'flex';
    
    const aspect = analysisImg.width / analysisImg.height;
    let w = document.getElementById('workspace').clientWidth; 
    let h = w / aspect;
    if(h > document.getElementById('workspace').clientHeight) { h = document.getElementById('workspace').clientHeight; w = h * aspect; }
    canvas.width = w; canvas.height = h;
    
    resetPoints();
}

function resetPoints() {
    step = 1; waitingForRefs = false; refSubStep = 0; currentActor = 'def';
    pts = { p1:null, p2:null, p3:null, p4:null, vp:null, refTop:null, refBot:null, refDepthStart:null, refDepthEnd:null, def:null, defBody:null, defGround:null, att:null, attBody:null, attGround:null };
    markMode = 'foot';
    lastTouchPos = null; 
    cam = { x: 0, y: 0, zoom: 1 }; // Reset cámara

    toolsPanel.style.display = 'flex';
    instructionBox.style.display = 'block';
    
    if(canvasTopControls) canvasTopControls.classList.remove('hidden');
    if(postAnalysisButtons) postAnalysisButtons.style.display = 'none';
    if(resultActionsBlock) resultActionsBlock.style.display = 'none'; // Ocultar bloque acciones
    
    if(zoomLens) zoomLens.style.display = 'none';

    setMode('foot', document.getElementById('mode-foot'));
    
    document.getElementById('result-container').style.display = 'none';
    statsBox.style.display = 'none';
    btnToggleStats.innerText = '📊 Datos';
    
    btnEvaluate.style.display = 'none';
    modeSelector.style.display = 'none';
    document.getElementById('attack-dir-select').style.display = 'none';
    
    if (isTouchDevice && btnMarkPoint) btnMarkPoint.classList.remove('hidden');
    
    draw(); updateUI();
}

document.getElementById('btn-new-tools')?.addEventListener('click', () => location.reload()); 
document.getElementById('btn-new')?.addEventListener('click', () => location.reload()); 

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; 
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}


// --- LÓGICA DE INTERACCIÓN DEL CANVAS ---

if (!isTouchDevice) {
    // --- MODO PC ---
    canvas.addEventListener('mousemove', (e) => {
        if(step >= 99 || document.getElementById('analysis-view').classList.contains('hidden')) { zoomLens.style.display = 'none'; return; }
        const pos = getPos(e);
        zoomLens.style.display = 'block';
        zoomLens.style.left = (e.clientX - 70) + 'px'; zoomLens.style.top = (e.clientY - 70) + 'px';
        zoomLens.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        const zoomFactor = ZOOM_LEVEL;
        zoomLens.style.backgroundSize = `${canvas.width * zoomFactor}px ${canvas.height * zoomFactor}px`;
        const bgX = -(pos.x * zoomFactor) + 70; const bgY = -(pos.y * zoomFactor) + 70;
        zoomLens.style.backgroundPosition = `${bgX}px ${bgY}px`;
    });
    canvas.addEventListener('mouseleave', () => { if (zoomLens) zoomLens.style.display = 'none'; });
    canvas.addEventListener('click', (e) => {
        if(document.getElementById('analysis-view').classList.contains('hidden')) return;
        if(step >= 99) return; 
        registerPoint(getPos(e));
    });
    
} else {
    // --- MODO MÓVIL (LUPA vs ZOOM/PAN) ---
    const FINGER_OFFSET_Y = 100;

    function handleMobileTouch(e) {
        if(document.getElementById('analysis-view').classList.contains('hidden')) return;

        // CASO 1: MODO RESULTADO (STEP 99) -> ZOOM Y PAN DESBLOQUEADO
        if(step >= 99) {
            // No hacemos preventDefault para permitir gestos si el navegador quisiera, 
            // pero como tenemos user-scalable=no, lo manejamos nosotros.
            e.preventDefault(); 
            
            if (e.touches.length === 1) {
                // PAN (Arrastre)
                const touch = e.touches[0];
                if (lastTouchPos) {
                    const dx = touch.clientX - lastTouchPos.screenX;
                    const dy = touch.clientY - lastTouchPos.screenY;
                    cam.x += dx;
                    cam.y += dy;
                    draw();
                }
                lastTouchPos = { screenX: touch.clientX, screenY: touch.clientY };
            } 
            else if (e.touches.length === 2) {
                // PINCH (Zoom)
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                
                if (lastTouchDist) {
                    const delta = dist - lastTouchDist;
                    const zoomSpeed = 0.005;
                    cam.zoom += delta * zoomSpeed;
                    if(cam.zoom < 0.5) cam.zoom = 0.5; // Limite mínimo
                    if(cam.zoom > 5) cam.zoom = 5;     // Limite máximo
                    draw();
                }
                lastTouchDist = dist;
            }
            return; 
        }

        // CASO 2: MODO DIBUJO (STEP < 99) -> LUPA
        const touch = e.touches[0];
        let targetScreenX = touch.clientX;
        let targetScreenY = touch.clientY - FINGER_OFFSET_Y;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width; 
        const scaleY = canvas.height / rect.height;
        let canvasX = (targetScreenX - rect.left) * scaleX;
        let canvasY = (targetScreenY - rect.top) * scaleY;

        if (canvasX < 0) canvasX = 0; if (canvasX > canvas.width) canvasX = canvas.width;
        if (canvasY < 0) canvasY = 0; if (canvasY > canvas.height) canvasY = canvas.height;

        lastTouchPos = { x: canvasX, y: canvasY };
        draw(true); 

        let finalScreenX = (canvasX / scaleX) + rect.left;
        let finalScreenY = (canvasY / scaleY) + rect.top;

        zoomLens.style.display = 'block';
        zoomLens.style.left = (finalScreenX - 70) + 'px'; zoomLens.style.top = (finalScreenY - 70) + 'px'; 
        zoomLens.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        const zoomFactor = ZOOM_LEVEL;
        zoomLens.style.backgroundSize = `${canvas.width * zoomFactor}px ${canvas.height * zoomFactor}px`;
        const bgX = -(canvasX * zoomFactor) + 70; const bgY = -(canvasY * zoomFactor) + 70;
        zoomLens.style.backgroundPosition = `${bgX}px ${bgY}px`;
        draw(false); 
    }

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        if(step >= 99) {
            // Reiniciar referencias para el gesto
            if(e.touches.length === 1) {
                lastTouchPos = { screenX: e.touches[0].clientX, screenY: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        } else {
             handleMobileTouch(e);
        }
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        handleMobileTouch(e);
    });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if(step < 99) {
            zoomLens.style.display = 'none';
            draw();
        } else {
            // Al soltar en modo zoom, reseteamos distancias
            lastTouchDist = 0;
            lastTouchPos = null;
        }
    });
}


function registerPoint(p) {
    playSound('pop');
    if(step === 1) { pts.p1 = p; step++; }
    else if(step === 2) { pts.p2 = p; step++; }
    else if(step === 3) { pts.p3 = p; step++; }
    else if(step === 4) { 
        pts.p4 = p; 
        if(calculateVP()) { step = 5; modeSelector.style.display = 'block'; }
        else step = 1; 
    }
    else if(waitingForRefs) {
        if(refSubStep === 1) { pts.refTop = p; refSubStep++; }
        else if(refSubStep === 2) { pts.refBot = p; refSubStep++; }
        else if(refSubStep === 3) { pts.refDepthStart = p; refSubStep++; }
        else if(refSubStep === 4) { pts.refDepthEnd = p; waitingForRefs = false; refSubStep = 0; }
    }
    else if(step === 5) { currentActor = 'def'; handlePlayerClick(p); }
    else if(step === 6) { currentActor = 'att'; handlePlayerClick(p); }

    if(step === 7) {
        modeSelector.style.display = 'none';
        document.getElementById('attack-dir-select').style.display = 'block';
        btnEvaluate.style.display = 'block';
        if (isTouchDevice) {
            zoomLens.style.display = 'none';
            btnMarkPoint.classList.add('hidden');
        }
    }
    draw(); updateUI();
}

function handlePlayerClick(p) {
    if(markMode === 'foot') {
        if(currentActor === 'def') pts.def = p; else pts.att = p;
        step++; 
    } else {
        let actorBody = currentActor === 'def' ? pts.defBody : pts.attBody;
        if(!actorBody) {
            if(currentActor === 'def') pts.defBody = p; else pts.attBody = p;
        } else {
            let groundPoint = calculateIntersection(currentActor === 'def' ? pts.defBody : pts.attBody, p);
            if(currentActor === 'def') { pts.def = groundPoint; pts.defGround = p; }
            else { pts.att = groundPoint; pts.attGround = p; }
            step++;
        }
    }
}

function calculateVP() {
    const p1=pts.p1, p2=pts.p2, p3=pts.p3, p4=pts.p4;
    const d = (p1.x - p2.x)*(p3.y - p4.y) - (p1.y - p2.y)*(p3.x - p4.x);
    if(d === 0) { alert("Paralelas. Intenta líneas que converjan."); return false; }
    const pre = (p1.x*p2.y - p1.y*p2.x), post = (p3.x*p4.y - p3.y*p4.x);
    pts.vp = { x: (pre*(p3.x-p4.x) - (p1.x-p2.x)*post)/d, y: (pre*(p3.y-p4.y) - (p1.y-p2.y)*post)/d };
    return true;
}

function calculateIntersection(pShoulder, pFoot) {
    let dyV = pts.refBot.y - pts.refTop.y;
    let dxV = pts.refBot.x - pts.refTop.x;
    if(Math.abs(dxV) < 0.0001) dxV = 0.0001;
    let mV = dyV / dxV;
    let dyD = pts.refDepthEnd.y - pts.refDepthStart.y;
    let dxD = pts.refDepthEnd.x - pts.refDepthStart.x;
    if(Math.abs(dxD) < 0.0001) dxD = 0.0001;
    let mD = dyD / dxD;
    let b1 = pShoulder.y - mV * pShoulder.x;
    let b2 = pFoot.y - mD * pFoot.x;
    if(Math.abs(mV - mD) < 0.01) return pFoot; 
    let x = (b2 - b1) / (mV - mD);
    let y = mV * x + b1;
    return {x: x, y: y};
}

// --- FUNCIÓN DE DIBUJO ---
function draw(skipCrosshair = false) { 
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();
    
    // APLICAR TRANSFORMACIÓN DE CÁMARA (ZOOM/PAN) SOLO SI STEP >= 99
    if (step >= 99) {
        // Centrar el zoom en el medio del canvas para que sea más natural
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-canvas.width/2, -canvas.height/2);
        
        // Aplicar paneo
        ctx.translate(cam.x, cam.y);
    }
    
    // 1. Dibujar la imagen
    ctx.drawImage(analysisImg, 0, 0, canvas.width, canvas.height);
    
    // 2. Dibujar todos los puntos y líneas
    if(pts.p1) drawDot(pts.p1, COLORS.guide);
    if(pts.p2) { drawDot(pts.p2, COLORS.guide); drawLineFull(pts.p1, pts.p2, COLORS.guide); }
    if(pts.p3) drawDot(pts.p3, COLORS.guide);
    if(pts.p4) { drawDot(pts.p4, COLORS.guide); drawLineFull(pts.p3, pts.p4, COLORS.guide); }

    if(pts.refTop) drawDot(pts.refTop, COLORS.ref);
    if(pts.refBot) { drawDot(pts.refBot, COLORS.ref); drawLine(pts.refTop, pts.refBot, COLORS.ref); }
    if(pts.refDepthStart) drawDot(pts.refDepthStart, COLORS.depth);
    if(pts.refDepthEnd) { drawDot(pts.refDepthEnd, COLORS.depth); drawLine(pts.refDepthStart, pts.refDepthEnd, COLORS.depth); }

    if(pts.defBody) drawDot(pts.defBody, COLORS.def);
    if(pts.def) { 
        drawDot(pts.def, COLORS.def); 
        if(pts.defBody) {
             drawDashedLine(pts.defBody, pts.def, COLORS.def); 
             drawDashedLine(pts.defGround, pts.def, COLORS.def); 
             drawDot(pts.defGround, COLORS.def);
        }
    }

    if(pts.attBody) drawDot(pts.attBody, COLORS.att);
    if(pts.att) {
        drawDot(pts.att, COLORS.att);
        if(pts.attBody) {
            drawDashedLine(pts.attBody, pts.att, COLORS.att);
            drawDashedLine(pts.attGround, pts.att, COLORS.att); 
            drawDot(pts.attGround, COLORS.att);
        }
    }

    if(step === 99) {
        drawOffsideLineToVP(pts.def, COLORS.def);
        drawOffsideLineToVP(pts.att, COLORS.att);
    }
    
    // 3. DIBUJAR MIRA (Solo si NO estamos en modo skip y hay posición)
    if (!skipCrosshair && isTouchDevice && lastTouchPos && step < 99) {
        drawCrosshair(lastTouchPos.x, lastTouchPos.y);
    }

    ctx.restore();
}

function drawCrosshair(x, y) {
    ctx.save(); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
    ctx.stroke(); ctx.restore();
}

function drawOffsideLineToVP(p, c) {
    let m = (pts.vp.y - p.y) / (pts.vp.x - p.x);
    let b = p.y - m * p.x;
    ctx.beginPath();
    ctx.moveTo(0, b); ctx.lineTo(canvas.width, m * canvas.width + b);
    ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
}
function drawDot(p, c) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fillStyle=c; ctx.fill(); ctx.stroke(); }
function drawLine(p1, p2, c) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke(); }
function drawLineFull(p1, p2, c) { ctx.beginPath(); const m=(p2.y-p1.y)/(p2.x-p1.x); const b=p1.y-m*p1.x; ctx.moveTo(0,b); ctx.lineTo(canvas.width,m*canvas.width+b); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke(); }
function drawDashedLine(p1, p2, c) { ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle=c; ctx.stroke(); ctx.setLineDash([]); }
function updateUI() {
    let txt = "";
    if(waitingForRefs) {
        if(refSubStep === 1) txt = "⚠️ <span class='highlight-text' style='color:#cc00ff'>REFERENCIA 1</span>: Toca ARRIBA de un poste vertical.";
        else if(refSubStep === 2) txt = "⚠️ <span class='highlight-text' style='color:#cc00ff'>REFERENCIA 1</span>: Toca ABAJO de ese mismo poste.";
        else if(refSubStep === 3) txt = "⚠️ <span class='highlight-text' style='color:#00ff99'>REFERENCIA 2</span>: Toca el INICIO de una línea lateral (profundidad).";
        else if(refSubStep === 4) txt = "⚠️ <span class='highlight-text' style='color:#00ff99'>REFERENCIA 2</span>: Toca el FINAL de esa línea lateral.";
    } else {
        if(step===1) txt = "1. Toca el <span class='highlight-text'>INICIO</span> de una línea de pasto (Corte horizontal).";
        else if(step===2) txt = "1. Toca el <span class='highlight-text'>FINAL</span> de esa línea.";
        else if(step===3) txt = "2. Toca el <span class='highlight-text'>INICIO</span> de otra línea de pasto paralela.";
        else if(step===4) txt = "2. Toca el <span class='highlight-text'>FINAL</span> de esa segunda línea.";
        else if(step===5) {
            txt = `3. <span class='highlight-text' style='color:#ff3333'>DEFENSOR</span>: `;
            if(markMode === 'foot') txt += isTouchDevice ? "Arrastra y apunta. Luego botón MARCAR." : "Marca el PIE más atrasado.";
            else txt += (pts.defBody) ? "Apunta al BOTÍN. Luego MARCAR." : "Apunta al HOMBRO/CABEZA. Luego MARCAR.";
        }
        else if(step===6) {
            txt = `4. <span class='highlight-text' style='color:#00ccff'>ATACANTE</span>: `;
            if(markMode === 'foot') txt += isTouchDevice ? "Arrastra y apunta. Luego botón MARCAR." : "Marca el PIE más adelantado.";
            else txt += (pts.attBody) ? "Apunta al BOTÍN. Luego MARCAR." : "Apunta al HOMBRO/CABEZA. Luego MARCAR.";
        }
        else if(step===7) txt = "Selecciona dirección y ANALIZAR.";
    }
    instructionBox.innerHTML = txt;
}
function getBodyScaleFactor() {
    const REFERENCE_HEIGHT_CM = 150; 
    if(pts.def && pts.defBody) { const h = Math.sqrt(Math.pow(pts.def.x - pts.defBody.x, 2) + Math.pow(pts.def.y - pts.defBody.y, 2)); if(h > 10) return { factor: REFERENCE_HEIGHT_CM / h, method: "Altura Defensor (1.5m)" }; }
    if(pts.att && pts.attBody) { const h = Math.sqrt(Math.pow(pts.att.x - pts.attBody.x, 2) + Math.pow(pts.att.y - pts.attBody.y, 2)); if(h > 10) return { factor: REFERENCE_HEIGHT_CM / h, method: "Altura Atacante (1.5m)" }; }
    const avgY = (pts.def.y + pts.att.y) / 2; const screenPct = avgY / canvas.height; const estimatedHeightPx = canvas.height * (0.05 + (screenPct * 0.15)); return { factor: REFERENCE_HEIGHT_CM / estimatedHeightPx, method: "Estimación por Posición" };
}
btnEvaluate.addEventListener('click', () => {
    step = 99; 
    
    // UI MANAGEMENT
    instructionBox.style.display = 'none'; 
    document.getElementById('attack-dir-select').style.display = 'none';
    btnEvaluate.style.display = 'none';
    
    if(canvasTopControls) canvasTopControls.classList.add('hidden'); 
    
    // MOSTRAR NUEVOS PANELES
    if(postAnalysisButtons) postAnalysisButtons.style.display = 'flex'; 
    if(resultActionsBlock) resultActionsBlock.style.display = 'flex';

    const attackRight = document.getElementById('attack-dir-select').value === 'right'; 
    let midY = canvas.height / 2;
    let mDef = (pts.vp.y - pts.def.y) / (pts.vp.x - pts.def.x); let bDef = pts.def.y - mDef * pts.def.x;
    let mAtt = (pts.vp.y - pts.att.y) / (pts.vp.x - pts.att.x); let bAtt = pts.att.y - mAtt * pts.att.x;
    let xDefAtMid = (midY - bDef) / mDef; let xAttAtMid = (midY - bAtt) / mAtt; let isOffside = attackRight ? xAttAtMid > xDefAtMid : xAttAtMid < xDefAtMid;
    const focusX = (pts.def.x + pts.att.x) / 2; let yDefAtFocus = mDef * focusX + bDef; let yAttAtFocus = mAtt * focusX + bAtt; let distPx = Math.abs(yDefAtFocus - yAttAtFocus);
    
    draw(); 
    document.getElementById('result-container').style.display = 'flex'; 
    
    const badge = document.getElementById('result-badge'); badge.className = isOffside ? 'res-offside' : 'res-onside'; badge.innerText = isOffside ? "OFFSIDE" : "HABILITADO";
    const scaleData = getBodyScaleFactor(); const TELEPHOTO_COMPRESSION = 0.4; const distCm = (distPx * scaleData.factor * TELEPHOTO_COMPRESSION).toFixed(1);
    document.getElementById('stat-dist').innerText = distCm + " cm"; document.getElementById('stat-px').innerText = Math.round(distPx) + " px"; document.getElementById('stat-ref').innerText = scaleData.method;
    let verdict = ""; const isClose = parseFloat(distCm) < 15; 
    if(isOffside) { 
        if(isClose) { const phrases = ["Por un hombro. Le faltó cortarse las uñas.", "Milimétrico. Le jugó en contra el peinado.", "Finito, finito. El VAR tardaría media hora.", "Por la nariz. Respiró antes de tiempo."]; verdict = phrases[Math.floor(Math.random() * phrases.length)]; } 
        else { const phrases = ["Estaba pescando. Offside indiscutible.", "Más solo que Adán en el día de la madre.", "Volvé a tu casa, estabas en el buffet.", "Clarísimo. Hasta mi abuela lo cobraba."]; verdict = phrases[Math.floor(Math.random() * phrases.length)]; }
    } else { 
        if(isClose) { const phrases = ["Misma línea. Ante la duda, deja jugar.", "Zafó de casualidad. El línea parpadeó.", "Habilitado por un pelo de rana calva.", "Ajustadísimo. El VAR tira la moneda."]; verdict = phrases[Math.floor(Math.random() * phrases.length)]; } 
        else { const phrases = ["Habilitadísimo. Siga, siga.", "Habilitado. El defensor se durmió la siesta.", "Todo legal. Que no lloren los rivales.", "Limpio. Pase, maestro, lo estábamos esperando."]; verdict = phrases[Math.floor(Math.random() * phrases.length)]; }
    }
    document.getElementById('sofa-verdict').innerText = `"${verdict}"`;
    if (isTouchDevice) {
        zoomLens.style.display = 'none';
        btnMarkPoint.classList.add('hidden');
    }
});
btnDownload.addEventListener('click', () => {
    // 1. Ocultar badges para dibujar limpio
    document.getElementById('result-container').style.display = 'none'; 
    
    // 2. Guardar estado de la cámara y resetear para descargar la FOTO ENTERA
    const savedCam = { ...cam };
    cam = { x: 0, y: 0, zoom: 1 };
    draw();

    const w = canvas.width, h = canvas.height; 
    ctx.save(); 
    
    // TEXTOS DE MARCA DE AGUA
    const smallFont = Math.max(10, Math.round(w * 0.025)); 
    const bigFont = Math.max(16, Math.round(w * 0.04));    
    const margin = Math.round(w * 0.02);

    ctx.font = `italic 900 ${smallFont}px Segoe UI`; 
    ctx.textAlign = "right"; 
    ctx.fillStyle = "rgba(0,0,0,0.5)"; 
    ctx.fillText("SofaOffside", w - margin, h - margin);

    ctx.fillStyle = "#ffc107"; 
    const offsideTextWidth = ctx.measureText("Offside").width;
    ctx.fillText("Sofa", w - (margin + offsideTextWidth + 4), h - (margin + 2)); 

    ctx.fillStyle = "#ff3333"; 
    ctx.fillText("Offside", w - margin, h - (margin + 2));

    const resText = document.getElementById('result-badge').innerText;
    ctx.font = `bold ${bigFont}px Segoe UI`; 
    ctx.textAlign = "left"; 

    ctx.fillStyle = "rgba(0,0,0,0.5)"; 
    ctx.fillText(resText, margin + 2, h - margin + 2);
    
    ctx.fillStyle = resText === "OFFSIDE" ? "#dc3545" : "#28a745";
    ctx.fillText(resText, margin, h - margin);
    
    ctx.restore(); 
    
    // Descarga
    const link = document.createElement('a'); 
    link.download = `analisis-${resText.toLowerCase()}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9); 
    link.click();

    // 3. Restaurar estado de cámara y UI
    cam = savedCam;
    draw();
    document.getElementById('result-container').style.display = 'flex';
});


/* =========================================================================
   BLOQUE 3: MÓDULO CHALLENGE
   ========================================================================= */
const CANTIDAD_TOTAL_JUGADAS = 28; 
const CANTIDAD_JUGADAS_POR_PARTIDO = 10; 
const scrIntro = document.getElementById('challenge-intro');
const scrGame = document.getElementById('challenge-game');
const scrFinal = document.getElementById('challenge-ranking-final');
const imgGame = document.getElementById('challenge-image');
const elTimer = document.getElementById('timer');
const fbOverlay = document.getElementById('game-feedback-overlay');
const readyOverlay = document.getElementById('ready-overlay');
const btnOff = document.getElementById('btn-game-offside');
const btnOn = document.getElementById('btn-game-onside');
const debugMsg = document.getElementById('debug-error-msg');
const BOTS = [{name:"VAR_Pro",score:1950},{name:"ArbitroAI",score:1800},{name:"SillonVAR",score:1600},{name:"OjoDeAguila",score:1450},{name:"ElJuez",score:1300},{name:"Linea_1",score:1100},{name:"OffsideKing",score:900},{name:"NovatoVAR",score:700},{name:"Ciego_FC",score:500},{name:"SinLentes",score:300}];
let gameQueue=[], currentRoundIndex=0, totalScore=0, timerInt, pauseInt, readyInt, startTime, userName="", isGamePaused=false; 
let currentCorrectAnswer=null, currentSolutionImg=null;

function shuffleArray(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function stopAllTimers(){if(timerInt)clearInterval(timerInt);if(pauseInt)clearInterval(pauseInt);if(readyInt)clearInterval(readyInt);}
function showChallengeScreen(s){scrIntro.classList.add('hidden');scrGame.classList.add('hidden');scrFinal.classList.add('hidden');if(s==='intro')scrIntro.classList.remove('hidden');if(s==='game')scrGame.classList.remove('hidden');if(s==='final')scrFinal.classList.remove('hidden');}
document.getElementById('btn-start-challenge').addEventListener('click',()=>{userName=document.getElementById('username-input').value.trim().substring(0,10)||"Anonimo";if(audioCtx.state==='suspended')audioCtx.resume();stopAllTimers();let i=Array.from({length:CANTIDAD_TOTAL_JUGADAS},(_,k)=>k+1);gameQueue=shuffleArray(i).slice(0,Math.min(CANTIDAD_TOTAL_JUGADAS,CANTIDAD_JUGADAS_POR_PARTIDO));currentRoundIndex=0;totalScore=0;showChallengeScreen('game');loadNextRound();renderRanking();});
document.getElementById('btn-restart-challenge').addEventListener('click',()=>{stopAllTimers();showChallengeScreen('intro');});
function loadNextRound(){if(currentRoundIndex>=gameQueue.length){endChallenge();return;}const id=gameQueue[currentRoundIndex];currentRoundIndex++;document.getElementById('current-round').innerText=currentRoundIndex;document.getElementById('live-score').innerText=Math.round(totalScore);fbOverlay.classList.remove('show-feedback');imgGame.style.display='none';document.getElementById('loading-msg').style.display='block';readyOverlay.classList.add('hidden');debugMsg.innerText="";btnOff.className='game-btn btn-disabled';btnOn.className='game-btn btn-disabled';isGamePaused=false;imgGame.onload=null;imgGame.onerror=null;let t=new Image();t.src=`Challenge_Imagenes/Respuestas_Offside/${id}.jpg`;t.onload=function(){currentCorrectAnswer='O';currentSolutionImg=t.src;preloadQuestionImage(id);};t.onerror=function(){currentCorrectAnswer='H';currentSolutionImg=`Challenge_Imagenes/Respuestas_Habilitado/${id}.jpg`;preloadQuestionImage(id);};}
function preloadQuestionImage(id){const s=`Challenge_Imagenes/Preguntas/${id}.jpg`;imgGame.src=s;imgGame.onload=()=>{imgGame.style.display='block';document.getElementById('loading-msg').style.display='none';if(currentRoundIndex===1)startReadySequence();else startRoundTimer();};imgGame.onerror=()=>{debugMsg.innerText="Error: "+s;imgGame.style.display='block';if(currentRoundIndex===1)startReadySequence();else startRoundTimer();}}
function startReadySequence(){stopAllTimers();let c=3;readyOverlay.classList.remove('hidden');readyOverlay.innerText=c;playSound('beep_low');readyInt=setInterval(()=>{c--;if(c>0){readyOverlay.innerText=c;playSound('beep_low');}else if(c===0){readyOverlay.innerText="¡YA!";playSound('beep_high');}else{clearInterval(readyInt);readyOverlay.classList.add('hidden');startRoundTimer();}},1000);}
function startRoundTimer(){btnOff.className='game-btn';btnOn.className='game-btn';let t=10.0;elTimer.innerText="10.0";startTime=Date.now();let l=10;timerInt=setInterval(()=>{if(isGamePaused)return;const e=(Date.now()-startTime)/1000;t=10.0-e;if(Math.floor(t)<l&&t>0){playSound('tick');l=Math.floor(t);}if(t<=0){t=0;processAnswer(null,10);}elTimer.innerText=t.toFixed(1);},50);}
btnOff.addEventListener('click',()=>processAnswer('O',(Date.now()-startTime)/1000));btnOn.addEventListener('click',()=>processAnswer('H',(Date.now()-startTime)/1000));
function processAnswer(a,t){if(btnOff.classList.contains('btn-disabled'))return;isGamePaused=true;stopAllTimers();elTimer.innerText=(10-t).toFixed(1);btnOff.classList.add('btn-disabled');btnOn.classList.add('btn-disabled');playSound('whistle');const ok=(a===currentCorrectAnswer);imgGame.onload=null;imgGame.src=currentSolutionImg;let p=0;if(ok){p=100+Math.max(0,(10-t)*10);totalScore+=p;}fbOverlay.classList.add('show-feedback');const ti=document.getElementById('fb-title'),ic=document.getElementById('fb-icon'),su=document.getElementById('fb-subtitle'),nx=document.getElementById('fb-next');if(ok){ic.innerText="✅";ti.innerText="¡CORRECTO!";ti.style.color="#28a745";su.innerText=`+${Math.round(p)} Puntos`;}else{ic.innerText="❌";ti.innerText="¡INCORRECTO!";ti.style.color="#dc3545";su.innerText=`Era ${currentCorrectAnswer==='O'?'Offside':'Habilitado'}`;}let pa=3;nx.innerText=`Siguiente en ${pa}...`;pauseInt=setInterval(()=>{pa--;if(currentRoundIndex<gameQueue.length)nx.innerText=`Siguiente en ${pa}...`;else nx.innerText="Finalizando...";if(pa<=0){clearInterval(pauseInt);loadNextRound();}},1000);
}

async function getMinTopScore() {
    if (!db) return 0;
    try {
        const q = query(collection(db, RANK_COLLECTION), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        let scores = [];
        querySnapshot.forEach((doc) => { scores.push(doc.data().score); });
        BOTS.forEach(bot => scores.push(bot.score));
        scores.sort((a, b) => b - a); 
        return scores.length >= 10 ? scores[9] : 0; 
    } catch (e) { return 0; }
}

async function endChallenge(){
    stopAllTimers();
    const finalScore = Math.round(totalScore);
    document.getElementById('final-score-display').innerText = finalScore;
    const minScore = await getMinTopScore();
    if (finalScore > minScore) await saveScore(userName, finalScore);
    showChallengeScreen('final');
    renderRanking();
}

async function saveScore(n, s) {
    if(!db) return; 
    try { await addDoc(collection(db, RANK_COLLECTION), { name: n, score: s, date: new Date() }); } catch (e) { console.error(e); }
}

async function renderRanking() {
    const tb = document.getElementById('sidebar-ranking-body');
    if(!db) { tb.innerHTML = '<tr><td colspan="3">Offline</td></tr>'; return; }
    tb.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
    try {
        const q = query(collection(db, RANK_COLLECTION), orderBy("score", "desc"), limit(10));
        const querySnapshot = await getDocs(q);
        let scores = [];
        querySnapshot.forEach((doc) => { scores.push(doc.data()); });
        if (scores.length < 10) { scores = [...scores, ...BOTS.slice(0, 10 - scores.length)].sort((a,b) => b.score - a.score); }

        tb.innerHTML = '';
        scores.forEach((it, i) => {
            const tr = document.createElement('tr');
            if (it.name === userName) tr.className = 'user-highlight';
            let m = ""; if (i === 0) m = "🥇 "; else if (i === 1) m = "🥈 "; else if (i === 2) m = "🥉 ";
            tr.innerHTML = `<td>${i + 1}</td><td>${m}${it.name}</td><td style="text-align:right;">${Math.round(it.score)}</td>`;
            tb.appendChild(tr);
        });
    } catch (e) { tb.innerHTML = '<tr><td colspan="3">Error (Red)</td></tr>'; }
}


/* =========================================================================
   BLOQUE 4: MÓDULO DE VIDEO
   ========================================================================= */
const videoInput = document.getElementById('video-input');
const videoPickerView = document.getElementById('video-picker-view');
const mainVideo = document.getElementById('main-video');
const btnSeekBack = document.getElementById('btn-seek-back');
const btnSeekFwd = document.getElementById('btn-seek-fwd');
const btnCapture = document.getElementById('btn-capture-frame');

videoInput.addEventListener('change', (e) => {
    if(e.target.files && e.target.files[0]){
        const fileURL = URL.createObjectURL(e.target.files[0]);
        mainVideo.src = fileURL;
        videoPickerView.classList.remove('hidden'); 
    }
});
function closeVideoPicker() {
    videoPickerView.classList.add('hidden');
    mainVideo.pause();
    mainVideo.src = ""; 
}
window.closeVideoPicker = closeVideoPicker; 

btnSeekBack.addEventListener('click', () => { mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 0.05); });
btnSeekFwd.addEventListener('click', () => { mainVideo.currentTime = Math.min(mainVideo.duration, mainVideo.currentTime + 0.05); });

btnCapture.addEventListener('click', () => {
    mainVideo.pause();
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = mainVideo.videoWidth;
    tempCanvas.height = mainVideo.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(mainVideo, 0, 0, tempCanvas.width, tempCanvas.height);
    const dataURL = tempCanvas.toDataURL('image/jpeg');
    
    analysisImg.onload = () => initSystem(); 
    analysisImg.src = dataURL;
    
    closeVideoPicker();
});
