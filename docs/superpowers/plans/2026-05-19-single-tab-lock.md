# Single-tab lock para `/paletization` — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que el operador abra `/paletization` en más de una pestaña a la vez en la misma máquina, con recuperación manual ("Forzar control aquí") para pestañas huérfanas.

**Architecture:** Hook React `useTabLock` que mantiene un lock en `localStorage` (compartido entre pestañas) e identifica la pestaña actual con `sessionStorage` (sobrevive F5, no close+reopen). `BroadcastChannel` se usa solo para "takeover en vivo" cuando una pestaña fuerza control. Sin heartbeat, sin cambios de backend. Integración a nivel de `PaletizationDashboard` para que la vista bloqueada no monte `useScanDetection`.

**Tech Stack:** React 18, hooks, Web APIs (`localStorage`, `sessionStorage`, `BroadcastChannel`). Sin tests automatizados — el proyecto no tiene framework de testing instalado; verificación es manual en browser vía `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-05-19-single-tab-lock-design.md`

---

## File Structure

**Archivos nuevos:**
- `src/hooks/useTabLock.js` — Hook que devuelve `{ status, forceTakeover }`. Único módulo con conocimiento de `localStorage`/`sessionStorage`/`BroadcastChannel`.
- `src/components/TabLockedScreen.jsx` — Pantalla full-viewport con el botón de force. Sin acoplamiento al hook (recibe `onForce` por prop).

**Archivos modificados:**
- `src/pages/PaletizationDashboard.jsx` — Integración: usa el hook; si `status==="blocked"` renderiza `<TabLockedScreen>` en lugar de `<Layout><PaletizationView/></Layout>`.

**Sin cambios:**
- `src/pages/PaletizationView.jsx` (no lo tocamos — su `useScanDetection` simplemente no se monta cuando la pestaña está bloqueada porque el padre no lo renderiza).
- Backend (`PaletizationAPI`).

---

## Task 1: Crear el hook `useTabLock`

**Files:**
- Create: `src/hooks/useTabLock.js`

- [ ] **Step 1: Crear el directorio `src/hooks/` si no existe**

```bash
mkdir -p /Users/heverrubio/nidec/PaletizadoThermo/src/hooks
```

- [ ] **Step 2: Crear el archivo `src/hooks/useTabLock.js`**

Contenido completo:

```js
import { useEffect, useRef, useState, useCallback } from "react";

function safeGetItem(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function generateTabId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lock por pestaña (misma máquina, mismo browser) para evitar que el operador
 * abra la misma vista en varias pestañas a la vez.
 *
 * @param {string} scope - sufijo para las keys (permite múltiples locks distintos).
 * @returns {{ status: "owner" | "blocked", forceTakeover: () => void }}
 */
export function useTabLock(scope) {
  const ownerKey = `paletization_owner_${scope}`;
  const tabIdKey = `paletization_tab_id_${scope}`;
  const channelName = `paletization_lock_${scope}`;

  const tabIdRef = useRef(null);
  const channelRef = useRef(null);
  const [status, setStatus] = useState("owner");

  // Inicialización del lock: corre una sola vez al montar.
  useEffect(() => {
    let tabId = safeGetItem(sessionStorage, tabIdKey);
    if (!tabId) {
      tabId = generateTabId();
      safeSetItem(sessionStorage, tabIdKey, tabId);
    }
    tabIdRef.current = tabId;

    const currentOwner = safeGetItem(localStorage, ownerKey);
    if (!currentOwner || currentOwner === tabId) {
      safeSetItem(localStorage, ownerKey, tabId);
      setStatus("owner");
    } else {
      setStatus("blocked");
    }

    // BroadcastChannel: escuchar takeovers de otras pestañas (cuando alguien hace
    // force takeover, esta pestaña se entera y se bloquea sin recargar).
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const channel = new BroadcastChannel(channelName);
        channel.onmessage = (event) => {
          const data = event.data;
          if (
            data &&
            data.type === "takeover" &&
            data.newOwner &&
            data.newOwner !== tabIdRef.current
          ) {
            setStatus("blocked");
          }
        };
        channelRef.current = channel;
      } catch {
        channelRef.current = null;
      }
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [ownerKey, tabIdKey, channelName]);

  const forceTakeover = useCallback(() => {
    const tabId = tabIdRef.current;
    if (!tabId) return;
    safeSetItem(localStorage, ownerKey, tabId);
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: "takeover", newOwner: tabId });
      } catch {
        /* ignore */
      }
    }
    setStatus("owner");
  }, [ownerKey]);

  return { status, forceTakeover };
}
```

- [ ] **Step 3: Verificar que no haya errores de lint/build**

Run:
```bash
cd /Users/heverrubio/nidec/PaletizadoThermo && npm run lint 2>&1 | tail -20
```

Esperado: sin errores en `src/hooks/useTabLock.js`. Si hay warnings preexistentes en otros archivos, ignorar.

- [ ] **Step 4: Commit**

