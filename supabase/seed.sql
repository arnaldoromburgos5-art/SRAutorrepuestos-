-- SR Autorrepuestos — datos de demostración.
-- IMPORTANTE: precios, códigos y compatibilidades son ilustrativos. Reemplazalos por datos reales
-- (catálogo del proveedor o base técnica) antes de publicar la tienda.

-- Configuración ---------------------------------------------------------------
insert into public.settings (key, value, is_public) values
('store', '{
  "name": "SR Autorrepuestos",
  "legal_name": "SR Autorrepuestos",
  "ruc": "",
  "phone": "+595 21 000 000",
  "whatsapp": "+595 981 000 000",
  "email": "ventas@srautorrepuestos.com.py",
  "address": "Asunción, Paraguay",
  "hours": "Lunes a viernes de 8:00 a 18:00 · Sábados de 8:00 a 12:00"
}', true),
('currency', '{
  "base": "PYG",
  "rates": { "USD": 7800, "BRL": 1420 },
  "note": "Cotización de referencia: 1 USD = 7.800 Gs. · 1 BRL = 1.420 Gs. Los pagos se procesan en guaraníes."
}', true),
('checkout', '{ "reservation_minutes": 45, "guest_checkout": true }', true),
('policies', '{
  "shipping": "Retiro sin costo en nuestro local. Envíos a domicilio en Asunción y Gran Asunción en 24 a 48 h hábiles. Envíos al interior por agencia de transporte en 2 a 4 días hábiles.",
  "warranty": "Todos los repuestos tienen garantía del fabricante contra defectos de fabricación. El plazo figura en cada producto. La garantía no cubre fallas por instalación incorrecta ni desgaste normal.",
  "returns": "Podés devolver productos sin uso, en su empaque original y con la factura, dentro de los 7 días de recibidos. Las piezas eléctricas instaladas no admiten devolución salvo falla de fábrica.",
  "payment": "Aceptamos tarjetas de crédito y débito. Los precios incluyen IVA."
}', true),
('assistant', '{ "handoff_contact": "WhatsApp +595 981 000 000", "shopper_enabled": true, "admin_enabled": true }', false);

insert into public.shipping_zones (name, method, departments, cost, free_over, eta, sort) values
('Asunción', 'home', array['Asunción'], 25000, 1500000, '24 a 48 h hábiles', 1),
('Gran Asunción (Central)', 'home', array['Central'], 35000, 2000000, '24 a 72 h hábiles', 2),
('Interior del país', 'agency', array['Alto Paraná','Itapúa','Cordillera','Paraguarí','Guairá','Caaguazú','Caazapá','Misiones','Ñeembucú','Amambay','Canindeyú','Presidente Hayes','Concepción','San Pedro','Alto Paraguay','Boquerón'], 40000, 3000000, '2 a 4 días hábiles', 3);

-- Marcas y categorías -------------------------------------------------------------
insert into public.brands (name, slug, country, is_featured) values
('Bosch', 'bosch', 'Alemania', true),
('NGK', 'ngk', 'Japón', true),
('Mann-Filter', 'mann-filter', 'Alemania', true),
('Monroe', 'monroe', 'Estados Unidos', true),
('Cofap', 'cofap', 'Brasil', false),
('Fras-le', 'fras-le', 'Brasil', true),
('Nakata', 'nakata', 'Brasil', false),
('Moura', 'moura', 'Brasil', true),
('Gates', 'gates', 'Estados Unidos', false),
('SKF', 'skf', 'Suecia', false),
('Castrol', 'castrol', 'Reino Unido', true),
('Denso', 'denso', 'Japón', false),
('Valeo', 'valeo', 'Francia', false),
('TRW', 'trw', 'Alemania', false),
('Sachs', 'sachs', 'Alemania', false),
('Philips', 'philips', 'Países Bajos', false);

insert into public.categories (name, slug, icon, sort, is_featured, description) values
('Frenos', 'frenos', 'disc', 1, true, 'Pastillas, discos y componentes del sistema de frenos.'),
('Filtros', 'filtros', 'filter', 2, true, 'Filtros de aceite, aire, combustible y habitáculo.'),
('Suspensión', 'suspension', 'move-vertical', 3, true, 'Amortiguadores, rótulas, bujes y componentes de dirección.'),
('Encendido', 'encendido', 'zap', 4, true, 'Bujías, bobinas y cables.'),
('Eléctrico', 'electrico', 'battery-charging', 5, true, 'Baterías, lámparas y componentes eléctricos.'),
('Lubricantes', 'lubricantes', 'droplet', 6, true, 'Aceites de motor, caja y fluidos.'),
('Motor', 'motor', 'cog', 7, true, 'Distribución, correas, bombas y juntas.'),
('Embrague', 'embrague', 'circle-dot', 8, false, 'Kits de embrague y componentes.');

insert into public.categories (parent_id, name, slug, icon, sort)
select c.id, v.name, v.slug, c.icon, v.sort
from (values
  ('frenos', 'Pastillas de freno', 'pastillas-de-freno', 1),
  ('frenos', 'Discos de freno', 'discos-de-freno', 2),
  ('frenos', 'Líquido de frenos', 'liquido-de-frenos', 3),
  ('filtros', 'Filtros de aceite', 'filtros-de-aceite', 1),
  ('filtros', 'Filtros de aire', 'filtros-de-aire', 2),
  ('filtros', 'Filtros de combustible', 'filtros-de-combustible', 3),
  ('filtros', 'Filtros de habitáculo', 'filtros-de-habitaculo', 4),
  ('suspension', 'Amortiguadores', 'amortiguadores', 1),
  ('suspension', 'Rótulas y extremos', 'rotulas-y-extremos', 2),
  ('encendido', 'Bujías', 'bujias', 1),
  ('encendido', 'Bobinas', 'bobinas', 2),
  ('electrico', 'Baterías', 'baterias', 1),
  ('electrico', 'Lámparas', 'lamparas', 2),
  ('lubricantes', 'Aceites de motor', 'aceites-de-motor', 1),
  ('motor', 'Distribución', 'distribucion', 1),
  ('motor', 'Bombas de agua', 'bombas-de-agua', 2),
  ('embrague', 'Kits de embrague', 'kits-de-embrague', 1)
) as v(parent, name, slug, sort)
join public.categories c on c.slug = v.parent;

-- Vehículos -------------------------------------------------------------------
insert into public.vehicle_makes (name, slug) values
('Toyota', 'toyota'), ('Kia', 'kia'), ('Hyundai', 'hyundai'), ('Nissan', 'nissan'),
('Chevrolet', 'chevrolet'), ('Volkswagen', 'volkswagen'), ('Mitsubishi', 'mitsubishi');

