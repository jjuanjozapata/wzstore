// Configuración del cliente Supabase
const SUPABASE_URL = "https://bthyaqpmvtyncnsbrouv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nsKtTkdnxMV2C0OUJbYhrw_xYR_7Am9";
const wzClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Sanitización XSS Central
// Sanitizador contra Vector XSS por codificación de entidades completas
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').trim();
};

const decodeHtml = (str) => typeof str !== 'string' ? '' : str.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const SAFE_MEDIA_FALLBACK = "https://images.unsplash.com/photo-1581636625402-29f2a01222ce";

const sanitizeMediaUrl = (url) => {
  if (typeof url !== "string") return SAFE_MEDIA_FALLBACK;
  const trimmed = url.trim();
  if (!trimmed) return SAFE_MEDIA_FALLBACK;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch (_) {
    return SAFE_MEDIA_FALLBACK;
  }
  if (
    decoded.includes('"') ||
    decoded.includes("'") ||
    decoded.includes("<") ||
    decoded.includes(">") ||
    /javascript:/i.test(decoded) ||
    /data:image\/svg/i.test(trimmed)
  ) {
    return SAFE_MEDIA_FALLBACK;
  }
  const allowedPrefixes = [
    "https://",
    "http://",
    "./",
    "data:image/jpeg;",
    "data:image/png;",
    "data:image/webp;"
  ];
  const hasValidPrefix = allowedPrefixes.some((prefix) => trimmed.startsWith(prefix));
  return hasValidPrefix ? trimmed : SAFE_MEDIA_FALLBACK;
};
window.sanitizeMediaUrl = sanitizeMediaUrl;

let products = [];
let cart = [];
let uiState = {}; // Guarda estado del selector de color/talla por producto


// Estado inicial de filtros normalizado sin bloqueos de género
let currentFilter = {
  text: '',
  category: 'all',
  gender: 'todas', // 'todas' no bloquea prendas al arrancar
  size: 'all',
  sport: 'all',
  onlyOffers: false,
  sortBy: 'default',
  maxPrice: Infinity
};

// Navegación en cascada: despliega obligatoriamente la selección de género antes del render
window.handleParentCategory = (categoryName) => {
  currentFilter.category = categoryName;

  // Actualizar clases activas en la botonera de categorías
  const catPills = document.querySelectorAll(".cat-pill");
  catPills.forEach((btn) => {
    btn.className = "cat-pill bg-slate-800 text-slate-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all";
  });

  const activeBtn = Array.from(catPills).find((btn) => {
    const btnText = btn.textContent.trim().toLowerCase();
    const targetText = categoryName === "all" ? "todos" : categoryName.toLowerCase();
    return btnText === targetText;
  });

  if (activeBtn) {
    activeBtn.className = "cat-pill bg-emerald-500 text-black px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all";
  }

  // Control estricto de visibilidad del panel de género
  const genderContainer = document.getElementById("gender-discriminator");
  if (genderContainer) {
    if (categoryName === "all" || categoryName.toLowerCase() === "accesorios") {
      genderContainer.classList.add("hidden");
      genderContainer.classList.remove("flex");
      currentFilter.gender = "todas";
      executeMasterFilters();
    } else {
      // Desplegar el selector de género para que el usuario defina o confirme la vista
      genderContainer.classList.remove("hidden");
      genderContainer.classList.add("flex");
      window.applyGenderFilter(currentFilter.gender || "todas", true);
    }
  } else {
    executeMasterFilters();
  }
};

// Sincronización del filtro de género con actualización de estilos visuales
window.applyGenderFilter = (genderValue, shouldExecute = true) => {
  currentFilter.gender = (genderValue || "todas").toLowerCase();

  // Limpiar estilos de botones de género
  document.querySelectorAll(".gender-pill").forEach((btn) => {
    btn.className = "gender-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors";
  });

  // Activar botón seleccionado
  const activeGenderBtn = document.getElementById(`gender-btn-${currentFilter.gender}`);
  if (activeGenderBtn) {
    activeGenderBtn.className = "gender-pill px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-black transition-colors";
  }

  if (shouldExecute) {
    executeMasterFilters();
  }
};

// Motor centralizado de filtrado tolerante y reactivo
const executeMasterFilters = () => {
  if (!Array.isArray(products) || products.length === 0) {
    renderCatalog([]);
    return;
  }

  let result = [...products];

  // 1. Filtro de búsqueda por texto
  if (currentFilter.text && currentFilter.text.trim() !== '') {
    const term = currentFilter.text.trim().toLowerCase();
    result = result.filter((p) => p.name && p.name.toLowerCase().includes(term));
  }

  // 2. Filtro de categoría y subcategoría
  if (currentFilter.category && currentFilter.category !== 'all') {
    const filterCat = currentFilter.category.toLowerCase();
    result = result.filter((p) => {
      const catMatch = p.category && p.category.toLowerCase() === filterCat;
      const subMatch = p.subCategory && p.subCategory.toLowerCase() === filterCat;
      const nameMatch = p.name && p.name.toLowerCase().includes(filterCat);
      return catMatch || subMatch || nameMatch;
    });
  }

  // 3. Filtro de género (solo se aplica si es 'hombre' o 'mujer')
  if (currentFilter.gender && currentFilter.gender !== 'todas' && currentFilter.gender !== 'ambos') {
    const targetGender = currentFilter.gender.toLowerCase();
    result = result.filter((p) => {
      const pGender = (p.gender || p.category || '').toLowerCase();
      return pGender.includes(targetGender);
    });
  }

  // 4. Filtro de precio tope
  if (currentFilter.maxPrice !== Infinity && !isNaN(currentFilter.maxPrice)) {
    result = result.filter((p) => {
      const price = p.isOffer ? p.priceOffer : p.priceRegular;
      return price <= currentFilter.maxPrice;
    });
  }

  renderCatalog(result);
};

// Capa de persistencia resiliente compatible con Safari Private Browsing y cuotas bloqueadas
const memoryFallbackStore = {};

const safeStorage = {
  getItem: (key) => {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : (memoryFallbackStore[key] || null);
    } catch (e) {
      return memoryFallbackStore[key] || null;
    }
  },
  setItem: (key, value) => {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
      memoryFallbackStore[key] = String(value);
    } catch (e) {
      memoryFallbackStore[key] = String(value);
    }
  },
  removeItem: (key) => {
    try {
      if (window.localStorage) window.localStorage.removeItem(key);
      delete memoryFallbackStore[key];
    } catch (e) {
      delete memoryFallbackStore[key];
    }
  }
};

// Control de versión para sincronización automática de prendas en teléfonos
const CURRENT_DATA_VER = "2.0";
const WZ_VERSION_DB = CURRENT_DATA_VER;
window.CURRENT_DATA_VER = CURRENT_DATA_VER;
window.WZ_VERSION_DB = CURRENT_DATA_VER;

const getBaseDatabase = () => {
  if (typeof INITIAL_DATABASE !== "undefined" && Array.isArray(INITIAL_DATABASE) && INITIAL_DATABASE.length > 0) {
    return JSON.parse(JSON.stringify(INITIAL_DATABASE));
  }
  return [];
};

const syncDatabaseVersion = () => {
  try {
    const localVersion = (window.localStorage ? (window.localStorage.getItem("wz_data_ver") || window.localStorage.getItem("wz_version_db")) : null) || safeStorage.getItem("wz_data_ver") || safeStorage.getItem("wz_version_db");
    if (!localVersion || localVersion !== CURRENT_DATA_VER) {
      console.info(`[WZSTORE] Versión de datos actualizada a ${CURRENT_DATA_VER}. Limpiando caché obsoleta...`);
      safeStorage.removeItem("wz_products");
      safeStorage.removeItem("wz_core_products");
      if (window.localStorage) {
        window.localStorage.removeItem("wz_products");
        window.localStorage.removeItem("wz_core_products");
      }

      const freshData = getBaseDatabase();
      products = freshData;
      safeStorage.setItem("wz_products", JSON.stringify(freshData));
      safeStorage.setItem("wz_core_products", JSON.stringify(freshData));
      safeStorage.setItem("wz_data_ver", CURRENT_DATA_VER);
      safeStorage.setItem("wz_version_db", CURRENT_DATA_VER);
      return true;
    }
  } catch (err) {
    console.warn("[WZSTORE] Error al sincronizar versión DB:", err);
  }
  return false;
};

// Sincronización inmediata al evaluar el script
syncDatabaseVersion();

let productsRealtimeChannel = null;
let realtimeAppDebounceTimer = null;

// Carga centralizada de productos desde Supabase con respaldo offline
const loadProducts = async () => {
  let loadedProducts = null;

  // 1. Consulta prioritaria a la tabla 'productos' de Supabase para catálogo fresco multi-dispositivo
  if (wzClient) {
    try {
      const { data, error } = await wzClient.from('productos').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        loadedProducts = data.map((row) => {
          let parsedVariants = row.variants;
          if (typeof parsedVariants === "string") {
            try {
              parsedVariants = JSON.parse(parsedVariants);
            } catch (e) {
              parsedVariants = [];
            }
          }
          return {
            ...row,
            priceRegular: Number(row.price_regular ?? row.priceRegular ?? 0),
            priceOffer: Number(row.price_offer ?? row.priceOffer ?? 0),
            subCategory: row.sub_category ?? row.subCategory ?? "",
            isOffer: Boolean(row.is_offer ?? row.isOffer),
            isFeatured: Boolean(row.is_featured ?? row.isFeatured),
            isAvailable: Boolean(row.is_available ?? row.isAvailable ?? true),
            imageUrl: row.image_url ?? row.imageUrl,
            variants: Array.isArray(parsedVariants) ? parsedVariants : (row.variants || []),
            status: row.status ?? ((row.is_available === false || row.isAvailable === false) ? "agotado" : "activo")
          };
        });
        // Mantener localStorage únicamente como respaldo offline
        safeStorage.setItem("wz_core_products", JSON.stringify(loadedProducts));
        safeStorage.removeItem("wz_products");
      } else if (error) {
        console.warn("[WZSTORE] Error consultando 'productos' en Supabase:", error);
      }
    } catch (err) {
      console.warn("[WZSTORE] Fallo de conexión con Supabase:", err);
    }
  }

  // 2. Respaldo offline si no se obtuvieron datos desde Supabase
  if (!loadedProducts || loadedProducts.length === 0) {
    syncDatabaseVersion();
    const rawProducts = safeStorage.getItem("wz_core_products") || safeStorage.getItem("wz_products");
    if (rawProducts) {
      try {
        const parsed = JSON.parse(rawProducts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedProducts = parsed;
          safeStorage.removeItem("wz_products");
        }
      } catch (e) {
        console.warn("[WZSTORE] Error parseando productos de caché local:", e);
      }
    }
  }

  // 3. Fallback inicial si la caché está vacía
  if (!loadedProducts || loadedProducts.length === 0) {
    loadedProducts = getBaseDatabase();
    safeStorage.setItem("wz_core_products", JSON.stringify(loadedProducts));
    safeStorage.removeItem("wz_products");
    safeStorage.setItem("wz_data_ver", CURRENT_DATA_VER);
    safeStorage.setItem("wz_version_db", CURRENT_DATA_VER);
  }

  products = loadedProducts;

  if (!uiState) uiState = {};
  products.forEach((p) => {
    if (!uiState[p.id]) {
      uiState[p.id] = { colorIdx: 0, sizeIdx: null };
    }
  });

  return products;
};

// Autocompletado reactivo de datos de despacho desde almacenamiento seguro
const autofillCheckoutData = () => {
  const savedProfile = safeStorage.getItem("wz_customer_profile");
  if (!savedProfile) return;

  try {
    const profile = JSON.parse(savedProfile);
    if (!profile || typeof profile !== "object") return;

    const fields = [
      "chk-firstname",
      "chk-lastname",
      "chk-phone",
      "chk-city",
      "chk-postal",
      "chk-addr",
      "chk-extra-addr",
      "chk-payment-method"
    ];

    fields.forEach((fieldId) => {
      const input = document.getElementById(fieldId);
      if (input && profile[fieldId] !== undefined && profile[fieldId] !== null) {
        input.value = profile[fieldId];
      }
    });
  } catch (e) {
    console.error("Error al autorellenar datos de despacho:", e);
  }
};
window.autofillCheckoutData = autofillCheckoutData;

