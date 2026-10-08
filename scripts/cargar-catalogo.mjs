// Carga inicial del catálogo: 15 vehículos (30 versiones), 3 proveedores y 60 productos con fotos reales.
// Uso: npm run db:catalogo  (lee .env.local; necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY).
// Las fotos (supabase/catalogo-fotos.json) se descargan de Unsplash / Wikimedia Commons y se suben al bucket product-images.
// Precios, stock y compatibilidades son estimados: las compatibilidades quedan "pendiente de verificar".
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const envFile = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const env = { ...Object.fromEntries(envFile.split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])), ...process.env };
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!env.NEXT_PUBLIC_SUPABASE_URL || !secret) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false } });
const picks = JSON.parse(readFileSync("supabase/catalogo-fotos.json", "utf8"));
const UA = { "User-Agent": "SR-Autorrepuestos/1.0 (carga de catalogo)" };

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------- Vehículos
const NEW_MODELS = [["toyota", "Allion", "allion"], ["toyota", "Land Cruiser Prado", "land-cruiser-prado"]];
const VERSIONS = [
  ["toyota", "hilux", "TOY-HILUX-30D-05", 2005, 2015, "3.0 D-4D (1KD-FTV)", "diesel", "Manual / Automática"],
  ["toyota", "hilux", "TOY-HILUX-24D-16", 2016, null, "2.4 D-4D (2GD-FTV)", "diesel", "Manual / Automática"],
  ["toyota", "hilux", "TOY-HILUX-28D-16", 2016, null, "2.8 D-4D (1GD-FTV)", "diesel", "Manual / Automática"],
  ["toyota", "corolla", "TOY-COROL-18-14", 2014, 2019, "1.8 (2ZR-FE)", "nafta", "Manual / CVT"],
  ["toyota", "corolla", "TOY-COROL-20-20", 2020, null, "2.0 (M20A-FKS)", "nafta", "CVT"],
  ["toyota", "vitz", "TOY-VITZ-10-11", 2011, 2019, "1.0 (1KR-FE)", "nafta", "CVT"],
  ["toyota", "vitz", "TOY-VITZ-13-11", 2011, 2019, "1.3 (1NR-FE)", "nafta", "CVT"],
  ["toyota", "allion", "TOY-ALLI-15-07", 2007, 2021, "1.5 (1NZ-FE)", "nafta", "Automática / CVT"],
  ["toyota", "allion", "TOY-ALLI-18-07", 2007, 2021, "1.8 (2ZR-FE)", "nafta", "CVT"],
  ["toyota", "rav4", "TOY-RAV4-20-13", 2013, 2018, "2.0 (3ZR-FE)", "nafta", "Manual / CVT"],
  ["toyota", "rav4", "TOY-RAV4-25H-19", 2019, null, "2.5 Híbrido (A25A-FXS)", "hibrido", "e-CVT"],
  ["toyota", "land-cruiser-prado", "TOY-PRADO-30D-09", 2009, 2015, "3.0 D-4D (1KD-FTV)", "diesel", "Manual / Automática"],
  ["toyota", "land-cruiser-prado", "TOY-PRADO-28D-16", 2016, null, "2.8 D-4D (1GD-FTV)", "diesel", "Automática"],
  ["kia", "picanto", "KIA-PICA-10-17", 2017, null, "1.0 Kappa", "nafta", "Manual / Automática"],
  ["kia", "picanto", "KIA-PICA-12-17", 2017, null, "1.2 Kappa", "nafta", "Manual / Automática"],
  ["kia", "sportage", "KIA-SPOR-20-16", 2016, 2021, "2.0 Nu", "nafta", "Manual / Automática"],
  ["kia", "sportage", "KIA-SPOR-20D-16", 2016, 2021, "2.0 CRDi (R)", "diesel", "Manual / Automática"],
  ["kia", "rio", "KIA-RIO-14-17", 2017, null, "1.4 Kappa", "nafta", "Manual / Automática"],
  ["hyundai", "hb20", "HYU-HB20-10-19", 2019, null, "1.0 Kappa", "nafta", "Manual"],
  ["hyundai", "hb20", "HYU-HB20-16-19", 2019, null, "1.6 Gamma", "nafta", "Manual / Automática"],
  ["hyundai", "tucson", "HYU-TUCS-20-16", 2016, 2021, "2.0 Nu", "nafta", "Automática"],
  ["hyundai", "tucson", "HYU-TUCS-20D-16", 2016, 2021, "2.0 CRDi (R)", "diesel", "Manual / Automática"],
  ["nissan", "frontier", "NIS-FRON-25D-08", 2008, 2015, "2.5 dCi (YD25)", "diesel", "Manual / Automática"],
  ["nissan", "frontier", "NIS-FRON-23D-16", 2016, null, "2.3 dCi (YS23)", "diesel", "Manual / Automática"],
  ["chevrolet", "onix", "CHE-ONIX-14-13", 2013, 2019, "1.4 SPE/4", "nafta", "Manual / Automática"],
  ["chevrolet", "onix", "CHE-ONIX-10T-20", 2020, null, "1.0 Turbo", "nafta", "Manual / Automática"],
  ["volkswagen", "gol", "VW-GOL-10-13", 2013, 2023, "1.0 (EA111)", "nafta", "Manual"],
  ["volkswagen", "gol", "VW-GOL-16-13", 2013, 2023, "1.6 MSI", "nafta", "Manual"],
  ["mitsubishi", "l200", "MIT-L200-25D-08", 2008, 2015, "2.5 DI-D (4D56)", "diesel", "Manual / Automática"],
  ["mitsubishi", "l200", "MIT-L200-24D-16", 2016, null, "2.4 DI-D (4N15)", "diesel", "Manual / Automática"],
];

