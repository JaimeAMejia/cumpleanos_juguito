// Cambia este número por la cantidad total de fotografías.
// Es la ÚNICA fuente de configuración: portada, galería y lightbox se derivan de aquí.
const totalFotos = 7;
const extensiones = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];
const INTERVALO_CARRUSEL = 4000;
const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- Registro central
// numero -> { numero, src, alt }. Solo contiene fotografías cargadas correctamente,
// por lo que sirve como fuente única para portada, galería y lightbox (sin duplicados).
const fotos = new Map();
const precargadas = new Map();

function numerosDisponibles() {
  return [...fotos.keys()].sort((a, b) => a - b);
}

// Precarga la imagen y fuerza su decodificación para evitar parpadeos en las transiciones.
function precargarFoto(numero, src) {
  if (precargadas.has(numero)) return;
  const pre = new Image();
  pre.src = src;
  if (typeof pre.decode === 'function') pre.decode().catch(() => {});
  precargadas.set(numero, pre);
}

function registrarFoto(numero, img) {
  const src = img.currentSrc || img.src;
  if (!src) return;
  fotos.set(numero, { numero, src, alt: img.alt || `Fotografía ${numero}` });
  precargarFoto(numero, src);
}

function quitarFoto(numero) {
  fotos.delete(numero);
  precargadas.delete(numero);
}

// ------------------------------------------------- Carga con fallback de extensión
function cargarFoto(img, numero, alTerminar) {
  let intento = 0;
  img.dataset.numero = numero;
  img.onload = () => {
    registrarFoto(numero, img);
    if (alTerminar) alTerminar(true, numero);
  };
  img.onerror = () => {
    intento++;
    if (intento < extensiones.length) {
      img.src = `img/${numero}.${extensiones[intento]}`;
      return;
    }
    img.onload = null;
    img.onerror = null;
    quitarFoto(numero);
    const placeholder = document.createElement('div');
    placeholder.className = 'photo-placeholder';
    placeholder.textContent = `Fotografía ${numero}`;
    img.replaceWith(placeholder);
    if (alTerminar) alTerminar(false, numero);
  };
  img.src = `img/${numero}.${extensiones[0]}`;
}

function crearImagen(numero, alt, { prioridad = false, alTerminar } = {}) {
  const img = document.createElement('img');
  img.alt = alt;
  img.loading = prioridad ? 'eager' : 'lazy';
  img.decoding = 'async';
  if (prioridad) img.setAttribute('fetchpriority', 'high');
  cargarFoto(img, numero, alTerminar);
  return img;
}

// ------------------------------------------------------------------ Referencias DOM
const gallery = document.querySelector('#gallery');
const portrait = document.querySelector('.portrait');
const track = document.querySelector('#portrait-track');
const dots = document.querySelector('#portrait-dots');
const lightbox = document.querySelector('#lightbox');
const lightboxImg = document.querySelector('#lightbox-img');
const lightboxContador = document.querySelector('#lightbox-counter');
const btnCerrar = document.querySelector('#lightbox-close');
const btnAnterior = document.querySelector('#lightbox-prev');
const btnSiguiente = document.querySelector('#lightbox-next');

// ------------------------------------------------------------------------- Estado
let intervaloCarrusel = null;
let indiceCarrusel = 0;
let carruselEnPausa = false;
let lightboxAbierto = false;
let fotoActual = null;
let focoPrevio = null;
let temporizadorFoto = null;
let toqueInicial = null;
let ignorarPausaPorFoco = false;

// =============================================================== Portada: carrusel
function slidesCarrusel() {
  return [...track.querySelectorAll('.portrait-slide')];
}

function crearDot(numero) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'portrait-dot';
  dot.dataset.numero = numero;
  dot.setAttribute('aria-label', `Mostrar la fotografía ${numero}`);
  dot.setAttribute('aria-current', 'false');
  dot.addEventListener('click', () => {
    const lista = slidesCarrusel();
    const indice = lista.findIndex((slide) => Number(slide.dataset.numero) === numero);
    if (indice === -1) return;
    activarSlide(indice);
    reiniciarCarrusel();
  });
  return dot;
}

