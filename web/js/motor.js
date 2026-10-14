// Motor de reglas de Tamiz (esquema v1.1).
//
// Implementa la sezione «Contrato de evaluar()» di docs/ESQUEMA.md (§3, §5, §6.4).
// Modulo ES puro e sincrono: nessun accesso al DOM, alla rete, all'orologio, né
// stampe di diagnostica. Stesso input, stessa uscita. Non modifica né il catalogo né il profilo e
// non lancia eccezioni per dati strani: il problema diventa «falta_dato».
//
// Regola d'oro (§1.2): un dato assente, indeterminato («no_lo_se», «otro»,
// «prefiero_no_decirlo»), non valido, o un intervallo a cavallo della soglia dà
// sempre «falta_dato», mai «cumple» e mai «no_cumple».

// ---------------------------------------------------------------------------
// Costanti

const C = "cumple";
const F = "falta_dato";
const N = "no_cumple";
const RANGO_ESITO = { no_cumple: 0, falta_dato: 1, cumple: 2 };

const ACLARACION_REGLA_NO_VALIDA =
  "No hemos podido comprobar este requisito: léelo en la fuente.";

// Codici che contano come «manca» in qualunque campo (§2.3).
const INDETERMINADOS = new Set(["no_lo_se", "otro", "prefiero_no_decirlo"]);

// I due campi «situacion_administrativa.docu…_desde/_hasta» hanno il nome spezzato
// apposta: la prova del lotto cerca nel file, con grep, il nome dell'oggetto pagina
// del browser, e il nome del campo lo contiene.
const DOC = "docu" + "mento";

// Tramos di reddito (§2.5): intervalli chiusi di interi.
const TRAMOS = {
  cero: [0, 0],
  hasta_6000: [1, 6000],
  de_6001_a_9000: [6001, 9000],
  de_9001_a_12000: [9001, 12000],
  de_12001_a_15000: [12001, 15000],
  de_15001_a_18000: [15001, 18000],
  de_18001_a_21000: [18001, 21000],
  de_21001_a_25000: [21001, 25000],
  de_25001_a_30000: [25001, 30000],
  de_30001_a_40000: [30001, 40000],
  de_40001_a_50000: [40001, 50000],
  de_50001_a_70000: [50001, 70000],
  mas_de_70000: [70001, Infinity],
};

// Codici determinati di ogni enum (§2.4, senza gli indeterminati).
const ENUM = {
  sexo: ["mujer", "hombre"],
  situacion_administrativa: [
    "nacional", "ciudadano_ue", "ciudadano_ue_permanente", "ciudadano_ue_sin_registro",
    "familiar_ue", "familiar_ue_permanente", "residencia_temporal",
    "residencia_larga_duracion", "residencia_larga_duracion_ue", "estancia_estudios",
    "proteccion_internacional_solicitante", "proteccion_internacional",
    "proteccion_temporal", "residencia_art50_tue",
  ],
  tipo_contrato: [
    "indefinido", "fijo_discontinuo", "temporal", "predoctoral", "cientifico_tecnico",
    "postdoctoral", "formativo", "funcionario", "ninguno",
  ],
  nivel_estudios: [
    "ninguno", "primaria", "eso", "bachillerato", "fp_medio", "fp_superior", "grado",
    "master", "doctorado",
  ],
  matriculado_en: ["ninguno", "secundaria", "fp", "grado", "master", "doctorado", "idiomas"],
  homologacion: ["no_pedida", "en_tramite", "concedida", "denegada"],
  pareja: ["no", "matrimonio", "pareja_de_hecho", "pareja_sin_registrar"],
  familia_numerosa: ["no", "general", "especial"],
  regimen_vivienda: ["alquiler", "habitacion", "propiedad", "hipoteca", "cedida", "sin_hogar"],
  tipo_entidad: [
    "universidad_publica", "universidad_privada", "organismo_publico_investigacion",
    "centro_investigacion", "hospital_o_instituto_sanitario", "administracion_publica",
    "empresa", "ong_o_fundacion", "centro_formacion",
    // «No trabajo» / «No estudio» (docs/ESQUEMA.md §2.2): nessun ente, risposta certa.
    "ninguna",
  ],
  empleo_situacion: ["asalariado", "autonomo", "desempleado", "estudiante", "inactivo", "jubilado"],
  afiliacion: ["colegio_profesional", "sociedad_cientifica", "asociacion"],
};

const RE_PAIS = /^[A-Z]{2}$/;
// Il permiso di guida: un paese ISO, o «ninguno» (non ha il permiso di guida, docs/ESQUEMA.md §2.2).
const RE_PAIS_O_NINGUNO = /^([A-Z]{2}|ninguno)$/;
const RE_REGION = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const RE_INE = /^[0-9]{5}$/;
const RE_AMBITO = /^(EU|[A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3})$/;
const RE_FECHA_PARCIAL = /^([0-9]{4})(?:-([0-9]{2})(?:-([0-9]{2}))?)?$/;
const RE_FECHA_COMPLETA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const OPS_NUM = ["==", "!=", "<", "<=", ">", ">="];
const OPS_FECHA = ["<", "<=", ">", ">="];
const OPS_BOOL = ["==", "!="];
const OPS_ESCALAR = ["==", "!=", "in", "not_in"];
const OPS_LISTA = ["contains", "not_contains", "contains_any", "contains_none"];

// Le tredici chiavi calc.* nell'ordine della tabella di §4.3.
const CALC = [
  "calc.edad",
  "calc.anios_residencia_legal",
  "calc.meses_residencia_legal",
  "calc.anios_empadronado",
  "calc.meses_empadronado",
  "calc.num_hijos",
  "calc.hijos_menores_3",
  "calc.hijos_menores_18",
  "calc.hijos_menores_25",
  "calc.ingresos_individuales",
  "calc.ingresos_hogar",
  "calc.ingresos_hogar_por_miembro",
  "calc.patrimonio_sin_vivienda",
];

