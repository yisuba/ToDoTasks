# ToDoTasks: contexto para Claude

App de tareas personal (universidad, personal, proyectos) con anotaciones, categorías editables, modo oscuro y deadlines en hora de Santiago. Se publica con GitHub Pages y usa Firebase (Authentication con Google y Firestore).

Este archivo es el contexto de trabajo: mantenerlo al día cuando cambie algo importante. El tutorial para replicar el proyecto está en `GUIA-CONFIGURACION.md`.

## Preferencias de trabajo

- Si pido enumerar cambios para evaluar si entendiste, enuméralos y espera mi confirmación antes de tocar archivos.
- Después de cada implementación pedida, responde en este orden:
  1. Lo que entendiste, resumido.
  2. Preguntas o propuestas, solo si hay ambigüedad.
  3. Al final, siempre: **¿QUIERES QUE HAGA COMMIT Y PUSH A MAIN?**
- No hagas commit ni push a `main` sin una respuesta afirmativa a **¿QUIERES QUE HAGA COMMIT Y PUSH A MAIN?**
- Antes de pedir permiso de borrado en una carpeta, pregunta: **¿QUIERES QUE PIDA PERMISO DE BORRADO EN LA CARPETA?** El borrado es permanente, sin papelera.
- Los commits no llevan línea de coautoría de Claude ni línea `Claude-Session`.
- Responde siempre en español, incluido el texto visible de la interfaz.

## Archivos

- `index.html`: estructura. Cabecera con el título (clicable) y el botón ☰; layout con barra lateral (`aside.barra`) y contenido principal (`main`); dos `<dialog>`: `dlg-crear` (nueva categoría) y `dlg-modificar` (editar categorías). Incluye un pequeño script en `<head>` que aplica el tema guardado antes de pintar.
- `app.js`: toda la lógica (Firebase, render, filtro por categoría, migración). Módulo ES cargado desde `index.html`.
- `style.css`: estilos. Colores en variables CSS en `:root` (oscuro) y `[data-tema="claro"]`. Bajo 700 px, la barra lateral pasa arriba en horizontal.
- No hay build, ni npm, ni dependencias locales. Firebase se carga desde gstatic.com.

## Modelo de datos (Firestore)

Todo lo del usuario vive bajo `usuarios/{uid}`:

- `usuarios/{uid}/categorias/{id}`
  - `nombre` (string, máx. 30)
  - `hue` (número, uno de `HUES` en app.js: 215, 150, 335, 265, 25, 50, 190, 165)
  - `eliminada` (bool). Las categorías en papelera tienen `true`.
  - `creada` (timestamp)
- `usuarios/{uid}/tareas/{id}`
  - `titulo` (string), `categoriaId` (id de categoría), `tono` (0 a 7, índice en `TONOS`), `hecha` (bool)
  - `creada` (timestamp), `deadline` (timestamp o null)
  - `anotaciones` (array de `{ texto, fecha }`)
- `usuarios/{uid}/ajustes/prefs`
  - `tema` ("oscuro" o "claro"), `migrado` (bool)
- `tareas` (raíz): datos de la versión 1. Solo los lee `migrar()` y nunca se escriben. Se pueden borrar desde la consola una vez verificada la migración.

Reglas de Firestore (publicadas en la consola, no están en el repo): solo el correo del dueño puede acceder, y dentro de `usuarios/{uid}` solo el propio `uid`. Si cambias rutas, actualiza las reglas en la consola; si no, la app recibe "Missing or insufficient permissions".

## Decisiones tomadas

- **Modo oscuro por defecto.** El tema se elige en el desplegable "Configuración > Tema: Oscuro / Claro". Se guarda en `ajustes/prefs` (sincroniza entre dispositivos) y en `localStorage` como copia para el primer pintado.
- **Barra lateral:** casilla "Todas las tareas" (marca o desmarca todas); sección **Categorías** desplegable con "+ Crear categoría" arriba, una casilla por categoría (con punto de color y conteo de pendientes) y "✎ Modificar categorías" al final; "Papelera" (cambia la vista principal); y sección **Configuración** desplegable con el selector de tema. Todas las casillas empiezan marcadas. Las categorías desmarcadas se guardan en `ocultas` (Set en memoria), así que no persisten entre recargas. Destacadas se eliminó por no tener función. No hay botón de cerrar sesión por ahora.
- **Título clicable:** vuelve a "Todas las tareas" con todas las categorías marcadas y sale de la papelera.
- **Menú ☰:** muestra u oculta la barra lateral. En computador empieza abierto; en celular (700 px o menos) empieza cerrado y se abre como panel encima del contenido, y se cierra al tocar fuera. No se guarda entre recargas.
- **Vista Papelera:** muestra las categorías en papelera (Restaurar / Eliminar definitivamente) y solo las tareas de esas categorías. Oculta el formulario de nueva tarea y la fila de orden.
- **Categorías por usuario, editables.** Las tareas guardan el id de categoría, así que renombrar no rompe nada. Borrar manda la categoría a la papelera (`eliminada: true`) tras confirmar. Las tareas de una categoría en papelera no aparecen en la vista normal. Al eliminar definitivamente, sus tareas quedan "Sin categoría" y se muestran en la vista normal.
- **Tonos por tarea.** Cada tarea elige uno de 8 tonos dentro del matiz de su categoría. En la tarjeta se ve un círculo (`button.tono-btn`) con el tono actual; al hacer clic despliega una cuadrícula de 4 columnas (`.tono-menu`) solo con colores, sin números. Los colores se generan con HSL: claro usa luminosidad 94 a 59 con saturación 60; oscuro usa 18 a 42.5 con saturación 30. Cambiar el matiz de la categoría actualiza todas sus tareas.
- **Deadline opcional, en hora de Santiago.** Se guarda como timestamp (instante UTC). Al ingresar, se convierte la hora de Santiago con `Intl` (`santiagoAUTC`). Se muestra como "Vence: sáb 7 nov, 18:00", sin sufijo. Las vencidas y no hechas tienen borde rojo.
- **Orden predeterminado: deadline próximo primero** (dentro de cada lista, la más próxima arriba; sin deadline al final). La otra opción es "Más recientes". La fila "Ordenar por" va alineada a la izquierda, debajo de una línea separadora.
- **Migración:** `migrar()` copia las tareas de la raíz a la estructura nueva una sola vez (controlada por `migrado`).

## Convenciones

- Textos de interfaz en español.
- Nunca insertar datos del usuario con `innerHTML`: usar `el()` con `textContent`.
- Los errores de Firestore se muestran con `alertar`.

## Pendientes y limitaciones conocidas

- No hay pruebas automatizadas; la verificación es manual en el celular y el computador.
- Si la migración se ejecuta en dos dispositivos al mismo tiempo, podría duplicar tareas. Para un uso personal, es un riesgo bajo.
- Las tareas no tienen papelera: eliminarlas es definitivo (solo las categorías tienen papelera).
- Sin cerrar sesión por ahora: la sesión queda iniciada en el navegador.
- Sin notificaciones de deadlines (requeriría PWA y permisos).
- Las anotaciones se guardan reescribiendo el array completo. Con un solo usuario no hay problema, pero dos dispositivos editando la misma tarea a la vez podrían pisarse.
- La restricción de la clave de Google Cloud (Paso 5 de la guía) y la alerta de secret scanning en GitHub son pasos manuales que pueden seguir pendientes.
