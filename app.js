// Sanitización XSS Central
const sanitizeInput = (text) => {
  const map = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
  const reg = /[<>"'/]/ig;
  return text.replace(reg, (match) => (map[match]));
};

let products = [];
let cart = [];
let uiState = {}; // Guarda estado del selector de color/talla por producto
let currentFilter = { text: '', category: 'all', maxPrice: 500000 };

// Variables de Envío y Cupones
let appliedCoupon = null; // 'WZ2026' | 'FREEATHLETE'
let shippingType = 'local'; // 'local' | 'nacional'
const SHIP_RATES = { local: 5000, nacional: 20000 };

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  recoverCartFromUrl();
  setupEventListeners();
});

const initApp = () => {
  const stored = localStorage.getItem('wz_core_products');
  if (!stored) {
    localStorage.setItem('wz_core_products', JSON.stringify(INITIAL_DATABASE));
    products = INITIAL_DATABASE;
  } else {
    products = JSON.parse(stored);
  }
  
  // Cargar carrito local
  const storedCart = localStorage.getItem('wz_cart');
  if (storedCart) cart = JSON.parse(storedCart);
  
  // Inicializar UI State
  products.forEach(p => {
    uiState[p.id] = { colorIdx: 0, sizeIdx: null };
  });

  renderSkeleton();
  setTimeout(() => renderCatalog(), 600); // LCP optimization simulation
  updateCartUI();
};

const setupEventListeners = () => {
  // Filtros Concurrentes con Debounce
  let debounceTimer;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentFilter.text = sanitizeInput(e.target.value.toLowerCase());
      renderCatalog();
    }, 300);
  });

  document.getElementById('price-range').addEventListener('input', (e) => {
    currentFilter.maxPrice = parseInt(e.target.value);
    document.getElementById('price-label').textContent = `$${currentFilter.maxPrice.toLocaleString()}`;
    renderCatalog();
  });

  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('bg-green-500', 'text-white'));
      e.target.classList.add('bg-green-500', 'text-white');
      currentFilter.category = e.target.dataset.cat;
      renderCatalog();
    });
  });

  // Drawer
  document.getElementById('cart-btn').addEventListener('click', openDrawer);
  document.getElementById('close-drawer').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);

  // Lógica Carrito (Cupones y Envío)
  document.getElementById('apply-coupon').addEventListener('click', applyCouponLogic);
  document.getElementById('shipping-select').addEventListener('change', (e) => {
    shippingType = e.target.value;
    updateCartUI();
  });

  // Compartir Carrito
  document.getElementById('share-cart-btn').addEventListener('click', shareCartUrl);
  
  // Checkout
  document.getElementById('checkout-btn').addEventListener('click', () => {
    if(cart.length === 0) return;
    document.getElementById('modal-checkout').classList.add('active');
    closeDrawer();
  });
  document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('modal-checkout').classList.remove('active');
  });
  document.getElementById('final-buy-btn').addEventListener('click', processCheckout);
};

// Renderizado Catálogo
const renderSkeleton = () => {
  const grid = document.getElementById('catalog-grid');
  grid.innerHTML = Array(8).fill().map(() => `
    <div class="bg-[#111726] border border-[#1e293b] rounded-xl p-4 h-96 skeleton-box"></div>
  `).join('');
};

