-- SR Autorrepuestos: datos base (configuración, envíos, marcas, categorías, vehículos y páginas).
-- Completá los datos de contacto reales desde Panel > Configuración.

-- Configuración ---------------------------------------------------------------
insert into public.settings (key, value, is_public) values
('store', '{
  "name": "SR Autorrepuestos",
  "legal_name": "SR Autorrepuestos",
  "ruc": "",
  "phone": "",
  "whatsapp": "",
  "email": "",
  "address": "Paraguay",
  "hours": ""
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
('assistant', '{ "handoff_contact": "", "shopper_enabled": true, "admin_enabled": true }', false);

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


insert into public.pages (slug, title, body) values
('envios', 'Envíos y retiro', E'## Retiro en el local\nSin costo. Te avisamos cuando tu pedido esté listo.\n\n## Envío a domicilio\nAsunción y Gran Asunción en 24 a 72 horas hábiles. El costo se calcula en el checkout según la zona.\n\n## Envío al interior\nDespachamos por agencia de transporte en 2 a 4 días hábiles. Te enviamos el número de guía por correo.'),
('garantia', 'Garantía', E'Todos los repuestos cuentan con garantía del fabricante contra defectos de fabricación. El plazo se indica en cada producto.\n\nLa garantía no cubre fallas por instalación incorrecta, uso indebido ni desgaste normal. Para iniciar un reclamo, escribinos con tu número de pedido.'),
('devoluciones', 'Cambios y devoluciones', E'Podés devolver productos sin uso, en su empaque original y con la factura, dentro de los 7 días de recibidos.\n\nLas piezas eléctricas instaladas no admiten devolución salvo falla de fábrica comprobada.'),
('terminos', 'Términos y condiciones', E'Los precios incluyen IVA y se expresan en guaraníes. Los montos en reales y dólares son de referencia.\n\nLa compatibilidad informada se basa en los datos técnicos disponibles. Ante dudas, consultanos antes de comprar.'),
('privacidad', 'Privacidad', E'Usamos tus datos sólo para procesar tus pedidos y, si lo aceptás, para enviarte novedades. Podés pedir la baja o eliminación de tus datos en cualquier momento.');
