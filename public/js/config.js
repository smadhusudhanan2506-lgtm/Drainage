// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Configuration & Network Topology
//  All coordinates in a 1200 × 900 virtual space
// ─────────────────────────────────────────────────────────────

/* ── Colour Palette ────────────────────────────────────────── */
export const COLORS = {
  // Normal state (Clean, Mild, Calm Blue)
  pipeNormal:       '#7ec8e3',
  pipeNormalGlow:   '#a8d8f0',
  sensorNormal:     '#4fa8d6',
  sensorGlow:       '#8ecae6',
  manholeNormal:    '#2b7ab5',
  junctionNormal:   '#1f5f8b',
  particleNormal:   'rgba(160, 215, 255, 0.75)',

  // Warning State (Orange - partial blockage / backing up)
  pipeWarning:      '#f97316',
  pipeWarningGlow:  '#fdba74',
  sensorWarning:    '#ea580c',
  particleWarning:  'rgba(251, 146, 60, 0.75)',

  // Danger State (Prominent Red - full blockage / flood hazard)
  pipeDanger:       '#ef4444',
  pipeDangerGlow:   '#ff6b6b',
  sensorDanger:     '#dc2626',
  particleDanger:   'rgba(255, 90, 90, 0.85)',

  // Offline / Maintenance
  sensorOffline:    '#64748b',
  sensorMaint:      '#a855f7',

  // Backgrounds
  ugBackground:     '#081220',
  ugGrid:           'rgba(70, 130, 200, 0.09)',
  agBackground:     '#131f36',
  agRoad:           '#3b4859',
  agBuilding:       '#263346',
  agPark:           '#154329',
  agLake:           '#15405e',
  agSchool:         '#3f3529',
  agResidential:    '#342f2b',
  agCommercial:     '#283142',
  agHospital:       '#3d2828',
  agGovernment:     '#2b2e3c',
  agMarket:         '#383028',
  agBusTerminal:    '#283236',

  // UI
  panelBg:          'rgba(11, 22, 44, 0.92)',
  panelBorder:      'rgba(100, 170, 235, 0.18)',
  textPrimary:      '#f1f5f9',
  textSecondary:    '#94a3b8',
  textAccent:       '#7ec8e3',
  badgeGreen:       '#22c55e',
  badgeAmber:       '#f97316',
  badgeRed:         '#ef4444',
};

/* ── Virtual Canvas Dimensions ─────────────────────────────── */
export const WORLD = { width: 1200, height: 920 };

/* ── Node Types ────────────────────────────────────────────── */
export const NODE_TYPES = {
  SENSOR:   'sensor',
  MANHOLE:  'manhole',
  JUNCTION: 'junction',
  OUTFALL:  'outfall',
};