// Inicialización blindada con consulta prioritaria a Supabase y respaldo offline
const initApp = async () => {
  await loadProducts();

  // Cargar estado del carrito protegiendo integridad de tipos
  const storedCart = safeStorage.getItem("wz_cart");
  if (storedCart) {
    try {
      const parsedCart = JSON.parse(storedCart);
      cart = Array.isArray(parsedCart) ? parsedCart : [];
    } catch (e) {
      cart = [];
    }
  } else {
    cart = [];
  }

  // Inicializar estado UI para selección de color y talla
  uiState = {};
  products.forEach((p) => {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  });

  if (typeof renderFeaturedHero === "function") {
    renderFeaturedHero();
  }

  currentFilter.category = 'all';
  currentFilter.gender = 'todas';
  executeMasterFilters();
  autofillCheckoutData();
  updateCartUI();

  // Inicializar canal Realtime de Supabase para actualización reactiva del catálogo y hero
  if (wzClient && !productsRealtimeChannel) {
    productsRealtimeChannel = wzClient
      .channel('public:productos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        () => {
          if (realtimeAppDebounceTimer) clearTimeout(realtimeAppDebounceTimer);
          realtimeAppDebounceTimer = setTimeout(async () => {
            await loadProducts();
            if (typeof renderFeaturedHero === "function") {
              renderFeaturedHero();
            }
            if (typeof executeMasterFilters === "function") {
              executeMasterFilters();
            } else if (typeof renderCatalog === "function") {
              renderCatalog();
            }

            // Rutina de reconciliación de inventario en carrito activo
            if (Array.isArray(cart) && cart.length > 0) {
              let cartModified = false;
              const updatedCart = [];

              for (const item of cart) {
                const p = products.find((prod) => String(prod.id) === String(item.id));
                const isProductOutOfStock = !p || p.status === "agotado" || p.isAvailable === false || p.is_available === false;

                if (isProductOutOfStock) {
                  cartModified = true;
                  continue;
                }

                let variants = p.variants;
                if (typeof variants === "string") {
                  try {
                    variants = JSON.parse(variants);
                  } catch (e) {
                    variants = [];
                  }
                }
                const variantsList = Array.isArray(variants) ? variants : [];
                const cleanColor = String(item.color || "").trim().toLowerCase();
                const matchedVariant = variantsList.find(
                  (v) => v.color && v.color.trim().toLowerCase() === cleanColor
                ) || variantsList[0];

                const cleanSize = String(item.size || "").trim().toUpperCase();
                const matchedSizeObj = matchedVariant?.sizes?.find(
                  (s) => String(s.size || "").trim().toUpperCase() === cleanSize
                );

                let availableStock = matchedSizeObj ? Number(matchedSizeObj.stock) || 0 : 0;
                if (!matchedSizeObj && typeof p.stock === "number") {
                  availableStock = p.stock;
                }

                if (availableStock <= 0) {
                  cartModified = true;
                } else if (item.qty > availableStock) {
                  item.qty = availableStock;
                  item.maxStock = availableStock;
                  updatedCart.push(item);
                  cartModified = true;
                } else {
                  item.maxStock = availableStock;
                  updatedCart.push(item);
                }
              }

              if (cartModified) {
                cart = updatedCart;
                saveCart();
                updateCartUI();
                if (typeof showStoreModal === "function") {
                  showStoreModal("Actualizamos tu carrito debido a cambios recientes de inventario.", "Inventario Actualizado");
                } else if (typeof window.showStoreModal === "function") {
                  window.showStoreModal("Actualizamos tu carrito debido a cambios recientes de inventario.", "Inventario Actualizado");
                }
              }
            }
          }, 350);
        }
      )
      .subscribe();
  }

  checkAbandonedCartReminder();
};

// Enlace de compatibilidad con renderizado directo
window.renderFilteredCatalog = (customList) => renderCatalog(customList);

// Variables de Envío y Cupones
let appliedCoupon = null; // 'WZ2026' | 'FREEATHLETE'
let shippingType = "local"; // 'local' | 'nacional'
const SHIP_RATES = { local: 10000, nacional: 30000 };

// 1. Fallback visual universal en onerror para etiquetas <img> sin SVG roto
window.handleImageError = (imgEl) => {
  if (!imgEl) return;
  imgEl.onerror = null;

  const parent = imgEl.parentElement;
  if (!parent) return;

  const skeleton = parent.querySelector(".skeleton-placeholder");
  if (skeleton) skeleton.remove();

  if (parent.querySelector(".wz-img-fallback") || imgEl.dataset.hasFallback === "true") return;
  imgEl.dataset.hasFallback = "true";

  const isThumb = imgEl.classList.contains("w-16") || imgEl.classList.contains("w-10");

  const fallback = document.createElement("div");
  if (isThumb) {
    fallback.className = "wz-img-fallback w-16 h-16 rounded bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 flex-shrink-0 select-none shadow-inner";
    fallback.innerHTML = `
      <svg class="w-6 h-6 text-emerald-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span class="text-[8px] font-black tracking-wider text-slate-400 mt-0.5">WZ</span>
    `;
    imgEl.replaceWith(fallback);
  } else {
    fallback.className = "wz-img-fallback absolute inset-0 w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-[#080b11] flex flex-col items-center justify-center text-slate-400 p-4 text-center select-none z-10 border border-slate-800/80";
    fallback.innerHTML = `
      <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-2 shadow-inner">
        <svg class="w-6 h-6 stroke-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <span class="text-xs font-black tracking-widest uppercase text-white">WZ<span class="text-emerald-400">STORE</span></span>
      <span class="text-[10px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">Foto en actualización</span>
    `;
    imgEl.classList.add("hidden");
    parent.appendChild(fallback);
  }
};