insert into public.vehicle_models (make_id, name, slug)
select m.id, v.name, v.slug
from (values
  ('toyota', 'Hilux', 'hilux'), ('toyota', 'Corolla', 'corolla'), ('toyota', 'Vitz', 'vitz'),
  ('toyota', 'Fortuner', 'fortuner'), ('toyota', 'RAV4', 'rav4'),
  ('kia', 'Picanto', 'picanto'), ('kia', 'Sportage', 'sportage'), ('kia', 'Rio', 'rio'),
  ('hyundai', 'HB20', 'hb20'), ('hyundai', 'Tucson', 'tucson'), ('hyundai', 'Creta', 'creta'),
  ('nissan', 'Frontier', 'frontier'), ('nissan', 'March', 'march'), ('nissan', 'Versa', 'versa'),
  ('chevrolet', 'Onix', 'onix'), ('chevrolet', 'S10', 's10'),
  ('volkswagen', 'Gol', 'gol'), ('volkswagen', 'Amarok', 'amarok'),
  ('mitsubishi', 'L200', 'l200')
) as v(make, name, slug)
join public.vehicle_makes m on m.slug = v.make;

insert into public.vehicle_versions (model_id, code, year_from, year_to, engine, fuel, transmission)
select mo.id, v.code, v.y1, v.y2, v.engine, v.fuel, v.trans
from (values
  ('toyota', 'hilux', 'TOY-HILUX-30D-05', 2005, 2015, '3.0 D-4D (1KD-FTV)', 'diesel', 'Manual / Automática'),
  ('toyota', 'hilux', 'TOY-HILUX-24D-16', 2016, null, '2.4 D-4D (2GD-FTV)', 'diesel', 'Manual'),
  ('toyota', 'hilux', 'TOY-HILUX-28D-16', 2016, null, '2.8 D-4D (1GD-FTV)', 'diesel', 'Manual / Automática'),
  ('toyota', 'corolla', 'TOY-COROL-18-14', 2014, 2019, '1.8 Dual VVT-i (2ZR-FE)', 'nafta', 'Manual / CVT'),
  ('toyota', 'corolla', 'TOY-COROL-20-20', 2020, null, '2.0 Dynamic Force (M20A)', 'nafta', 'CVT'),
  ('toyota', 'vitz', 'TOY-VITZ-10-11', 2011, 2019, '1.0 (1KR-FE)', 'nafta', 'CVT'),
  ('toyota', 'vitz', 'TOY-VITZ-13-11', 2011, 2019, '1.3 (1NR-FE)', 'nafta', 'CVT'),
  ('toyota', 'fortuner', 'TOY-FORT-28D-16', 2016, null, '2.8 D-4D (1GD-FTV)', 'diesel', 'Automática'),
  ('toyota', 'rav4', 'TOY-RAV4-20-19', 2019, null, '2.0 Dynamic Force (M20A)', 'nafta', 'CVT'),
  ('kia', 'picanto', 'KIA-PICA-10-17', 2017, null, '1.0 Kappa', 'nafta', 'Manual'),
  ('kia', 'picanto', 'KIA-PICA-12-17', 2017, null, '1.2 Kappa', 'nafta', 'Manual / Automática'),
  ('kia', 'sportage', 'KIA-SPOR-20-16', 2016, 2021, '2.0 Nu MPI', 'nafta', 'Automática'),
  ('kia', 'sportage', 'KIA-SPOR-20D-16', 2016, 2021, '2.0 CRDi', 'diesel', 'Automática'),
  ('kia', 'rio', 'KIA-RIO-14-17', 2017, 2023, '1.4 Kappa', 'nafta', 'Manual / Automática'),
  ('hyundai', 'hb20', 'HYU-HB20-10-19', 2019, null, '1.0 Kappa', 'nafta', 'Manual'),
  ('hyundai', 'hb20', 'HYU-HB20-16-19', 2019, null, '1.6 Gamma', 'nafta', 'Automática'),
  ('hyundai', 'tucson', 'HYU-TUCS-20-16', 2016, 2021, '2.0 Nu MPI', 'nafta', 'Automática'),
  ('hyundai', 'tucson', 'HYU-TUCS-20D-16', 2016, 2021, '2.0 CRDi', 'diesel', 'Automática'),
  ('hyundai', 'creta', 'HYU-CRET-16-17', 2017, null, '1.6 Gamma', 'nafta', 'Manual / Automática'),
  ('nissan', 'frontier', 'NIS-FRON-23D-16', 2016, null, '2.3 dCi Biturbo (YS23)', 'diesel', 'Manual / Automática'),
  ('nissan', 'march', 'NIS-MARC-16-12', 2012, 2020, '1.6 (HR16DE)', 'nafta', 'Manual'),
  ('nissan', 'versa', 'NIS-VERS-16-12', 2012, 2019, '1.6 (HR16DE)', 'nafta', 'Manual / CVT'),
  ('chevrolet', 'onix', 'CHE-ONIX-14-13', 2013, 2019, '1.4 SPE/4', 'flex', 'Manual'),
  ('chevrolet', 'onix', 'CHE-ONIX-10T-20', 2020, null, '1.0 Turbo', 'nafta', 'Manual / Automática'),
  ('chevrolet', 's10', 'CHE-S10-28D-12', 2012, null, '2.8 Duramax', 'diesel', 'Manual / Automática'),
  ('volkswagen', 'gol', 'VW-GOL-16-13', 2013, 2023, '1.6 MSI', 'flex', 'Manual'),
  ('volkswagen', 'amarok', 'VW-AMAR-20D-10', 2010, null, '2.0 TDI', 'diesel', 'Manual / Automática'),
  ('mitsubishi', 'l200', 'MIT-L200-24D-16', 2016, null, '2.4 MIVEC (4N15)', 'diesel', 'Manual / Automática')
) as v(make, model, code, y1, y2, engine, fuel, trans)
join public.vehicle_makes ma on ma.slug = v.make
join public.vehicle_models mo on mo.make_id = ma.id and mo.slug = v.model;

-- Productos -------------------------------------------------------------------
insert into public.products (sku, name, slug, short_description, description, brand_id, category_id, status,
                             price, compare_at_price, cost, is_universal, specs, warranty_months, min_stock, weight_grams)
select v.sku, v.name, v.slug, v.short, v.descr, b.id, c.id, 'published',
       v.price, v.compare, v.cost, v.universal, v.specs::jsonb, v.warranty, v.min_stock, v.weight
