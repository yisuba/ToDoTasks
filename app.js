import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD7aALAi22zgXV6WzUw3VPY6OqbT4-0nDs",
  authDomain: "todotasks-proyect.firebaseapp.com",
  projectId: "todotasks-proyect",
  storageBucket: "todotasks-proyect.firebasestorage.app",
  messagingSenderId: "1017724324143",
  appId: "1:1017724324143:web:2a138fdf100913ef6239da"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ---------- Constantes y estado ----------
const $ = id => document.getElementById(id);
const TZ = "America/Santiago";
const TONOS = 8;
const HUES = [215, 150, 335, 265, 25, 50, 190, 165]; // matices pastel disponibles
const CATEGORIAS_INICIALES = { Universidad: 215, Personal: 335, Proyectos: 150 };
const TEMA_LOCAL = "todotasks-tema";

let uid = null;
let categorias = [];
let tareas = [];
let unsubs = [];
let tema = leerTemaLocal();
let hueNuevo = HUES[0];
let ocultas = new Set();   // ids de categorías desmarcadas en la barra (por defecto, ninguna)
let vista = "tareas";      // "tareas" o "papelera"

function leerTemaLocal() {
  try { return localStorage.getItem(TEMA_LOCAL) === "claro" ? "claro" : "oscuro"; }
  catch { return "oscuro"; }
}
const oscuro = () => tema === "oscuro";

// ---------- Colores ----------
// Tonos de una misma familia: mismo matiz, distinta luminosidad (más amplia que antes)
function colorTono(hue, tono, esOscuro) {
  return esOscuro
    ? `hsl(${hue} 55% ${24 + tono * 3}%)`
    : `hsl(${hue} 80% ${92 - tono * 4}%)`;
}

// Cierra los menús flotantes (tono y calendario) al hacer clic fuera de su contenedor
document.addEventListener("click", e => {
  document.querySelectorAll(".menu-flotante").forEach(m => {
    if (!m.parentElement.contains(e.target)) m.hidden = true;
  });
});

// ---------- Fechas (siempre hora de Santiago) ----------
const fmtFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});

function partesSantiago(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = Number(x.value); });
  return p;
}

// Diferencia (ms) entre la hora de pared de Santiago y UTC en ese instante
function offsetSantiago(ms) {
  const p = partesSantiago(ms);
  const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUTC - Math.floor(ms / 1000) * 1000;
}

// "AAAA-MM-DDTHH:mm" escrito como hora de Santiago -> Date (instante real)
function santiagoAUTC(valor) {
  const [f, h] = valor.split("T");
  const [y, mo, d] = f.split("-").map(Number);
  const [hh, mi] = h.split(":").map(Number);
  const pared = Date.UTC(y, mo - 1, d, hh, mi);
  let utc = pared;
  for (let i = 0; i < 2; i++) utc = pared - offsetSantiago(utc);
  return new Date(utc);
}

// Date -> "AAAA-MM-DDTHH:mm" en hora de Santiago (para el input)
function aInputSantiago(date) {
  const p = partesSantiago(date.getTime());
  const z = n => String(n).padStart(2, "0");
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

function toDate(v) {
  if (!v) return null;
  return typeof v.toDate === "function" ? v.toDate() : new Date(v);
}

function msDe(v) {
  return v && typeof v.toMillis === "function" ? v.toMillis() : Date.now();
}

// ---------- Helpers de DOM ----------
function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

const alertar = e => alert("Error: " + e.message);

function swatches(hueActivo, alElegir) {
  const cont = el("div", "swatches");
  HUES.forEach(h => {
    const b = el("button", "swatch");
    b.type = "button";
    b.style.background = colorTono(h, 0, oscuro());
    b.title = "Elegir color";
    if (h === hueActivo) b.classList.add("activo");
    b.onclick = () => alElegir(h);
    cont.appendChild(b);
  });
  return cont;
}

// ---------- Referencias a Firestore (todo dentro de usuarios/{uid}) ----------
const colCat = () => collection(db, "usuarios", uid, "categorias");
const colTar = () => collection(db, "usuarios", uid, "tareas");
const refCat = id => doc(db, "usuarios", uid, "categorias", id);
const refTarea = id => doc(db, "usuarios", uid, "tareas", id);
const refPrefs = () => doc(db, "usuarios", uid, "ajustes", "prefs");

// ---------- Tema ----------
function aplicarTema(t) {
  tema = t;
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(TEMA_LOCAL, t); } catch {}
  $("selector-tema").value = t;
  render();
}

