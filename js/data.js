/**
 * Latest Viral Videos 2026 - Demo Videos Dataset
 * Fictional, curated viral video prototype data
 */

const DEMO_VIDEOS = [
  {
    id: 1,
    title: "World Record FPV Drone Chase Through Cyber Tokyo 2026 (8K 120FPS)",
    channel: {
      name: "Apex Flight Labs",
      verified: true,
      subscribers: "3.2M",
      initials: "AF"
    },
    duration: "04:18",
    durationSec: 258,
    uploadTime: "2 hours ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2h ago
    views: "1.4M views",
    viewCountRaw: 1420500,
    trendingScore: 9940,
    isNew: true,
    likes: "184K",
    category: "tech",
    description: "An unbelievable continuous 4-minute single-take dive through Shinjuku neon canyons and underground speedway tunnels with custom sub-250g ultra-high-speed propulsion drone. Filmed under official city air permits with experimental gyroscopic stabilization.",
    gradient: ["#0f172a", "#3b82f6", "#06b6d4"],
    accentColor: "#38bdf8",
    badge: "8K HDR",
    theme: "fpv-tokyo"
  },
  {
    id: 2,
    title: "Autonomous Bipedal Robot Masters Extreme Parkour Championship Finals",
    channel: {
      name: "RoboDynamics Global",
      verified: true,
      subscribers: "5.8M",
      initials: "RD"
    },
    duration: "03:42",
    durationSec: 222,
    uploadTime: "6 hours ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 6,
    views: "2.8M views",
    viewCountRaw: 2840000,
    trendingScore: 9820,
    isNew: true,
    likes: "320K",
    category: "tech",
    description: "Watch Model-X7 complete an obstacle gauntlet featuring 3-meter vertical wall jumps, dynamic rail slides, and a backflip precision landing without human remote assistance. Neural network vision updates at 1,000Hz.",
    gradient: ["#18181b", "#71717a", "#e4e4e7"],
    accentColor: "#f59e0b",
    badge: "BREAKTHROUGH",
    theme: "robot-parkour"
  },
  {
    id: 3,
    title: "Deep Mariana Trench Exploration Captures Giant Bioluminescent Leviathan",
    channel: {
      name: "Abyssal Frontier",
      verified: true,
      subscribers: "1.9M",
      initials: "AF"
    },
    duration: "08:15",
    durationSec: 495,
    uploadTime: "12 hours ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 12,
    views: "4.1M views",
    viewCountRaw: 4120000,
    trendingScore: 9710,
    isNew: true,
    likes: "490K",
    category: "nature",
    description: "At 10,800 meters beneath sea level, our autonomous submarine searchlight illuminated an undocumented deep-sea creature radiating pulsating sapphire and emerald bio-photons across its 15-meter undulating mantle.",
    gradient: ["#020617", "#0c4a6e", "#0284c7"],
    accentColor: "#38bdf8",
    badge: "DISCOVERY",
    theme: "deep-ocean"
  },
  {
    id: 4,
    title: "Hypersonic Jet Prototype Breaks Sound Barrier in Low Altitude Desert Flyby",
    channel: {
      name: "AeroVanguard",
      verified: true,
      subscribers: "4.4M",
      initials: "AV"
    },
    duration: "02:54",
    durationSec: 174,
    uploadTime: "18 hours ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
    views: "5.6M views",
    viewCountRaw: 5610000,
    trendingScore: 9550,
    isNew: true,
    likes: "612K",
    category: "tech",
    description: "The sound of vapor cones splitting the desert stillness at Mach 4.2. Captured using specialized 500,000 frames-per-second tracking cameras mounted on high-altitude solar aerostats.",
    gradient: ["#1e293b", "#475569", "#f97316"],
    accentColor: "#f97316",
    badge: "MACH 4.2",
    theme: "hypersonic-jet"
  },
  {
    id: 5,
    title: "Extreme Speed Wingsuit Dive Through Matterhorn Natural Needle Arch",
    channel: {
      name: "Gravity Rebels",
      verified: true,
      subscribers: "2.1M",
      initials: "GR"
    },
    duration: "05:03",
    durationSec: 303,
    uploadTime: "1 day ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    views: "3.9M views",
    viewCountRaw: 3950000,
    trendingScore: 9400,
    isNew: true,
    likes: "420K",
    category: "sports",
    description: "Threaded through a natural granite arch barely 4 meters wide at over 260 km/h. Two years of weather simulation and wind tunnel tests culminated in this heart-stopping descent across the Swiss Alps.",
    gradient: ["#0f172a", "#334155", "#64748b"],
    accentColor: "#ef4444",
    badge: "POV EXTREME",
    theme: "wingsuit-alps"
  },
  {
    id: 6,
    title: "World First Real Holographic Concert Stuns 80,000 Fans in London Dome",
    channel: {
      name: "Sonic Vision Media",
      verified: true,
      subscribers: "6.7M",
      initials: "SV"
    },
    duration: "06:40",
    durationSec: 400,
    uploadTime: "1 day ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 28,
    views: "8.3M views",
    viewCountRaw: 8300000,
    trendingScore: 9680,
    isNew: false,
    likes: "940K",
    category: "entertainment",
    description: "Without 3D glasses or headsets, a 20-meter tall volumetric photon-projection performed live duets across the stadium arena. See the crowd reaction when the digital dragon circled the roof structure.",
    gradient: ["#2e1065", "#7c3aed", "#ec4899"],
    accentColor: "#a855f7",
    badge: "HOLOGRAM",
    theme: "hologram-concert"
  },
  {
    id: 7,
    title: "Master Tokyo Chef Slices 1,000 Micro-Layers of Handcrafted Wagyu Sashimi",
    channel: {
      name: "Artisan Culinary",
      verified: true,
      subscribers: "3.5M",
      initials: "AC"
    },
    duration: "10:12",
    durationSec: 612,
    uploadTime: "2 days ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
    views: "6.2M views",
    viewCountRaw: 6200000,
    trendingScore: 9150,
    isNew: false,
    likes: "570K",
    category: "lifestyle",
    description: "Pure culinary zen. 48 years of blade mastery shown in uninterrupted macro detail. Each paper-thin slice melts instantaneously on the palate. Ambient ASMR sound engineering.",
    gradient: ["#1c1917", "#44403c", "#78716c"],
    accentColor: "#fbbf24",
    badge: "4K ASMR",
    theme: "artisan-chef"
  },
  {
    id: 8,
    title: "Zero-Gravity High-Speed Water Physics Experiment Inside Orbiting Lab",
    channel: {
      name: "AstroSci Station",
      verified: true,
      subscribers: "4.9M",
      initials: "AS"
    },
    duration: "07:22",
    durationSec: 442,
    uploadTime: "3 days ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 72,
    views: "7.7M views",
    viewCountRaw: 7720000,
    trendingScore: 9280,
    isNew: false,
    likes: "810K",
    category: "science",
    description: "What happens when acoustic levitation waves collide with a floating sphere of colored hydrophobic fluids inside microgravity? The resulting standing wave patterns resemble miniature galaxies.",
    gradient: ["#020617", "#1e1b4b", "#4338ca"],
    accentColor: "#818cf8",
    badge: "ZERO-G",
    theme: "zero-g-fluid"
  },
  {
    id: 9,
    title: "Hidden Underground Waterfall Discovered Beneath 150-Year-Old Abandoned Metro",
    channel: {
      name: "Urban Archeology",
      verified: true,
      subscribers: "1.7M",
      initials: "UA"
    },
    duration: "09:48",
    durationSec: 588,
    uploadTime: "4 days ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 96,
    views: "3.4M views",
    viewCountRaw: 3410000,
    trendingScore: 8900,
    isNew: false,
    likes: "390K",
    category: "discovery",
    description: "Deep subterranean exploration under Paris reveals an enormous flooded limestone cavern where an underground aquifer created a 15-meter subterranean waterfall roaring into crystal turquoise waters.",
    gradient: ["#052e16", "#14532d", "#16a34a"],
    accentColor: "#22c55e",
    badge: "EXPEDITION",
    theme: "underground-cave"
  },
  {
    id: 10,
    title: "Solar Storm Aurora Borealis Over Lofoten Archipelago in Ultra Timelapse",
    channel: {
      name: "Nordic Cinematic",
      verified: true,
      subscribers: "2.5M",
      initials: "NC"
    },
    duration: "04:55",
    durationSec: 295,
    uploadTime: "5 days ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 120,
    views: "9.5M views",
    viewCountRaw: 9540000,
    trendingScore: 9480,
    isNew: false,
    likes: "1.1M",
    category: "nature",
    description: "The strongest G5 solar geomagnetic storm of the solar cycle creates ribbons of crimson, violet, and electric green shimmering over frozen fjords and solitary fishing cabins in Norway.",
    gradient: ["#09090b", "#064e3b", "#059669"],
    accentColor: "#34d399",
    badge: "12K TIMELAPSE",
    theme: "aurora-norway"
  },
  {
    id: 11,
    title: "Custom 1,800HP Electric Supercar Prototype Smashes Nürburgring Lap Record",
    channel: {
      name: "Apex Motors World",
      verified: true,
      subscribers: "3.8M",
      initials: "AM"
    },
    duration: "06:05",
    durationSec: 365,
    uploadTime: "6 days ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 144,
    views: "11.2M views",
    viewCountRaw: 11200000,
    trendingScore: 9750,
    isNew: false,
    likes: "1.4M",
    category: "tech",
    description: "Full in-car telemetry and roll cage perspective as the quad-motor prototype clocks a breathtaking 5:48.33 lap time on cold Michelin slicks. The g-force meter peaks at 3.4 lateral G in the Carousel.",
    gradient: ["#18181b", "#3f3f46", "#dc2626"],
    accentColor: "#ef4444",
    badge: "5:48.33 LAP",
    theme: "supercar-lap"
  },
  {
    id: 12,
    title: "Illusionist Warps Reality in Live Uncut 3D Street Art Demonstration",
    channel: {
      name: "Optical Wonder",
      verified: true,
      subscribers: "2.3M",
      initials: "OW"
    },
    duration: "03:15",
    durationSec: 195,
    uploadTime: "1 week ago",
    timestamp: Date.now() - 1000 * 60 * 60 * 168,
    views: "14.6M views",
    viewCountRaw: 14600000,
    trendingScore: 9320,
    isNew: false,
    likes: "1.8M",
    category: "entertainment",
    description: "Pedestrians in central Covent Garden literally stop in their tracks as a flat chalk pavement drawing transforms into a dizzying infinite abyssal portal that looks 100% photorealistic from every perspective angle.",
    gradient: ["#1e1b4b", "#4338ca", "#a21caf"],
    accentColor: "#c084fc",
    badge: "MIND BENDING",
    theme: "optical-illusion"
  }
];