function crearSlide(numero) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'portrait-slide';
  boton.dataset.numero = numero;
  boton.tabIndex = -1;
  boton.setAttribute('aria-hidden', 'true');
  boton.setAttribute('aria-label', `Ver la fotografía ${numero} en tamaño completo`);
  const alt = numero === 1 ? 'Un recuerdo especial del cumpleañero' : `Recuerdo especial ${numero}`;
  const img = crearImagen(numero, alt, {
    prioridad: numero === 1,
    alTerminar: (ok) => {
      if (ok) return;
      boton.remove();
      const dot = dots.querySelector(`.portrait-dot[data-numero="${numero}"]`);
      if (dot) dot.remove();
      normalizarCarrusel();
    },
  });
  boton.append(img);
  return boton;
}

function activarSlide(indice) {
  const lista = slidesCarrusel();
  if (!lista.length) return;
  const enfocado = document.activeElement;
  indiceCarrusel = ((indice % lista.length) + lista.length) % lista.length;
  lista.forEach((slide, i) => {
    const activo = i === indiceCarrusel;
    slide.classList.toggle('is-active', activo);
    slide.setAttribute('aria-hidden', String(!activo));
    slide.tabIndex = activo ? 0 : -1;
  });
  // Nunca dejar el foco en un slide que pasa a aria-hidden (autoplay tras cerrar el lightbox).
  if (enfocado && lista.includes(enfocado) && !enfocado.classList.contains('is-active')) {
    ignorarPausaPorFoco = true;
    lista[indiceCarrusel].focus({ preventScroll: true });
  }
  const numeroActivo = Number(lista[indiceCarrusel].dataset.numero);
  dots.querySelectorAll('.portrait-dot').forEach((dot) => {
    const activo = Number(dot.dataset.numero) === numeroActivo;
    dot.classList.toggle('is-active', activo);
    dot.setAttribute('aria-current', String(activo));
  });
}

// Recalcula el estado del carrusel cuando una foto se carga o falla.
function normalizarCarrusel() {
  const lista = slidesCarrusel();
  if (!lista.length) {
    detenerCarrusel();
    return;
  }
  const activa = track.querySelector('.portrait-slide.is-active');
  if (activa) {
    const indice = lista.indexOf(activa);
    indiceCarrusel = indice > -1 ? indice : 0;
  } else {
    const primeraCargada = lista.findIndex((slide) => fotos.has(Number(slide.dataset.numero)));
    indiceCarrusel = primeraCargada > -1 ? primeraCargada : 0;
  }
  activarSlide(indiceCarrusel);
  iniciarCarrusel();
}

// Una sola instancia de setInterval, sin importar cuántas veces se abra el lightbox.
function detenerCarrusel() {
  if (intervaloCarrusel === null) return;
  clearInterval(intervaloCarrusel);
  intervaloCarrusel = null;
}

// La preferencia prefers-reduced-motion se respeta en CSS (sin fundido ni animaciones),
// pero la rotación de 4 s se mantiene: se puede pausar con hover o con el foco.
function iniciarCarrusel() {
  if (intervaloCarrusel !== null) return;
  if (lightboxAbierto || carruselEnPausa || document.hidden) return;
  if (slidesCarrusel().length < 2) return;
  intervaloCarrusel = setInterval(() => activarSlide(indiceCarrusel + 1), INTERVALO_CARRUSEL);
}

function reiniciarCarrusel() {
  detenerCarrusel();
  iniciarCarrusel();
}

function sincronizarCarruselCon(numero) {
  const indice = slidesCarrusel().findIndex((slide) => Number(slide.dataset.numero) === numero);
  if (indice > -1) activarSlide(indice);
}

// ==================================================================== Galería
for (let i = 1; i <= totalFotos; i++) {
  const figure = document.createElement('figure');
  figure.tabIndex = 0;
  figure.setAttribute('role', 'button');
  figure.setAttribute('aria-label', `Ampliar la fotografía ${i}`);
  const alt = i === 1 ? 'Un recuerdo especial del cumpleañero' : `Recuerdo especial ${i}`;
  const img = crearImagen(i, alt, {
    alTerminar: (ok) => {
      if (ok) return;
      figure.removeAttribute('tabindex');
      figure.removeAttribute('role');
      figure.removeAttribute('aria-label');
    },
  });
  figure.append(img);
  gallery.append(figure);
}

// ==================================================================== Lightbox
function coleccion() {
  return numerosDisponibles();
}

