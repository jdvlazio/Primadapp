# La Primada — Modelo de datos (esquema v4) y backend

> Forma del estado en memoria (`AppState` v4) y su mapeo al esquema **Supabase**
> (`supabase/schema.sql`). Extraído del código real (`js/store.js`, `js/api.js`,
> `js/config.js`) y del SQL. La arquitectura de capas vive en `docs/ARQUITECTURA.md`;
> el dominio/producto en `CLAUDE.md`.

---

## 1 · AppState (v4 — DEFINITIVO)

```
AppState  { schemaVersion:4,
            settings{ cover{ahorrador,invitado}, defaultProducts[] },
            personas[], primadas[], activePrimadaId }

Persona   { id, nombre, estado:'ahorrador'|'invitado', breB:string|null }

Primada   { id, nombre, fecha:'YYYY-MM-DD', mesContable:'YYYY-MM',
            organizadorPrincipalId:personaId|null,
            pago{ breB:string|null },
            cover{ahorrador,invitado}, productos[], asistencias[],
            estado:'abierta'|'cerrada' }

Producto  { id, nombre, emoji, costoNeto, precioVenta, aportadoPor:personaId|null }
            // default aportadoPor = principal

Asistencia{ personaId, estadoEnEseMomento:'ahorrador'|'invitado',
            rol:'principal'|'organizador'|'asistente',
            coverExonerado:bool, items{ productoId:cantidad },
            abonos[]{ id, monto, fecha } }
```

### Reglas de forma (claves)
- **`personas[]` es el directorio raíz**, persiste para siempre. Una persona pasa de
  invitado↔ahorrador cambiando solo `estado` (vigente). **No se borra su historia.**
