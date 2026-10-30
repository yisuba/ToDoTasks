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
    ? `hsl(${hue} 30% ${18 + tono * 3.5}%)`
    : `hsl(${hue} 60% ${94 - tono * 5}%)`;
}

// Cierra los menús de tono al hacer clic fuera de ellos
document.addEventListener("click", () => {
  document.querySelectorAll(".tono-menu").forEach(m => { m.hidden = true; });
});

// ---------- Fechas (siempre hora de Santiago) ----------
const fmtFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
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
$("btn-modificar-cat").onclick = () => $("dlg-modificar").showModal();
$("btn-cerrar-mod").onclick = () => $("dlg-modificar").close();

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
  renderCategorias();
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
    nav.appendChild(lbl);
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

// Lista de categorías dentro de "Modificar categorías"
function renderCategorias() {
  const cont = $("lista-categorias");
  cont.innerHTML = "";
  categoriasActivas().forEach(c => cont.appendChild(filaCategoria(c)));
}

function filaCategoria(c) {
  const fila = el("div", "cat-fila");

  const nombre = el("input");
  nombre.type = "text";
  nombre.maxLength = 30;
  nombre.value = c.nombre;
  nombre.onchange = () => {
    const v = nombre.value.trim();
    if (!v) { nombre.value = c.nombre; return; }
    updateDoc(refCat(c.id), { nombre: v }).catch(alertar);
  };

  const sw = swatches(c.hue, h => updateDoc(refCat(c.id), { hue: h }).catch(alertar));

  const n = tareas.filter(t => t.categoriaId === c.id).length;
  const borrar = el("button", "peligro pequeno", "🗑");
  borrar.title = "Mover a la papelera";
  borrar.onclick = () => {
    let msg = `¿Mover "${c.nombre}" a la papelera?`;
    if (n) msg += `\nSus ${n} tarea(s) quedarán en la papelera junto con la categoría.`;
    if (confirm(msg)) updateDoc(refCat(c.id), { eliminada: true }).catch(alertar);
  };

  fila.append(nombre, sw, borrar);
  return fila;
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

function crearTarjeta(t) {
  const ref = refTarea(t.id);
  const cat = categorias.find(c => c.id === t.categoriaId);
  const tono = t.tono ?? 0;
  const vencida = !!t.deadline && !t.hecha && t.deadline < new Date();

  const card = el("div", "tarea" + (t.hecha ? " hecha" : "") + (vencida ? " vencida" : ""));
  if (cat) card.style.setProperty("--tarea-bg", colorTono(cat.hue, tono, oscuro()));

  // Encabezado: check, título, categoría, eliminar
  const top = el("div", "tarea-top");
  const check = el("input");
  check.type = "checkbox";
  check.checked = !!t.hecha;
  check.onchange = () => updateDoc(ref, { hecha: check.checked }).catch(alertar);

  const titulo = el("span", "titulo", t.titulo);

  let badgeTexto = "Sin categoría";
  if (cat) badgeTexto = cat.nombre + (cat.eliminada ? " (papelera)" : "");
  const badge = el("span", "categoria" + (cat ? "" : " sin"), badgeTexto);

  const borrar = el("button", "peligro", "🗑");
  borrar.onclick = () => {
    if (confirm("¿Eliminar esta tarea?")) deleteDoc(ref).catch(alertar);
  };

  top.append(check, titulo, badge, borrar);
  card.appendChild(top);

  // Deadline y tono
  const meta = el("div", "meta");
  if (t.deadline) {
    const txt = (vencida ? "Vencida: " : "Vence: ") + fmtFecha.format(t.deadline);
    meta.appendChild(el("span", vencida ? "vencida-txt" : "", txt));
  } else {
    meta.appendChild(el("span", "", "Sin deadline"));
  }

  const inpFecha = el("input");
  inpFecha.type = "datetime-local";
  inpFecha.title = "Deadline (hora de Santiago)";
  inpFecha.value = t.deadline ? aInputSantiago(t.deadline) : "";
  inpFecha.onchange = () => {
    updateDoc(ref, { deadline: inpFecha.value ? santiagoAUTC(inpFecha.value) : null }).catch(alertar);
  };
  meta.appendChild(inpFecha);

  if (t.deadline) {
    const quitarFecha = el("button", "pequeno", "✕");
    quitarFecha.title = "Quitar deadline";
    quitarFecha.onclick = () => updateDoc(ref, { deadline: null }).catch(alertar);
    meta.appendChild(quitarFecha);
  }

  if (cat) {
    // Círculo con el tono actual; al hacer clic despliega la gama de colores
    const wrap = el("div", "tono-wrap");
    const btn = el("button", "tono-btn");
    btn.type = "button";
    btn.title = "Tono de la tarea";
    btn.style.background = colorTono(cat.hue, tono, oscuro());

    const menu = el("div", "tono-menu");
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
    meta.appendChild(wrap);
  }
  card.appendChild(meta);

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