// Grupos de compatibilidad
const V = {
  HILUX: ["TOY-HILUX-24D-16", "TOY-HILUX-28D-16"], HILUX30: ["TOY-HILUX-30D-05"],
  PRADO28: ["TOY-PRADO-28D-16"], PRADO30: ["TOY-PRADO-30D-09"],
  COROLLA: ["TOY-COROL-18-14", "TOY-COROL-20-20"], VITZ: ["TOY-VITZ-10-11", "TOY-VITZ-13-11"],
  ALLION: ["TOY-ALLI-15-07", "TOY-ALLI-18-07"], RAV4: ["TOY-RAV4-20-13", "TOY-RAV4-25H-19"],
  PICANTO: ["KIA-PICA-10-17", "KIA-PICA-12-17"], SPORTAGE: ["KIA-SPOR-20-16"], SPORTAGED: ["KIA-SPOR-20D-16"],
  RIO: ["KIA-RIO-14-17"], HB20: ["HYU-HB20-10-19", "HYU-HB20-16-19"], TUCSON: ["HYU-TUCS-20-16"], TUCSOND: ["HYU-TUCS-20D-16"],
  FRONTIER: ["NIS-FRON-25D-08", "NIS-FRON-23D-16"], ONIX: ["CHE-ONIX-14-13", "CHE-ONIX-10T-20"],
  GOL: ["VW-GOL-10-13", "VW-GOL-16-13"], L200: ["MIT-L200-25D-08", "MIT-L200-24D-16"],
};
const fit = (...groups) => groups.flatMap((g) => V[g] ?? [g]);

// ---------------------------------------------------------------------------- Proveedores
const SUPPLIERS = [
  { name: "Distribuidora Frenos del Sur", contact_name: "Por completar", email: null, phone: null, lead_time_days: 5, notes: "Frenos, suspensión, motor y embrague. Datos de contacto por completar." },
  { name: "Importadora Filtromax", contact_name: "Por completar", email: null, phone: null, lead_time_days: 3, notes: "Filtros y lubricantes. Datos de contacto por completar." },
  { name: "Eléctrica Central", contact_name: "Por completar", email: null, phone: null, lead_time_days: 7, notes: "Baterías, encendido e iluminación. Datos de contacto por completar." },
];
const supplierFor = (parent) =>
  ["frenos", "suspension", "embrague", "motor"].includes(parent) ? SUPPLIERS[0].name
    : ["filtros", "lubricantes"].includes(parent) ? SUPPLIERS[1].name : SUPPLIERS[2].name;

