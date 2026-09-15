// Configuración del cliente Supabase
const SUPABASE_URL = "https://bthyaqpmvtyncnsbrouv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nsKtTkdnxMV2C0OUJbYhrw_xYR_7Am9";
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Sanitización XSS Central
// Sanitizador contra Vector XSS por codificación de entidades completas
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>"'/]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#x27;';
      case '/': return '&#x2F;';
      default: return char;
    }
  }).trim();
};

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

// Inicialización blindada con consulta prioritaria a Supabase y respaldo offline
const initApp = async () => {
  let loadedProducts = null;

  // 1. Consulta prioritaria a la tabla 'productos' de Supabase para catálogo fresco multi-dispositivo
  if (supabase) {
    try {
      const { data, error } = await supabase.from('productos').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        loadedProducts = data.map((row) => ({
          ...row,
          priceRegular: Number(row.price_regular ?? row.priceRegular ?? 0),
          priceOffer: Number(row.price_offer ?? row.priceOffer ?? 0),
          subCategory: row.sub_category ?? row.subCategory ?? "",
          isOffer: Boolean(row.is_offer ?? row.isOffer),
          isFeatured: Boolean(row.is_featured ?? row.isFeatured),
          isAvailable: Boolean(row.is_available ?? row.isAvailable ?? true),
          imageUrl: row.image_url ?? row.imageUrl
        }));
        // Mantener localStorage únicamente como respaldo offline
        safeStorage.setItem("wz_core_products", JSON.stringify(loadedProducts));
        safeStorage.setItem("wz_products", JSON.stringify(loadedProducts));
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
        }
      } catch (e) {
        console.warn("[WZSTORE] Error parseando productos de caché local:", e);
      }
    }
  }

  // 3. Fallback inicial si la caché está vacía
  if (!loadedProducts || loadedProducts.length === 0) {
    loadedProducts = getBaseDatabase();
    safeStorage.setItem("wz_products", JSON.stringify(loadedProducts));
    safeStorage.setItem("wz_core_products", JSON.stringify(loadedProducts));
    safeStorage.setItem("wz_data_ver", CURRENT_DATA_VER);
    safeStorage.setItem("wz_version_db", CURRENT_DATA_VER);
  }

  products = loadedProducts;

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
  updateCartUI();
};

// Enlace de compatibilidad con renderizado directo
window.renderFilteredCatalog = (customList) => renderCatalog(customList);

// Variables de Envío y Cupones
let appliedCoupon = null; // 'WZ2026' | 'FREEATHLETE'
let shippingType = "local"; // 'local' | 'nacional'
const SHIP_RATES = { local: 5000, nacional: 20000 };

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

window.closeStoreModal = () => {
  const modal = document.getElementById("wz-store-modal") || document.getElementById("wz-alert-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
};

// Reemplazo transparente de alert() nativo
window.alert = (msg) => window.showStoreModal(msg);
window.showNotificationModal = (title, message) => window.showStoreModal(message, title);
window.closeNotificationModal = () => window.closeStoreModal();

// 3. Hover en tarjetas y Toque Táctil Mobile (Alternar foto frontal [0] <-> posterior [1])
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

  const frontSrc = img.dataset.frontSrc || container.dataset.frontSrc || prodImgs[0] || img.src;
  const backSrc = img.dataset.backSrc || container.dataset.backSrc || (prodImgs.length >= 2 ? prodImgs[1] : "");

  if (!backSrc) return;

  img.dataset.frontSrc = frontSrc;
  img.dataset.backSrc = backSrc;

  const isBack = img.dataset.currentView === "back";

  if (forceSecond === true) {
    if (!isBack) {
      img.src = backSrc;
      img.dataset.currentView = "back";
    }
  } else if (forceSecond === false) {
    if (isBack) {
      img.src = frontSrc;
      img.dataset.currentView = "front";
    }
  } else {
    // Alternar con toque en pantallas táctiles
    if (isBack) {
      img.src = frontSrc;
      img.dataset.currentView = "front";
    } else {
      img.src = backSrc;
      img.dataset.currentView = "back";
    }
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

// Soporte táctil móvil para alternar imagen con un toque
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
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth < 1024;
    if (isTouchDevice && Date.now() - lastTouchToggleTime > 500) {
      window.swapProductImage(container, null);
    }
  }
});