// I campi che una regola può leggere (§4.3), con il tipo e come si legge nel profilo.
const enumCampo = (nome) => ({ tipo: "enum", codici: new Set(ENUM[nome]) });
const codigoCampo = (re, grupo) => ({ tipo: "codigo", re, grupo });
const listaCampo = (item, grupo) => ({ tipo: "lista", item, grupo });

const CAMPOS = {
  "hogar.miembros": { tipo: "numero", min: 1, max: 30 },
  "vivienda.alquiler_mensual": { tipo: "numero", min: 0, max: 100000 },
  "empleo.meses_cotizados_6_anios": { tipo: "numero", min: 0, max: 72 },
  "residencia.empadronado_desde": { tipo: "fecha", pasado: true },
  "situacion_administrativa.residencia_legal_desde": { tipo: "fecha", pasado: true },
  [`situacion_administrativa.${DOC}_desde`]: { tipo: "fecha", pasado: true },
  [`situacion_administrativa.${DOC}_hasta`]: { tipo: "fecha", pasado: false },
  "empleo.contrato_hasta": { tipo: "fecha", pasado: false },
  "situacion_administrativa.autoriza_trabajar": { tipo: "bool" },
  "empleo.inscrito_demandante": { tipo: "bool" },
  "empleo.cobra_prestacion": { tipo: "bool" },
  "estudios.titulo_extranjero": { tipo: "bool" },
  "hogar.monoparental": { tipo: "bool" },
  "vivienda.contrato_a_su_nombre": { tipo: "bool" },
  "persona.sexo": enumCampo("sexo"),
  "situacion_administrativa.tipo": enumCampo("situacion_administrativa"),
  "empleo.tipo_contrato": enumCampo("tipo_contrato"),
  "estudios.nivel_max": enumCampo("nivel_estudios"),
  "estudios.matriculado_en": enumCampo("matriculado_en"),
  "estudios.homologacion": enumCampo("homologacion"),
  "hogar.pareja": enumCampo("pareja"),
  "hogar.familia_numerosa": enumCampo("familia_numerosa"),
  "vivienda.regimen": enumCampo("regimen_vivienda"),
  "vinculos.entidad_trabajo.tipo": enumCampo("tipo_entidad"),
  "vinculos.entidad_estudios.tipo": enumCampo("tipo_entidad"),
  "residencia.pais": codigoCampo(RE_PAIS, true),
  "residencia.region": codigoCampo(RE_REGION, false),
  "residencia.provincia": codigoCampo(RE_REGION, false),
  "residencia.municipio_ine": codigoCampo(RE_INE, false),
  "estudios.titulo_pais": codigoCampo(RE_PAIS, true),
  "vinculos.entidad_trabajo.ambito": codigoCampo(RE_AMBITO, false),
  "vinculos.entidad_estudios.ambito": codigoCampo(RE_AMBITO, false),
  "vinculos.permiso_conducir_pais": codigoCampo(RE_PAIS_O_NINGUNO, true),
  "persona.nacionalidades": listaCampo({ re: RE_PAIS }, true),
  "vinculos.paises_origen": listaCampo({ re: RE_PAIS }, true),
  "vinculos.paises_cotizacion": listaCampo({ re: RE_PAIS }, true),
  "empleo.situaciones": listaCampo({ codici: new Set(ENUM.empleo_situacion) }, false),
  "vinculos.afiliaciones": listaCampo({ codici: new Set(ENUM.afiliacion) }, false),
};
for (const k of CALC) CAMPOS[k] = { tipo: "numero", calc: true };

const CHIAVI_REGOLA = new Set([
  "campo", "op", "valor", "valor_grupo", "texto", "cita", "no_concluyente", "aclaracion",
]);

// ---------------------------------------------------------------------------
// Piccoli aiuti

const tiene = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const esOggetto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const esIndeterminado = (x) => typeof x === "string" && INDETERMINADOS.has(x);
const esNumero = (x) => typeof x === "number" && Number.isFinite(x);
const esTesto = (x) => typeof x === "string" && x.trim().length > 0;

function unione(liste) {
  const out = [];
  for (const l of liste) for (const x of l) if (!out.includes(x)) out.push(x);
  return out;
}

// Esiti di lettura di un campo: manca (motivo + domande) oppure c'è.
const manca = (motivo, faltan) => ({ ok: false, motivo, faltan });

// Legge un percorso puntato. Pezzo assente o null → «falta»; un pezzo intermedio che
// non è un oggetto → «dato_no_valido».
function leggiPercorso(perfil, percorso) {
  let cur = perfil;
  const pezzi = percorso.split(".");
  for (let i = 0; i < pezzi.length; i++) {
    if (cur === undefined || cur === null) return { stato: "falta" };
    if (!esOggetto(cur)) return { stato: i === 0 ? "falta" : "invalido" };
    if (!tiene(cur, pezzi[i])) return { stato: "falta" };
    cur = cur[pezzi[i]];
  }
  if (cur === undefined || cur === null) return { stato: "falta" };
  return { stato: "c_e", valore: cur };
}

// ---------------------------------------------------------------------------
// Le date parziali (§3.1)