function actualizarContador() {
  const lista = coleccion();
  const posicion = lista.indexOf(fotoActual);
  lightboxContador.textContent = posicion > -1 ? `${posicion + 1} / ${lista.length}` : '';
  const hayVarias = lista.length > 1;
  btnAnterior.disabled = !hayVarias;
  btnSiguiente.disabled = !hayVarias;
}

function precargarVecinas() {
  const lista = coleccion();
  if (lista.length < 2) return;
  const indice = lista.indexOf(fotoActual);
  [-1, 1].forEach((delta) => {
    const numero = lista[(indice + delta + lista.length) % lista.length];
    const foto = fotos.get(numero);
    if (foto) precargarFoto(numero, foto.src);
  });
}

function mostrarFoto(numero) {
  const foto = fotos.get(numero);
  if (!foto) return;
  fotoActual = numero;
  actualizarContador();

  const aplicar = () => {
    if (lightboxImg.getAttribute('src') !== foto.src) lightboxImg.src = foto.src;
    else lightboxImg.classList.remove('is-loading');
    lightboxImg.alt = foto.alt;
  };

  clearTimeout(temporizadorFoto);
  if (movimientoReducido.matches) {
    lightboxImg.classList.remove('is-loading');
    aplicar();
  } else {
    lightboxImg.classList.add('is-loading');
    temporizadorFoto = setTimeout(aplicar, 160);
  }

  sincronizarCarruselCon(numero);
  precargarVecinas();
}

function navegar(direccion) {
  const lista = coleccion();
  if (lista.length < 2) return;
  const indice = lista.indexOf(fotoActual);
  const destino = lista[(indice + direccion + lista.length) % lista.length];
  mostrarFoto(destino);
}

function abrirLightbox(numero) {
  const lista = coleccion();
  if (!lista.length) return;
  const destino = lista.includes(numero) ? numero : lista[0];
  if (!lightboxAbierto && document.activeElement instanceof HTMLElement) {
    focoPrevio = document.activeElement;
  }
  lightboxAbierto = true;
  detenerCarrusel();
  document.body.classList.add('lightbox-open');
  lightbox.hidden = false;
  // Fuerza el reflow para que la transición de entrada se reproduzca de forma fiable.
  void lightbox.offsetHeight;
  lightbox.classList.add('is-open');
  mostrarFoto(destino);
  btnCerrar.focus({ preventScroll: true });
}

function cerrarLightbox() {
  if (!lightboxAbierto) return;
  lightboxAbierto = false;
  clearTimeout(temporizadorFoto);
  lightbox.classList.remove('is-open');
  document.body.classList.remove('lightbox-open');

  const ocultar = () => {
    if (lightboxAbierto) return;
    lightbox.hidden = true;
    lightboxImg.removeAttribute('src');
    lightboxImg.classList.remove('is-loading');
  };
  if (movimientoReducido.matches) ocultar();
  else setTimeout(ocultar, 300);

  const anterior = focoPrevio;
  focoPrevio = null;
  // Si el foco venía de un slide del carrusel, devolverlo al slide activo:
  // navegar en el lightbox pudo dejar ese slide con aria-hidden.
  const destino = anterior && anterior.classList.contains('portrait-slide')
    ? (track.querySelector('.portrait-slide.is-active') || anterior)
    : anterior;
  // El foco vuelve al carrusel, pero ese focusin no debe volver a pausarlo:
  // el requisito es reanudar el carrusel al cerrar el lightbox.
  if (destino && track.contains(destino)) ignorarPausaPorFoco = true;
  if (destino && document.contains(destino) && typeof destino.focus === 'function') {
    destino.focus({ preventScroll: true });
  }
  iniciarCarrusel();
}

function trampaFoco(evento) {
  const enfocables = [btnCerrar, btnAnterior, btnSiguiente].filter((boton) => !boton.disabled);
  if (!enfocables.length) return;
  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  const dentro = lightbox.contains(document.activeElement);
  if (evento.shiftKey && (!dentro || document.activeElement === primero)) {
    evento.preventDefault();
    ultimo.focus();
    return;
  }
  if (!evento.shiftKey && (!dentro || document.activeElement === ultimo)) {
    evento.preventDefault();
    primero.focus();
  }
}

