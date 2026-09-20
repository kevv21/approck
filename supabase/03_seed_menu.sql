-- ===========================================================================
-- Menu de Rock Munchies transcrito de la carta fisica.
-- precio en CENTAVOS y SIN IVA (C$260.00 -> 26000).
-- Los items tachados en la carta quedan con activo = false: siguen en el
-- catalogo para que los cierres historicos no pierdan el nombre, pero no
-- aparecen al tomar una orden.
-- ===========================================================================

insert into producto (nombre, descripcion, categoria, grupo_descuento, precio, activo, orden) values
-- Pizzas Clasicas 14"
('Jamón',                    null,                                                        'Pizzas Clásicas',  'pizza', 26000, true, 10),
('Pepperoni',                null,                                                        'Pizzas Clásicas',  'pizza', 27000, true, 20),
('Hawaiana',                 'Jamón y piña',                                              'Pizzas Clásicas',  'pizza', 29000, true, 30),
('Margarita',                'Tomate y albahaca',                                         'Pizzas Clásicas',  'pizza', 29000, true, 40),

-- Pizzas Old School
('Diabla',                   'Aceituna negra, cebolla, pepperoni y chile seco',           'Pizzas Old School','pizza', 30000, true, 10),
('Rock Munchies',            'Chiltoma, jamón, salchicha italiana y hongos',              'Pizzas Old School','pizza', 34000, true, 20),
('Trebolactea',              'Mozarella, parmesano y gorgonzola',                         'Pizzas Old School','pizza', 34000, true, 30),
('No Hay Primavera',         'Chiltoma, cebolla, aceituna negra y verde',                 'Pizzas Old School','pizza', 30000, true, 40),
('Aaaay Chorizo',            'Chorizo alemán, español, italiano, pepperoni y pimienta',   'Pizzas Old School','pizza', 37000, true, 50),
('Mare Rosso',               'Tomate y anchoas',                                          'Pizzas Old School','pizza', 40000, true, 60),

-- Pizzas New School
('Española',                 'Tomate confitado, aceituna verde y chorizo español',        'Pizzas New School','pizza', 37000, true, 10),
('Pesto',                    'Salsa pesto, brócoli y chiltoma',                           'Pizzas New School','pizza', 37000, true, 20),
('4 Estaciones Remix',       'Prosciutto, hongos, aceitunas negras y tomate',             'Pizzas New School','pizza', 40000, true, 30),
('Carnicera',                'Bacon, carne molida, salchicha italiana, pepperoni y chimichurri', 'Pizzas New School','pizza', 40000, true, 40),
('Veggie',                   'Brócoli, hongos, chiltoma y espinacas',                     'Pizzas New School','pizza', 37000, true, 50),

-- Pizzas Especiales
('Hawaiana Super Saiyajin',  'Jamón, pepperoni, bacon y piña',                            'Pizzas Especiales','pizza', 44000, true, 10),
('Cordobesa',                'Aceitunas negras, jamón, hongos y ajo',                     'Pizzas Especiales','pizza', 44000, true, 20),
('Chicken Little',           'Salsa pesto, tomate y pollo',                               'Pizzas Especiales','pizza', 44000, true, 30),
('Fugazza',                  'Parmesano, orégano y cebolla',                              'Pizzas Especiales','pizza', 40000, true, 40),
('La Fabulosa',              'Mariscos, cebolla morada, gorgonzola y ajo',                'Pizzas Especiales','pizza', 45000, true, 50),
('Búffalo Chicken',          'Chunks de pollo, salsa buffalo, apio y salsa ranch',        'Pizzas Especiales','pizza', 44000, true, 60),
('Green Day',                'Alcachofa, aceitunas negras, parmesano y albahaca',         'Pizzas Especiales','pizza', 44000, true, 70),
('Brocoletta',               'Brócoli, piña y hongos',                                    'Pizzas Especiales','pizza', 40000, true, 80),
('Brisket',                  'Brisket deshilachada, piña, cebollín y gravy',              'Pizzas Especiales','pizza', 46000, true, 90),