```bash
cd /Users/heverrubio/nidec/PaletizadoThermo
git add src/hooks/useTabLock.js
git commit -m "$(cat <<'EOF'
feat: hook useTabLock para single-tab lock

Lock por pestaña basado en localStorage (compartido) + sessionStorage
(identidad por pestaña, sobrevive F5). BroadcastChannel opcional para
takeover en vivo. Sin heartbeat: recuperación es manual vía
forceTakeover.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Crear el componente `TabLockedScreen`

**Files:**
- Create: `src/components/TabLockedScreen.jsx`

- [ ] **Step 1: Crear el archivo `src/components/TabLockedScreen.jsx`**

Contenido completo:

```jsx
import React from "react";

/**
 * Pantalla full-viewport que se muestra cuando esta pestaña no tiene el lock
 * de paletización. El operador puede tomar control con "Forzar control aquí".
 */
function TabLockedScreen({ onForce }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100">
      <div className="max-w-lg mx-4 bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-yellow-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">
          Paletización en uso en otra pestaña
        </h1>
        <p className="text-slate-600 mb-6">
          Esta vista solo puede estar abierta en una pestaña a la vez. Cierra
          la otra pestaña o haz clic abajo si crees que está congelada o quedó
          abierta de una sesión anterior.
        </p>
        <button
          type="button"
          onClick={onForce}
          className="w-full h-12 bg-primary rounded text-white text-base font-medium hover:bg-green-500"
        >
          Forzar control aquí
        </button>
      </div>
    </div>
  );
}

export default TabLockedScreen;
```

- [ ] **Step 2: Verificar lint**

Run:
```bash
cd /Users/heverrubio/nidec/PaletizadoThermo && npm run lint 2>&1 | tail -20
```

Esperado: sin errores en `src/components/TabLockedScreen.jsx`.

- [ ] **Step 3: Commit**

```bash
cd /Users/heverrubio/nidec/PaletizadoThermo
git add src/components/TabLockedScreen.jsx
git commit -m "$(cat <<'EOF'
feat: TabLockedScreen para pestañas bloqueadas

Pantalla full-viewport con botón "Forzar control aquí". Sin sidebar
ni header del Layout para que el operador vea claramente que la
pestaña no está activa.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Integrar el hook en `PaletizationDashboard`

**Files:**
- Modify: `src/pages/PaletizationDashboard.jsx`

- [ ] **Step 1: Leer el estado actual del archivo**

Run:
```bash
cat /Users/heverrubio/nidec/PaletizadoThermo/src/pages/PaletizationDashboard.jsx
```

Esperado: el archivo tiene 28 líneas y exporta `PalatizationDashboard` (sí, con typo en el nombre — no lo corregir aquí).

- [ ] **Step 2: Reemplazar el contenido del archivo**

Reemplazar `src/pages/PaletizationDashboard.jsx` con:

```jsx
import icons from "../assets/icons/icons";
import Layout from "../components/Layout";

import PaletizationView from "./PaletizationView";
import TabLockedScreen from "../components/TabLockedScreen";
import { useTabLock } from "../hooks/useTabLock";

function PalatizationDashboard() {
  const { status, forceTakeover } = useTabLock("paletization");

  if (status === "blocked") {
    return <TabLockedScreen onForce={forceTakeover} />;
  }

  return (
    <Layout
      icon={icons.dashboardIcon}
      nameRoute={"Dashboard"}
      nameSubRoute={"Dashboard"}
    >
      <PaletizationView />
    </Layout>
  );
}

export default PalatizationDashboard;
```

Notas:
- Se quitó el `import { useEffect } from "react"` que estaba sin uso (un comentario muerto del original).
- Se mantiene el typo `PalatizationDashboard` para no romper el import en `App.jsx`.

- [ ] **Step 3: Verificar que App.jsx siga funcionando**

Run:
```bash
grep -n "PalatizationDashboard\|PaletizationDashboard" /Users/heverrubio/nidec/PaletizadoThermo/src/App.jsx
```

Esperado: una línea con `import PalatizationDashboard from "./pages/PaletizationDashboard"` y una con `<PalatizationDashboard />`. Si los nombres coinciden con lo que dejamos en Step 2, no se necesita más cambio.

- [ ] **Step 4: Lint**

Run:
```bash
cd /Users/heverrubio/nidec/PaletizadoThermo && npm run lint 2>&1 | tail -20
```

Esperado: sin nuevos errores.

- [ ] **Step 5: Commit**

```bash
cd /Users/heverrubio/nidec/PaletizadoThermo
git add src/pages/PaletizationDashboard.jsx
git commit -m "$(cat <<'EOF'
feat: aplicar useTabLock a /paletization

Cuando la pestaña no tiene el lock, renderiza TabLockedScreen en
lugar de Layout+PaletizationView. Eso evita que useScanDetection
se monte en pestañas inactivas, así el lector de barcode no
escribe en una pestaña que el operador no ve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verificación manual en browser

**Files:** (sin cambios — solo ejecución y verificación)

- [ ] **Step 1: Levantar el dev server**

Run en una terminal aparte:
```bash
cd /Users/heverrubio/nidec/PaletizadoThermo && npm run dev
```

Esperado: Vite arranca y muestra una URL local (típicamente `http://localhost:5173`).