// ==================================================================== Disparadores
gallery.addEventListener('click', (evento) => {
  const img = evento.target.closest('img');
  if (!img || !gallery.contains(img)) return;
  const numero = Number(img.dataset.numero);
  if (fotos.has(numero)) abrirLightbox(numero);
});

gallery.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Enter' && evento.key !== ' ') return;
  const figure = evento.target.closest('figure');
  if (!figure) return;
  const img = figure.querySelector('img');
  if (!img) return;
  evento.preventDefault();
  const numero = Number(img.dataset.numero);
  if (fotos.has(numero)) abrirLightbox(numero);
});

portrait.addEventListener('click', (evento) => {
  if (evento.target.closest('.portrait-dot')) return;
  const slide = evento.target.closest('.portrait-slide');
  if (!slide) return;
  const numero = Number(slide.dataset.numero);
  if (fotos.has(numero)) abrirLightbox(numero);
});

btnCerrar.addEventListener('click', cerrarLightbox);
btnAnterior.addEventListener('click', () => navegar(-1));
btnSiguiente.addEventListener('click', () => navegar(1));
lightboxImg.addEventListener('load', () => lightboxImg.classList.remove('is-loading'));

lightbox.addEventListener('click', (evento) => {
  if (evento.target.closest('.lightbox-btn') || evento.target.closest('.lightbox-img')) return;
  cerrarLightbox();
});

document.addEventListener('keydown', (evento) => {
  if (!lightboxAbierto) return;
  if (evento.key === 'Escape') {
    evento.preventDefault();
    cerrarLightbox();
  } else if (evento.key === 'ArrowRight') {
    evento.preventDefault();
    navegar(1);
  } else if (evento.key === 'ArrowLeft') {
    evento.preventDefault();
    navegar(-1);
  } else if (evento.key === 'Tab') {
    trampaFoco(evento);
  }
});

// Gestos táctiles: deslizar a la izquierda avanza, a la derecha retrocede.
lightbox.addEventListener('touchstart', (evento) => {
  if (evento.touches.length !== 1) {
    toqueInicial = null;
    return;
  }
  toqueInicial = { x: evento.touches[0].clientX, y: evento.touches[0].clientY, tiempo: Date.now() };
}, { passive: true });

lightbox.addEventListener('touchend', (evento) => {
  if (!toqueInicial) return;
  const toque = evento.changedTouches[0];
  const deltaX = toque.clientX - toqueInicial.x;
  const deltaY = toque.clientY - toqueInicial.y;
  const duracion = Date.now() - toqueInicial.tiempo;
  toqueInicial = null;
  if (Math.abs(deltaX) < 45 || Math.abs(deltaY) > 70 || duracion > 800) return;
  navegar(deltaX < 0 ? 1 : -1);
}, { passive: true });

// Pausa al interactuar con la portada (solo puntero real, no touch) y al ocultar la pestaña.
portrait.addEventListener('pointerenter', (evento) => {
  if (evento.pointerType === 'touch') return;
  carruselEnPausa = true;
  detenerCarrusel();
});
portrait.addEventListener('pointerleave', (evento) => {
  if (evento.pointerType === 'touch') return;
  carruselEnPausa = false;
  iniciarCarrusel();
});
portrait.addEventListener('focusin', () => {
  if (ignorarPausaPorFoco) {
    ignorarPausaPorFoco = false;
    return;
  }
  carruselEnPausa = true;
  detenerCarrusel();
});
portrait.addEventListener('focusout', (evento) => {
  if (portrait.contains(evento.relatedTarget)) return;
  carruselEnPausa = false;
  iniciarCarrusel();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) detenerCarrusel();
  else iniciarCarrusel();
});

// ============================================================ Inicializar portada
for (let i = 1; i <= totalFotos; i++) {
  dots.append(crearDot(i));
  track.append(crearSlide(i));
}
activarSlide(0);
iniciarCarrusel();

// ==================================================================== Sorpresa
const button = document.querySelector('#surprise');
button.addEventListener('click', () => {
  const message = document.querySelector('#message');
  message.hidden = !message.hidden;
  button.setAttribute('aria-expanded', String(!message.hidden));
  button.textContent = message.hidden ? 'Abrir tu sorpresa ✨' : 'Cerrar sorpresa';
  if (!message.hidden && !movimientoReducido.matches) confetti();
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
