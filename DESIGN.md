# La Primada — Constitución visual (DESIGN.md)

Este archivo es la **constitución visual** del proyecto: el equivalente del `CLAUDE.md` (dominio + arquitectura),
pero para lo visual. Toda decisión de apariencia sale de aquí.

> **Estado:** este documento arranca **solo con Tipografía** y crece **una decisión a la vez**. La **paleta de color**,
> el **espaciado**, los **componentes** y los **patrones de interacción** (p. ej. el acordeón de las tarjetas) se
> definirán en **pasadas posteriores**. Mientras una sección no exista aquí, **no es una decisión tomada**.

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

### Reglas
- **La tipografía sale SIEMPRE de esta definición.** Nada de familias hardcodeadas sueltas en el código
  (ni `font-family` con otras fuentes, ni `@import`/`<link>` de otra familia).
- Una sola familia (**Instrument Sans**) para todo: la jerarquía se logra con **peso y tamaño**, no cambiando de fuente.
- Cambiar la tipografía = editar **este documento primero**, y luego reflejarlo en `index.html` (el `<link>` y el CSS).
