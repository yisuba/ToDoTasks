# ToDoTasks: contexto para Claude

App de tareas personal (universidad, personal, proyectos) con anotaciones, categorías editables, modo oscuro y deadlines en hora de Santiago. Se publica con GitHub Pages y usa Firebase (Authentication con Google y Firestore).

Este archivo es el contexto de trabajo: mantenerlo al día cuando cambie algo importante. El tutorial para replicar el proyecto está en `GUIA-CONFIGURACION.md`.

## Archivos

- `index.html`: estructura. Cabecera con el botón de tema; layout con barra lateral (`aside.barra`) y contenido principal (`main`); dos `<dialog>`: `dlg-crear` (nueva categoría) y `dlg-modificar` (editar categorías y papelera). Incluye un pequeño script en `<head>` que aplica el tema guardado antes de pintar.
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
  - `titulo` (string), `categoriaId` (id de categoría), `tono` (0 a 4), `hecha` (bool)
  - `creada` (timestamp), `deadline` (timestamp o null)
  - `anotaciones` (array de `{ texto, fecha }`)
- `usuarios/{uid}/ajustes/prefs`
  - `tema` ("oscuro" o "claro"), `migrado` (bool)
- `tareas` (raíz): datos de la versión 1. Solo los lee `migrar()` y nunca se escriben. Se pueden borrar desde la consola una vez verificada la migración.

Reglas de Firestore (publicadas en la consola, no están en el repo): solo el correo del dueño puede acceder, y dentro de `usuarios/{uid}` solo el propio `uid`. Si cambias rutas, actualiza las reglas en la consola; si no, la app recibe "Missing or insufficient permissions".

## Decisiones tomadas

- **Modo oscuro por defecto.** Botón ☀️/🌙 arriba a la derecha. El tema se guarda en `ajustes/prefs` (sincroniza entre dispositivos) y en `localStorage` como copia para el primer pintado.
- **Barra lateral** (estilo Google Tareas): casilla "Todas las tareas" (marca o desmarca todas), una casilla por categoría con punto de color y conteo de pendientes, botones "Crear categoría" (abre `dlg-crear`) y "Modificar categorías" (abre `dlg-modificar`), y al final "Papelera" (cambia la vista principal). Todas las casillas empiezan marcadas. Las categorías desmarcadas se guardan en `ocultas` (Set en memoria): sus tareas no se muestran. Destacadas se eliminó por no tener función. El botón de cerrar sesión se quitó por ahora.
- **Vista Papelera:** muestra las categorías en papelera (Restaurar / Eliminar definitivamente) y solo las tareas de esas categorías. Oculta el formulario de nueva tarea.
- **Categorías por usuario, editables.** Las tareas guardan el id de categoría, así que renombrar no rompe nada. Borrar manda la categoría a la papelera (`eliminada: true`) tras confirmar. Las tareas de una categoría en papelera no aparecen en la vista normal. Al eliminar definitivamente, sus tareas quedan "Sin categoría" y se muestran en la vista normal.
- **Tonos por tarea.** Cada tarea elige uno de 5 tonos desde un menú desplegable (`select.tono-select`) dentro del matiz de su categoría. Los colores se generan con HSL: claro usa luminosidad 90 a 70 con saturación 60; oscuro usa 24 a 36 con saturación 30. Cambiar el matiz de la categoría actualiza todas sus tareas.
- **Deadline opcional, en hora de Santiago.** Se guarda como timestamp (instante UTC). Al ingresar, se convierte la hora de Santiago con `Intl` (`santiagoAUTC`). Se muestra como "Vence: sáb 7 nov, 18:00", sin sufijo. Las vencidas y no hechas tienen borde rojo.
- **Orden predeterminado: deadline próximo primero** (dentro de cada lista, la más próxima arriba; sin deadline al final). La otra opción es "Más recientes".
- **Migración:** `migrar()` copia las tareas de la raíz a la estructura nueva una sola vez (controlada por `migrado`).

## Convenciones

- Textos de interfaz en español.
- Nunca insertar datos del usuario con `innerHTML`: usar `el()` con `textContent`.
- Los errores de Firestore se muestran con `alertar`.
- No hacer commit ni push sin que lo pida el usuario. Los cambios se publican desde GitHub Desktop.
- Después de cada implementación pedida, responder en este orden: (1) lo entendido, resumido; (2) preguntas o propuestas, solo si hay ambigüedad; (3) al final: ¿QUIERES QUE HAGA COMMIT Y PUSH A MAIN? Antes de pedir permiso de borrado en la carpeta: ¿QUIERES QUE PIDA PERMISO DE BORRADO EN LA CARPETA? Ver `claude/preferencias-de-trabajo.md` en el proyecto de Claude.

## Pendientes y limitaciones conocidas

- No hay pruebas automatizadas; la verificación es manual en el celular y el computador.
- Si la migración se ejecuta en dos dispositivos al mismo tiempo, podría duplicar tareas. Para un uso personal, es un riesgo bajo.
- Las tareas no tienen papelera: eliminarlas es definitivo (solo las categorías tienen papelera).
- Sin cerrar sesión por ahora: la sesión queda iniciada en el navegador.
- Sin notificaciones de deadlines (requeriría PWA y permisos).
- Las anotaciones se guardan reescribiendo el array completo. Con un solo usuario no hay problema, pero dos dispositivos editando la misma tarea a la vez podrían pisarse.
- La restricción de la clave de Google Cloud (Paso 5 de la guía) y la alerta de secret scanning en GitHub son pasos manuales que pueden seguir pendientes.