// 2. Modal Centrado con Backdrop-Blur para reemplazar alert() nativos
window.showStoreModal = (mensaje, titulo = "WZSTORE") => {
  let modal = document.getElementById("wz-store-modal") || document.getElementById("wz-alert-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "wz-store-modal";
    modal.className = "fixed inset-0 z-50 hidden items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-all duration-200";
    modal.innerHTML = `
      <div class="bg-[#111726] border border-[#1e293b] rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl relative transform transition-all">
        <button
          type="button"
          id="wz-store-modal-close"
          data-action="close-store-modal"
          onclick="window.closeStoreModal()"
          class="absolute top-4 right-4 text-slate-400 hover:text-white text-xl font-bold w-8 h-8 rounded-full hover:bg-slate-800 flex items-center justify-center transition-colors"
          aria-label="Cerrar modal"
        >&times;</button>
        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center font-black text-sm tracking-wider mb-3 shadow-inner">WZ</div>
        <h3 id="wz-store-modal-title" class="text-base font-bold text-white mb-2 uppercase tracking-wide">WZSTORE</h3>
        <p id="wz-store-modal-body" class="text-xs text-slate-300 mb-6 leading-relaxed whitespace-pre-line"></p>
        <button
          type="button"
          data-action="close-store-modal"
          onclick="window.closeStoreModal()"
          class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
        >Entendido</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.closeStoreModal();
    });
  }

  const titleEl = modal.querySelector("#wz-store-modal-title") || modal.querySelector("#wz-alert-title");
  const bodyEl = modal.querySelector("#wz-store-modal-body") || modal.querySelector("#wz-alert-body");
  if (titleEl) titleEl.textContent = titulo;
  if (bodyEl) bodyEl.textContent = String(mensaje || "");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
};

const closeStoreModal = () => {
  const modal = document.getElementById("wz-store-modal") || document.getElementById("wz-alert-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
};
window.closeStoreModal = closeStoreModal;

// Reemplazo transparente de alert() nativo
window.alert = (msg) => window.showStoreModal(msg);
window.showNotificationModal = (title, message) => window.showStoreModal(message, title);
window.closeNotificationModal = () => window.closeStoreModal();

// 3. Hover en tarjetas y Toque Táctil Mobile (Ciclado secuencial de fotos)
window.swapProductImage = (container, forceSecond = null) => {
  if (!container) return;
  const img = container.querySelector("img");
  if (!img) return;

  const prodId = container.dataset.productId || container.getAttribute("data-id");
  const prod = (typeof products !== "undefined" && Array.isArray(products))
    ? products.find((p) => String(p.id) === String(prodId))
    : null;

  const prodImgs = (prod?.media?.images && prod.media.images.length > 0)
    ? prod.media.images
    : (Array.isArray(prod?.imagenes) && prod.imagenes.length > 0
        ? prod.imagenes
        : (Array.isArray(prod?.images) && prod.images.length > 0
            ? prod.images
            : (prod?.imageUrl ? [prod.imageUrl] : [])));

  if (!prodImgs || prodImgs.length <= 1) return;

  let currentIdx = parseInt(img.dataset.imageIndex, 10);
  if (isNaN(currentIdx)) {
    currentIdx = (img.dataset.currentView === "back") ? 1 : 0;
  }

  if (forceSecond === true) {
    if (currentIdx !== 1 && prodImgs.length > 1) {
      img.src = prodImgs[1];
      img.dataset.imageIndex = "1";
      img.dataset.currentView = "back";
    }
  } else if (forceSecond === false) {
    if (currentIdx !== 0) {
      img.src = prodImgs[0];
      img.dataset.imageIndex = "0";
      img.dataset.currentView = "front";
    }
  } else {
    // Clics sucesivos o toque móvil: ciclar secuencialmente (0 -> 1 -> 2 -> 0)
    const nextIdx = (currentIdx + 1) % prodImgs.length;
    img.src = prodImgs[nextIdx];
    img.dataset.imageIndex = String(nextIdx);
    img.dataset.currentView = (nextIdx === 0) ? "front" : "back";
  }
};

window.handleCardMouseEnter = (container, prodId) => {
  window.swapProductImage(container, true);
  if (typeof window.playProductVideo === "function") {
    window.playProductVideo(container, prodId);
  }
};

window.handleCardMouseLeave = (container, prodId) => {
  window.swapProductImage(container, false);
  if (typeof window.stopProductVideo === "function") {
    window.stopProductVideo(container, prodId);
  }
};

// Delegación capture para mouseenter y mouseleave en tarjetas
document.addEventListener("mouseenter", (e) => {
  const container = e.target.closest?.(".product-media-container");
  if (container) {
    window.swapProductImage(container, true);
  }
}, true);

document.addEventListener("mouseleave", (e) => {
  const container = e.target.closest?.(".product-media-container");
  if (container) {
    window.swapProductImage(container, false);
  }
}, true);

// Soporte táctil móvil y clics sucesivos para ciclar fotos
let lastTouchToggleTime = 0;
document.addEventListener("touchstart", (e) => {
  const container = e.target.closest(".product-media-container");
  if (container) {
    lastTouchToggleTime = Date.now();
  }
}, { passive: true });

document.addEventListener("touchend", (e) => {
  const container = e.target.closest(".product-media-container");
  if (container && !e.target.closest("button")) {
    if (Date.now() - lastTouchToggleTime < 400) {
      window.swapProductImage(container, null);
    }
  }
}, { passive: true });

document.addEventListener("click", (e) => {
  const container = e.target.closest(".product-media-container");
  if (container && !e.target.closest("button")) {
    if (Date.now() - lastTouchToggleTime > 500) {
      window.swapProductImage(container, null);
    }
  }
});

// 4. Delegación Global de Eventos en document para evitar congelamiento de botones
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target) return;

  const supportBtn = target.closest("#wz-support-btn");
  if (supportBtn) {
    e.preventDefault();
    window.openSupportChat();
    return;
  }

  // Cierre del panel inferior Bottom Sheet de tallas
  if (target.id === "wz-size-sheet-overlay" || target.closest("#wz-close-sheet-btn")) {
    e.preventDefault();
    if (typeof window.closeSizeBottomSheet === "function") {
      window.closeSizeBottomSheet();
    }
    return;
  }

  // 1. Añadir al carrito desde tarjeta de catálogo
  const addBtn = target.closest("[data-action='add-to-cart'], button[onclick*='addToCart']");
  if (addBtn) {
    e.preventDefault();
    let pId = addBtn.dataset.productId;
    if (!pId) {
      const match = (addBtn.getAttribute("onclick") || "").match(/addToCart\(['"]([^'"]+)['"]\)/);
      if (match) pId = match[1];
    }
    if (pId && typeof window.addToCart === "function") {
      window.addToCart(pId);
    }
    return;
  }

  // 1.1 Compra directa (Comprar Ya)
  const buyNowBtn = target.closest("[data-action='buy-now']");
  if (buyNowBtn) {
    e.preventDefault();
    const pId = buyNowBtn.dataset.productId;
    if (pId && typeof window.executeBuyNow === "function") {
      window.executeBuyNow(pId);
    }
    return;
  }

  // 2. Botón de compra en Hero Showcase
  const heroBuyBtn = target.closest("#wz-hero-buy-btn, [data-action='hero-buy']");
  if (heroBuyBtn) {
    e.preventDefault();
    const featured = products.find((p) => p.isFeatured && p.status !== "agotado") || products.find((p) => p.media?.video && p.status !== "agotado");
    if (heroSelectedSizeIdx === null || heroSelectedSizeIdx === -1) {
      if (featured) {
        openSizeBottomSheet(featured.id, 'add');
      }
      return;
    }
    if (featured) {
      uiState[featured.id] = { colorIdx: 0, sizeIdx: heroSelectedSizeIdx };
      window.addToCart(featured.id);
    }
    return;
  }

  // 3. Abrir / Alternar Carrito
  const openCartBtn = target.closest("#cart-btn, [data-action='open-cart'], [data-action='toggle-cart']");
  if (openCartBtn) {
    e.preventDefault();
    const drawer = document.getElementById("drawer-cart");
    if (drawer && drawer.classList.contains("open")) {
      window.closeDrawer();
    } else {
      window.openDrawer();
    }
    return;
  }

  // 3.1 Botón Sticky Mobile CTA
  const stickyCtaBtn = target.closest("#wz-sticky-cta");
  if (stickyCtaBtn) {
    e.preventDefault();
    const action = stickyCtaBtn.dataset.action || stickyCtaBtn.getAttribute("data-action");
    if (action === "open-checkout") {
      document.getElementById("modal-checkout")?.classList.add("active");
      if (typeof startCheckoutTimer === "function") startCheckoutTimer();
      if (typeof closeDrawer === "function") closeDrawer();
    } else if (action === "scroll-catalog") {
      document.getElementById("catalog-grid")?.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }

  // 4. Cerrar Carrito
  const closeCartBtn = target.closest("#close-drawer, #drawer-overlay, [data-action='close-cart']");
  if (closeCartBtn) {
    e.preventDefault();
    window.closeDrawer();
    return;
  }

  // 5. Eliminar item del carrito
  const removeBtn = target.closest("[data-action='remove-cart-item'], button[onclick*='removeCartItem']");
  if (removeBtn) {
    e.preventDefault();
    let idx = removeBtn.dataset.index;
    if (idx === undefined) {
      const match = (removeBtn.getAttribute("onclick") || "").match(/removeCartItem\((\d+)\)/);
      if (match) idx = match[1];
    }
    if (idx !== undefined) {
      window.removeCartItem(parseInt(idx, 10));
    }
    return;
  }

  // 5.1 Incrementar cantidad en carrito
  const increaseBtn = target.closest("[data-action='cart-increase']");
  if (increaseBtn) {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(15);
    const idx = parseInt(increaseBtn.dataset.index, 10);
    if (!isNaN(idx) && cart[idx]) {
      const item = cart[idx];
      const max = item.maxStock || 10;
      if (item.qty < max) {
        item.qty++;
        saveCart();
        updateCartUI();
      } else {
        window.showStoreModal("Has alcanzado el límite de existencias disponibles para esta prenda.", "Límite de Stock");
      }
    }
    return;
  }

  // 5.2 Decrementar cantidad en carrito
  const decreaseBtn = target.closest("[data-action='cart-decrease']");
  if (decreaseBtn) {
    e.preventDefault();
    if (navigator.vibrate) navigator.vibrate(15);
    const idx = parseInt(decreaseBtn.dataset.index, 10);
    if (!isNaN(idx) && cart[idx]) {
      const item = cart[idx];
      item.qty--;
      if (item.qty <= 0) {
        removeCartItem(idx);
      } else {
        saveCart();
        updateCartUI();
      }
    }
    return;
  }

  // 6. Abrir Modal Checkout
  const checkoutBtn = target.closest("#checkout-btn, [data-action='open-checkout']");
  if (checkoutBtn) {
    e.preventDefault();
    if (!cart || cart.length === 0) {
      window.showStoreModal("Tu carrito está vacío. Agrega una prenda antes de proceder.", "Carrito Vacío");
      return;
    }
    document.getElementById("modal-checkout")?.classList.add("active");
    if (typeof startCheckoutTimer === "function") startCheckoutTimer();
    window.closeDrawer();
    return;
  }

  // 7. Cerrar Checkout
  const closeCheckoutBtn = target.closest("#close-modal, [data-action='close-checkout']");
  if (closeCheckoutBtn || target.id === "modal-checkout") {
    e.preventDefault();
    stopCheckoutTimer();
    document.getElementById("modal-checkout")?.classList.remove("active");
    return;
  }

  // 8. Confirmar pedido por WhatsApp (Final Buy)
  const finalBuyBtn = target.closest("#final-buy-btn, [data-action='checkout-final']");
  if (finalBuyBtn) {
    e.preventDefault();
    processCheckout();
    stopCheckoutTimer();
    return;
  }

  // 9. Aplicar cupón
  const applyCouponBtn = target.closest("#apply-coupon, [data-action='apply-coupon']");
  if (applyCouponBtn) {
    e.preventDefault();
    applyCouponLogic();
    return;
  }

  // 10. Guardar carrito
  const saveCartBtn = target.closest("#btn-save-cart, [data-action='save-cart']");
  if (saveCartBtn) {
    e.preventDefault();
    saveCart();
    window.showStoreModal("El contenido de tu compra quedó guardado de forma segura en este navegador.", "Carrito Guardado");
    return;
  }

  // 11. Compartir carrito
  const shareCartBtn = target.closest("#btn-share-cart, [data-action='share-cart']");
  if (shareCartBtn) {
    e.preventDefault();
    shareCartUrl();
    return;
  }

  // 12. Filtros de categoría principal
  const catBtn = target.closest("[data-action='filter-category'], .cat-pill, button[onclick*='handleParentCategory']");
  if (catBtn) {
    e.preventDefault();
    let cat = catBtn.dataset.category;
    if (!cat) {
      const match = (catBtn.getAttribute("onclick") || "").match(/handleParentCategory\(['"]([^'"]+)['"]\)/);
      if (match) cat = match[1];
      else cat = catBtn.textContent.trim();
    }
    if (cat) window.handleParentCategory(cat);
    return;
  }

  // 13. Filtros de género
  const genderBtn = target.closest("[data-action='filter-gender'], .gender-pill, button[onclick*='applyGenderFilter']");
  if (genderBtn) {
    e.preventDefault();
    let gen = genderBtn.dataset.gender;
    if (!gen) {
      const match = (genderBtn.getAttribute("onclick") || "").match(/applyGenderFilter\(['"]([^'"]+)['"]\)/);
      if (match) gen = match[1];
      else gen = genderBtn.textContent.trim().toLowerCase();
    }
    if (gen) window.applyGenderFilter(gen);
    return;
  }

  // Selección de color en tarjeta
  const colorBtn = target.closest("[data-action='select-color']");
  if (colorBtn) {
    e.preventDefault();
    const productId = colorBtn.dataset.productId;
    const colorIndex = colorBtn.dataset.colorIndex;
    if (productId && colorIndex !== undefined) {
      window.selectColor(productId, parseInt(colorIndex, 10));
      if (navigator.vibrate) navigator.vibrate(12);
    }
    return;
  }

  // 14. Selección de talla en tarjeta
  const sizeBtn = target.closest("[data-action='select-size'], button[onclick*='selectSize']");
  if (sizeBtn) {
    e.preventDefault();
    let pId = sizeBtn.dataset.productId;
    let sIdx = sizeBtn.dataset.sizeIndex;
    if (!pId || sIdx === undefined) {
      const match = (sizeBtn.getAttribute("onclick") || "").match(/selectSize\(['"]([^'"]+)['"]\s*,\s*(\d+)\)/);
      if (match) {
        pId = match[1];
        sIdx = match[2];
      }
    }
    if (pId && sIdx !== undefined) {
      window.selectSize(pId, parseInt(sIdx, 10));
    }
    return;
  }

  // 15. Selección de talla en Hero
  const heroSizeBtn = target.closest("[data-action='select-hero-size'], button[onclick*='selectHeroSize']");
  if (heroSizeBtn) {
    e.preventDefault();
    let sIdx = heroSizeBtn.dataset.sizeIndex;
    if (sIdx === undefined) {
      const match = (heroSizeBtn.getAttribute("onclick") || "").match(/selectHeroSize\((\d+)\)/);
      if (match) sIdx = match[1];
    }
    if (sIdx !== undefined) {
      window.selectHeroSize(parseInt(sIdx, 10));
    }
    return;
  }

  // 16. Calculadora de talla
  const calcBtn = target.closest("[data-action='calc-size'], button[onclick*='calculateRecommendedSize']");
  if (calcBtn) {
    e.preventDefault();
    calculateRecommendedSize();
    return;
  }

  // 17. Botón cerrar modal de tienda
  const closeModalBtn = target.closest("[data-action='close-store-modal'], #wz-store-modal-close");
  if (closeModalBtn) {
    e.preventDefault();
    window.closeStoreModal();
    return;
  }

  // 18. Asesoría de producto y fit por WhatsApp
  const askBtn = target.closest("[data-action='ask-product']");
  if (askBtn) {
    e.preventDefault();
    const pId = askBtn.dataset.productId;
    const prod = products.find((x) => String(x.id) === String(pId));
    if (prod) {
      const state = uiState[prod.id];
      const variant = prod.variants?.[state?.colorIdx || 0] || prod.variants?.[0];
      const selectedSize = (state?.sizeIdx !== null && state?.sizeIdx !== undefined) ? variant?.sizes?.[state.sizeIdx]?.size : null;
      const sizeText = selectedSize ? ` (Talla: ${selectedSize})` : "";
      window.openSupportChat("Quiero asesoría sobre la prenda " + prod.name + sizeText);
    }
    return;
  }
});

// Motor de Prueba Social en Tiempo Real (Social Proof Engine)
const initSocialProofEngine = () => {
  const toast = document.getElementById("wz-social-toast");
  if (!toast) return;

  const cities = [
    "Bogotá",
    "Medellín",
    "Cali",
    "Barranquilla",
    "Bucaramanga",
    "Pereira",
    "Cartagena",
    "Cúcuta"
  ];

  const triggerToast = () => {
    // Filtrar catálogo activo (productos no agotados y disponibles para venta)
    const activeProducts = (Array.isArray(products) && products.length > 0)
      ? products.filter((p) => {
          if (p.status === "agotado" || p.isAvailable === false || p.is_available === false) return false;
          let stock = 0;
          p.variants?.forEach((v) => {
            v.sizes?.forEach((s) => (stock += Number(s.stock) || 0));
          });
          return stock > 0 || typeof p.stock !== "undefined";
        })
      : [];

    const availablePool = activeProducts.length > 0 ? activeProducts : (Array.isArray(products) ? products : []);
    if (availablePool.length === 0) return;

    const randomProduct = availablePool[Math.floor(Math.random() * availablePool.length)];
    const randomCity = cities[Math.floor(Math.random() * cities.length)];

    const prodImages = (randomProduct.media?.images && randomProduct.media.images.length > 0)
      ? randomProduct.media.images
      : (Array.isArray(randomProduct.imagenes) && randomProduct.imagenes.length > 0
          ? randomProduct.imagenes
          : (Array.isArray(randomProduct.images) && randomProduct.images.length > 0
              ? randomProduct.images
              : (randomProduct.imageUrl ? [randomProduct.imageUrl] : [])));
    const prodImg = prodImages[0] || randomProduct.imageUrl || '';

    const imgHtml = prodImg
      ? `<img src="${sanitizeMediaUrl(prodImg)}" alt="${sanitizeInput(randomProduct.name)}" class="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0" onerror="this.style.display='none'">`
      : `<div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400 font-black text-xs">WZ</div>`;

    toast.innerHTML = `
      ${imgHtml}
      <div class="text-xs leading-snug">
        <p class="text-slate-200 font-medium">Alguien en <span class="font-bold text-white">${randomCity}</span> acaba de ordenar <span class="font-bold text-emerald-400">${sanitizeInput(randomProduct.name)}</span></p>
        <span class="text-[10px] text-slate-400 block mt-0.5">Hace un momento • Compra verificada</span>
      </div>
    `;

    // Deslizar toast a la vista
    toast.classList.remove("-translate-x-full", "opacity-0");
    toast.classList.add("translate-x-0", "opacity-100");

    // Ocultar tras 4.5 segundos
    setTimeout(() => {
      toast.classList.remove("translate-x-0", "opacity-100");
      toast.classList.add("-translate-x-full", "opacity-0");
    }, 4500);
  };

  // Disparar primer aviso inmediatamente al arrancar
  triggerToast();

  // Programar repetición aleatoria cada 25 a 35 segundos
  const scheduleNext = () => {
    const randomDelay = Math.floor(Math.random() * (35000 - 25000 + 1)) + 25000;
    setTimeout(() => {
      triggerToast();
      scheduleNext();
    }, randomDelay);
  };

  scheduleNext();
};
window.initSocialProofEngine = initSocialProofEngine;

