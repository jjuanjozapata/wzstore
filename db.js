// Base de datos semilla estandarizada con llaves completas y saneamiento de sintaxis JSON
const INITIAL_DATABASE = [
  {
    id: "wz-uuid-str-" + (Date.now() + 1),
    name: "Alpha Pro Compression Tee",
    description: "Camiseta de compresión de grado táctico. Tejido termorregulador que expulsa el sudor en milisegundos. Diseñada para hipertrofia y running de alta intensidad.",
    priceRegular: 185000,
    priceOffer: 138750,
    isOffer: true,
    category: "hombre",
    imageUrl: "https://images.unsplash.com/photo-1581636625402-29f2a01222ce?auto=format&fit=crop&w=600&q=80",
    badge: "TOP VENTAS",
    pointsAwarded: 80,
    variants: [
      {
        color: "Negro Obsidiana",
        colorHex: "#111827",
        sizes: [
          { size: "S", stock: 15 },
          { size: "M", stock: 8 },
          { size: "L", stock: 1 },
          { size: "XL", stock: 0 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 2),
    name: "Leggings Core Seamless",
    description: "Licras sin costuras para mujer. Compresión media-alta en glúteos y cuádriceps, a prueba de sentadillas (squat-proof).",
    priceRegular: 155000,
    priceOffer: 155000,
    isOffer: false,
    category: "mujer",
    imageUrl: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?auto=format&fit=crop&w=600&q=80",
    badge: "NUEVO",
    pointsAwarded: 60,
    variants: [
      {
        color: "Gris Asfalto",
        colorHex: "#374151",
        sizes: [
          { size: "S", stock: 0 },
          { size: "M", stock: 12 },
          { size: "L", stock: 5 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 3),
    name: "Zapatillas WZ-AeroBoost",
    description: "Calzado ultraligero con suela de fibra de carbono para retorno de energía explosivo. Corta el viento, domina el asfalto.",
    priceRegular: 450000,
    priceOffer: 382500,
    isOffer: true,
    category: "hombre",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
    badge: "HOT OFFER",
    pointsAwarded: 200,
    variants: [
      {
        color: "Rojo Carmesí",
        colorHex: "#dc2626",
        sizes: [
          { size: "40", stock: 4 },
          { size: "41", stock: 1 },
          { size: "42", stock: 6 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 4),
    name: "Chaqueta Cortavientos Shield",
    description: "Material hidrofóbico. Te protege de la lluvia y el frío sin sacrificar la transpirabilidad corporal.",
    priceRegular: 210000,
    priceOffer: 210000,
    isOffer: false,
    category: "mujer",
    imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=600&q=80",
    badge: "STOCK LIMITADO",
    pointsAwarded: 95,
    variants: [
      {
        color: "Blanco Titanio",
        colorHex: "#f8fafc",
        sizes: [
          { size: "S", stock: 2 },
          { size: "M", stock: 1 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 5),
    name: "Guantes de Levantamiento Titan",
    description: "Agarre recubierto de silicona y soporte de muñeca integrado. Máxima tracción en barras pesadas.",
    priceRegular: 85000,
    priceOffer: 85000,
    isOffer: false,
    category: "accesorios",
    imageUrl: "https://images.unsplash.com/photo-1579724941910-3843f5f3e944?auto=format&fit=crop&w=600&q=80",
    badge: "",
    pointsAwarded: 25,
    variants: [
      {
        color: "Negro",
        colorHex: "#000000",
        sizes: [
          { size: "M", stock: 20 },
          { size: "L", stock: 14 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 6),
    name: "Shorts WZ-Combat",
    description: "Diseñados para movilidad extrema. Ideales para CrossFit o MMA. Costuras reforzadas.",
    priceRegular: 110000,
    priceOffer: 88000,
    isOffer: true,
    category: "hombre",
    imageUrl: "https://images.unsplash.com/photo-1510414696678-2415ad8474aa?auto=format&fit=crop&w=600&q=80",
    badge: "HOT OFFER",
    pointsAwarded: 40,
    variants: [
      {
        color: "Verde Militar",
        colorHex: "#4d7c0f",
        sizes: [
          { size: "S", stock: 8 },
          { size: "M", stock: 10 },
          { size: "L", stock: 2 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 7),
    name: "Top Deportivo High-Impact",
    description: "Sujeción extrema para entrenamientos de alto impacto. Banda inferior de doble ajuste.",
    priceRegular: 95000,
    priceOffer: 95000,
    isOffer: false,
    category: "mujer",
    imageUrl: "https://images.unsplash.com/photo-1571945153237-4929e783af4a?auto=format&fit=crop&w=600&q=80",
    badge: "TOP VENTAS",
    pointsAwarded: 35,
    variants: [
      {
        color: "Rosa Neón",
        colorHex: "#db2777",
        sizes: [
          { size: "S", stock: 3 },
          { size: "M", stock: 0 },
          { size: "L", stock: 6 }
        ]
      }
    ]
  },
  {
    id: "wz-uuid-str-" + (Date.now() + 8),
    name: "Mochila Táctica WZ-50L",
    description: "Capacidad para 50 litros, compartimentos para portátil, calzado sucio y batidor de proteínas. Tejido balístico.",
    priceRegular: 280000,
    priceOffer: 250000,
    isOffer: true,
    category: "accesorios",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80",
    badge: "NUEVO",
    pointsAwarded: 110,
    variants: [
      {
        color: "Camuflaje Urbano",
        colorHex: "#1f2937",
        sizes: [
          { size: "ÚNICA", stock: 5 }
        ]
      }
    ]
  }
];