// ---------------------------------------------------------------------------- Productos
// [sku, nombre, marca, categoría, precio, costo, stock, specs, compatibles, extra]
const P = [
  // Frenos — pastillas
  ["SR-FRE-0001", "Pastillas de freno delanteras cerámicas Hilux / Prado", "bosch", "pastillas-de-freno", 395000, 240000, 14, { Posición: "Delantera", Material: "Cerámico", Piezas: "4", "Indicador de desgaste": "Sí" }, fit("HILUX", "HILUX30", "PRADO28", "PRADO30"), { compare: 440000 }],
  ["SR-FRE-0002", "Pastillas de freno delanteras Corolla / Allion", "trw", "pastillas-de-freno", 265000, 150000, 10, { Posición: "Delantera", Material: "Orgánico de baja metalicidad", Piezas: "4" }, fit("COROLLA", "ALLION")],
  ["SR-FRE-0003", "Pastillas de freno delanteras Vitz", "fras-le", "pastillas-de-freno", 175000, 95000, 9, { Posición: "Delantera", Material: "Orgánico", Piezas: "4" }, fit("VITZ")],
  ["SR-FRE-0004", "Pastillas de freno delanteras Picanto / Rio / HB20", "fras-le", "pastillas-de-freno", 185000, 98000, 12, { Posición: "Delantera", Material: "Orgánico", Piezas: "4" }, fit("PICANTO", "RIO", "HB20")],
  ["SR-FRE-0005", "Pastillas de freno delanteras Sportage / Tucson", "bosch", "pastillas-de-freno", 320000, 185000, 8, { Posición: "Delantera", Material: "Cerámico", Piezas: "4" }, fit("SPORTAGE", "SPORTAGED", "TUCSON", "TUCSOND")],
  ["SR-FRE-0006", "Pastillas de freno delanteras semimetálicas Frontier / L200", "fras-le", "pastillas-de-freno", 290000, 165000, 7, { Posición: "Delantera", Material: "Semimetálico", Piezas: "4", Uso: "Carga y caminos de tierra" }, fit("FRONTIER", "L200")],
  ["SR-FRE-0007", "Pastillas de freno delanteras Onix / Gol", "trw", "pastillas-de-freno", 195000, 105000, 11, { Posición: "Delantera", Material: "Orgánico", Piezas: "4" }, fit("ONIX", "GOL")],
  // Frenos — discos
  ["SR-FRE-0008", "Disco de freno delantero ventilado Hilux", "trw", "discos-de-freno", 520000, 320000, 6, { Posición: "Delantera", Tipo: "Ventilado", Unidades: "1" }, fit("HILUX", "PRADO28")],
  ["SR-FRE-0009", "Disco de freno delantero Corolla / Allion", "bosch", "discos-de-freno", 410000, 250000, 6, { Posición: "Delantera", Tipo: "Ventilado", Unidades: "1" }, fit("COROLLA", "ALLION")],
  ["SR-FRE-0010", "Disco de freno delantero Sportage / Tucson", "trw", "discos-de-freno", 480000, 290000, 4, { Posición: "Delantera", Tipo: "Ventilado", Unidades: "1" }, fit("SPORTAGE", "SPORTAGED", "TUCSON", "TUCSOND")],
  ["SR-FRE-0011", "Disco de freno delantero Gol / Onix", "fras-le", "discos-de-freno", 295000, 170000, 8, { Posición: "Delantera", Tipo: "Sólido", Unidades: "1" }, fit("GOL", "ONIX")],
  // Frenos — líquido
  ["SR-FRE-0012", "Líquido de frenos DOT 4 500 ml", "bosch", "liquido-de-frenos", 58000, 32000, 40, { Norma: "DOT 4", Contenido: "500 ml", "Punto de ebullición seco": "265 °C" }, [], { universal: true }],
  ["SR-FRE-0013", "Líquido de frenos DOT 4 1 litro", "trw", "liquido-de-frenos", 98000, 56000, 24, { Norma: "DOT 4", Contenido: "1 litro" }, [], { universal: true }],
  // Filtros — aceite
  ["SR-FIL-0001", "Filtro de aceite Hilux / Prado 2.4 y 2.8 diésel", "mann-filter", "filtros-de-aceite", 78000, 42000, 35, { Tipo: "Cartucho", "Juntas incluidas": "Sí" }, fit("HILUX", "PRADO28")],
  ["SR-FIL-0002", "Filtro de aceite Toyota nafta (Corolla, Vitz, Allion, RAV4)", "bosch", "filtros-de-aceite", 52000, 27000, 42, { Tipo: "Roscado", "Válvula antirretorno": "Silicona" }, fit("COROLLA", "VITZ", "ALLION", "TOY-RAV4-20-13")],
  ["SR-FIL-0003", "Filtro de aceite Kia / Hyundai nafta", "mann-filter", "filtros-de-aceite", 48000, 24000, 30, { Tipo: "Roscado" }, fit("PICANTO", "RIO", "HB20", "SPORTAGE", "TUCSON")],
  ["SR-FIL-0004", "Filtro de aceite Hilux 3.0 / Frontier / L200 diésel", "bosch", "filtros-de-aceite", 62000, 33000, 28, { Tipo: "Roscado", Uso: "Motores diésel" }, fit("HILUX30", "PRADO30", "FRONTIER", "L200")],
  ["SR-FIL-0005", "Filtro de aceite Onix / Gol", "mann-filter", "filtros-de-aceite", 45000, 23000, 26, { Tipo: "Roscado" }, fit("ONIX", "GOL")],
  // Filtros — aire
  ["SR-FIL-0006", "Filtro de aire de motor Hilux / Prado", "mann-filter", "filtros-de-aire", 145000, 82000, 18, { Forma: "Panel", "Uso recomendado": "Caminos con polvo" }, fit("HILUX", "HILUX30", "PRADO28", "PRADO30")],
  ["SR-FIL-0007", "Filtro de aire de motor Corolla / Allion", "bosch", "filtros-de-aire", 98000, 52000, 14, { Forma: "Panel" }, fit("COROLLA", "ALLION")],
  ["SR-FIL-0008", "Filtro de aire de motor Picanto / Rio / HB20", "mann-filter", "filtros-de-aire", 85000, 45000, 16, { Forma: "Panel" }, fit("PICANTO", "RIO", "HB20")],
  ["SR-FIL-0009", "Filtro de aire de motor Onix / Gol", "bosch", "filtros-de-aire", 79000, 41000, 15, { Forma: "Panel" }, fit("ONIX", "GOL")],
  // Filtros — combustible
  ["SR-FIL-0010", "Filtro de combustible diésel con separador de agua Hilux / Prado", "bosch", "filtros-de-combustible", 165000, 95000, 10, { Tipo: "Cartucho", "Separador de agua": "Sí" }, fit("HILUX", "PRADO28")],
  ["SR-FIL-0011", "Filtro de combustible diésel Frontier / L200 / Hilux 3.0", "mann-filter", "filtros-de-combustible", 140000, 80000, 9, { Tipo: "Cartucho", "Separador de agua": "Sí" }, fit("FRONTIER", "L200", "HILUX30", "PRADO30")],
  ["SR-FIL-0012", "Filtro de combustible diésel Sportage / Tucson CRDi", "bosch", "filtros-de-combustible", 175000, 100000, 5, { Tipo: "Cartucho" }, fit("SPORTAGED", "TUCSOND")],
  // Filtros — habitáculo
  ["SR-FIL-0013", "Filtro de habitáculo con carbón activado Toyota", "mann-filter", "filtros-de-habitaculo", 115000, 58000, 16, { Tipo: "Carbón activado" }, fit("HILUX", "COROLLA", "RAV4", "PRADO28", "VITZ", "ALLION")],
  ["SR-FIL-0014", "Filtro de habitáculo Kia / Hyundai", "bosch", "filtros-de-habitaculo", 89000, 46000, 14, { Tipo: "Partículas" }, fit("PICANTO", "RIO", "HB20", "SPORTAGE", "SPORTAGED", "TUCSON", "TUCSOND")],
  ["SR-FIL-0015", "Filtro de habitáculo Onix / Gol", "mann-filter", "filtros-de-habitaculo", 82000, 42000, 12, { Tipo: "Partículas" }, fit("ONIX", "GOL")],
  // Suspensión — amortiguadores
  ["SR-SUS-0001", "Amortiguador delantero a gas Hilux", "monroe", "amortiguadores", 680000, 420000, 8, { Posición: "Delantera", Tipo: "Gas bitubo", Unidades: "1" }, fit("HILUX", "HILUX30")],
  ["SR-SUS-0002", "Amortiguador trasero a gas Hilux", "monroe", "amortiguadores", 620000, 380000, 6, { Posición: "Trasera", Tipo: "Gas bitubo", Unidades: "1" }, fit("HILUX", "HILUX30")],
  ["SR-SUS-0003", "Amortiguador delantero Corolla / Allion", "cofap", "amortiguadores", 495000, 295000, 4, { Posición: "Delantera", Tipo: "McPherson", Unidades: "1" }, fit("COROLLA", "ALLION")],
  ["SR-SUS-0004", "Amortiguador delantero HB20 / Rio / Picanto", "cofap", "amortiguadores", 455000, 270000, 6, { Posición: "Delantera", Tipo: "McPherson", Unidades: "1" }, fit("HB20", "RIO", "PICANTO")],
  ["SR-SUS-0005", "Amortiguador trasero Frontier / L200", "monroe", "amortiguadores", 590000, 360000, 4, { Posición: "Trasera", Tipo: "Gas bitubo", Unidades: "1" }, fit("FRONTIER", "L200")],
  // Suspensión — rótulas
  ["SR-SUS-0006", "Rótula de suspensión inferior Hilux / Prado", "nakata", "rotulas-y-extremos", 210000, 118000, 5, { Posición: "Inferior", Incluye: "Tuerca" }, fit("HILUX", "HILUX30", "PRADO28", "PRADO30")],
  ["SR-SUS-0007", "Extremo de dirección Corolla / Allion / Vitz", "nakata", "rotulas-y-extremos", 145000, 80000, 8, { Lado: "Izquierdo o derecho", Unidades: "1" }, fit("COROLLA", "ALLION", "VITZ")],
  ["SR-SUS-0008", "Rótula de suspensión inferior Gol / Onix", "nakata", "rotulas-y-extremos", 125000, 68000, 7, { Posición: "Inferior" }, fit("GOL", "ONIX")],
  ["SR-SUS-0009", "Extremo de dirección Sportage / Tucson", "trw", "rotulas-y-extremos", 175000, 98000, 5, { Unidades: "1" }, fit("SPORTAGE", "SPORTAGED", "TUCSON", "TUCSOND")],
  // Encendido — bujías
  ["SR-ENC-0001", "Bujía de iridio Toyota (Corolla, Vitz, Allion, RAV4)", "ngk", "bujias", 92000, 51000, 48, { Electrodo: "Iridio", Unidades: "1" }, fit("COROLLA", "VITZ", "ALLION", "TOY-RAV4-20-13")],
  ["SR-ENC-0002", "Bujía de níquel Kia / Hyundai", "ngk", "bujias", 36000, 18000, 60, { Electrodo: "Níquel", Unidades: "1" }, fit("PICANTO", "RIO", "HB20", "SPORTAGE", "TUCSON")],
  ["SR-ENC-0003", "Bujía Onix / Gol", "ngk", "bujias", 38000, 19000, 52, { Electrodo: "Níquel", Unidades: "1" }, fit("ONIX", "GOL")],
  // Encendido — bobinas
  ["SR-ENC-0004", "Bobina de encendido tipo lápiz Toyota", "denso", "bobinas", 480000, 300000, 4, { Tipo: "Lápiz (una por cilindro)" }, fit("COROLLA", "VITZ", "ALLION", "TOY-RAV4-20-13")],
  ["SR-ENC-0005", "Bobina de encendido Kia / Hyundai", "bosch", "bobinas", 420000, 260000, 3, { Tipo: "Lápiz (una por cilindro)" }, fit("PICANTO", "RIO", "HB20")],
  ["SR-ENC-0006", "Bobina de encendido de 4 salidas Gol / Onix", "bosch", "bobinas", 520000, 320000, 3, { Tipo: "Bloque de 4 salidas" }, fit("GOL", "CHE-ONIX-14-13")],
  // Eléctrico — baterías
  ["SR-ELE-0001", "Batería 12V 45Ah", "moura", "baterias", 780000, 520000, 5, { Voltaje: "12 V", Capacidad: "45 Ah", "Polo positivo": "Derecho" }, fit("VITZ", "PICANTO", "HB20", "ONIX", "GOL", "RIO")],
  ["SR-ELE-0002", "Batería 12V 70Ah", "moura", "baterias", 1150000, 780000, 7, { Voltaje: "12 V", Capacidad: "70 Ah", "Polo positivo": "Derecho" }, fit("COROLLA", "ALLION", "RAV4", "SPORTAGE", "TUCSON")],
  ["SR-ELE-0003", "Batería 12V 90Ah para camionetas diésel", "moura", "baterias", 1480000, 990000, 5, { Voltaje: "12 V", Capacidad: "90 Ah", "Polo positivo": "Derecho" }, fit("HILUX", "HILUX30", "PRADO28", "PRADO30", "FRONTIER", "L200", "SPORTAGED", "TUCSOND")],
  // Eléctrico — lámparas
  ["SR-ELE-0004", "Lámpara halógena H4 12V 60/55W", "philips", "lamparas", 45000, 22000, 70, { Tipo: "H4", Potencia: "60/55 W", Unidades: "1" }, fit("HILUX30", "VITZ", "GOL", "PICANTO", "MIT-L200-25D-08", "NIS-FRON-25D-08")],
  ["SR-ELE-0005", "Lámpara halógena H7 12V 55W", "philips", "lamparas", 52000, 26000, 55, { Tipo: "H7", Potencia: "55 W", Unidades: "1" }, fit("SPORTAGE", "SPORTAGED", "TUCSON", "TUCSOND", "RIO", "HB20")],
  ["SR-ELE-0006", "Lámpara halógena H11 12V 55W", "philips", "lamparas", 58000, 29000, 40, { Tipo: "H11", Potencia: "55 W", Unidades: "1" }, fit("HILUX", "COROLLA", "RAV4", "PRADO28", "ALLION", "ONIX")],
  // Lubricantes
  ["SR-LUB-0001", "Aceite de motor 5W-30 sintético 4 litros", "castrol", "aceites-de-motor", 285000, 185000, 30, { Viscosidad: "5W-30", Tipo: "Sintético", Contenido: "4 litros" }, [], { universal: true }],
  ["SR-LUB-0002", "Aceite de motor 15W-40 diésel 4 litros", "castrol", "aceites-de-motor", 230000, 148000, 24, { Viscosidad: "15W-40", Tipo: "Mineral", Uso: "Diésel", Contenido: "4 litros" }, [], { universal: true }],
  ["SR-LUB-0003", "Aceite de motor 0W-20 sintético 4 litros", "castrol", "aceites-de-motor", 310000, 205000, 12, { Viscosidad: "0W-20", Tipo: "Sintético", Contenido: "4 litros" }, [], { universal: true }],
  // Motor — distribución
  ["SR-MOT-0001", "Kit de correa de distribución Gol / Onix 1.4", "gates", "distribucion", 520000, 320000, 4, { Incluye: "Correa y tensor" }, fit("VW-GOL-16-13", "CHE-ONIX-14-13")],
  ["SR-MOT-0002", "Kit de correa de distribución Hilux 3.0 / Prado 3.0 / L200 2.5", "gates", "distribucion", 680000, 430000, 3, { Incluye: "Correa, tensor y polea" }, fit("HILUX30", "PRADO30", "MIT-L200-25D-08")],
  ["SR-MOT-0003", "Correa de accesorios poly-V Hilux / Prado 2.8", "gates", "distribucion", 145000, 82000, 9, { Tipo: "Poly-V" }, fit("HILUX", "PRADO28")],
  // Motor — bombas de agua
  ["SR-MOT-0004", "Bomba de agua Hilux / Prado 2.4 y 2.8", "skf", "bombas-de-agua", 580000, 360000, 3, { Incluye: "Junta" }, fit("HILUX", "PRADO28")],
  ["SR-MOT-0005", "Bomba de agua Gol / Onix", "skf", "bombas-de-agua", 320000, 190000, 5, { Incluye: "Junta" }, fit("GOL", "CHE-ONIX-14-13")],
  // Embrague
  ["SR-EMB-0001", "Kit de embrague Hilux 2.4 / 2.8 manual", "valeo", "kits-de-embrague", 2250000, 1500000, 2, { Incluye: "Disco, placa y collarín" }, fit("HILUX")],
  ["SR-EMB-0002", "Kit de embrague Gol / Onix", "sachs", "kits-de-embrague", 980000, 640000, 3, { Incluye: "Disco, placa y collarín" }, fit("GOL", "CHE-ONIX-14-13")],
  ["SR-EMB-0003", "Kit de embrague HB20 / Rio / Picanto", "valeo", "kits-de-embrague", 890000, 580000, 3, { Incluye: "Disco, placa y collarín" }, fit("HB20", "RIO", "PICANTO")],
];