// Arrancar al cargar la vista con soporte Sticky Mobile y Media Observers
document.addEventListener("DOMContentLoaded", async () => {
  await initApp();
  recoverCartFromUrl();
  setupEventListeners();
  initMobileVideoObserver();

  // Barra flotante sticky de compra rápida para móviles
  const stickyBar = document.getElementById("wz-sticky-bar");
  const stickyTitle = document.getElementById("wz-sticky-title");
  const stickyPrice = document.getElementById("wz-sticky-price");
  if (stickyBar) {
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          if (currentScrollY > 320) {
            // Obtener el primer producto visible en el viewport
            const cards = document.querySelectorAll(".product-media-container");
            for (const card of cards) {
              const rect = card.getBoundingClientRect();
              if (rect.top >= 0 && rect.top <= 400) {
                const prodTitle = card.parentElement.querySelector("h3")?.innerText;
                const prodPrice = card.parentElement.querySelector("[data-product-price]")?.innerText;
                if (stickyTitle && prodTitle) stickyTitle.textContent = prodTitle;
                if (stickyPrice && prodPrice) stickyPrice.textContent = prodPrice;
                break;
              }
            }
            stickyBar.classList.remove("translate-y-full");
          } else {
            stickyBar.classList.add("translate-y-full");
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // Motor de prueba social en tiempo real iniciado 4 segundos después de DOMContentLoaded
  setTimeout(() => {
    initSocialProofEngine();
  }, 4000);
});

// Detector pasivo de carritos abandonados con cupón de incentivo
const checkAbandonedCartReminder = () => {
  if (!cart || cart.length === 0) return;

  const LAST_ACTIVITY_KEY = "wz_cart_last_activity";
  const REMINDER_SENT_KEY = "wz_cart_reminder_sent";
  const now = Date.now();
  const lastActive = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || now;
  const alreadyNotified = localStorage.getItem(REMINDER_SENT_KEY) === "true";

  // Si pasaron más de 12 horas desde la última interacción y no se ha mostrado
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  if (!alreadyNotified && now - lastActive > TWELVE_HOURS) {
    setTimeout(() => {
      // Pre-aplicar cupón de recuperación
      appliedCoupon = "WZRECUPERA10";
      const couponInput = document.getElementById("coupon-input");
      if (couponInput) couponInput.value = "WZRECUPERA10";
      
      updateCartUI();
      showNotificationModal(
        "¡Tus prendas te están esperando!",
        "Notamos que dejaste artículos en tu equipo. Te obsequiamos un 10% de descuento extra con el código WZRECUPERA10 aplicado automáticamente."
      );
      localStorage.setItem(REMINDER_SENT_KEY, "true");
    }, 1500);
  }
};



const setupEventListeners = () => {
  // Buscador con debounce optimizado a 300ms y sanitización activa
  let debounceTimer = null;
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value;
      debounceTimer = setTimeout(() => {
        currentFilter.text = sanitizeInput(query.trim().toLowerCase());
        executeMasterFilters();
      }, 300);
    });
  }

  // Control seguro del slider de precio (solo si existe en el DOM)
  const priceRangeInput = document.getElementById("price-range");
  if (priceRangeInput) {
    priceRangeInput.addEventListener("input", (e) => {
      currentFilter.maxPrice = parseInt(e.target.value, 10);
      const priceLabel = document.getElementById("price-label");
      if (priceLabel) {
        priceLabel.textContent = `$${currentFilter.maxPrice.toLocaleString()}`;
      }
      executeMasterFilters();
    });
  }

  // Tarifas logísticas
  const shippingSelect = document.getElementById("shipping-select");
  if (shippingSelect) {
    const handleDrawerShippingChange = (e) => {
      shippingType = e.target.value;
      const chkShipping = document.getElementById("chk-shipping-type");
      if (chkShipping) chkShipping.value = shippingType;
      updateCartUI();
    };
    shippingSelect.addEventListener("change", handleDrawerShippingChange);
    shippingSelect.addEventListener("input", handleDrawerShippingChange);
  }

  const chkShippingTypeSelect = document.getElementById("chk-shipping-type");
  if (chkShippingTypeSelect) {
    const handleChkShippingChange = (e) => {
      shippingType = e.target.value;
      const drawerShipping = document.getElementById("shipping-select");
      if (drawerShipping) drawerShipping.value = shippingType;
      updateCartUI();
    };
    chkShippingTypeSelect.addEventListener("change", handleChkShippingChange);
    chkShippingTypeSelect.addEventListener("input", handleChkShippingChange);
  }

  // Listener para actualización inmediata de flete y recargo por método de pago
  const paymentMethodSelect = document.getElementById("chk-payment-method");
  if (paymentMethodSelect) {
    const handlePaymentMethodChange = () => {
      updateCartUI();
    };
    paymentMethodSelect.addEventListener("change", handlePaymentMethodChange);
    paymentMethodSelect.addEventListener("input", handlePaymentMethodChange);
  }

  // Conexión para el cierre del Bottom Sheet de tallas
  const sheetCloseBtn = document.getElementById("wz-close-sheet-btn");
  if (sheetCloseBtn) {
    sheetCloseBtn.addEventListener("click", () => {
      if (typeof window.closeSizeBottomSheet === "function") window.closeSizeBottomSheet();
    });
  }
  const sheetOverlay = document.getElementById("wz-size-sheet-overlay");
  if (sheetOverlay) {
    sheetOverlay.addEventListener("click", () => {
      if (typeof window.closeSizeBottomSheet === "function") window.closeSizeBottomSheet();
    });
  }
};

// Renderizado dinámico del Hero Showcase con selector de tallas integrado
let heroSelectedSizeIdx = null;

const renderFeaturedHero = () => {
  const heroSection = document.getElementById("wz-featured-hero");
  if (!heroSection) return;

  const featured = products.find((p) => p.isFeatured && p.status !== "agotado") || products.find((p) => p.media?.video && p.status !== "agotado");

  if (!featured) {
    heroSection.classList.add("hidden");
    return;
  }

  const titleEl = document.getElementById("wz-hero-title");
  const descEl = document.getElementById("wz-hero-desc");
  const priceEl = document.getElementById("wz-hero-price");
  const oldPriceEl = document.getElementById("wz-hero-old-price");
  const discBadgeEl = document.getElementById("wz-hero-discount-badge");
  const videoEl = document.getElementById("wz-hero-video");
  const galleryEl = document.getElementById("wz-hero-gallery-container");
  const imgFallback = document.getElementById("wz-hero-image-fallback");
  const sizesContainer = document.getElementById("wz-hero-sizes-container");
  const buyBtn = document.getElementById("wz-hero-buy-btn");

  const finalPrice = featured.isOffer ? featured.priceOffer : featured.priceRegular;

  if (titleEl) titleEl.textContent = featured.name;
  if (descEl) descEl.textContent = featured.description;
  if (priceEl) priceEl.textContent = `$${finalPrice.toLocaleString("es-CO")} COP`;

  // Control visual de precios de descuento
  if (featured.isOffer && featured.priceRegular > featured.priceOffer) {
    const discountPct = Math.round((1 - featured.priceOffer / featured.priceRegular) * 100);
    if (oldPriceEl) {
      oldPriceEl.textContent = `$${featured.priceRegular.toLocaleString("es-CO")} COP`;
      oldPriceEl.classList.remove("hidden");
    }
    if (discBadgeEl) {
      discBadgeEl.textContent = `-${discountPct}% OFF`;
      discBadgeEl.classList.remove("hidden");
    }
  } else {
    if (oldPriceEl) oldPriceEl.classList.add("hidden");
    if (discBadgeEl) discBadgeEl.classList.add("hidden");
  }

  // Despliegue multimedia: Video looping o Imagen principal
  if (featured.media?.video) {
    if (videoEl) {
      if (videoEl.getAttribute("data-src") !== featured.media.video) {
        videoEl.src = featured.media.video;
        videoEl.setAttribute("data-src", featured.media.video);
        videoEl.play().catch(() => {});
      }
      videoEl.classList.remove("hidden");
    }
    if (galleryEl) galleryEl.classList.add("hidden");
  } else {
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute("data-src");
      videoEl.classList.add("hidden");
    }
    if (galleryEl && imgFallback) {
      imgFallback.src = featured.imageUrl || featured.media?.images?.[0] || "";
      galleryEl.classList.remove("hidden");
    }
  }

  // Generación de botones de talla conservando selección válida
  const firstVariant = featured.variants?.[0] || { sizes: [] };
  const hasValidSelectedSize = heroSelectedSizeIdx !== null 
    && heroSelectedSizeIdx >= 0 
    && firstVariant.sizes?.[heroSelectedSizeIdx] 
    && Number(firstVariant.sizes[heroSelectedSizeIdx].stock) > 0;

  if (!hasValidSelectedSize) {
    heroSelectedSizeIdx = firstVariant.sizes.findIndex((s) => Number(s.stock) > 0);
  }

  if (sizesContainer) {
    sizesContainer.innerHTML = firstVariant.sizes
      .map((s, idx) => {
        const isOutOfStock = s.stock <= 0;
        const isSelected = idx === heroSelectedSizeIdx;
        const baseClass = "px-3 py-1 text-xs rounded-lg font-bold border transition-colors cursor-pointer ";
        const stateClass = isOutOfStock
          ? "border-slate-800 text-slate-600 line-through cursor-not-allowed bg-slate-900/50"
          : isSelected
          ? "border-emerald-500 bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
          : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500";

        return `<button type="button" ${isOutOfStock ? "disabled" : ""} data-action="select-hero-size" data-size-index="${idx}" class="${baseClass} ${stateClass}">${s.size}</button>`;
      })
      .join("");
  }

  // Adición al carrito mediante delegación centralizada
  if (buyBtn) {
    buyBtn.setAttribute("data-action", "hero-buy");
    buyBtn.onclick = null;
  }

  heroSection.classList.remove("hidden");
};

window.selectHeroSize = (sizeIndex) => {
  heroSelectedSizeIdx = sizeIndex;
  renderFeaturedHero();
};

