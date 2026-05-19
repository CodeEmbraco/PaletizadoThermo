# Single-tab lock para `/paletization`

**Fecha:** 2026-05-19
**Autor:** Hever Rubio (asistido)
**Estado:** Aprobado para implementar

## Problema

La aplicación de paletización vive en una URL pública (`/paletization`). El operador puede abrir varias pestañas en la misma máquina y eso provoca:

- Pallets abiertos / duplicados en la BD (cada pestaña hace su propio flujo de escaneo).
- Posibilidad de oprimir "Procesar en SAP" desde dos pestañas distintas para el mismo pallet o para pallets distintos en la misma estación.

El backend ya tiene el flag `Pallet.sap_attempted` que evita el doble-procesado del **mismo** pallet, pero no impide que dos pestañas tomen pallets distintos al mismo tiempo en la misma estación.

## Objetivo

Permitir solo **una pestaña activa** de `/paletization` por instancia de browser. Las demás muestran una pantalla bloqueada con un botón "Forzar control aquí" para casos de pestañas huérfanas.

**Fuera de alcance:**
- Bloqueo entre máquinas distintas (eso requeriría lock server-side).
- Bloqueo de `/logs`, `/print-label`, `/signin` (sin cambios).
- Bloqueo cuando el browser está en modo incógnito + ventana normal (`localStorage` por contexto, son lock independientes; se acepta).

## Decisiones de diseño

1. **Pura frontend**, sin cambios en el backend.
2. **Identidad de pestaña** vía `sessionStorage` — sobrevive `F5` pero no `close + reopen`.
3. **Lock global** vía `localStorage` — compartido entre pestañas del mismo origen.
4. **Comunicación en vivo** vía `BroadcastChannel("paletization_lock")` — para hacer "takeover" sin recarga.
5. **Sin heartbeat ni timeouts automáticos.** Si la pestaña dueña muere y la nueva se abre, queda bloqueada hasta que el operador haga clic en "Forzar control aquí". Decisión explícita del usuario: prefiere acción manual a inferir vida automáticamente.

## Arquitectura

### Módulos nuevos

```
src/
  hooks/
    useTabLock.js          ← hook con la lógica del lock
  components/
    TabLockedScreen.jsx    ← pantalla bloqueada con el botón de override
```

### Integración

Punto exacto: `src/pages/PaletizationDashboard.jsx` (el padre que envuelve a `PaletizationView` en `<Layout>`). Al inicio del componente:

```jsx
const { status, forceTakeover } = useTabLock("paletization");
if (status === "blocked") {
  return <TabLockedScreen onForce={forceTakeover} />;
}
return (
  <Layout ...>
    <PaletizationView/>
  </Layout>
);
```

Razones para integrar en `PaletizationDashboard` y no en `PaletizationView`:

- `PaletizationView` registra el listener global `useScanDetection`; al no montarlo cuando la pestaña está bloqueada, evitamos que el scanner físico siga escribiendo en una pestaña inactiva.
- La pantalla `<TabLockedScreen>` ocupa todo el viewport sin el `<Layout>` (sin sidebar / header), reduce ambigüedad visual: el operador ve algo claramente distinto.

El hook se monta en esta vista, no a nivel app, para que el lock aplique solo cuando el operador está en `/paletization`.

### Claves de storage

- `sessionStorage["paletization_tab_id"]` → string UUID generado al primer mount. Identifica esta pestaña.
- `localStorage["paletization_owner"]` → el `tabId` de la pestaña que tiene el control (string), o vacío.

### `BroadcastChannel` — protocolo

Canal: `"paletization_lock"`. Mensajes:

- `{ type: "takeover", newOwner: tabId }` — emitido por la pestaña que acaba de tomar el control. Las demás que escuchan: si `newOwner !== mi tabId` → cambian su estado a `blocked`.

No hay otros mensajes. No hay ping/pong.

## Flujo

### Caso 1: primera pestaña abierta (camino feliz)

1. `useTabLock` se monta.
2. Lee/crea `sessionStorage.paletization_tab_id` = `myTabId`.
3. Lee `localStorage.paletization_owner` → vacío.
4. Escribe `myTabId` en `localStorage.paletization_owner`.
5. Devuelve `status = "owner"`. Renderiza paletización normal.

### Caso 2: F5 (refresh en la misma pestaña)

1. Hook se remonta.
2. `sessionStorage.paletization_tab_id` sobrevive → `myTabId` ya existe.
3. `localStorage.paletization_owner === myTabId` → sigo siendo dueño.
4. `status = "owner"`. Sin fricción.

### Caso 3: segunda pestaña abierta mientras la primera vive