from (values
  ('SR-FRE-0001', 'Pastillas de freno delanteras cerámicas', 'pastillas-freno-delanteras-bosch-hilux', 'Juego de 4 pastillas cerámicas de bajo polvo para eje delantero.',
   'Pastillas de compuesto cerámico con chapa antirruido y indicador de desgaste. Menor emisión de polvo y funcionamiento silencioso. Se recomienda revisar el estado de los discos al reemplazarlas.',
   'bosch', 'pastillas-de-freno', 395000, 440000, 240000, false, '{"Posición":"Delantera","Material":"Cerámico","Piezas":"4","Indicador de desgaste":"Sí"}', 12, 4, 1900),
  ('SR-FRE-0002', 'Pastillas de freno delanteras semimetálicas', 'pastillas-freno-delanteras-frasle-hilux', 'Juego de pastillas semimetálicas para uso intensivo y carga.',
   'Compuesto semimetálico de alto coeficiente de fricción, pensado para camionetas con carga o uso en caminos de tierra.',
   'fras-le', 'pastillas-de-freno', 285000, null, 165000, false, '{"Posición":"Delantera","Material":"Semimetálico","Piezas":"4"}', 6, 4, 2000),
  ('SR-FRE-0003', 'Pastillas de freno delanteras', 'pastillas-freno-delanteras-trw-corolla', 'Pastillas delanteras con cámara de ruido y chaflanes.',
   'Pastillas con formulación de bajo ruido para autos de pasajeros. Incluyen accesorios de montaje.',
   'trw', 'pastillas-de-freno', 265000, null, 150000, false, '{"Posición":"Delantera","Material":"Orgánico de baja metalicidad","Piezas":"4"}', 12, 3, 1300),
  ('SR-FRE-0004', 'Pastillas de freno delanteras', 'pastillas-freno-delanteras-frasle-hb20', 'Juego de pastillas delanteras para compactos.',
   'Pastillas con compuesto orgánico para uso urbano, desgaste parejo y bajo ruido.',
   'fras-le', 'pastillas-de-freno', 185000, null, 98000, false, '{"Posición":"Delantera","Material":"Orgánico","Piezas":"4"}', 6, 4, 1100),
  ('SR-FRE-0005', 'Disco de freno delantero ventilado', 'disco-freno-delantero-trw-hilux', 'Disco ventilado delantero, se vende por unidad.',
   'Disco ventilado de fundición gris con tratamiento anticorrosión. Se recomienda reemplazar en pares y junto con las pastillas.',
   'trw', 'discos-de-freno', 520000, null, 320000, false, '{"Posición":"Delantera","Tipo":"Ventilado","Diámetro":"319 mm","Unidades":"1"}', 12, 2, 9800),
  ('SR-FRE-0006', 'Disco de freno delantero', 'disco-freno-delantero-bosch-corolla', 'Disco delantero ventilado para Corolla, por unidad.',
   'Disco ventilado con balanceo de fábrica. Se vende por unidad; reemplazar siempre de a pares.',
   'bosch', 'discos-de-freno', 410000, null, 250000, false, '{"Posición":"Delantera","Tipo":"Ventilado","Diámetro":"275 mm","Unidades":"1"}', 12, 2, 7200),
  ('SR-FRE-0007', 'Líquido de frenos DOT 4 500 ml', 'liquido-frenos-dot4-bosch-500', 'Líquido sintético DOT 4 de alto punto de ebullición.',
   'Líquido de frenos sintético DOT 4. Compatible con sistemas que especifican DOT 3 o DOT 4. No mezclar con DOT 5 (silicona).',
   'bosch', 'liquido-de-frenos', 58000, null, 32000, true, '{"Norma":"DOT 4","Contenido":"500 ml","Punto de ebullición seco":"265 °C"}', null, 10, 600),
  ('SR-FIL-0001', 'Filtro de aceite', 'filtro-aceite-mann-hilux-diesel', 'Filtro de aceite de cartucho para motores diésel GD.',
   'Elemento filtrante de cartucho con juntas incluidas. Reemplazar en cada cambio de aceite.',
   'mann-filter', 'filtros-de-aceite', 78000, null, 42000, false, '{"Tipo":"Cartucho","Juntas incluidas":"Sí"}', 6, 10, 250),
  ('SR-FIL-0002', 'Filtro de aceite', 'filtro-aceite-bosch-toyota-nafta', 'Filtro de aceite roscado para motores nafteros Toyota.',
   'Filtro roscado con válvula antirretorno de silicona. Apto para aceites sintéticos.',
   'bosch', 'filtros-de-aceite', 52000, null, 27000, false, '{"Tipo":"Roscado","Rosca":"M20 x 1.5","Válvula antirretorno":"Silicona"}', 6, 12, 220),
  ('SR-FIL-0003', 'Filtro de aceite', 'filtro-aceite-mann-kia-hyundai', 'Filtro de aceite roscado para motores Kappa y Gamma.',
   'Filtro roscado para motores de Kia y Hyundai. Medio filtrante de celulosa reforzada.',
   'mann-filter', 'filtros-de-aceite', 48000, null, 24000, false, '{"Tipo":"Roscado","Rosca":"3/4-16 UNF"}', 6, 12, 200),
  ('SR-FIL-0004', 'Filtro de aire de motor', 'filtro-aire-mann-hilux', 'Filtro de aire de panel para Hilux y Fortuner.',
   'Filtro de aire con medio filtrante de alta retención de polvo, ideal para caminos de tierra. Revisar cada 10.000 km.',
   'mann-filter', 'filtros-de-aire', 145000, null, 82000, false, '{"Forma":"Panel","Uso recomendado":"Caminos con polvo"}', 6, 6, 500),
  ('SR-FIL-0005', 'Filtro de aire de motor', 'filtro-aire-bosch-corolla', 'Filtro de aire de panel para Corolla.',
   'Filtro de panel con marco de poliuretano y alta capacidad de retención.',
   'bosch', 'filtros-de-aire', 98000, null, 52000, false, '{"Forma":"Panel"}', 6, 6, 350),
  ('SR-FIL-0006', 'Filtro de combustible diésel', 'filtro-combustible-bosch-hilux', 'Filtro de combustible con separador de agua.',
   'Filtro de combustible para sistemas common rail con separación de agua. Fundamental para cuidar los inyectores.',
   'bosch', 'filtros-de-combustible', 165000, 185000, 95000, false, '{"Tipo":"Cartucho","Separador de agua":"Sí"}', 6, 5, 400),
  ('SR-FIL-0007', 'Filtro de habitáculo con carbón activado', 'filtro-habitaculo-mann-toyota', 'Filtro de aire acondicionado con carbón activado.',
   'Retiene polen, polvo y olores. Se recomienda cambiar cada 15.000 km o una vez al año.',
   'mann-filter', 'filtros-de-habitaculo', 115000, null, 58000, false, '{"Tipo":"Carbón activado"}', 6, 6, 250),
  ('SR-SUS-0001', 'Amortiguador delantero a gas', 'amortiguador-delantero-monroe-hilux', 'Amortiguador delantero bitubo presurizado, por unidad.',
   'Amortiguador a gas de doble tubo con válvulas de respuesta progresiva. Se recomienda reemplazar por pares del mismo eje.',
   'monroe', 'amortiguadores', 680000, null, 420000, false, '{"Posición":"Delantera","Tipo":"Gas bitubo","Unidades":"1"}', 12, 2, 2800),
  ('SR-SUS-0002', 'Amortiguador trasero a gas', 'amortiguador-trasero-monroe-hilux', 'Amortiguador trasero para camioneta, por unidad.',
   'Amortiguador trasero de alto recorrido para uso con carga.',
   'monroe', 'amortiguadores', 620000, null, 380000, false, '{"Posición":"Trasera","Tipo":"Gas bitubo","Unidades":"1"}', 12, 2, 2600),
  ('SR-SUS-0003', 'Amortiguador delantero', 'amortiguador-delantero-cofap-hb20', 'Amortiguador delantero tipo McPherson, por unidad.',
   'Amortiguador McPherson presurizado. Reemplazar por pares.',
   'cofap', 'amortiguadores', 455000, null, 270000, false, '{"Posición":"Delantera","Tipo":"McPherson","Unidades":"1"}', 12, 2, 2400),
  ('SR-SUS-0004', 'Rótula de suspensión inferior', 'rotula-inferior-nakata-hilux', 'Rótula inferior con perno y tuerca.',
   'Rótula forjada con guardapolvo reforzado. Incluye tuerca autofrenante.',
   'nakata', 'rotulas-y-extremos', 210000, null, 118000, false, '{"Posición":"Inferior","Incluye":"Tuerca"}', 6, 3, 900),
  ('SR-ENC-0001', 'Bujía de iridio', 'bujia-iridio-ngk-toyota', 'Bujía de iridio de larga duración, por unidad.',
   'Electrodo central de iridio de 0,6 mm para chispa estable y mayor duración. Se vende por unidad.',
   'ngk', 'bujias', 92000, null, 51000, false, '{"Electrodo":"Iridio","Rosca":"12 mm","Unidades":"1"}', 12, 16, 60),
  ('SR-ENC-0002', 'Bujía de níquel', 'bujia-niquel-ngk-kia-hyundai', 'Bujía convencional de níquel, por unidad.',
   'Bujía de uso estándar. Reemplazar según el plan de mantenimiento del fabricante.',
   'ngk', 'bujias', 36000, null, 18000, false, '{"Electrodo":"Níquel","Rosca":"14 mm","Unidades":"1"}', 6, 16, 55),
  ('SR-ENC-0003', 'Bobina de encendido', 'bobina-encendido-denso-toyota', 'Bobina de encendido tipo lápiz.',
   'Bobina individual por cilindro. Ante fallas de encendido intermitentes se recomienda diagnóstico previo.',
   'denso', 'bobinas', 480000, null, 300000, false, '{"Tipo":"Lápiz","Conector":"4 pines"}', 12, 2, 350),
  ('SR-ELE-0001', 'Batería 12V 70Ah', 'bateria-moura-70ah', 'Batería libre de mantenimiento 70 Ah, polo positivo derecho.',
   'Batería de plomo-calcio libre de mantenimiento. Verificar dimensiones y posición de polos antes de comprar.',
   'moura', 'baterias', 1150000, null, 780000, false, '{"Voltaje":"12 V","Capacidad":"70 Ah","CCA":"600 A","Polo positivo":"Derecho","Medidas":"278 x 175 x 175 mm"}', 18, 3, 18500),
  ('SR-ELE-0002', 'Batería 12V 90Ah', 'bateria-moura-90ah', 'Batería 90 Ah para camionetas diésel.',
   'Batería de alta capacidad de arranque para motores diésel. Libre de mantenimiento.',
   'moura', 'baterias', 1480000, 1590000, 990000, false, '{"Voltaje":"12 V","Capacidad":"90 Ah","CCA":"760 A","Polo positivo":"Derecho","Medidas":"306 x 173 x 225 mm"}', 18, 3, 23500),
  ('SR-ELE-0003', 'Batería 12V 45Ah', 'bateria-moura-45ah', 'Batería compacta para autos chicos.',
   'Batería libre de mantenimiento para compactos. Confirmar medidas del alojamiento.',
   'moura', 'baterias', 820000, null, 540000, false, '{"Voltaje":"12 V","Capacidad":"45 Ah","CCA":"400 A","Polo positivo":"Derecho","Medidas":"212 x 175 x 175 mm"}', 18, 3, 12000),
  ('SR-ELE-0004', 'Lámpara H4 12V 60/55W', 'lampara-h4-philips', 'Lámpara halógena H4 de luz alta y baja.',
   'Lámpara halógena H4 estándar. Se vende por unidad.',
   'philips', 'lamparas', 38000, null, 19000, false, '{"Tipo":"H4","Potencia":"60/55 W","Voltaje":"12 V"}', 3, 20, 40),
  ('SR-ELE-0005', 'Lámpara H7 12V 55W', 'lampara-h7-philips', 'Lámpara halógena H7.',
   'Lámpara halógena H7 estándar. Se vende por unidad.',
   'philips', 'lamparas', 42000, null, 21000, false, '{"Tipo":"H7","Potencia":"55 W","Voltaje":"12 V"}', 3, 20, 40),
  ('SR-LUB-0001', 'Aceite de motor 15W-40 diésel 4 L', 'aceite-castrol-15w40-4l', 'Aceite mineral multigrado para motores diésel.',
   'Aceite para motores diésel con o sin turbo. Verificá en el manual la especificación requerida por tu motor.',
   'castrol', 'aceites-de-motor', 265000, null, 175000, true, '{"Viscosidad":"15W-40","Tipo":"Mineral","Norma":"API CI-4","Contenido":"4 L"}', null, 12, 3600),
  ('SR-LUB-0002', 'Aceite de motor 5W-30 sintético 4 L', 'aceite-castrol-5w30-4l', 'Aceite 100 % sintético para motores nafteros modernos.',
   'Aceite sintético de baja viscosidad. Verificá en el manual la especificación requerida por tu motor.',
   'castrol', 'aceites-de-motor', 345000, 375000, 225000, true, '{"Viscosidad":"5W-30","Tipo":"Sintético","Norma":"API SP","Contenido":"4 L"}', null, 12, 3500),
  ('SR-LUB-0003', 'Aceite de motor 0W-20 sintético 4 L', 'aceite-castrol-0w20-4l', 'Aceite sintético de muy baja viscosidad para motores recientes.',
   'Especificado por varios fabricantes japoneses y coreanos para motores nafteros recientes.',
   'castrol', 'aceites-de-motor', 360000, null, 238000, true, '{"Viscosidad":"0W-20","Tipo":"Sintético","Norma":"API SP / ILSAC GF-6","Contenido":"4 L"}', null, 8, 3500),
  ('SR-MOT-0001', 'Kit de correa de distribución con tensor', 'kit-distribucion-gates-hyundai-kia', 'Correa, tensor y polea guía.',
   'Kit completo de distribución. El reemplazo debe hacerlo personal calificado; una instalación incorrecta puede dañar el motor.',
   'gates', 'distribucion', 890000, null, 560000, false, '{"Incluye":"Correa, tensor y polea guía"}', 12, 2, 1400),
  ('SR-MOT-0002', 'Bomba de agua', 'bomba-agua-skf-toyota-diesel', 'Bomba de agua con junta.',
   'Bomba de agua con rodamiento sellado y junta incluida. Se recomienda reemplazar el refrigerante al instalarla.',
   'skf', 'bombas-de-agua', 640000, null, 400000, false, '{"Incluye":"Junta","Material del impulsor":"Metálico"}', 12, 2, 2100),
  ('SR-MOT-0003', 'Correa poly-V de accesorios', 'correa-poly-v-gates-hilux', 'Correa de accesorios 7 canales.',
   'Correa de accesorios de EPDM de larga duración.',
   'gates', 'distribucion', 185000, null, 102000, false, '{"Canales":"7","Material":"EPDM"}', 12, 3, 300),
  ('SR-EMB-0001', 'Kit de embrague', 'kit-embrague-sachs-hilux', 'Disco, placa y rulemán de empuje.',
   'Kit completo de embrague para transmisión manual. Recomendamos rectificar o verificar el volante motor al instalar.',
   'sachs', 'kits-de-embrague', 2150000, null, 1450000, false, '{"Incluye":"Disco, placa y rulemán","Diámetro":"275 mm"}', 12, 1, 9500),
  ('SR-EMB-0002', 'Kit de embrague', 'kit-embrague-valeo-gol', 'Kit de embrague para Gol 1.6.',
   'Kit de embrague con disco, placa y rulemán para transmisión manual.',
   'valeo', 'kits-de-embrague', 1250000, null, 820000, false, '{"Incluye":"Disco, placa y rulemán","Diámetro":"200 mm"}', 12, 1, 6200)
) as v(sku, name, slug, short, descr, brand, category, price, compare, cost, universal, specs, warranty, min_stock, weight)
join public.brands b on b.slug = v.brand
join public.categories c on c.slug = v.category;