/* ── Nodes ─────────────────────────────────────────────────── */
export const NODES = {
  // ── Row 0 · y = 110 ──────────────────────────────────────
  'MH-01': { x:  75, y: 110, type: 'manhole',  label: 'MH-01', surface: '1st Avenue & West Boundary Rd' },
  'S-01':  { x: 210, y: 110, type: 'sensor',   label: 'S-01',  surface: '1st Avenue (West Segment)' },
  'J-01':  { x: 370, y: 110, type: 'junction', label: 'J-01',  surface: '1st Avenue & Central Blvd' },
  'S-02':  { x: 510, y: 110, type: 'sensor',   label: 'S-02',  surface: '1st Avenue (Central Segment)' },
  'MH-02': { x: 640, y: 110, type: 'manhole',  label: 'MH-02', surface: '1st Avenue & East Blvd' },
  'S-03':  { x: 790, y: 110, type: 'sensor',   label: 'S-03',  surface: '1st Avenue (East Segment)' },
  'MH-03': { x: 940, y: 110, type: 'manhole',  label: 'MH-03', surface: '1st Avenue & East Boundary Rd' },

  // ── Vertical · y = 240 ───────────────────────────────────
  'S-04':  { x: 370, y: 240, type: 'sensor',   label: 'S-04',  surface: 'Central Blvd (N Segment)' },

  // ── Row 1 · y = 360 ──────────────────────────────────────
  'MH-04': { x:  75, y: 360, type: 'manhole',  label: 'MH-04', surface: '2nd Avenue & West Boundary Rd' },
  'S-05':  { x: 210, y: 360, type: 'sensor',   label: 'S-05',  surface: '2nd Avenue (West Segment)' },
  'J-02':  { x: 370, y: 360, type: 'junction', label: 'J-02',  surface: '2nd Avenue & Central Blvd' },
  'S-06':  { x: 540, y: 360, type: 'sensor',   label: 'S-06',  surface: '2nd Avenue (Between School & Bus Terminal)' },
  'MH-05': { x: 710, y: 360, type: 'manhole',  label: 'MH-05', surface: '2nd Avenue & School Access Rd' },

  // ── Vertical · y = 485 ───────────────────────────────────
  'S-07':  { x: 370, y: 485, type: 'sensor',   label: 'S-07',  surface: 'Central Blvd (Mid Segment / Bus Terminal West)' },
  'S-13':  { x: 710, y: 485, type: 'sensor',   label: 'S-13',  surface: 'East Blvd (School Zone Main Drain)' },

  // ── Row 2 · y = 600 ──────────────────────────────────────
  'MH-06': { x:  75, y: 600, type: 'manhole',  label: 'MH-06', surface: '3rd Avenue & West Boundary Rd' },
  'S-08':  { x: 210, y: 600, type: 'sensor',   label: 'S-08',  surface: '3rd Avenue (West Segment)' },
  'J-03':  { x: 370, y: 600, type: 'junction', label: 'J-03',  surface: '3rd Avenue & Central Blvd' },
  'S-09':  { x: 540, y: 600, type: 'sensor',   label: 'S-09',  surface: '3rd Avenue (Bus Terminal South Segment)' },
  'MH-08': { x: 710, y: 600, type: 'manhole',  label: 'MH-08', surface: '3rd Avenue & School Zone South' },

  // ── Vertical · y = 710 ───────────────────────────────────
  'S-10':  { x: 370, y: 710, type: 'sensor',   label: 'S-10',  surface: 'Central Blvd (S Segment)' },

  // ── Row 3 · y = 820 ──────────────────────────────────────
  'MH-09': { x:  75, y: 820, type: 'manhole',  label: 'MH-09', surface: '4th Avenue & West Boundary Rd' },
  'S-11':  { x: 210, y: 820, type: 'sensor',   label: 'S-11',  surface: '4th Avenue (West Segment)' },
  'J-04':  { x: 370, y: 820, type: 'junction', label: 'J-04',  surface: '4th Avenue & Central Blvd' },
  'S-12':  { x: 540, y: 820, type: 'sensor',   label: 'S-12',  surface: '4th Avenue (Central Segment)' },
  'MH-07': { x: 710, y: 820, type: 'manhole',  label: 'MH-07', surface: '4th Avenue & East Blvd' },
  'S-14':  { x: 850, y: 820, type: 'sensor',   label: 'S-14',  surface: '4th Avenue (East Segment)' },
  'OUTFALL-01': { x: 990, y: 820, type: 'outfall', label: 'OUTFALL-01', surface: 'Outfall to River' },
};

/* ── Pipe Diameter Classes ─────────────────────────────────── */
export const PIPE_DIAMETERS = {
  branch:    { mm:  800, drawWidth:  8, label: 'Branch (800 mm)' },
  secondary: { mm: 1200, drawWidth: 12, label: 'Secondary (1200 mm)' },
  primary:   { mm: 1800, drawWidth: 16, label: 'Primary (1800 mm)' },
  outfall:   { mm: 2000, drawWidth: 20, label: 'Outfall (2000 mm)' },
};

/* ── Pipe Segments ─────────────────────────────────────────── */
export const PIPES = [
  // ── Top Row (east flow) ─────────────────────────────────
  { id: 'P01', from: 'MH-01', to: 'S-01',  diameter: 'branch' },
  { id: 'P02', from: 'S-01',  to: 'J-01',  diameter: 'branch' },
  { id: 'P03', from: 'J-01',  to: 'S-02',  diameter: 'secondary' },
  { id: 'P04', from: 'S-02',  to: 'MH-02', diameter: 'secondary' },
  { id: 'P05', from: 'MH-02', to: 'S-03',  diameter: 'branch' },
  { id: 'P06', from: 'S-03',  to: 'MH-03', diameter: 'branch' },

  // ── Central Vertical: J-01 → J-02 ──────────────────────
  { id: 'P07', from: 'J-01',  to: 'S-04',  diameter: 'secondary' },
  { id: 'P08', from: 'S-04',  to: 'J-02',  diameter: 'secondary' },

  // ── Second Row (east flow - between School and Bus Terminal) ─
  { id: 'P09', from: 'MH-04', to: 'S-05',  diameter: 'branch' },
  { id: 'P10', from: 'S-05',  to: 'J-02',  diameter: 'branch' },
  { id: 'P11', from: 'J-02',  to: 'S-06',  diameter: 'secondary' },
  { id: 'P12', from: 'S-06',  to: 'MH-05', diameter: 'secondary' },

  // ── Central Vertical: J-02 → J-03 ──────────────────────
  { id: 'P13', from: 'J-02',  to: 'S-07',  diameter: 'primary' },
  { id: 'P14', from: 'S-07',  to: 'J-03',  diameter: 'primary' },

  // ── Right Vertical (School Zone Drain): MH-05 → MH-08 ──
  { id: 'P15', from: 'MH-05', to: 'S-13',  diameter: 'secondary' },
  { id: 'P16', from: 'S-13',  to: 'MH-08', diameter: 'secondary' },

  // ── Third Row (east flow) ──────────────────────────────
  { id: 'P17', from: 'MH-06', to: 'S-08',  diameter: 'branch' },
  { id: 'P18', from: 'S-08',  to: 'J-03',  diameter: 'branch' },
  { id: 'P19', from: 'J-03',  to: 'S-09',  diameter: 'primary' },
  { id: 'P20', from: 'S-09',  to: 'MH-08', diameter: 'primary' },

  // ── Central Vertical: J-03 → J-04 ──────────────────────
  { id: 'P21', from: 'J-03',  to: 'S-10',  diameter: 'primary' },
  { id: 'P22', from: 'S-10',  to: 'J-04',  diameter: 'primary' },

  // ── Right Vertical: MH-08 → MH-07 ─────────────────────
  { id: 'P23', from: 'MH-08', to: 'MH-07', diameter: 'secondary' },

  // ── Bottom Row (east flow to outfall) ───────────────────
  { id: 'P24', from: 'MH-09', to: 'S-11',  diameter: 'branch' },
  { id: 'P25', from: 'S-11',  to: 'J-04',  diameter: 'branch' },
  { id: 'P26', from: 'J-04',  to: 'S-12',  diameter: 'primary' },
  { id: 'P27', from: 'S-12',  to: 'MH-07', diameter: 'primary' },
  { id: 'P28', from: 'MH-07', to: 'S-14',  diameter: 'outfall' },
  { id: 'P29', from: 'S-14',  to: 'OUTFALL-01', diameter: 'outfall' },
];

