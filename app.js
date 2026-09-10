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
let currentFilter = {
  text: '',
  category: 'all',
  gender: 'ambos',
  size: 'all',
  sport: 'all',
  onlyOffers: false,
  sortBy: 'default' // 'price-asc', 'price-desc', 'alpha-az', 'discount-desc'
};

window.handleParentCategory = (cat) => {
  currentFilter.category = cat;
  const modal = document.getElementById('gender-discriminator');
  if (cat !== 'all' && cat !== 'Accesorios') {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
    currentFilter.gender = 'ambos';
  }
  executeMasterFilters();
};

window.applyGenderFilter = (gender) => {
  currentFilter.gender = gender;
  document.getElementById('gender-discriminator').classList.add('hidden');
  executeMasterFilters();
};

// Motor Algorítmico Multidimensional
const executeMasterFilters = () => {
  let result = [...products];

  // 1. Filtro Texto
  if (currentFilter.text) {
    result = result.filter(p => p.name.toLowerCase().includes(currentFilter.text));
  }
  // 2. Filtro Categoría Padre
  if (currentFilter.category !== 'all') {
    result = result.filter(p => p.category?.toLowerCase() === currentFilter.category.toLowerCase() || p.type?.toLowerCase() === currentFilter.category.toLowerCase());
  }
  // 3. Filtro Género
  if (currentFilter.gender !== 'ambos') {
    result = result.filter(p => p.gender?.toLowerCase() === currentFilter.gender.toLowerCase() || p.category?.toLowerCase() === currentFilter.gender.toLowerCase());
  }
  // 4. Filtro Ofertas Activas
  if (currentFilter.onlyOffers) {
    result = result.filter(p => p.isOffer);
  }

  // 5. Algoritmo de Ordenamiento
  switch (currentFilter.sortBy) {
    case 'price-asc':
      result.sort((a, b) => (a.isOffer ? a.priceOffer : a.priceRegular) - (b.isOffer ? b.priceOffer : b.priceRegular));
      break;
    case 'price-desc':
      result.sort((a, b) => (b.isOffer ? b.priceOffer : b.priceRegular) - (a.isOffer ? a.priceOffer : a.priceRegular));
      break;
    case 'alpha-az':
      result.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'discount-desc':
      result.sort((a, b) => {
        const discA = a.isOffer ? ((a.priceRegular - a.priceOffer) / a.priceRegular) : 0;
        const discB = b.isOffer ? ((b.priceRegular - b.priceOffer) / b.priceRegular) : 0;
        return discB - discA;
      });
      break;
  }

  renderFilteredCatalog(result);
};

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
  // Filtros Concurrentes con Debounce
  let debounceTimer;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentFilter.text = sanitizeInput(e.target.value.toLowerCase());
      renderCatalog();
    }, 300);
  });

  document.getElementById("price-range").addEventListener("input", (e) => {
    currentFilter.maxPrice = parseInt(e.target.value);
    document.getElementById("price-label").textContent =
      `$${currentFilter.maxPrice.toLocaleString()}`;
    renderCatalog();
  });

  document.querySelectorAll(".cat-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".cat-btn")
        .forEach((b) => b.classList.remove("bg-green-500", "text-white"));
      e.target.classList.add("bg-green-500", "text-white");
      currentFilter.category = e.target.dataset.cat;
      renderCatalog();
    });
  });

  // Drawer
  document.getElementById("cart-btn").addEventListener("click", openDrawer);
  document
    .getElementById("close-drawer")
    .addEventListener("click", closeDrawer);
  document
    .getElementById("drawer-overlay")
    .addEventListener("click", closeDrawer);

  // Lógica Carrito (Cupones y Envío)
  document
    .getElementById("apply-coupon")
    .addEventListener("click", applyCouponLogic);
  document.getElementById("shipping-select").addEventListener("change", (e) => {
    shippingType = e.target.value;
    updateCartUI();
  });

  // Compartir Carrito
  document
    .getElementById("share-cart-btn")
    .addEventListener("click", shareCartUrl);

  // Checkout
  document.getElementById("checkout-btn").addEventListener("click", () => {
    if (cart.length === 0) return;
    document.getElementById("modal-checkout").classList.add("active");
    closeDrawer();
  });
  document.getElementById("close-modal").addEventListener("click", () => {
    document.getElementById("modal-checkout").classList.remove("active");
  });
  document
    .getElementById("final-buy-btn")
    .addEventListener("click", processCheckout);
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