const DESCR = {
  "pastillas-de-freno": ["Juego de pastillas para eje delantero.", "Compuesto de fricción con chapa antirruido. Al reemplazarlas, revisar el estado de los discos y el nivel del líquido de frenos. Se recomienda instalación en taller."],
  "discos-de-freno": ["Disco de freno delantero, se vende por unidad.", "Disco de fundición con tratamiento anticorrosión. Reemplazar siempre de a pares y junto con las pastillas."],
  "liquido-de-frenos": ["Líquido de frenos sintético DOT 4.", "Compatible con sistemas que especifican DOT 3 o DOT 4. No mezclar con DOT 5 (silicona). Reemplazar cada 2 años."],
  "filtros-de-aceite": ["Filtro de aceite para cambio de mantenimiento.", "Reemplazar en cada cambio de aceite. Apto para aceites minerales y sintéticos."],
  "filtros-de-aire": ["Filtro de aire de motor.", "Medio filtrante de alta retención de polvo. En caminos de tierra, revisar cada 5.000 a 10.000 km."],
  "filtros-de-combustible": ["Filtro de combustible para motores diésel.", "Protege bomba e inyectores. Reemplazar según el plan de mantenimiento y drenar el agua acumulada periódicamente."],
  "filtros-de-habitaculo": ["Filtro de aire acondicionado / habitáculo.", "Retiene polvo y polen del aire que entra a la cabina. Se recomienda cambiarlo cada 15.000 km o una vez al año."],
  amortiguadores: ["Amortiguador, se vende por unidad.", "Se recomienda reemplazar por pares del mismo eje y revisar topes y fuelles."],
  "rotulas-y-extremos": ["Repuesto de suspensión y dirección.", "Después de instalarlo se recomienda hacer alineación."],
  bujias: ["Bujía, se vende por unidad.", "Reemplazar el juego completo según el plan de mantenimiento del fabricante."],
  bobinas: ["Bobina de encendido.", "Ante fallas de encendido intermitentes se recomienda diagnóstico previo con escáner."],
  baterias: ["Batería libre de mantenimiento.", "Verificar medidas del alojamiento y posición de los polos antes de comprar."],
  lamparas: ["Lámpara halógena para faros.", "Se vende por unidad. Verificar el tipo de lámpara en el manual del vehículo o en la lámpara actual."],
  "aceites-de-motor": ["Aceite de motor en envase de 4 litros.", "Usar la viscosidad y norma indicadas en el manual del vehículo."],
  distribucion: ["Repuesto de distribución / correas.", "Reemplazar según el kilometraje indicado por el fabricante. Instalación en taller."],
  "bombas-de-agua": ["Bomba de agua del sistema de refrigeración.", "Se recomienda cambiar el refrigerante y revisar la correa al reemplazarla."],
  "kits-de-embrague": ["Kit de embrague completo.", "Incluye disco, placa y collarín. Instalación en taller."],
};

