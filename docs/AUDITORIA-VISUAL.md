# Auditoría visual — plan de la pasada de rediseño

> **Informe, NO aplicación.** Lista cada desviación del CSS/`view.js` actual frente al
> contrato `DESIGN.md`, dónde está, y qué cambio la corrige. La aplicación se hace **con el
> PO presente** (cambia toda la app visualmente). Cada bloque mapea a un test de
> `tests/visual-audit.spec.js` (los `test.fail()` D1–D4 pasan a verde al corregir).
>
> Líneas son del estado al auditar (`index.html`, `js/view.js`); pueden correrse al editar.
> Fuente de verdad: `DESIGN.md` §2 (componentes canónicos), §3 (jerarquía), §1 (tokens).

---

## 0 · Resumen ejecutivo

| # | Desviación | Archivos | Test |
|---|---|---|---|
| 1 | **Fila de asistente** es caja pesada `.asis` (borde + tinte por borde) | index.html, view.js | D1 |
| 2 | **Principal y rol** se marcan con **badges con borde** | view.js, index.html | D2 |
| 3 | **Divisores punteados** (`border …dashed`) en 9 reglas | index.html | D3 |
| 4 | **Estado vacío legado** `.empty` (caja `2px dashed`) | index.html, view.js | D4 |
| 5 | Cajas pesadas adicionales (`.card`, `.pcard`, `.prodpick`, `.status`) | index.html, view.js | — |
| 6 | Inconsistencia de patrón de **estado** (dot en detalle vs badge en historial) | view.js | — |
| 7 | (No-cambios) inputs/chips/steppers/sheet con borde = affordance | — | C-verde |

Las 5 reglas **verde** del visual-audit (C1–C5) ya pasan: tipografía, tokens, acento del tab
activo, tabbar fija, y deuda en el número. **No** tocar lo que las sostiene.

---

## 1 · Fila de asistente — caja `.asis` → fila liviana (DESIGN.md §2.1) · test D1

**Desviación.** El asistente se dibuja como **caja con borde**, y el estado se comunica
**tiñendo el borde** de la caja — lo opuesto al canónico.

`index.html`:
- L227 `.asis{ background:var(--paper-2); border:2px solid var(--line); border-radius:var(--radius-lg); overflow:hidden }` — **caja pesada**.
- L228 `.asis.is-principal{ border-color:var(--red) }` — principal por **borde**.
- L229 `.asis.debe{ border-color:var(--alert) }` — deuda por **borde**. (**CSS muerto**: `view.js` nunca aplica `.debe`.)
- L257 `.asis-foot{ … border-top:1px dashed var(--line) }` — divisor punteado interno (ver §3).

`js/view.js`:
- L191/194 envuelve la cabecera en `<div class="asis ${esPrin?'is-principal':''}">`.

**Corrección (§2.1).** Convertir `.asis` en **fila liviana** (modelo `.pitem`, L120):
- Quitar `background`, `border`, `border-radius` de tarjeta. Separar filas de la lista
  (`.asis-list`, L226) con **línea tenue** `rgba(255,255,255,.06)` (token nuevo `--line-soft`,
  ver §5/§DESIGN §5) o solo con el `gap` ya existente.
- Eliminar `.asis.is-principal` y `.asis.debe`. El principal pasa a marcarse con **punto teal +
  "Principal"** (ver §2 de este informe); la deuda, con **color en el número** (ya canónico, L207).
- `.asis-foot` pierde el `dashed` (ver §3).

**Resultado esperado del test:** `getComputedStyle('.asis').borderTopWidth === '0px'`.

---

## 2 · Identidad: badges con borde → punto + etiqueta tenue (DESIGN.md §2.1) · test D2

**Desviación.** El rol y el principal se renderizan como **badges con borde**.