const renderCatalog = () => {
  const grid = document.getElementById("catalog-grid");
  const filtered = products.filter((p) => {
    const matchText = p.name.toLowerCase().includes(currentFilter.text);
    const matchCat =
      currentFilter.category === "all" || p.category === currentFilter.category;
    const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;
    const matchPrice = finalPrice <= currentFilter.maxPrice;
    return matchText && matchCat && matchPrice;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 col-span-full text-center py-10">No se encontraron productos.</p>`;
    return;
  }

  grid.innerHTML = filtered
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

// Recuperador de Carrito URL
const shareCartUrl = () => {
  const base64cart = btoa(JSON.stringify(cart));
  const url = `${window.location.origin}${window.location.pathname}?cart=${base64cart}`;
  navigator.clipboard
    .writeText(url)
    .then(() => alert("¡Enlace de carrito copiado! Compártelo."));
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

// Checkout & Validación RegEx & WhatsApp Segura
const processCheckout = () => {
  if (!cart || cart.length === 0) {
    return alert("Tu carrito está vacío. Agrega prendas antes de continuar.");
  }

  const name = sanitizeInput(document.getElementById("chk-name").value);
  const phone = sanitizeInput(document.getElementById("chk-phone").value);
  const addr = sanitizeInput(document.getElementById("chk-addr").value);

  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  const phoneRegex = /^\d{7,15}$/;

  if (!nameRegex.test(name))
    return alert("El nombre solo debe contener letras.");
  if (!phoneRegex.test(phone))
    return alert("El teléfono debe contener entre 7 y 15 dígitos numéricos.");
  if (addr.trim() === "") return alert("La dirección es obligatoria.");

  const finalTotal = document.getElementById("final-buy-btn").dataset.total;

  let msg = `🔥 *NUEVO PEDIDO WZSTORE* 🔥\n\n👤 Cliente: ${name}\n📍 Dirección: ${addr}\n📞 Tel: ${phone}\n\n*Detalle del Pedido:*\n`;
  let totalRegular = 0;

  // Construcción del detalle y cálculo de precio regular en una sola pasada
  cart.forEach((item) => {
    msg += `▪ ${item.name}\n  Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.qty}\n`;
    const regularItemPrice = item.priceRegular || item.price;
    totalRegular += regularItemPrice * item.qty;
  });

  // El ahorro toma en cuenta ofertas directas y cupones sobre el valor final
  const totalSavings = totalRegular - Number(finalTotal);

  msg += `\n💰 *Total a liquidar: $${Number(finalTotal).toLocaleString('es-CO')} COP*\n`;
  if (totalSavings > 0) {
    msg += `🏷️ *¡Ahorro total en esta orden por promociones de WZSTORE: $${totalSavings.toLocaleString('es-CO')} COP!*\n`;
  }
  if (appliedCoupon) msg += `🎟️ Cupón aplicado: ${appliedCoupon}\n`;

  const url = `https://wa.me/573006724082?text=${encodeURIComponent(msg)}`;
  
  // Redirección segura
  window.open(url, "_blank", "noopener,noreferrer");

  // Limpieza y reseteo post-compra
  cart = [];
  appliedCoupon = null;
  if (typeof saveCart === "function") saveCart();
  if (typeof updateCartUI === "function") updateCartUI();

  // Cierre del modal de checkout
  const checkoutModal = document.getElementById("checkout-modal") || document.getElementById("modal-checkout");
  if (checkoutModal) {
    checkoutModal.classList.add("hidden");
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