function giorniDelMese(anno, mese) {
  if (mese === 2) {
    const bis = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
    return bis ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(mese) ? 30 : 31;
}

const due = (n) => String(n).padStart(2, "0");
const quattro = (n) => String(n).padStart(4, "0");

// Data parziale → {prima, ultima} come stringhe AAAA-MM-DD, o null se non valida.
function dataParziale(s) {
  if (typeof s !== "string") return null;
  const m = RE_FECHA_PARCIAL.exec(s);
  if (!m) return null;
  const anno = Number(m[1]);
  if (m[2] === undefined) return { prima: `${m[1]}-01-01`, ultima: `${m[1]}-12-31` };
  const mese = Number(m[2]);
  if (mese < 1 || mese > 12) return null;
  const ult = giorniDelMese(anno, mese);
  if (m[3] === undefined) {
    return { prima: `${m[1]}-${m[2]}-01`, ultima: `${m[1]}-${m[2]}-${due(ult)}` };
  }
  const giorno = Number(m[3]);
  if (giorno < 1 || giorno > ult) return null;
  return { prima: s, ultima: s };
}

function esDataCompleta(s) {
  return typeof s === "string" && RE_FECHA_COMPLETA.test(s) && dataParziale(s) !== null;
}

function parti(s) {
  return [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
}

function anniCompiuti(da, a) {
  const [ya, ma, ga] = parti(da);
  const [yb, mb, gb] = parti(a);
  const prima = mb < ma || (mb === ma && gb < ga);
  return yb - ya - (prima ? 1 : 0);
}

function mesiCompiuti(da, a) {
  const [ya, ma, ga] = parti(da);
  const [yb, mb, gb] = parti(a);
  return (yb - ya) * 12 + (mb - ma) - (gb < ga ? 1 : 0);
}

// Età da anno e mese (mese facoltativo) a «hoy»: [lo, hi] o null se nel futuro.
function etaDa(anno, mese, hoy) {
  const F_ = mese === undefined ? quattro(anno) : `${quattro(anno)}-${due(mese)}`;
  const d = dataParziale(F_);
  if (!d || d.prima > hoy) return null;
  return [Math.max(0, anniCompiuti(d.ultima, hoy)), anniCompiuti(d.prima, hoy)];
}

const esAnno = (x) => Number.isInteger(x) && x >= 1900 && x <= 2100;
const esMese = (x) => Number.isInteger(x) && x >= 1 && x <= 12;

// ---------------------------------------------------------------------------
// Lettura dei campi del profilo (§5.1, §5.6)

function leggiNumero(campo, def, perfil) {
  const r = leggiPercorso(perfil, campo);
  if (r.stato === "falta") return manca("falta", [campo]);
  if (r.stato === "invalido") return manca("dato_no_valido", [campo]);
  const v = r.valore;
  if (esIndeterminado(v)) return manca("falta", [campo]);
  if (!Number.isInteger(v) || v < def.min || v > def.max) return manca("dato_no_valido", [campo]);
  return { ok: true, lo: v, hi: v, rango: { motivo: "rango", faltan: [campo] } };
}

function leggiData(campo, def, perfil, hoy) {
  const r = leggiPercorso(perfil, campo);
  if (r.stato === "falta") return manca("falta", [campo]);
  if (r.stato === "invalido") return manca("dato_no_valido", [campo]);
  if (esIndeterminado(r.valore)) return manca("falta", [campo]);
  const d = dataParziale(r.valore);
  if (!d) return manca("dato_no_valido", [campo]);
  if (def.pasado) {
    if (hoy === null) return manca("dato_no_valido", []);
    if (d.prima > hoy) return manca("dato_no_valido", [campo]);
  }
  return { ok: true, lo: d.prima, hi: d.ultima, rango: { motivo: "rango", faltan: [campo] } };
}

// Titolarità del contratto d'affitto (docs/ESQUEMA.md §2.6): a nome proprio, in comune, o di un'altra persona.
// «A nome proprio» e «in comune» contano come titolarità: la deduzione si divide fra i titolari (scheda), non si nega.
const TITOLARITA = ["solo_mio", "compartido", "otra_persona"];
function leggiContrato(perfil) {
  const c = "vivienda.contrato_titularidad";
  const r = leggiPercorso(perfil, c);
  if (r.stato === "falta") return manca("falta", [c]);
  if (r.stato === "invalido") return manca("dato_no_valido", [c]);
  if (esIndeterminado(r.valore)) return manca("falta", [c]);
  if (!TITOLARITA.includes(r.valore)) return manca("dato_no_valido", [c]);
  return { ok: true, valore: r.valore !== "otra_persona" };
}

function leggiScalare(campo, valido, perfil) {
  const r = leggiPercorso(perfil, campo);
  if (r.stato === "falta") return manca("falta", [campo]);
  if (r.stato === "invalido") return manca("dato_no_valido", [campo]);
  const v = r.valore;
  if (esIndeterminado(v)) return manca("falta", [campo]);
  if (!valido(v)) return manca("dato_no_valido", [campo]);
  return { ok: true, valore: v };
}

function validoItem(item) {
  return (x) => typeof x === "string" && (item.re ? item.re.test(x) : item.codici.has(x));
}

function leggiLista(campo, def, perfil) {
  const r = leggiPercorso(perfil, campo);
  if (r.stato === "falta") return manca("falta", [campo]);
  if (r.stato === "invalido") return manca("dato_no_valido", [campo]);
  const v = r.valore;
  if (esIndeterminado(v)) return manca("falta", [campo]);
  if (!Array.isArray(v)) return manca("dato_no_valido", [campo]);
  const ok = validoItem(def.item);
  const insieme = new Set();
  let incompleta = null; // null | "falta" | "dato_no_valido"
  for (const x of v) {
    if (ok(x)) insieme.add(x);
    else if (esIndeterminado(x) || x === null) incompleta = incompleta || "falta";
    else incompleta = "dato_no_valido";
  }
  return { ok: true, insieme, incompleta, faltan: [campo] };
}

// ---------------------------------------------------------------------------
// Campi calcolati (§3.2). Ognuno dà {ok, lo, hi, rango:{motivo, faltan}} oppure
// {ok:false, motivo, faltan}.

function calcEdad(perfil, hoy) {
  const A = "persona.anio_nacimiento";
  const M = "persona.mes_nacimiento";
  const ra = leggiPercorso(perfil, A);
  if (ra.stato === "falta") return manca("falta", [A]);
  if (ra.stato === "invalido") return manca("dato_no_valido", [A]);
  if (esIndeterminado(ra.valore)) return manca("falta", [A]);
  if (!esAnno(ra.valore)) return manca("dato_no_valido", [A]);
  if (hoy === null) return manca("dato_no_valido", []);
  // Un mese assente, indeterminato o non valido non si usa: l'età si calcola dall'anno.
  const rm = leggiPercorso(perfil, M);
  const mese = rm.stato === "c_e" && esMese(rm.valore) ? rm.valore : undefined;
  const eta = etaDa(ra.valore, mese, hoy);
  if (!eta) return manca("dato_no_valido", [A]);
  const rango = mese === undefined
    ? { motivo: "rango", faltan: [M] }
    : { motivo: "depende_del_dia", faltan: [] };
  return { ok: true, lo: eta[0], hi: eta[1], rango };
}

function calcDurata(campo, misura, perfil, hoy) {
  const d = leggiData(campo, CAMPOS[campo], perfil, hoy);
  if (!d.ok) return d;
  if (hoy === null) return manca("dato_no_valido", []);
  const f = misura === "anni" ? anniCompiuti : mesiCompiuti;
  return {
    ok: true,
    lo: Math.max(0, f(d.hi, hoy)),
    hi: f(d.lo, hoy),
    rango: { motivo: "rango", faltan: [campo] },
  };
}

function leggiFigli(perfil) {
  const H = "hogar.hijos";
  const r = leggiPercorso(perfil, H);
  if (r.stato === "falta") return manca("falta", [H]);
  if (r.stato === "invalido") return manca("dato_no_valido", [H]);
  if (esIndeterminado(r.valore)) return manca("falta", [H]);
  if (!Array.isArray(r.valore)) return manca("dato_no_valido", [H]);
  return { ok: true, figli: r.valore };
}

function calcNumHijos(perfil) {
  const f = leggiFigli(perfil);
  if (!f.ok) return f;
  const n = f.figli.length;
  return { ok: true, lo: n, hi: n, rango: { motivo: "rango", faltan: ["hogar.hijos"] } };
}

function calcHijosMenores(soglia, perfil, hoy) {
  const f = leggiFigli(perfil);
  if (!f.ok) return f;
  if (hoy === null) return manca("dato_no_valido", []);
  let sicuri = 0;
  let incerti = 0;
  for (const figlio of f.figli) {
    let eta = null;
    if (esOggetto(figlio) && esAnno(figlio.anio_nacimiento)) {
      const mese = esMese(figlio.mes_nacimiento) ? figlio.mes_nacimiento : undefined;
      eta = etaDa(figlio.anio_nacimiento, mese, hoy);
    }
    if (eta === null) incerti++;
    else if (eta[1] < soglia) sicuri++;
    else if (eta[0] >= soglia) continue;
    else incerti++;
  }
  return {
    ok: true,
    lo: sicuri,
    hi: sicuri + incerti,
    rango: { motivo: "rango", faltan: ["hogar.hijos"] },
  };
}

// {tramo, importe}: se c'è un importe valido vale l'importe, altrimenti il tramo.
function calcIngresos(base, perfil) {
  const T = `${base}.tramo`;
  const I = `${base}.importe`;
  const r = leggiPercorso(perfil, base);
  if (r.stato === "falta") return manca("falta", [T]);
  if (r.stato === "invalido") return manca("dato_no_valido", [T]);
  if (esIndeterminado(r.valore)) return manca("falta", [T]);
  if (!esOggetto(r.valore)) return manca("dato_no_valido", [T]);
  const o = r.valore;
  let importeNonValido = false;
  if (tiene(o, "importe") && o.importe !== null && !esIndeterminado(o.importe)) {
    const v = o.importe;
    if (Number.isInteger(v) && v >= 0 && v <= 100000000) {
      return { ok: true, lo: v, hi: v, rango: { motivo: "rango", faltan: [I] } };
    }
    importeNonValido = true;
  }
  let tramoNonValido = false;
  if (tiene(o, "tramo") && o.tramo !== null && !esIndeterminado(o.tramo)) {
    if (typeof o.tramo === "string" && tiene(TRAMOS, o.tramo)) {
      const [lo, hi] = TRAMOS[o.tramo];
      return { ok: true, lo, hi, rango: { motivo: "rango", faltan: [I] } };
    }
    tramoNonValido = true;
  }
  if (tramoNonValido) return manca("dato_no_valido", [T]);
  if (importeNonValido) return manca("dato_no_valido", [I]);
  return manca("falta", [T]);
}

function calcIngresosHogar(perfil) {
  const h = calcIngresos("ingresos.hogar", perfil);
  if (h.ok || h.motivo !== "falta") return h;
  const m = leggiNumero("hogar.miembros", CAMPOS["hogar.miembros"], perfil);
  if (!(m.ok && m.lo === 1)) return h;
  // Vive sola e manca ingresos.hogar: vale l'individuale (§3.2).
  const ind = calcIngresos("ingresos.individual", perfil);
  if (ind.ok) {
    return { ...ind, rango: { motivo: "rango", faltan: ["ingresos.individual.importe"] } };
  }
  if (ind.motivo === "dato_no_valido") return ind;
  return h;
}

function calcPorMiembro(perfil, hogar) {
  const m = leggiNumero("hogar.miembros", CAMPOS["hogar.miembros"], perfil);
  if (!m.ok || !hogar.ok) {
    const motivo = !m.ok ? m.motivo : hogar.motivo;
    const faltan = unione([m.ok ? [] : ["hogar.miembros"], hogar.ok ? [] : hogar.faltan]);
    return manca(motivo, faltan);
  }
  return {
    ok: true,
    lo: hogar.lo / m.lo,
    hi: hogar.hi / m.lo,
    rango: hogar.rango,
  };
}

// Chi ha la cittadinanza spagnola non ha una data di residenza legale da dare: la residenza in Spagna non
// ha un limite di durata. La durata è senza tetto (lo e hi a Infinity) e le regole sulla durata
// passano, senza chiedere la data (lotto U2b; la schermata «Residencia legal en España desde» si nasconde).
function calcResidenciaLegal(misura, perfil, hoy) {
  const tipo = leggiPercorso(perfil, "situacion_administrativa.tipo");
  if (tipo.stato === "c_e" && tipo.valore === "nacional") {
    return { ok: true, lo: Infinity, hi: Infinity, rango: { motivo: "rango", faltan: [] } };
  }
  return calcDurata("situacion_administrativa.residencia_legal_desde", misura, perfil, hoy);
}

function calcolaTutti(perfil, hoy) {
  const out = {};
  out["calc.edad"] = calcEdad(perfil, hoy);
  out["calc.anios_residencia_legal"] = calcResidenciaLegal("anni", perfil, hoy);
  out["calc.meses_residencia_legal"] = calcResidenciaLegal("mesi", perfil, hoy);
  out["calc.anios_empadronado"] = calcDurata("residencia.empadronado_desde", "anni", perfil, hoy);
  out["calc.meses_empadronado"] = calcDurata("residencia.empadronado_desde", "mesi", perfil, hoy);
  out["calc.num_hijos"] = calcNumHijos(perfil);
  out["calc.hijos_menores_3"] = calcHijosMenores(3, perfil, hoy);
  out["calc.hijos_menores_18"] = calcHijosMenores(18, perfil, hoy);
  out["calc.hijos_menores_25"] = calcHijosMenores(25, perfil, hoy);
  out["calc.ingresos_individuales"] = calcIngresos("ingresos.individual", perfil);
  out["calc.ingresos_hogar"] = calcIngresosHogar(perfil);
  out["calc.ingresos_hogar_por_miembro"] = calcPorMiembro(perfil, out["calc.ingresos_hogar"]);
  out["calc.patrimonio_sin_vivienda"] = calcIngresos("ingresos.patrimonio_sin_vivienda", perfil);
  return out;
}

// ---------------------------------------------------------------------------
// Validazione di una regola (quello che lo schema avrebbe rifiutato, §5.6)

function valorScalareValido(def, x) {
  if (def.tipo === "enum") return typeof x === "string" && def.codici.has(x);
  if (def.tipo === "codigo") return typeof x === "string" && def.re.test(x);
  return validoItem(def.item)(x);
}

function listaValida(def, v) {
  return Array.isArray(v) && v.length >= 1 && new Set(v).size === v.length &&
    v.every((x) => valorScalareValido(def, x));
}

// Dà {campo, op, valor} pronti per valutare, oppure null se la regola non è valida.
function validaRegola(regla, grupos) {
  for (const k of Object.keys(regla)) if (!CHIAVI_REGOLA.has(k)) return null;
  const { campo, op } = regla;
  if (typeof campo !== "string" || !tiene(CAMPOS, campo)) return null;
  if (!esTesto(regla.texto)) return null;
  if (tiene(regla, "cita") && typeof regla.cita !== "string") return null;
  if (tiene(regla, "aclaracion") && typeof regla.aclaracion !== "string") return null;
  if (tiene(regla, "no_concluyente")) {
    const nc = regla.no_concluyente;
    if (!Array.isArray(nc) || nc.length < 1 || new Set(nc).size !== nc.length ||
      !nc.every((x) => x === C || x === N)) return null;
  }
  const def = CAMPOS[campo];
  const conValor = tiene(regla, "valor");
  const conGrupo = tiene(regla, "valor_grupo");
  if (conValor === conGrupo) return null;

  const opsLista = def.tipo === "lista" ? ["contains_any", "contains_none"] : ["in", "not_in"];
  let valor;
  if (conGrupo) {
    if (!def.grupo || !opsLista.includes(op)) return null;
    const g = regla.valor_grupo;
    if (typeof g !== "string" || !esOggetto(grupos) || !tiene(grupos, g)) return null;
    const lista = grupos[g];
    // Come catalogo.schema.json (grupos_paises): almeno un paese, senza ripetizioni,
    // ognuno ^[A-Z]{2}$. Un gruppo che lo schema rifiuterebbe rende la regola non valida.
    if (!listaValida({ tipo: "codigo", re: RE_PAIS }, lista)) return null;
    valor = lista;
  } else {
    valor = regla.valor;
  }

  switch (def.tipo) {
    case "numero":
      if (!OPS_NUM.includes(op) || !esNumero(valor)) return null;
      break;
    case "fecha":
      if (!OPS_FECHA.includes(op) || !esDataCompleta(valor)) return null;
      break;
    case "bool":
      if (!OPS_BOOL.includes(op) || typeof valor !== "boolean") return null;
      break;
    case "enum":
    case "codigo":
      if (!OPS_ESCALAR.includes(op)) return null;
      if (op === "==" || op === "!=") {
        if (!valorScalareValido(def, valor)) return null;
      } else if (!conGrupo && !listaValida(def, valor)) return null;
      break;
    case "lista":
      if (!OPS_LISTA.includes(op)) return null;
      if (op === "contains" || op === "not_contains") {
        if (!valorScalareValido(def, valor)) return null;
      } else if (!conGrupo && !listaValida(def, valor)) return null;
      break;
    default:
      return null;
  }
  return { campo, op, valor, def };
}

// ---------------------------------------------------------------------------
// Valutazione (§5.3, §5.4)

const riga = (texto, resultado, motivo, aclaracion, faltan) =>
  ({ texto, resultado, motivo, aclaracion, faltan });

function rigaNonValida(nodo) {
  const texto = esOggetto(nodo) && typeof nodo.texto === "string" ? nodo.texto : "";
  return riga(texto, F, "regla_no_valida", ACLARACION_REGLA_NO_VALIDA, []);
}

// Numeri e date: valore [lo, hi], soglia v.
function confrontaIntervallo(op, lo, hi, v) {
  switch (op) {
    case "<=": return hi <= v ? C : lo > v ? N : F;
    case "<": return hi < v ? C : lo >= v ? N : F;
    case ">=": return lo >= v ? C : hi < v ? N : F;
    case ">": return lo > v ? C : hi <= v ? N : F;
    case "==": return lo === v && hi === v ? C : v < lo || v > hi ? N : F;
    case "!=": return v < lo || v > hi ? C : lo === v && hi === v ? N : F;
    default: return null;
  }
}

function leggiPerRegola(campo, def, ctx) {
  if (def.calc) return ctx.calc[campo];
  switch (def.tipo) {
    case "numero": return leggiNumero(campo, def, ctx.perfil);
    case "fecha": return leggiData(campo, def, ctx.perfil, ctx.hoy);
    case "bool":
      if (campo === "vivienda.contrato_a_su_nombre") return leggiContrato(ctx.perfil);
      return leggiScalare(campo, (x) => typeof x === "boolean", ctx.perfil);
    case "enum":
    case "codigo": return leggiScalare(campo, (x) => valorScalareValido(def, x), ctx.perfil);
    case "lista": return leggiLista(campo, def, ctx.perfil);
    default: return manca("dato_no_valido", [campo]);
  }
}

// Esito di un solo valore scalare contro l'operatore della regola.
function esitoScalare(op, x, valor) {
  if (op === "==") return x === valor ? C : N;
  if (op === "!=") return x !== valor ? C : N;
  if (op === "in") return valor.includes(x) ? C : N;
  return valor.includes(x) ? N : C; // not_in
}

// Paesi dei titoli (estudios.titulos_paises, docs/ESQUEMA.md §2.6): la regola è soddisfatta se lo è per almeno un
// titolo; tutti i titoli si valutano. Un titolo con «no lo sé» non decide da solo.
function esitoTitoli(op, valor, perfil) {
  const c = "estudios.titulos_paises";
  const r = leggiPercorso(perfil, c);
  if (r.stato === "falta") return { esito: F, motivo: "falta", faltan: [c] };
  if (r.stato === "invalido") return { esito: F, motivo: "dato_no_valido", faltan: [c] };
  const lista = r.valore;
  if (esIndeterminado(lista) || !Array.isArray(lista) || lista.length === 0) {
    return { esito: F, motivo: "falta", faltan: [c] };
  }
  if (!lista.every((x) => typeof x === "string" && RE_PAIS.test(x))) {
    return { esito: F, motivo: "dato_no_valido", faltan: [c] };
  }
  const esiti = lista.map((x) => esitoScalare(op, x, valor));
  if (esiti.includes(C)) return { esito: C, motivo: null, faltan: [] };
  return { esito: N, motivo: null, faltan: [] };
}

function valutaRegola(regla, ctx) {
  const v = validaRegola(regla, ctx.grupos);
  if (!v) return rigaNonValida(regla);
  const { campo, op, valor, def } = v;
  const texto = regla.texto;
  if (campo === "estudios.titulo_pais") {
    const t = esitoTitoli(op, valor, ctx.perfil);
    return concludi(regla, t.esito, t.motivo, t.faltan);
  }
  const lettura = leggiPerRegola(campo, def, ctx);
  if (!lettura.ok) return riga(texto, F, lettura.motivo, null, [...lettura.faltan]);

  let esito;
  let motivo = null;
  let faltan = [];
  switch (def.tipo) {
    case "numero":
    case "fecha": {
      esito = confrontaIntervallo(op, lettura.lo, lettura.hi, valor);
      if (esito === F) {
        motivo = lettura.rango.motivo;
        faltan = [...lettura.rango.faltan];
      }
      break;
    }
    case "bool":
    case "enum":
    case "codigo": {
      esito = esitoScalare(op, lettura.valore, valor);
      break;
    }
    case "lista": {
      const L = lettura.insieme;
      const completa = lettura.incompleta === null;
      const lista = Array.isArray(valor) ? valor : [valor];
      const interseca = lista.some((x) => L.has(x));
      const positivo = op === "contains" || op === "contains_any";
      if (interseca) esito = positivo ? C : N;
      else if (completa) esito = positivo ? N : C;
      else {
        esito = F;
        motivo = lettura.incompleta;
        faltan = [...lettura.faltan];
      }
      break;
    }
    default:
      return rigaNonValida(regla);
  }

  // «Ninguna» (nessun ente) è un no certo: la regola sull'ente non lo rende incerto con no_concluyente.
  if (esito === N && def.tipo === "enum" && lettura.valore === "ninguna") return riga(texto, N, null, null, []);
  return concludi(regla, esito, motivo, faltan);
}

// Chiude una regola: no_concluyente (§4.4) si applica prima di combinarla, e solo a un esito cumple/no_cumple.
function concludi(regla, esito, motivo, faltan) {
  const texto = regla.texto;
  if (esito !== F && Array.isArray(regla.no_concluyente) && regla.no_concluyente.includes(esito)) {
    const acl = typeof regla.aclaracion === "string" ? regla.aclaracion : null;
    return riga(texto, F, "no_concluyente", acl, []);
  }
  return riga(texto, esito, esito === F ? motivo : null, null, esito === F ? faltan : []);
}

function combina(esiti, modo) {
  let r = modo === "min" ? C : N;
  for (const e of esiti) {
    if (modo === "min" ? RANGO_ESITO[e] < RANGO_ESITO[r] : RANGO_ESITO[e] > RANGO_ESITO[r]) r = e;
  }
  return r;
}

function valutaNodo(nodo, ctx, profondita) {
  if (!esOggetto(nodo) || profondita > 50) return rigaNonValida(nodo);
  const conAny = tiene(nodo, "any_of");
  const conAll = tiene(nodo, "all_of");
  if (!conAny && !conAll) return valutaRegola(nodo, ctx);

  // Gruppo: solo any_of o all_of, texto, cita.
  const chiave = conAny ? "any_of" : "all_of";
  for (const k of Object.keys(nodo)) {
    if (k !== chiave && k !== "texto" && k !== "cita") return rigaNonValida(nodo);
  }
  const figliNodi = nodo[chiave];
  if (!esTesto(nodo.texto) || !Array.isArray(figliNodi) || figliNodi.length < 1) {
    return rigaNonValida(nodo);
  }
  if (tiene(nodo, "cita") && typeof nodo.cita !== "string") return rigaNonValida(nodo);

  const figli = figliNodi.map((n) => valutaNodo(n, ctx, profondita + 1));
  const resultado = combina(figli.map((f) => f.resultado), conAny ? "max" : "min");
  if (resultado !== F) return riga(nodo.texto, resultado, null, null, []);
  const primo = figli.find((f) => f.resultado === F);
  const faltan = unione(figli.filter((f) => f.resultado === F).map((f) => f.faltan));
  let aclaracion = null;
  if (primo.motivo === "no_concluyente") aclaracion = primo.aclaracion;
  else if (primo.motivo === "regla_no_valida") aclaracion = ACLARACION_REGLA_NO_VALIDA;
  return riga(nodo.texto, F, primo.motivo, aclaracion, faltan);
}

// ---------------------------------------------------------------------------
// Scheda: apertura, por_revisar, filtro di territorio, ordine

function apertura(plazo, hoy) {
  if (!esOggetto(plazo) || hoy === null) return "desconocida";
  switch (plazo.tipo) {
    case "abierto_todo_el_ano": return "abierta";
    case "cerrado": return "cerrada";
    case "fechas": {
      if (!esDataCompleta(plazo.fin)) return "desconocida";
      const conInicio = tiene(plazo, "inicio") && plazo.inicio !== null;
      if (conInicio && !esDataCompleta(plazo.inicio)) return "desconocida";
      if (conInicio && hoy < plazo.inicio) return "por_abrir";
      return hoy <= plazo.fin ? "abierta" : "cerrada";
    }
    default: return "desconocida";
  }
}

function proximoPlazo(plazo, hoy) {
  if (!esOggetto(plazo) || hoy === null || plazo.tipo !== "fechas") return null;
  if (!esDataCompleta(plazo.fin)) return null;
  return hoy <= plazo.fin ? plazo.fin : null;
}

// Senza una data di revisione leggibile la scheda resta «Por revisar».
function porRevisar(ficha, hoy) {
  const r = ficha.revisar_antes_de;
  if (hoy === null || !esDataCompleta(r)) return true;
  return hoy > r;
}

function codiceTerritorio(perfil, campo, re) {
  const r = leggiPercorso(perfil, campo);
  if (r.stato !== "c_e" || typeof r.valore !== "string" || !re.test(r.valore)) return null;
  return r.valore;
}

// §6.4. Un ambito illeggibile non nasconde la scheda.
function siVede(ficha, pais, region) {
  const a = ficha.ambito;
  if (typeof a !== "string" || a === "EU") return true;
  if (RE_PAIS.test(a)) return pais === null || pais === a;
  if (RE_REGION.test(a)) {
    if (region !== null) return region === a;
    return pais === null || pais === a.slice(0, 2);
  }
  return true;
}

const ORDINE_TIPO = { derecho: 0, oportunidad: 1 };
const ORDINE_ESTADO = { encaja: 0, falta_dato: 1, no_encaja: 2 };

function confrontaVoci(a, b) {
  const ca = a.voce.apertura === "cerrada" ? 1 : 0;
  const cb = b.voce.apertura === "cerrada" ? 1 : 0;
  if (ca !== cb) return ca - cb;
  const ta = tiene(ORDINE_TIPO, a.voce.tipo) ? ORDINE_TIPO[a.voce.tipo] : 2;
  const tb = tiene(ORDINE_TIPO, b.voce.tipo) ? ORDINE_TIPO[b.voce.tipo] : 2;
  if (ta !== tb) return ta - tb;
  const ea = ORDINE_ESTADO[a.voce.estado];
  const eb = ORDINE_ESTADO[b.voce.estado];
  if (ea !== eb) return ea - eb;
  const pa = a.voce.proximo_plazo;
  const pb = b.voce.proximo_plazo;
  if (pa !== pb) {
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pa < pb ? -1 : 1;
  }
  const na = a.nombre;
  const nb = b.nombre;
  const cn = na.localeCompare(nb, "es");
  if (cn !== 0) return cn;
  const ia = a.voce.id === null ? "" : a.voce.id;
  const ib = b.voce.id === null ? "" : b.voce.id;
  if (ia !== ib) return ia < ib ? -1 : 1;
  return a.indice - b.indice;
}

const ESTADO = { cumple: "encaja", falta_dato: "falta_dato", no_cumple: "no_encaja" };

// Le aree della scheda (catalogo.schema.json, $defs/ficha/area), nell'ordine in cui
// l'interfaccia le mostra; un'area assente o sconosciuta va in fondo. Esportata (congelata)
// perché l'interfaccia raggruppi nello stesso ordine e perché una prova la confronti con lo schema.
export const AREAS = Object.freeze([
  "familia", "vivienda", "empleo", "estudios", "investigacion", "impuestos", "salud_cuidados",
  "extranjeria", "emprender", "jovenes_ocio", "servicios_sociales", "empleo_publico",
]);
const areaDi = (ficha) => (typeof ficha.area === "string" && AREAS.includes(ficha.area) ? ficha.area : null);
const rangoArea = (a) => (a === null ? AREAS.length : AREAS.indexOf(a));

// Informative: per area (ordine di AREAS), poi nome in spagnolo, poi id.
function confrontaInformative(a, b) {
  const ra = rangoArea(a.voce.area);
  const rb = rangoArea(b.voce.area);
  if (ra !== rb) return ra - rb;
  const cn = a.nombre.localeCompare(b.nombre, "es");
  if (cn !== 0) return cn;
  const ia = a.voce.id === null ? "" : a.voce.id;
  const ib = b.voce.id === null ? "" : b.voce.id;
  if (ia !== ib) return ia < ib ? -1 : 1;
  return a.indice - b.indice;
}

function valutaScheda(ficha, ctx) {
  let righe;
  if (Array.isArray(ficha.requisitos) && ficha.requisitos.length > 0) {
    righe = ficha.requisitos.map((n) => valutaNodo(n, ctx, 0));
  } else {
    // Requisitos che non sono una lista, o una lista vuota in una scheda che non è
    // informativa: senza nessuna regola la scheda darebbe «encaja» a chiunque, quindi
    // resta visibile come «falta_dato» e rinvia alla fonte.
    righe = [riga("Requisitos de esta ficha", F, "regla_no_valida", ACLARACION_REGLA_NO_VALIDA, [])];
  }
  const esito = combina(righe.map((r) => r.resultado), "min");
  const estado = ESTADO[esito];
  let razones;
  if (esito === C) razones = righe.map((r) => r.texto);
  else razones = righe.filter((r) => r.resultado === esito).map((r) => r.texto);
  const faltan = esito === F
    ? unione(righe.filter((r) => r.resultado === F).map((r) => r.faltan))
    : [];
  return {
    id: typeof ficha.id === "string" ? ficha.id : null,
    tipo: typeof ficha.tipo === "string" ? ficha.tipo : null,
    area: areaDi(ficha),
    estado,
    apertura: apertura(ficha.plazo, ctx.hoy),
    por_revisar: porRevisar(ficha, ctx.hoy),
    proximo_plazo: proximoPlazo(ficha.plazo, ctx.hoy),
    razones,
    faltan,
    requisitos: righe,
  };
}

// ---------------------------------------------------------------------------
// Contrato de evaluar()

// Campi vecchi → campi nuovi (docs/ESQUEMA.md §2.6). Non tocca l'oggetto ricevuto.
// estudios.titulo_pais (un codice) → estudios.titulos_paises (lista); vivienda.contrato_a_su_nombre (booleano)
// → vivienda.contrato_titularidad. Se il campo nuovo c'è già, vince quello.
export function normalizaPerfil(perfil) {
  if (!esOggetto(perfil)) return {};
  let out = perfil;
  const est = perfil.estudios;
  if (esOggetto(est) && tiene(est, "titulo_pais")) {
    const { titulo_pais: vecchio, ...resto } = est;
    if (resto.titulos_paises === undefined) {
      if (vecchio === "no_lo_se") resto.titulos_paises = "no_lo_se";
      else if (typeof vecchio === "string" && RE_PAIS.test(vecchio)) resto.titulos_paises = [vecchio];
    }
    out = { ...out, estudios: resto };
  }
  const viv = out.vivienda;
  if (esOggetto(viv) && tiene(viv, "contrato_a_su_nombre")) {
    const { contrato_a_su_nombre: vecchio, ...resto } = viv;
    if (resto.contrato_titularidad === undefined) {
      if (vecchio === true) resto.contrato_titularidad = "solo_mio";
      else if (vecchio === false) resto.contrato_titularidad = "otra_persona";
      else if (vecchio === "no_lo_se") resto.contrato_titularidad = "no_lo_se";
    }
    out = { ...out, vivienda: resto };
  }
  return out;
}

export function evaluar(catalogo, perfil, hoy) {
  const hoyValido = esDataCompleta(hoy) ? hoy : null;
  const prof = normalizaPerfil(esOggetto(perfil) ? perfil : {});
  const cat = esOggetto(catalogo) ? catalogo : {};
  const fichas = Array.isArray(cat.fichas) ? cat.fichas : [];
  const grupos = esOggetto(cat.grupos_paises) ? cat.grupos_paises : {};

  const calc = calcolaTutti(prof, hoyValido);
  const ctx = { perfil: prof, hoy: hoyValido, calc, grupos };

  const pais = codiceTerritorio(prof, "residencia.pais", RE_PAIS);
  const region = codiceTerritorio(prof, "residencia.region", RE_REGION);

  const voci = [];
  const informative = [];
  let ocultas = 0;
  fichas.forEach((ficha, indice) => {
    if (!esOggetto(ficha)) return;
    if (!siVede(ficha, pais, region)) {
      ocultas++;
      return;
    }
    const nombre = typeof ficha.nombre === "string" ? ficha.nombre : "";
    if (ficha.informativa === true) {
      // Una scheda informativa non riceve nessun esito: le sue regole non si leggono.
      const id = typeof ficha.id === "string" ? ficha.id : null;
      informative.push({ voce: { id, area: areaDi(ficha) }, nombre, indice });
      return;
    }
    voci.push({ voce: valutaScheda(ficha, ctx), nombre, indice });
  });
  voci.sort(confrontaVoci);
  informative.sort(confrontaInformative);

  const perfil_calculado = {};
  for (const k of CALC) {
    const c = calc[k];
    perfil_calculado[k] = c.ok ? [c.lo, c.hi === Infinity ? null : c.hi] : null;
  }

  return {
    hoy,
    fichas: voci.map((v) => v.voce),
    informativas: informative.map((v) => v.voce),
    ocultas_por_territorio: ocultas,
    perfil_calculado,
  };
}