// Renderizado reactivo del catálogo aceptando lista calculada
const renderCatalog = (catalogData = null) => {
  const grid = document.getElementById("catalog-grid");
  if (!grid) return;

  grid.querySelectorAll("video").forEach((video) => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  });

  const dataToRender = catalogData !== null ? catalogData : products;

  if (!dataToRender || dataToRender.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 col-span-full text-center py-10">No se encontraron productos disponibles para este filtro.</p>`;
    return;
  }

  grid.innerHTML = dataToRender
    .map((p) => {
      let totalStock = 0;
      p.variants?.forEach((v) => {
        v.sizes?.forEach((s) => (totalStock += Number(s.stock) || 0));
      });
      const isAgotado = p.status === "agotado" || p.isAvailable === false || totalStock <= 0;
      if (!uiState[p.id]) {
        uiState[p.id] = { colorIdx: 0, sizeIdx: null };
      }
      const state = uiState[p.id];
      const currentVariant = p.variants?.[state?.colorIdx || 0] || p.variants?.[0];
      if (state && state.sizeIdx !== null && !currentVariant?.sizes?.[state.sizeIdx]) {
        state.sizeIdx = null;
      }
      const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;
      const colorsHtml = (p.variants && p.variants.length > 1)
        ? `<div class="flex items-center gap-1.5 mb-2 flex-wrap">${p.variants
            .map((v, cIdx) => {
              const isSelected = (state?.colorIdx || 0) === cIdx;
              const ringClass = isSelected ? " ring-2 ring-emerald-400" : "";
              const colorHex = (typeof v.colorHex === "string" && /^#[0-9A-Fa-f]{3,8}$/.test(v.colorHex)) ? v.colorHex : '#10b981';
              return `<button type="button" class="color-pill w-4 h-4 rounded-full border border-slate-600 transition-transform${ringClass}" style="background-color: ${colorHex}" data-action="select-color" data-product-id="${p.id}" data-color-index="${cIdx}" title="${sanitizeInput(v.color || '')}"></button>`;
            })
            .join("")}</div>`
        : "";
      const sizesHtml = (currentVariant?.sizes || [])
        .map((s, idx) => {
          const isDisabled = isAgotado || s.stock === 0;
          const isSelected = state?.sizeIdx === idx;
          const stockVal = Number(s.stock);
          const lowStockBadge = (!isDisabled && stockVal >= 1 && stockVal <= 2)
            ? '<span class="text-[9px] text-amber-400 font-bold block leading-none mt-0.5">¡Últimas!</span>'
            : '';
          let classes = "px-2 py-1 text-xs border rounded ";
          if (isDisabled)
            classes +=
              "border-red-900/50 text-neutral-600 line-through cursor-not-allowed opacity-40 ";
          else if (isSelected)
            classes +=
              "border-emerald-500 bg-emerald-500 text-black font-bold ";
          else
            classes +=
              "border-slate-700 text-slate-300 hover:border-slate-400 ";
          return `<button ${isDisabled ? "disabled" : ""} data-action="select-size" data-product-id="${p.id}" data-size-index="${idx}" class="${classes}">${s.size}${lowStockBadge}</button>`;
        })
        .join("");

      // Badges exclusivos CRO (Agotándose rápido / Top en venta)
      let scarcityBadgeHtml = "";
      if (!isAgotado) {
        const rawTag = (p.badge || p.tag || p.etiqueta || p.etiquetas || "").toString().trim();
        const normTag = rawTag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (normTag.includes("agotan")) {
          scarcityBadgeHtml = `
            <span class="absolute top-3 left-3 z-10 bg-amber-950/80 text-amber-300 border border-amber-600/40 backdrop-blur-sm text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1.5 uppercase select-none">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Agotándose rápido
            </span>
          `;
        } else if (normTag.includes("top")) {
          scarcityBadgeHtml = `
            <span class="absolute top-3 left-3 z-10 bg-slate-950/90 text-amber-300 border border-amber-400/50 backdrop-blur-sm text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-md shadow-lg shadow-amber-950/40 flex items-center gap-1.5 uppercase select-none">
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
              Top en venta
            </span>
          `;
        }
      }

      // Chip de descuento para prendas en oferta
      const discountBadgeHtml = (p.isOffer && p.priceRegular > 0 && p.priceOffer < p.priceRegular)
        ? `<span class="absolute top-3 right-3 z-10 bg-red-600/90 text-white font-black text-[10px] px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">-${Math.round((1 - p.priceOffer / p.priceRegular) * 100)}%</span>`
        : "";

      // Extracción de galería de fotos (soporta media.images, imágenes, imagenes, images, imageUrl)
      const prodImages = (p.media?.images && p.media.images.length > 0)
        ? p.media.images
        : (Array.isArray(p.imagenes) && p.imagenes.length > 0
            ? p.imagenes
            : (Array.isArray(p.images) && p.images.length > 0
                ? p.images
                : (p.imageUrl ? [p.imageUrl] : [])));

      const frontImg = sanitizeMediaUrl(prodImages[0] || p.imageUrl || 'https://images.unsplash.com/photo-1581636625402-29f2a01222ce');
      const backImg = prodImages.length >= 2 ? sanitizeMediaUrl(prodImages[1]) : '';
      const hasMultiplePhotos = Boolean(backImg);

      return `
    <div class="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col group transition-all duration-300 ${isAgotado ? 'opacity-60 grayscale' : ''}">
      ${scarcityBadgeHtml}
      ${discountBadgeHtml}
      ${
        isAgotado
          ? `
        <!-- Cinta diagonal roja de AGOTADO -->
        <div class="absolute top-4 -right-12 w-44 bg-red-600 text-white text-[10px] font-black uppercase text-center py-1 rotate-45 shadow-lg z-30 tracking-widest pointer-events-none select-none">
          AGOTADO
        </div>
        <!-- Capa de bloqueo para impedir interacción de compra -->
        <div class="absolute inset-0 z-20 bg-black/40 pointer-events-auto cursor-not-allowed"></div>
      `
          : ""
      }
      <div 
        class="product-media-container relative h-64 bg-slate-950 overflow-hidden ${hasMultiplePhotos ? 'cursor-pointer' : ''}" 
        data-product-id="${p.id}"
        data-front-src="${sanitizeMediaUrl(frontImg)}"
        ${hasMultiplePhotos ? `data-back-src="${sanitizeMediaUrl(backImg)}"` : ''}
      >
        <!-- Skeleton loader animado de fondo -->
        <div class="skeleton-placeholder absolute inset-0 bg-slate-800 animate-pulse transition-opacity duration-300 pointer-events-none"></div>
        <!-- Imagen con decodificación asíncrona desacoplada del hilo principal -->
        <img 
          src="${sanitizeMediaUrl(frontImg)}" 
          alt="${sanitizeInput(p.name)}" 
          data-front-src="${sanitizeMediaUrl(frontImg)}"
          ${hasMultiplePhotos ? `data-back-src="${sanitizeMediaUrl(backImg)}"` : ''}
          data-current-view="front"
          data-image-index="0"
          class="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 opacity-0" 
          loading="lazy"
          decoding="async"
          onload="this.classList.remove('opacity-0'); const sk = this.previousElementSibling; if(sk) sk.remove();"
          onerror="window.handleImageError(this)"
        >
      </div>
      <div class="p-4 pb-4 flex flex-col flex-grow justify-between">
        <div>
          <div class="flex items-center justify-between gap-2 mb-1">
            <h3 class="text-sm sm:text-base font-bold text-white truncate flex-1 min-w-0" title="${sanitizeInput(p.name)}">${sanitizeInput(p.name)}</h3>
          </div>
          <p class="text-xs text-slate-400 line-clamp-2 mb-2">${sanitizeInput(p.description)}</p>
          <div class="my-2">
            ${colorsHtml}
            <div class="flex gap-1.5 flex-wrap">${sizesHtml}</div>
          </div>
        </div>

        <div class="mt-auto pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <span class="text-[10px] text-slate-400 uppercase font-semibold block leading-none mb-1 sm:hidden truncate">${sanitizeInput(p.name)}</span>
            <p data-product-price class="text-xs sm:text-sm font-black text-emerald-400 truncate">$${finalPrice.toLocaleString("es-CO")} COP</p>
          </div>
          ${
            !isAgotado
              ? `
            <div class="flex items-center gap-1.5 shrink-0">
              <button data-action="buy-now" data-product-id="${p.id}" class="btn-flash-buy bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-2 rounded-lg font-bold uppercase transition-all active:scale-95" title="Comprar ahora">Comprar Ya</button>
              <button data-action="add-to-cart" data-product-id="${p.id}" class="shrink-0 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs px-3.5 py-2.5 rounded-lg transition-all shadow-md shadow-emerald-500/20 uppercase tracking-wider flex items-center gap-1.5" aria-label="Añadir al Carro">
                <svg class="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                </svg>
                <span>Añadir</span>
              </button>
            </div>
          `
              : `
            <button disabled class="shrink-0 bg-slate-800 text-slate-500 font-bold px-3 py-2 rounded-lg text-xs uppercase tracking-wider cursor-not-allowed pointer-events-none">Agotado</button>
          `
          }
        </div>
        <button type="button" data-action="ask-product" data-product-id="${p.id}" class="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors mt-2 text-center block w-full">¿Dudas con la talla? Pregúntanos por WhatsApp</button>
      </div>
    </div>
  `;
    })
    .join("");

  if (typeof initMobileVideoObserver === "function") {
    initMobileVideoObserver();
  }
};

window.selectColor = (productId, colorIdx) => {
  if (!uiState[productId]) {
    uiState[productId] = { colorIdx: 0, sizeIdx: null };
  }
  uiState[productId].colorIdx = colorIdx;
  uiState[productId].sizeIdx = null; // reset talla al cambiar color
  renderCatalog();
};

window.selectSize = (productId, sizeIdx) => {
  if (navigator.vibrate) navigator.vibrate(15);
  uiState[productId].sizeIdx = sizeIdx;
  renderCatalog();
};

// Cierre del Bottom Sheet de Selección de Talla
const closeSizeBottomSheet = () => {
  const overlay = document.getElementById("wz-size-sheet-overlay");
  const sheet = document.getElementById("wz-size-sheet");

  if (sheet) {
    sheet.classList.remove("open");
  }
  if (overlay) {
    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0");
    setTimeout(() => {
      if (!sheet || !sheet.classList.contains("open")) {
        overlay.classList.add("hidden");
        sheet?.classList.add("sm:hidden");
      }
    }, 300);
  }
};
window.closeSizeBottomSheet = closeSizeBottomSheet;

// Despliegue interactivo del Bottom Sheet de Tallas
const openSizeBottomSheet = (productId, mode = 'add') => {
  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) return;

  if (!uiState[p.id]) {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  }

  const overlay = document.getElementById("wz-size-sheet-overlay");
  const sheet = document.getElementById("wz-size-sheet");
  const titleEl = document.getElementById("wz-sheet-title");
  const sizesContainer = document.getElementById("wz-sheet-sizes");

  if (!sheet || !overlay || !sizesContainer) return;

  if (titleEl) {
    titleEl.textContent = p.name ? `Selecciona tu Talla · ${p.name}` : "Selecciona tu Talla";
  }

  const state = uiState[p.id];
  const variant = p.variants?.[state.colorIdx || 0] || p.variants?.[0];
  const sizes = variant?.sizes || [];

  if (sizes.length === 0) {
    sizesContainer.innerHTML = `<p class="text-xs text-slate-400 py-2">No hay tallas disponibles para este producto.</p>`;
  } else {
    sizesContainer.innerHTML = sizes
      .map((s, idx) => {
        const stock = Number(s.stock) || 0;
        const isOutOfStock = stock <= 0;
        const isSelected = state.sizeIdx === idx;
        if (isOutOfStock) {
          return `
            <button type="button" disabled class="flex-1 min-w-[70px] py-2.5 px-3 rounded-xl border border-slate-800 bg-slate-900/40 text-slate-600 line-through text-xs font-semibold cursor-not-allowed opacity-50 flex flex-col items-center justify-center">
              <span class="text-xs font-bold leading-tight">${sanitizeInput(s.size)}</span>
              <span class="text-[10px] leading-tight mt-0.5">0 disp.</span>
            </button>
          `;
        }
        const borderBg = isSelected
          ? "border-emerald-500 bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500"
          : "border-slate-700 bg-slate-800 hover:border-emerald-400 text-white";
        return `
          <button type="button" data-sheet-size-index="${idx}" class="flex-1 min-w-[70px] py-2.5 px-3 rounded-xl border ${borderBg} text-xs font-semibold transition-all active:scale-95 cursor-pointer flex flex-col items-center justify-center shadow-sm">
            <span class="text-sm font-black leading-tight">${sanitizeInput(s.size)}</span>
            <span class="text-[10px] text-slate-400 leading-tight mt-0.5">${stock} disp.</span>
          </button>
        `;
      })
      .join("");

    sizesContainer.querySelectorAll("[data-sheet-size-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sizeIdx = parseInt(btn.dataset.sheetSizeIndex, 10);
        uiState[p.id].sizeIdx = sizeIdx;
        if (navigator.vibrate) navigator.vibrate(15);
        closeSizeBottomSheet();
        if (typeof renderCatalog === "function") {
          renderCatalog();
        }
        if (mode === "buy") {
          window.executeBuyNow(p.id);
        } else {
          window.addToCart(p.id);
        }
      });
    });
  }

  sheet.classList.remove("sm:hidden");
  overlay.classList.remove("hidden");
  void overlay.offsetWidth;
  overlay.classList.remove("opacity-0");
  overlay.classList.add("opacity-100");
  sheet.classList.add("open");
};
window.openSizeBottomSheet = openSizeBottomSheet;

// Lógica de compra directa inmediata
const executeBuyNow = (productId) => {
  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) return;

  if (!uiState[p.id]) {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  }

  const state = uiState[p.id];
  if (!state || state.sizeIdx === null || state.sizeIdx === undefined) {
    openSizeBottomSheet(p.id, 'buy');
    return;
  }

  if (navigator.vibrate) navigator.vibrate(15);

  const variant = p.variants?.[state.colorIdx || 0] || p.variants?.[0];
  const sizeObj = variant?.sizes?.[state.sizeIdx];
  if (!sizeObj || sizeObj.stock <= 0) {
    window.showStoreModal("Esta talla no se encuentra disponible actualmente.", "Talla Agotada");
    return;
  }

  const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;

  const existing = cart.find(
    (i) =>
      String(i.id) === String(p.id) &&
      i.color === (variant.color || "") &&
      i.size === sizeObj.size
  );

  if (existing) {
    if (existing.qty < sizeObj.stock) {
      existing.qty++;
    } else if (typeof showNotificationModal === "function") {
      showNotificationModal("Límite de Stock", "Has alcanzado el límite máximo de existencias para esta talla.");
    }
  } else {
    cart.push({
      id: p.id,
      name: p.name,
      color: variant.color || "",
      size: sizeObj.size,
      price: finalPrice,
      priceRegular: p.priceRegular,
      qty: 1,
      maxStock: sizeObj.stock,
      img: p.imageUrl || (p.media?.images && p.media.images[0]) || "",
    });
  }

  saveCart();
  updateCartUI();
  if (typeof closeDrawer === "function") closeDrawer();
  else if (typeof window.closeDrawer === "function") window.closeDrawer();

  const checkoutModal = document.getElementById("modal-checkout");
  if (checkoutModal) {
    checkoutModal.classList.add("active");
    if (typeof startCheckoutTimer === "function") startCheckoutTimer();
  }
};
window.executeBuyNow = executeBuyNow;