`js/view.js`:
- L26 helper `badge(text, cls)` → `<span class="badge …">`.
- L181 `snapBadge = badge(a.estadoEnEseMomento, ahorrador ? 'good' : '')` — el **rol** como badge.
- L187 `…${snapBadge}${esPrin ? ' ' + badge('principal','red') : ''}` — **principal** como badge rojo.

`index.html`:
- L172 `.badge.good{ … border:1px solid rgba(77,217,160,.42) }`
- L173 `.badge.red{ … border:1px solid var(--alert) }`
- L131–132 `.badge` / `.badge.warn` (borde ámbar).

**Corrección (§2.1).** En `.acc-id` (view.js L187):
- **Rol** (Ahorrador/Invitado) → **etiqueta tenue en texto**: `<span class="rol-tag">Ahorrador</span>`
  con `color:var(--ink-soft); font-weight:400; font-size:12px`. Sin badge, sin borde.
- **Principal** → `<span class="dot"></span>Principal` reusando `.dot` (L114, ya es punto teal) +
  palabra tenue. Quitar `badge('principal','red')`.
- Capitalización Title Case (DESIGN.md §4): "Ahorrador", "Invitado", "Principal".

**Resultado esperado del test:** `document.querySelectorAll('.acc-id .badge').length === 0`.

---

## 3 · Divisores punteados `dashed` → espacio o línea tenue sólida (DESIGN.md §2 / §6) · test D3

**Desviación.** Nueve reglas separan con `border …dashed`, prohibido por la densidad canónica
(las secciones se separan con **espacio**; las filas, con **línea tenue sólida**).

`index.html` (todas `border-top:1px dashed var(--line)` salvo nota):
- L96 `.kv` (filas clave-valor del informe/resumen).
- L217 `.sub` (subtítulo de bloque).
- L257 `.asis-foot` (pie del asistente).
- L271 `.prodrow` (gestión de productos del evento).
- L277 `.prodnew` (alta de producto).
- L282 `.pay` (bloque de abonos).
- L328 `.wz-prodrow` (fila de producto en el wizard).
- L335 `.wz-nav` (barra de navegación del wizard).
- L262 `.prodpick{ … border:2px dashed var(--line) … }` (caja del chip-picker — además es caja, ver §5).

**Corrección.** Reemplazar cada `dashed` por:
- **Separación entre secciones** → quitar el borde y usar `margin` (`--space-3/4/5`).
- **Separación entre filas de una lista** (`.kv`, `.prodrow`, `.asis-foot`) → `border-top:1px solid
  rgba(255,255,255,.06)` (token `--line-soft`) o solo espacio.
- `.kv.total` (L213, `border-top:2px solid`) es un **separador de total** legítimo: evaluar bajarlo a
  línea tenue, no es `dashed` (no bloquea D3, pero revisar coherencia).

**Resultado esperado del test:** cero elementos con `borderTopStyle/borderBottomStyle === 'dashed'`
dentro de `#screen`.

---

## 4 · Estado vacío legado `.empty` → `.empty-soft` (DESIGN.md §2.6) · test D4

**Desviación.** Conviven dos estados vacíos: `.empty-soft` (canónico, sin caja) y `.empty`
(caja `2px dashed`).

`index.html`:
- L134 `.empty{ … border:2px dashed var(--line); border-radius:var(--radius-lg) }` — **caja punteada**.
- L294 `.empty.big{ padding:… }` — variante.

`js/view.js`:
- L74 `<div class="empty">Sin primada</div>` (sheet de configuración) — usa el legado.
- (L320/352/387 ya usan `.empty-soft` — correcto.)

**Corrección (§2.6).** Migrar el uso de L74 a `.empty-soft`; **eliminar** las reglas `.empty` y
`.empty.big`. Texto en Sentence case `Sin <cosa>` (DESIGN.md §4/§7).

**Resultado esperado del test:** la clase `.empty` no aporta borde (`borderTopStyle === 'none'`).

---

## 5 · Cajas pesadas adicionales (DESIGN.md §2 / Densidad §6) · sin test (revisión PO)