function elegirTema(t) {
  aplicarTema(t);
  if (uid) setDoc(refPrefs(), { tema: t }, { merge: true }).catch(alertar);
}
$("selector-tema").onchange = e => elegirTema(e.target.value);

function alternarSeccion(contId, btnId, nombre) {
  const c = $(contId);
  c.hidden = !c.hidden;
  const b = $(btnId);
  b.textContent = (c.hidden ? "▸ " : "▾ ") + nombre;
  b.setAttribute("aria-expanded", String(!c.hidden));
}
$("btn-sec-categorias").onclick = () => alternarSeccion("contenido-categorias", "btn-sec-categorias", "Categorías");
$("btn-sec-config").onclick = () => alternarSeccion("contenido-config", "btn-sec-config", "Configuración");

// ---------- Sesión ----------
$("btn-login").onclick = () => signInWithPopup(auth, provider).catch(e => alert(e.message));

onAuthStateChanged(auth, user => {
  $("pantalla-login").hidden = !!user;
  $("pantalla-app").hidden = !user;
  $("btn-menu").hidden = !user;
  unsubs.forEach(f => f());
  unsubs = [];
  if (user) {
    uid = user.uid;
    iniciarDatos();
  } else {
    uid = null;
    categorias = [];
    tareas = [];
    render();
  }
});

