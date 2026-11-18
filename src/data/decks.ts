export type GameModeId = 'familia' | 'empresa' | 'amigos';

export type RoundVariantId = 'duelo' | 'cantado' | 'telefono';

export interface GameCard {
  id: string;
  mode: GameModeId;
  category: 'Frase de Mesa' | 'Villancico / Temazo' | 'Trabalenguas' | 'Cliché';
  text: string;
  phoneticReverse: string;
  phoneticSyllables: string[];
  difficulty: 1 | 2 | 3;
  hint: string;
}

export interface ModeMetadata {
  id: GameModeId;
  title: string;
  subtitle: string;
  audienceLabel: string;
  imageUrl: string;
  accentColor: string;
}

export const GAME_MODES: ModeMetadata[] = [
  {
    id: 'familia',
    title: 'Modo Familia',
    subtitle: 'Abuelas, cuñados, sobrinos, villancicos y polvorones sin peligro.',
    audienceLabel: 'Apto para todas las edades · Nochebuena y Navidad',
    imageUrl: '/src/assets/images/deck_modo_familia_1794954256811.jpg',
    accentColor: '#10B981',
  },
  {
    id: 'empresa',
    title: 'Modo Cena de Empresa',
    subtitle: 'Reuniones que podían ser un correo, la cesta, el jefe y el karaoke.',
    audienceLabel: 'Humor de oficina · Comidas de equipo y departamentos',
    imageUrl: '/src/assets/images/deck_modo_empresa_1794954257643.jpg',
    accentColor: '#F59E0B',
  },
  {
    id: 'amigos',
    title: 'Modo Amigos Sin Filtro',
    subtitle: 'Audios a las cuatro de la mañana, excusas de resaca y salseo puro.',
    audienceLabel: 'Picante y cañero · Nochevieja y Tardebuena',
    imageUrl: '/src/assets/images/deck_modo_amigos_1794954258679.jpg',
    accentColor: '#E11D48',
  },
];

export const ROUND_VARIANTS: {
  id: RoundVariantId;
  title: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'duelo',
    title: 'Duelo de Sobremesa',
    shortLabel: 'Duelo por Parejas',
    description: 'Uno graba en secreto, el retado imita el sonido al revés y la mesa adivina qué decía.',
  },
  {
    id: 'cantado',
    title: 'Villancico o Temazo al Revés',
    shortLabel: 'Reto Cantado',
    description: 'Hay que entonar o cantar el ritmo de la frase para que al invertirlo suene la melodía.',
  },
  {
    id: 'telefono',
    title: 'Teléfono Escacharrado Invertido',
    shortLabel: 'En Cadena',
    description: 'El imitador intenta clavarlo sin ver la frase; si la mesa lo adivina a la primera, doble puntuación.',
  },
];

/**
 * Generates an intuitive Spanish phonetic reverse guide for any phrase.
 * Reverses the character sequence while grouping into readable phonetic blocks.
 */