-- Imágenes ilustrativas por categoría (reemplazar por fotos reales).
insert into public.product_images (product_id, url, alt, sort)
select p.id, '/placeholders/' || coalesce(parent.slug, c.slug) || '.svg', p.name, 0
from public.products p
join public.categories c on c.id = p.category_id
left join public.categories parent on parent.id = c.parent_id;

-- Referencias (OEM y alternativas) — códigos de demostración.
insert into public.product_references (product_id, kind, code, brand)
select p.id, v.kind, v.code, v.brand
from (values
  ('SR-FRE-0001', 'oem', '04465-0K290', 'Toyota'), ('SR-FRE-0001', 'manufacturer', '0986BB0921', 'Bosch'),
  ('SR-FRE-0001', 'alternative', 'PD/1502', 'Fras-le'),
  ('SR-FRE-0002', 'oem', '04465-0K290', 'Toyota'), ('SR-FRE-0002', 'manufacturer', 'PD/1502', 'Fras-le'),
  ('SR-FRE-0003', 'oem', '04465-02220', 'Toyota'), ('SR-FRE-0003', 'manufacturer', 'GDB3480', 'TRW'),
  ('SR-FRE-0004', 'oem', '58101-1JA00', 'Hyundai'), ('SR-FRE-0004', 'manufacturer', 'PD/1433', 'Fras-le'),
  ('SR-FRE-0005', 'oem', '43512-0K120', 'Toyota'), ('SR-FRE-0005', 'manufacturer', 'DF7942', 'TRW'),
  ('SR-FRE-0006', 'oem', '43512-02330', 'Toyota'),
  ('SR-FIL-0001', 'oem', '04152-YZZA1', 'Toyota'), ('SR-FIL-0001', 'manufacturer', 'HU 7019 z', 'Mann-Filter'),
  ('SR-FIL-0002', 'oem', '90915-YZZE1', 'Toyota'), ('SR-FIL-0002', 'manufacturer', '0986B01106', 'Bosch'),
  ('SR-FIL-0003', 'oem', '26300-35505', 'Hyundai'), ('SR-FIL-0003', 'manufacturer', 'W 811/80', 'Mann-Filter'),
  ('SR-FIL-0004', 'oem', '17801-0L040', 'Toyota'), ('SR-FIL-0004', 'manufacturer', 'C 27 013', 'Mann-Filter'),
  ('SR-FIL-0005', 'oem', '17801-0T030', 'Toyota'),
  ('SR-FIL-0006', 'oem', '23390-0L070', 'Toyota'), ('SR-FIL-0006', 'manufacturer', 'F026402809', 'Bosch'),
  ('SR-FIL-0007', 'oem', '87139-0K060', 'Toyota'), ('SR-FIL-0007', 'manufacturer', 'CUK 1919', 'Mann-Filter'),
  ('SR-SUS-0001', 'oem', '48510-0K500', 'Toyota'), ('SR-SUS-0001', 'manufacturer', 'G8205', 'Monroe'),
  ('SR-SUS-0002', 'oem', '48531-0K500', 'Toyota'),
  ('SR-SUS-0003', 'oem', '54651-1S000', 'Hyundai'),
  ('SR-SUS-0004', 'oem', '43330-09780', 'Toyota'), ('SR-SUS-0004', 'manufacturer', 'N 4001', 'Nakata'),
  ('SR-ENC-0001', 'oem', '90919-01253', 'Toyota'), ('SR-ENC-0001', 'manufacturer', 'ILKAR7B11', 'NGK'),
  ('SR-ENC-0002', 'oem', '18855-10060', 'Hyundai'), ('SR-ENC-0002', 'manufacturer', 'BKR6E-11', 'NGK'),
  ('SR-ENC-0003', 'oem', '90919-02258', 'Toyota'), ('SR-ENC-0003', 'manufacturer', '673-1305', 'Denso'),
  ('SR-MOT-0001', 'oem', '24312-2B000', 'Hyundai'), ('SR-MOT-0001', 'manufacturer', 'K015603XS', 'Gates'),
  ('SR-MOT-0002', 'oem', '16100-09D00', 'Toyota'), ('SR-MOT-0002', 'manufacturer', 'VKPC 91815', 'SKF'),
  ('SR-MOT-0003', 'oem', '90916-02728', 'Toyota'), ('SR-MOT-0003', 'manufacturer', '7PK2010', 'Gates'),
  ('SR-EMB-0001', 'oem', '31250-0K271', 'Toyota'), ('SR-EMB-0001', 'manufacturer', '3000 951 569', 'Sachs'),
  ('SR-EMB-0002', 'manufacturer', '828538', 'Valeo')
) as v(sku, kind, code, brand)
join public.products p on p.sku = v.sku;

