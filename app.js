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
// Filtros iniciales con precio tope infinito para no bloquear productos
let currentFilter = {
  text: '',
  category: 'all',
  gender: 'ambos',
  size: 'all',
  sport: 'all',
  onlyOffers: false,
  sortBy: 'default',
  maxPrice: Infinity
};

// Gestión de cascada para categorías principales y revelación de género
window.handleParentCategory = (categoryName) => {
  currentFilter.category = categoryName;

  // Actualizar estilos activos de las píldoras de categoría
  document.querySelectorAll(".cat-pill").forEach((btn) => {
    btn.className = "cat-pill bg-slate-800 text-slate-300 hover:text-white px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all";
  });

  const activeBtn = Array.from(document.querySelectorAll(".cat-pill")).find(
    (btn) => btn.textContent.trim().toLowerCase() === (categoryName === 'all' ? 'todos' : categoryName.toLowerCase())
  );
  if (activeBtn) {
    activeBtn.className = "cat-pill bg-emerald-500 text-black px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all";
  }

  // Desplegar u ocultar selector secundario de género según la selección
  const genderContainer = document.getElementById("gender-discriminator");
  if (genderContainer) {
    if (categoryName === "all" || categoryName.toLowerCase() === "accesorios") {
      genderContainer.classList.add("hidden");
      currentFilter.gender = "todas";
    } else {
      genderContainer.classList.remove("hidden");
    }
  }

  // Reiniciar estado visual de los botones de género
  window.applyGenderFilter("todas", false);
  executeMasterFilters();
};

// Aplicación reactiva del filtro de género
window.applyGenderFilter = (genderValue, shouldExecute = true) => {
  currentFilter.gender = genderValue.toLowerCase();

  // Refrescar estilos activos de género
  document.querySelectorAll(".gender-pill").forEach((btn) => {
    btn.className = "gender-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors";
  });

  const activeGenderBtn = document.getElementById(`gender-btn-${genderValue.toLowerCase()}`);
  if (activeGenderBtn) {
    activeGenderBtn.className = "gender-pill px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-black transition-colors";
  }

  if (shouldExecute) {
    executeMasterFilters();
  }
};

// Motor centralizado de filtrado que unifica categoría, género, texto y precio
const executeMasterFilters = () => {
  let result = [...products];

  // Filtro de texto por nombre
  if (currentFilter.text) {
    result = result.filter((p) => p.name.toLowerCase().includes(currentFilter.text));
  }

  // Filtro de categoría principal
  if (currentFilter.category && currentFilter.category !== "all") {
    result = result.filter((p) => {
      const catMatch = p.category?.toLowerCase() === currentFilter.category.toLowerCase();
      const nameMatch = p.name?.toLowerCase().includes(currentFilter.category.toLowerCase());
      return catMatch || nameMatch;
    });
  }

  // Filtro secundario de género en cascada
  if (currentFilter.gender && currentFilter.gender !== "todas" && currentFilter.gender !== "ambos") {
    result = result.filter((p) => {
      const pGender = (p.gender || p.category || "").toLowerCase();
      return pGender.includes(currentFilter.gender);
    });
  }

  // Filtro por precio tope
  if (currentFilter.maxPrice !== Infinity && !isNaN(currentFilter.maxPrice)) {
    result = result.filter((p) => {
      const price = p.isOffer ? p.priceOffer : p.priceRegular;
      return price <= currentFilter.maxPrice;
    });
  }

  renderCatalog(result);
};

// Enlace de compatibilidad con renderizado directo
window.renderFilteredCatalog = (customList) => renderCatalog(customList);

// Variables de Envío y Cupones
let appliedCoupon = null; // 'WZ2026' | 'FREEATHLETE'
let shippingType = "local"; // 'local' | 'nacional'
const SHIP_RATES = { local: 5000, nacional: 20000 };

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  recoverCartFromUrl();
  setupEventListeners();
});