Cajas `border:2px solid` que **no** son controles de input. Según §2/§6, la caja con borde se
reserva para **una tarjeta de datos genuina**; agrupar secciones con caja es legado.

`index.html`:
- L205 `.card` (informe del principal, reparto en Resumen — view.js L267/284/294). **Evaluar**:
  ¿el informe es "tarjeta de datos genuina" (se mantiene) o pasa a bloque con espacio + jerarquía?
  Decisión del PO.
- L346 `.pcard` (tarjeta de persona en el directorio — pantalla Personas). Igual que la fila de
  asistente: candidata a **fila liviana** `.pitem` (que ya existe, L120). Decisión del PO.
- L262 `.prodpick` (caja `2px dashed` del chip-picker). El picker es control, pero la **caja
  punteada** es legado → fondo sin borde o borde sólido tenue.
- L85 `.status` (caja `2px solid` de estado/sync). Discreta; evaluar si pasa a texto + dot.

> **No** tocar sin OK del PO: estas tienen matices (la `.card` del informe puede ser legítima).
> Por eso van **fuera** de los tests `test.fail()` (que cubren lo inequívoco: D1–D4).

---

## 6 · Inconsistencia de patrón de estado (DESIGN.md §2.7) · sin test

**Desviación.** El estado de la primada se dibuja de **dos formas distintas**:
- En el **detalle** (view.js L57–58): **punto de color** (`.dot`) — canónico ✅.
- En el **historial** (view.js L362): `badge('cerrada','')` / `badge('abierta','good')` — badge ❌.

**Corrección (§2.7).** Unificar el historial al **punto + texto** (o color del texto), como el
detalle. Misma regla en toda la app: estado = dot/color, no badge.

---

## 7 · Lo que NO cambia (affordance de control) — mantener

Estas cajas con borde son **affordance de control**, permitidas por DESIGN.md §2.3/§5. **No** entran
en la pasada de liviandad:
- `.ti` (L185), `.sel` (L189) — inputs/selects (foco en acento, ya canónico).
- `.step` (L253) — stepper ±.
- `.mini` (L197), `.btn.ghost` (L91) — botones secundarios con borde sutil.
- `.chip` (L265) — chip-picker interactivo.
- `.sheet` (L299), `.seg-nav` (L339), `.wz-dot` (L317) — contenedor de sheet / segmented / stepper del wizard.
- `.gear` (L72) — botón del header.

Y las **5 reglas verde** del visual-audit (C1–C5): Instrument Sans, tokens `:root`, acento del tab
activo, tabbar fija, `.owe` (deuda en el número). Romper cualquiera de estas haría fallar C1–C5.

---

## 8 · Orden sugerido de aplicación (cuando estemos juntos)

1. **Token nuevo** `--line-soft: rgba(255,255,255,.06)` en `:root` (aprobar nombre — DESIGN.md §5).
2. **§3 dashed → espacio/línea tenue** (9 reglas). Barrido mecánico, bajo riesgo. → D3 verde.
3. **§4 `.empty` → `.empty-soft`** (1 uso + borrar reglas). → D4 verde.
4. **§2 identidad: badges → dot + etiqueta** (view.js L181/187 + CSS). → D2 verde.
5. **§1 caja `.asis` → fila liviana** (CSS L227–229 + view.js wrapper). → D1 verde.
6. **§6 estado del historial → dot** (view.js L362). Coherencia.
7. **§5 cajas pesadas** (`.card`/`.pcard`/`.prodpick`/`.status`) — **una por una, con decisión del PO**.
8. Tras cada paso: `npm test` (node, debe seguir verde) + `npm run test:e2e` (los D* van cayendo a
   verde; **quitar el `test.fail()`** correspondiente al confirmar). Verificar en navegador real.

> Al terminar la pasada, `tests/visual-audit.spec.js` debe quedar **todo verde sin `test.fail()`**:
> es la señal de que el app cumple el contrato `DESIGN.md`.