- **`estadoEnEseMomento` es un SNAPSHOT inmutable** del estado que la persona tenía al asistir
  (igual que los precios). Si la persona cambia de estado después, **la historia NO se reescribe**
  (INVARIANTE #1).
- **Organizadores = `rol` dentro de la asistencia.** El `principal` es la asistencia con
  `rol:'principal'`; `organizadorPrincipalId` es el **puntero de integridad**. "Sin cover" se
  **deriva** del `rol` (o de `coverExonerado`).
- **`fecha` con día** (`YYYY-MM-DD`) + **`mesContable`** independiente (`YYYY-MM`): una primada
  puede contar para un mes contable distinto al de su fecha (la del 31-may cuenta como junio).
  El **año-etiqueta** sale de `mesContable`.
- **Snapshot por primada:** al crearla se copian **cover**, **productos** (con sus dos precios) y la
  **llave `breB`** del principal. Editar lo global o la persona **NO** reescribe primadas ya creadas.
- **Dos precios por producto:** `costoNeto` (lo frontea `aportadoPor`) y `precioVenta` (lo paga el
  asistente). **margen = precioVenta − costoNeto** → ganancia del fondo. Una rifa es un producto con
  `costoNeto` bajo o **0**.

### Reglas de negocio (núcleo)
```
gananciaPrimada = Σ cover cobrado + Σ (precioVenta − costoNeto) × unidades   // de TODAS las asistencias
nAhorradoras    = nº de asistencias con estadoEnEseMomento === 'ahorrador'
parteIgual      = floor(gananciaPrimada / nAhorradoras)                       // piso, sin centavos
sobranteFondo   = gananciaPrimada − parteIgual × nAhorradoras                 // lo indivisible queda en el fondo
totalAsistencia = cover (si rol 'asistente' y no exonerado) + Σ(precioVenta × consumos)
```
El reparto va **solo** a las asistencias ahorradoras de ese momento; el principal entra siempre
(saldo del principal = 0, auto-saldado). **Invitados generan ganancia pero no la reciben.**

---

## 2 · Invariantes que el modelo blinda

1. **Inmutabilidad histórica:** `setEstadoPersona` solo toca `Persona.estado`; nunca el
   `estadoEnEseMomento` congelado en asistencias pasadas.
2. **Principal siempre ahorrador:** asignar `principal` exige `estadoEnEseMomento==='ahorrador'`,
   o la acción lanza error.
3. **A lo sumo un `rol:'principal'`** por primada, coherente con `organizadorPrincipalId`.
4. **"Cerrada" congela la cuenta** (consumos/cover/productos/roles) pero **sigue aceptando abonos**.

---

## 3 · Defaults de instalación (`CONFIG`, `js/config.js`)

```
storageKey      : 'laPrimada'
schemaVersion   : 4
locale          : 'es-CO'
defaultCover    : { ahorrador: 15000, invitado: 10000 }   // solo instalación nueva; NO reescribe snapshots
defaultProducts : [ Costeñita 🍺 2500/3500, Brownie 🍫 6000/9000,
                    Rollo de canela 🌀 6000/9000, Boleta de rifa 🎟️ 0/5000 ]
backendEnabled  : false                                    // false → 100% localStorage, sin auth gate
supabase        : { url, anonKey }                         // PÚBLICAS por diseño (RLS protege)
```

---

## 4 · Migraciones v1 → v2 → v3 → v4

`Store.migrate()` detecta la versión y converge a v4 (idempotente, estable en ids). Datos
corruptos/nulos → `defaultState()`; el normalizador es **tolerante** (rellena faltantes).

| Origen | Forma vieja | Cómo sube a v4 |
|---|---|---|
| v3 | `primadas[]` con `asistentes[]{tipo,nombre,items}` y `Producto.price` (un precio) | Ver detalle abajo |
| v2 | `{products, people}` | Se envuelve como una primada con **cover 0** y pasa por el mismo camino |
| v1 | arreglo pelado | Igual que v2 (cover 0) |

**Salto a v4 (lo clave):**
- **Directorio `personas[]`:** se crea de los **nombres distintos** de los asistentes; `estado` = el
  tipo que traían (**última aparición por fecha gana**); `breB` arranca `null`.
- **Asistencias:** se enlazan por `personaId` y guardan `estadoEnEseMomento` = el tipo de **esa**
  asistencia (snapshot). Todas entran como `rol:'asistente'`, `abonos:[]`.
- **Productos:** `precioVenta = price` viejo; `costoNeto = precioVenta` → **margen 0** (no se inventan
  costos ni ganancias retroactivas).
- **Primadas migradas quedan "incompletas":** `organizadorPrincipalId = null` (no se sabe quién
  organizó); la UI pedirá asignar principal. Los selectores/informe **toleran `null`**.
- **`fecha`:** `'YYYY-MM'` viejo → `'YYYY-MM-01'`; `mesContable` = ese mes. **`cover`** se preserva.
- Se **conserva** `activePrimadaId`.

> **Regla de proceso:** todo cambio de forma del estado = subir `schemaVersion` + caso en
> `migrate()` + **tests primero**.

---

## 5 · Esquema Supabase (Opción C: híbrido relacional + JSONB)

Fuente: `supabase/schema.sql` (idempotente; correr en Supabase → SQL Editor). IDs de texto del
modelo (`'per…'`, `'prm…'`) se conservan como **PK `text`** (sin migrar a uuid → cero cambios al modelo).

### Tablas

| Tabla | Columnas indexables | `data jsonb` | Nota |
|---|---|---|---|
| `profiles` | `user_id` (PK, → `auth.users`), `email`, `role` ∈ {admin,miembro} | — | rol por usuario; alta automática al registrarse (trigger `handle_new_user`, rol `miembro`); admin se promueve a mano |
| `settings` | `id='singleton'` (PK, check) | `{ cover{ahorrador,invitado}, defaultProducts[] }` | singleton global |
| `personas` | `id` (PK text), `nombre`, `estado` ∈ {ahorrador,invitado}, `breb` | — | directorio relacional; sede de la INVARIANTE #1 |
| `primadas` | `id` (PK text), `nombre`, `fecha date`, `mes_contable text`, `organizador_principal_id` (→ personas), `estado` ∈ {abierta,cerrada} | `{ pago{breB}, cover{…}, productos[], asistencias[] }` | snapshots congelados en jsonb |

**Índices:** `primadas(fecha desc)`, `primadas(mes_contable)`, `primadas(estado)`.

**Granularidad por fila:** editar la primada A no pisa la B ni el directorio; dentro de una primada,
last-write-wins es aceptable.

### Mapeo modelo ↔ filas (`js/api.js`)
camelCase (modelo v4) ↔ snake_case (Supabase). Los snapshots van al `jsonb` **tal cual la forma del
modelo** (sin aplanar):

| Modelo (camelCase) | Fila (snake_case) |
|---|---|
| `Persona.breB` | `personas.breb` |
| `Primada.mesContable` | `primadas.mes_contable` |
| `Primada.organizadorPrincipalId` | `primadas.organizador_principal_id` |
| `Primada.{pago,cover,productos,asistencias}` | `primadas.data` (jsonb) |
| `settings.{cover,defaultProducts}` | `settings.data` (jsonb), `id='singleton'` |

Serializadores: `personaToRow`/`rowToPersona`, `primadaToRow`/`rowToPrimada`, `settingsToRow`,
`fromRows`.

---

## 6 · Seguridad — RLS (frontera real)

RLS habilitado en `profiles`, `settings`, `personas`, `primadas`. Helper `is_admin()`
(SECURITY DEFINER, evita recursión de RLS).

| Tabla | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|
| `primadas` (datos de evento) | todos autenticados | todos | **todos** (escritura completa) |
| `personas` (directorio) | todos | **todos** (en plena primada cualquiera agrega una persona) | **solo admin** (`is_admin()`) |
| `settings` (global) | todos | — | **solo admin** |
| `profiles` | todos (transparencia de roles) | — | **solo admin** |

**Principios:** transparencia total (todos ven todo); el **admin** controla además directorio y
settings. `breB` es **público** (llave para **recibir** pagos; no es dato sensible). La `anon key`
en el bundle es **por diseño**; **NUNCA** exponer la `service_role key` — RLS protege.

**Auth:** magic link por email (passwordless), **sin registro** — el admin **siembra** los emails.
La app exige estar autenticado antes de mostrar datos (auth gate en el bootstrap, solo con
`backendEnabled=true`).

**Realtime (fase 2, opcional):** publicar `primadas`, `personas`, `settings` en
`supabase_realtime` para ver cambios en vivo (comentado en el SQL).

---

## 7 · Arranque y caché

- **Arranque limpio:** se arranca en Supabase; **no se migra localStorage** (los datos de prueba no
  tienen valor real).
- **Caché offline = solo LECTURA:** localStorage espeja el último estado (`cacheWrite`/`cacheRead`)
  para ver datos sin conexión y arranque en frío. La **fuente de verdad es Supabase**; nunca se
  escribe lógica de dominio a localStorage.