// Agrega productos integrando el Bottom Sheet para tallas
window.addToCart = (productId) => {
  const p = products.find((x) => String(x.id) === String(productId));
  if (!p) return;

  if (!uiState[p.id]) {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  }

  const state = uiState[p.id];
  if (!state || state.sizeIdx === null || state.sizeIdx === undefined) {
    openSizeBottomSheet(p.id, 'add');
    return;
  }

  const variant = p.variants?.[state.colorIdx || 0] || p.variants?.[0];
  const sizeObj = variant?.sizes?.[state.sizeIdx];
  if (!sizeObj) return;

  const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;

  const existing = cart.find(
    (i) =>
      String(i.id) === String(p.id) && i.color === variant.color && i.size === sizeObj.size,
  );

  if (existing) {
    if (existing.qty >= sizeObj.stock) {
      showNotificationModal("Límite de Stock", "Has alcanzado el límite máximo de existencias para esta talla.");
      return;
    }
    existing.qty++;
  } else {
    cart.push({
      id: p.id,
      name: p.name,
      color: variant.color || "",
      size: sizeObj.size,
      price: finalPrice,
      priceRegular: p.priceRegular,
      qty: 1,
      maxStock: sizeObj.stock,
      img: p.imageUrl || (p.media?.images && p.media.images[0]) || "",
    });
  }

  if (navigator.vibrate) navigator.vibrate(15);

  saveCart();
  updateCartUI();
  openDrawer();
};

// Guardado ultra liviano del carrito: disocia imágenes Base64 para prevenir QuotaExceededError
const saveCart = () => {
  try {
    // Almacenar únicamente los atributos esenciales de la orden
    const lightweightPayload = cart.map((item) => ({
      id: item.id,
      color: item.color,
      size: item.size,
      qty: item.qty
    }));

    safeStorage.setItem("wz_cart", JSON.stringify(lightweightPayload));

    if (cart && cart.length > 0) {
      localStorage.setItem("wz_cart_last_activity", String(Date.now()));
    }
  } catch (err) {
    console.error("Fallo al persistir carrito en almacenamiento local:", err);
    if (err.name === "QuotaExceededError" || err.code === 22) {
      showNotificationModal(
        "Límite de Memoria",
        "Tu navegador tiene la memoria local llena. Te recomendamos finalizar tu pedido por WhatsApp para no perder los artículos seleccionados."
      );
    }
  }
};

const removeCartItem = (index) => {
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
};
window.removeCartItem = removeCartItem; // para onclick html

// Calculadora de Negocio y Render Carrito
const applyCouponLogic = () => {
  const code = sanitizeInput(
    document.getElementById("coupon-input").value.toUpperCase(),
  );
  if (code === "WZ2026" || code === "FREEATHLETE" || code === "WZRECUPERA10") {
    if (navigator.vibrate) navigator.vibrate(15);
    appliedCoupon = code;
    updateCartUI();
    showNotificationModal("Cupón Aplicado", `Se activó el beneficio del cupón: ${code}`);
  } else {
    showNotificationModal("Cupón Inválido", "El código ingresado no existe o ya venció.");
    appliedCoupon = null;
    updateCartUI();
  }
};

// Temporizador de cuenta regresiva de 8 minutos para checkout
let checkoutTimerInterval = null;
let checkoutRemainingSeconds = 8 * 60;

const startCheckoutTimer = () => {
  const timerDisplay = document.getElementById("wz-timer-countdown");
  if (!timerDisplay) return;

  const updateDisplay = () => {
    const minutes = Math.floor(checkoutRemainingSeconds / 60);
    const seconds = checkoutRemainingSeconds % 60;
    const el = document.getElementById("wz-timer-countdown");
    if (el) {
      el.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
  };

  updateDisplay();

  if (!checkoutTimerInterval) {
    checkoutTimerInterval = setInterval(() => {
      checkoutRemainingSeconds--;
      if (checkoutRemainingSeconds <= 0) {
        // Reiniciar el reloj sin vaciar el carro para no frustrar la venta
        checkoutRemainingSeconds = 8 * 60;
      }
      updateDisplay();
    }, 1000);
  }
};
window.startCheckoutTimer = startCheckoutTimer;

const stopCheckoutTimer = () => {
  if (checkoutTimerInterval) {
    clearInterval(checkoutTimerInterval);
    checkoutTimerInterval = null;
  }
};
window.stopCheckoutTimer = stopCheckoutTimer;

// Observador para activar el temporizador automáticamente al desplegar modal-checkout
if (typeof document !== "undefined") {
  const initCheckoutObserver = () => {
    const checkoutEl = document.getElementById("modal-checkout");
    if (checkoutEl) {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "class") {
            if (checkoutEl.classList.contains("active")) {
              startCheckoutTimer();
              updateCartUI();
            }
          }
        }
      });
      observer.observe(checkoutEl, { attributes: true });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCheckoutObserver);
  } else {
    initCheckoutObserver();
  }
}

let previousTotalItems = 0;
let isFirstCartRender = true;

const updateCartUI = () => {
  const badge = document.getElementById("cart-badge");
  const cartItemsContainer = document.getElementById("cart-items");
  const totalsContainer = document.getElementById("cart-totals");
  const stickyCta = document.getElementById("wz-sticky-cta");

  // Sincronización del tipo de envío en ambos selectores (cajón y checkout)
  const shippingSelect = document.getElementById("shipping-select");
  if (shippingSelect) shippingSelect.value = shippingType;
  const chkShippingType = document.getElementById("chk-shipping-type");
  if (chkShippingType) chkShippingType.value = shippingType;

  if (stickyCta) {
    if (cart.length > 0) {
      stickyCta.className = "shrink-0 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-[11px] uppercase tracking-wider px-4 py-2.5 rounded-lg transition-transform flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer";
      stickyCta.innerHTML = `<svg class="w-4 h-4 fill-current" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>Finalizar Pedido (${cart.length})</span>`;
      stickyCta.dataset.action = "open-checkout";
    } else {
      stickyCta.className = "shrink-0 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-black text-[11px] uppercase tracking-wider px-4 py-2.5 rounded-lg transition-transform flex items-center gap-1.5 shadow-md border border-slate-700 cursor-pointer";
      stickyCta.innerHTML = `<svg class="w-4 h-4 fill-current" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg><span>Ver Vitrina</span>`;
      stickyCta.dataset.action = "scroll-catalog";
    }
  }

  let totalItems = 0;
  let subtotal = 0;

  cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    previousTotalItems = 0;
    isFirstCartRender = false;
    badge.classList.add("hidden");
    cartItemsContainer.innerHTML =
      '<p class="text-gray-400 text-center mt-10">Tu carrito está vacío.</p>';
    totalsContainer.style.display = "none";
    const chkSummarySubtotal = document.getElementById("chk-summary-subtotal");
    const chkSummaryDiscount = document.getElementById("chk-summary-discount");
    const chkSummaryShipping = document.getElementById("chk-summary-shipping");
    const chkSummaryTotal = document.getElementById("chk-summary-total");
    if (chkSummarySubtotal) chkSummarySubtotal.textContent = "$0";
    if (chkSummaryDiscount) chkSummaryDiscount.textContent = "-$0";
    if (chkSummaryShipping) chkSummaryShipping.textContent = "$0";
    if (chkSummaryTotal) chkSummaryTotal.textContent = "$0";
    const finalBuyBtn = document.getElementById("final-buy-btn");
    if (finalBuyBtn) finalBuyBtn.dataset.total = "0";
    return;
  }

  badge.classList.remove("hidden");
  totalsContainer.style.display = "block";

  cart.forEach((item, idx) => {
    // Rehidratación canónica de propiedades contra products
    const masterProduct = products.find((p) => String(p.id) === String(item.id));
    if (masterProduct) {
      item.name = masterProduct.name;
      item.img = masterProduct.imageUrl || masterProduct.media?.images?.[0] || item.img || "";

      let variants = masterProduct.variants;
      if (typeof variants === "string") {
        try { variants = JSON.parse(variants); } catch (e) { variants = []; }
      }
      const variantsList = Array.isArray(variants) ? variants : [];
      const cleanItemColor = String(item.color || "").trim().toLowerCase();
      const matchedVariant = variantsList.find(
        (v) => v.color && v.color.trim().toLowerCase() === cleanItemColor
      ) || variantsList[0];

      const cleanItemSize = String(item.size || "").trim().toUpperCase();
      const matchedSizeObj = matchedVariant?.sizes?.find(
        (s) => String(s.size || "").trim().toUpperCase() === cleanItemSize
      );

      item.maxStock = matchedSizeObj?.stock || 10;
    } else {
      if (!item.maxStock) item.maxStock = 10;
    }

    const verifiedUnitPrice = masterProduct 
      ? (masterProduct.isOffer ? Number(masterProduct.priceOffer) : Number(masterProduct.priceRegular))
      : Number(item.price);

    // Sobrescribir precio manipulado en el objeto con el precio del catálogo
    item.price = verifiedUnitPrice;

    const safeQty = Math.max(1, Math.floor(Number(item.qty) || 1));
    item.qty = safeQty;
    totalItems += safeQty;
    subtotal += verifiedUnitPrice * safeQty;

    cartItemsContainer.innerHTML += `
      <div class="flex gap-4 mb-4 bg-[#1e293b] p-3 rounded-lg relative items-center">
        <img src="${sanitizeMediaUrl(item.img || '')}" class="w-16 h-16 object-cover rounded flex-shrink-0" alt="${sanitizeInput(item.name || '')}" onerror="window.handleImageError(this)">
        <div class="flex-1 min-w-0 pr-6">
          <p class="text-sm font-bold text-white leading-tight truncate">${sanitizeInput(item.name || '')}</p>
          <p class="text-xs text-gray-400 mt-0.5">${sanitizeInput(item.color || '')} | Talla: ${sanitizeInput(item.size || '')}</p>
          <div class="flex items-center justify-between mt-2">
            <p class="text-sm font-semibold text-green-400">$${verifiedUnitPrice.toLocaleString("es-CO")}</p>
            <div class="flex items-center border border-slate-700 rounded bg-slate-900 overflow-hidden">
              <button type="button" data-action="cart-decrease" data-index="${idx}" class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-bold text-sm" aria-label="Disminuir cantidad">−</button>
              <span class="px-2 text-xs font-bold text-white min-w-[20px] text-center select-none">${safeQty}</span>
              <button type="button" data-action="cart-increase" data-index="${idx}" class="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-bold text-sm" aria-label="Aumentar cantidad">+</button>
            </div>
          </div>
        </div>
        <button data-action="remove-cart-item" data-index="${idx}" class="absolute top-2 right-2 text-red-500 hover:text-red-400 p-1" aria-label="Eliminar prenda">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    `;
  });

  badge.textContent = totalItems;

  if (!isFirstCartRender && totalItems > previousTotalItems) {
    const cartBtn = document.getElementById("cart-btn");
    if (cartBtn) {
      cartBtn.classList.remove("cart-bounce");
      void cartBtn.offsetWidth;
      cartBtn.classList.add("cart-bounce");
      setTimeout(() => {
        cartBtn.classList.remove("cart-bounce");
      }, 400);
    }
  }
  previousTotalItems = totalItems;
  isFirstCartRender = false;

  // Reglas matemáticas unificadas
  let discount = 0;
  if (appliedCoupon === "WZ2026") {
    discount = Math.round(subtotal * 0.15);
  } else if (appliedCoupon === "WZRECUPERA10") {
    discount = Math.round(subtotal * 0.10);
  }

  const FREE_SHIPPING_THRESHOLD = 300000;
  let shippingCost = SHIP_RATES[shippingType] || SHIP_RATES.local;
  const isFreeByThreshold = subtotal >= FREE_SHIPPING_THRESHOLD;

  if (isFreeByThreshold || appliedCoupon === "FREEATHLETE") {
    shippingCost = 0;
  }

  // Detección de Pago Contra Entrega (+22.000 COP de recargo operativo al flete final)
  const paymentMethodSelect = document.getElementById("chk-payment-method");
  const isCod = (paymentMethodSelect?.value || "").includes("Contra Entrega");
  const codSurcharge = isCod ? 22000 : 0;
  const finalShippingCost = shippingCost + codSurcharge;

  // 2. Barra Dinámica de Envío Gratis optimizada (Threshold: $300.000 COP)
  const progressTextEl = document.getElementById("wz-shipping-progress-text");
  const progressPctEl = document.getElementById("wz-shipping-progress-pct");
  const progressBarEl = document.getElementById("wz-shipping-progress-bar");

  if (progressTextEl && progressPctEl && progressBarEl) {
    if (isFreeByThreshold || appliedCoupon === "FREEATHLETE") {
      progressTextEl.innerHTML = `🎉 <span class="text-emerald-400 font-black tracking-wide uppercase">¡ENVÍO GRATUITO DESBLOQUEADO!</span>`;
      progressPctEl.textContent = "100%";
      progressBarEl.style.width = "100%";
      progressBarEl.className = "bg-gradient-to-r from-emerald-400 to-green-300 h-2.5 rounded-full transition-all duration-500 ease-out shadow-[0_0_15px_rgba(52,211,153,0.8)]";
    } else {
      const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
      const pct = Math.min(99, Math.max(0, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100)));
      progressTextEl.innerHTML = `Te faltan <span class="text-emerald-400 font-extrabold">$${remainingForFree.toLocaleString("es-CO")} COP</span> para Envío Gratis`;
      progressPctEl.textContent = `${pct}%`;
      progressBarEl.style.width = `${pct}%`;
      progressBarEl.className = "bg-gradient-to-r from-emerald-500 to-green-400 h-2 rounded-full transition-all duration-500 ease-out";
    }
  }

  const finalTotal = Math.max(0, subtotal - discount + finalShippingCost);

  document.getElementById("subtotal-val").textContent = `$${subtotal.toLocaleString("es-CO")}`;
  document.getElementById("discount-val").textContent = `-$${discount.toLocaleString("es-CO")}`;

  const shippingValEl = document.getElementById("shipping-val");
  if (shippingValEl) {
    if (finalShippingCost === 0) {
      shippingValEl.textContent = "¡GRATIS!";
    } else if (isCod) {
      shippingValEl.textContent = `$${finalShippingCost.toLocaleString("es-CO")} (${shippingCost === 0 ? "Contra Entrega" : "Flete + Contra Entrega"})`;
    } else {
      shippingValEl.textContent = `$${finalShippingCost.toLocaleString("es-CO")}`;
    }
  }

  document.getElementById("total-val").textContent = `$${finalTotal.toLocaleString("es-CO")}`;
  document.getElementById("final-buy-btn").dataset.total = finalTotal;

  // Sincronización en tiempo real del resumen financiero dinámico en el Checkout
  const chkSummarySubtotal = document.getElementById("chk-summary-subtotal");
  const chkSummaryDiscount = document.getElementById("chk-summary-discount");
  const chkSummaryShipping = document.getElementById("chk-summary-shipping");
  const chkSummaryTotal = document.getElementById("chk-summary-total");

  if (chkSummarySubtotal) {
    chkSummarySubtotal.textContent = `$${subtotal.toLocaleString("es-CO")}`;
  }
  if (chkSummaryDiscount) {
    chkSummaryDiscount.textContent = `-$${discount.toLocaleString("es-CO")}`;
  }
  if (chkSummaryShipping) {
    if (finalShippingCost === 0) {
      chkSummaryShipping.textContent = "¡GRATIS!";
    } else if (isCod) {
      chkSummaryShipping.textContent = `$${finalShippingCost.toLocaleString("es-CO")} (${shippingCost === 0 ? "Contra Entrega" : "Flete + Contra Entrega"})`;
    } else {
      chkSummaryShipping.textContent = `$${finalShippingCost.toLocaleString("es-CO")}`;
    }
  }
  if (chkSummaryTotal) {
    chkSummaryTotal.textContent = `$${finalTotal.toLocaleString("es-CO")}`;
  }
};