export function generatePhoneticGuide(phrase: string): {
  phoneticReverse: string;
  phoneticSyllables: string[];
} {
  const cleaned = phrase
    .replace(/[¿?¡!.,;:"]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!cleaned) {
    return { phoneticReverse: '', phoneticSyllables: [] };
  }

  const words = cleaned.split(' ').reverse();
  const reversedWords = words.map((word) => {
    // Normalize tricky Spanish digraphs before reversing so phonetic reading works naturally
    const normalized = word
      .toLowerCase()
      .replace(/ch/g, 'tx')
      .replace(/ll/g, 'y')
      .replace(/qu/g, 'k')
      .replace(/gue/g, 'ge')
      .replace(/gui/g, 'gi')
      .replace(/rr/g, 'R');

    const chars = normalized.split('').reverse().join('').replace(/tx/g, 'ch').replace(/R/g, 'rr');
    return chars.toUpperCase();
  });

  // Break each reversed word into 2-4 character readable chunks
  const syllables: string[] = [];
  reversedWords.forEach((rw) => {
    if (rw.length <= 4) {
      syllables.push(rw);
    } else {
      const chunks: string[] = [];
      for (let i = 0; i < rw.length; i += 3) {
        chunks.push(rw.slice(i, i + 3));
      }
      syllables.push(chunks.join('-'));
    }
  });

  return {
    phoneticReverse: syllables.join(' · '),
    phoneticSyllables: syllables,
  };
}

function createCard(
  id: string,
  mode: GameModeId,
  category: GameCard['category'],
  text: string,
  difficulty: 1 | 2 | 3,
  hint: string,
  customPhonetic?: string
): GameCard {
  const auto = generatePhoneticGuide(text);
  return {
    id,
    mode,
    category,
    text,
    phoneticReverse: customPhonetic || auto.phoneticReverse,
    phoneticSyllables: customPhonetic ? customPhonetic.split(' · ') : auto.phoneticSyllables,
    difficulty,
    hint,
  };
}

export const INITIAL_CARDS: GameCard[] = [
  // ==================== MODO FAMILIA ====================
  createCard(
    'fam-1',
    'familia',
    'Frase de Mesa',
    'Pásame el langostino',
    1,
    'Clásico de Nochebuena nada más sentarse',
    'O-NIT-SOG-NAL · LE · EM-AS-ÁP'
  ),
  createCard(
    'fam-2',
    'familia',
    'Villancico / Temazo',
    'Pero mira cómo beben los peces en el río',
    2,
    'Villancico mítico: cántalo con ritmo',
    'O-ÍR LE NE · SEC-EP SOL · NEB-EB OM-ÓC · AR-IM OR-EP'
  ),
  createCard(
    'fam-3',
    'familia',
    'Frase de Mesa',
    'Abuela no puedo comer más turrón',
    2,
    'Excusa imposible en el postre',
    'NÓRR-UT SÁM · REM-OC OD-EUP ON · A-LEU-BA'
  ),
  createCard(
    'fam-4',
    'familia',
    'Cliché',
    'Este año nos toca el Gordo de Navidad',
    2,
    'Frase del día 22 de diciembre',
    'DAD-IVAN ED · OD-ROG LE · AC-OT SON · OÑ-A ET-SE'
  ),
  createCard(
    'fam-5',
    'familia',
    'Villancico / Temazo',
    'Con mi burrito sabanero voy camino de Belén',
    3,
    'Si lo tarareas al revés, la mesa lo saca al vuelo',
    'NÉL-EB ED · ONI-MAC YOV · OREN-ABAS · OTIR-RUB IM NOC'
  ),
  createCard(
    'fam-6',
    'familia',
    'Trabalenguas',
    'Tres tristes tigres comen polvorones',
    3,
    'Versión navideña del trabalenguas clásico',
    'SEN-OROV-LOP · NEM-OC · SER-GIT SET-SIRT SERT'
  ),
  createCard(
    'fam-7',
    'familia',
    'Frase de Mesa',
    'Niño no toques las figuritas del Belén',
    2,
    'Aviso oficial de toda madre o abuela',
    'NÉL-EB LED · SATI-RUGIF SAL · SE-KOT ON · OÑ-IN'
  ),
  createCard(
    'fam-8',
    'familia',
    'Cliché',
    'El año que viene me apunto al gimnasio',
    2,
    'La mentira más repetida con las uvas',
    'OIS-ANMIG LA · OT-NUPA EM · EN-EIV EK OÑ-A LE'
  ),
  createCard(
    'fam-9',
    'familia',
    'Frase de Mesa',
    'Lleva cuidado no te atragantes con las uvas',
    2,
    'A las 23:59 en todas las casas de España',
    'SAV-U SAL NOC · SET-NAG-ARTA ET ON · ODAD-IUC AVEL-L'
  ),
  createCard(
    'fam-10',
    'familia',
    'Villancico / Temazo',
    'Campana sobre campana y sobre campana una',
    2,
    'Ritmo marcadísimo para imitar al revés',
    'AN-U ANAP-MAC · ERB-OS Y · ANAP-MAC ERB-OS ANAP-MAC'
  ),

  // ==================== MODO CENA DE EMPRESA ====================
  createCard(
    'emp-1',
    'empresa',
    'Frase de Mesa',
    'Hola equipo se ve mi pantalla',
    1,
    'El himno oficial de todas las videollamadas',
    'AYA-TNAP IM · EV ES · OPI-KE AL-OH'
  ),
  createCard(
    'emp-2',
    'empresa',
    'Cliché',
    'Esta reunión podía haber sido un correo',
    2,
    'Pensamiento colectivo un martes a las cuatro',
    'OERR-OC NU · OD-IS REB-AH · AÍD-OP NÓIN-UER AT-SE'
  ),
  createCard(
    'emp-3',
    'empresa',
    'Frase de Mesa',
    'Jefe súbeme el sueldo que es Navidad',
    2,
    'Para decir después de la segunda copa de vino',
    'DAD-IVAN SE EK · OD-LEUS LE · EMEB-ÚS EF-EJ'
  ),
  createCard(
    'emp-4',
    'empresa',
    'Cliché',
    'Tienes el micrófono silenciado compañero',
    2,
    'Cinco minutos hablando solo en Teams',
    'OREN-APMOC · ODAIC-NELIS · ONOF-ÓRCIM LE · SEN-EIT'
  ),
  createCard(
    'emp-5',
    'empresa',
    'Frase de Mesa',
    'Lo vemos el lunes a primera hora',
    1,
    'La frase mágica del viernes al mediodía',
    'AR-OH AREM-IRP A · SEN-UL LE · SOM-EV OL'
  ),
  createCard(
    'emp-6',
    'empresa',
    'Trabalenguas',
    'El chorizo ibérico de la cesta de empresa',
    3,
    'El tesoro más codiciado de diciembre',
    'ASER-PME ED · AT-SEC AL ED · OCIR-ÉBI OZI-ROCH LE'
  ),
  createCard(
    'emp-7',
    'empresa',
    'Frase de Mesa',
    'Quién ha pedido otra botella para la mesa',
    2,
    'Cuando la cuenta ya corre a cargo de la empresa',
    'AS-EM AL AR-AP · AYE-TOB AR-TO · ODID-EP AH NÉI-K'
  ),
  createCard(
    'emp-8',
    'empresa',
    'Cliché',
    'Te pongo en copia para darle seguimiento',
    2,
    'Ataque pasivo-agresivo corporativo de manual',
    'OTNEIM-IGES EL-RAD · AR-AP AIP-OC NE · OGN-OP ET'
  ),
  createCard(
    'emp-9',
    'empresa',
    'Villancico / Temazo',
    'No quiero trabajar no quiero ir a la oficina',
    2,
    'Cántalo con sentimiento de lunes por la mañana',
    'ANIC-IFO AL A · RI OREI-K ON · RAJ-ABART OREI-K ON'
  ),

  // ==================== MODO AMIGOS SIN FILTRO ====================
  createCard(
    'ami-1',
    'amigos',
    'Frase de Mesa',
    'Nos tomamos la penúltima y nos vamos a casa',
    2,
    'La mayor mentira jamás contada a las dos de la mañana',
    'AS-AC A SOM-AV SON Y · AMIT-LÚNEP AL · SOM-AMOT SON'
  ),
  createCard(
    'ami-2',
    'amigos',
    'Cliché',
    'Mañana no bebo más te lo juro por mi vida',
    2,
    'Declaración oficial el día 1 de enero al mediodía',
    'AD-IV IM ROP · OR-UJ OL ET · SÁM OB-EB ON · ANAÑ-AM'
  ),
  createCard(
    'ami-3',
    'amigos',
    'Frase de Mesa',
    'Quítame el móvil que le escribo a mi ex',
    2,
    'Peligro extremo a partir de las tres de la madrugada',
    'XE IM A · OBIR-CSE EL EK · LIV-ÓM LE · EMAT-ÍK'
  ),
  createCard(
    'ami-4',
    'amigos',
    'Trabalenguas',
    'Chupito de hierbas con hielo y limón',
    2,
    'El postre que nadie pidió pero todos acaban tomando',
    'NÓM-IL Y OLEI-H NOC · SAB-REIH ED · OTIP-UCH'
  ),
  createCard(
    'ami-5',
    'amigos',
    'Villancico / Temazo',
    'Mi gran noche de Raphael a grito pelado',
    2,
    'Entónalo como si fueran las cuatro de la mañana',
    'ODAL-EP OTIR-G A · LEAH-PAR ED · ECH-ON NARG IM'
  ),
  createCard(
    'ami-6',
    'amigos',
    'Frase de Mesa',
    'Yo estoy perfectamente vocalizo de maravilla',
    3,
    'Intenta decir esto al revés sin parecer perjudicado',
    'AYI-VARAM ED · OZIL-ACOV · ETNEM-ATCEFREP · YOT-SE OY'
  ),
  createCard(
    'ami-7',
    'amigos',
    'Cliché',
    'Quién me mandaría a mí mezclar vino con cerveza',
    3,
    'Arrepentimiento instantáneo de sobremesa larga',
    'AZEV-REC NOC · ON-IV RALC-ZEM · ÍM A AÍR-ADNAM EM NÉI-K'
  ),
  createCard(
    'ami-8',
    'amigos',
    'Frase de Mesa',
    'Pide un taxi que yo ya veo doble',
    1,
    'Corta, directa y letal al darle la vuelta',
    'ELB-OD OEV AY OY · EK IX-AT NU · ED-IP'
  ),
  createCard(
    'ami-9',
    'amigos',
    'Villancico / Temazo',
    'Paquito el Chocolatero en fila por el salón',
    3,
    'Clásico inmortal de cualquier fiesta en España',
    'NÓL-AS LE ROP · AL-IF NE · ORET-ALOCOCH LE · OTI-KAP'
  ),
];

export const COMEDY_VERDICTS: {
  minScore: number;
  title: string;
  badge: string;
  detail: string;
}[] = [
  {
    minScore: 86,
    title: '¡Brujería Acústica de Sobremesa!',
    badge: 'Lengua de Oro',
    detail: 'Se ha entendido de forma inquietante. O tienes un pacto con el más allá o llevas practicando en el espejo desde noviembre.',
  },
  {
    minScore: 72,
    title: '¡Casi Perfecto (Acento de Laponia)!',
    badge: 'Bilingüe Invertido',
    detail: 'Suena como un elfo nórdico después de dos copas de cava, pero las sílabas han encajado en su sitio.',
  },
  {
    minScore: 55,
    title: 'Dos Polvorones en la Boca',
    badge: 'Vocalización Dudosa',
    detail: 'El ritmo está ahí, aunque suena exactamente igual que tu cuñado intentando hablar con medio mazapán sin tragar.',
  },
  {
    minScore: 35,
    title: 'Mensaje de las Cuatro de la Mañana',
    badge: 'Audio de Nochevieja',
    detail: 'Parece una nota de voz enviada desde la barra libre de la cena de empresa. Solo los muy amigos lo descifran.',
  },
  {
    minScore: 0,
    title: '¡Posesión Alienígena Total!',
    badge: '¿Pero qué dices?',
    detail: 'Acabas de invocar un dialecto desconocido por la ciencia humana. Ni la NASA dándole la vuelta diez veces sabe qué has dicho.',
  },
];