// ---------------------------------------------------------------------------- Carga
const existing = must(await db.from("products").select("sku"), "productos").map((p) => p.sku);
if (existing.length) throw new Error(`Ya hay ${existing.length} productos cargados; no se vuelve a cargar.`);

// Modelos y versiones
const makes = Object.fromEntries(must(await db.from("vehicle_makes").select("id, slug"), "marcas").map((m) => [m.slug, m.id]));
for (const [make, name, slug] of NEW_MODELS) {
  must(await db.from("vehicle_models").upsert({ make_id: makes[make], name, slug }, { onConflict: "make_id,slug" }), `modelo ${name}`);
}
const models = must(await db.from("vehicle_models").select("id, slug, make_id"), "modelos");
const modelId = (make, slug) => models.find((m) => m.make_id === makes[make] && m.slug === slug)?.id;
const versionRows = VERSIONS.map(([make, model, code, year_from, year_to, engine, fuel, transmission]) => {
  const model_id = modelId(make, model);
  if (!model_id) throw new Error(`Falta el modelo ${make}/${model}`);
  return { model_id, code, year_from, year_to, engine, fuel, transmission };
});
must(await db.from("vehicle_versions").upsert(versionRows, { onConflict: "code" }), "versiones");
const versions = Object.fromEntries(must(await db.from("vehicle_versions").select("id, code"), "versiones").map((v) => [v.code, v.id]));
console.log("versiones:", Object.keys(versions).length);