// UI Drawer
const openDrawer = () => {
  document.getElementById("drawer-cart").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("open");
};
const closeDrawer = () => {
  document.getElementById("drawer-cart").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("open");
};
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;

// Generación y copia del enlace Base64 del carrito
const shareCartUrl = async () => {
  if (!cart || cart.length === 0) {
    showNotificationModal("Carrito Vacío", "No tienes prendas en tu selección para compartir.");
    return;
  }
  try {
    // Generación de payload liviano sanitizado
    const minimalCart = cart.map((i) => ({ id: i.id, color: i.color, size: i.size, qty: i.qty }));
    const base64cart = btoa(unescape(encodeURIComponent(JSON.stringify(minimalCart))));
    const shareUrl = `${window.location.origin}${window.location.pathname}?cart=${base64cart}`;

    if (navigator.share) {
      await navigator.share({
        title: 'Mi Carrito de Compra | WZSTORE',
        text: 'Mira las prendas tácticas que seleccioné en WZSTORE Colombia:',
        url: shareUrl
      });
    } else {
      await navigator.clipboard.writeText(shareUrl);
      showNotificationModal("Enlace Copiado", "El enlace se copió al portapapeles. Compártelo con quien desees.");
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error("Fallo en Web Share API:", err);
      showNotificationModal("Aviso", "No fue posible abrir el menú nativo. Intenta copiar la dirección manualmente.");
    }
  }
};

// Reconstrucción segura del carrito cruzando contra el catálogo canónico (Anti DOM-XSS & Anti Tampering)
const recoverCartFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const cartParam = params.get("cart");
  if (!cartParam) return;

  try {
    // Decodificación segura de Base64 UTF-8 sin fuga de memoria
    const binaryStr = atob(cartParam.replace(/\s/g, ""));
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const decodedJson = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decodedJson);

    if (!Array.isArray(parsed)) throw new Error("Estructura de carrito no válida");

    const validatedCart = [];

    parsed.forEach((incomingItem) => {
      // Verificación estricta de estructura para evitar inyecciones por prototipo
      if (typeof incomingItem !== "object" || incomingItem === null) return;

      const cleanId = String(incomingItem.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const authenticProduct = products.find((p) => String(p.id) === cleanId);

      if (!authenticProduct || authenticProduct.status === "agotado" || authenticProduct.isAvailable === false) {
        return;
      }

      if (typeof authenticProduct.variants === "string") {
        try {
          authenticProduct.variants = JSON.parse(authenticProduct.variants);
        } catch (_) {
          authenticProduct.variants = [];
        }
      }

      // Sanitización completa de datos alfanuméricos contra DOM-XSS
      const rawColor = String(incomingItem.color || "").slice(0, 30);
      const cleanColor = sanitizeInput(rawColor);
      const matchedVariant = authenticProduct.variants?.find(
        (v) => v.color.toLowerCase() === cleanColor.toLowerCase()
      ) || authenticProduct.variants?.[0];

      if (!matchedVariant) return;

      const rawSize = String(incomingItem.size || "").slice(0, 10);
      const cleanSize = sanitizeInput(rawSize).toUpperCase();
      const matchedSizeObj = matchedVariant.sizes?.find((s) => s.size === cleanSize);

      if (!matchedSizeObj || matchedSizeObj.stock <= 0) return;

      // Imponer precio canónico inmutable y desinfectar el nombre
      const officialPrice = Number(authenticProduct.isOffer ? authenticProduct.priceOffer : authenticProduct.priceRegular) || 0;
      const rawQty = parseInt(incomingItem.qty, 10);
      const verifiedQty = isNaN(rawQty) || rawQty < 1 ? 1 : Math.min(rawQty, matchedSizeObj.stock);

      validatedCart.push({
        id: authenticProduct.id,
        name: sanitizeInput(authenticProduct.name),
        color: sanitizeInput(matchedVariant.color),
        size: sanitizeInput(matchedSizeObj.size),
        price: officialPrice,
        priceRegular: Number(authenticProduct.priceRegular) || officialPrice,
        qty: verifiedQty,
        maxStock: matchedSizeObj.stock,
        img: authenticProduct.imageUrl || (authenticProduct.media?.images && authenticProduct.media.images[0]) || "https://images.unsplash.com/photo-1581636625402-29f2a01222ce"
      });
    });

    if (validatedCart.length > 0) {
      cart = validatedCart;
      saveCart();
      updateCartUI();
      openDrawer();
      showNotificationModal("Carrito Importado", "Se cargaron tus prendas verificando existencias y precios oficiales.");
    }
  } catch (err) {
    console.warn("Bloqueo de seguridad: El payload del carrito en la URL fue rechazado.", err);
  } finally {
    // Limpiar la barra de navegación para evitar reejecuciones
    window.history.replaceState({}, document.title, window.location.pathname);
  }
};