- [ ] **Step 2: Caso 1 — primera pestaña abierta**

Abrir `http://localhost:5173/paletization` en una pestaña nueva del browser.

Verificar:
- Se renderiza la vista normal de paletización (con sidebar/header).
- En DevTools → Application → Local Storage, existe la key `paletization_owner_paletization` con un UUID.
- En Session Storage, existe `paletization_tab_id_paletization` con el mismo UUID.

- [ ] **Step 3: Caso 2 — F5 en la misma pestaña**

En la misma pestaña, presionar `F5`.

Verificar:
- La vista vuelve a renderizar normalmente (sigue siendo owner).
- El UUID en localStorage y sessionStorage no cambió.

- [ ] **Step 4: Caso 3 — abrir segunda pestaña**

Abrir `http://localhost:5173/paletization` en una segunda pestaña del mismo browser.

Verificar:
- La segunda pestaña muestra `TabLockedScreen` ("Paletización en uso en otra pestaña" + botón "Forzar control aquí").
- En DevTools Session Storage de la 2da pestaña, hay un `paletization_tab_id_paletization` distinto al de la 1ra pestaña.
- En Local Storage, el `paletization_owner_paletization` sigue siendo el UUID de la 1ra pestaña.

- [ ] **Step 5: Caso 4 — clic en "Forzar control aquí"**

Con ambas pestañas abiertas, en la 2da pestaña hacer clic en "Forzar control aquí".

Verificar:
- La 2da pestaña cambia a la vista normal de paletización.
- **Sin recargar la 1ra pestaña**, esa se cambia automáticamente a `TabLockedScreen`.
- En Local Storage el `paletization_owner_paletization` ahora es el UUID de la 2da pestaña.

- [ ] **Step 6: Caso 5 — cerrar pestaña dueña, reabrir**

Cerrar la pestaña dueña actual (la 2da, ahora owner). Esperar 2 segundos. Abrir una nueva pestaña en `http://localhost:5173/paletization`.

Verificar:
- La nueva pestaña muestra `TabLockedScreen` (porque `localStorage` quedó con el UUID viejo).
- Hacer clic en "Forzar control aquí" → vista normal.

- [ ] **Step 7: Caso 6 — `/logs` no afectado**

Con `/paletization` abierto en una pestaña (status owner), abrir `http://localhost:5173/logs` en otra pestaña.

Verificar:
- `/logs` carga normal, sin bloqueo.
- `/paletization` sigue siendo owner.

- [ ] **Step 8: Verificar que `useScanDetection` no se monta en pestaña bloqueada**

Con dos pestañas abiertas (1ra owner, 2da blocked), conectar un lector de barcode (o simular con teclado físico rápido) hacia la 2da pestaña enfocada.

Verificar:
- No se dispara ningún `onComplete` en la 2da pestaña (no aparecen toasts ni eventos en el log).
- Idealmente, si la 1ra pestaña tiene foco al momento del escaneo, ahí sí se procesa.

Nota: este step requiere hardware. Si no se puede simular, marcar como "skip — verificar en planta".

- [ ] **Step 9: Limpieza de storage entre pruebas**

Después de cada prueba, para resetear:
```js
// En DevTools console:
localStorage.clear(); sessionStorage.clear();
```

Y cerrar todas las pestañas de `/paletization` antes de empezar el siguiente caso.

- [ ] **Step 10: Documentar resultados de la verificación**

Si todo pasa, no commitear nada — esta task es solo verificación. Si algún caso falla, regresar al task correspondiente, corregir, y volver a verificar.

---

## Self-Review (ya completado por el autor del plan)

**1. Spec coverage:**
- ✅ Hook `useTabLock` → Task 1.
- ✅ `TabLockedScreen` → Task 2.
- ✅ Integración en `PaletizationDashboard` → Task 3.
- ✅ Casos 1–6 del spec → Task 4 steps 2–7.
- ✅ `useScanDetection` no se monta en pestaña bloqueada → Task 4 step 8 (verificación) + Task 3 (la integración a nivel del padre garantiza esto por construcción).
- ✅ Manejo gracioso de `BroadcastChannel` ausente → cubierto en el código del hook (`typeof BroadcastChannel !== "undefined"`).
- ✅ Manejo de `localStorage` deshabilitado → cubierto con `safeGetItem`/`safeSetItem` que retornan `null`/`false`. Cuando `localStorage` no responde, `currentOwner` es `null` → la pestaña se declara owner. Eso es lo que el spec llama "degrada a `status = "owner"` siempre".

**2. Placeholders:** ninguno.

**3. Type consistency:** la API del hook (`{ status, forceTakeover }`) se usa idénticamente en Task 1 (declaración) y Task 3 (consumo). `TabLockedScreen` recibe prop `onForce` en Task 2 y Task 3 la pasa con ese mismo nombre. ✓
