// Cambia este número por la cantidad total de fotografías.
const totalFotos = 6;
const extensiones = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];
function cargarFoto(img, numero) {
  let intento = 0;
  img.onerror = () => {
    intento++;
    if (intento < extensiones.length) img.src = `img/${numero}.${extensiones[intento]}`;
    else { const placeholder = document.createElement('div'); placeholder.className = 'photo-placeholder'; placeholder.textContent = `Fotografía ${numero}`; img.replaceWith(placeholder); }
  };
  img.src = `img/${numero}.${extensiones[0]}`;
}
cargarFoto(document.querySelector('[data-photo]'), 1);
const gallery = document.querySelector('#gallery');
for (let i = 2; i <= totalFotos; i++) {
  const figure = document.createElement('figure');
  const img = document.createElement('img');
  img.alt = `Recuerdo especial ${i}`;
  img.loading = 'lazy';
  figure.append(img); gallery.append(figure); cargarFoto(img, i);
}
const button = document.querySelector('#surprise');
button.addEventListener('click', () => {
  const message = document.querySelector('#message');
  message.hidden = !message.hidden;
  button.setAttribute('aria-expanded', String(!message.hidden));
  button.textContent = message.hidden ? 'Abrir tu sorpresa ✨' : 'Cerrar sorpresa';
  if (!message.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) confetti();
});
let animation;
function confetti() {
  cancelAnimationFrame(animation);
  const canvas = document.querySelector('#confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  const colors = ['#e9bd78','#ffffff','#819bc1','#f5dca9'];
  const pieces = Array.from({length: 150}, () => ({x:Math.random()*canvas.width,y:-Math.random()*canvas.height,v:2+Math.random()*5,r:Math.random()*6.28,c:colors[Math.floor(Math.random()*colors.length)]}));
  const start = performance.now();
  function frame(now) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if (now-start>5000) return;
    for (const p of pieces) {p.y+=p.v;p.x+=Math.sin(p.r);p.r+=.04;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-4,-6,8,12);ctx.restore();}
    animation=requestAnimationFrame(frame);
  }
  animation=requestAnimationFrame(frame);
}