// Validación integral de checkout y formateo de orden para WhatsApp
const processCheckout = () => {
  if (typeof startCheckoutTimer === "function") startCheckoutTimer();
  const orderId = `WZ-${Date.now().toString().slice(-6)}`;
  if (!cart || cart.length === 0) {
    showNotificationModal("Carro Vacío", "No tienes artículos agregados en la orden.");
    return;
  }

  // Sanitización y depuración estricta de campos críticos
  const rawFirstName = document.getElementById("chk-firstname")?.value || "";
  const rawLastName = document.getElementById("chk-lastname")?.value || "";
  const rawPhone = document.getElementById("chk-phone")?.value || "";
  const rawCity = document.getElementById("chk-city")?.value || "";
  const rawPostal = document.getElementById("chk-postal")?.value || "";
  const rawAddr = document.getElementById("chk-addr")?.value || "";
  const rawExtraAddr = document.getElementById("chk-extra-addr")?.value || "";
  const paymentMethod = document.getElementById("chk-payment-method")?.value || "Transferencia Bancaria";

  // Normalización: remueve caracteres de control que quiebren encodeURIComponent
  const cleanText = (str) => str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();

  const firstName = cleanText(rawFirstName);
  const lastName = cleanText(rawLastName);
  // Extraer exclusivamente dígitos para la línea telefónica
  const phone = rawPhone.replace(/\D/g, "");
  const city = cleanText(rawCity);
  const postal = cleanText(rawPostal).replace(/[^a-zA-Z0-9-]/g, "");
  const addr = cleanText(rawAddr);
  const extraAddr = cleanText(rawExtraAddr);

  const highlightInputError = (inputEl) => {
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    if (inputEl) {
      inputEl.focus();
      inputEl.classList.add("border-red-500");
      setTimeout(() => {
        inputEl.classList.remove("border-red-500");
      }, 2000);
    }
  };

  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,40}$/;

  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    const firstInput = document.getElementById("chk-firstname");
    const lastInput = document.getElementById("chk-lastname");
    if (!nameRegex.test(firstName)) {
      highlightInputError(firstInput);
      if (!nameRegex.test(lastName) && lastInput) {
        lastInput.classList.add("border-red-500");
        setTimeout(() => lastInput.classList.remove("border-red-500"), 2000);
      }
    } else {
      highlightInputError(lastInput);
    }
    showNotificationModal("Datos Inválidos", "Por favor ingresa nombres y apellidos válidos (solo letras sin caracteres especiales).");
    return;
  }
  if (phone.length < 7 || phone.length > 15) {
    highlightInputError(document.getElementById("chk-phone"));
    showNotificationModal("Teléfono Inválido", "Ingresa un número telefónico válido de entre 7 y 15 dígitos.");
    return;
  }
  if (!city && !postal) {
    highlightInputError(document.getElementById("chk-city"));
    showNotificationModal("Ubicación Requerida", "Debes especificar la Ciudad o el Código Postal.");
    return;
  }
  if (addr.length < 5) {
    highlightInputError(document.getElementById("chk-addr"));
    showNotificationModal("Dirección Incompleta", "Por favor especifica una dirección de entrega válida.");
    return;
  }

  // Guardar datos de despacho validados en safeStorage bajo la clave wz_customer_profile
  const customerProfile = {
    "chk-firstname": rawFirstName.trim() || firstName,
    "chk-lastname": rawLastName.trim() || lastName,
    "chk-phone": rawPhone.trim() || phone,
    "chk-city": rawCity.trim() || city,
    "chk-postal": rawPostal.trim() || postal,
    "chk-addr": rawAddr.trim() || addr,
    "chk-extra-addr": rawExtraAddr.trim() || extraAddr,
    "chk-payment-method": paymentMethod
  };
  safeStorage.setItem("wz_customer_profile", JSON.stringify(customerProfile));

  // Validación de montos exclusivamente contra la colección canónica 'products' obtenida de Supabase
  let verifiedSubtotal = 0;
  let totalRegularCanon = 0;
  let verifiedCartDetails = [];

  for (const item of cart) {
    const original = Array.isArray(products) ? products.find((p) => String(p.id) === String(item.id)) : null;
    if (!original) {
      showNotificationModal("Catálogo Desactualizado", "Uno de los productos ya no se encuentra en el inventario.");
      return;
    }

    // Validación canónica de precio en memoria
    const rawPrice = original.isOffer ? original.priceOffer : original.priceRegular;
    const authenticPrice = Number(rawPrice);
    if (isNaN(authenticPrice) || authenticPrice <= 0) {
      showNotificationModal("Precio Inválido", "Uno de los productos no cuenta con un precio válido en el inventario.");
      return;
    }

    const authenticRegularPrice = Number(original.priceRegular) > 0 ? Number(original.priceRegular) : authenticPrice;
    const safeQty = Math.max(1, Math.floor(Number(item.qty) || 1));
    item.qty = safeQty;

    // Validación de disponibilidad y stock específico de variante y talla
    const isGarmentAvailable = original.isAvailable !== false && original.status !== "agotado";

    let variants = original.variants;
    if (typeof variants === "string") {
      try {
        variants = JSON.parse(variants);
      } catch (e) {
        variants = [];
      }
    }
    const variantsList = Array.isArray(variants) ? variants : [];
    const cleanItemColor = String(item.color || "").trim().toLowerCase();
    const matchedVariant = variantsList.find(
      (v) => v.color && v.color.trim().toLowerCase() === cleanItemColor
    ) || variantsList[0];

    const cleanItemSize = String(item.size || "").trim().toUpperCase();
    const matchedSizeObj = matchedVariant?.sizes?.find(
      (s) => String(s.size || "").trim().toUpperCase() === cleanItemSize
    );
    const stock = Number(matchedSizeObj?.stock ?? 0);
    const stockSufficient = stock >= safeQty;

    if (!isGarmentAvailable || !matchedSizeObj || !stockSufficient) {
      if (!isGarmentAvailable || !matchedSizeObj || stock <= 0) {
        cart = cart.filter((c) => !(String(c.id) === String(item.id) && c.color === item.color && c.size === item.size));
      } else {
        item.qty = stock;
        item.maxStock = stock;
      }
      saveCart();
      updateCartUI();

      const checkoutModal = document.getElementById("modal-checkout");
      if (checkoutModal) {
        checkoutModal.classList.remove("active");
      }

      showNotificationModal(
        "Prenda Agotada",
        `La prenda "${original.name}" (${item.color ? item.color + ' - ' : ''}Talla ${item.size || ''}) se ha agotado o no cuenta con existencias suficientes.`
      );
      return;
    }

    verifiedSubtotal += authenticPrice * safeQty;
    totalRegularCanon += authenticRegularPrice * safeQty;

    verifiedCartDetails.push({
      name: original.name,
      color: sanitizeInput(item.color),
      size: sanitizeInput(item.size),
      qty: safeQty,
      unitPrice: authenticPrice,
      subtotal: authenticPrice * safeQty
    });
  }

  // Recálculo seguro soportando WZ2026 y WZRECUPERA10
  let calculatedDiscount = 0;
  if (appliedCoupon === "WZ2026") {
    calculatedDiscount = Math.round(verifiedSubtotal * 0.15);
  } else if (appliedCoupon === "WZRECUPERA10") {
    calculatedDiscount = Math.round(verifiedSubtotal * 0.10);
  }

  // Reglas de flete gratuito automático sobre $300.000 COP o con cupón FREEATHLETE
  let verifiedBaseShipping = SHIP_RATES[shippingType] || SHIP_RATES.local;
  if (verifiedSubtotal >= 300000 || appliedCoupon === "FREEATHLETE") {
    verifiedBaseShipping = 0;
  }

  const isCod = (paymentMethod || "").includes("Contra Entrega");
  const codSurcharge = isCod ? 22000 : 0;
  const verifiedFinalShipping = verifiedBaseShipping + codSurcharge;

  const mathematicallyVerifiedTotal = verifiedSubtotal - calculatedDiscount + verifiedFinalShipping;

  // Maquetación del mensaje para despacho por WhatsApp
  let msg = `🔥 *PEDIDO #${orderId} - WZSTORE* 🔥\n\n`;
  msg += `👤 *Cliente:* ${decodeHtml(firstName)} ${decodeHtml(lastName)}\n`;
  msg += `📞 *Teléfono:* ${phone}\n`;
  msg += `📍 *Dirección:* ${decodeHtml(addr)}${extraAddr ? ` (${decodeHtml(extraAddr)})` : ""}\n`;
  msg += `🏙️ *Ubicación:* ${city ? decodeHtml(city) : "C.P. " + postal}${postal && city ? ` (C.P. ${postal})` : ""}\n`;
  msg += `💳 *Método de Pago:* ${paymentMethod}\n`;
  msg += `🚚 *Modalidad de Envío:* ${shippingType === "local" ? "Local" : "Nacional"}\n`;
  if (isCod) {
    if (verifiedBaseShipping === 0) {
      msg += `📦 *Flete / Envío:* $${verifiedFinalShipping.toLocaleString("es-CO")} COP (Flete base $0 GRATIS + $22.000 COP de recargo operativo por Pago Contra Entrega)\n\n`;
    } else {
      msg += `📦 *Flete / Envío:* $${verifiedFinalShipping.toLocaleString("es-CO")} COP (Flete base $${verifiedBaseShipping.toLocaleString("es-CO")} COP + $22.000 COP de recargo operativo por Pago Contra Entrega)\n\n`;
    }
  } else {
    msg += `📦 *Flete / Envío:* ${verifiedFinalShipping === 0 ? "¡GRATIS!" : `$${verifiedFinalShipping.toLocaleString("es-CO")} COP`}\n\n`;
  }
  msg += `*Prendas Solicitadas:*\n`;

  verifiedCartDetails.forEach((item) => {
    const itemQty = Math.max(1, Math.floor(Number(item.qty) || 1));
    msg += `▪ ${decodeHtml(item.name)}\n   Color: ${decodeHtml(item.color)} | Talla: ${decodeHtml(item.size)} | Cant: ${itemQty} | Sub: $${item.subtotal.toLocaleString("es-CO")}\n`;
  });

  // Cálculo del ahorro total del cliente y aplicación de la línea psicológica obligatoria
  const verifiedSavings = (totalRegularCanon - verifiedSubtotal) + calculatedDiscount;
  msg += `\n💰 *Total Liquidado: $${mathematicallyVerifiedTotal.toLocaleString("es-CO")} COP*\n`;
  if (verifiedSavings > 0) {
    msg += `🏷️ ¡Ahorro total en WZSTORE por promociones: $${verifiedSavings.toLocaleString("es-CO")} COP!\n`;
  }
  if (appliedCoupon) {
    msg += `🎟️ *Cupón Redimido:* ${appliedCoupon}\n`;
  }

  const whatsappUrl = `https://wa.me/573006724082?text=${encodeURIComponent(msg)}`;

  // Envolver el vaciado de carrito y almacenamiento en pagehide para no borrar antes de navegar
  window.addEventListener(
    "pagehide",
    () => {
      cart = [];
      appliedCoupon = null;
      saveCart();
      updateCartUI();
      localStorage.removeItem("wz_cart_last_activity");
      localStorage.removeItem("wz_cart_reminder_sent");
    },
    { once: true }
  );

  const checkoutModal = document.getElementById("modal-checkout");
  if (checkoutModal) {
    checkoutModal.classList.remove("active");
  }
  stopCheckoutTimer();

  // Redirección directa en lugar de window.open para eludir bloqueo de popups en iOS Safari
  window.location.href = whatsappUrl;
};


// ==========================================
// REPRODUCTOR STREAMING RESPONSIVE (DESKTOP HOVER & MOBILE INTERSECTION OBSERVER)
// ==========================================
let mobileVideoObserver = null;

const initMobileVideoObserver = () => {
  if (mobileVideoObserver) mobileVideoObserver.disconnect();

  // Solo se activa en pantallas táctiles o con ancho móvil (< 1024px)
  if (window.innerWidth >= 1024) return;

  mobileVideoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const container = entry.target;
        const prodId = container.dataset.productId || container.getAttribute("data-product-id");
        const prod = (typeof products !== "undefined" && Array.isArray(products))
          ? products.find((p) => String(p.id) === String(prodId))
          : null;

        const img = container.querySelector("img");
        let video = container.querySelector("video");

        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          if (prod?.media?.video) {
            if (!video) {
              video = document.createElement("video");
              video.playsInline = true;
              video.muted = true;
              video.loop = true;
              video.autoplay = true;
              video.setAttribute("playsinline", "");
              video.setAttribute("muted", "");
              video.setAttribute("loop", "");
              video.setAttribute("autoplay", "");
              video.preload = "auto";
              video.className = "w-full h-full object-cover transition-opacity duration-300 opacity-0";
              video.src = prod.media.video;
              container.appendChild(video);
            }
            if (img) img.classList.add("hidden");
            video.classList.remove("hidden");
            requestAnimationFrame(() => {
              video.classList.remove("opacity-0");
              video.play().catch(() => {});
            });
          }
        } else {
          // Desmontar el video al salir del viewport para liberar memoria RAM
          if (video) {
            video.pause();
            video.removeAttribute("src");
            video.load();
            video.remove();
          }
          if (img) {
            img.classList.remove("hidden");
          }
        }
      });
    },
    { threshold: [0, 0.7] }
  );

  document.querySelectorAll(".product-media-container").forEach((el) => {
    mobileVideoObserver.observe(el);
  });
};

let resizeVideoObserverTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeVideoObserverTimer);
  resizeVideoObserverTimer = setTimeout(() => {
    initMobileVideoObserver();
  }, 250);
});

window.playProductVideo = (container, productId) => {
  if (window.innerWidth < 1024) return;

  const prod = products.find((p) => String(p.id) === String(productId));
  if (!prod?.media?.video) return;

  const img = container.querySelector("img");
  let video = container.querySelector("video");

  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.className = "w-full h-full object-cover transition-opacity duration-300 opacity-0";
    video.src = prod.media.video;
    container.appendChild(video);
  }

  if (img) img.classList.add("hidden");
  video.classList.remove("hidden");
  requestAnimationFrame(() => {
    video.classList.remove("opacity-0");
    video.play().catch(() => {});
  });
};

window.stopProductVideo = (container) => {
  if (window.innerWidth < 1024) return;

  const img = container.querySelector("img");
  const video = container.querySelector("video");

  if (video) {
    video.pause();
    video.removeAttribute("src"); // Desvincular buffer de streaming
    video.load(); // Forzar al motor de render a vaciar la VRAM ocupada
    video.remove(); // Desmontar físicamente del DOM para evitar acumulación de nodos
  }

  if (img) {
    img.classList.remove("hidden");
  }
};

window.calculateRecommendedSize = () => {
  const hInput = document.getElementById('wz-calc-height');
  const wInput = document.getElementById('wz-calc-weight');
  const out = document.getElementById('wz-size-result');

  const h = parseFloat(hInput ? hInput.value : 0);
  const w = parseFloat(wInput ? wInput.value : 0);

  if (!h || !w || h < 120 || h > 220 || w < 35 || w > 180) {
    out.classList.remove('hidden');
    out.innerHTML = `<span class="text-amber-400 font-semibold">Ingresa una estatura (120-220 cm) y peso (35-180 kg) válidos.</span>`;
    return;
  }

  // Índice de Masa Corporal con ajuste biométrico para tejido de compresión
  const imc = w / Math.pow(h / 100, 2);
  let recommendedSize = "M";
  let fitNote = "Ajuste estándar equilibrado";

  if (imc < 19.5) {
    recommendedSize = (h > 178) ? "M" : "S";
    fitNote = "Compresión ceñida de alto soporte";
  } else if (imc >= 19.5 && imc < 24.5) {
    recommendedSize = (h > 180) ? "L" : "M";
    fitNote = "Corte atlético óptimo";
  } else if (imc >= 24.5 && imc < 28.5) {
    recommendedSize = (h > 182) ? "XL" : "L";
    fitNote = "Compresión cómoda sin estrangulamiento";
  } else {
    recommendedSize = "XL";
    fitNote = "Calce amplio y flexibilidad máxima";
  }

  out.classList.remove('hidden');
  out.innerHTML = `Talla calculada: <span class="bg-emerald-500 text-black px-2 py-0.5 rounded font-black text-xs uppercase">${recommendedSize}</span> &nbsp;<span class="text-[11px] text-slate-400">(${fitNote})</span>`;
};

// ==========================================
// CANAL EXCLUSIVO DE ATENCIÓN Y SOPORTE (POSTVENTA)
// ==========================================
const WZ_SUPPORT_CONFIG = {
  phone: "573006724082", // Canal exclusivo de asesoría postventa
  agentName: "Equipo de Atención Técnica WZ"
};

window.openSupportChat = (customContext = "") => {
  const timeHour = new Date().toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
  const msgText = `Hola ${WZ_SUPPORT_CONFIG.agentName}, solicito asesoría personalizada en línea (${timeHour}). ${customContext ? `Motivo: ${customContext}` : '¿Podrían orientarme con un producto?'}`.trim();
  const supportUrl = `https://wa.me/${WZ_SUPPORT_CONFIG.phone}?text=${encodeURIComponent(msgText)}`;
  window.location.href = supportUrl;
};

// Controlador unificado del Modal de Tienda (reemplazo de alertas nativas)
window.showNotificationModal = (title, message) => window.showStoreModal(message, title);
window.closeNotificationModal = () => window.closeStoreModal();

// Listener global para la tecla Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDrawer();
    closeSizeBottomSheet();
    stopCheckoutTimer();
    document.getElementById("modal-checkout")?.classList.remove("active");
    closeStoreModal();
  }
});