-- Pizzas Pinoleras
('Criolla',                  'Chorizo criollo, cebolla y jalapeños sobre frijoles molidos','Pizzas Pinoleras','pizza', 25000, true, 10),
('Tocineta',                 'Huevo, bacon y espinaca sobre frijoles molidos',            'Pizzas Pinoleras', 'pizza', 25000, true, 20),

-- Entradas
('Munchies Roll Trebolácteo',null,                                                        'Entradas',         'otro',  18000, true,  10),
('Munchies Roll Pepperoni',  null,                                                        'Entradas',         'otro',  18000, true,  20),
('Hummus',                   null,                                                        'Entradas',         'otro',  20000, false, 30),
('Churros de Queso',         null,                                                        'Entradas',         'otro',  12500, true,  40),

-- Pastas
('Fetuccini Trebolácteo',    null,                                                        'Pastas',           'otro',  30000, true, 10),
('Fetuccini Carnicero',      null,                                                        'Pastas',           'otro',  30000, true, 20),

-- Ensaladas (tachadas en la carta)
('Ensalada César',           null,                                                        'Ensaladas',        'otro',  25000, false, 10),
('Ensalada Rock Munchies',   null,                                                        'Ensaladas',        'otro',  28000, false, 20),

-- Bebidas
('Agua Fuente Pura',         null,                                                        'Bebidas',          'bebida', 3500, true,  10),
('Agua Gasificada',          null,                                                        'Bebidas',          'bebida', 4000, true,  20),
('Gaseosa',                  null,                                                        'Bebidas',          'bebida', 4000, true,  30),
('Jugo Natural',             null,                                                        'Bebidas',          'bebida', 4500, false, 40),
('Té Frío',                  null,                                                        'Bebidas',          'bebida', 3500, true,  50),

-- Cervezas nacionales
('Victoria Frost',           null,                                                        'Cervezas',         'bebida', 5200, true,  10),
('Victoria Clásica',         null,                                                        'Cervezas',         'bebida', 6000, true,  20),
('Toña',                     null,                                                        'Cervezas',         'bebida', 6000, true,  30),
('Toña Ultra',               null,                                                        'Cervezas',         'bebida', 6000, false, 40),
('Toña Light',               null,                                                        'Cervezas',         'bebida', 6000, false, 50),

-- Cervezas internacionales
('Miller Lite',              null,                                                        'Cervezas',         'bebida', 6500, true,  60),
('Sol',                      null,                                                        'Cervezas',         'bebida', 8400, true,  70),
('Heineken',                 null,                                                        'Cervezas',         'bebida', 8900, true,  80),
('Heineken 0.0',             null,                                                        'Cervezas',         'bebida', 8900, true,  90),
('Paulaner',                 null,                                                        'Cervezas',         'bebida',10000, true, 100),

-- RTD / Seltzer / Bar
('Smirnoff Ice',             null,                                                        'RTD y Seltzer',    'bebida',10000, false, 10),
('Bliss',                    null,                                                        'RTD y Seltzer',    'bebida', 9300, true,  20),
('Bamboo',                   null,                                                        'RTD y Seltzer',    'bebida', 6900, false, 30),
('Bamboo Sandía',            null,                                                        'RTD y Seltzer',    'bebida', 7500, false, 40),
('Fusión',                   null,                                                        'RTD y Seltzer',    'bebida', 7400, true,  50),
('Spark Hard Seltzer',       null,                                                        'RTD y Seltzer',    'bebida', 6000, true,  60),
('Mix de Michelada',         null,                                                        'Bar',              'bebida', 6000, true,  10),
('Copa de Sangría',          null,                                                        'Bar',              'bebida',10000, true,  20)
on conflict (nombre) do nothing;