1. Hook se monta. Nueva pestaña, `sessionStorage` vacío → genera `newTabId`.
2. `localStorage.paletization_owner === otherTabId` (≠ `newTabId`).
3. `status = "blocked"`. Se renderiza `<TabLockedScreen>` con botón "Forzar control aquí" y un mensaje.

### Caso 4: el operador hace clic en "Forzar control aquí"

1. `forceTakeover()` escribe `newTabId` en `localStorage.paletization_owner`.
2. Emite por `BroadcastChannel`: `{ type: "takeover", newOwner: newTabId }`.
3. Set local `status = "owner"`. Renderiza paletización normal.
4. La pestaña anterior recibe el mensaje, ve `newOwner !== miTabId` → set local `status = "blocked"`. Se cambia automáticamente a `<TabLockedScreen>` sin recargar.

### Caso 5: la pestaña dueña se cierra (close de pestaña / browser)

- No hacemos nada en `beforeunload`. El `localStorage.paletization_owner` queda con el `tabId` viejo (stale).
- Cuando el operador abra una nueva pestaña, caerá en Caso 3. Hace clic en "Forzar control aquí" → Caso 4.
- Esto es intencional: el usuario prefirió manual sobre heartbeat.

### Caso 6: tres o más pestañas

- Tab 1 = owner. Tab 2 y Tab 3 = blocked.
- Tab 2 hace force → toma owner, broadcast.
- Tab 1 recibe broadcast → blocked. Tab 3 ya estaba blocked y sigue blocked (su tabId tampoco coincide con el nuevo owner). Comportamiento esperado.

## API de `useTabLock`

```js
function useTabLock(scope: string): {
  status: "owner" | "blocked",
  forceTakeover: () => void,
}
```

- `scope` se usa como sufijo en las keys (`paletization_owner_${scope}`, etc.) — preparado para un futuro segundo lock si se necesita, sin acoplarlo a `/paletization` para siempre.
- El hook crea el `BroadcastChannel` en `useEffect` y lo cierra en cleanup.
- Si la API `BroadcastChannel` no existe (browser viejo), se cae gracefully: el lock sigue funcionando vía `localStorage` pero sin el takeover en vivo (la pestaña vieja no se entera, solo se enterará al siguiente reload).

## UI: `TabLockedScreen`

Pantalla centrada, con el mismo look-and-feel que el resto (Tailwind, paleta del proyecto). Contenido:

- Título: **"Paletización en uso en otra pestaña"**
- Subtítulo: "Esta vista solo puede estar abierta en una pestaña a la vez. Cierra la otra pestaña o haz clic abajo si crees que está congelada."
- Botón primario: **"Forzar control aquí"** → llama a `forceTakeover()`.

Sin sidebar, sin header funcional. Es una pantalla muerta hasta que el operador actúe.

## Errores y casos límite

- **`localStorage` deshabilitado** (modo privado restrictivo): el hook detecta el throw y degrada a `status = "owner"` siempre (mejor que romper la app). Se loguea por consola.
- **Apertura simultánea de dos pestañas en una décima de segundo**: ambas leen `localStorage` vacío y ambas se asignan owner. La que escribe segunda gana. La primera no se entera (no escuchaba broadcast aún) hasta que el operador interactúe. Aceptado — caso muy raro en planta.
- **Force button presionado en paralelo en dos pestañas**: última escritura gana, ambas hacen broadcast, ambas se bloquean mutuamente. La pestaña que recibe el último broadcast queda en `blocked`. Operador hace force de nuevo. Aceptado.

## Testing manual

1. Abrir `/paletization` en Tab A → opera normal.
2. Abrir `/paletization` en Tab B → ver pantalla bloqueada.
3. F5 en Tab A → sigue operando normal. Tab B sigue bloqueada.
4. Clic en "Forzar control aquí" en Tab B → Tab B opera; Tab A se bloquea en vivo (sin reload).
5. Cerrar Tab B → abrir Tab C → Tab C se ve bloqueada (porque `localStorage` quedó con el tabId viejo de B). Clic en force → Tab C opera.
6. Abrir `/logs` en una tercera pestaña → carga normal (no afectado).

## Riesgos

- **Operador no entiende el botón "Forzar control aquí"** y crea pestañas en loop. Mitigación: copy claro + capacitación corta.
- **Cierre forzado del browser deja la pestaña dueña stale** → primer reopen siempre verá pantalla bloqueada y tendrá que hacer click. Mitigación: copy del mensaje aclara el escenario.

## Plan de rollback

Quitar el `useTabLock(...)` + render condicional de `TabLockedScreen` en `PaletizationView.jsx` (o donde se integre). El hook y el componente quedan en el repo pero sin uso, listos para reactivar.
