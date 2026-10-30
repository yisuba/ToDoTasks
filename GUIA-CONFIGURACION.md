# Guía: crear una app de tareas con Firebase y GitHub Pages (gratis)

Esta guía explica cómo publicar una aplicación web con inicio de sesión con Google, datos privados en la nube y código alojado gratis en GitHub Pages. Sirve para replicar el proyecto ToDoTasks o para adaptar el mismo esquema a otra app.

Reemplaza en todo el documento:
- `TU_USUARIO`: tu usuario de GitHub.
- `TU_CORREO@gmail.com`: el correo de Google con el que entras.
- `TU-PROYECTO`: el ID del proyecto de Firebase (aparece en la consola).

## Qué es público y qué es privado

- **Público:** el código y la configuración de Firebase dentro de `app.js`. Cualquiera puede verlos.
- **Privado:** tus datos, guardados en Firestore. Solo puede leerlos o escribirlos la cuenta indicada en las reglas.
- La configuración de Firebase no es un secreto. La protección real está en las reglas de Firestore y en las restricciones de la clave.

## Arquitectura

```
Código (index.html, app.js, style.css) → repo público en GitHub → GitHub Pages
Inicio de sesión                       → Firebase Authentication (Google)
Datos (tareas, categorías, ajustes)    → Firestore (plan Spark, gratis)
```

Cuentas necesarias: GitHub y Google (sirve también para Firebase). Nada de esto requiere pagar.

## Paso 1: repositorios en GitHub

1. Crea el repo `TU_USUARIO.github.io` (público). Se publica en `https://TU_USUARIO.github.io`. No necesita contenido para esta app.
2. Crea el repo `ToDoTasks` (público), sin README, sin .gitignore y sin licencia.
3. Clónalo en tu computador con GitHub Desktop.

Todo lo que subas a un repo público es visible. Por eso los datos personales NO se guardan en GitHub.

## Paso 2: proyecto en Firebase

1. Entra a console.firebase.google.com y crea un proyecto. Puedes desactivar Google Analytics.
2. **Authentication > Get started > Sign-in method**: activa **Google**, escribe un nombre público del proyecto y un correo de asistencia, y guarda.
3. **Firestore Database > Create database**: elige **modo producción** y una ubicación cercana (por ejemplo, southamerica-west1 en Santiago).
4. **Firestore > pestaña Rules**: pega las reglas de abajo, reemplazando el correo, y publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function esMio() {
      return request.auth != null
        && request.auth.token.email == "TU_CORREO@gmail.com";
    }
    match /usuarios/{uid}/{document=**} {
      allow read, write: if esMio() && request.auth.uid == uid;
    }
  }
}
```

5. **Authentication > Settings > Authorized domains > Add domain**: agrega `TU_USUARIO.github.io`.
6. Engranaje > **Tus apps** > ícono **</>** (web). Ponle un alias. **No marques Firebase Hosting** (publicamos con GitHub Pages). Registra la app y copia los valores de `firebaseConfig`.

No necesitas instalar nada con npm: los módulos de Firebase se cargan desde una URL.

## Paso 3: archivos de la app

El código completo está en este repositorio:

- `index.html`: estructura de la página (barra superior, pantalla de inicio de sesión, formulario y lista).
- `app.js`: lógica. Reemplaza los valores de `firebaseConfig` por los de tu proyecto.
- `style.css`: estilos. Los colores son variables en `:root`, así que cambiar el tema es editar pocos valores.

Ideas clave de `app.js`:

- `onAuthStateChanged` muestra el login o la app según haya sesión.
- Con sesión, `onSnapshot` escucha los cambios en tiempo real. Por eso la lista se actualiza sola en todos los dispositivos.
- Crear, editar o borrar son `addDoc`, `updateDoc` y `deleteDoc`.
- Las tarjetas se crean con `document.createElement` y `textContent`, para no insertar HTML que venga del usuario.

Para una versión mínima, basta con: login, una colección de tareas con `titulo` y `hecha`, y listado con `onSnapshot`.

## Paso 4: publicar

1. Copia los archivos a la carpeta del repo clonado.
2. En GitHub Desktop: escribe un mensaje de commit, haz clic en **Commit to main** y luego en **Push origin**.
3. En GitHub, en el repo `ToDoTasks`: **Settings > Pages**, en *Source* elige **Deploy from a branch**, rama **main**, carpeta **/ (root)**, y guarda.
4. Espera un minuto y abre `https://TU_USUARIO.github.io/ToDoTasks`.

## Paso 5: restringir la clave de Google Cloud (recomendado)

GitHub detectará la `apiKey` como "Google API Key" y mostrará una alerta. Es normal: la clave de Firebase es pública por diseño, pero conviene restringirla.

1. Ve a console.cloud.google.com, selecciona el proyecto y entra a **APIs y servicios > Credenciales**.
2. Abre la clave de navegador de Firebase (suele llamarse "Browser key (auto created by Firebase)").
3. **Restricciones de aplicación > Referentes HTTP**, agrega:
   - `https://TU_USUARIO.github.io/*`
   - `https://TU-PROYECTO.firebaseapp.com/*` (obligatorio: el inicio de sesión pasa por esta página)
   - `http://localhost/*` (opcional, para probar en tu computador)
4. **Restricciones de API > Restringir clave**: marca solo **Identity Toolkit API**, **Token Service API** y **Cloud Firestore API**.
5. Guarda y espera unos minutos.
6. En GitHub, cierra la alerta en **Security > Secret scanning** indicando que es una clave pública de Firebase.

Borrar la clave del código no sirve, porque queda en el historial de commits.

## Paso 6: probar

1. Abre la app y haz clic en **Entrar con Google** una sola vez.
2. Agrega una tarea, márcala como hecha, agrega una anotación y elimina una tarea.
3. Abre la misma URL desde el celular con la misma cuenta: los cambios deben aparecer.

## Si partes de una versión anterior con datos

Si ya tenías datos en una colección de la raíz (por ejemplo, `tareas`), `app.js` incluye una función `migrar()` que los copia a `usuarios/{uid}` una sola vez. Las reglas deben permitir leer esa colección antigua durante la migración. Cuando verifiques que todo está bien, borra la colección antigua desde la consola.

## Solución de problemas

- **`auth/cancelled-popup-request`**: hiciste clic varias veces en el botón de login. Haz clic una sola vez.
- **"The requested action is invalid" en `firebaseapp.com/__/auth/handler`**: falta el dominio `TU-PROYECTO.firebaseapp.com` en las restricciones de referentes de la clave (Paso 5).
- **Error de inicio de sesión desde tu sitio**: revisa que `TU_USUARIO.github.io` esté en *Authorized domains* (Paso 2, punto 5).
- **"Missing or insufficient permissions"**: las reglas de Firestore no coinciden con las rutas del código, o el correo de las reglas no es el de tu cuenta.
- **No se ven las tareas**: revisa que las reglas estén publicadas con tu correo exacto.
- **La página no se actualiza**: espera un par de minutos tras el push o recarga sin caché (Ctrl+F5).
- **Un navegador o extensión bloquea la ventana de login**: prueba en incógnito con las extensiones desactivadas.

## Ideas para seguir

- Fechas límite, categorías editables y modo oscuro.
- Para compartir con otra persona: sus datos deben vivir en su propia ruta `usuarios/{uid}` y no en las tuyas.
- Blog: usar el repo `TU_USUARIO.github.io`, que se publica en la raíz de tu dirección.