const initApp = () => {
  const stored = localStorage.getItem("wz_core_products");
  if (!stored) {
    localStorage.setItem("wz_core_products", JSON.stringify(INITIAL_DATABASE));
    products = INITIAL_DATABASE;
  } else {
    products = JSON.parse(stored);
  }

  // Cargar carrito local
  const storedCart = localStorage.getItem("wz_cart");
  if (storedCart) cart = JSON.parse(storedCart);

  // Inicializar UI State
  products.forEach((p) => {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  });

  renderSkeleton();
  setTimeout(() => renderCatalog(), 600); // LCP optimization simulation
  updateCartUI();
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

// Renderizado Catálogo
const renderSkeleton = () => {
  const grid = document.getElementById("catalog-grid");
  grid.innerHTML = Array(8)
    .fill()
    .map(
      () => `
    <div class="bg-[#111726] border border-[#1e293b] rounded-xl p-4 h-96 skeleton-box"></div>
  `,
    )
    .join("");
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

      return `
    <div class="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col group">
      ${
        isAgotado
          ? `
        <!-- Overlay Agotado Infranqueable -->
        <div class="absolute inset-0 z-20 backdrop-blur-sm bg-black/75 flex flex-col items-center justify-center p-4">
          <span class="bg-red-600 text-white font-black text-sm px-4 py-1.5 rounded-full tracking-widest uppercase shadow-lg shadow-red-900/50">AGOTADO</span>
          <p class="text-[11px] text-slate-400 mt-2 text-center font-medium">Prenda fuera de stock técnico</p>
        </div>
      `
          : ""
      }
      <div class="relative h-64 bg-slate-950 overflow-hidden" onmouseenter="playProductVideo(this, '${p.id}')" onmouseleave="stopProductVideo(this, '${p.id}')">
        <img src="${p.imageUrl || p.media?.images?.[0]}" alt="${p.name}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy">
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
          <button disabled class="mt-auto w-full bg-slate-800 text-slate-500 font-bold py-2 rounded text-xs uppercase tracking-wider cursor-not-allowed">No Disponible</button>
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

// Lógica de Compra Reactiva
window.addToCart = (productId) => {
  const p = products.find((x) => x.id === productId);
  const state = uiState[productId];
  if (state.sizeIdx === null)
    return alert("Selecciona una talla antes de agregar al carrito.");

  const variant = p.variants[state.colorIdx];
  const sizeObj = variant.sizes[state.sizeIdx];

  const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;

  const existing = cart.find(
    (i) =>
      i.id === p.id && i.color === variant.color && i.size === sizeObj.size,
  );

  if (existing) {
    if (existing.qty >= sizeObj.stock)
      return alert("Has alcanzado el límite de stock de este artículo.");
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

const saveCart = () => {
  localStorage.setItem("wz_cart", JSON.stringify(cart));
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
  if (code === "WZ2026" || code === "FREEATHLETE") {
    appliedCoupon = code;
    updateCartUI();
  } else {
    alert("Cupón no válido.");
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

  // Reglas matemáticas
  let discount = 0;
  if (appliedCoupon === "WZ2026") discount = subtotal * 0.15;

  let shippingCost = SHIP_RATES[shippingType];
  if (subtotal > 300000 || appliedCoupon === "FREEATHLETE") shippingCost = 0;

  const finalTotal = subtotal - discount + shippingCost;

  document.getElementById("subtotal-val").textContent =
    `$${subtotal.toLocaleString()}`;
  document.getElementById("discount-val").textContent =
    `-$${discount.toLocaleString()}`;
  document.getElementById("shipping-val").textContent =
    shippingCost === 0 ? "¡GRATIS!" : `$${shippingCost.toLocaleString()}`;
  document.getElementById("total-val").textContent =
    `$${finalTotal.toLocaleString()}`;
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

const recoverCartFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const cartParam = params.get("cart");
  if (cartParam) {
    try {
      cart = JSON.parse(atob(cartParam));
      saveCart();
      // Elimina param de la URL limpio
      window.history.replaceState({}, document.title, window.location.pathname);
      openDrawer();
    } catch (e) {
      console.error("URL Invalida de carrito");
    }
  }
};

// Validación integral de checkout y formateo de orden para WhatsApp
const processCheckout = () => {
  if (!cart || cart.length === 0) {
    showNotificationModal("Carro Vacío", "No tienes artículos agregados en la orden.");
    return;
  }

  const firstName = sanitizeInput(document.getElementById("chk-firstname")?.value.trim() || "");
  const lastName = sanitizeInput(document.getElementById("chk-lastname")?.value.trim() || "");
  const phone = sanitizeInput(document.getElementById("chk-phone")?.value.trim() || "");
  const city = sanitizeInput(document.getElementById("chk-city")?.value.trim() || "");
  const postal = sanitizeInput(document.getElementById("chk-postal")?.value.trim() || "");
  const addr = sanitizeInput(document.getElementById("chk-addr")?.value.trim() || "");
  const extraAddr = sanitizeInput(document.getElementById("chk-extra-addr")?.value.trim() || "");
  const paymentMethod = document.getElementById("chk-payment-method")?.value || "Transferencia Bancaria";

  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/;
  const phoneRegex = /^\d{7,15}$/;

  // Reglas de validación
  if (!nameRegex.test(firstName)) {
    showNotificationModal("Datos Incompletos", "Por favor ingresa un nombre válido (solo letras).");
    return;
  }
  if (!nameRegex.test(lastName)) {
    showNotificationModal("Datos Incompletos", "Por favor ingresa un apellido válido (solo letras).");
    return;
  }
  if (!phoneRegex.test(phone)) {
    showNotificationModal("Teléfono Inválido", "Ingresa un número telefónico válido de entre 7 y 15 dígitos.");
    return;
  }
  if (!city && !postal) {
    showNotificationModal("Ubicación Requerida", "Debes especificar la Ciudad o, en su defecto, el Código Postal.");
    return;
  }
  if (!addr) {
    showNotificationModal("Dirección Requerida", "Por favor especifica la dirección de entrega.");
    return;
  }

  const finalTotal = document.getElementById("final-buy-btn").dataset.total;
  let totalRegular = 0;

  let msg = `🔥 *NUEVO PEDIDO WZSTORE* 🔥\n\n`;
  msg += `👤 *Cliente:* ${firstName} ${lastName}\n`;
  msg += `📞 *Teléfono:* ${phone}\n`;
  msg += `📍 *Dirección:* ${addr}${extraAddr ? ` (${extraAddr})` : ""}\n`;
  msg += `🏙️ *Ubicación:* ${city ? city : "C.P. " + postal}${postal && city ? ` (C.P. ${postal})` : ""}\n`;
  msg += `💳 *Método de Pago:* ${paymentMethod}\n`;
  msg += `🚚 *Modalidad de Envío:* ${shippingType === "local" ? "Local" : "Nacional"}\n\n`;
  msg += `*Prendas Solicitadas:*\n`;

  cart.forEach((item) => {
    msg += `▪ ${item.name}\n   Color: ${item.color} | Talla: ${item.size} | Cant: ${item.qty} | Sub: $${(item.price * item.qty).toLocaleString("es-CO")}\n`;
    totalRegular += (item.priceRegular || item.price) * item.qty;
  });

  const totalSavings = totalRegular - Number(finalTotal);
  msg += `\n💰 *Total Liquidado: $${Number(finalTotal).toLocaleString("es-CO")} COP*\n`;
  if (totalSavings > 0) {
    msg += `🏷️ *Ahorro en Descuentos: $${totalSavings.toLocaleString("es-CO")} COP*\n`;
  }
  if (appliedCoupon) {
    msg += `🎟️ *Cupón Redimido:* ${appliedCoupon}\n`;
  }

  const whatsappUrl = `https://wa.me/573006724082?text=${encodeURIComponent(msg)}`;
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
// CONTROL DE VIDEO STREAMING EN HOVER
// ==========================================
window.playProductVideo = (container, productId) => {
  const prod = products.find(p => p.id === productId);
  if (!prod?.media?.video) return;

  const img = container.querySelector('img');
  let video = container.querySelector('video');

  if (!video) {
    video = document.createElement('video');
    video.src = prod.media.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.className = "w-full h-full object-cover transition-opacity duration-300 opacity-0";
    container.appendChild(video);
  }

  img.classList.add('hidden');
  video.classList.remove('hidden');
  setTimeout(() => video.classList.remove('opacity-0'), 20);
  video.play().catch(() => {});
};

window.stopProductVideo = (container) => {
  const img = container.querySelector('img');
  const video = container.querySelector('video');
  if (video) {
    video.pause();
    video.classList.add('opacity-0');
    video.classList.add('hidden');
  }
  if (img) img.classList.remove('hidden');
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