// Proveedores
const supplierIds = {};
for (const s of SUPPLIERS) {
  const found = must(await db.from("suppliers").select("id").eq("name", s.name).maybeSingle(), "proveedor");
  supplierIds[s.name] = found?.id ?? must(await db.from("suppliers").insert(s).select("id").single(), `proveedor ${s.name}`).id;
}

// Fotos → Storage
const imageUrls = {};
for (const [cat, list] of Object.entries(picks)) {
  imageUrls[cat] = [];
  for (const [i, p] of list.entries()) {
    const key = `catalogo/${cat}-${i}.webp`;
    // Wikimedia: se pide una miniatura de 1200 px en lugar del original (algunos pesan más de 10 MB).
    const thumb = p.source === "wikimedia" ? `${p.url.replace("/commons/", "/commons/thumb/")}/1200px-${p.url.split("/").pop()}` : p.url;
    let res = await fetch(thumb, { headers: UA });
    if (!res.ok && thumb !== p.url) res = await fetch(p.url, { headers: UA });
    if (!res.ok) throw new Error(`No se pudo descargar ${p.url} (${res.status})`);
    const webp = await sharp(Buffer.from(await res.arrayBuffer())).rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    must(await db.storage.from("product-images").upload(key, webp, { contentType: "image/webp", cacheControl: "31536000", upsert: true }), `foto ${key}`);
    imageUrls[cat].push(db.storage.from("product-images").getPublicUrl(key).data.publicUrl);
  }
}
console.log("fotos subidas:", Object.values(imageUrls).flat().length);