// Helper to generate dynamic SVG thumbnails with rich visuals
function generateThumbnailSvg(video) {
  const [c1, c2, c3] = video.gradient;
  const accent = video.accentColor;
  
  // Unique visual graphics per theme
  let visualElements = "";
  
  switch(video.theme) {
    case 'fpv-tokyo':
      visualElements = `
        <!-- Cyber grid & cityscape perspective -->
        <path d="M0,200 L400,200 L320,80 L80,80 Z" fill="url(#grad2)" opacity="0.3"/>
        <line x1="200" y1="80" x2="200" y2="200" stroke="${accent}" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.6"/>
        <line x1="140" y1="80" x2="100" y2="200" stroke="${accent}" stroke-width="1" opacity="0.4"/>
        <line x1="260" y1="80" x2="300" y2="200" stroke="${accent}" stroke-width="1" opacity="0.4"/>
        <!-- Drone HUD target crosshair -->
        <circle cx="200" cy="112" r="28" stroke="${accent}" stroke-width="1.5" fill="none" opacity="0.8"/>
        <circle cx="200" cy="112" r="4" fill="${accent}"/>
        <path d="M160,112 L185,112 M215,112 L240,112 M200,72 L200,97 M200,127 L200,152" stroke="${accent}" stroke-width="1.5"/>
        <text x="235" y="105" fill="#fff" font-size="9" font-family="monospace" letter-spacing="1">REC [8K 120]</text>
        <text x="235" y="118" fill="${accent}" font-size="8" font-family="monospace">SPD: 184 KM/H</text>
      `;
      break;
    case 'robot-parkour':
      visualElements = `
        <!-- Robotic joints & obstacle silhouettes -->
        <rect x="70" y="140" width="50" height="60" rx="4" fill="#27272a"/>
        <rect x="150" y="110" width="45" height="90" rx="4" fill="#3f3f46"/>
        <rect x="230" y="70" width="55" height="130" rx="4" fill="#52525b"/>
        <!-- Robot leaping wireframe silhouette -->
        <circle cx="200" cy="55" r="9" fill="${accent}"/>
        <path d="M200,64 L195,85 L180,95 M195,85 L215,92 M195,85 L190,105 L175,115 M190,105 L205,120" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <text x="25" y="45" fill="#fff" font-size="9" font-family="monospace" font-weight="bold">AUTONOMOUS GAIT // ACTIVE</text>
      `;
      break;
    case 'deep-ocean':
      visualElements = `
        <!-- Bioluminescent deep sea waves and creature tendrils -->
        <path d="M-20,160 Q100,120 200,150 T420,130" stroke="${accent}" stroke-width="3" fill="none" opacity="0.7"/>
        <path d="M-20,180 Q120,140 240,170 T420,150" stroke="#0ea5e9" stroke-width="2" fill="none" opacity="0.5"/>
        <!-- Glowing leviathan eye & nodes -->
        <circle cx="260" cy="95" r="16" fill="${accent}" filter="blur(6px)" opacity="0.6"/>
        <circle cx="260" cy="95" r="7" fill="#fff"/>
        <circle cx="210" cy="115" r="4" fill="${accent}"/>
        <circle cx="170" cy="128" r="3" fill="${accent}"/>
        <circle cx="130" cy="138" r="2.5" fill="${accent}"/>
        <text x="25" y="45" fill="#38bdf8" font-size="9" font-family="monospace">DEPTH: -10,842M</text>
      `;
      break;
    case 'hypersonic-jet':
      visualElements = `
        <!-- Sonic boom vapor cones & supersonic dart -->
        <ellipse cx="230" cy="112" rx="45" ry="30" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.4"/>
        <ellipse cx="250" cy="112" rx="75" ry="50" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.3"/>
        <!-- Sleek jet silhouette -->
        <path d="M290,112 L170,95 L140,80 L160,110 L90,112 L160,114 L140,144 L170,129 Z" fill="#fff"/>
        <polygon points="120,110 80,112 120,114" fill="${accent}"/>
        <text x="25" y="45" fill="#f97316" font-size="9" font-family="monospace">MACH 4.2 // TELEMETRY LOCK</text>
      `;
      break;
    case 'wingsuit-alps':
      visualElements = `
        <!-- Alpine mountain peaks -->
        <polygon points="40,200 120,100 190,200" fill="#334155"/>
        <polygon points="110,110 120,100 135,112" fill="#fff"/>
        <polygon points="140,200 240,60 340,200" fill="#1e293b"/>
        <polygon points="225,80 240,60 260,85" fill="#fff"/>
        <!-- Wingsuit pilot -->
        <path d="M200,90 L180,105 L220,105 Z" fill="${accent}"/>
        <line x1="200" y1="85" x2="200" y2="108" stroke="#fff" stroke-width="1.5"/>
        <text x="25" y="45" fill="#fff" font-size="9" font-family="sans-serif" font-weight="bold">EXTREME DESCENT</text>
      `;
      break;
    case 'hologram-concert':
      visualElements = `
        <!-- Stadium laser lights and 3D hologram -->
        <line x1="50" y1="200" x2="200" y2="80" stroke="${accent}" stroke-width="2" opacity="0.7"/>
        <line x1="350" y1="200" x2="200" y2="80" stroke="#ec4899" stroke-width="2" opacity="0.7"/>
        <line x1="100" y1="200" x2="200" y2="80" stroke="#38bdf8" stroke-width="1.5" opacity="0.6"/>
        <line x1="300" y1="200" x2="200" y2="80" stroke="${accent}" stroke-width="1.5" opacity="0.6"/>
        <!-- Hologram figure -->
        <circle cx="200" cy="80" r="14" fill="${accent}" opacity="0.8"/>
        <path d="M190,100 L210,100 L215,130 L185,130 Z" fill="${accent}" opacity="0.6"/>
        <text x="25" y="45" fill="#ec4899" font-size="9" font-family="sans-serif" font-weight="bold">VOLUMETRIC LIGHTING 2026</text>
      `;
      break;
    case 'artisan-chef':
      visualElements = `
        <!-- Culinary marble cutting board & Japanese santoku knife -->
        <rect x="60" y="100" width="280" height="90" rx="8" fill="#292524" stroke="#44403c"/>
        <ellipse cx="200" cy="145" rx="90" ry="30" fill="#78716c" opacity="0.4"/>
        <path d="M130,120 L270,120 L260,150 L140,150 Z" fill="#b91c1c" opacity="0.85"/>
        <path d="M140,125 L250,145" stroke="#fecaca" stroke-width="2" stroke-linecap="round"/>
        <path d="M150,135 L240,140" stroke="#fecaca" stroke-width="2" stroke-linecap="round"/>
        <!-- Damascus blade reflection -->
        <path d="M90,70 L280,100 L110,105 Z" fill="#e7e5e4" opacity="0.9"/>
        <rect x="60" y="65" width="35" height="12" rx="2" fill="#1c1917"/>
        <text x="25" y="45" fill="${accent}" font-size="9" font-family="sans-serif" font-weight="bold">ARTISANAL CUT // 1,000 LAYERS</text>
      `;
      break;
    case 'zero-g-fluid':
      visualElements = `
        <!-- Zero gravity floating droplet spheres and acoustic waves -->
        <circle cx="200" cy="115" r="50" fill="url(#grad2)" stroke="${accent}" stroke-width="2"/>
        <circle cx="200" cy="115" r="35" fill="${accent}" opacity="0.3"/>
        <circle cx="200" cy="115" r="18" fill="#fff" opacity="0.8"/>
        <!-- Floating mini satellite orbs -->
        <circle cx="120" cy="80" r="14" fill="#a5b4fc" opacity="0.7"/>
        <circle cx="280" cy="75" r="16" fill="#818cf8" opacity="0.7"/>
        <circle cx="260" cy="160" r="12" fill="#c7d2fe" opacity="0.6"/>
        <!-- Acoustic vibration lines -->
        <path d="M50,115 Q120,80 200,115 T350,115" stroke="${accent}" stroke-width="1.5" stroke-dasharray="3,3" fill="none"/>
        <text x="25" y="45" fill="#818cf8" font-size="9" font-family="monospace">ORBITAL FLUID DYNAMICS // 0-G</text>
      `;
      break;
    case 'underground-cave':
      visualElements = `
        <!-- Subterranean cavern stalactites and turquoise falls -->
        <polygon points="50,0 70,80 90,0 120,100 150,0 250,0 280,90 310,0 350,70 380,0" fill="#14532d"/>
        <!-- Waterfall chute -->
        <rect x="180" y="50" width="40" height="150" fill="#86efac" opacity="0.6"/>
        <rect x="190" y="60" width="20" height="140" fill="#ffffff" opacity="0.8"/>
        <!-- Pool waves -->
        <ellipse cx="200" cy="185" rx="140" ry="25" fill="#15803d" opacity="0.8"/>
        <ellipse cx="200" cy="185" rx="70" ry="12" fill="#bbf7d0" opacity="0.5"/>
        <text x="25" y="45" fill="${accent}" font-size="9" font-family="sans-serif" font-weight="bold">FORGOTTEN AQUEDUCT</text>
      `;
      break;
    case 'aurora-norway':
      visualElements = `
        <!-- Curtains of aurora over mountains -->
        <path d="M0,80 Q100,20 200,70 T400,30 L400,140 Q300,90 200,130 T0,110 Z" fill="${accent}" opacity="0.45" filter="blur(8px)"/>
        <path d="M0,60 Q120,10 240,50 T400,20" stroke="#a7f3d0" stroke-width="4" fill="none" opacity="0.8"/>
        <!-- Sharp snowy peaks -->
        <polygon points="30,225 110,130 190,225" fill="#064e3b"/>
        <polygon points="95,145 110,130 125,148" fill="#ffffff"/>
        <polygon points="160,225 240,110 320,225" fill="#022c22"/>
        <polygon points="220,130 240,110 260,135" fill="#ffffff"/>
        <polygon points="280,225 350,140 400,225" fill="#064e3b"/>
        <text x="25" y="45" fill="#34d399" font-size="9" font-family="monospace">G5 GEOMAGNETIC PEAK // 68°N</text>
      `;
      break;
    case 'supercar-lap':
      visualElements = `
        <!-- Curving asphalt racetrack & aggressive hypercar -->
        <path d="M-50,225 Q150,120 450,225" stroke="#ef4444" stroke-width="16" fill="none"/>
        <path d="M-50,225 Q150,120 450,225" stroke="#ffffff" stroke-width="12" stroke-dasharray="16,16" fill="none"/>
        <!-- Supercar rear aero & LED lightbar -->
        <rect x="140" y="105" width="120" height="30" rx="6" fill="#18181b"/>
        <line x1="145" y1="110" x2="255" y2="110" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
        <rect x="160" y="85" width="80" height="15" rx="3" fill="#27272a"/>
        <line x1="170" y1="88" x2="230" y2="88" stroke="#3b82f6" stroke-width="2"/>
        <text x="25" y="45" fill="#ef4444" font-size="9" font-family="monospace" font-weight="bold">OFFICIAL TIME: 5:48.330</text>
      `;
      break;
    case 'optical-illusion':
      visualElements = `
        <!-- Anamorphic geometric optical portal -->
        <polygon points="200,50 310,115 310,165 200,210 90,165 90,115" stroke="${accent}" stroke-width="2" fill="none"/>
        <polygon points="200,75 280,120 280,155 200,185 120,155 120,120" stroke="#fff" stroke-width="1.5" fill="none" opacity="0.7"/>
        <polygon points="200,95 245,122 245,145 200,165 155,145 155,122" stroke="${accent}" stroke-width="1.5" fill="none" opacity="0.9"/>
        <circle cx="200" cy="133" r="12" fill="#fff"/>
        <text x="25" y="45" fill="#c084fc" font-size="9" font-family="monospace">PERSPECTIVE ILLUSION</text>
      `;
      break;
    default:
      visualElements = `
        <!-- Geometric cinematic backdrop -->
        <circle cx="200" cy="112" r="55" stroke="${accent}" stroke-width="1.5" fill="none" opacity="0.5"/>
        <circle cx="200" cy="112" r="35" stroke="#fff" stroke-width="1" fill="none" opacity="0.3"/>
        <rect x="150" y="80" width="100" height="65" rx="6" stroke="${accent}" stroke-width="1" fill="none" opacity="0.4"/>
        <text x="25" y="45" fill="#fff" font-size="9" font-family="monospace">VIRAL EDITION // 2026</text>
      `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="bgGrad_${video.id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="50%" stop-color="${c2}" />
        <stop offset="100%" stop-color="${c3}" />
      </linearGradient>
      <linearGradient id="grad2" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#000" stop-opacity="0.8" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.2" />
      </linearGradient>
      <radialGradient id="vignette_${video.id}" cx="50%" cy="50%" r="70%">
        <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.65"/>
      </radialGradient>
    </defs>
    <!-- Background -->
    <rect width="400" height="225" fill="url(#bgGrad_${video.id})"/>
    <!-- Visual theme elements -->
    ${visualElements}
    <!-- Dark Vignette for contrast -->
    <rect width="400" height="225" fill="url(#vignette_${video.id})"/>
    <!-- Top badge -->
    <g transform="translate(390, 16)">
      <rect x="-80" y="0" width="70" height="18" rx="3" fill="#000000" fill-opacity="0.75" stroke="#ffffff" stroke-width="0.75" stroke-opacity="0.3"/>
      <text x="-45" y="12" fill="#ffffff" font-size="8.5" font-family="sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.5">${video.badge}</text>
    </g>
  </svg>`;

  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Assign generated thumbnails
DEMO_VIDEOS.forEach(v => {
  v.thumbnail = generateThumbnailSvg(v);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEMO_VIDEOS, generateThumbnailSvg };
}