// 4. Delegación Global de Eventos en document para evitar congelamiento de botones
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target) return;

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

  // 2. Botón de compra en Hero Showcase
  const heroBuyBtn = target.closest("#wz-hero-buy-btn, [data-action='hero-buy']");
  if (heroBuyBtn) {
    e.preventDefault();
    if (heroSelectedSizeIdx === null || heroSelectedSizeIdx === -1) {
      window.showStoreModal("Por favor elige una talla disponible para el Drop de la Semana.", "Selecciona una Talla");
      return;
    }
    const featured = products.find((p) => p.isFeatured && p.status !== "agotado") || products.find((p) => p.media?.video && p.status !== "agotado");
    if (featured) {
      uiState[featured.id] = { colorIdx: 0, sizeIdx: heroSelectedSizeIdx };
      window.addToCart(featured.id);
    }
    return;
  }

  // 3. Abrir / Alternar Carrito
  const openCartBtn = target.closest("#cart-btn, #wz-sticky-cta, [data-action='open-cart'], [data-action='toggle-cart']");
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

  // 6. Abrir Modal Checkout
  const checkoutBtn = target.closest("#checkout-btn, [data-action='open-checkout']");
  if (checkoutBtn) {
    e.preventDefault();
    if (!cart || cart.length === 0) {
      window.showStoreModal("Tu carrito está vacío. Agrega una prenda antes de proceder.", "Carrito Vacío");
      return;
    }
    document.getElementById("modal-checkout")?.classList.add("active");
    window.closeDrawer();
    return;
  }

  // 7. Cerrar Checkout
  const closeCheckoutBtn = target.closest("#close-modal, [data-action='close-checkout']");
  if (closeCheckoutBtn) {
    e.preventDefault();
    document.getElementById("modal-checkout")?.classList.remove("active");
    return;
  }

  // 8. Confirmar pedido por WhatsApp (Final Buy)
  const finalBuyBtn = target.closest("#final-buy-btn, [data-action='checkout-final']");
  if (finalBuyBtn) {
    e.preventDefault();
    processCheckout();
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
});

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
    window.addEventListener("scroll", () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 320) {
        // Obtener el primer producto visible en el viewport
        const cards = document.querySelectorAll(".product-media-container");
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (rect.top >= 0 && rect.top <= 400) {
            const prodTitle = card.parentElement.querySelector("h3")?.innerText;
            const prodPrice = card.parentElement.querySelector(".font-black")?.innerText;
            if (stickyTitle && prodTitle) stickyTitle.textContent = prodTitle;
            if (stickyPrice && prodPrice) stickyPrice.textContent = prodPrice;
            break;
          }
        }
        stickyBar.classList.remove("translate-y-full");
      } else {
        stickyBar.classList.add("translate-y-full");
      }
    }, { passive: true });
  }
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
  } else {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
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

  // Drawer del carrito
  const cartBtn = document.getElementById("cart-btn");
  if (cartBtn) cartBtn.addEventListener("click", openDrawer);

  const closeDrawerBtn = document.getElementById("close-drawer");
  if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeDrawer);

  const drawerOverlay = document.getElementById("drawer-overlay");
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);

  // Cupones y tarifas log sticas
  const applyCouponBtn = document.getElementById("apply-coupon");
  if (applyCouponBtn) applyCouponBtn.addEventListener("click", applyCouponLogic);

  const shippingSelect = document.getElementById("shipping-select");
  if (shippingSelect) {
    shippingSelect.addEventListener("change", (e) => {
      shippingType = e.target.value;
      updateCartUI();
    });
  }

  // Disociación de listeners para guardar y compartir carrito
  const saveCartBtn = document.getElementById("btn-save-cart");
  if (saveCartBtn) {
    saveCartBtn.addEventListener("click", () => {
      saveCart();
      showNotificationModal("Carrito Guardado", "El contenido de tu compra quedó guardado de forma segura en este navegador.");
    });
  }

  const shareCartBtn = document.getElementById("btn-share-cart");
  if (shareCartBtn) {
    shareCartBtn.addEventListener("click", shareCartUrl);
  }

  // Modal de checkout
  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", () => {
      if (cart.length === 0) return;
      document.getElementById("modal-checkout")?.classList.add("active");
      closeDrawer();
    });
  }

  const closeModalBtn = document.getElementById("close-modal");
  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", () => {
      document.getElementById("modal-checkout")?.classList.remove("active");
    });
  }

  const finalBuyBtn = document.getElementById("final-buy-btn");
  if (finalBuyBtn) finalBuyBtn.addEventListener("click", processCheckout);
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
    videoEl.src = featured.media.video;
    videoEl.classList.remove("hidden");
    if (galleryEl) galleryEl.classList.add("hidden");
    videoEl.play().catch(() => {});
  } else {
    if (videoEl) {
      videoEl.pause();
      videoEl.classList.add("hidden");
    }
    if (galleryEl && imgFallback) {
      imgFallback.src = featured.imageUrl || featured.media?.images?.[0] || "";
      galleryEl.classList.remove("hidden");
    }
  }

  // Generación de botones de talla para la primera variante de color activa
  const firstVariant = featured.variants?.[0] || { sizes: [] };
  heroSelectedSizeIdx = firstVariant.sizes.findIndex((s) => s.stock > 0);

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

        return `<button type="button" ${isOutOfStock ? "disabled" : ""} data-action="select-hero-size" data-size-index="${idx}" onclick="selectHeroSize(${idx})" class="${baseClass} ${stateClass}">${s.size}</button>`;
      })
      .join("");
  }

  // Adición directa al carrito sincronizando la talla escogida
  if (buyBtn) {
    buyBtn.setAttribute("data-action", "hero-buy");
    buyBtn.onclick = () => {
      if (heroSelectedSizeIdx === null || heroSelectedSizeIdx === -1) {
        window.showStoreModal("Por favor elige una talla disponible para el Drop de la Semana.", "Selecciona una Talla");
        return;
      }
      uiState[featured.id] = { colorIdx: 0, sizeIdx: heroSelectedSizeIdx };
      window.addToCart(featured.id);
    };
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
      const state = uiState[p.id];
      const currentVariant = p.variants?.[state?.colorIdx || 0] || p.variants?.[0];
      const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;
      const sizesHtml = (currentVariant?.sizes || [])
        .map((s, idx) => {
          const isDisabled = isAgotado || s.stock === 0;
          const isSelected = state?.sizeIdx === idx;
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
          return `<button ${isDisabled ? "disabled" : ""} data-action="select-size" data-product-id="${p.id}" data-size-index="${idx}" onclick="selectSize('${p.id}', ${idx})" class="${classes}">${s.size}</button>`;
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

      // Extracción de galería de fotos (soporta media.images, imágenes, imagenes, images, imageUrl)
      const prodImages = (p.media?.images && p.media.images.length > 0)
        ? p.media.images
        : (Array.isArray(p.imagenes) && p.imagenes.length > 0
            ? p.imagenes
            : (Array.isArray(p.images) && p.images.length > 0
                ? p.images
                : (p.imageUrl ? [p.imageUrl] : [])));

      const frontImg = prodImages[0] || p.imageUrl || 'https://images.unsplash.com/photo-1581636625402-29f2a01222ce';
      const backImg = prodImages.length >= 2 ? prodImages[1] : '';
      const hasMultiplePhotos = Boolean(backImg);

      return `
    <div class="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col group transition-all duration-300 ${isAgotado ? 'opacity-60 grayscale' : ''}">
      ${scarcityBadgeHtml}
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
        data-front-src="${frontImg}"
        ${hasMultiplePhotos ? `data-back-src="${backImg}"` : ''}
        onmouseenter="window.handleCardMouseEnter(this, '${p.id}')" 
        onmouseleave="window.handleCardMouseLeave(this, '${p.id}')"
      >
        <!-- Skeleton loader animado de fondo -->
        <div class="skeleton-placeholder absolute inset-0 bg-slate-800 animate-pulse transition-opacity duration-300 pointer-events-none"></div>
        <!-- Imagen con decodificación asíncrona desacoplada del hilo principal -->
        <img 
          src="${frontImg}" 
          alt="${sanitizeInput(p.name)}" 
          data-front-src="${frontImg}"
          ${hasMultiplePhotos ? `data-back-src="${backImg}"` : ''}
          data-current-view="front"
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
            <h3 class="text-sm sm:text-base font-bold text-white truncate flex-1 min-w-0" title="${sanitizeInput(p.name)}">${p.name}</h3>
          </div>
          <p class="text-xs text-slate-400 line-clamp-2 mb-2">${p.description}</p>
          <div class="my-2">
            <div class="flex gap-1.5 flex-wrap">${sizesHtml}</div>
          </div>
        </div>

        <div class="mt-auto pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <span class="text-[10px] text-slate-400 uppercase font-semibold block leading-none mb-1 sm:hidden truncate">${p.name}</span>
            <p class="text-xs sm:text-sm font-black text-emerald-400 truncate">$${finalPrice.toLocaleString("es-CO")} COP</p>
          </div>
          ${
            !isAgotado
              ? `
            <button data-action="add-to-cart" data-product-id="${p.id}" onclick="addToCart('${p.id}')" class="shrink-0 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-black text-xs px-3.5 py-2.5 rounded-lg transition-all shadow-md shadow-emerald-500/20 uppercase tracking-wider flex items-center gap-1.5" aria-label="Añadir al Carro">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
              <span>Añadir</span>
            </button>
          `
              : `
            <button disabled class="shrink-0 bg-slate-800 text-slate-500 font-bold px-3 py-2 rounded-lg text-xs uppercase tracking-wider cursor-not-allowed pointer-events-none">Agotado</button>
          `
          }
        </div>
      </div>
    </div>
  `;
    })
    .join("");
};

