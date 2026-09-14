/* ============================================================
   VISTA — View (funciones puras estado → DOM)
   PASO 2: tab Primadas (corazón) + overlays Personas/Ajustes.
   Render puro: recibe (state, ui) y dibuja. NO muta estado ni persiste.
   `ui` es estado EFÍMERO de navegación (tab/overlay) que vive en el
   Controller — NO es estado de dominio, por eso no entra al Store v4.
   ============================================================ */
(function (root) {
  'use strict';

  const Util  = root.Util;
  const Store = root.Store;
  const S     = () => Store.select;
  const els = {};

  function cache() {
    els.screen  = document.getElementById('screen');
    els.overlay = document.getElementById('overlay');
    els.toast   = document.getElementById('toast');
    els.topbar  = document.getElementById('topbar');
    els.tabbar  = document.getElementById('tabbar');   // ya no existe (IA list→detalle); guard tolera null
  }

  /* ---------- helpers de marcado ---------- */
  const e = Util.esc;
  const $peso = Util.peso;
  function badge(text, cls) { return `<span class="badge ${cls || ''}">${e(text)}</span>`; }
  // Capitaliza una palabra de rol/estado para mostrarla (DESIGN.md §4: Title Case). El dato crudo
  // (data-*, modelo) sigue en minúscula; esto es SOLO presentación.
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  // Etiqueta de rol/estado en texto tenue (reemplaza los badges con borde en la identidad).
  function rolTag(estado) { return `<span class="rol-tag">${e(cap(estado))}</span>`; }
  function nombrePersona(id) { const p = S().persona(id); return p ? p.nombre : '—'; }
  // Nombre CORTO para el selector: quita el prefijo "Primada " (el período ya es la guía; el resto
  // —los organizadores— es la identidad real). Si el nombre no empieza con "Primada", se muestra tal cual.
  function nombreCorto(nombre) { const n = String(nombre || '').trim(); return n.replace(/^primada\s+/i, '') || n; }

  // ¿La primada tiene algo que mostrar en el informe? (al menos un asistente con consumo o con cover).
  // Gatea la visibilidad del botón "Compartir informe" en la cabecera.
  function hayDatosInforme(p) {
    if (!p || !Array.isArray(p.asistencias)) return false;
    const sel = S();
    return p.asistencias.some(a => sel.coverDe(p, a) > 0 || sel.resumenConsumoDe(p, a).length > 0);
  }

  /* ============================================================
     INFORME COMPARTIBLE — template HTML (PURO) para capturar como PNG (html2canvas). Es el DOCUMENTO
     FINAL del Tesorero (sobre todo cerrada + todos pagaron): MISMO resumen ejecutivo que el Balance in-app.
     Superficie OSCURA fiel al sistema (paper/ink/accent/amber), NO una tarjeta blanca. SIN llave Bre-B
     (el cómo-pagar vive en la hoja Pagar) y SIN footer. Jerarquía:
       wordmark + período → título → HÉROE Ganancia (teal, banda) → KPI Parte igual c/u → COMPOSICIÓN
       (Cover · Margen · Reembolso atenuado · Sobrante si>0) → COBRO (debe/pagó: ✓ teal / ámbar + total).
     ============================================================ */
  // DESGLOSE de lo que paga una persona: "Cover $10.000 · 🍺 ×2 $7.000 · 🍫 ×1 $5.000". UNA sola línea atenuada
  // que SUMA exactamente el total (cover + subtotal por ítem): resuelve el "¿y esto por qué?" sin quitarle
  // protagonismo al nombre y al total. Reusa el lenguaje de los chips (🍺 ×2). Cover 0 (organizador/exonerado)
  // se omite. Vacío si no hay nada que desglosar. Se usa en el INFORME y en la hoja PAGAR (el momento de pagar).
  // PARTIDAS de lo que paga una persona (datos puros): cover (si >0) + cada producto con cantidad y subtotal.
  function desglosePartidas(p, a) {
    const L = [];
    const cov = S().coverDe(p, a);
    if (cov > 0) L.push({ lbl: 'Cover', q: '', m: cov });   // el Cover es el factor común universal: siempre primero
    // Productos del FACTOR COMÚN al más PARTICULAR (Store.select.rankProductos): así los recibos de varias personas
    // quedan alineados entre sí — lo que todos tomaron arriba, lo raro al final — y el informe se lee ordenado.
    const rank = S().rankProductos(p);
    const pos = id => (rank.has(id) ? rank.get(id) : 0);
    S().resumenConsumoDe(p, a).slice().sort((x, y) => pos(x.prod.id) - pos(y.prod.id)).forEach(({ prod, cantidad }) => {
      L.push({ lbl: `${e(prod.emoji)} ${e(prod.nombre)}`, q: `×${cantidad}`, m: (Number(prod.precioVenta) || 0) * cantidad });
    });
    return L;
  }
  // MINI RECIBO por persona — el patrón universal de "qué me están cobrando". Partidas en FILAS indentadas bajo
  // el nombre: etiqueta a la izquierda (con el NOMBRE del producto: el emoji es decoración, no identidad) y cifra
  // a la derecha en COLUMNA con números tabulares, para sumar a ojo contra el total. Reusa las filas etiqueta/cifra
  // que el sistema ya usa (informe-kv / bal-row) → cero vocabulario visual nuevo; `rowClass` elige el sabor por
  // superficie. Reemplazó a una línea corrida "emoji ×N $x · emoji ×N $y" que no alineaba cifras ni decía el nombre.
  // Vacío si no hay nada que desglosar. El MISMO bloque va en Informe, Balance y hoja Pagar.
  function desgloseHTML(p, a, rowClass, wrapClass, sinCover) {
    // `sinCover`: el informe compartido sube el Cover al renglón del nombre (se repetía idéntico en TODAS las
    // personas y costaba una línea entera cada vez). Balance y hoja Pagar lo siguen listando como partida.
    const L = desglosePartidas(p, a).filter(x => !(sinCover && x.lbl === 'Cover'));
    if (!L.length) return '';
    const filas = L.map(x => `<div class="${rowClass}"><span>${x.lbl}${x.q ? ` <span class="q">${x.q}</span>` : ''}</span><b>${$peso(x.m)}</b></div>`).join('');
    return `<div class="${wrapClass}">${filas}</div>`;
  }
  // Cover NOMINAL del grupo al que pertenece la asistencia (lo que paga alguien de ese estado en esta primada),
  // sin mirar la exoneración individual. Mismo criterio que Store.coverDe para elegir snapshot vs vigente.
  function coverGrupoDe(p, a) {
    const st = S().state();
    const vigente = st && st.settings && st.settings.cover;
    const c = (p.estado === 'cerrada' || p.coverPropio) ? p.cover : (vigente || p.cover);
    return (c && c[a.estadoEnEseMomento]) || 0;
  }

  function informeTemplateHTML(p) {
    const sel = S();
    const inf = sel.informePrincipal(p);
    const cerrada = p.estado === 'cerrada';
    const completa = !inf.incompleta;
    const principalId = p.organizadorPrincipalId;
    const ahorr = sel.asistenciasAhorradoras(p);
    const pi = sel.parteIgual(p);
    const sob = sel.sobranteFondo(p);
    const gan = sel.ganancia(p);

    // HÉROE = Ganancia (lo que va al Tesorero), teal. Provisional mientras esté abierta.
    const hero = `<div class="informe-hero gan">
        <span class="informe-hero-lbl">Ganancia${cerrada ? ' · al Tesorero' : ''}</span>
        <span class="informe-hero-val">${$peso(gan)}</span>
        ${cerrada
          ? (inf.saldoPendiente > 0 ? `<span class="informe-hero-note pend">${$peso(inf.saldoPendiente)} aún por cobrar</span>` : '')
          : '<span class="informe-hero-note">Provisional — se confirma al cerrar</span>'}
      </div>`;

    // REPARTO — A QUIÉNES se distribuye: la ganancia se reparte en partes iguales entre los AHORRADORES
    // (cada uno recibe parteIgual). El ANFITRIÓN también recibe (siempre es ahorrador) → va en la lista, marcado.
    // Los INVITADOS no reciben (generan ganancia pero no la cobran). Esto es lo que el Tesorero distribuye —
    // distinto del COBRO (quién paga). Anfitrión primero, luego por nombre.
    // §0 "no repetir entre niveles": el MONTO (parteIgual) es igual para todos y se dice UNA vez (cabecera teal).
    // La lista aporta el dato NUEVO: los NOMBRES (a quiénes). NO se repite el monto por fila.
    // Los NOMBRES de los ahorradores ya NO se listan acá: el COBRO va agrupado por estado y su grupo
    // "Ahorradores" ES el padrón de quiénes reciben (idea del PM: no repetir la misma información dos veces
    // en el mismo documento). Acá queda solo el dato que el grupo no dice: cuántos son y cuánto toca c/u.
    const stat = ahorr.length
      ? `<div class="informe-stat">
          <div class="informe-stat-k"><span>Reparto a ahorradores</span><span class="informe-stat-sub">${ahorr.length}</span></div>
          <div class="informe-stat-v">${$peso(pi)} <span class="informe-stat-cu">c/u</span></div>
        </div>
`
      : '';

    // COMPOSICIÓN — Cover · Margen (cómo se arma) · Reembolso de productos (atenuado, passthrough) · Sobrante (si > 0).
    const comp = `<div class="informe-comp">
        <div class="informe-kv"><span>Cover</span><b>${$peso(sel.coverCobrado(p))}</b></div>
        <div class="informe-kv"><span>Margen</span><b>${$peso(sel.margenTotal(p))}</b></div>
        ${completa ? `<div class="informe-kv dim"><span>Reembolso a ${e(nombrePersona(principalId))} <span class="informe-rep-anf">Anfitrión</span></span><b>${$peso(inf.recuperaPrincipal)}</b></div>` : ''}
        ${sob > 0 ? `<div class="informe-kv"><span>Sobrante al fondo</span><b>${$peso(sob)}</b></div>` : ''}
      </div>`;

    // COBRO = registro TRANSPARENTE del consumo de cada quien (no solo "quién debe"): pendientes (ámbar) y
    // saldados (✓ teal), de mayor a menor. El ANFITRIÓN aparece SIEMPRE como saldado (su consumo está en mano,
    // auto-saldado), marcado "Anfitrión" → su total se ve, igual que el de todos (el cruce de cuentas ya está en
    // Reembolso de productos + Margen, no se oculta nada).
    const deud = (completa ? sel.deudores(p).filter(d => d.personaId !== principalId) : [])
      .slice().sort((a, b) => b.saldo - a.saldo);
    // Cada fila lleva el DESGLOSE (los ítems con su subtotal) bajo el nombre. OJO: acá las partidas NO suman
    // el total de la derecha — el Cover se subió a la cabecera del GRUPO y no se repite por persona, así que
    // `Σ partidas = total − cover`. El Balance y la hoja Pagar sí listan el cover como partida.
    const fila = (a, monto, cls, check, anf) => {
      const desg = desgloseHTML(p, a, 'informe-kv', 'informe-desglose', true);
      // El cover NO se repite por persona (se decía 15 veces, idéntico): vive en la cabecera del grupo.
      // Solo se marca la EXCEPCIÓN — quien no lo paga (organizador o cortesía) — igual que en Configurar.
      const sinCov = sel.coverDe(p, a) === 0 && coverGrupoDe(p, a) > 0;
      return `<div class="informe-asis${desg ? ' con-desglose' : ''}">
        <div class="informe-left"><div class="informe-nombre">${check ? '<span class="informe-check">✓</span> ' : ''}${e(nombrePersona(a.personaId))}${anf ? ' <span class="informe-rep-anf">Anfitrión</span>' : ''}${sinCov ? ' <span class="informe-cov">sin cover</span>' : ''}</div></div>
        <div class="informe-total ${cls}">${$peso(monto)}</div>
      </div>${desg}`;
    };
    // Recibos en COLUMNAS: es lo que paga el alto sin tocar el dato. El ancho de la tarjeta compartida (940px)
    // alcanza para dos; cuando el grupo pasa de 15, tres. Se reparten BALANCEANDO CONTENIDO (no conteo): el
    // alto de la sección lo fija la columna más larga, así que lo que pesa son los renglones, no las filas.
    // Una entrada por ASISTENCIA (no solo por quien tiene total > 0): el grupo de Ahorradores debe ser el
    // padrón COMPLETO de quiénes reciben el reparto —un co-organizador sin consumo tiene total 0 y antes
    // desaparecía del documento—. Orden: primero los que deben (mayor a menor), después los saldados.
    const ordenDeuda = new Map(deud.map((d, i) => [d.personaId, i]));
    const entradas = (completa ? (p.asistencias || []) : []).slice().sort((x, y) => {
      const dx = ordenDeuda.has(x.personaId), dy = ordenDeuda.has(y.personaId);
      if (dx !== dy) return dx ? -1 : 1;
      if (dx) return ordenDeuda.get(x.personaId) - ordenDeuda.get(y.personaId);
      return sel.totalAsistencia(p, y) - sel.totalAsistencia(p, x);
    });
    const recibo = a => {
      const debe = ordenDeuda.has(a.personaId);
      const sinCov = sel.coverDe(p, a) === 0 && coverGrupoDe(p, a) > 0;
      const monto = debe ? sel.saldoDe(p, a) : sel.totalAsistencia(p, a);
      return { html: fila(a, monto, debe ? 'pend' : 'ok', !debe, sel.esPrincipal(p, a)),
               n: 1 + sel.resumenConsumoDe(p, a).length,
 };
    };
    const enColumnas = (recibosSinPeso) => {
    // 3 columnas cuando el grupo es grande. El umbral se bajó a 15 porque ahora cada GRUPO se reparte por su
    // cuenta: con 20 ahorradores en dos columnas la tarjeta se iba a 2,3:1 y el teléfono volvía a ajustar por
    // alto (medido). A 940px, tres columnas dan ~290px cada una: alcanza para nombre + total.
    const nCols = recibosSinPeso.length > 15 ? 3 : 2;
    // Reparto EXACTO (no heurístico): se prueban todos los cortes posibles conservando el orden y se elige el
    // que MINIMIZA la columna más alta —que es la que fija el alto de la sección—. Con ≤30 recibos y 2-3
    // columnas el costo es trivial. Peso por recibo: MEDIDO en el render real, cada RENGLÓN de la cabecera
    // (nombre+total, 26px) pesa 1,28 veces una línea de producto (21px); el 0,45 es el aire entre recibos.
    // Contar los renglones del NOMBRE importa: uno de 3 líneas mide 179px y uno corto 90px, y tratarlos igual
    // desbalanceaba las columnas (medido: 52px de más y un hueco de 143px al pie de la primera).
    // Peso por recibo, MEDIDO en el render real: la cabecera (nombre + total, 26px) pesa 1,28 veces una línea
    // de producto (21px) y el 0,45 es el aire entre recibos. Se probó afinarlo estimando los RENGLONES del
    // nombre (por ancho de columna y largo del texto) y salió PEOR: el ancho real que le queda al nombre
    // depende del monto que comparte renglón, de los tags y de los glifos, y el error de la estimación
    // desbalanceaba más de lo que corregía (medido: 281px de dispersión contra 129px con este modelo simple).
    const peso = r => 1.28 + (r.n - 1) + 0.45;
    const recibos = recibosSinPeso;
    const pesos = recibos.map(peso);
    const suma = (i, j) => pesos.slice(i, j).reduce((t, x) => t + x, 0);
    let mejor = null;
    if (nCols === 2) {
      for (let c = 1; c < recibos.length; c++) {
        const alto = Math.max(suma(0, c), suma(c, recibos.length));
        if (!mejor || alto < mejor.alto) mejor = { alto, cortes: [c] };
      }
    } else {
      for (let c1 = 1; c1 < recibos.length - 1; c1++) for (let c2 = c1 + 1; c2 < recibos.length; c2++) {
        const alto = Math.max(suma(0, c1), suma(c1, c2), suma(c2, recibos.length));
        if (!mejor || alto < mejor.alto) mejor = { alto, cortes: [c1, c2] };
      }
    }
    const cortes = (mejor && mejor.cortes) || [];
    const grupos = [];
    let desde = 0;
    [...cortes, recibos.length].forEach(hasta => { grupos.push(recibos.slice(desde, hasta)); desde = hasta; });
    // Se emiten SIEMPRE nCols columnas (alguna puede quedar vacía): con flex, un grupo de un solo recibo
    // ocupaba el ancho completo y su total quedaba a 880px del nombre.
    while (grupos.length < nCols) grupos.push([]);
    return `<div class="informe-cols">${grupos.map(g => `<div class="informe-col">${g.map(r => r.html).join('')}</div>`).join('')}</div>`;
    };
    // AGRUPADO POR ESTADO (idea del PM): el cover —idéntico dentro del grupo— se dice UNA vez en la cabecera
    // en vez de repetirse en cada persona, y el grupo de Ahorradores hace de padrón del reparto.
    const grupoCobro = (estado, titulo) => {
      const gs = entradas.filter(a => a.estadoEnEseMomento === estado);
      if (!gs.length) return '';
      // Solo se anuncia el Cover si ALGUIEN del grupo lo paga: con el anfitrión solo, o con todos exonerados,
      // la cabecera decía "Cover $15.000" y lo cobrado era $0. (El cover nominal no depende de QUIÉN sea el
      // primero del grupo: `coverGrupoDe` mira `estadoEnEseMomento`, que es constante dentro del grupo.)
      const cov = gs.some(a => sel.coverDe(p, a) > 0) ? coverGrupoDe(p, gs[0]) : 0;
      return `<div class="informe-grupo">
        <div class="informe-grupo-head"><span class="informe-grupo-t">${titulo} <span class="informe-grupo-n">${gs.length}</span></span>${cov > 0 ? `<span class="informe-grupo-cov">Cover ${$peso(cov)}</span>` : ''}</div>
        ${enColumnas(gs.map(recibo))}
      </div>`;
    };
    const cobroCols = `${grupoCobro('ahorrador', 'Ahorradores')}${grupoCobro('invitado', 'Invitados')}`;
    // 🔑 LLAVE BRE-B EN EL INFORME (decisión del PM revertida, sep 2026). Antes se excluía a propósito ("el
    // informe es el resumen financiero del Tesorero; el cómo-pagar vive en la hoja Pagar"). En la práctica el
    // PNG es lo que circula por el chat familiar y quien debe lo mira JUSTO para pagar: sin la llave tiene que
    // abrir la app. Se muestra SOLO si alguien debe (si está todo cobrado, sobra) y si hay llave.
    const breB = ((p.pago && p.pago.breB) || (principalId ? (sel.persona(principalId) || {}).breB : null) || '').toString().trim();
    const breBLine = (inf.saldoPendiente > 0 && breB)
      ? `<div class="informe-breb">🔑 <span class="informe-breb-k">Bre-B de ${e(nombrePersona(principalId))}</span><span class="informe-breb-val">${e(breB)}</span></div>`
      : '';
    const cobroTot = inf.saldoPendiente > 0
      ? `<div class="informe-cobro-tot pend">Por cobrar ${$peso(inf.saldoPendiente)}</div>`
      : `<div class="informe-cobro-tot ok">✓ Todo cobrado</div>`;
    // El TOTAL va en la CABECERA de la sección (como en el Balance), no al pie debajo de todos los recibos:
    // el Tesorero lee de una cuánto falta antes de bajar al detalle.
    const cobro = completa
      ? `<div class="informe-cobro"><div class="informe-cobro-head"><span class="informe-sub">Cobro</span>${cobroTot}</div>${breBLine}${cobroCols}</div>`
      : '';

    return `<div class="informe-card">
        <div class="informe-head">
          <span class="informe-brand">Primad<span class="informe-brand-ac">app</span></span>
          <span class="informe-period">${e(p.fecha ? Util.fechaCompleta(p.fecha) : Util.monthYear(p.mesContable))}</span>
        </div>
        <div class="informe-title">${e(nombreCorto(p.nombre))}</div>
        <div class="informe-banda">${hero}${comp}</div>
        ${stat}
        ${cobro}
      </div>`;
  }

  /* ---------- Iconografía: Lucide, SVG inline (ver DESIGN.md › Iconografía) ----------
     Solo los <path>/<line> de cada ícono, copiados de lucide.dev (licencia ISC).
     stroke = currentColor (hereda el color del botón → teal por defecto, --alert en destructivos),
     sin fill, stroke-width 1.75, viewBox 0 0 24 24. */
  const ICON_PATHS = {
    'settings-2': '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    'user':       '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'log-in':     '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    'log-out':    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    'plus-circle':'<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
    'trash-2':    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    'check':      '<polyline points="20 6 9 17 4 12"/>',
    'copy':       '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    'x':          '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    'chevron-down':'<path d="m6 9 6 6 6-6"/>',
    'chevron-left':'<path d="m15 18-6-6 6-6"/>',
    'chevron-right':'<path d="m9 18 6-6-6-6"/>',
    'info':       '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'more-vertical':'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    'rotate-ccw': '<path d="M3 2v6h6"/><path d="M3 8a9 9 0 1 0 2.6-5.6L3 8"/>',
    'eye':        '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    'edit':       '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    'share-2':    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  };
  // icon(name, cls?) → <svg> inline. La clase .icon dimensiona; cls extra opcional.
  function icon(name, cls) {
    const p = ICON_PATHS[name]; if (!p) return '';
    return `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ============================================================
     TAB PRIMADAS (corazón)
     ============================================================ */
  // Dot de estado DERIVADO de actividad real (no de un estado de modelo): cerrada = gris (`closed`);
  // abierta SIN consumos = ámbar (`idle`, creada/organizada pero sin actividad → "pendiente", escalera §1);
  // con consumos = verde (`open`, en operación). Ver DESIGN.md §1 / ciclo de vida.
  function dotClase(p) {
    if (!p) return 'closed';
    // CERRADA con deuda → ÁMBAR, no gris: cerrar congela la cuenta pero NO cobra (INV#4). Con el dot gris,
    // una cerrada a la que todavía le deben se veía IDÉNTICA a una cobrada al 100% (auditoría, sep 2026).
    if (p.estado === 'cerrada') return (S().informePrincipal(p).saldoPendiente > 0) ? 'idle' : 'closed';
    return ((p.consumos || []).length > 0) ? 'open' : 'idle';
  }

  // (LEGADO ELIMINADO) El selector-overlay de primada (`primadaSelectorRow`/`selectorSheet`/`selectorFila`)
  // se quitó con la IA list→detalle: la lista de primadas es ahora el HOME (`homeBody`).

  // CONFIGURACIÓN del evento activo = DOS tabs operativos (seg-nav interno): Asistentes (participación,
  // lista compacta) | Productos (precios). NADA MÁS. La identidad (nombre/fecha/mes) se fija al crear
  // (wizard). UN SOLO punto de config: el gear global › Primadas EMBEBE este cuerpo arriba del calendario
  // (se eliminó el segundo engranaje del selector). ui.configTab = pestaña activa (Asistentes/Productos).
  // CUERPO de configuración del EVENTO ACTIVO (seg-nav Asistentes | Productos + cuerpo). Ya NO es un sheet
  // propio: se EMBEBE en el gear global › Primadas (ÚNICO punto de configuración; el engranaje del selector
  // se eliminó — un solo ícono de config en pantalla). p es la primada activa (el llamador garantiza ≠ null).
  function configPrimadaBody(p, ui) {
    const tab = (ui && ui.configTab === 'productos') ? 'productos' : 'asistentes';
    const seg = (key, label, n) => `<button class="seg ${tab === key ? 'on' : ''}" data-act="config-tab" data-ctab="${key}">${label} <span class="muted">${n}</span></button>`;
    const body = tab === 'productos' ? productosConfig(p, ui) : asistentesListaCompacta(p, ui);
    // Nombre EDITABLE (commitQuiet, no re-render → no pierde foco). Por defecto = suma de organizadores;
    // editable para casos especiales. Al cerrar la hoja, el próximo render refleja el nombre en topbar/home.
    const nombreFld = `<label class="fld cfg-nombre"><span>Nombre</span>
      <input class="ti" data-ch="rename-primada" data-id="${p.id}" value="${e(p.nombre)}" maxlength="40" aria-label="Nombre de la primada"></label>`;
    // FECHA editable con DÍA OPCIONAL: Mes (ancla, siempre) + Día (opcional). Pasa seguido que se programa el mes
    // sin saber el día aún; y el mes se puede mover. Vacío el día = "sin día" (el home muestra solo el mes).
    const dia = (/^\d{4}-\d{2}-(\d{2})$/.exec(String(p.fecha)) || [])[1] || '';
    const fechaFld = `<div class="grid2 cfg-fecha">
      <label class="fld"><span>Mes</span>
        <input class="ti" type="month" data-ch="mes-primada" data-id="${p.id}" value="${e(p.mesContable)}" aria-label="Mes de la primada"></label>
      <label class="fld"><span>Día</span>
        <input class="ti" type="number" min="1" max="31" inputmode="numeric" placeholder="—" data-ch="dia-primada" data-id="${p.id}" value="${dia}" aria-label="Día de la primada"></label>
    </div>`;
    // REGISTRO HISTÓRICO (v7): si la primada es de un MES PASADO (anterior al actual) y está abierta, ofrece
    // ajustar el cover de ENTONCES (propio, distinto del vigente) y el estado de cada quien EN ESE MOMENTO
    // (p.ej. alguien que era invitado y hoy es ahorrador). No afecta el cover actual ni el directorio.
    const esPasada = String(p.mesContable || '') < Util.currentMonth();
    const historico = (esPasada && p.estado !== 'cerrada') ? historicoSeccion(p) : '';
    return `${nombreFld}${fechaFld}<div class="seg-nav cfg-seg">${seg('asistentes', 'Asistentes', p.asistencias.length)}${seg('productos', 'Productos', p.productos.length)}</div>${body}${historico}`;
  }
  // Sección "Cómo fue en su momento": cover propio de la primada + estado histórico por asistente.
  function historicoSeccion(p) {
    const estados = p.asistencias.length
      ? `<div class="cfg-hist-estados">${p.asistencias.map(a => historicoEstadoFila(p, a)).join('')}</div>`
      : '<div class="muted small">Agregá asistentes (arriba) para ajustar su estado de entonces.</div>';
    return `<div class="cfg-hist">
        <div class="sub">Cómo fue en su momento</div>
        <div class="muted small cfg-hist-nota">Primada de un mes pasado: ajustá el cover y el estado de cada quien tal como fue. No cambia el cover actual ni el directorio.</div>
        <div class="grid2">
          <label class="fld"><span>Cover ahorrador</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${p.cover.ahorrador}" data-ch="cover-primada-ahorrador" data-id="${p.id}" aria-label="Cover ahorrador de esta primada"></label>
          <label class="fld"><span>Cover invitado</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${p.cover.invitado}" data-ch="cover-primada-invitado" data-id="${p.id}" aria-label="Cover invitado de esta primada"></label>
        </div>
        <div class="cfg-hist-lbl muted small">Estado en ese momento</div>
        ${estados}
      </div>`;
  }
  function historicoEstadoFila(p, a) {
    const esPrin = S().esPrincipal(p, a);
    // El anfitrión debe ser ahorrador (INV#2): su botón "Invitado" va deshabilitado.
    const seg = est => `<button class="seg ${a.estadoEnEseMomento === est ? 'on' : ''}" data-act="set-estado-momento" data-pid="${a.personaId}" data-estado="${est}" ${esPrin && est === 'invitado' ? 'disabled' : ''}>${cap(est)}</button>`;
    return `<div class="cfg-hist-row">
        <span class="cfg-hist-name"><b>${e(nombrePersona(a.personaId))}</b>${esPrin ? ' <span class="rol-tag">Anfitrión</span>' : ''}</span>
        <span class="seg-nav sm">${seg('ahorrador')}${seg('invitado')}</span>
      </div>`;
  }

  // Tab ASISTENTES: lista COMPACTA agrupada (Ahorradores / Invitados). PRINCIPIO "muestra la excepción,
  // no la regla": el cover común al grupo va UNA vez en el encabezado; la fila solo marca lo que DIFIERE
  // (`Sin cover` cuando el cover efectivo de la persona es 0 — exonerado o cover-free por rol). Sin
  // acordeón, sin rol por fila (el rol se fija al crear). El principal lleva su dot sutil. [✕] quita de
  // la primada (no del directorio). Cerrada: lista visible, acciones deshabilitadas. Si la primada está
  // INCOMPLETA (sin principal, p.ej. migrada) → fix mínimo: botón "Hacer principal" en cada ahorrador.
  function asistentesListaCompacta(p, ui) {
    if (!p.asistencias.length) return `<div class="empty-soft">Sin asistentes</div>${addAsisFoot(p)}`;
    const cerrada = p.estado === 'cerrada';
    const incompleta = S().primadaIncompleta(p);
    const grupo = (estado, titulo) => {
      const filas = p.asistencias.filter(a => a.estadoEnEseMomento === estado);
      if (!filas.length) return '';
      // cover del grupo: una asistencia sintética no-exonerada de ese estado → coverDe (settings si
      // abierta, snapshot si cerrada). Una sola cifra para todo el grupo.
      const coverGrupo = S().coverDe(p, { estadoEnEseMomento: estado, rol: 'asistente', coverExonerado: false });
      const head = `<div class="grp-head"><span class="grp-titulo">${titulo}</span>${coverGrupo > 0 ? `<span class="grp-cover" data-cover-grp="${estado}">Cover ${$peso(coverGrupo)}</span>` : ''}</div>`;
      const items = filas.map(a => asistenteFilaCompacta(p, a, coverGrupo, cerrada, incompleta)).join('');
      return `${head}<div class="asis-compact-list">${items}</div>`;
    };
    const aviso = incompleta
      ? `<div class="cfg-aviso">${badge('falta anfitrión', 'warn')} Asigná quién organiza para completar la primada.</div>`
      : '';
    return `${aviso}${grupo('ahorrador', 'Ahorradores')}${grupo('invitado', 'Invitados')}${addAsisFoot(p)}`;
  }
  function asistenteFilaCompacta(p, a, coverGrupo, cerrada, incompleta) {
    const esPrin = S().esPrincipal(p, a);
    // Fix mínimo: solo mientras la primada esté incompleta y la persona sea ahorrador (INVARIANTE #2).
    const puedePrincipal = incompleta && !cerrada && a.estadoEnEseMomento === 'ahorrador' && !esPrin;
    // "MUESTRA LA EXCEPCIÓN, NO LA REGLA": solo los EXONERADOS llevan un tag tenue "sin cover" (la cortesía
    // se EDITA aparte, con "+ Exonerar cover" al pie → no se mete un toggle en cada fila). Pocos, no ruido.
    const exonerado = a.coverExonerado && a.rol === 'asistente' && coverGrupo > 0;
    return `<div class="asis-compact">
      <span class="asis-compact-id">${esPrin ? '<span class="dot prin" title="Anfitrión"></span>' : '<span class="dot neutral"></span>'}<b>${e(nombrePersona(a.personaId))}</b>${exonerado ? '<span class="sin-cover">sin cover</span>' : ''}</span>
      <span class="asis-compact-acc">
        ${puedePrincipal ? `<button class="xmini hacer-prin" data-act="hacer-principal" data-pid="${a.personaId}">Hacer anfitrión</button>` : ''}
        <button class="xmini" data-act="remove-asistencia" data-pid="${a.personaId}" ${cerrada ? 'disabled' : ''} aria-label="Quitar de la primada">${icon('x')}</button>
      </span>
    </div>`;
  }
  // ¿Hay algún asistente que PAGA cover (rol 'asistente' + cover del grupo > 0)? → tiene sentido ofrecer exonerar.
  function hayCoverParaExonerar(p) {
    return (p.asistencias || []).some(a => a.rol === 'asistente'
      && S().coverDe(p, { estadoEnEseMomento: a.estadoEnEseMomento, rol: 'asistente', coverExonerado: false }) > 0);
  }
  function addAsisFoot(p) {
    if (p.estado === 'cerrada') return '';
    // "+ Agregar asistente" (alta) y, si alguien paga cover, "+ Exonerar cover" (cortesía: elegir a quién no cobrar).
    const exonerar = hayCoverParaExonerar(p)
      ? `<button class="add-link" data-act="open-exonerar">${icon('plus-circle')}Exonerar cover</button>` : '';
    return `<div class="prow-foot"><button class="add-link" data-act="open-add-asis">${icon('plus-circle')}Agregar asistente</button>${exonerar}</div>`;
  }

  // Hoja "Exonerar cover" (cortesía): lista de asistentes que PAGAN cover; tap = exonerar/cobrar (toggle).
  // Reemplaza al toggle por-fila (que metía "Sin cover" en cada asistente). El exonerado lleva check teal.
  function exonerarSheet(state, ui) {
    const p = S().activePrimada();
    const head = `<div class="sheet-head"><div class="sheet-title">Exonerar cover</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>`;
    if (!p) return `<div class="sheet full">${head}<div class="empty-soft">Sin primada</div></div>`;
    const cands = (p.asistencias || []).filter(a => a.rol === 'asistente'
      && S().coverDe(p, { estadoEnEseMomento: a.estadoEnEseMomento, rol: 'asistente', coverExonerado: false }) > 0);
    const filas = cands.length
      ? cands.map(a => `<button class="exon-row ${a.coverExonerado ? 'on' : ''}" data-act="toggle-exonerado" data-pid="${a.personaId}" aria-pressed="${a.coverExonerado ? 'true' : 'false'}">
          <span class="exon-id"><b>${e(nombrePersona(a.personaId))}</b> ${rolTag(a.estadoEnEseMomento)}</span>
          <span class="exon-check">${a.coverExonerado ? icon('check') : ''}</span>
        </button>`).join('')
      : '<div class="empty-soft">Nadie paga cover en esta primada.</div>';
    return `<div class="sheet full">${head}
      <div class="sheet-body">
        <div class="muted small">Tocá a quién NO le cobrás cover (cortesía: niños, invitados gratis). Tocá de nuevo para volver a cobrarle.</div>
        <div class="exon-list">${filas}</div>
      </div></div>`;
  }

  // Progressive disclosure: SOLO lo consumido (cantidad>0) con stepper. Bajar a 0 lo quita
  // (vuelve a estar disponible en el chip picker). Vacío → mensaje, no tarjeta en blanco.
  // MODELO 3 — Lista viva: los productos de la persona ACTIVA se muestran INLINE como CHIPS (no acordeón
  // + stepper). Dos tipos de chip, en una sola fila que envuelve:
  //   · CONSUMIDO (`.chip.has`): emoji + NOMBRE + ×cantidad. El nombre NO desaparece al pasar de disponible a
  //     consumido (antes quedaba solo el emoji → confundía al apuntar, sobre todo con un producto recién creado).
  //     El cuerpo es +1 (gesto frecuente); un `−` chico
  //     subordinado hace −1 (corrección). Solo aparece en la persona activa (es el único lugar con chips).
  //   · DISPONIBLE (`.chip`): emoji + nombre + precio; tap = +1 (0→1 → pasa a ser consumido).
  // CERRADA: chips de solo lectura (sin +/−); si no consumió, "Sin consumo".
  function chipsConsumoViva(p, a, ui) {
    const cerrada = p.estado === 'cerrada';
    // CERRADA: solo lo consumido, de solo lectura (no hay nada que tocar → pill compacto, más denso).
    if (cerrada) {
      const cons = S().consumidosDe(p, a);
      const ro = cons.map(prod =>
        `<span class="chip has ro">${e(prod.emoji)} ${e(prod.nombre)} <b class="chip-q">×${S().cantidadDe(p, a, prod)}</b></span>`).join('');
      const vacioRO = cons.length ? '' : '<div class="muted small consumo-vacio">Sin consumo</div>';
      const auditOpenRO = ui && ui.auditPid === a.personaId;
      const auditBtnRO = cons.length
        ? `<button class="xmini aud-btn ${auditOpenRO ? 'on' : ''}" data-act="toggle-auditoria" data-pid="${a.personaId}" aria-expanded="${auditOpenRO ? 'true' : 'false'}" aria-label="Detalle por evento">${icon('info', 'sm')}</button>`
        : '';
      return `<div class="chips-viva">${ro}${vacioRO}</div>${auditBtnRO}${auditOpenRO ? auditoriaPanel(p, a, ui) : ''}`;
    }
    // ══ ORDEN ESTABLE: TODOS los productos, SIEMPRE, en orden de catálogo ══════════════════════════════
    // ANTES la lista se partía en dos grupos (consumidos arriba, disponibles abajo): al apuntar, el producto
    // SALTABA al grupo de arriba y TODO lo de abajo se reacomodaba **bajo el dedo**. Medido con datos reales:
    // el punto exacto que acababas de tocar pasaba a ser el +1 de OTRO producto, sin animación y en 0,1ms.
    // Querer 3 brownies con 3 toques en el mismo sitio registraba 3 productos distintos (error medido de
    // $64.000, uno de ellos la botella de aguardiente). La causa NO era "un toque = +1" —que es lo mejor del
    // patrón, y se conserva— sino el REFLOW. Hoy nada se mueve nunca: consumir solo cambia el ×N.
    // (Es lo que hacen Square y Toast: rejilla de productos FIJA + el ticket aparte.)
    // La fila mide igual con 0 que con N (mismas 3 columnas): a 0 muestra el PRECIO y el − va inerte; a N≥1
    // muestra ×N y el − corrige. Así tampoco hay salto al pasar de 0 a 1.
    const filas = (p.productos || []).map(prod => {
      const q = S().cantidadDe(p, a, prod);   // v6: cantidad = Σ filas de consumo
      const cero = q === 0;
      const lbl = e(prod.nombre);
      return `<span class="chip has${cero ? ' cero' : ''}">
          <button class="chip-minus" data-act="item-minus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${lbl}: menos"${cero ? ' disabled aria-hidden="true"' : ''}>−</button>
          <button class="chip-plus" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${lbl}: más"><span class="chip-nom">${e(prod.emoji)} ${lbl}</span> ${cero ? `<i class="chip-precio">${$peso(prod.precioVenta)}</i>` : `<b class="chip-q">×${q}</b>`}</button>
          <button class="chip-add" data-act="item-plus" data-pid="${a.personaId}" data-prod="${prod.id}" aria-label="${lbl}: más">+</button>
        </span>`;
    }).join('');
    const chipsCons = filas, chipsDisp = '', vacio = '';
    const consumidos = S().consumidosDe(p, a);
    // AUDITORÍA (C2): el detalle por evento (hora + quién apuntó) NO se exhibe; se pide con el ⓘ.
    const auditOpen = ui && ui.auditPid === a.personaId;
    const auditBtn = consumidos.length
      ? `<button class="xmini aud-btn ${auditOpen ? 'on' : ''}" data-act="toggle-auditoria" data-pid="${a.personaId}" aria-expanded="${auditOpen ? 'true' : 'false'}" aria-label="Detalle por evento">${icon('info', 'sm')}</button>`
      : '';
    return `<div class="chips-viva">${chipsCons}${chipsDisp}${vacio}</div>${auditBtn}${auditOpen ? auditoriaPanel(p, a, ui) : ''}`;
  }

  // Panel de AUDITORÍA (colapsado tras el ⓘ): cada consumo con su HORA + producto + QUIÉN lo apuntó
  // (email resuelto desde ui.apuntadores; '—' si no se pudo, p.ej. anon sin acceso a profiles).
  function auditoriaPanel(p, a, ui) {
    const eventos = S().detalleConsumoDe(p, a);
    if (!eventos.length) return '<div class="aud-panel"><div class="muted small">Sin eventos</div></div>';
    const map = (ui && ui.apuntadores) || {};
    const filas = eventos.map(ev => {
      const quien = ev.apuntadoPor ? (map[ev.apuntadoPor] || 'otro') : '—';
      const prod = ev.prod ? `${e(ev.prod.emoji)} ${e(ev.prod.nombre)}` : '—';
      return `<div class="aud-row"><span class="aud-hora">${Util.horaCorta(ev.createdAt)}</span><span class="aud-prod">${prod}</span><span class="aud-quien">${e(quien)}</span></div>`;
    }).join('');
    return `<div class="aud-panel"><div class="aud-head">Detalle · hora · quién apuntó</div>${filas}</div>`;
  }

  // MODELO 3 — Lista viva: la fila del asistente está SIEMPRE visible (nombre + total), sin chevron ni
  // acordeón. Tap en la fila = ACTIVAR (única activa a la vez, `ui.activaPid`); al activarse, sus productos
  // aparecen INLINE debajo como chips (apuntar en 1 tap) + el bloque de PAGO como footer. El resto de la
  // lista sigue visible. SALDADA: check teal + NOMBRE en teal (escalera de color: teal = resuelto).
  function asistenteFilaViva(p, a, ui) {
    const total = S().totalAsistencia(p, a);
    const esPrin = S().esPrincipal(p, a);
    const activa = ui && ui.activaPid === a.personaId;
    const saldado = S().saldoDe(p, a) === 0 && total > 0;
    // AQUÍ NO SE COBRA (decisión del PM, sep 2026): esta lista es para APUNTAR el consumo. El check de pago
    // vivía también en la fila y quedaba DUPLICADO con el del Balance; se quitó de acá. Pagar es un momento
    // distinto del consumo —pasa mirando el Balance, casi siempre al día siguiente— y ahí vive su control.
    // La fila SÍ sigue DICIENDO quién saldó (nombre en teal + chulo inline) y quién debe (monto en ámbar):
    // informar es lectura, cobrar es acción, y son dos trabajos distintos.
    const debe = !esPrin && total > 0 && !a.pagado;
    const checkInline = saldado ? ` <span class="asis-check" title="Saldado">${icon('check', 'sm')}</span>` : '';
    const fila = `<button class="asis-fila ${activa ? 'on' : ''}" data-act="activar-asis" data-pid="${a.personaId}" aria-expanded="${activa ? 'true' : 'false'}">
          <span class="asis-fila-stack">
            <span class="asis-fila-id ${saldado ? 'saldado' : ''}"><b>${e(nombrePersona(a.personaId))}</b>${checkInline}</span>
            <span class="asis-sub">${rolTag(a.estadoEnEseMomento)}${esPrin ? '<span class="dot prin"></span><span class="rol-tag">Anfitrión</span>' : ''}</span>
          </span>
          <span class="acc-amt${debe ? ' debe' : ''}">${$peso(total)}</span>
        </button>`;
    if (!activa) return `<div class="asis">${fila}</div>`;
    // REVEAL de la persona activa: chips (apuntar) ARRIBA, PAGO abajo (saldar = menos frecuente). El rol,
    // el cover y "Quitar" son CONFIGURACIÓN (overlay Configurar › Asistentes), no aquí.
    return `<div class="asis on">
      ${fila}
      <div class="asis-reveal">
        ${chipsConsumoViva(p, a, ui)}
        ${pagoBlock(p, a)}
      </div>
    </div>`;
  }

  // Bloque de PAGO por asistencia (binario). El que paga se autosirve: "Pagar" abre una hoja con la
  // llave Bre-B del principal + el monto. SIGUE activo aunque la primada esté cerrada (INVARIANTE #4:
  // la cuenta se cierra, los pagos llegan después). El principal está auto-saldado → sin pago.
  function pagoBlock(p, a) {
    if (S().esPrincipal(p, a)) return '';
    const total = S().totalAsistencia(p, a);
    if (total <= 0) return '';
    if (a.pagado) {
      return `<div class="pay paid">
        <span class="pay-state">${icon('check', 'sm')}Pagado</span>
        <button class="mini ghost" data-act="set-no-pagado" data-pid="${a.personaId}">Deshacer</button>
      </div>`;
    }
    return `<div class="pay">
      <button class="mini" data-act="open-pagar" data-pid="${a.personaId}">${icon('log-in')}Pagar ${$peso(total)}</button>
    </div>`;
  }

  // Hoja "Pagar": muestra la llave Bre-B del PRINCIPAL de esta primada (snapshot pago.breB, fallback
  // a la llave vigente del principal) + el monto que debe la persona + "Copiar" + "Ya pagué" (el que
  // paga se autosirve y marca su propio pago). Sin comprobante en la app (se comparte por fuera).
  function pagarSheet(state, ui) {
    const p = S().activePrimada();
    const a = p && (p.asistencias || []).find(x => x.personaId === (ui && ui.pagarPid));
    const head = (titulo) => `<div class="sheet-head"><div class="sheet-title">${titulo}</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>`;
    if (!p || !a) return `<div class="sheet">${head('Pagar')}<div class="empty-soft">Sin datos</div></div>`;
    const total = S().totalAsistencia(p, a);
    const principalId = p.organizadorPrincipalId;
    const llave = (p.pago && p.pago.breB) || (principalId ? (S().persona(principalId) || {}).breB : null) || '';
    const nombrePrin = principalId ? nombrePersona(principalId) : '—';
    const llaveBlock = llave
      ? `<div class="pagar-llave">
           <span class="pagar-llave-val breb-val">${e(llave)}</span>
           <button class="mini ghost" data-act="copiar-llave" data-llave="${e(llave)}">${icon('copy')}Copiar</button>
         </div>`
      : `<div class="muted small">El anfitrión aún no tiene una llave Bre-B.
           <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>`;
    const desg = desgloseHTML(p, a, 'bal-row', 'pagar-desglose');   // qué está pagando, justo cuando va a transferir
    const cuerpo = `
      <div class="pagar-amount">${$peso(total)}</div>
      ${desg}
      <div class="pagar-to">Transfiere por Bre-B a <b>${e(nombrePrin)}</b></div>
      ${llaveBlock}
      <button class="btn" data-act="marcar-pagado" data-pid="${a.personaId}">${icon('check')}Ya pagué</button>`;
    return `<div class="sheet">${head('Pagar a ' + e(nombrePrin))}<div class="sheet-body pagar">${cuerpo}</div></div>`;
  }

  // "+ Agregar" en operación = acción simple: abre una HOJA con el directorio (addAsisSheet).
  // Nada de selector inline ni "Nueva persona" desparramados aquí.
  function pickerAsistentes(p, ui) {
    if (p.estado === 'cerrada') return '';
    return `<button class="add-link" data-act="open-add-asis">${icon('plus-circle')}Agregar</button>`;
  }

  // Hoja simple "Agregar asistente": lista del directorio (los que NO están aún). Tocar uno lo
  // agrega y queda abierta para sumar varios. "Nueva persona" NO vive aquí: enlace a Personas.
  function addAsisSheet(state, ui) {
    const p = S().activePrimada();
    if (!p) return `<div class="sheet full"><div class="sheet-head"><div class="sheet-title">Agregar asistente</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="empty-soft">Sin primada</div></div>`;
    const dentro = new Set(p.asistencias.map(a => a.personaId));
    const fuera = S().personasOrdenadas().filter(per => !dentro.has(per.id));
    // Agregar = UN solo gesto: "+ Agregar" (entra cobrando el cover de su grupo). La CORTESÍA (exonerar el
    // cover a niños/invitados gratis) NO se decide aquí (era confuso): se hace después con el toggle "Sin cover"
    // por asistente en Configurar › Asistentes. Tras agregar, la fila desaparece de esta hoja.
    const filas = fuera.length
      ? fuera.map(per => `<div class="addrow">
          <span class="acc-id"><b>${e(per.nombre)}</b> ${rolTag(per.estado)}</span>
          <button class="mini" data-act="add-asistencia" data-pid="${per.id}">${icon('plus-circle')}Agregar</button>
        </div>`).join('')
      : '<div class="empty-soft">Ya están todos</div>';
    return `<div class="sheet full">
      <div class="sheet-head">
        <div class="sheet-title">Agregar asistente</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="sheet-body">
        <div class="addrow-list">${filas}</div>
        ${altaInline(ui)}
      </div>
    </div>`;
  }

  // ALTA EN LÍNEA de alguien que NO está en el directorio (auditoría de producto, sep 2026).
  // ANTES el pie decía "¿Falta alguien? Agregar en Personas" y llevaba a Ajustes: 9 toques y 3 pantallas,
  // en el momento de mayor presión del anfitrión (alguien parado al frente pidiendo cerveza). Y el form de
  // Ajustes trae "Ahorrador" preseleccionado → el recién llegado entraba al REPARTO y pagaba el cover
  // equivocado, sin que nadie lo notara. Aquí el default es INVITADO (quien llega de sorpresa casi siempre
  // lo es) y la elección se ve, en chips, en vez de esconderse en un <select> que nadie abre.
  function altaInline(ui) {
    const abierta = !!(ui && ui.nuevoAsis);
    if (!abierta) return `<div class="alta-foot"><button class="add-link" data-act="open-nuevo-asis">${icon('plus-circle')}Agregar a alguien nuevo</button></div>`;
    const est = (ui && ui.nuevoAsisEstado) || 'invitado';
    const nom = (ui && ui.nuevoAsisNombre) || '';
    const chip = (v, txt) => `<button class="chip ${est === v ? 'on' : ''}" data-act="set-nuevo-asis-estado" data-estado="${v}">${txt}</button>`;
    return `<div class="alta-foot alta-inline">
      <input class="ti" id="na-nombre" placeholder="Nombre" maxlength="40" autocomplete="off" value="${e(nom)}">
      <div class="alta-chips">${chip('invitado', 'Invitado')}${chip('ahorrador', 'Ahorrador')}</div>
      <button class="mini alta-go" data-act="add-asis-nuevo">${icon('plus-circle')}Agregar</button>
      <div class="alta-hint">Se guarda en el directorio para las próximas primadas.</div>
    </div>`;
  }

  // Tab Primadas = solo OPERAR: asistencias (registrar consumo). La identidad (mes/nombre/estado) y
  // la navegación viven en el SELECTOR de arriba; la config tras el engranaje; la plata en BALANCE.
  // ¿La sección Asistentes está desplegada? SIMÉTRICA al Balance (acordeón): null = default por estado
  // (abierta→abierto para operar, cerrada→colapsado: el documento es el Balance); bool = el usuario lo
  // fijó a mano con el encabezado tocable. Al pagar el ÚLTIMO deudor, el controller la colapsa y abre Balance.
  function asisAbierto(p, ui) {
    if (ui && ui.asisOpen != null) return !!ui.asisOpen;
    return !(p && p.estado === 'cerrada');
  }
  function primadaDetalle(p, ui) {
    // CTA contextual para CERRAR (P5 lote visual): NO vive en Configuración. Aparece como banner arriba
    // de la operación SOLO cuando ya hubo plata y TODOS saldaron (saldoPendiente 0 = nadie debe; el
    // principal está auto-saldado). Es el momento natural de cerrar la cuenta del evento.
    const inf = S().informePrincipal(p);
    const cerrarCTA = (p.estado === 'abierta' && !inf.incompleta && inf.recaudadoTeorico > 0 && inf.saldoPendiente === 0)
      ? `<button class="cerrar-cta" data-act="cerrar-primada" data-id="${p.id}">${icon('check')}Todos pagaron · Cerrar primada</button>`
      : '';
    // ASISTENTES = acordeón SIMÉTRICO al Balance: toggle CENTRADO, teal al abrir (.on), mismo dock. Cuando
    // hubo plata y TODOS saldaron → solo el chulo ✓ teal (minimalista, sin texto). El "+ Agregar" vive en el cuerpo.
    const abierto = asisAbierto(p, ui);
    const cobrado = !inf.incompleta && inf.recaudadoTeorico > 0 && inf.saldoPendiente === 0;
    const ok = cobrado ? `<span class="asis-toggle-ok" title="Todos pagaron">${icon('check', 'sm')}</span>` : '';
    const chip = `<button class="asis-toggle ${abierto ? 'on' : ''}" data-act="toggle-asis-panel" aria-expanded="${abierto ? 'true' : 'false'}">
        <span>Asistentes ${p.asistencias.length}</span>${ok}${icon(abierto ? 'chevron-down' : 'chevron-up')}
      </button>`;
    const picker = pickerAsistentes(p, ui);
    const body = abierto
      ? `<div class="asis-list">
          ${p.asistencias.length
            ? S().asistenciasLista(p).map(a => asistenteFilaViva(p, a, ui)).join('')   // abierta: alfabético ESTABLE (no salta al apuntar); cerrada: por total
            : '<div class="empty-soft">Sin asistentes</div>'}
        </div>${picker ? `<div class="asis-add">${picker}</div>` : ''}`
      : '';
    return `${cerrarCTA}${presenciaLinea(ui)}<div class="asis-dock">${chip}${body}</div>`;
  }

  // PRESENCE (Fase C): línea DISCRETA con quién más está en la primada; si alguien apuntó hace poco
  // (<4s) lo marca "apuntando…". Auto-coordinación, NO bloqueo. ui.presentes = los OTROS (sin mí).
  function presenciaLinea(ui) {
    const otros = (ui && ui.presentes) || [];
    if (!otros.length) return '';
    let ahora = 0; try { ahora = Date.now(); } catch (e) {}
    const apuntando = otros.filter(o => o.apuntando && (ahora - o.apuntando < 4000)).map(o => o.nombre);
    const nombres = otros.map(o => o.nombre);
    const txt = apuntando.length
      ? `${apuntando.join(', ')} apuntando…`
      : `${nombres.join(', ')} ${nombres.length > 1 ? 'están' : 'está'} aquí`;
    return `<div class="presencia ${apuntando.length ? 'apuntando' : ''}">${icon(apuntando.length ? 'edit' : 'eye', 'sm')}<span>${e(txt)}</span></div>`;
  }

  // Gestión de productos PROPIOS de la primada (overlay Configurar). CLON del componente de Personas:
  // cada producto es una FILA ACORDEÓN (.prow + .acc-head + .acc-id-stack). Colapsada = línea liviana
  // (emoji+nombre arriba, venta·margen tenue abajo); abierta = .acc-body con costo/venta (.fld+.ti) y
  // quitar. El alta vive en .prow-foot/.prow-new, igual que "Agregar persona". Precio en vivo →
  // setPreciosProducto usa commitQuiet (sin re-render, no pierde foco).
  // ANATOMÍA CANÓNICA del input de producto (DESIGN.md › "Input de producto"): caja de emoji CHICA
  // (fija) + campo de NOMBRE dominante (ancho). Idéntica en Configurar›Productos (alta) y Wizard Paso 2.
  // El emoji lleva data-auto: '1' = sigue autosugiriéndose al teclear el nombre (vía Util.emojiSugerido
  // en el controller); '0' = el usuario lo fijó A MANO (no se sobreescribe). `manual` es EXPLÍCITO (NO se
  // deriva de si hay emoji): un emoji de catálogo o ya sugerido sigue siendo auto, así la sugerencia
  // sigue al nombre cada vez. Solo tocar el campo de emoji lo pasa a manual. Tocar el emoji abre el teclado.
  function prodIdInput(emojiVal, nombreVal, emojiAttrs, nombreAttrs, manual) {
    const auto = manual ? '0' : '1';
    return `<div class="prod-id">
        <input class="ti emoji" maxlength="2" value="${e(emojiVal || '')}" data-auto="${auto}" ${emojiAttrs} placeholder="🙂" aria-label="Emoji" inputmode="text">
        <input class="ti prod-name" value="${e(nombreVal || '')}" maxlength="40" placeholder="Nombre del producto" ${nombreAttrs} aria-label="Nombre del producto">
      </div>`;
  }

  function productosConfig(p, ui) {
    const cerrada = p.estado === 'cerrada';
    const filas = p.productos.map(prod => productoConfigRow(p, prod, ui)).join('');
    const alta = cerrada ? '' : `<div class="prod-new">
      ${prodIdInput('', '', 'id="pn-emoji"', 'id="pn-nombre"', false)}
      <div class="prod-new-bot">
        <label class="prodrow-f"><span>costo</span><input class="ti num" id="pn-costo" type="number" min="0" step="500" inputmode="numeric" aria-label="Costo neto"></label>
        <label class="prodrow-f"><span>venta</span><input class="ti num" id="pn-venta" type="number" min="0" step="500" inputmode="numeric" aria-label="Precio de venta"></label>
        <button class="mini" data-act="add-producto">${icon('plus-circle')}Agregar</button>
      </div>
    </div>`;
    return `${p.productos.length ? `<div class="prow-list">${filas}</div>` : '<div class="empty-soft">Sin productos</div>'}
      <div class="prow-foot">${alta}</div>`;
  }
  function productoConfigRow(p, prod, ui) {
    const cerrada = p.estado === 'cerrada';
    const ro = cerrada ? 'disabled' : '';
    const abierto = ui && ui.configProd && ui.configProd.has(prod.id);
    const margen = (Number(prod.precioVenta) || 0) - (Number(prod.costoNeto) || 0);
    const cabecera = `<button class="acc-head" data-act="toggle-cfg-prod" data-id="${prod.id}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
        <span class="acc-id-stack">
          <span class="acc-id"><b>${e(prod.emoji)} ${e(prod.nombre)}</b></span>
          <span class="acc-sub">Venta ${$peso(prod.precioVenta)} · margen ${$peso(margen)}</span>
        </span>
      </button>`;
    if (!abierto) return `<div class="prow">${cabecera}</div>`;
    return `<div class="prow open">
      ${cabecera}
      <div class="acc-body">
        ${cerrada ? '' : prodIdInput(prod.emoji, prod.nombre, `data-ch="emoji-producto" data-id="${prod.id}"`, `data-ch="nombre-producto" data-id="${prod.id}"`, true)}
        <div class="grid2">
          <label class="fld"><span>Costo</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-ch="costo-producto" data-id="${prod.id}" ${ro}></label>
          <label class="fld"><span>Venta</span>
            <input class="ti" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-ch="venta-producto" data-id="${prod.id}" ${ro}></label>
        </div>
        <button class="mini danger" data-act="remove-producto" data-id="${prod.id}" ${ro}>${icon('trash-2', 'sm')}Quitar</button>
      </div>
    </div>`;
  }

  // Tab Primadas: SELECTOR de primada arriba (navegación: activa + acceso a todas, agrupadas por
  // año→mes, vía la hoja) + la OPERACIÓN de la activa debajo. El historial ya NO es una lista aparte:
  // vive dentro del selector. CREAR vive SOLO en el gear global › Primadas › "Nueva primada".
  // ── TOPBAR (dinámica por vista) ────────────────────────────────────────────
  function authIcon(estado) { return estado === 'in' ? 'log-out' : (estado === 'out' ? 'log-in' : 'user'); }

  // HOME: marca + acciones [ + Nueva primada · ⚙ Ajustes · 👤 Cuenta ]. El "+" es el ÚNICO punto de creación.
  function topbarHome(state, ui) {
    return `<div class="brand"><h1>Primad<span class="accent">app</span></h1></div>
      <div class="header-actions">
        <button class="gear" data-act="new-primada" title="Nueva primada" aria-label="Nueva primada">${icon('plus-circle')}</button>
        <button class="gear" data-act="open-ajustes" title="Ajustes" aria-label="Ajustes">${icon('settings-2')}</button>
        <button class="gear" id="authBtn" title="Cuenta" aria-label="Cuenta">${icon(authIcon(ui && ui.authEstado))}</button>
      </div>`;
  }

  // DETALLE: ← Inicio · nombre de la primada · [ 🔗 compartir · ··· configurar ].
  function topbarDetalle(state, ui) {
    const p = S().activePrimada();
    if (!p) return topbarHome(state, ui);
    const inc = S().primadaIncompleta(p) ? ' ' + badge('sin anfitrión', 'warn') : '';
    return `<button class="topbar-back" data-act="volver-home" aria-label="Volver a inicio">${icon('chevron-left')}<span>Inicio</span></button>
      <span class="topbar-name">${e(nombreCorto(p.nombre))}${inc}</span>
      <div class="header-actions">
        <button class="gear" data-act="open-config-primada" title="Configurar primada" aria-label="Configurar primada">${icon('settings-2')}</button>
      </div>`;
  }

  /* ============================================================
     HOME — lista de primadas (pantalla de inicio). Reemplaza el tab bar y el selector-overlay.
     · Hero card de la ACTIVA: nombre + mes + dot (SIN monto). · Historial: filas compactas con GANANCIA.
     Tap en cualquier fila/hero = entrar a su detalle (data-act="entrar-primada"). Secciones relativas a la
     activa (Próximas/Pasadas) para no meter una primada futura en "Pasadas" (determinista, no por reloj).
     ============================================================ */
  // ESTADÍSTICAS ANUALES (home) = tarjeta COLAPSABLE AL PIE del home (mismo lugar y dock que el Balance).
  // Toggle CENTRADO/teal + selector de AÑO (‹ 2026 ›). Solo aparece si hay primadas CERRADAS. Jerarquía (reusa
  // los componentes del Balance): HÉROE Ganancia del año → lista PLANA. Los PROMEDIOS no nombran a nadie; el
  // marcador es la palabra "en prom." (no hay símbolo universal de promedio); "por primada" NO se repite
  // (redundante). Las filas de TOTAL del año (Ganancia, Más rentable) van SIN "en prom." para distinguirlas del
  // promedio. "Cada ahorrador recibe" = el número clave en una natillera. Al final, dos filas de RECONOCIMIENTO
  // (celebrar a los activos): "Quien más consumió" (ganador claro, variable continua $) y "Núcleo fiel" = quiénes
  // fueron a TODAS las primadas (reemplaza a "quien más asistió", que era un máximo poco informativo en datos
  // acotados/concentrados: lo compartían casi todos). El núcleo nombra si son pocos (≤3); si son muchos, "N personas".
  // Empates en el reconocimiento: lista hasta 3 nombres ("Ana, Beto y Caro"); de 4+ → "Ana, Beto y N más"
  // (no listar a media familia). Nombres ya vienen ordenados alfabético del selector.
  function nombresLista(nombres) {
    const ns = (nombres || []).map(x => e(x));
    if (ns.length <= 1) return ns[0] || '';
    if (ns.length === 2) return `${ns[0]} y ${ns[1]}`;
    if (ns.length === 3) return `${ns[0]}, ${ns[1]} y ${ns[2]}`;
    return `${ns[0]}, ${ns[1]} y ${ns.length - 2} más`;
  }
  function estadisticasBody(st) {
    const heroe = `<div class="bal-hero">
        <div class="bal-label">Ganancia</div>
        <div class="bal-amount entregado">${$peso(st.ganancia)}</div>
        <div class="bal-note">${st.nPrimadas} primada${st.nPrimadas === 1 ? '' : 's'} · ${$peso(st.gananciaPromedio)} prom.</div>
      </div>`;
    const row = (lbl, valStr) => `<div class="bal-row"><span>${lbl}</span><b>${valStr}</b></div>`;
    // "en prom." marca lo que es PROMEDIO por primada; las filas de TOTAL del año (Más rentable) no lo llevan.
    const prodRow = (lbl, prod, valStr) => prod
      ? row(lbl, `${e(prod.emoji)} ${e(prod.nombre)} · ${valStr}`) : '';
    const stats = `<div class="bal-group">
        ${row('Asistencia', `${st.asistentesPromedio} ${st.asistentesPromedio === 1 ? 'persona' : 'personas'} en prom.`)}
        ${prodRow('Más vendido', st.masVendido, st.masVendido ? st.masVendido.promedioPorPrimada + ' en prom.' : '')}
        ${prodRow('Más rentable', st.masRentable, st.masRentable ? $peso(st.masRentable.margen) : '')}
        ${st.nPrimadas ? row('Cada ahorrador recibe', `${$peso(st.repartoPorAhorrador)} en prom.`) : ''}
        ${st.nPrimadas ? row('Consumo por persona', `${$peso(st.consumoPorPersona)} en prom.`) : ''}
        ${st.masConsumio ? row('Quien más consumió', `${nombresLista(st.masConsumio.nombres)} · ${$peso(st.masConsumio.valor)}`) : ''}
        ${st.nucleoFiel ? row('Núcleo fiel', st.nucleoFiel.total <= 3 ? nombresLista(st.nucleoFiel.nombres) : `${st.nucleoFiel.total} personas`) : ''}
      </div>`;
    return `<div class="card dark bal-card">${heroe}${stats}</div>`;
  }
  // Selector de año ‹ 2026 ›: navega entre los años con primadas cerradas. Flechas deshabilitadas en los extremos.
  function statsAnioNav(anios, anio) {
    const i = anios.indexOf(anio);
    const flecha = (dir, destino, icono) =>
      `<button class="stats-anio-nav" data-act="stats-anio" data-anio="${destino || ''}" ${destino ? '' : 'disabled'} aria-label="Año ${dir}">${icon(icono)}</button>`;
    return `<div class="stats-anio">
        ${flecha('anterior', anios[i - 1], 'chevron-left')}
        <span class="stats-anio-lbl">${e(anio)}</span>
        ${flecha('siguiente', anios[i + 1], 'chevron-right')}
      </div>`;
  }
  function estadisticasCard(state, ui) {
    const sel = S();
    const anios = sel.aniosEstadisticas();
    if (!anios.length) return '';   // sin primadas cerradas → nada firme que mostrar
    // Año seleccionado: ui.statsAnio si sigue siendo válido; si no, el MÁS RECIENTE con datos.
    let anio = ui && ui.statsAnio != null ? String(ui.statsAnio) : '';
    if (anios.indexOf(anio) < 0) anio = anios[anios.length - 1];
    const open = !!(ui && ui.statsOpen);
    const toggle = `<button class="balance-toggle ${open ? 'on' : ''}" data-act="toggle-stats" aria-expanded="${open ? 'true' : 'false'}"><span>Estadísticas</span>${icon(open ? 'chevron-down' : 'chevron-up')}</button>`;
    const panel = open
      ? `<div class="stats-panel">${anios.length > 1 ? statsAnioNav(anios, anio) : `<div class="stats-anio"><span class="stats-anio-lbl">${e(anio)}</span></div>`}${estadisticasBody(sel.estadisticas(anio))}</div>`
      : '';
    return `<div class="stats-dock">${toggle}${panel}</div>`;
  }
  function homeBody(state, ui) {
    const sel = S();
    if (!state.primadas.length) {
      return `<div class="empty-soft big primada-vacia">
        <div class="ph-title">Tu primera primada</div>
        <div>Tocá <b>+</b> arriba para crear la primera.</div>
      </div>`;
    }
    const activeId = state.activePrimadaId;
    const activa = sel.activePrimada();
    const proximas = sel.primadasProximas(activeId);
    const pasadas = sel.primadasPorAnio()
      .map(g => ({ anio: g.anio, primadas: g.primadas.filter(p => p.id !== activeId && !sel.esFutura(p, activeId)) }))
      .filter(g => g.primadas.length);
    const secProx = proximas.length
      ? `<div class="home-sub">Próximas</div><div class="hist-list">${proximas.map(historialFila).join('')}</div>` : '';
    const secPas = pasadas.length
      ? `<div class="home-sub">Pasadas</div>` + pasadas.map(g =>
          `<div class="home-anio">${e(g.anio)}</div><div class="hist-list">${g.primadas.map(historialFila).join('')}</div>`).join('')
      : '';
    return `<div class="home">${activa ? heroCard(activa) : ''}${porCobrarCard()}${secProx}${secPas}${estadisticasCard(state, ui)}</div>`;
  }

  // POR COBRAR — la plata que falta por entrar, de TODAS las primadas. Sin esto, una cerrada con saldo
  // pendiente desaparecía del radar: su fila se veía igual que una cobrada al 100% y la deuda se olvidaba
  // al mes siguiente (auditoría de producto, sep 2026). UNA fila por primada (tap = entrar a cobrar); los
  // nombres van de subtexto hasta 3 —el mismo criterio de "Núcleo fiel"— y arriba de eso, el conteo.
  // Si no hay deuda, NO se pinta nada: muestra la excepción, no la regla.
  function porCobrarCard() {
    const filas = S().deudasPendientes();
    if (!filas.length) return '';
    const fila = ({ primada, saldo, deudores }) => {
      const nombres = deudores.map(d => nombrePersona(d.personaId)).sort((a, b) => a.localeCompare(b, (root.CONFIG || {}).locale, { sensitivity: 'base' }));
      const quien = nombres.length <= 3 ? nombres.join(', ') : `${nombres.length} personas`;
      const cuando = primada.fecha ? Util.diaMes(primada.fecha) : Util.monthName(primada.mesContable);
      return `<button class="cobrar-fila" data-act="entrar-primada" data-id="${primada.id}">
        <span class="cobrar-id"><span class="cobrar-name">${e(nombreCorto(primada.nombre))} <span class="hist-mes">${e(cuando)}</span></span><span class="cobrar-quien">${e(quien)}</span></span>
        <span class="cobrar-monto">${$peso(saldo)}</span>
      </button>`;
    };
    return `<div class="cobrar-card">
      <div class="cobrar-head"><span class="home-sub">Por cobrar</span><b class="cobrar-tot">${$peso(S().deudaTotal())}</b></div>
      <div class="cobrar-list">${filas.map(fila).join('')}</div>
    </div>`;
  }

  // Botón "···" de opciones administrativas de una primada (Reabrir / Eliminar). Abre primadaMenuSheet.
  function rowMenuBtn(p) {
    return `<button class="row-menu" data-act="primada-menu" data-id="${p.id}" aria-label="Opciones de ${e(nombreCorto(p.nombre))}">${icon('more-vertical')}</button>`;
  }

  // Hero card de la primada activa: nombre + mes + dot de estado. SIN monto (decisión de producto). "···" en la esquina.
  function heroCard(p) {
    return `<div class="hero-row">
      <button class="hero-card" data-act="entrar-primada" data-id="${p.id}" aria-label="Abrir ${e(nombreCorto(p.nombre))}">
        <span class="hero-dot dot ${dotClase(p)}"></span>
        <span class="hero-id">
          <span class="hero-name">${e(nombreCorto(p.nombre))}</span>
          <span class="hero-mes">${e(p.fecha ? Util.fechaCompleta(p.fecha) : Util.monthYear(p.mesContable))}</span>
        </span>
      </button>
      ${rowMenuBtn(p)}
    </div>`;
  }

  // Fila compacta de historial: dot + nombre + mes + GANANCIA + "···". Sin chevron (el tap entra).
  function historialFila(p) {
    return `<div class="hist-row">
      <button class="hist-fila" data-act="entrar-primada" data-id="${p.id}" aria-label="Abrir ${e(nombreCorto(p.nombre))}">
        <span class="hist-id"><span class="dot ${dotClase(p)}"></span><span class="hist-name">${e(nombreCorto(p.nombre))}</span> <span class="hist-mes">${e(p.fecha ? Util.diaMes(p.fecha) : Util.monthName(p.mesContable))}</span></span>
        <span class="hist-gan">${$peso(S().ganancia(p))}</span>
      </button>
      ${rowMenuBtn(p)}
    </div>`;
  }

  // Hoja "···" de una primada (desde el home): Reabrir (si cerrada) / Eliminar (con confirmación). Sin swipe.
  function primadaMenuSheet(state, ui) {
    const p = state.primadas.find(x => x.id === ui.primadaMenuId);
    if (!p) return '';
    const esActiva = p.id === state.activePrimadaId;
    return `<div class="sheet">
      <div class="sheet-head"><div class="sheet-title">${e(nombreCorto(p.nombre))}</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="sheet-body menu-list">
        ${p.estado === 'cerrada'
          ? `<button class="menu-item" data-act="reabrir-primada" data-id="${p.id}">${icon('rotate-ccw')}Reabrir</button>`
          : `<button class="menu-item" data-act="cerrar-primada" data-id="${p.id}">${icon('check')}Cerrar primada</button>`}
        <button class="menu-item danger" data-act="borrar-primada" data-id="${p.id}" ${esActiva ? 'data-activa="1"' : ''}>${icon('trash-2')}Eliminar</button>
      </div>
    </div>`;
  }

  /* ============================================================
     DETALLE — espacio operativo de la primada activa. La identidad (nombre/mes) vive en la topbar.
     El Balance ya NO es un seg-nav: es un PANEL inferior (mismo scroll), subordinado a la Lista viva.
     Un chip "Balance ▲/▼" lo despliega/colapsa. Default por estado: ABIERTA = colapsado (Consumos es lo
     que importa); CERRADA = desplegado (el Balance es el documento final). Reusa balancePrimada() tal cual.
     ============================================================ */
  // ¿El panel de Balance está desplegado? null = default por estado (cerrada→sí, abierta→no); bool = manual.
  function balanceAbierto(p, ui) {
    if (ui && ui.balanceOpen != null) return !!ui.balanceOpen;
    return !!(p && p.estado === 'cerrada');
  }
  function detalleBody(state, ui) {
    const activa = S().activePrimada();
    if (!activa) return homeBody(state, ui);
    const abierto = balanceAbierto(activa, ui);
    // El chip lleva el DATO CLAVE (DESIGN §0: el elemento de arriba comunica el número; el detalle vive dentro).
    // Con deuda → "· Por cobrar $X" (ámbar), abierta O cerrada (cerrar no la esconde: es plata que aún falta);
    // sin deuda → cerrada "· Ganancia $X" (teal) / abierta "· ✓ Todo cobrado". Antes solo decía "Balance" y la
    // pregunta nº 1 de la noche ("¿cuánto falta?") exigía desplegar el panel y hacer scroll. Incompleta → nada.
    const pc = S().activePrimada();
    const infc = pc ? S().informePrincipal(pc) : null;
    let kv = '';
    if (infc && !infc.incompleta) {
      if (infc.saldoPendiente > 0)        kv = `<span class="bt-kv pend">· Por cobrar ${$peso(infc.saldoPendiente)}</span>`;
      else if (pc.estado === 'cerrada')   kv = `<span class="bt-kv ok">· Ganancia ${$peso(S().ganancia(pc))}</span>`;
      else if (infc.recaudadoTeorico > 0) kv = `<span class="bt-kv ok">· ✓ Todo cobrado</span>`;
    }
    const chip = `<button class="balance-toggle ${abierto ? 'on' : ''}" data-act="toggle-balance-panel" aria-expanded="${abierto ? 'true' : 'false'}">
      <span>Balance</span>${kv}${icon(abierto ? 'chevron-down' : 'chevron-up')}</button>`;
    // "Compartir informe" vive AL FINAL del panel (es lo que el informe muestra: Ganancia + Recaudo), no en la
    // topbar (allí confundía / se tocaba sin querer en medio de operar). Solo si hay datos que compartir.
    const compartir = hayDatosInforme(activa)
      ? `<button class="compartir-link" data-act="compartir-informe">${icon('share-2')}Compartir informe</button>`
      : '';
    // CERRAR (o REABRIR) la cuenta, al pie del Balance. ANTES el único cerrar del detalle era el banner verde
    // "Todos pagaron", que aparece SOLO con saldoPendiente 0 → con deuda pendiente no había forma de cerrar
    // sin volver al home (auditoría de producto, sep 2026). El caso real del anfitrión a la 1 a.m. es el
    // contrario: la fiesta se acabó, FALTA plata por cobrar, y quiere congelar la cuenta para que nadie
    // apunte más. INVARIANTE #4 lo soporta: cerrar congela la cuenta pero SIGUE aceptando pagos. Va aquí
    // —no en la topbar ni en Configurar— porque el Balance es la superficie del final de la noche, y queda
    // justo debajo de "Por cobrar $X": se ve la deuda y se decide con ella a la vista.
    const cerrar = activa.estado === 'cerrada'
      ? `<button class="cerrar-link" data-act="reabrir-primada" data-id="${activa.id}">${icon('rotate-ccw')}Reabrir la cuenta</button>`
      : `<button class="cerrar-link" data-act="cerrar-primada" data-id="${activa.id}">${icon('check')}Cerrar la cuenta</button>`;
    const panel = abierto ? `<div class="balance-panel">${balancePrimada(activa, ui)}${compartir}${cerrar}</div>` : '';
    return `${primadaDetalle(activa, ui)}<div class="balance-dock">${chip}${panel}</div>`;
  }

  // Hoja "···" de configuración de la primada activa (re-wrap de configPrimadaBody: Asistentes | Productos).
  function configPrimadaSheet(state, ui) {
    const p = S().activePrimada();
    const head = `<div class="sheet-head"><div class="sheet-title">${p ? e(nombreCorto(p.nombre)) : 'Configurar'}</div>
      <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>`;
    if (!p) return `<div class="sheet full">${head}<div class="empty-soft">Sin primada activa.</div></div>`;
    return `<div class="sheet full">${head}<div class="sheet-body">${configPrimadaBody(p, ui)}</div></div>`;
  }

  /* ============================================================
     BALANCE — RESUMEN EJECUTIVO para el Tesorero (§2.11.1.a). UNA card, SIN acordeón interno: al abrir el
     panel se ve TODO el resumen de una. Orden por relevancia para el Tesorero:
       1) HÉROE Ganancia (teal) — lo que entra al fondo / se entrega al Tesorero (= entregaTesorero).
       2) KPI Parte igual c/u — el segundo número clave (lo que recibe cada ahorrador).
       3) COMPOSICIÓN — Cover + Margen (cómo se arma), Reembolso de productos (passthrough, atenuado),
          Sobrante al fondo (solo si > 0). Filas agrupadas SIN líneas por fila (la jerarquía la da el espacio).
       4) COBRO — la llave 🔑 Bre-B (cómo pagan los deudores) + quién debe (ámbar) / quién pagó (check teal).
          La Bre-B aparece SOLO si hay saldo pendiente (alguien debe), abierta o cerrada (cubre pagos tardíos);
          se oculta cuando todo está cobrado. A diferencia del informe PNG, aquí SÍ va: el Balance es operativo.
     UN solo divisor (composición | cobro). Cero números repetidos. Mismos selectores → cifras idénticas. */
  function balancePrimada(p, ui) {
    const sel = S();
    const gan = sel.ganancia(p);
    const ahorr = sel.asistenciasAhorradoras(p);
    const pi = sel.parteIgual(p);
    const sob = sel.sobranteFondo(p);
    const inf = sel.informePrincipal(p);
    const completa = !inf.incompleta;
    const cerrada = p.estado === 'cerrada';
    const prinId = p.organizadorPrincipalId;
    // Llave Bre-B del anfitrión (snapshot pago.breB con fallback a la persona vigente). Valor en teal (.breb-val).
    const breB = ((p.pago && p.pago.breB) || (prinId ? (sel.persona(prinId) || {}).breB : null) || '').toString().trim();
    // Listas de cobro = registro TRANSPARENTE del consumo de cada quien. Deudores (por saldo) y saldados (✓),
    // de MAYOR a MENOR. El ANFITRIÓN aparece SIEMPRE como saldado (consumo en mano, auto-saldado), marcado.
    const deud = (completa ? sel.deudores(p).filter(d => d.personaId !== prinId) : [])
      .slice().sort((a, b) => b.saldo - a.saldo);
    const saldadas = (completa ? (p.asistencias || []) : [])
      .filter(a => (sel.esPrincipal(p, a) || a.pagado) && sel.totalAsistencia(p, a) > 0)
      .map(a => ({ a, total: sel.totalAsistencia(p, a) }))
      .sort((x, y) => y.total - x.total);

    // 1) HÉROE — Ganancia (teal, regla global). Cerrada: "al Tesorero". Abierta: provisional.
    const hero = `<div class="bal-hero">
        <div class="bal-label"><span class="dot ${cerrada ? 'closed' : ''}"></span>Ganancia${cerrada ? ' · al Tesorero' : ''}</div>
        <div class="bal-amount entregado">${$peso(gan)}</div>
        ${cerrada
          ? (inf.saldoPendiente > 0 ? `<div class="bal-note pend">${$peso(inf.saldoPendiente)} aún por cobrar</div>` : '')
          : `<div class="bal-note">Provisional — se confirma al cerrar</div>`}
      </div>`;

    // 2) REPARTO — A QUIÉNES se distribuye: los AHORRADORES (cada uno recibe parteIgual). El ANFITRIÓN también
    // recibe (siempre es ahorrador) → va en la lista, marcado. Los invitados NO reciben. Es lo que el Tesorero
    // distribuye —distinto del COBRO (quién paga). Anfitrión primero, luego por nombre.
    const ahorrLista = ahorr.slice().sort((a, b) =>
      (sel.esPrincipal(p, b) ? 1 : 0) - (sel.esPrincipal(p, a) ? 1 : 0)
      || nombrePersona(a.personaId).localeCompare(nombrePersona(b.personaId)));
    // §0 "no repetir entre niveles": el MONTO (parteIgual, igual para todos) UNA vez en la cabecera; la lista
    // solo NOMBRES (el dato nuevo: a quiénes). NO se repite el monto por fila.
    const repRows = ahorrLista.map(a =>
      `<div class="bal-rep">${e(nombrePersona(a.personaId))}${sel.esPrincipal(p, a) ? ' <span class="bal-rep-anf">Anfitrión</span>' : ''}</div>`).join('');
    const stat = ahorr.length
      ? `<div class="bal-stat">
          <div class="bal-stat-k">Reparto a ahorradores<span class="bal-stat-sub">${ahorr.length} ${ahorr.length === 1 ? 'ahorrador' : 'ahorradores'}</span></div>
          <div class="bal-stat-v">${$peso(pi)} <span class="bal-stat-cu">c/u</span></div>
        </div>
        <div class="bal-rep-list">${repRows}</div>`
      : `<div class="bal-stat"><div class="bal-stat-k">Sin ahorradores aún</div></div>`;

    // 3) COMPOSICIÓN — sin líneas por fila; el espacio agrupa. Reembolso atenuado (passthrough, NO ingreso).
    const comp = `<div class="bal-group">
        <div class="bal-row"><span>Cover</span><b>${$peso(sel.coverCobrado(p))}</b></div>
        <div class="bal-row"><span>Margen</span><b>${$peso(sel.margenTotal(p))}</b></div>
        ${completa ? `<div class="bal-row dim"><span>Reembolso a ${e(nombrePersona(prinId))} <span class="bal-rep-anf">Anfitrión</span></span><b>${$peso(inf.recuperaPrincipal)}</b></div>` : ''}
        ${sob > 0 ? `<div class="bal-row"><span>Sobrante al fondo</span><b>${$peso(sob)}</b></div>` : ''}
      </div>`;

    // 4) COBRO — cabecera "Por cobrar $X" (ámbar) / "✓ Todo cobrado" (teal) + lista (deudores ámbar, saldados check teal).
    let cobro;
    if (!completa) {
      cobro = `<div class="bal-sep"></div><div class="bal-group"><div class="bal-row"><span class="muted small">Asigná un anfitrión para el cobro</span></div></div>`;
    } else if (deud.length || saldadas.length) {
      // Cada persona = cabecera (nombre + total, ámbar si debe / teal si pagó) + su MINI RECIBO indentado debajo
      // (mismo bloque que el informe y la hoja Pagar): ve QUÉ se le cobra sin salir del Balance.
      // CHULEAR EL PAGO DESDE ACÁ (decisión del PM, sep 2026). El Balance era de SOLO LECTURA: se veía quién
      // debe y su desglose, pero para marcar que pagó había que SUBIR, desplegar Asistentes y buscar a la
      // persona — y al día siguiente (primada cerrada, alguien transfiere) el Balance es justo la pantalla
      // donde uno está mirando. Es el MISMO control de la lista (mismo círculo, misma acción, mismo toast),
      // no un gesto nuevo: solo vive también acá. El anfitrión está auto-saldado → columna vacía, para que
      // los montos no se descuadren.
      const persona = (a, monto, cls, check, anf) => {
        const puede = !anf && S().totalAsistencia(p, a) > 0;
        const pay = puede
          ? `<button class="asis-pay bal-pay ${a.pagado ? 'on' : ''}" data-act="toggle-pagado" data-pid="${a.personaId}" aria-pressed="${a.pagado ? 'true' : 'false'}" aria-label="${e(nombrePersona(a.personaId))}: ${a.pagado ? 'pagado, tocar para deshacer' : 'marcar como pagado'}"><span class="circ">${a.pagado ? icon('check', 'sm') : ''}</span></button>`
          : '<span class="asis-pay-sp" aria-hidden="true"></span>';
        return `<div class="bal-persona">
        <div class="bal-linea"><div class="bal-row${check ? ' saldada' : ''}"><span>${check ? `<span class="asis-check">${icon('check', 'sm')}</span>` : ''}${e(nombrePersona(a.personaId))}${anf ? ' <span class="bal-rep-anf">Anfitrión</span>' : ''}</span><b class="${cls}">${$peso(monto)}</b></div>${pay}</div>
        ${desgloseHTML(p, a, 'bal-row', 'bal-desglose')}
      </div>`;
      };
      // ══ ORDEN ESTABLE TAMBIÉN ACÁ (revisión de estabilidad táctil, sep 2026) ══════════════════════════
      // La lista se partía en DOS grupos (deudores arriba, saldados abajo). Al chulear un pago, esa persona
      // MIGRABA de grupo y la lista se reacomodaba **bajo el dedo**: medido con datos reales, con el scroll
      // quieto, tres toques en el MISMO punto marcaron como pagadas a TRES PERSONAS DISTINTAS. Es el mismo
      // bug del reflow de los chips, pero acá cuesta plata de verdad (se salda a quien no pagó).
      // Ahora es UNA sola lista, ordenada por TOTAL descendente —criterio que NO depende de si pagó— y
      // pagar solo cambia la TINTA (ámbar → check teal). Nadie cambia de sitio nunca.
      // El monto mostrado no cambia: con pago binario, el saldo de un deudor ES su total.
      const filasCobro = (p.asistencias || [])
        .filter(a => sel.totalAsistencia(p, a) > 0)
        .map(a => ({ a, total: sel.totalAsistencia(p, a), saldada: sel.esPrincipal(p, a) || !!a.pagado }))
        .sort((x, y) => y.total - x.total);
      const pendRows = filasCobro
        .map(({ a, total, saldada }) => persona(a, total, saldada ? 'pagado' : 'pend', saldada, sel.esPrincipal(p, a)))
        .join('');
      const saldRows = '';
      const head = inf.saldoPendiente > 0
        ? `Por cobrar <b class="pend">${$peso(inf.saldoPendiente)}</b>`
        : `<span class="bal-cobro-ok">${icon('check', 'sm')}Todo cobrado</span>`;
      // 🔑 Bre-B para los deudores: solo si alguien debe (y hay llave). Si todo cobrado, no se muestra.
      const breBLine = (inf.saldoPendiente > 0 && breB)
        ? `<div class="bal-breb">🔑 Bre-B <span class="breb-val">${e(breB)}</span></div>`
        : '';
      cobro = `<div class="bal-sep"></div><div class="bal-cobro-head">${head}</div>${breBLine}<div class="bal-group">${pendRows}${saldRows}</div>`;
    } else {
      cobro = '';   // nadie consumió todavía: nada que cobrar
    }

    return `<div class="card dark bal-card">${hero}${stat}${comp}${cobro}</div>`;
  }

  /* ============================================================
     PANTALLAS de Ajustes globales: Personas (directorio) y Ajustes
     ============================================================ */
  // Fila liviana de persona (DESIGN.md §2.9): dos líneas, expandible inline para editar.
  // Cerrada: línea 1 = nombre + rol (etiqueta tenue, igual que la fila de asistente);
  //          línea 2 tenue = nº de primadas. Abierta: edición en contexto (nombre, rol, Bre-B).
  // Su historia se conserva al cambiar de estado (INVARIANTE #1).
  // Directorio PERSONAS = LISTA COMPACTA agrupada (Ahorradores / Invitados), una línea por persona
  // (nombre + nº de primadas + chevron de drill-in). Tap → EDITAR ENFOCADO (personaEditView): la lista
  // queda escaneable y editar es un detalle de una sola persona, no un muro de acordeones inline.
  // Sección COLAPSABLE de Ajustes (acordeón con caret (v)). key = clave en ui.ajustesSec (Set de abiertas);
  // colapsadas por defecto → la primera pantalla queda corta y "Agregar persona" cae a la mano.
  function ajustesSecAbierta(ui, key) { return !!(ui && ui.ajustesSec && ui.ajustesSec.has && ui.ajustesSec.has(key)); }
  function accAjustes(key, titulo, meta, abierto, body) {
    return `<div class="aj-acc">
      <button class="aj-acc-head" data-act="toggle-ajustes-sec" data-sec="${key}" aria-expanded="${abierto ? 'true' : 'false'}">
        <span class="aj-acc-title">${titulo}</span>${meta ? `<span class="aj-acc-meta">${meta}</span>` : ''}<span class="acc-caret ${abierto ? 'open' : ''}">${icon('chevron-down')}</span>
      </button>
      ${abierto ? `<div class="aj-acc-body">${body}</div>` : ''}
    </div>`;
  }

  function personasBody(state, ui) {
    if (ui && ui.editPersonaId) {
      const per = S().persona(ui.editPersonaId);
      if (per) return personaEditView(per, ui);
    }
    const personas = S().personasOrdenadas();
    // Ahorradores / Invitados como ACORDEONES (v): colapsados por defecto → no llenan la pantalla.
    const grupo = (estado, titulo) => {
      const filas = personas.filter(p => p.estado === estado);
      const body = filas.length
        ? `<div class="persona-list">${filas.map(personaFilaCompacta).join('')}</div>`
        : '<div class="empty-soft">Ninguno todavía</div>';
      return accAjustes('per-' + estado, titulo, String(filas.length), ajustesSecAbierta(ui, 'per-' + estado), body);
    };
    const lista = `${grupo('ahorrador', 'Ahorradores')}${grupo('invitado', 'Invitados')}`;
    const nueva = ui && ui.nuevaPersona;
    const alta = nueva
      ? `<div class="prow-new">
          <input class="ti" id="np-nombre" placeholder="Nombre" maxlength="40">
          <select class="sel" id="np-estado">
            <option value="ahorrador">Ahorrador</option>
            <option value="invitado">Invitado</option>
          </select>
          <button class="mini" data-act="add-persona">${icon('plus-circle')}Agregar</button>
        </div>`
      : `<button class="add-link" data-act="open-nueva-persona">${icon('plus-circle')}Agregar persona</button>`;
    return `${lista}<div class="prow-foot">${alta}</div>`;
  }
  // Fila compacta de persona (drill-in): nombre + nº primadas; tap = editar enfocado.
  function personaFilaCompacta(per) {
    const ap = S().aparicionesDe(per.id);
    const meta = ap ? (ap + ' primada' + (ap > 1 ? 's' : '')) : 'Sin primadas';
    return `<button class="persona-fila" data-act="editar-persona" data-pid="${per.id}">
      <span class="persona-fila-id"><b>${e(per.nombre)}</b> <span class="persona-fila-meta">${meta}</span></span>
      <span class="persona-fila-caret">${icon('chevron-right')}</span>
    </button>`;
  }
  // EDICIÓN ENFOCADA de UNA persona (drill-in dentro del tab Personas): back + nombre + estado + Bre-B.
  // Conserva TODO lo ajustable; solo cambia la presentación (detalle, no acordeón en una lista gigante).
  function personaEditView(per, ui) {
    const ap = S().aparicionesDe(per.id);
    const seg = est => `<button class="seg ${per.estado === est ? 'on' : ''}" data-act="set-estado-persona" data-pid="${per.id}" data-estado="${est}">${cap(est)}</button>`;
    return `<button class="back-link" data-act="cerrar-persona-edit">${icon('chevron-left')}Personas</button>
      <div class="persona-edit">
        <label class="fld"><span>Nombre</span>
          <input class="ti" data-ch="rename-persona" data-pid="${per.id}" value="${e(per.nombre)}" maxlength="40" aria-label="Nombre"></label>
        <div class="fld"><span>Estado</span>
          <div class="seg-nav sm">${seg('ahorrador')}${seg('invitado')}</div></div>
        <label class="fld"><span>Bre-B</span>
          <input class="ti breb" data-ch="breb-persona" data-pid="${per.id}" value="${per.breB ? e(per.breB) : ''}" placeholder="Bre-B" aria-label="Bre-B"></label>
        <div class="muted small mt-3">${ap ? ('Aparece en ' + ap + ' primada' + (ap > 1 ? 's' : '')) : 'Sin primadas todavía'}</div>
      </div>`;
  }

  function ajustesBody(state, ui) {
    const c = state.settings.cover;
    // Build incrustado (meta sellado) → para confirmar de un vistazo qué versión corre en el device.
    const build = (typeof document !== 'undefined' && (document.querySelector('meta[name="build"]') || {}).content) || '—';
    // "Borrar mi cuenta" (Apple 5.1.1(v)): SOLO con sesión. Revoca el acceso; el libro de las primadas se
    // conserva (es colectivo). Distinto de cerrar una primada. La acción la gatea el RPC (último admin, etc.).
    // Cuenta: NO colapsable (acción importante), con espaciado claro entre título, botón y nota.
    const cuenta = (ui && ui.sesion)
      ? `<div class="cuenta-sec">
          <div class="sub danger-sub">Cuenta</div>
          <button class="mini danger" data-act="borrar-mi-cuenta">${icon('trash-2')}Borrar mi cuenta</button>
          <div class="muted small cuenta-nota">Se elimina tu acceso (correo). Las cuentas de las primadas se conservan.</div>
        </div>`
      : '';
    // Cover / Legal / Versión como ACORDEONES (v): colapsados por defecto.
    const coverBody = `<div class="grid2">
        <label class="fld"><span>Ahorrador</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-ahorrador" value="${c.ahorrador}"></label>
        <label class="fld"><span>Invitado</span>
          <input class="ti" type="number" min="0" step="500" data-ch="cover-invitado" value="${c.invitado}"></label>
      </div>`;
    const legalBody = `<a class="link-legal" href="privacy.html" target="_blank" rel="noopener">Política de Privacidad</a>`;
    const versionBody = `<div class="muted small">${e(build)}</div>`;
    return `${accAjustes('cover', 'Cover', '', ajustesSecAbierta(ui, 'cover'), coverBody)}
      ${accAjustes('legal', 'Legal', '', ajustesSecAbierta(ui, 'legal'), legalBody)}
      ${accAjustes('version', 'Versión', '', ajustesSecAbierta(ui, 'version'), versionBody)}
      ${cuenta}`;
  }

  // Sheet a pantalla completa con seg-nav Personas | Ajustes.
  /* ============================================================
     WIZARD "Nueva primada" — 3 pasos sobre la app (estado efímero en ui.wizard)
     ui.wizard = { paso, principalId, coorg:[ids], productos:[...], fecha, mesContable }
     1) organizadores (principal ahorrador + co-organizadores) · 2) productos del evento · 3) fecha + mes
     ============================================================ */
  function wizardPaso1(state, w) {
    const ahorradores = S().ahorradores();
    const opcionPrincipal = ahorradores.length
      ? `<select class="sel" id="wz-principal">
           <option value="">—</option>
           ${ahorradores.map(p => `<option value="${p.id}" ${w.principalId === p.id ? 'selected' : ''}>${e(p.nombre)}</option>`).join('')}
         </select>`
      : `<div class="muted small">Sin ahorradores. <button class="link-inline" data-act="open-personas">Agregar en Personas</button></div>`;
    // Co-organizadores: cualquier persona distinta del principal (toggle por chip).
    const coCands = S().personasOrdenadas().filter(p => p.id !== w.principalId);
    const chips = coCands.map(p => {
      const on = w.coorg.indexOf(p.id) >= 0;
      return `<button class="chip ${on ? 'on' : ''}" data-act="wz-toggle-coorg" data-pid="${p.id}">${e(p.nombre)} <i>${cap(p.estado)}</i></button>`;
    }).join('');
    return `<div class="wz-step">
      <label class="fld"><span>Anfitrión</span>${opcionPrincipal}</label>
      <div class="sub">Co-organizadores</div>
      <div class="chips wz-chips">${chips || '<span class="muted small">Sin personas</span>'}</div>
    </div>`;
  }

  function wizardPaso2(state, w) {
    // Fila de producto del wizard: emoji + nombre (ancho completo) arriba; costo/venta/quitar abajo.
    // Evita apretar 5 controles en una sola línea en el ancho angosto del sheet.
    const filas = w.productos.map((prod, i) => `<div class="wz-prodrow">
      ${prodIdInput(prod.emoji, prod.nombre, `data-wz="emoji" data-i="${i}"`, `data-wz="nombre" data-i="${i}"`, !!prod.emojiManual)}
      <div class="wz-prodrow-bot">
        <label class="prodrow-f"><span>costo</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.costoNeto}" data-wz="costoNeto" data-i="${i}"></label>
        <label class="prodrow-f"><span>venta</span><input class="ti num" type="number" min="0" step="500" inputmode="numeric" value="${prod.precioVenta}" data-wz="precioVenta" data-i="${i}"></label>
        <button class="xmini" data-act="wz-prod-remove" data-i="${i}" aria-label="quitar">${icon('trash-2', 'sm')}</button>
      </div>
    </div>`).join('');
    return `<div class="wz-step">
      <div class="prodlist">${filas || '<div class="empty-soft">Sin productos</div>'}</div>
      <button class="mini ghost mt-3" data-act="wz-prod-add">${icon('plus-circle')}Agregar</button>
    </div>`;
  }

  function wizardPaso3(state, w) {
    const dia = (/^\d{4}-\d{2}-(\d{2})$/.exec(String(w.fecha)) || [])[1] || '';
    return `<div class="wz-step">
      <div class="grid2">
        <label class="fld"><span>Mes</span>
          <input class="ti" type="month" id="wz-mes" value="${e(w.mesContable)}"></label>
        <label class="fld"><span>Día</span>
          <input class="ti" type="number" min="1" max="31" inputmode="numeric" placeholder="—" id="wz-dia" value="${dia}"></label>
      </div>
      <div class="muted small mt-2">Si aún no sabés el día, dejalo vacío — lo agregás después en Configurar.</div>
      <div class="sub">Resumen</div>
      <div class="kv"><span>Anfitrión</span><b>${w.principalId ? e(nombrePersona(w.principalId)) : '—'}</b></div>
      <div class="kv"><span>Organizadores</span><b>${1 + w.coorg.length}</b></div>
      <div class="kv"><span>Productos</span><b>${w.productos.length}</b></div>
    </div>`;
  }

  function wizardSheet(state, ui) {
    const w = ui.wizard;
    const titulos = ['Organizadores', 'Productos', 'Fecha'];
    const cuerpo = w.paso === 1 ? wizardPaso1(state, w) : (w.paso === 2 ? wizardPaso2(state, w) : wizardPaso3(state, w));
    const stepper = [1, 2, 3].map(n => `<span class="wz-dot ${n === w.paso ? 'on' : ''} ${n < w.paso ? 'done' : ''}">${n}</span>`).join('<span class="wz-line"></span>');
    const atras = w.paso > 1 ? `<button class="mini ghost" data-act="wz-atras">Atrás</button>` : `<button class="mini ghost" data-act="wz-cancelar">Cancelar</button>`;
    const adelante = w.paso < 3
      ? `<button class="btn" data-act="wz-siguiente">Siguiente</button>`
      : `<button class="btn" data-act="wz-crear">${icon('plus-circle')}Crear primada</button>`;
    return `<div class="sheet full wz">
      <div class="sheet-head">
        <div class="wz-steps">${stepper}</div>
        <button class="gear" data-act="wz-cancelar" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="wz-title">${e(titulos[w.paso - 1])}</div>
      <div class="sheet-body">${cuerpo}</div>
      <div class="wz-nav">${atras}${adelante}</div>
    </div>`;
  }

  // GEAR GLOBAL = ÚNICA configuración, CUATRO tabs con alcances SEPARADOS (cada uno UNA intención):
  //   Primada (config del evento activo: Asistentes/Productos) · Calendario (todas las primadas: crear/
  //   eliminar/reabrir) · Personas (directorio) · Ajustes (globales). Antes "Primadas" mezclaba config +
  //   calendario en un scroll → mala IA; ahora son tabs distintos. seg-nav full-width (`.cols4`) para 4 tabs.
  // AJUSTES GLOBALES = pantalla PLANA (sin tabs), abierta desde el ⚙ del home. Secciones por aire:
  // Personas (lista compacta + drill-in) · Cover · Legal · Versión · Cuenta. Reusa personasBody + ajustesBody.
  // Drill-in de persona: cuando se edita una (editPersonaId), la hoja muestra SOLO el editor enfocado.
  function ajustesSheet(state, ui) {
    const editando = ui && ui.editPersonaId && S().persona(ui.editPersonaId);
    if (editando) {
      return `<div class="sheet full">
        <div class="sheet-head"><div class="sheet-title">Persona</div>
          <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
        <div class="sheet-body">${personaEditView(editando, ui)}</div>
      </div>`;
    }
    return `<div class="sheet full">
      <div class="sheet-head"><div class="sheet-title">Ajustes</div>
        <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
      <div class="sheet-body">
        <div class="ajustes-sec"><div class="sub">Personas</div>${personasBody(state, ui)}</div>
        <div class="ajustes-sec">${ajustesBody(state, ui)}</div>
      </div>
    </div>`;
  }
  // (LEGADO ELIMINADO) `primadaAdminFila` (Reabrir/Eliminar en la lista del gear › Calendario) se quitó:
  // esas acciones viven ahora en el "···" por primada del HOME (`rowMenuBtn` → `primadaMenuSheet`).

  /* ============================================================
     RENDER raíz: (state, ui) → DOM
     ------------------------------------------------------------
     Re-render completo de la sección (deliberado). Para que escribir
     sea fluido, las ediciones de texto persisten SIN disparar render
     (Store.commitQuiet): así no se reconstruye el campo en plena
     edición ni se pelea con el foco. Los cambios estructurales
     (consumos, roles, abonos, navegación) sí re-renderizan.
     ============================================================ */
  let lastOverlayKey = null;   // overlay del último render (para preservar el scroll del .sheet entre re-renders)
  function render(state, ui) {
    ui = ui || { view: 'home', overlay: null, activaPid: null, editPersonaId: null };

    // IA LISTA→DETALLE (estilo Tricount): la app tiene DOS vistas, `ui.view` ∈ {'home','detalle'}.
    //  · HOME = lista de primadas (pantalla de inicio). · DETALLE = el espacio operativo de la primada activa.
    // No hay tab bar. La topbar es DINÁMICA por vista (home: marca + "+" + ajustes; detalle: ← + nombre + 🔗 + ···).
    const enDetalle = ui.view === 'detalle' && !!(state && S().activePrimada());

    // 1) Topbar dinámica.
    if (els.topbar) els.topbar.innerHTML = !state ? '' : (enDetalle ? topbarDetalle(state, ui) : topbarHome(state, ui));

    // 2) Contenido: HOME (lista) o DETALLE (operación de la activa).
    let html;
    if (!state)        html = '<div class="empty-soft">Cargando…</div>';   // primer pintado: aún hidratando (load async)
    else if (enDetalle) html = detalleBody(state, ui);
    else               html = homeBody(state, ui);
    els.screen.innerHTML = html;

    // 3) overlay: wizard (prioridad) · pantalla del engranaje (Personas / Primadas / Ajustes) · etc.
    // El re-render reescribe els.overlay.innerHTML → recrea el .sheet (el scroll vive ahí, overflow:auto) y
    // saltaría al TOPE en cada toggle interno (p.ej. desplegar una persona). PRESERVAMOS el scrollTop del
    // .sheet cuando seguimos en el MISMO overlay (mismo overlayKey); al cambiar de overlay/tab, arranca arriba.
    const overlayKey = ui.wizard ? 'wizard' : (ui.overlay || null);
    const prevSheet = els.overlay.querySelector('.sheet');
    const keepScroll = (prevSheet && overlayKey && overlayKey === lastOverlayKey) ? prevSheet.scrollTop : 0;

    if (ui.wizard)                                              els.overlay.innerHTML = wizardSheet(state, ui);
    else if (ui.overlay === 'login')                           els.overlay.innerHTML = loginSheet(state, ui);
    else if (ui.overlay === 'pagar')                           els.overlay.innerHTML = pagarSheet(state, ui);
    else if (ui.overlay === 'config-primada')                  els.overlay.innerHTML = configPrimadaSheet(state, ui);
    else if (ui.overlay === 'primada-menu')                    els.overlay.innerHTML = primadaMenuSheet(state, ui);
    else if (ui.overlay === 'add-asis')                        els.overlay.innerHTML = addAsisSheet(state, ui);
    else if (ui.overlay === 'exonerar')                        els.overlay.innerHTML = exonerarSheet(state, ui);
    else if (ui.overlay === 'ajustes' || ui.overlay === 'personas') els.overlay.innerHTML = ajustesSheet(state, ui);
    else                                                        els.overlay.innerHTML = '';

    if (keepScroll) { const ns = els.overlay.querySelector('.sheet'); if (ns) ns.scrollTop = keepScroll; }
    lastOverlayKey = overlayKey;
    els.overlay.hidden = !(ui.wizard || ui.overlay);
  }

  let toastTimer;
  // toast(msg, kind?) — kind 'ok' = tono POSITIVO (confirmación de acción exitosa, p.ej. pago saldado).
  // kind: 'ok' = confirmación positiva · 'err' = validación o fallo · sin kind = neutro.
  // Antes TODO salía en el mismo chip gris (31 llamadas, solo 2 con kind): el éxito, el error y el aviso se
  // veían idénticos, contra los cuatro registros de DESIGN.md §1.
  function toast(msg, kind) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('ok', kind === 'ok');
    els.toast.classList.toggle('err', kind === 'err');
    // Con una hoja abierta el toast SUBE: si no, cae encima del botón al que se refiere (medido: 39 de sus
    // 41px de alto superpuestos con "Siguiente" del wizard). Se calcula al mostrarlo, no con :has() (soporte).
    els.toast.classList.toggle('over-sheet', !!(els.overlay && !els.overlay.hidden));
    els.toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  /* ============================================================
     COMPARTIR INFORME — captura el template (informeTemplateHTML) como PNG y lo comparte.
     html2canvas se carga LAZY por CDN en el primer uso (no infla el cold-start; el SW no intercepta CDN).
     Antes de capturar se espera document.fonts para rasterizar Instrument Sans (si no, html2canvas cae a
     fuente del sistema). Compartir: navigator.share({files}) en móvil; fallback = descarga del PNG.
     ============================================================ */
  let _h2cPromise;
  function loadHtml2Canvas() {
    if (typeof window !== 'undefined' && window.html2canvas) return Promise.resolve(window.html2canvas);
    if (_h2cPromise) return _h2cPromise;
    _h2cPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => res(window.html2canvas);
      s.onerror = () => { _h2cPromise = null; rej(new Error('No se pudo cargar el generador de imagen')); };
      document.head.appendChild(s);
    });
    return _h2cPromise;
  }

  async function esperarFuentes() {
    if (typeof document === 'undefined' || !document.fonts) return;
    try { await document.fonts.load('700 16px "Instrument Sans"'); await document.fonts.load('400 16px "Instrument Sans"'); } catch (e) {}
    try { await document.fonts.ready; } catch (e) {}
  }

  // p = primada activa. Construye el template oculto, lo rasteriza y dispara el share sheet (o descarga).
  async function shareInforme(p) {
    if (!p) return;
    let host = null;
    try {
      const h2c = await loadHtml2Canvas();
      host = document.createElement('div');
      host.className = 'informe-host';
      host.innerHTML = informeTemplateHTML(p);
      document.body.appendChild(host);
      await esperarFuentes();
      const node = host.firstElementChild;
      const canvas = await h2c(node, { scale: Math.max(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1), backgroundColor: '#0b1412', useCORS: true, logging: false });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');
      const slug = (p.nombre || 'primada').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'primada';
      const file = new File([blob], `primada-${slug}.png`, { type: 'image/png' });
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav && nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: p.nombre });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // el usuario cerró el share sheet → no es error
      toast(err && err.message ? err.message : 'No se pudo compartir el informe');
    } finally {
      if (host) host.remove();
    }
  }

  // Pantalla de LOGIN (auth gate). Magic link: email + "Entrar". Estados: 'form' | 'sent' | 'error'.
  // Se renderiza en #screen; oculta tabbar/engranaje mientras no haya sesión.
  // Login = HOJA desde abajo (mismo lenguaje que el resto de la app: overlay + sheet), NO full-pantalla.
  // El topbar (la marca) queda visible detrás, atenuado; los botones de acción se ocultan (no hay sesión).
  // Login = HOJA OPT-IN (overlay cerrable, se abre desde el ícono de perfil), NO un gate. La app
  // sigue usable detrás; la hoja lleva su X. Estado por ui.loginEstado ('form' | 'sent').
  function loginSheet(state, ui) {
    const enviado = ui && ui.loginEstado === 'sent';
    const email = (ui && ui.loginEmail) || '';
    const cuerpo = enviado
      ? `<div class="login-sent">
           <div class="login-emoji">📧</div>
           <p>Código enviado a<br><b>${e(email || 'tu correo')}</b></p>
           <input class="ti login-code" id="login-codigo" inputmode="numeric" autocomplete="one-time-code"
                  pattern="[0-9]*" maxlength="10" placeholder="Código" aria-label="Código del correo">
           <button class="btn" data-act="login-verificar">Verificar</button>
           <button class="btn ghost" data-act="login-reset">Otro correo</button>
         </div>`
      : `<div class="login-form">
           <p class="muted small">${(ui && ui.loginMotivo)
              ? 'La primada se ve sin cuenta; para ' + e(ui.loginMotivo) + ' necesitás entrar. Te mandamos un código al correo.'
              : 'Te enviamos un código al correo para pegarlo aquí.'}</p>
           <input class="ti" id="login-email" type="email" inputmode="email" autocomplete="email"
                  placeholder="tu@correo.com" value="${e(email)}" aria-label="Correo">
           <button class="btn" data-act="login-enviar">Enviar código</button>
         </div>`;
    return `<div class="sheet login-sheet">
        <div class="sheet-head"><div class="sheet-title">${enviado
            ? 'Escribe el código'
            : ((ui && ui.loginMotivo) ? 'Entrá para ' + e(ui.loginMotivo) : 'Entrar')}</div>
          <button class="gear" data-act="close-overlay" aria-label="Cerrar">${icon('x')}</button></div>
        <div class="sheet-body">${cuerpo}
          <p class="login-legal muted small">Al entrar aceptas nuestra
            <a href="privacy.html" target="_blank" rel="noopener">Política de Privacidad</a>.</p>
        </div>
      </div>`;
  }

  // Actualiza el ícono del botón de cuenta según el estado de auth:
  // 'user' (backend off, placeholder) · 'log-in' (backend on, sin sesión) · 'log-out' (autenticado).
  function renderAuthButton(estado) {
    const btn = document.getElementById('authBtn'); if (!btn) return;
    const name = estado === 'in' ? 'log-out' : (estado === 'out' ? 'log-in' : 'user');
    btn.innerHTML = icon(name);
    btn.setAttribute('title', estado === 'in' ? 'Cerrar sesión' : (estado === 'out' ? 'Iniciar sesión' : 'Cuenta'));
  }

  // Restaura topbar/tabbar/engranaje al entrar autenticado (tras el login).
  function showAppChrome() {
    if (els.tabbar) els.tabbar.style.display = '';
    const topbar = document.querySelector('.topbar'); if (topbar) topbar.style.display = '';
    const actions = document.querySelector('.header-actions'); if (actions) actions.style.display = '';
    const gear = document.getElementById('gearBtn'); if (gear) gear.style.display = '';
  }

  // Indicador de sincronización con la nube. Crea/actualiza un chip flotante (no depende del
  // markup de index.html). { pendientes, error } viene del Store.subscribeSync.
  // Indicador offline/sync: vive DENTRO del detalle (no en el home). `visible` lo gatea el controller
  // (ui.view==='detalle'); fuera del detalle se oculta aunque haya pendientes (se ven al entrar a operar).
  function renderSync(s, visible) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('syncIndicator');
    const hayError = s && s.error;
    const hayPend = s && s.pendientes > 0;
    if (visible === false || (!hayError && !hayPend)) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'syncIndicator'; el.className = 'sync-indicator'; document.body.appendChild(el); }
    el.classList.toggle('err', !!hayError);
    el.textContent = hayError ? ('⚠ ' + s.error) : '⟳ Guardando…';
    if (hayError) toast(s.error);
  }

  // Actualización QUIRÚRGICA del header de cover de un grupo (Ahorradores/Invitados) en Configurar.
  // Para el ajuste EN VIVO del cover de "Cómo fue en su momento": el "Cover $X" de ARRIBA cambia mientras
  // se teclea ABAJO, SIN reconstruir el overlay (no pierde foco ni suelta teclas en Android). El re-render
  // estructural completo (filas "sin cover", sobrante, etc.) llega en el blur/change. Devuelve si lo encontró
  // (si el cover venía en 0 no hay header que tocar → cae al re-render de blur).
  // CONFIRMACIÓN IMPLÍCITA del registro (auditoría de captura, sep 2026). Apuntar NO avisaba NADA: ni toast ni
  // animación — el único rastro era el ×N y el total, y un consumo fantasma quedaba con aspecto de dato
  // legítimo. Esto no PREVIENE el error (de eso se encarga el orden estable) pero lo hace DETECTABLE: un
  // destello corto sobre la cifra que cambió y sobre el total de la persona. Se pinta QUIRÚRGICO (la Vista
  // dibuja → MVC intacto), igual que `actualizarCoverGrupo`, para no meter estado efímero de animación en el
  // Store ni forzar un segundo render. El controller lo llama JUSTO DESPUÉS de la acción, cuando el commit ya
  // re-renderizó y los nodos están frescos.
  function flashConsumo(personaId, prodId) {
    const cuerpo = document.querySelector(`.chip-plus[data-pid="${personaId}"][data-prod="${prodId}"]`);
    const cifra = cuerpo && cuerpo.querySelector('.chip-q, .chip-precio');
    const total = document.querySelector(`.asis-fila[data-pid="${personaId}"] .acc-amt`);
    [cifra, total].forEach(el => {
      if (!el) return;
      el.classList.remove('flash');
      void el.offsetWidth;            // fuerza reflow: reinicia la animación si se toca rápido varias veces
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 400);
    });
  }

  // ANCLA DE SCROLL al cambiar de persona activa (auditoría de interacción, sep 2026). Al activar a alguien,
  // la ficha de la persona ANTERIOR se colapsa (mide ~716px con 11 productos) → todo lo que estaba debajo
  // SUBE de golpe y la fila que acabás de tocar se va hacia arriba **bajo el dedo** (medido: saltos de 202px
  // y 360px según el scroll). Es el mismo bug del reflow, un nivel más arriba. Acá se corrige compensando el
  // scroll: la fila tocada se queda donde estaba. Es la Vista ajustando su propio scroll → MVC intacto.
  // Si el scroll ya está en 0 no hay margen para compensar (queda clampeado): mejora igual, no puede empeorar.
  // Devuelve el RESIDUAL: los px que NO se pudieron compensar (0 = la fila quedó clavada donde estaba).
  function anclarFila(personaId, topAntes) {
    const sc = document.querySelector('.app-scroll');
    const fila = document.querySelector(`.asis-fila[data-pid="${personaId}"]`);
    if (!sc || !fila || topAntes == null) return 0;
    const delta = fila.getBoundingClientRect().top - topAntes;
    if (delta) sc.scrollTop += delta;
    let residual = Math.round(fila.getBoundingClientRect().top - topAntes);
    // CLAMPEO: si arriba no había suficiente scroll para devolver, la fila igual se movió. En vez de dejarla
    // donde caiga (medido: hasta 500px de salto, con un `item-plus` quedando bajo el dedo), se la FIJA en un
    // sitio DETERMINISTA —pegada arriba— para que el resultado sea siempre el mismo y el usuario lo aprenda.
    if (residual) {
      // OJO: `offsetTop` es relativo al `offsetParent`, que HOY es el body y coincide con el scroller por
      // geometría, no por construcción. Si algún día aparece un `position:relative/sticky` entre `.app-scroll`
      // y la fila, esto hay que recalcularlo (p. ej. con getBoundingClientRect contra el rect del scroller).
      sc.scrollTop = Math.max(0, fila.offsetTop - 8);
      residual = Math.round(fila.getBoundingClientRect().top - topAntes);
    }
    return residual;
  }

  function actualizarCoverGrupo(estado, monto) {
    const el = els.overlay && els.overlay.querySelector(`.grp-cover[data-cover-grp="${estado}"]`);
    if (!el) return false;
    el.textContent = 'Cover ' + $peso(monto);
    return true;
  }

  root.View = { cache, render, showAppChrome, renderAuthButton, renderSync, balanceAbierto, asisAbierto, toast, shareInforme, informeTemplateHTML, actualizarCoverGrupo, flashConsumo, anclarFila };
  if (typeof module !== 'undefined' && module.exports) module.exports = { View: root.View };
})(typeof window !== 'undefined' ? window : globalThis);
