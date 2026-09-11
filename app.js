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

// Inicialización blindada contra fallos de almacenamiento o datos corruptos
const initApp = () => {
  const rawProducts = safeStorage.getItem("wz_core_products") || safeStorage.getItem("wz_products");

  if (!rawProducts) {
    const initialData = (typeof INITIAL_DATABASE !== "undefined" && Array.isArray(INITIAL_DATABASE))
      ? INITIAL_DATABASE
      : [];
    products = initialData;
    safeStorage.setItem("wz_core_products", JSON.stringify(initialData));
    safeStorage.setItem("wz_products", JSON.stringify(initialData));
  } else {
    try {
      const parsed = JSON.parse(rawProducts);
      products = Array.isArray(parsed) && parsed.length > 0 ? parsed : (INITIAL_DATABASE || []);
    } catch (e) {
      products = (typeof INITIAL_DATABASE !== "undefined" && Array.isArray(INITIAL_DATABASE)) ? INITIAL_DATABASE : [];
    }
  }

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

// Arrancar al cargar la vista con soporte Sticky Mobile y Media Observers
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  recoverCartFromUrl();
  setupEventListeners();
  initMobileVideoObserver();

  // Despliegue inteligente del Sticky Bar en móviles según umbral de scroll
  const stickyBar = document.getElementById("wz-sticky-bar");
  if (stickyBar) {
    let lastScrollY = window.scrollY;
    window.addEventListener("scroll", () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > 280) {
        stickyBar.classList.remove("translate-y-full");
      } else {
        stickyBar.classList.add("translate-y-full");
      }
      lastScrollY = currentScrollY;
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
  // Filtro de b squeda por texto reactivo
  let debounceTimer;
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentFilter.text = sanitizeInput(e.target.value.toLowerCase());
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

        return `<button type="button" ${isOutOfStock ? "disabled" : ""} onclick="selectHeroSize(${idx})" class="${baseClass} ${stateClass}">${s.size}</button>`;
      })
      .join("");
  }

  // Adición directa al carrito sincronizando la talla escogida
  if (buyBtn) {
    buyBtn.onclick = () => {
      if (heroSelectedSizeIdx === null || heroSelectedSizeIdx === -1) {
        showNotificationModal("Selecciona una Talla", "Por favor elige una talla disponible para el Drop de la Semana.");
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
          return `<button ${isDisabled ? "disabled" : ""} onclick="selectSize('${p.id}', ${idx})" class="${classes}">${s.size}</button>`;
        })
        .join("");

      // Análisis de escasez para badges de urgencia (CRO / FOMO)
      let scarcityBadgeHtml = "";
      if (!isAgotado) {
        if (totalStock <= 3 && totalStock > 0) {
          scarcityBadgeHtml = `
            <span class="absolute top-3 left-3 z-10 bg-amber-500 text-black text-[10px] font-black uppercase px-2.5 py-1 rounded-md shadow-lg shadow-amber-500/20 tracking-wider flex items-center gap-1">
              ⚡ ¡ÚLTIMAS ${totalStock} UDS!
            </span>
          `;
        } else if (p.badge) {
          scarcityBadgeHtml = `
            <span class="absolute top-3 left-3 z-10 bg-emerald-500 text-black text-[10px] font-black uppercase px-2.5 py-1 rounded-md shadow-lg tracking-wider">
              ${p.badge}
            </span>
          `;
        }
      }

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
      <div class="product-media-container relative h-64 bg-slate-950 overflow-hidden" onmouseenter="${!isAgotado ? `playProductVideo(this, '${p.id}')` : ''}" onmouseleave="${!isAgotado ? `stopProductVideo(this, '${p.id}')` : ''}">
        <img src="${p.imageUrl || (p.media?.images && p.media.images[0]) || 'https://images.unsplash.com/photo-1581636625402-29f2a01222ce'}" alt="${p.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy">
      </div>
      <div class="p-4 flex flex-col flex-grow">
        <h3 class="text-base font-bold text-white truncate">${p.name}</h3>
        <p class="text-xs text-slate-400 line-clamp-2 my-1">${p.description}</p>
        <p class="text-sm font-black text-emerald-400 my-2">$${finalPrice.toLocaleString("es-CO")} COP</p>
        
        <div class="my-2">
          <div class="flex gap-2 flex-wrap">${sizesHtml}</div>
        </div>
        ${
          !isAgotado
            ? `
          <button onclick="addToCart('${p.id}')" class="mt-auto w-full bg-emerald-500 text-black font-bold py-2 rounded text-xs uppercase tracking-wider hover:bg-emerald-400 transition-colors">Añadir al Carro</button>
        `
            : `
          <button disabled class="mt-auto w-full bg-slate-800 text-slate-500 font-bold py-2 rounded text-xs uppercase tracking-wider cursor-not-allowed pointer-events-none">Agotado</button>
        `
        }
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
    totalItems += item.qty;
    subtotal += item.price * item.qty;
    cartItemsContainer.innerHTML += `
      <div class="flex gap-4 mb-4 bg-[#1e293b] p-3 rounded-lg relative">
        <img src="${item.img}" class="w-16 h-16 object-cover rounded">
        <div class="flex-1">
          <p class="text-sm font-bold text-white leading-tight">${item.name}</p>
          <p class="text-xs text-gray-400">${item.color} | Talla: ${item.size}</p>
          <p class="text-sm text-green-400 mt-1">$${item.price.toLocaleString()} x${item.qty}</p>
        </div>
        <button onclick="removeCartItem(${idx})" class="absolute top-2 right-2 text-red-500 hover:text-red-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
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

  // Actualización reactiva de la barra de progreso de envío gratuito
  const progressTextEl = document.getElementById("wz-shipping-progress-text");
  const progressPctEl = document.getElementById("wz-shipping-progress-pct");
  const progressBarEl = document.getElementById("wz-shipping-progress-bar");

  if (progressTextEl && progressPctEl && progressBarEl) {
    if (isFreeByThreshold || appliedCoupon === "FREEATHLETE") {
      progressTextEl.innerHTML = `🎉 <span class="text-emerald-400 font-black">¡ENVÍO GRATUITO ACREDITADO!</span>`;
      progressPctEl.textContent = "100%";
      progressBarEl.style.width = "100%";
      progressBarEl.classList.add("shadow-[0_0_12px_rgba(52,211,153,0.6)]");
    } else {
      const remainingForFree = FREE_SHIPPING_THRESHOLD - subtotal;
      const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
      progressTextEl.innerHTML = `Agrega <strong class="text-emerald-400 font-bold">$${remainingForFree.toLocaleString("es-CO")} COP</strong> para flete gratis`;
      progressPctEl.textContent = `${pct}%`;
      progressBarEl.style.width = `${pct}%`;
      progressBarEl.classList.remove("shadow-[0_0_12px_rgba(52,211,153,0.6)]");
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
const shareCartUrl = () => {
  if (!cart || cart.length === 0) {
    showNotificationModal("Carrito Vacío", "No tienes productos en el carro para compartir.");
    return;
  }
  try {
    const base64cart = btoa(unescape(encodeURIComponent(JSON.stringify(cart))));
    const url = `${window.location.origin}${window.location.pathname}?cart=${base64cart}`;
    navigator.clipboard.writeText(url).then(() => {
      showNotificationModal("Enlace Generado", "El enlace de tu carrito se copió al portapapeles. Ya puedes enviarlo.");
    }).catch(() => {
      showNotificationModal("Aviso", `Copia este enlace manualmente:\n${url}`);
    });
  } catch (err) {
    console.error("Error al codificar el carrito:", err);
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
      const cleanId = String(incomingItem.id || "").replace(/[^a-zA-Z0-9_-]/g, "");
      const authenticProduct = products.find((p) => String(p.id) === cleanId);

      // Si el producto no existe o está agotado en catálogo, se descarta
      if (!authenticProduct || authenticProduct.status === "agotado" || authenticProduct.isAvailable === false) {
        return;
      }

      // Validar coincidencia de variante de color
      const incomingColor = sanitizeInput(String(incomingItem.color || ""));
      const matchedVariant = authenticProduct.variants?.find(
        (v) => v.color.toLowerCase() === incomingColor.toLowerCase()
      ) || authenticProduct.variants?.[0];

      if (!matchedVariant) return;

      // Validar coincidencia de talla y stock físico disponible
      const incomingSize = sanitizeInput(String(incomingItem.size || "")).toUpperCase();
      const matchedSizeObj = matchedVariant.sizes?.find((s) => s.size === incomingSize);

      if (!matchedSizeObj || matchedSizeObj.stock <= 0) return;

      // Imponer precio oficial del inventario local (inmunidad contra alteración de precios)
      const officialPrice = authenticProduct.isOffer ? authenticProduct.priceOffer : authenticProduct.priceRegular;
      const verifiedQty = Math.max(1, Math.min(Math.floor(Number(incomingItem.qty) || 1), matchedSizeObj.stock));

      validatedCart.push({
        id: authenticProduct.id,
        name: authenticProduct.name,
        color: matchedVariant.color,
        size: matchedSizeObj.size,
        price: officialPrice,
        priceRegular: authenticProduct.priceRegular,
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

  // Búsqueda tolerante en almacenamiento unificado y memoria de productos
  let canonProducts = [];
  try {
    const rawStored = localStorage.getItem("wz_core_products") || localStorage.getItem("wz_products");
    canonProducts = rawStored ? JSON.parse(rawStored) : (products || []);
  } catch (err) {
    canonProducts = products || [];
  }

  let verifiedSubtotal = 0;
  let totalRegularCanon = 0;
  let verifiedCartDetails = [];

  for (const item of cart) {
    const original = canonProducts.find((p) => String(p.id) === String(item.id)) || products.find((p) => String(p.id) === String(item.id));
    if (!original) {
      showNotificationModal("Catálogo Desactualizado", "Uno de los productos ya no se encuentra en el inventario.");
      return;
    }

    // Precio oficial fijado desde la base canónica
    const authenticPrice = original.isOffer ? original.priceOffer : original.priceRegular;
    const authenticRegularPrice = original.priceRegular || authenticPrice;
    const safeQty = Math.max(1, Math.floor(Number(item.qty) || 1));

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
    msg += `▪ ${item.name}\n   Color: ${item.color} | Talla: ${item.size} | Cant: ${item.qty} | Sub: $${item.subtotal.toLocaleString("es-CO")}\n`;
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
  // En pantallas táctiles móviles el IntersectionObserver gestiona la reproducción
  if (window.innerWidth < 1024) return;

  const prod = products.find((p) => String(p.id) === String(productId));
  if (!prod?.media?.video) return;

  const img = container.querySelector("img");
  let video = container.querySelector("video");

  if (!video) {
    video = document.createElement("video");
    video.src = prod.media.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.className = "w-full h-full object-cover transition-opacity duration-300 opacity-0";
    container.appendChild(video);
  }

  if (img) img.classList.add("hidden");
  video.classList.remove("hidden");
  setTimeout(() => video.classList.remove("opacity-0"), 20);
  video.play().catch(() => {});
};

window.stopProductVideo = (container) => {
  if (window.innerWidth < 1024) return;

  const img = container.querySelector("img");
  const video = container.querySelector("video");
  if (video) {
    video.pause();
    video.currentTime = 0;
    video.classList.add("opacity-0", "hidden");
  }
  if (img) {
    img.classList.remove("hidden");
  }
};

window.calculateRecommendedSize = () => {
  const h = Number(document.getElementById('wz-calc-height').value);
  const w = Number(document.getElementById('wz-calc-weight').value);
  const out = document.getElementById('wz-size-result');

  if (!h || !w || h <= 0 || w <= 0) {
    out.classList.remove('hidden');
    out.innerHTML = `<span class="text-red-400">Ingresa valores válidos de peso y estatura.</span>`;
    return;
  }

  const imc = w / ((h / 100) * (h / 100));
  let size = "M";

  if (imc < 20) size = "S";
  else if (imc >= 20 && imc < 25) size = (h > 175) ? "M" : "S";
  else if (imc >= 25 && imc < 29) size = (h > 180) ? "XL" : "L";
  else size = "XL";

  out.classList.remove('hidden');
  out.innerHTML = `Tu talla recomendada para corte de compresión es: <strong class="text-emerald-400 text-sm font-black">${size}</strong>`;
};

// ==========================================
// CANAL EXCLUSIVO DE ATENCIÓN Y SOPORTE (POSTVENTA)
// ==========================================
// Configuración parametrizable del canal de ayuda (línea independiente de ventas)
const WZ_SUPPORT_CONFIG = {
  phone: "573159998877", // Número de soporte técnico y atención posventa
  defaultMessage: "Hola WZSTORE, necesito ayuda con una consulta sobre la tienda."
};

window.openSupportChat = () => {
  const encodedText = encodeURIComponent(WZ_SUPPORT_CONFIG.defaultMessage);
  const supportUrl = `https://wa.me/${WZ_SUPPORT_CONFIG.phone}?text=${encodedText}`;
  window.open(supportUrl, "_blank", "noopener,noreferrer");
};

// Controlador de notificaciones modales flotantes no invasivas
window.showNotificationModal = (title, message) => {
  const modal = document.getElementById("wz-alert-modal");
  const titleEl = document.getElementById("wz-alert-title");
  const bodyEl = document.getElementById("wz-alert-body");

  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.textContent = message;

  if (modal) {
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  }
};

window.closeNotificationModal = () => {
  const modal = document.getElementById("wz-alert-modal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
};
