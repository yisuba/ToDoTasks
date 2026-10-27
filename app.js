import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const $ = id => document.getElementById(id);
const tareasRef = () => collection(db, "tareas");
let unsubscribe = null;

// Muestra u oculta pantallas según si hay sesión iniciada
onAuthStateChanged(auth, user => {
  $("pantalla-login").hidden = !!user;
  $("pantalla-app").hidden = !user;
  $("btn-salir").hidden = !user;
  if (user) {
    escucharTareas();
  } else {
    if (unsubscribe) unsubscribe();
    $("lista").innerHTML = "";
  }
});

$("btn-login").onclick = () => signInWithPopup(auth, provider).catch(e => alert(e.message));
$("btn-salir").onclick = () => signOut(auth);

// Crear tarea
$("form-tarea").onsubmit = async e => {
  e.preventDefault();
  await addDoc(tareasRef(), {
    titulo: $("titulo").value.trim(),
    categoria: $("categoria").value,
    hecha: false,
    creada: serverTimestamp(),
    anotaciones: []
  });
  e.target.reset();
};

// Escucha cambios en tiempo real
function escucharTareas() {
  const q = query(tareasRef(), orderBy("creada", "desc"));
  unsubscribe = onSnapshot(q, snap => {
    const lista = $("lista");
    lista.innerHTML = "";
    snap.forEach(d => lista.appendChild(crearTarjeta(d.id, d.data())));
  }, e => alert("Error al leer tareas: " + e.message));
}

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function crearTarjeta(id, t) {
  const ref = doc(db, "tareas", id);
  const card = el("div", "tarea" + (t.hecha ? " hecha" : ""));

  // Encabezado: check, título, categoría, eliminar
  const top = el("div", "tarea-top");
  const check = el("input");
  check.type = "checkbox";
  check.checked = !!t.hecha;
  check.onchange = () => updateDoc(ref, { hecha: check.checked });

  const titulo = el("span", "titulo", t.titulo);
  const cat = el("span", "categoria", t.categoria);

  const borrar = el("button", "peligro", "🗑");
  borrar.onclick = () => {
    if (confirm("¿Eliminar esta tarea?")) deleteDoc(ref);
  };

  top.append(check, titulo, cat, borrar);
  card.appendChild(top);

  // Anotaciones
  const notas = t.anotaciones || [];
  notas.forEach((a, i) => {
    const fila = el("div", "anotacion");
    fila.appendChild(el("span", "", a.texto));
    const quitar = el("button", "pequeno", "✕");
    quitar.onclick = () => {
      const nuevas = notas.filter((_, j) => j !== i);
      updateDoc(ref, { anotaciones: nuevas });
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
      anotaciones: arrayUnion({ texto: input.value.trim(), fecha: new Date().toISOString() })
    });
  };
  card.appendChild(form);

  return card;
}