function iniciarDatos() {
  unsubs.push(onSnapshot(refPrefs(), s => {
    const t = s.data()?.tema;
    if (t) {
      if (t !== tema) aplicarTema(t);
    } else {
      setDoc(refPrefs(), { tema }, { merge: true }).catch(alertar);
    }
  }, alertar));

  unsubs.push(onSnapshot(colCat(), snap => {
    categorias = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, alertar));

  unsubs.push(onSnapshot(colTar(), snap => {
    tareas = snap.docs.map(d => {
      const v = d.data();
      return { id: d.id, ...v, deadline: toDate(v.deadline) };
    });
    render();
  }, alertar));

  migrar().catch(e => alert("Error al migrar tus datos anteriores: " + e.message));
}

// Copia las tareas antiguas (colección "tareas" en la raíz) a usuarios/{uid}, una sola vez
async function migrar() {
  const pref = await getDoc(refPrefs());
  if (pref.data()?.migrado) return;

  const catsSnap = await getDocs(colCat());
  const idPorNombre = {};
  catsSnap.forEach(d => { idPorNombre[d.data().nombre] = d.id; });

  const crear = async nombre => {
    if (!idPorNombre[nombre]) {
      const hue = CATEGORIAS_INICIALES[nombre] ?? HUES[Object.keys(idPorNombre).length % HUES.length];
      const r = await addDoc(colCat(), { nombre, hue, eliminada: false, creada: serverTimestamp() });
      idPorNombre[nombre] = r.id;
    }
    return idPorNombre[nombre];
  };

  if (catsSnap.empty) {
    for (const nombre of Object.keys(CATEGORIAS_INICIALES)) await crear(nombre);
  }

  const viejas = await getDocs(collection(db, "tareas"));
  for (const d of viejas.docs) {
    const v = d.data();
    const categoriaId = await crear(v.categoria || "Personal");
    await addDoc(colTar(), {
      titulo: v.titulo || "",
      categoriaId,
      tono: 0,
      hecha: !!v.hecha,
      creada: v.creada ?? serverTimestamp(),
      deadline: null,
      anotaciones: v.anotaciones || []
    });
  }

  await setDoc(refPrefs(), { migrado: true }, { merge: true });
}

// ---------- Crear tarea ----------
$("form-tarea").onsubmit = async e => {
  e.preventDefault();
  const categoriaId = $("categoria").value;
  if (!categoriaId) return;
  const valorDeadline = $("deadline").value;
  await addDoc(colTar(), {
    titulo: $("titulo").value.trim(),
    categoriaId,
    tono: 0,
    hecha: false,
    creada: serverTimestamp(),
    deadline: valorDeadline ? santiagoAUTC(valorDeadline) : null,
    anotaciones: []
  }).catch(alertar);
  e.target.reset();
};

$("orden").onchange = () => renderVista();

// ---------- Barra lateral y diálogos ----------
$("chk-todas").onchange = () => {
  const marcar = $("chk-todas").checked;
  ocultas = new Set(marcar ? [] : categoriasActivas().map(c => c.id));
  vista = "tareas";
  render();
};
$("nav-papelera").onclick = () => { vista = "papelera"; render(); };
$("titulo-app").onclick = () => { ocultas = new Set(); vista = "tareas"; render(); };
$("btn-menu").onclick = e => {
  e.stopPropagation();
  const c = $("contenido-barra");
  c.hidden = !c.hidden;
};

// En celular la barra empieza cerrada y se abre encima del contenido; en computador empieza abierta
const celular = window.matchMedia("(max-width: 700px)");
$("contenido-barra").hidden = celular.matches;
// En celular, tocar fuera de la barra la cierra
document.addEventListener("click", e => {
  if (celular.matches && !$("contenido-barra").hidden && !e.target.closest(".barra")) {
    $("contenido-barra").hidden = true;
  }
});
$("btn-crear-cat").onclick = () => { renderFormCategoria(); $("dlg-crear").showModal(); };
$("btn-cancelar-cat").onclick = () => $("dlg-crear").close();

// ---------- Crear categoría ----------
$("form-categoria").onsubmit = async e => {
  e.preventDefault();
  const nombre = $("cat-nombre").value.trim();
  if (!nombre) return;
  await addDoc(colCat(), {
    nombre,
    hue: hueNuevo,
    eliminada: false,
    creada: serverTimestamp()
  }).catch(alertar);
  e.target.reset();
  $("dlg-crear").close();
};

// ---------- Render ----------
function render() {
  renderNav();
  renderSelectCategorias();
  renderFormCategoria();
  renderVista();
}

const porAntiguedad = (a, b) => msDe(a.creada) - msDe(b.creada);
const categoriasActivas = () => categorias.filter(c => !c.eliminada).sort(porAntiguedad);

// Una tarea se muestra si su categoría está marcada (o no tiene categoría) y no está en papelera
function esVisible(t) {
  const c = categorias.find(x => x.id === t.categoriaId);
  if (!c) return true;
  if (c.eliminada) return false;
  return !ocultas.has(c.id);
}

function renderNav() {
  const activas = categoriasActivas();
  const visibles = activas.filter(c => !ocultas.has(c.id));

  const chk = $("chk-todas");
  chk.checked = activas.length > 0 && visibles.length === activas.length;
  chk.indeterminate = visibles.length > 0 && visibles.length < activas.length;
  $("cnt-todas").textContent = String(tareas.filter(t => !t.hecha && esVisible(t)).length);

  const nav = $("nav-categorias");
  nav.innerHTML = "";
  activas.forEach(c => {
    const pendientes = tareas.filter(t => t.categoriaId === c.id && !t.hecha).length;
    const fila = el("div", "nav-item-cat");
    const lbl = el("label", "nav-item");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !ocultas.has(c.id);
    cb.onchange = () => {
      if (cb.checked) ocultas.delete(c.id); else ocultas.add(c.id);
      vista = "tareas";
      render();
    };
    const punto = el("span", "punto");
    punto.style.background = colorTono(c.hue, 2, oscuro());
    lbl.append(cb, punto, el("span", "nombre", c.nombre), el("span", "conteo", String(pendientes)));
    fila.append(lbl, menuCategoria(c));
    nav.appendChild(fila);
  });

  const eliminadas = categorias.filter(c => c.eliminada).length;
  $("cnt-papelera").textContent = String(eliminadas);
  $("nav-papelera").classList.toggle("activo", vista === "papelera");
}

function renderSelectCategorias() {
  const sel = $("categoria");
  const previa = sel.value;
  sel.innerHTML = "";
  categoriasActivas().forEach(c => {
    const o = el("option", "", c.nombre);
    o.value = c.id;
    sel.appendChild(o);
  });
  if ([...sel.options].some(o => o.value === previa)) sel.value = previa;
  $("btn-agregar").disabled = sel.options.length === 0;
}

// Botón de tres puntos al lado de cada categoría: cambiar color, cambiar nombre, eliminar
function menuCategoria(c) {
  const wrap = el("div", "cat-acciones");
  const btn = botonIcono(ICONO_PUNTOS, "cat-menu-btn", "Opciones de la categoría");

  const menu = el("div", "menu-flotante cat-menu");
  menu.hidden = true;

  const panelColor = el("div", "menu-panel");
  panelColor.hidden = true;
  panelColor.appendChild(swatches(c.hue, h => updateDoc(refCat(c.id), { hue: h }).catch(alertar)));

  const panelNombre = el("div", "menu-panel");
  panelNombre.hidden = true;
  const nombre = el("input");
  nombre.type = "text";
  nombre.maxLength = 30;
  nombre.value = c.nombre;
  nombre.onchange = () => {
    const v = nombre.value.trim();
    if (!v) { nombre.value = c.nombre; return; }
    updateDoc(refCat(c.id), { nombre: v }).catch(alertar);
  };
  panelNombre.appendChild(nombre);

  const opColor = el("button", "menu-op", "Cambiar color");
  opColor.type = "button";
  opColor.onclick = () => {
    panelColor.hidden = !panelColor.hidden;
    panelNombre.hidden = true;
  };

  const opNombre = el("button", "menu-op", "Cambiar nombre");
  opNombre.type = "button";
  opNombre.onclick = () => {
    panelNombre.hidden = !panelNombre.hidden;
    panelColor.hidden = true;
  };

  const n = tareas.filter(t => t.categoriaId === c.id).length;
  const opEliminar = el("button", "menu-op peligro-txt", "Eliminar");
  opEliminar.type = "button";
  opEliminar.onclick = () => {
    let msg = `¿Mover "${c.nombre}" a la papelera?`;
    if (n) msg += `\nSus ${n} tarea(s) quedarán en la papelera junto con la categoría.`;
    if (confirm(msg)) updateDoc(refCat(c.id), { eliminada: true }).catch(alertar);
  };

  menu.append(opColor, panelColor, opNombre, panelNombre, opEliminar);
  btn.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  wrap.append(btn, menu);
  return wrap;
}

// Fila de una categoría en la papelera (vista Papelera)
function filaPapelera(c) {
  const fila = el("div", "cat-fila");
  fila.appendChild(el("span", "nombre-papelera", c.nombre));

  const restaurar = el("button", "", "Restaurar");
  restaurar.onclick = () => updateDoc(refCat(c.id), { eliminada: false }).catch(alertar);

  const eliminar = el("button", "peligro pequeno", "Eliminar definitivamente");
  eliminar.onclick = () => {
    const n = tareas.filter(t => t.categoriaId === c.id).length;
    let msg = `¿Eliminar definitivamente "${c.nombre}"? No se puede deshacer.`;
    if (n) msg += `\nSus ${n} tarea(s) quedarán sin categoría.`;
    if (confirm(msg)) deleteDoc(refCat(c.id)).catch(alertar);
  };

  fila.append(restaurar, eliminar);
  return fila;
}

function renderFormCategoria() {
  const cont = $("cat-swatches");
  cont.innerHTML = "";
  cont.appendChild(swatches(hueNuevo, h => { hueNuevo = h; renderFormCategoria(); }));
}

// Orden: la más próxima arriba; sin deadline al final
const porDeadline = (a, b) => {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline - b.deadline;
};

function renderVista() {
  const enPapelera = vista === "papelera";
  $("form-tarea").hidden = enPapelera;
  $("barra-orden").hidden = enPapelera;
  const lista = $("lista");
  lista.innerHTML = "";

  if (enPapelera) {
    $("titulo-vista").textContent = "Papelera";
    const eliminadas = categorias.filter(c => c.eliminada).sort(porAntiguedad);
    if (eliminadas.length === 0) {
      lista.appendChild(el("p", "muted vacio", "La papelera está vacía."));
      return;
    }
    const bloque = el("div", "papelera-cats");
    eliminadas.forEach(c => bloque.appendChild(filaPapelera(c)));
    lista.appendChild(bloque);

    const ids = new Set(eliminadas.map(c => c.id));
    const enPapeleraTareas = tareas.filter(t => ids.has(t.categoriaId)).sort(porDeadline);
    if (enPapeleraTareas.length === 0) {
      lista.appendChild(el("p", "muted", "Estas categorías no tienen tareas."));
    }
    enPapeleraTareas.forEach(t => lista.appendChild(crearTarjeta(t)));
    return;
  }

  const activas = categoriasActivas();
  const visibles = activas.filter(c => !ocultas.has(c.id));
  if (visibles.length === activas.length) {
    $("titulo-vista").textContent = "Todas las tareas";
  } else if (visibles.length === 0) {
    $("titulo-vista").textContent = "Ninguna categoría marcada";
  } else {
    $("titulo-vista").textContent = "Categorías seleccionadas";
  }

  const orden = $("orden").value;
  const mostrar = tareas.filter(esVisible).sort(
    orden === "deadline" ? porDeadline : (a, b) => msDe(b.creada) - msDe(a.creada)
  );
  if (mostrar.length === 0) {
    lista.appendChild(el("p", "muted vacio", "No hay tareas para mostrar."));
    return;
  }
  mostrar.forEach(t => lista.appendChild(crearTarjeta(t)));
}

// Iconos SVG en línea (sin emojis)
const ICONO_CALENDARIO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICONO_PUNTOS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';
const ICONO_BASURA ='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';

// Botón que solo muestra un icono SVG
function botonIcono(svg, clase, titulo) {
  const b = el("button", clase);
  b.type = "button";
  b.title = titulo;
  b.innerHTML = svg;
  return b;
}

// Círculo con el tono actual; al hacer clic despliega la gama de colores
function selectorTono(cat, tono, ref) {
  const wrap = el("div", "tono-wrap");
  const btn = el("button", "tono-btn", "*");
  btn.type = "button";
  btn.title = "Tono de la tarea";
  btn.style.background = colorTono(cat.hue, tono, oscuro());

  const menu = el("div", "menu-flotante tono-menu");
  menu.hidden = true;
  for (let i = 0; i < TONOS; i++) {
    const op = el("button", i === tono ? "tono-op actual" : "tono-op");
    op.type = "button";
    op.style.background = colorTono(cat.hue, i, oscuro());
    op.onclick = () => {
      if (i !== tono) updateDoc(ref, { tono: i }).catch(alertar);
    };
    menu.appendChild(op);
  }

  btn.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  wrap.append(btn, menu);
  return wrap;
}

// Calendario: despliega "Cambiar fecha" y, si hay deadline, "Quitar deadline"
function selectorFecha(t, ref) {
  const wrap = el("div", "fecha-wrap");
  const btn = botonIcono(ICONO_CALENDARIO, "cal-btn", "Deadline");

  const menu = el("div", "menu-flotante fecha-menu");
  menu.hidden = true;

  const cambiar = el("label", "menu-op", "Cambiar fecha");
  const inp = el("input", "overlay-fecha");
  inp.type = "datetime-local";
  inp.title = "Deadline (hora de Santiago)";
  inp.value = t.deadline ? aInputSantiago(t.deadline) : "";
  inp.onchange = () => {
    updateDoc(ref, { deadline: inp.value ? santiagoAUTC(inp.value) : null }).catch(alertar);
  };
  cambiar.appendChild(inp);
  menu.appendChild(cambiar);

  if (t.deadline) {
    const quitar = el("button", "menu-op", "Quitar deadline");
    quitar.type = "button";
    quitar.onclick = () => updateDoc(ref, { deadline: null }).catch(alertar);
    menu.appendChild(quitar);
  }

  btn.onclick = e => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  wrap.append(btn, menu);
  return wrap;
}

function crearTarjeta(t) {
  const ref = refTarea(t.id);
  const cat = categorias.find(c => c.id === t.categoriaId);
  const tono = t.tono ?? 0;
  const vencida = !!t.deadline && !t.hecha && t.deadline < new Date();

  const card = el("div", "tarea" + (t.hecha ? " hecha" : "") + (vencida ? " vencida" : ""));
  if (cat) card.style.setProperty("--tarea-bg", colorTono(cat.hue, tono, oscuro()));

  // Encabezado: check, tono, título con categoría debajo, vence y calendario, eliminar
  const top = el("div", "tarea-top");
  const check = el("input");
  check.type = "checkbox";
  check.checked = !!t.hecha;
  check.onchange = () => updateDoc(ref, { hecha: check.checked }).catch(alertar);

  // Fila del nombre: título y, a su derecha, el círculo de tono
  const titulo = el("span", "titulo", t.titulo);
  const filaNombre = el("div", "titulo-fila");
  filaNombre.appendChild(titulo);
  if (cat) filaNombre.appendChild(selectorTono(cat, tono, ref));

  let badgeTexto = "Sin categoría";
  if (cat) badgeTexto = cat.nombre + (cat.eliminada ? " (papelera)" : "");
  const badge = el("span", "categoria" + (cat ? "" : " sin"), badgeTexto);
  const bloqueTitulo = el("div", "titulo-bloque");
  bloqueTitulo.append(filaNombre, badge);

  const txtFecha = t.deadline
    ? (vencida ? "Vencida: " : "Vence: ") + fmtFecha.format(t.deadline) + " hrs"
    : "Sin deadline";
  const fecha = el("div", "fecha-grupo");
  fecha.append(selectorFecha(t, ref), el("span", "vence" + (vencida ? " vencida-txt" : ""), txtFecha));

  const borrar = botonIcono(ICONO_BASURA, "peligro", "Eliminar tarea");
  borrar.onclick = () => {
    if (confirm("¿Eliminar esta tarea?")) deleteDoc(ref).catch(alertar);
  };

  // "Vence" va debajo de la categoría, dentro de la misma columna del título
  bloqueTitulo.appendChild(fecha);
  top.append(check, bloqueTitulo, borrar);
  card.appendChild(top);

  // Anotaciones
  const notas = t.anotaciones || [];
  notas.forEach((a, i) => {
    const fila = el("div", "anotacion");
    fila.appendChild(el("span", "", a.texto));
    const quitar = el("button", "pequeno", "✕");
    quitar.onclick = () => {
      const nuevas = notas.filter((_, j) => j !== i);
      updateDoc(ref, { anotaciones: nuevas }).catch(alertar);
    };
    fila.appendChild(quitar);
    card.appendChild(fila);
  });

  // Agregar anotación
  const form = el("form", "nueva-anotacion");
  const input = el("input");
  input.placeholder = "Agregar anotación";
  input.required = true;
  const btn = el("button", "", "+");
  btn.type = "submit";
  form.append(input, btn);
  form.onsubmit = e => {
    e.preventDefault();
    updateDoc(ref, {
      anotaciones: [...notas, { texto: input.value.trim(), fecha: new Date().toISOString() }]
    }).catch(alertar);
  };
  card.appendChild(form);

  return card;
}

// Aplica el tema guardado en este dispositivo antes de que llegue Firestore
aplicarTema(tema);
