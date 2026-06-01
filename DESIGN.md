# La Primada — Constitución visual (DESIGN.md)

Este archivo es la **constitución visual** del proyecto: el equivalente del `CLAUDE.md` (dominio + arquitectura),
pero para lo visual. Toda decisión de apariencia sale de aquí.

> **Estado:** este documento crece **una decisión a la vez**. Hoy define **Tipografía**, **Color** y
> **Patrones** (acordeón). Faltan (pasadas posteriores): **espaciado** y más **componentes**.
> Mientras una sección no exista aquí, **no es una decisión tomada**.

## Tipografía

**Fuente principal: Instrument Sans.** Una sola familia para **toda la interfaz** — títulos, cuerpo, nombres y números.
No hay fuente secundaria.

### De dónde se carga
Desde el **CDN de Google Fonts**, con un `<link>` en `index.html` (igual que las fuentes anteriores). Definición canónica:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;700&display=swap" rel="stylesheet">
```

### Escala de pesos
Una escala simple; usar solo estos tres:

| Peso | Valor | Uso típico |
|------|-------|------------|
| Regular | **400** | cuerpo, texto general, metadatos |
| Medium  | **500** | énfasis suave, etiquetas, números destacados |
| Bold    | **700** | títulos, nombres, montos, botones |

> Si más adelante hace falta otro peso (p. ej. 600), se agrega **aquí primero** y luego al `<link>` y al CSS — nunca al revés.

### Stack CSS canónico
La familia se referencia siempre así (con fallbacks del sistema por si el CDN no carga):

```css
font-family: "Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
```

### Reglas (tipografía)
- **La tipografía sale SIEMPRE de esta definición.** Nada de familias hardcodeadas sueltas en el código.
- Una sola familia (**Instrument Sans**) para todo: la jerarquía se logra con **peso y tamaño**, no cambiando de fuente.
- Cambiar la tipografía = editar **este documento primero**, y luego reflejarlo en `index.html`.

## Color

**Dark-first, paleta verde-azul (teal) sobre oscuro.** La app es oscura por defecto; no hay tema claro por ahora.
Toda referencia de color en el CSS pasa por estas variables (`:root` en `index.html`); **nada de hex/rgba sueltos** en reglas.

### Tokens (fuente de verdad)

| Token (CSS var) | Valor | Rol |
|-----------------|-------|-----|
| `--paper`   | `#0d1716` | **Fondo profundo** (lienzo de la app) |
| `--paper-2` | `#13201f` | **Superficie de tarjeta** / paneles |
| `--paper-3` | `#1a2c2a` | Superficie elevada (derivado) |
| `--ink`     | `#e2eeec` | **Tinta principal** (texto) |
| `--ink-soft`| `#8aa3a0` | Texto secundario / atenuado (derivado) |
| `--line`    | `#25403d` | Bordes / divisores (derivado) |
| `--accent`  | `#2DD4BF` | **Acento principal** (botones, foco, activos, ganancia) |
| `--accent-ink` | `#0d1716` | **Texto sobre el acento** = el fondo profundo (**nunca blanco**) |
| `--pos`     | `#4DD9A0` | "Pagó / positivo" — texto |
| `--pos-bg`  | `#103028` | "Pagó / positivo" — fondo |
| `--alert`   | `#F08C8C` | "Debe / alerta" — texto |
| `--alert-bg`| `#3a1818` | "Debe / alerta" — fondo |
| `--shadow`  | sombras a negro | Profundidad sobre oscuro |

**Alias de compatibilidad** (nombres heredados del CSS que apuntan a la paleta semántica, para no reescribir cada regla):
`--red` → `--accent` (`#2DD4BF`); `--red-deep` → `#14b8a6` (teal de énfasis/hover); `--green` → `--pos` (`#4DD9A0`);
`--amber` → `#e0b341` (avisos/warn).

### Reglas (color)
- **Dark-first:** el fondo es `--paper` (oscuro); las superficies suben con `--paper-2`/`--paper-3`.
- **Texto sobre el acento** usa `--accent-ink` (el fondo profundo), **nunca blanco** — el teal es claro y el blanco no contrasta.
- **Semántica de saldos:** "pagó/positivo" usa el par `--pos` / `--pos-bg`; "debe/alerta" usa `--alert` / `--alert-bg`.
  Un saldo en deuda **siempre** se ve en `--alert`; nunca en el acento (no confundir deuda con algo positivo).
- **Nada de color hardcodeado suelto.** Todo color en el CSS referencia estas variables. Agregar/cambiar un color =
  editar **este documento primero** y luego `:root` en `index.html`.
- Los tintes translúcidos de estados (badges, hovers) se derivan de estos tonos; al sumar componentes se formalizan aquí.

## Patrones

### Acordeón (progressive disclosure)
Patrón **reutilizable** para listas largas donde cada ítem tiene un resumen y un detalle accionable.
Su primer uso es la **tarjeta de asistente** del tab Primadas (una primada puede tener 15–17 personas).

**Principio:** **cerrado por defecto**. En reposo cada ítem es **una línea-resumen** legible de un vistazo; el
**detalle y los controles** aparecen solo al **expandir**. Así una lista larga se lee sin un muro de controles.

**Anatomía**
- **Cabecera (`.acc-head`)** — es el disparador (todo el renglón es tappable). Contiene:
  - **caret** (`.acc-caret`, rota 90° al abrir, transición suave),
  - **identidad** (nombre + badges),
  - **cifra-resumen** a la derecha (`.acc-amt`): el dato que importa cerrado (total; y si **debe**, el saldo en `--alert`).
- **Cuerpo (`.acc-body`)** — solo se renderiza si el ítem está abierto; entra con una animación corta (`accIn`, ~180 ms).

**Comportamiento**
- **Multiabierto:** varios ítems pueden estar abiertos a la vez (útil para registrar a varias personas seguidas).
- El estado abierto/cerrado es **UI efímero**, vive en el **Controller** (`ui.abiertos = Set`), **NO** en el Store
  (no es dominio, no se persiste). La Vista es pura sobre `(estado, ui)`.
- **a11y:** la cabecera es un `<button>` con `aria-expanded`.

**Cuándo usarlo:** listas de entidades con resumen + detalle (asistentes; a futuro, deudores o aportantes).
**Cuándo NO:** contenido que siempre debe estar visible, o listas de 2–3 ítems donde plegar estorba.

**Progressive disclosure anidado (consumo).** Dentro de la tarjeta abierta, el consumo aplica el mismo principio:
se muestran **solo los productos consumidos** (cantidad > 0) con su stepper; un **chip-picker "+ Agregar"** revela el
catálogo de esa primada para sumar lo que falte; bajar a 0 lo retira. Vacío → mensaje ("Aún no ha consumido nada"),
nunca un bloque en blanco.