// Productos
const brands = Object.fromEntries(must(await db.from("brands").select("id, slug"), "marcas").map((b) => [b.slug, b.id]));
const cats = must(await db.from("categories").select("id, slug, parent_id"), "categorías");
const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));
const parentSlug = (slug) => cats.find((c) => c.id === catBySlug[slug].parent_id)?.slug ?? slug;
const perCat = {};

for (const [sku, name, brand, cat, price, cost, stock, specs, fits, extra = {}] of P) {
  if (!brands[brand]) throw new Error(`Falta la marca ${brand}`);
  if (!catBySlug[cat]) throw new Error(`Falta la categoría ${cat}`);
  const [short, descr] = DESCR[cat];
  const product = must(await db.from("products").insert({
    sku, name, slug: slugify(`${name}-${sku}`), short_description: short, description: descr,
    brand_id: brands[brand], category_id: catBySlug[cat].id, status: "published",
    price, compare_at_price: extra.compare ?? null, cost, is_universal: !!extra.universal, specs,
    warranty_months: ["aceites-de-motor", "liquido-de-frenos"].includes(cat) ? null : 6,
    min_stock: Math.max(2, Math.round(stock / 4)),
  }).select("id").single(), `producto ${sku}`);

  const imgs = imageUrls[cat];
  const k = (perCat[cat] = (perCat[cat] ?? -1) + 1);
  const chosen = imgs.length > 1 ? [imgs[k % imgs.length], imgs[(k + 1) % imgs.length]] : imgs;
  must(await db.from("product_images").insert(chosen.map((url, sort) => ({ product_id: product.id, url, alt: name, sort }))), `fotos ${sku}`);

  must(await db.from("stock_levels").insert({ product_id: product.id, on_hand: stock }), `stock ${sku}`);
  must(await db.from("stock_movements").insert({ product_id: product.id, type: "initial", quantity: stock, on_hand_after: stock, reserved_after: 0, reason: "Carga inicial del catálogo", source: "system" }), `movimiento ${sku}`);

  const sup = supplierIds[supplierFor(parentSlug(cat))];
  must(await db.from("supplier_products").insert({ supplier_id: sup, product_id: product.id, cost, lead_time_days: null, is_preferred: true }), `proveedor ${sku}`);

  if (fits.length) {
    const rows = [...new Set(fits)].map((code) => {
      if (!versions[code]) throw new Error(`Versión desconocida ${code} en ${sku}`);
      return { product_id: product.id, version_id: versions[code], status: "unverified", source: "Carga inicial — verificar con el código del repuesto" };
    });
    must(await db.from("product_fitments").insert(rows), `compatibilidad ${sku}`);
  }
  process.stdout.write(".");
}
console.log("\nproductos:", P.length);

// Página de créditos de las fotos (licencias CC BY / BY-SA piden atribución)
const credits = Object.values(picks).flat().filter((p) => p.source === "wikimedia");
const body = [
  "Algunas fotos del catálogo son ilustrativas y provienen de bancos de imágenes libres. Muestran el tipo de repuesto, no necesariamente la pieza exacta de cada marca.",
  "",
  "Fotos de Unsplash (licencia Unsplash).",
  "",
  "Fotos de Wikimedia Commons:",
  ...credits.map((p) => `- ${p.title.replace(/^File:/, "")} — ${p.credit || "autor sin nombre"} — ${p.license} — ${p.page}`),
].join("\n");
must(await db.from("pages").upsert({ slug: "creditos-imagenes", title: "Créditos de imágenes", body, published: true, updated_at: new Date().toISOString() }, { onConflict: "slug" }), "página de créditos");
console.log("listo");