-- Compatibilidades (fitments). Sin fila = "pendiente de verificar".
insert into public.product_fitments (product_id, version_id, status, source)
select p.id, vv.id, v.status::public.fitment_status, 'Datos de demostración'
from (values
  ('SR-FRE-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0001', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FRE-0001', 'TOY-HILUX-30D-05', 'incompatible'),
  ('SR-FRE-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0002', 'TOY-FORT-28D-16', 'unverified'),
  ('SR-FRE-0003', 'TOY-COROL-18-14', 'confirmed'), ('SR-FRE-0003', 'TOY-COROL-20-20', 'incompatible'),
  ('SR-FRE-0004', 'HYU-HB20-10-19', 'confirmed'), ('SR-FRE-0004', 'HYU-HB20-16-19', 'confirmed'),
  ('SR-FRE-0004', 'KIA-RIO-14-17', 'unverified'),
  ('SR-FRE-0005', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FRE-0005', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FRE-0005', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FRE-0006', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0001', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FIL-0001', 'TOY-HILUX-30D-05', 'incompatible'),
  ('SR-FIL-0002', 'TOY-COROL-18-14', 'confirmed'), ('SR-FIL-0002', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-FIL-0002', 'TOY-VITZ-10-11', 'confirmed'), ('SR-FIL-0002', 'TOY-COROL-20-20', 'unverified'),
  ('SR-FIL-0003', 'KIA-PICA-10-17', 'confirmed'), ('SR-FIL-0003', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-FIL-0003', 'KIA-RIO-14-17', 'confirmed'), ('SR-FIL-0003', 'HYU-HB20-10-19', 'confirmed'),
  ('SR-FIL-0003', 'HYU-HB20-16-19', 'confirmed'), ('SR-FIL-0003', 'HYU-CRET-16-17', 'confirmed'),
  ('SR-FIL-0004', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0004', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0004', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FIL-0005', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0006', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0006', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0006', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-FIL-0007', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-FIL-0007', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-FIL-0007', 'TOY-FORT-28D-16', 'confirmed'), ('SR-FIL-0007', 'TOY-COROL-18-14', 'confirmed'),
  ('SR-FIL-0007', 'TOY-COROL-20-20', 'confirmed'), ('SR-FIL-0007', 'TOY-RAV4-20-19', 'confirmed'),
  ('SR-SUS-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0003', 'HYU-HB20-10-19', 'confirmed'), ('SR-SUS-0003', 'HYU-HB20-16-19', 'confirmed'),
  ('SR-SUS-0004', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-SUS-0004', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-SUS-0004', 'TOY-FORT-28D-16', 'unverified'),
  ('SR-ENC-0001', 'TOY-COROL-18-14', 'confirmed'), ('SR-ENC-0001', 'TOY-COROL-20-20', 'unverified'),
  ('SR-ENC-0001', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ENC-0002', 'KIA-PICA-10-17', 'confirmed'), ('SR-ENC-0002', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-ENC-0002', 'HYU-HB20-10-19', 'confirmed'), ('SR-ENC-0002', 'KIA-RIO-14-17', 'confirmed'),
  ('SR-ENC-0003', 'TOY-COROL-18-14', 'confirmed'), ('SR-ENC-0003', 'TOY-VITZ-13-11', 'unverified'),
  ('SR-ELE-0001', 'TOY-COROL-18-14', 'confirmed'), ('SR-ELE-0001', 'TOY-COROL-20-20', 'confirmed'),
  ('SR-ELE-0001', 'HYU-TUCS-20-16', 'confirmed'), ('SR-ELE-0001', 'KIA-SPOR-20-16', 'confirmed'),
  ('SR-ELE-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-ELE-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-ELE-0002', 'TOY-FORT-28D-16', 'confirmed'), ('SR-ELE-0002', 'NIS-FRON-23D-16', 'confirmed'),
  ('SR-ELE-0002', 'CHE-S10-28D-12', 'confirmed'), ('SR-ELE-0002', 'MIT-L200-24D-16', 'confirmed'),
  ('SR-ELE-0002', 'VW-AMAR-20D-10', 'unverified'),
  ('SR-ELE-0003', 'TOY-VITZ-10-11', 'confirmed'), ('SR-ELE-0003', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ELE-0003', 'KIA-PICA-10-17', 'confirmed'), ('SR-ELE-0003', 'KIA-PICA-12-17', 'confirmed'),
  ('SR-ELE-0003', 'HYU-HB20-10-19', 'confirmed'), ('SR-ELE-0003', 'NIS-MARC-16-12', 'confirmed'),
  ('SR-ELE-0004', 'TOY-HILUX-30D-05', 'confirmed'), ('SR-ELE-0004', 'TOY-VITZ-13-11', 'confirmed'),
  ('SR-ELE-0004', 'NIS-MARC-16-12', 'confirmed'), ('SR-ELE-0004', 'VW-GOL-16-13', 'confirmed'),
  ('SR-ELE-0004', 'KIA-PICA-10-17', 'confirmed'),
  ('SR-ELE-0005', 'HYU-TUCS-20-16', 'confirmed'), ('SR-ELE-0005', 'KIA-SPOR-20-16', 'confirmed'),
  ('SR-MOT-0001', 'HYU-HB20-16-19', 'confirmed'), ('SR-MOT-0001', 'HYU-CRET-16-17', 'confirmed'),
  ('SR-MOT-0001', 'KIA-RIO-14-17', 'unverified'),
  ('SR-MOT-0002', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-MOT-0002', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-MOT-0002', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-MOT-0003', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-MOT-0003', 'TOY-FORT-28D-16', 'confirmed'),
  ('SR-EMB-0001', 'TOY-HILUX-28D-16', 'confirmed'), ('SR-EMB-0001', 'TOY-HILUX-24D-16', 'confirmed'),
  ('SR-EMB-0002', 'VW-GOL-16-13', 'confirmed')
) as v(sku, code, status)
join public.products p on p.sku = v.sku
join public.vehicle_versions vv on vv.code = v.code;

-- Productos relacionados y complementarios.
insert into public.product_relations (product_id, related_id, kind)
select a.id, b.id, v.kind
from (values
  ('SR-FRE-0001', 'SR-FRE-0005', 'complementary'), ('SR-FRE-0001', 'SR-FRE-0007', 'complementary'),
  ('SR-FRE-0001', 'SR-FRE-0002', 'related'), ('SR-FRE-0002', 'SR-FRE-0001', 'related'),
  ('SR-FRE-0002', 'SR-FRE-0005', 'complementary'), ('SR-FRE-0005', 'SR-FRE-0001', 'complementary'),
  ('SR-FRE-0003', 'SR-FRE-0006', 'complementary'), ('SR-FRE-0003', 'SR-FRE-0007', 'complementary'),
  ('SR-FRE-0006', 'SR-FRE-0003', 'complementary'),
  ('SR-FIL-0001', 'SR-LUB-0001', 'complementary'), ('SR-FIL-0001', 'SR-FIL-0004', 'complementary'),
  ('SR-FIL-0001', 'SR-FIL-0006', 'complementary'),
  ('SR-FIL-0002', 'SR-LUB-0003', 'complementary'), ('SR-FIL-0002', 'SR-FIL-0005', 'complementary'),
  ('SR-FIL-0003', 'SR-LUB-0002', 'complementary'),
  ('SR-SUS-0001', 'SR-SUS-0002', 'complementary'), ('SR-SUS-0001', 'SR-SUS-0004', 'complementary'),
  ('SR-SUS-0002', 'SR-SUS-0001', 'complementary'),
  ('SR-MOT-0002', 'SR-MOT-0003', 'complementary'),
  ('SR-ELE-0001', 'SR-ELE-0002', 'related'), ('SR-ELE-0002', 'SR-ELE-0001', 'related'),
  ('SR-ENC-0001', 'SR-ENC-0003', 'complementary')
) as v(a, b, kind)
join public.products a on a.sku = v.a
join public.products b on b.sku = v.b;

-- Stock inicial.
insert into public.stock_levels (product_id, on_hand)
select p.id, v.qty
from (values
  ('SR-FRE-0001', 14), ('SR-FRE-0002', 9), ('SR-FRE-0003', 7), ('SR-FRE-0004', 3), ('SR-FRE-0005', 6),
  ('SR-FRE-0006', 4), ('SR-FRE-0007', 40), ('SR-FIL-0001', 35), ('SR-FIL-0002', 42), ('SR-FIL-0003', 8),
  ('SR-FIL-0004', 18), ('SR-FIL-0005', 11), ('SR-FIL-0006', 4), ('SR-FIL-0007', 16), ('SR-SUS-0001', 8),
  ('SR-SUS-0002', 6), ('SR-SUS-0003', 0), ('SR-SUS-0004', 5), ('SR-ENC-0001', 48), ('SR-ENC-0002', 60),
  ('SR-ENC-0003', 3), ('SR-ELE-0001', 7), ('SR-ELE-0002', 5), ('SR-ELE-0003', 2), ('SR-ELE-0004', 70),
  ('SR-ELE-0005', 55), ('SR-LUB-0001', 30), ('SR-LUB-0002', 24), ('SR-LUB-0003', 5), ('SR-MOT-0001', 3),
  ('SR-MOT-0002', 4), ('SR-MOT-0003', 9), ('SR-EMB-0001', 2), ('SR-EMB-0002', 0)
) as v(sku, qty)
join public.products p on p.sku = v.sku;

insert into public.stock_movements (product_id, type, quantity, on_hand_after, reserved_after, reason, source)
select product_id, 'initial', on_hand, on_hand, 0, 'Carga inicial de demostración', 'system'
from public.stock_levels;

-- Proveedores -------------------------------------------------------------------
insert into public.suppliers (name, contact_name, email, phone, lead_time_days, notes) values
('Distribuidora Frenos del Sur', 'Carlos Benítez', 'ventas@frenosdelsur.example', '+595 21 111 111', 5, 'Frenos y suspensión. Entregas martes y jueves.'),
('Importadora Filtromax', 'Laura Giménez', 'pedidos@filtromax.example', '+595 21 222 222', 3, 'Filtros y lubricantes.'),
('Eléctrica Central', 'Diego Ortiz', 'contacto@electricacentral.example', '+595 21 333 333', 7, 'Baterías y encendido. Importación desde Brasil.');

insert into public.supplier_products (supplier_id, product_id, cost, lead_time_days, is_preferred)
select s.id, p.id, p.cost, s.lead_time_days, true
from public.products p
join public.categories c on c.id = p.category_id
left join public.categories parent on parent.id = c.parent_id
join public.suppliers s on s.name = case
  when coalesce(parent.slug, c.slug) in ('frenos', 'suspension', 'embrague', 'motor') then 'Distribuidora Frenos del Sur'
  when coalesce(parent.slug, c.slug) in ('filtros', 'lubricantes') then 'Importadora Filtromax'
  else 'Eléctrica Central' end;

-- Promociones y contenido -------------------------------------------------------
insert into public.coupons (code, description, type, value, min_subtotal, per_customer_limit, active) values
('BIENVENIDO10', '10 % de descuento en tu primera compra desde Gs. 300.000', 'percent', 10, 300000, 1, true),
('TALLER50', 'Gs. 50.000 de descuento en compras desde Gs. 1.000.000', 'fixed', 50000, 1000000, null, true);

insert into public.promotions (name, percent, scope, category_id, starts_at, ends_at)
select 'Semana de frenos', 10, 'category', c.id, now() - interval '1 day', now() + interval '14 days'
from public.categories c where c.slug = 'frenos';

insert into public.banners (title, subtitle, cta_label, link_url, placement, sort) values
('Repuestos que encajan con tu vehículo', 'Elegí marca, modelo y año y te mostramos lo que es compatible.', 'Buscar repuestos', '/catalogo', 'hero', 1),
('Semana de frenos: 10 % off', 'Pastillas, discos y líquido de frenos con descuento por tiempo limitado.', 'Ver ofertas', '/catalogo?categoria=frenos', 'hero', 2),
('Envíos a todo el país', 'Retiro en el local, entrega en Asunción y Central, y agencia al interior.', null, '/p/envios', 'strip', 1);

insert into public.pages (slug, title, body) values
('envios', 'Envíos y retiro', E'## Retiro en el local\nSin costo. Te avisamos cuando tu pedido esté listo.\n\n## Envío a domicilio\nAsunción y Gran Asunción en 24 a 72 horas hábiles. El costo se calcula en el checkout según la zona.\n\n## Envío al interior\nDespachamos por agencia de transporte en 2 a 4 días hábiles. Te enviamos el número de guía por correo.'),
('garantia', 'Garantía', E'Todos los repuestos cuentan con garantía del fabricante contra defectos de fabricación. El plazo se indica en cada producto.\n\nLa garantía no cubre fallas por instalación incorrecta, uso indebido ni desgaste normal. Para iniciar un reclamo, escribinos con tu número de pedido.'),
('devoluciones', 'Cambios y devoluciones', E'Podés devolver productos sin uso, en su empaque original y con la factura, dentro de los 7 días de recibidos.\n\nLas piezas eléctricas instaladas no admiten devolución salvo falla de fábrica comprobada.'),
('terminos', 'Términos y condiciones', E'Los precios incluyen IVA y se expresan en guaraníes. Los montos en reales y dólares son de referencia.\n\nLa compatibilidad informada se basa en los datos técnicos disponibles. Ante dudas, consultanos antes de comprar.'),
('privacidad', 'Privacidad', E'Usamos tus datos sólo para procesar tus pedidos y, si lo aceptás, para enviarte novedades. Podés pedir la baja o eliminación de tus datos en cualquier momento.');

-- Pedidos históricos de demostración (para ver el panel con datos) ------------------------
do $$
declare
  v_i integer;
  v_order uuid;
  v_paid timestamptz;
  v_status public.order_status;
  v_prod record;
  v_qty integer;
  v_sub bigint;
  v_names text[] := array['Juan Pérez','María González','Carlos Benítez','Ana Martínez','Luis Ramírez','Sofía Duarte',
                          'Taller El Rápido','Jorge Villalba','Paola Cáceres','Diego Acosta','Lucía Fernández','Mecánica Don Pedro'];
  v_n integer;
  v_stock public.stock_levels;
begin
  perform setseed(0.42);
  for v_i in 1..70 loop
    v_n := 1 + floor(random() * array_length(v_names, 1))::int;
    v_paid := now() - make_interval(days => floor(random() * 60)::int, hours => floor(random() * 10)::int);
    v_status := case
      when v_paid > now() - interval '2 days' then (array['paid','preparing']::public.order_status[])[1 + floor(random() * 2)::int]
      when v_paid > now() - interval '5 days' then 'shipped'
      else 'delivered' end;

    insert into public.orders (customer_name, email, phone, delivery_method, subtotal, total, status, paid_at, created_at,
                               shipped_at, delivered_at, reservation_expires_at)
    values (v_names[v_n], lower(replace(v_names[v_n], ' ', '.')) || '@demo.com.py', '+595 981 000 ' || lpad(v_n::text, 3, '0'),
            (array['pickup','home','agency']::public.delivery_method[])[1 + floor(random() * 3)::int],
            0, 0, v_status, v_paid, v_paid - interval '20 minutes',
            case when v_status in ('shipped','delivered') then v_paid + interval '1 day' end,
            case when v_status = 'delivered' then v_paid + interval '3 days' end,
            v_paid + interval '25 minutes')
    returning id into v_order;

    v_sub := 0;
    for v_prod in
      select p.*, (select url from public.product_images i where i.product_id = p.id limit 1) as img
      from public.products p order by random() limit 1 + floor(random() * 3)::int
    loop
      v_qty := case when v_prod.price < 100000 then 2 + floor(random() * 4)::int else 1 + floor(random() * 2)::int end;
      insert into public.order_items (order_id, product_id, sku, name, image_url, unit_price, original_unit_price, quantity,
                                      tax_rate, line_total, unit_cost)
      values (v_order, v_prod.id, v_prod.sku, v_prod.name, v_prod.img, v_prod.price, v_prod.price, v_qty, v_prod.tax_rate,
              v_prod.price * v_qty, v_prod.cost);
      v_sub := v_sub + v_prod.price * v_qty;
      update public.products set popularity = popularity + v_qty where id = v_prod.id;
    end loop;

    update public.orders set subtotal = v_sub, total = v_sub, tax_total = round(v_sub / 11.0) where id = v_order;
    insert into public.order_status_history (order_id, from_status, to_status, note, created_at)
    values (v_order, 'pending_payment', 'paid', 'Pago aprobado (demostración)', v_paid);
  end loop;

  -- Algunas cancelaciones por falta de pago.
  for v_i in 1..6 loop
    insert into public.orders (customer_name, email, phone, delivery_method, subtotal, total, status, created_at,
                               cancelled_at, cancel_reason)
    values ('Cliente de prueba ' || v_i, 'prueba' || v_i || '@demo.com.py', '+595 981 111 000', 'pickup', 250000, 250000,
            'cancelled', now() - make_interval(days => v_i * 7), now() - make_interval(days => v_i * 7) + interval '45 minutes',
            'Pago no recibido dentro del plazo de reserva');
  end loop;

  -- Eventos de navegación para conversión y abandono.
  for v_i in 1..400 loop
    insert into public.analytics_events (session_id, type, created_at)
    values ('demo-' || v_i, 'page_view', now() - make_interval(days => floor(random() * 60)::int));
    if random() < 0.45 then
      insert into public.analytics_events (session_id, type, created_at)
      values ('demo-' || v_i, 'add_to_cart', now() - make_interval(days => floor(random() * 60)::int));
      if random() < 0.35 then
        insert into public.analytics_events (session_id, type, created_at)
        values ('demo-' || v_i, 'purchase', now() - make_interval(days => floor(random() * 60)::int));
      end if;
    end if;
  end loop;

  insert into public.analytics_events (session_id, type, query, results_count, created_at) values
  ('demo-s1', 'search', 'pastillas ranger 2018', 0, now() - interval '3 days'),
  ('demo-s2', 'search', 'pastillas ranger 2018', 0, now() - interval '2 days'),
  ('demo-s3', 'search', 'radiador hilux', 0, now() - interval '5 days'),
  ('demo-s4', 'search', 'kit embrague sportage', 0, now() - interval '1 day'),
  ('demo-s5', 'search', 'filtro aceite', 6, now() - interval '1 day');
end $$;