const renderCatalog = () => {
  const grid = document.getElementById('catalog-grid');
  
  const filtered = products.filter(p => {
    const matchText = p.name.toLowerCase().includes(currentFilter.text);
    const matchCat = currentFilter.category === 'all' || p.category === currentFilter.category;
    const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;
    const matchPrice = finalPrice <= currentFilter.maxPrice;
    return matchText && matchCat && matchPrice;
  });

  if(filtered.length === 0) {
    grid.innerHTML = `<p class="text-gray-400 col-span-full text-center py-10">No se encontraron productos.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const state = uiState[p.id];
    const currentVariant = p.variants[state.colorIdx];
    const priceDisplay = p.isOffer 
      ? `<span class="text-red-500 line-through text-sm mr-2">$${p.priceRegular.toLocaleString()}</span><span class="text-green-400 font-bold">$${p.priceOffer.toLocaleString()}</span>`
      : `<span class="text-white font-bold">$${p.priceRegular.toLocaleString()}</span>`;

    // Botones de Tallas
    const sizesHtml = currentVariant.sizes.map((s, idx) => {
      const isDisabled = s.stock === 0;
      const isSelected = state.sizeIdx === idx;
      let classes = "px-2 py-1 text-xs border rounded ";
      if(isDisabled) classes += "border-red-900 text-gray-600 line-through cursor-not-allowed opacity-50";
      else if(isSelected) classes += "border-green-500 bg-green-500 text-white";
      else classes += "border-gray-600 text-gray-300 hover:border-white";
      
      return `<button ${isDisabled ? 'disabled' : ''} onclick="selectSize('${p.id}', ${idx})" class="${classes}">${s.size}</button>`;
    }).join('');

    return `
      <div class="bg-[#111726] border border-[#1e293b] rounded-xl overflow-hidden hover:border-gray-500 transition-colors flex flex-col">
        <div class="relative h-56 bg-black">
          ${p.badge ? `<span class="absolute top-2 left-2 bg-green-500 text-black text-xs font-bold px-2 py-1 rounded z-10">${p.badge}</span>` : ''}
          <img src="${p.imageUrl}" alt="${p.name}" class="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity" loading="lazy">
        </div>
        <div class="p-4 flex flex-col flex-grow">
          <h3 class="text-lg font-semibold text-white truncate mb-1">${p.name}</h3>
          <p class="text-xs text-gray-400 mb-2 line-clamp-2">${p.description}</p>
          <div class="mb-3">${priceDisplay}</div>
          
          <div class="mb-3">
             <p class="text-xs text-gray-400 mb-1">Color: <span class="text-white">${currentVariant.color}</span></p>
             <div class="flex gap-2">
               ${p.variants.map((v, i) => `
                  <button onclick="selectColor('${p.id}', ${i})" class="w-5 h-5 rounded-full border-2 ${state.colorIdx === i ? 'border-white' : 'border-transparent'}" style="background-color: ${v.colorHex}"></button>
               `).join('')}
             </div>
          </div>
          
          <div class="mb-4">
             <p class="text-xs text-gray-400 mb-1">Talla (Stock ${currentVariant.sizes.find(s=>s.stock<3 && s.stock>0) ? `<span class='text-orange-400 animate-pulse'>¡Quedan ${currentVariant.sizes.find(s=>s.stock<3 && s.stock>0).stock}!</span>` : ''}):</p>
             <div class="flex gap-2 flex-wrap">${sizesHtml}</div>
          </div>

          <button onclick="addToCart('${p.id}')" class="cta-glow mt-auto w-full bg-green-500 text-black font-bold py-2 rounded-lg hover:bg-green-400 transition-colors uppercase tracking-wider">Añadir al Carro</button>
        </div>
      </div>
    `;
  }).join('');
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
  const p = products.find(x => x.id === productId);
  const state = uiState[productId];
  if(state.sizeIdx === null) return alert("Selecciona una talla antes de agregar al carrito.");
  
  const variant = p.variants[state.colorIdx];
  const sizeObj = variant.sizes[state.sizeIdx];
  
  const finalPrice = p.isOffer ? p.priceOffer : p.priceRegular;
  
  const existing = cart.find(i => i.id === p.id && i.color === variant.color && i.size === sizeObj.size);
  
  if(existing) {
    if(existing.qty >= sizeObj.stock) return alert("Has alcanzado el límite de stock de este artículo.");
    existing.qty++;
  } else {
    cart.push({
      id: p.id, name: p.name, color: variant.color, size: sizeObj.size, 
      price: finalPrice, qty: 1, maxStock: sizeObj.stock, img: p.imageUrl
    });
  }
  
  saveCart();
  updateCartUI();
  openDrawer();
};

const saveCart = () => {
  localStorage.setItem('wz_cart', JSON.stringify(cart));
};

const removeCartItem = (index) => {
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
};
window.removeCartItem = removeCartItem; // para onclick html

// Calculadora de Negocio y Render Carrito
const applyCouponLogic = () => {
  const code = sanitizeInput(document.getElementById('coupon-input').value.toUpperCase());
  if(code === 'WZ2026' || code === 'FREEATHLETE') {
    appliedCoupon = code;
    updateCartUI();
  } else {
    alert("Cupón no válido.");
    appliedCoupon = null;
    updateCartUI();
  }
};

const updateCartUI = () => {
  const badge = document.getElementById('cart-badge');
  const cartItemsContainer = document.getElementById('cart-items');
  const totalsContainer = document.getElementById('cart-totals');
  
  let totalItems = 0;
  let subtotal = 0;
  
  cartItemsContainer.innerHTML = '';
  
  if(cart.length === 0) {
    badge.classList.add('hidden');
    cartItemsContainer.innerHTML = '<p class="text-gray-400 text-center mt-10">Tu carrito está vacío.</p>';
    totalsContainer.style.display = 'none';
    return;
  }
  
  badge.classList.remove('hidden');
  totalsContainer.style.display = 'block';

  cart.forEach((item, idx) => {
    totalItems += item.qty;
    subtotal += (item.price * item.qty);
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
  if (appliedCoupon === 'WZ2026') discount = subtotal * 0.15;
  
  let shippingCost = SHIP_RATES[shippingType];
  if (subtotal > 300000 || appliedCoupon === 'FREEATHLETE') shippingCost = 0;

  const finalTotal = subtotal - discount + shippingCost;
  
  document.getElementById('subtotal-val').textContent = `$${subtotal.toLocaleString()}`;
  document.getElementById('discount-val').textContent = `-$${discount.toLocaleString()}`;
  document.getElementById('shipping-val').textContent = shippingCost === 0 ? '¡GRATIS!' : `$${shippingCost.toLocaleString()}`;
  document.getElementById('total-val').textContent = `$${finalTotal.toLocaleString()}`;
  document.getElementById('final-buy-btn').dataset.total = finalTotal;
};

// UI Drawer
const openDrawer = () => { document.getElementById('drawer-cart').classList.add('open'); document.getElementById('drawer-overlay').classList.add('open'); };
const closeDrawer = () => { document.getElementById('drawer-cart').classList.remove('open'); document.getElementById('drawer-overlay').classList.remove('open'); };

// Recuperador de Carrito URL 
const shareCartUrl = () => {
  const base64cart = btoa(JSON.stringify(cart));
  const url = `${window.location.origin}${window.location.pathname}?cart=${base64cart}`;
  navigator.clipboard.writeText(url).then(() => alert('¡Enlace de carrito copiado! Compártelo.'));
};

const recoverCartFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const cartParam = params.get('cart');
  if(cartParam) {
    try {
      cart = JSON.parse(atob(cartParam));
      saveCart();
      // Elimina param de la URL limpio
      window.history.replaceState({}, document.title, window.location.pathname);
      openDrawer();
    } catch(e) { console.error("URL Invalida de carrito"); }
  }
};

// Checkout & Validación RegEx & WhatsApp Segura
const processCheckout = () => {
  const name = sanitizeInput(document.getElementById('chk-name').value);
  const phone = sanitizeInput(document.getElementById('chk-phone').value);
  const addr = sanitizeInput(document.getElementById('chk-addr').value);
  
  const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
  const phoneRegex = /^\d{7,15}$/;
  
  if(!nameRegex.test(name)) return alert("El nombre solo debe contener letras.");
  if(!phoneRegex.test(phone)) return alert("El teléfono debe contener entre 7 y 15 dígitos numéricos.");
  if(addr.trim() === '') return alert("La dirección es obligatoria.");
  
  const finalTotal = document.getElementById('final-buy-btn').dataset.total;
  
  let msg = `🔥 *NUEVO PEDIDO WZSTORE* 🔥\n\n👤 Cliente: ${name}\n📍 Dirección: ${addr}\n📞 Tel: ${phone}\n\n*Detalle del Pedido:*\n`;
  cart.forEach(item => {
    msg += `▪ ${item.name}\n  Color: ${item.color} | Talla: ${item.size} | Cantidad: ${item.qty}\n`;
  });
  msg += `\n💰 *Total a pagar: $${Number(finalTotal).toLocaleString()} COP*\n`;
  if(appliedCoupon) msg += `🎟️ Cupón aplicado: ${appliedCoupon}\n`;
  
  const url = `https://wa.me/573000000000?text=${encodeURIComponent(msg)}`;
  
  // Safe Browsing Protocol
  window.open(url, '_blank', 'noopener,noreferrer');
  
  // Limpieza
  cart = [];
  saveCart();
  document.getElementById('modal-checkout').classList.remove('active');
  updateCartUI();
  
};


// Detecta cambios en localStorage desde la pestaña de admin en tiempo real
window.addEventListener('storage', (e) => {
  if (e.key === 'wz_core_products') {
    products = JSON.parse(e.newValue) || [];
    products.forEach(p => {
      if (!uiState[p.id]) uiState[p.id] = { colorIdx: 0, sizeIdx: null };
    });
    renderCatalog();
  }
});