const { createHash } = require('node:crypto');

// Original Spanish descriptions for local development fixtures. Movement and
// anatomy references: ACE Exercise Library and NASM Exercise Library.
// The project's 17-group taxonomy and difficulty levels still require trainer review.
const e = (name, equipment, instructions, extra = {}) => ({
  name,
  equipment,
  instructions,
  ...extra,
});
const groups = [
  {
    muscle: 'PECTORAL',
    pattern: 'EMPUJE_HORIZONTAL',
    joints: ['HOMBRO', 'CODO'],
    secondary: ['TRICEPS', 'DELTOIDES_ANTERIOR'],
    exercises: [
      e(
        'Press de banca plano',
        ['BARRA', 'DISCOS', 'BANCO_PLANO'],
        'Acostado en banco plano, bajar la barra hacia el pecho y empujarla manteniendo el apoyo de espalda y pies.',
      ),
      e(
        'Press de pecho con mancuernas en banco plano',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Empujar las mancuernas desde los lados del pecho y volver de forma controlada.',
      ),
      e(
        'Press de pecho con mancuernas en el suelo',
        ['MANCUERNAS'],
        'Acostado en el suelo, empujar las mancuernas desde el pecho; el apoyo limita el descenso de los brazos.',
      ),
      e(
        'Flexiones de brazos',
        [],
        'Con manos apoyadas y cuerpo alineado, flexionar los codos y empujar el suelo para volver.',
      ),
      e(
        'Flexiones de brazos con rodillas apoyadas',
        [],
        'Apoyar manos y rodillas; bajar el pecho flexionando los codos y volver con el tronco alineado.',
      ),
      e(
        'Flexiones inclinadas en banco',
        ['BANCO_PLANO'],
        'Apoyar las manos en el banco y realizar una flexión manteniendo alineado el cuerpo.',
      ),
      e(
        'Aperturas de pecho con mancuernas',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Con los codos ligeramente flexionados, abrir los brazos y reunir las mancuernas sobre el pecho.',
        {
          pattern: 'AISLAMIENTO_SUPERIOR',
          joints: ['HOMBRO'],
          secondary: ['DELTOIDES_ANTERIOR'],
        },
      ),
      e(
        'Press de pecho en máquina',
        ['MAQUINA_PECHO'],
        'Ajustar el asiento para alinear los agarres con el pecho, empujar y regresar sin perder el apoyo.',
      ),
    ],
  },
  {
    muscle: 'DELTOIDES_ANTERIOR',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['HOMBRO'],
    secondary: [],
    exercises: [
      e(
        'Elevación frontal con mancuernas',
        ['MANCUERNAS'],
        'Elevar las mancuernas al frente hasta la altura del hombro, sin balancear el tronco.',
      ),
      e(
        'Elevación frontal alternada con mancuernas',
        ['MANCUERNAS'],
        'Elevar un brazo al frente y luego el otro, manteniendo estable el tronco.',
        { unilateral: true },
      ),
      e(
        'Elevación frontal con disco',
        ['DISCOS'],
        'Sujetar un disco con ambas manos y elevarlo al frente de manera controlada.',
      ),
      e(
        'Elevación frontal con barra',
        ['BARRA'],
        'Elevar la barra al frente manteniendo una ligera flexión del codo y sin impulsar con la espalda.',
      ),
      e(
        'Elevación frontal unilateral en polea baja',
        ['POLEA_BAJA'],
        'Con un agarre de polea baja, elevar el brazo al frente y volver controladamente.',
        { unilateral: true },
      ),
      e(
        'Elevación frontal con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Pisar la banda y elevar sus extremos al frente manteniendo el tronco estable.',
      ),
      e(
        'Press de hombros con mancuernas sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado con el tronco estable, empujar las mancuernas sobre la cabeza y volver al inicio.',
        {
          pattern: 'EMPUJE_VERTICAL',
          joints: ['HOMBRO', 'CODO'],
          secondary: ['TRICEPS', 'DELTOIDES_LATERAL'],
        },
      ),
      e(
        'Press de hombros de pie con mancuernas',
        ['MANCUERNAS'],
        'Empujar las mancuernas hacia arriba sin usar impulso de piernas ni arquear la zona lumbar.',
        {
          pattern: 'EMPUJE_VERTICAL',
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'CODO', 'COLUMNA_LUMBAR'],
          secondary: ['TRICEPS', 'DELTOIDES_LATERAL'],
        },
      ),
    ],
  },
  {
    muscle: 'DELTOIDES_LATERAL',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['HOMBRO'],
    secondary: ['TRAPECIO'],
    exercises: [
      e(
        'Elevaciones laterales con mancuernas de pie',
        ['MANCUERNAS'],
        'Elevar los brazos hacia los lados con ligera flexión de codos y sin encoger los hombros.',
      ),
      e(
        'Elevaciones laterales con mancuernas sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado en un banco, elevar las mancuernas hacia los lados sin balancear el cuerpo.',
      ),
      e(
        'Elevación lateral unilateral con mancuerna',
        ['MANCUERNAS'],
        'Elevar un brazo hacia el lado mientras el otro ayuda a mantener el equilibrio.',
        { unilateral: true },
      ),
      e(
        'Elevación lateral unilateral en polea baja',
        ['POLEA_BAJA'],
        'Elevar lateralmente el agarre de la polea baja y volver sin mover el tronco.',
        { unilateral: true },
      ),
      e(
        'Elevaciones laterales con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Pisar la banda y separar los brazos hacia los lados sin levantar los hombros.',
      ),
      e(
        'Elevación lateral acostado de lado en banco',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Acostado de lado, elevar la mancuerna con el brazo superior y volver con control.',
        { unilateral: true },
      ),
      e(
        'Elevaciones laterales con codos flexionados',
        ['MANCUERNAS'],
        'Con codos flexionados, elevar los brazos hacia los lados manteniendo el antebrazo estable.',
      ),
      e(
        'Remo al mentón con mancuernas y agarre amplio',
        ['MANCUERNAS'],
        'Subir las mancuernas cerca del tronco llevando los codos hacia los lados, sin elevarlos por encima de los hombros.',
        {
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'CODO'],
          secondary: ['TRAPECIO', 'BICEPS'],
        },
      ),
    ],
  },
  {
    muscle: 'DELTOIDES_POSTERIOR',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['HOMBRO'],
    secondary: ['TRAPECIO'],
    exercises: [
      e(
        'Aperturas posteriores con mancuernas inclinado',
        ['MANCUERNAS'],
        'Inclinar el tronco desde la cadera y abrir los brazos hacia los lados sin dar impulso.',
        { joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Aperturas posteriores sentado con mancuernas',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado e inclinado hacia adelante, separar las mancuernas hacia los lados.',
      ),
      e(
        'Apertura posterior unilateral con mancuerna y apoyo',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Apoyar una mano en el banco y elevar el brazo contrario hacia el lado.',
        { unilateral: true },
      ),
      e(
        'Aperturas posteriores con pecho apoyado en banco inclinado',
        ['MANCUERNAS', 'BANCO_INCLINADO'],
        'Apoyar el pecho en el banco inclinado y abrir los brazos sin despegar el tronco.',
      ),
      e(
        'Separación de banda elástica al frente',
        ['BANDAS_ELASTICAS'],
        'Sostener una banda al frente y separar las manos llevando los brazos hacia los lados.',
      ),
      e(
        'Face pull en polea alta',
        ['POLEA_ALTA'],
        'Tirar del agarre hacia la cara con codos abiertos y regresar de manera controlada.',
        { joints: ['HOMBRO', 'CODO'] },
      ),
      e(
        'Face pull con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada delante, llevar sus extremos hacia la cara con los codos abiertos.',
        { joints: ['HOMBRO', 'CODO'] },
      ),
      e(
        'Apertura posterior unilateral en polea baja',
        ['POLEA_BAJA'],
        'Inclinar el tronco y abrir lateralmente el brazo que sujeta el cable sin girar el cuerpo.',
        {
          unilateral: true,
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'],
        },
      ),
    ],
  },
  {
    muscle: 'BICEPS',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['CODO', 'MUNECA'],
    secondary: ['ANTEBRAZO'],
    exercises: [
      e(
        'Curl de bíceps con mancuernas',
        ['MANCUERNAS'],
        'Flexionar los codos llevando las mancuernas hacia los hombros, sin balancear el tronco.',
      ),
      e(
        'Curl alternado de bíceps con mancuernas',
        ['MANCUERNAS'],
        'Flexionar un codo por vez manteniendo el brazo junto al cuerpo.',
        { unilateral: true },
      ),
      e(
        'Curl de bíceps con barra',
        ['BARRA', 'DISCOS'],
        'Flexionar los codos con la barra y descender de forma controlada sin inclinar el tronco.',
      ),
      e(
        'Curl de concentración con mancuerna',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado, apoyar el brazo en la cara interna del muslo y flexionar el codo.',
        { unilateral: true },
      ),
      e(
        'Curl de bíceps sentado con mancuernas',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado con el tronco estable, flexionar ambos codos sin mover los brazos.',
      ),
      e(
        'Curl de bíceps en polea baja',
        ['POLEA_BAJA'],
        'Flexionar los codos contra el cable manteniendo los brazos cerca del tronco.',
      ),
      e(
        'Curl de bíceps con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Pisar la banda y flexionar los codos sin desplazar los brazos hacia adelante.',
      ),
      e(
        'Curl inclinado de bíceps con mancuernas',
        ['MANCUERNAS', 'BANCO_INCLINADO'],
        'Con la espalda apoyada en banco inclinado, flexionar los codos dejando los brazos junto al cuerpo.',
        { level: 'INTERMEDIO', joints: ['HOMBRO', 'CODO', 'MUNECA'] },
      ),
    ],
  },
  {
    muscle: 'TRICEPS',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['CODO', 'HOMBRO'],
    secondary: [],
    exercises: [
      e(
        'Extensión de tríceps en polea alta',
        ['POLEA_ALTA'],
        'Extender los codos con el agarre de la polea alta manteniendo los brazos junto al cuerpo.',
      ),
      e(
        'Extensión de tríceps sobre la cabeza con mancuerna',
        ['MANCUERNAS'],
        'Extender los codos con una mancuerna sobre la cabeza, manteniendo estable la posición de los brazos.',
      ),
      e(
        'Patada de tríceps con mancuerna',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Con apoyo en un banco, extender el codo hacia atrás sin desplazar el brazo.',
        { unilateral: true },
      ),
      e(
        'Extensión de tríceps acostado con mancuernas',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Acostado en un banco, flexionar y extender los codos con mancuernas manteniendo los brazos estables.',
      ),
      e(
        'Extensión unilateral de tríceps sobre la cabeza',
        ['MANCUERNAS'],
        'Sujetar una mancuerna con una mano y extender el codo sobre la cabeza sin mover el brazo.',
        { unilateral: true },
      ),
      e(
        'Extensión de tríceps con mancuernas en el suelo',
        ['MANCUERNAS'],
        'Acostado en el suelo, extender los codos manteniendo los brazos orientados hacia arriba.',
      ),
      e(
        'Press de banca con agarre cerrado',
        ['BARRA', 'DISCOS', 'BANCO_PLANO'],
        'Acostado en banco, empujar la barra con agarre cerrado manteniendo los codos próximos al tronco.',
        {
          pattern: 'EMPUJE_HORIZONTAL',
          level: 'INTERMEDIO',
          secondary: ['PECTORAL', 'DELTOIDES_ANTERIOR'],
        },
      ),
      e(
        'Extensión de tríceps con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada arriba, extender los codos sin desplazar los brazos.',
      ),
    ],
  },
  {
    muscle: 'ANTEBRAZO',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['MUNECA'],
    secondary: [],
    exercises: [
      e(
        'Flexión de muñecas con mancuernas sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Apoyar los antebrazos en los muslos con palmas arriba y flexionar las muñecas.',
      ),
      e(
        'Extensión de muñecas con mancuernas sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Apoyar los antebrazos con palmas abajo y elevar el dorso de las manos.',
      ),
      e(
        'Flexión de muñecas con barra',
        ['BARRA', 'BANCO_PLANO'],
        'Con antebrazos apoyados y palmas arriba, flexionar las muñecas sosteniendo la barra.',
      ),
      e(
        'Extensión de muñecas con barra',
        ['BARRA', 'BANCO_PLANO'],
        'Con antebrazos apoyados y palmas abajo, extender las muñecas sin mover los codos.',
      ),
      e(
        'Pronación de antebrazo con mancuerna',
        ['MANCUERNAS'],
        'Con el codo apoyado y flexionado, girar el antebrazo hacia palma abajo de forma controlada.',
        { unilateral: true, joints: ['CODO', 'MUNECA'] },
      ),
      e(
        'Supinación de antebrazo con mancuerna',
        ['MANCUERNAS'],
        'Con el codo apoyado y flexionado, girar el antebrazo hacia palma arriba sin mover el brazo.',
        { unilateral: true, joints: ['CODO', 'MUNECA'] },
      ),
      e(
        'Desviación radial de muñeca con mancuerna',
        ['MANCUERNAS'],
        'Con el antebrazo apoyado de lado, mover la mano hacia el lado del pulgar.',
        { unilateral: true },
      ),
      e(
        'Curl inverso con mancuernas',
        ['MANCUERNAS'],
        'Con palmas hacia abajo, flexionar los codos manteniendo estables las muñecas.',
        { joints: ['CODO', 'MUNECA'], secondary: ['BICEPS'] },
      ),
    ],
  },
  {
    muscle: 'ABDOMINALES',
    pattern: 'CORE',
    joints: ['COLUMNA_LUMBAR'],
    secondary: ['OBLICUOS'],
    exercises: [
      e(
        'Crunch abdominal en el suelo',
        [],
        'Acostado con rodillas flexionadas, elevar ligeramente el tronco sin tirar de la cabeza.',
      ),
      e(
        'Crunch abdominal con brazos extendidos',
        [],
        'Elevar ligeramente el tronco manteniendo los brazos extendidos y la zona lumbar controlada.',
      ),
      e(
        'Crunch inverso',
        [],
        'Acostado, acercar las rodillas al torso elevando de forma controlada la pelvis.',
        { joints: ['CADERA', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Dead bug',
        [],
        'Acostado con brazos y piernas elevados, extender alternadamente brazo y pierna contrarios sin arquear la espalda.',
        { joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'], unilateral: true },
      ),
      e(
        'Plancha abdominal',
        [],
        'Apoyar antebrazos y puntas de pies manteniendo el cuerpo alineado sin hundir la pelvis.',
        { joints: ['HOMBRO', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Plancha abdominal con rodillas apoyadas',
        [],
        'Apoyar antebrazos y rodillas y mantener el tronco alineado.',
        { joints: ['HOMBRO', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Toques de talón desde posición de mesa',
        [],
        'Acostado con caderas y rodillas flexionadas, bajar un talón por vez sin perder el apoyo lumbar.',
        { joints: ['CADERA', 'COLUMNA_LUMBAR'], unilateral: true },
      ),
      e(
        'Crunch abdominal con resistencia de banda',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada por detrás, flexionar ligeramente el tronco controlando el regreso.',
      ),
    ],
  },
  {
    muscle: 'OBLICUOS',
    pattern: 'CORE',
    joints: ['COLUMNA_LUMBAR'],
    secondary: ['ABDOMINALES'],
    exercises: [
      e(
        'Plancha lateral con rodillas apoyadas',
        [],
        'Apoyar un antebrazo y las rodillas, elevar la pelvis y mantener alineado el tronco.',
        { unilateral: true, joints: ['HOMBRO', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Plancha lateral',
        [],
        'Apoyar un antebrazo y el borde del pie para sostener el cuerpo de lado.',
        {
          unilateral: true,
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'COLUMNA_LUMBAR'],
        },
      ),
      e(
        'Crunch oblicuo en el suelo',
        [],
        'Acostado, elevar ligeramente el tronco acercando el hombro hacia el lado contrario.',
        { unilateral: true },
      ),
      e(
        'Toques alternados de talones',
        [],
        'Con rodillas flexionadas y tronco ligeramente elevado, acercar una mano por vez al talón del mismo lado.',
        { unilateral: true },
      ),
      e(
        'Press Pallof con banda elástica',
        ['BANDAS_ELASTICAS'],
        'De lado al anclaje, extender las manos al frente y resistir la rotación del tronco.',
        { unilateral: true, joints: ['HOMBRO', 'CODO', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Press Pallof en polea',
        ['POLEA_BAJA'],
        'De lado a la polea, alejar las manos del pecho sin permitir que el torso gire.',
        { unilateral: true, joints: ['HOMBRO', 'CODO', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Flexión lateral de tronco con mancuerna',
        ['MANCUERNAS'],
        'Con una mancuerna a un lado, inclinar y recuperar el tronco lateralmente sin girarlo.',
        { unilateral: true },
      ),
      e(
        'Plancha lateral con elevación de pelvis',
        [],
        'Desde apoyo lateral en antebrazo, bajar y elevar la pelvis con control.',
        {
          unilateral: true,
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'COLUMNA_LUMBAR'],
        },
      ),
    ],
  },
  {
    muscle: 'DORSAL',
    pattern: 'TRACCION_HORIZONTAL',
    joints: ['HOMBRO', 'CODO'],
    secondary: ['BICEPS', 'TRAPECIO'],
    exercises: [
      e(
        'Remo con barra',
        ['BARRA', 'DISCOS'],
        'Con el tronco inclinado desde la cadera, llevar la barra hacia el abdomen y volver sin balanceo.',
        {
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'CODO', 'CADERA', 'COLUMNA_LUMBAR'],
        },
      ),
      e(
        'Remo unilateral con mancuerna en banco',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Apoyar una mano en el banco y llevar la mancuerna hacia la cadera sin girar el tronco.',
        { unilateral: true },
      ),
      e(
        'Remo con mancuernas y pecho apoyado',
        ['MANCUERNAS', 'BANCO_INCLINADO'],
        'Apoyar el pecho en el banco y llevar las mancuernas hacia los lados del tronco.',
      ),
      e(
        'Remo sentado en polea baja',
        ['POLEA_BAJA'],
        'Sentado frente al cable, llevar el agarre hacia el abdomen manteniendo el torso estable.',
      ),
      e(
        'Remo con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada al frente, tirar hacia el abdomen acercando los codos al cuerpo.',
      ),
      e(
        'Jalón al pecho en polea alta',
        ['POLEA_ALTA'],
        'Desde el asiento, llevar el agarre de la polea hacia el pecho sin tirar detrás de la cabeza.',
        { pattern: 'TRACCION_VERTICAL' },
      ),
      e(
        'Jalón con banda elástica desde anclaje alto',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada arriba, acercar los codos al tronco y regresar con control.',
        { pattern: 'TRACCION_VERTICAL' },
      ),
      e(
        'Pullover con mancuerna en banco',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Acostado, llevar la mancuerna sobre la cabeza y volver manteniendo controlados los brazos.',
        {
          pattern: 'AISLAMIENTO_SUPERIOR',
          level: 'INTERMEDIO',
          joints: ['HOMBRO'],
          secondary: ['PECTORAL'],
        },
      ),
    ],
  },
  {
    muscle: 'TRAPECIO',
    pattern: 'AISLAMIENTO_SUPERIOR',
    joints: ['HOMBRO', 'COLUMNA_CERVICAL'],
    secondary: [],
    exercises: [
      e(
        'Encogimientos de hombros con mancuernas',
        ['MANCUERNAS'],
        'Elevar y bajar los hombros con las mancuernas a los lados, sin realizar círculos.',
      ),
      e(
        'Encogimiento unilateral de hombro con mancuerna',
        ['MANCUERNAS'],
        'Elevar un hombro manteniendo el cuello y el tronco estables.',
        { unilateral: true },
      ),
      e(
        'Encogimientos de hombros sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado con mancuernas a los lados, elevar los hombros y descender controladamente.',
      ),
      e(
        'Encogimientos de hombros con barra al frente',
        ['BARRA', 'DISCOS'],
        'Sostener la barra al frente y elevar los hombros sin flexionar los codos.',
      ),
      e(
        'Encogimientos de hombros con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Pisar la banda y elevar los hombros manteniendo estables los brazos.',
      ),
      e(
        'Encogimientos de hombros en polea baja',
        ['POLEA_BAJA'],
        'Sujetar el cable de polea baja y elevar los hombros sin doblar los codos.',
      ),
      e(
        'Elevaciones en Y acostado en el suelo',
        [],
        'Acostado boca abajo, elevar ligeramente los brazos formando una Y sin levantar la cabeza.',
        { secondary: ['DELTOIDES_POSTERIOR'] },
      ),
      e(
        'Elevaciones en Y en banco inclinado',
        ['MANCUERNAS', 'BANCO_INCLINADO'],
        'Con pecho apoyado, elevar los brazos en forma de Y sin encoger los hombros.',
        { level: 'INTERMEDIO', secondary: ['DELTOIDES_POSTERIOR'] },
      ),
    ],
  },
  {
    muscle: 'ERECTORES_LUMBARES',
    pattern: 'CORE',
    joints: ['COLUMNA_LUMBAR'],
    secondary: ['GLUTEO', 'ISQUIOTIBIALES'],
    exercises: [
      e(
        'Bird dog',
        [],
        'En cuatro apoyos, extender brazo y pierna contrarios manteniendo estable el tronco.',
        { unilateral: true, joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Extensión lumbar corta en el suelo',
        [],
        'Acostado boca abajo, elevar ligeramente el pecho sin forzar una extensión amplia de la espalda.',
      ),
      e(
        'Extensión lumbar en el suelo con brazos en W',
        [],
        'Acostado boca abajo con brazos formando una W, elevar ligeramente el tronco y volver.',
        {
          joints: ['HOMBRO', 'COLUMNA_LUMBAR'],
          secondary: ['TRAPECIO', 'DELTOIDES_POSTERIOR'],
        },
      ),
      e(
        'Superman alternado',
        [],
        'Acostado boca abajo, elevar brazo y pierna contrarios de forma alternada sin perder el control del tronco.',
        { unilateral: true, joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'] },
      ),
      e(
        'Superman con brazos a los lados',
        [],
        'Acostado boca abajo con brazos junto al cuerpo, elevar ligeramente el tronco manteniendo el cuello alineado.',
      ),
      e(
        'Bird dog con banda elástica',
        ['BANDAS_ELASTICAS'],
        'En cuatro apoyos, extender brazo y pierna contrarios contra la banda manteniendo la pelvis estable.',
        {
          unilateral: true,
          level: 'INTERMEDIO',
          joints: ['HOMBRO', 'CADERA', 'COLUMNA_LUMBAR'],
        },
      ),
    ],
  },
  {
    muscle: 'GLUTEO',
    pattern: 'DOMINANTE_CADERA',
    joints: ['CADERA', 'COLUMNA_LUMBAR'],
    secondary: ['ISQUIOTIBIALES'],
    exercises: [
      e(
        'Puente de glúteo',
        [],
        'Acostado con rodillas flexionadas, elevar la pelvis manteniendo el tronco y los muslos alineados.',
      ),
      e(
        'Puente de glúteo con mancuerna',
        ['MANCUERNAS'],
        'Con una mancuerna apoyada sobre la pelvis, elevar y descender la cadera sin arquear la espalda.',
      ),
      e(
        'Puente de glúteo unilateral',
        [],
        'Con un pie apoyado, elevar la pelvis manteniéndola nivelada.',
        { unilateral: true, level: 'INTERMEDIO' },
      ),
      e(
        'Hip thrust con mancuerna en banco',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Apoyar la parte alta de la espalda en el banco y elevar la pelvis con la mancuerna sobre la cadera.',
      ),
      e(
        'Patada de glúteo en cuadrupedia',
        [],
        'En cuatro apoyos, extender una cadera sin arquear la espalda ni girar la pelvis.',
        { unilateral: true },
      ),
      e(
        'Abducción de cadera acostado de lado',
        [],
        'Acostado de lado, separar la pierna superior manteniendo la pelvis estable.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          unilateral: true,
          joints: ['CADERA'],
          secondary: [],
        },
      ),
      e(
        'Abducción de cadera de pie con banda',
        ['BANDAS_ELASTICAS'],
        'Con una banda en las piernas, separar una pierna hacia el lado sin inclinar el tronco.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          unilateral: true,
          joints: ['CADERA'],
          secondary: [],
        },
      ),
      e(
        'Hip thrust con barra en banco',
        ['BARRA', 'DISCOS', 'BANCO_PLANO'],
        'Con espalda alta apoyada y barra sobre la pelvis, extender las caderas controlando el descenso.',
        { level: 'INTERMEDIO' },
      ),
    ],
  },
  {
    muscle: 'ISQUIOTIBIALES',
    pattern: 'DOMINANTE_CADERA',
    joints: ['CADERA', 'COLUMNA_LUMBAR'],
    secondary: ['GLUTEO', 'ERECTORES_LUMBARES'],
    exercises: [
      e(
        'Peso muerto rumano con mancuernas',
        ['MANCUERNAS'],
        'Llevar las caderas hacia atrás con ligera flexión de rodillas y volver manteniendo las mancuernas cerca del cuerpo.',
        { level: 'INTERMEDIO' },
      ),
      e(
        'Peso muerto rumano con barra',
        ['BARRA', 'DISCOS'],
        'Descender la barra cerca de las piernas mediante una bisagra de cadera y volver sin redondear la espalda.',
        { level: 'INTERMEDIO' },
      ),
      e(
        'Peso muerto rumano con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Pisar la banda, llevar la cadera atrás y volver a extenderla manteniendo el tronco estable.',
        { level: 'INTERMEDIO' },
      ),
      e(
        'Peso muerto rumano con una pesa rusa',
        ['PESAS_RUSAS'],
        'Sujetar la pesa con ambas manos y realizar una bisagra de cadera sin alejarla del cuerpo.',
        { level: 'INTERMEDIO' },
      ),
      e(
        'Curl femoral acostado en máquina',
        ['MAQUINA_ISQUIOTIBIALES'],
        'Ajustar la máquina y flexionar las rodillas manteniendo la pelvis apoyada.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          joints: ['RODILLA'],
          secondary: ['GEMELOS'],
        },
      ),
      e(
        'Curl femoral unilateral en máquina',
        ['MAQUINA_ISQUIOTIBIALES'],
        'Flexionar una rodilla por vez contra la máquina sin levantar la pelvis.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          unilateral: true,
          joints: ['RODILLA'],
          secondary: ['GEMELOS'],
        },
      ),
      e(
        'Curl femoral de pie con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada abajo, flexionar una rodilla llevando el talón hacia atrás.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          unilateral: true,
          joints: ['RODILLA'],
          secondary: ['GEMELOS'],
        },
      ),
      e(
        'Caminata de talones desde puente',
        [],
        'Desde un puente de cadera, alejar y acercar los talones en pasos cortos manteniendo la pelvis elevada.',
        {
          level: 'INTERMEDIO',
          joints: ['CADERA', 'RODILLA', 'COLUMNA_LUMBAR'],
          secondary: ['GLUTEO'],
        },
      ),
    ],
  },
  {
    muscle: 'CUADRICEPS',
    pattern: 'DOMINANTE_RODILLA',
    joints: ['CADERA', 'RODILLA', 'TOBILLO'],
    secondary: ['GLUTEO'],
    exercises: [
      e(
        'Sentadilla con peso corporal',
        [],
        'Flexionar caderas y rodillas manteniendo los pies apoyados y volver a ponerse de pie.',
      ),
      e(
        'Sentadilla goblet con mancuerna',
        ['MANCUERNAS'],
        'Sostener una mancuerna delante del pecho y realizar una sentadilla manteniendo el tronco estable.',
      ),
      e(
        'Sentadilla con dos mancuernas a los lados',
        ['MANCUERNAS'],
        'Con las mancuernas a los lados, descender y subir flexionando caderas y rodillas.',
      ),
      e(
        'Zancada estática con peso corporal',
        [],
        'En posición de paso, flexionar ambas rodillas y volver sin desplazar los pies.',
        { unilateral: true },
      ),
      e(
        'Zancadas caminando con mancuernas',
        ['MANCUERNAS'],
        'Avanzar alternando pasos y flexión de rodillas manteniendo el equilibrio.',
        { unilateral: true, level: 'INTERMEDIO' },
      ),
      e(
        'Sentadilla dividida con mancuernas',
        ['MANCUERNAS'],
        'Con un pie delante del otro, bajar y subir sosteniendo las mancuernas a los lados.',
        { unilateral: true },
      ),
      e(
        'Extensión de cuádriceps en máquina',
        ['MAQUINA_CUADRICEPS'],
        'Ajustar el respaldo y extender las rodillas sin despegar la pelvis del asiento.',
        { pattern: 'AISLAMIENTO_INFERIOR', joints: ['RODILLA'], secondary: [] },
      ),
      e(
        'Extensión unilateral de cuádriceps en máquina',
        ['MAQUINA_CUADRICEPS'],
        'Extender una rodilla por vez manteniendo la espalda y la pelvis apoyadas.',
        {
          pattern: 'AISLAMIENTO_INFERIOR',
          unilateral: true,
          joints: ['RODILLA'],
          secondary: [],
        },
      ),
    ],
  },
  {
    muscle: 'ADUCTORES',
    pattern: 'AISLAMIENTO_INFERIOR',
    joints: ['CADERA'],
    secondary: [],
    exercises: [
      e(
        'Aducción de cadera acostado de lado',
        [],
        'Acostado de lado con la pierna superior cruzada delante, elevar la pierna inferior hacia la línea media.',
        { unilateral: true },
      ),
      e(
        'Aducción de cadera de pie en polea baja',
        ['POLEA_BAJA'],
        'Con el cable sujeto al tobillo, llevar la pierna hacia la línea media sin girar la pelvis.',
        { unilateral: true },
      ),
      e(
        'Aducción de cadera de pie con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Con la banda anclada lateralmente, acercar una pierna a la otra sin inclinar el cuerpo.',
        { unilateral: true },
      ),
      e(
        'Plancha Copenhagen con rodilla apoyada en banco',
        ['BANCO_PLANO'],
        'En apoyo lateral de antebrazo, apoyar la rodilla superior en el banco y mantener elevada la pelvis.',
        {
          unilateral: true,
          level: 'INTERMEDIO',
          joints: ['CADERA', 'HOMBRO', 'COLUMNA_LUMBAR'],
          secondary: ['OBLICUOS'],
        },
      ),
      e(
        'Plancha Copenhagen con pie apoyado en banco',
        ['BANCO_PLANO'],
        'En apoyo lateral de antebrazo, apoyar el pie superior en el banco y sostener el cuerpo alineado.',
        {
          unilateral: true,
          level: 'AVANZADO',
          joints: ['CADERA', 'HOMBRO', 'COLUMNA_LUMBAR'],
          secondary: ['OBLICUOS'],
        },
      ),
      e(
        'Aducción de cadera sentado con resistencia de banda',
        ['BANDAS_ELASTICAS', 'BANCO_PLANO'],
        'Sentado con banda anclada lateralmente, acercar la pierna hacia el centro manteniendo la pelvis apoyada.',
        { unilateral: true },
      ),
    ],
  },
  {
    muscle: 'GEMELOS',
    pattern: 'AISLAMIENTO_INFERIOR',
    joints: ['TOBILLO'],
    secondary: [],
    exercises: [
      e(
        'Elevación de talones de pie',
        [],
        'Elevar los talones manteniendo el apoyo sobre la parte delantera de los pies y descender con control.',
      ),
      e(
        'Elevación unilateral de talón',
        [],
        'Elevar y descender el talón de una pierna usando apoyo de una mano para el equilibrio.',
        { unilateral: true },
      ),
      e(
        'Elevación de talones con mancuernas',
        ['MANCUERNAS'],
        'Sostener las mancuernas a los lados y elevar los talones sin balancear el cuerpo.',
      ),
      e(
        'Elevación unilateral de talón con mancuerna',
        ['MANCUERNAS'],
        'Con una mancuerna y apoyo para el equilibrio, elevar el talón de la pierna de trabajo.',
        { unilateral: true },
      ),
      e(
        'Elevación de talones sentado con mancuernas',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado, apoyar las mancuernas sobre los muslos y elevar los talones manteniendo las puntas apoyadas.',
      ),
      e(
        'Elevación unilateral de talón sentado',
        ['MANCUERNAS', 'BANCO_PLANO'],
        'Sentado con una mancuerna sobre el muslo, elevar el talón de una pierna y volver controladamente.',
        { unilateral: true },
      ),
      e(
        'Elevación de talones en prensa de piernas',
        ['PRENSA_PIERNAS'],
        'Con la parte delantera de los pies sobre la plataforma, mover el carro mediante flexión y extensión de tobillos.',
      ),
      e(
        'Flexión plantar con banda elástica',
        ['BANDAS_ELASTICAS'],
        'Sentado con la banda alrededor de la parte delantera del pie, apuntar los dedos hacia adelante y volver.',
        { unilateral: true },
      ),
    ],
  },
];

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stableId(name) {
  const chars = createHash('sha256')
    .update(`gym-local-exercise:${normalizeName(name)}`)
    .digest('hex')
    .slice(0, 32)
    .split('');
  chars[12] = '4';
  chars[16] = '8';
  const hex = chars.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const catalog = groups.flatMap((group) =>
  group.exercises.map((entry) => ({
    id: stableId(entry.name),
    name: entry.name,
    instructions: entry.instructions,
    movementPattern: entry.pattern ?? group.pattern,
    difficultyLevel: entry.level ?? 'PRINCIPIANTE',
    unilateral: entry.unilateral ?? false,
    // Fixtures may lack media. A library HTML page is not an exercise image.
    visualResourceUrl: '',
    primaryMuscle: group.muscle,
    secondaryMuscles: entry.secondary ?? group.secondary,
    equipment: entry.equipment,
    joints: entry.joints ?? group.joints,
  })),
);

module.exports = { catalog, normalizeName, stableId };