window.selectColor = (productId, colorIdx) => {
  uiState[productId].colorIdx = colorIdx;
  uiState[productId].sizeIdx = null; // reset talla al cambiar color
  renderCatalog();
};

window.selectSize = (productId, sizeIdx) => {
  uiState[productId].sizeIdx = sizeIdx;
  renderCatalog();
};

// Agrega productos integrando el modal flotante de alertas para tallas y stock
window.addToCart = (productId) => {
  const p = products.find((x) => x.id === productId);
  if (!p) return;

  const state = uiState[productId];
  if (!state || state.sizeIdx === null) {
    showNotificationModal("Selecciona tu Talla", "Por favor elige una talla disponible antes de agregar la prenda al carro.");
    return;
  }

  const variant = p.variants[state.colorIdx];
  const sizeObj = variant.sizes[state.sizeIdx];

  const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;

  const existing = cart.find(
    (i) =>
      i.id === p.id && i.color === variant.color && i.size === sizeObj.size,
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
      color: variant.color,
      size: sizeObj.size,
      price: finalPrice,
      priceRegular: p.priceRegular,
      qty: 1,
      maxStock: sizeObj.stock,
      img: p.imageUrl,
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
    appliedCoupon = code;
    updateCartUI();
    showNotificationModal("Cupón Aplicado", `Se activó el beneficio del cupón: ${code}`);
  } else {
    showNotificationModal("Cupón Inválido", "El código ingresado no existe o ya venció.");
    appliedCoupon = null;
    updateCartUI();
  }
};