/* ── City Zones (Above-ground map with School Zone) ───────── */
export const ZONES = [
  { id: 'city-park',       label: 'City Park',                x: 370, y:  15, w: 200, h:  80, type: 'park', icon: '🌳' },
  { id: 'north-res-w',     label: 'North Residential\nArea',    x:  75, y:  15, w: 260, h:  80, type: 'residential' },
  { id: 'north-res-e',     label: 'North Residential\nArea',    x: 640, y:  15, w: 320, h:  80, type: 'residential' },
  { id: 'commercial',      label: 'Commercial\nZone',         x:  75, y: 135, w: 260, h: 200, type: 'commercial', icon: '🏢' },
  { id: 'government',      label: 'Government\nOffice Complex', x: 390, y: 135, w: 280, h: 200, type: 'government', icon: '🏛️' },
  { id: 'hospital',        label: 'Hospital\nZone',           x: 720, y: 135, w: 240, h: 200, type: 'hospital', icon: '🏥' },
  { id: 'west-res',        label: 'West Residential\nArea',    x:  75, y: 385, w: 260, h: 190, type: 'residential' },
  { id: 'bus-terminal',    label: 'Bus Terminal',             x: 390, y: 385, w: 280, h: 190, type: 'bus_terminal', icon: '🚌' },
  { id: 'school-zone',     label: 'School Zone',              x: 720, y: 385, w: 240, h: 190, type: 'school', icon: '🏫' },
  { id: 'market',          label: 'Market Area',              x: 390, y: 625, w: 280, h: 170, type: 'market', icon: '🏪' },
  { id: 'lake-view',       label: 'Lake View',                x:  20, y: 720, w: 170, h: 190, type: 'lake', icon: '🌊' },
  { id: 'river',           label: 'River Outfall',            x: 870, y: 790, w: 150, h: 120, type: 'river' },
];

/* ── Roads ─────────────────────────────────────────────────── */
export const ROADS = [
  // Horizontal roads
  { id: 'rd-h1', x1:  30, y1: 110, x2: 990, y2: 110, width: 32, label: '1st Avenue' },
  { id: 'rd-h2', x1:  30, y1: 360, x2: 760, y2: 360, width: 32, label: '2nd Avenue (School - Bus Stand Rd)' },
  { id: 'rd-h3', x1:  30, y1: 600, x2: 760, y2: 600, width: 32, label: '3rd Avenue' },
  { id: 'rd-h4', x1:  30, y1: 820, x2: 990, y2: 820, width: 36, label: '4th Avenue (Main Trunk)' },
  // Vertical roads
  { id: 'rd-v1', x1: 370, y1:  50, x2: 370, y2: 870, width: 28, label: 'Central Blvd' },
  { id: 'rd-v2', x1: 710, y1: 110, x2: 710, y2: 820, width: 24, label: 'East Blvd (School Rd)' },
];

/* ── Node Rendering Sizes ──────────────────────────────────── */
export const NODE_SIZES = {
  sensor:   { radius: 10, outline: 2 },
  manhole:  { size: 16,   outline: 2 },
  junction: { size: 18,   outline: 2 },
  outfall:  { size: 20,   outline: 3 },
};

/* ── Adjacency Lookup ──────────────────────────────────────── */
export function buildAdjacency() {
  const downstream = {};
  const upstream   = {};
  for (const p of PIPES) {
    if (!downstream[p.from]) downstream[p.from] = [];
    downstream[p.from].push(p.id);
    if (!upstream[p.to]) upstream[p.to] = [];
    upstream[p.to].push(p.id);
  }
  return { downstream, upstream };
}