const updateCartUI = () => {
  const badge = document.getElementById("cart-badge");
  const cartItemsContainer = document.getElementById("cart-items");
  const totalsContainer = document.getElementById("cart-totals");

  let totalItems = 0;
  let subtotal = 0;

  cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    badge.classList.add("hidden");
    cartItemsContainer.innerHTML =
      '<p class="text-gray-400 text-center mt-10">Tu carrito está vacío.</p>';
    totalsContainer.style.display = "none";
    return;
  }

  badge.classList.remove("hidden");
  totalsContainer.style.display = "block";

  cart.forEach((item, idx) => {
    // Blindaje Anti-Tampering: Forzar búsqueda del precio real en el catálogo en memoria
    const masterProduct = products.find((p) => String(p.id) === String(item.id));
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
      <div class="flex gap-4 mb-4 bg-[#1e293b] p-3 rounded-lg relative">
        <img src="${item.img}" class="w-16 h-16 object-cover rounded" alt="${sanitizeInput(item.name)}" onerror="window.handleImageError(this)">
        <div class="flex-1">
          <p class="text-sm font-bold text-white leading-tight">${sanitizeInput(item.name)}</p>
          <p class="text-xs text-gray-400">${sanitizeInput(item.color)} | Talla: ${sanitizeInput(item.size)}</p>
          <p class="text-sm text-green-400 mt-1">$${verifiedUnitPrice.toLocaleString("es-CO")} x${safeQty}</p>
        </div>
        <button data-action="remove-cart-item" data-index="${idx}" onclick="removeCartItem(${idx})" class="absolute top-2 right-2 text-red-500 hover:text-red-400" aria-label="Eliminar prenda"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
      </div>
    `;
  });

  badge.textContent = totalItems;

  // Reglas matemáticas unificadas
  let discount = 0;
  if (appliedCoupon === "WZ2026") {
    discount = Math.round(subtotal * 0.15);
  } else if (appliedCoupon === "WZRECUPERA10") {
    discount = Math.round(subtotal * 0.10);
  }

  const FREE_SHIPPING_THRESHOLD = 300000;
  let shippingCost = SHIP_RATES[shippingType] || 5000;
  const isFreeByThreshold = subtotal >= FREE_SHIPPING_THRESHOLD;

  if (isFreeByThreshold || appliedCoupon === "FREEATHLETE") {
    shippingCost = 0;
  }

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

  const finalTotal = Math.max(0, subtotal - discount + shippingCost);

  document.getElementById("subtotal-val").textContent = `$${subtotal.toLocaleString("es-CO")}`;
  document.getElementById("discount-val").textContent = `-$${discount.toLocaleString("es-CO")}`;
  document.getElementById("shipping-val").textContent = shippingCost === 0 ? "¡GRATIS!" : `$${shippingCost.toLocaleString("es-CO")}`;
  document.getElementById("total-val").textContent = `$${finalTotal.toLocaleString("es-CO")}`;
  document.getElementById("final-buy-btn").dataset.total = finalTotal;
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

  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,40}$/;

  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    showNotificationModal("Datos Inválidos", "Por favor ingresa nombres y apellidos válidos (solo letras sin caracteres especiales).");
    return;
  }
  if (phone.length < 7 || phone.length > 15) {
    showNotificationModal("Teléfono Inválido", "Ingresa un número telefónico válido de entre 7 y 15 dígitos.");
    return;
  }
  if (!city && !postal) {
    showNotificationModal("Ubicación Requerida", "Debes especificar la Ciudad o el Código Postal.");
    return;
  }
  if (addr.length < 5) {
    showNotificationModal("Dirección Incompleta", "Por favor especifica una dirección de entrega válida.");
    return;
  }

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
  let verifiedShipping = SHIP_RATES[shippingType] || 5000;
  if (verifiedSubtotal > 300000 || appliedCoupon === "FREEATHLETE") {
    verifiedShipping = 0;
  }

  const mathematicallyVerifiedTotal = verifiedSubtotal - calculatedDiscount + verifiedShipping;

  // Maquetación del mensaje para despacho por WhatsApp
  let msg = `🔥 *NUEVO PEDIDO WZSTORE* 🔥\n\n`;
  msg += `👤 *Cliente:* ${firstName} ${lastName}\n`;
  msg += `📞 *Teléfono:* ${phone}\n`;
  msg += `📍 *Dirección:* ${addr}${extraAddr ? ` (${extraAddr})` : ""}\n`;
  msg += `🏙️ *Ubicación:* ${city ? city : "C.P. " + postal}${postal && city ? ` (C.P. ${postal})` : ""}\n`;
  msg += `💳 *Método de Pago:* ${paymentMethod}\n`;
  msg += `🚚 *Modalidad de Envío:* ${shippingType === "local" ? "Local" : "Nacional"}\n\n`;
  msg += `*Prendas Solicitadas:*\n`;

  verifiedCartDetails.forEach((item) => {
    const itemQty = Math.max(1, Math.floor(Number(item.qty) || 1));
    msg += `▪ ${item.name}\n   Color: ${item.color} | Talla: ${item.size} | Cant: ${itemQty} | Sub: $${item.subtotal.toLocaleString("es-CO")}\n`;
  });

  // Cálculo del ahorro total del cliente y aplicación de la línea psicológica obligatoria
  const verifiedSavings = (totalRegularCanon + (SHIP_RATES[shippingType] || 5000)) - mathematicallyVerifiedTotal;
  msg += `\n💰 *Total Liquidado: $${mathematicallyVerifiedTotal.toLocaleString("es-CO")} COP*\n`;
  if (verifiedSavings > 0) {
    msg += `🏷️ ¡Ahorro total en WZSTORE por promociones: $${verifiedSavings.toLocaleString("es-CO")} COP!\n`;
  }
  if (appliedCoupon) {
    msg += `🎟️ *Cupón Redimido:* ${appliedCoupon}\n`;
  }

  const whatsappUrl = `https://wa.me/573006724082?text=${encodeURIComponent(msg)}`;

  // Ejecutar redirección protegida a la API de WhatsApp
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");

  // Vaciar carrito y cerrar modal tras despachar la orden
  cart = [];
  appliedCoupon = null;
  saveCart();
  updateCartUI();

  const checkoutModal = document.getElementById("modal-checkout");
  if (checkoutModal) {
    checkoutModal.classList.remove("active");
  }
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
        const video = entry.target.querySelector("video");
        const img = entry.target.querySelector("img");
        if (!video) return;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
          if (img) img.classList.add("hidden");
          video.classList.remove("hidden", "opacity-0");
          video.play().catch(() => {});
        } else {
          video.pause();
          video.classList.add("opacity-0", "hidden");
          if (img) img.classList.remove("hidden");
        }
      });
    },
    { threshold: [0, 0.7] }
  );

  document.querySelectorAll(".product-media-container").forEach((el) => {
    mobileVideoObserver.observe(el);
  });
};

window.addEventListener("resize", initMobileVideoObserver);

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
  phone: "573159998877", // Canal exclusivo de asesoría postventa
  agentName: "Equipo de Atención Técnica WZ"
};

window.openSupportChat = (customContext = "") => {
  const timeHour = new Date().toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
  const msgText = `Hola ${WZ_SUPPORT_CONFIG.agentName}, solicito asesoría personalizada en línea (${timeHour}). ${customContext ? `Motivo: ${customContext}` : '¿Podrían orientarme con un producto?'}`.trim();
  const supportUrl = `https://wa.me/${WZ_SUPPORT_CONFIG.phone}?text=${encodeURIComponent(msgText)}`;
  window.open(supportUrl, "_blank", "noopener,noreferrer");
};

// Controlador unificado del Modal de Tienda (reemplazo de alertas nativas)
window.showNotificationModal = (title, message) => window.showStoreModal(message, title);
window.closeNotificationModal = () => window.closeStoreModal();
