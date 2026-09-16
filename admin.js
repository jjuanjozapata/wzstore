/**
 * WZSTORE - Core Administrativo
 * Lógica de negocio, autenticación y análisis de datos en memoria local.
 */

// Configuración del cliente Supabase
const SUPABASE_URL = "https://bthyaqpmvtyncnsbrouv.supabase.co";
const SUPABASE_KEY = "sb_publishable_nsKtTkdnxMV2C0OUJbYhrw_xYR_7Am9";
const wzClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Formateador estricto para sincronización con tabla 'productos' en Supabase (solo columnas de Postgres)
const formatProductForSupabase = (prod) => {
  if (!prod) return null;
  const isAvailable = Boolean(prod.is_available ?? prod.isAvailable ?? true);
  return {
    id: prod.id,
    name: prod.name ?? "",
    description: prod.description ?? "",
    category: prod.category ?? "",
    sub_category: prod.sub_category ?? prod.subCategory ?? "",
    badge: prod.badge ?? prod.tag ?? "",
    tag: prod.tag ?? prod.badge ?? "",
    is_featured: Boolean(prod.is_featured ?? prod.isFeatured),
    is_offer: Boolean(prod.is_offer ?? prod.isOffer),
    price_regular: Number(prod.price_regular ?? prod.priceRegular ?? 0),
    price_offer: Number(prod.price_offer ?? prod.priceOffer ?? 0),
    image_url: prod.image_url ?? prod.imageUrl ?? "",
    media: prod.media ?? { images: [], video: "" },
    variants: Array.isArray(prod.variants) ? prod.variants : [],
    is_available: isAvailable,
    status: prod.status ?? (isAvailable ? "activo" : "agotado")
  };
};

// ==========================================
// 1. SISTEMA DE AUTENTICACIÓN
// ==========================================
// Utilidad para decodificar entidades HTML preexistentes
const decodeEntities = (str) => {
  if (typeof str !== 'string') return str;
  if (typeof document !== 'undefined') {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

// Sanitizador contra Vector XSS por codificación de entidades completas
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  const decoded = decodeEntities(str);
  return decoded.replace(/[<>"']/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#x27;';
      default: return char;
    }
  }).trim();
};

// Constantes del motor de autenticación multiusuario
// Constantes del motor de autenticación
const USERS_STORAGE_KEY = "wz_auth_users";
const SESSION_KEY = "wz_admin_session";

// Estado de sesión activo en memoria sincronizado exclusivamente con Supabase
let currentSession = null;

// Utilidad centralizada de notificaciones Toast no intrusivas
const showToast = (message, type = "success") => {
  const container = document.getElementById("wz-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const bgColor = type === "success" ? "bg-slate-900 border-emerald-500 text-emerald-400" : "bg-slate-900 border-red-500 text-red-400";
  toast.className = `border px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 transform transition-all duration-300 pointer-events-auto ${bgColor}`;
  toast.innerHTML = `
    <span class="w-2 h-2 rounded-full ${type === "success" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}"></span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};

const getStoredUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredUsers = (usersList) => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersList));
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
  }
};

const getCurrentSession = () => {
  if (!currentSession) return null;
  return {
    username: currentSession.user?.email || "admin",
    email: currentSession.user?.email || "",
    role: currentSession.user?.user_metadata?.role || "admin",
  };
};

const setSession = (sessionData) => {
  currentSession = sessionData;
};

const clearSession = () => {
  currentSession = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignorar si el almacenamiento no está accesible
  }
};

// Aplicación de directivas de seguridad basadas en roles (RBAC)
const applyRolePermissions = () => {
  const session = getCurrentSession();
  if (!session) return;

  const isMasterAdmin = session.role === "admin";
  const roleBadge = document.getElementById("wz-current-role-badge");
  const analyticsSection = document.querySelector("section:has(#kpi-revenue)") || document.querySelector("main section:first-of-type");

  if (roleBadge) {
    roleBadge.textContent = isMasterAdmin ? "Rol: Administrador Total" : "Rol: Trabajador / Monitor";
    roleBadge.className = isMasterAdmin
      ? "text-xs px-2.5 py-1 rounded-full font-bold bg-slate-800 text-emerald-400 border border-emerald-500/30 uppercase"
      : "text-xs px-2.5 py-1 rounded-full font-bold bg-slate-800 text-amber-400 border border-amber-500/30 uppercase";
  }

  // Ocultar sección analítica completa a perfiles restringidos
  if (analyticsSection) {
    if (!isMasterAdmin) {
      analyticsSection.classList.add("hidden");
    } else {
      analyticsSection.classList.remove("hidden");
    }
  }

  // Re-renderizar inventario para ajustar botones de eliminación según permisos
  renderInventoryTable();
};

// Verificación y sincronización de sesión mediante Supabase Auth
let authListenerInitialized = false;

async function checkAuth() {
  const overlay = document.getElementById("wz-login-overlay") || document.getElementById("login-modal");
  const dashboard = document.getElementById("admin-dashboard");

  if (!wzClient) {
    if (overlay) overlay.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
    return;
  }

  if (!authListenerInitialized) {
    authListenerInitialized = true;
    wzClient.auth.onAuthStateChange((event, session) => {
      currentSession = session;
      if (!session) {
        if (overlay) overlay.classList.remove("hidden");
        if (dashboard) dashboard.classList.add("hidden");
      } else {
        if (overlay) overlay.classList.add("hidden");
        if (dashboard) dashboard.classList.remove("hidden");
        initDashboard();
        if (typeof applyRolePermissions === "function") applyRolePermissions();
      }
    });
  }

  const { data: { session }, error } = await wzClient.auth.getSession();
  if (error || !session) {
    currentSession = null;
    if (overlay) overlay.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
  } else {
    currentSession = session;
    if (overlay) overlay.classList.add("hidden");
    if (dashboard) dashboard.classList.remove("hidden");
    initDashboard();
    if (typeof applyRolePermissions === "function") applyRolePermissions();
  }
}

// 10. Actualización Masiva de Precios por Categoría
window.applyBulkPriceAdjustment = async (targetCategory, percentageChange) => {
  const factor = 1 + (Number(percentageChange) / 100);
  if (isNaN(factor) || factor <= 0) {
    if (typeof showToast === "function") showToast("Porcentaje de ajuste inválido.", "error");
    return;
  }

  let products = loadProducts();
  let affectedCount = 0;

  products = products.map((prod) => {
    if (targetCategory === "all" || prod.category === targetCategory) {
      affectedCount++;
      const currentPrice = Number(prod.priceRegular) || 0;
      const newPrice = Math.round(currentPrice * factor);
      return {
        ...prod,
        priceRegular: newPrice,
        priceOffer: prod.isOffer ? Math.round(newPrice * 0.9) : newPrice
      };
    }
    return prod;
  });

  saveProducts(products);
  if (wzClient) await wzClient.from("productos").upsert(products.map(formatProductForSupabase));
  renderInventoryTable();
  if (typeof recordAuditEvent === "function") {
    recordAuditEvent(`Ajuste masivo de precios: ${percentageChange}% en ${targetCategory} (${affectedCount} productos).`);
  }
  if (typeof showToast === "function") {
    showToast(`Precios actualizados en ${affectedCount} prendas.`);
  }
};

// Siembra de usuarios incorporando la cuenta administrativa canónica admin / wzstore2026 y admin123
const initializeUsersStore = () => [];

// Manejo del formulario de Login exclusivamente mediante Supabase Auth
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const usernameEl = document.getElementById("username");
    const passwordEl = document.getElementById("password");
    const errorEl = document.getElementById("login-error");

    const u = usernameEl ? usernameEl.value.trim().toLowerCase() : "";
    const p = passwordEl ? passwordEl.value.trim() : "";

    if (!u || !p) {
      if (errorEl) {
        errorEl.textContent = "Por favor, completa todos los campos.";
        errorEl.classList.remove("hidden");
        errorEl.style.display = "block";
      }
      return;
    }

    if (!wzClient) {
      if (errorEl) {
        errorEl.textContent = "Error de conexión con el servicio de autenticación.";
        errorEl.classList.remove("hidden");
        errorEl.style.display = "block";
      }
      return;
    }

    try {
      const { data, error } = await wzClient.auth.signInWithPassword({
        email: u,
        password: p,
      });

      if (error || !data?.session) {
        if (errorEl) {
          errorEl.textContent = "Credenciales inválidas. Verifica tu correo corporativo y contraseña.";
          errorEl.classList.remove("hidden");
          errorEl.style.display = "block";
        }
        return;
      }

      currentSession = data.session;

      if (errorEl) {
        errorEl.classList.add("hidden");
        errorEl.style.display = "none";
      }
      if (usernameEl) usernameEl.value = "";
      if (passwordEl) passwordEl.value = "";

      const overlay = document.getElementById("wz-login-overlay") || document.getElementById("login-modal");
      const dashboard = document.getElementById("admin-dashboard");
      if (overlay) overlay.classList.add("hidden");
      if (dashboard) dashboard.classList.remove("hidden");

      initDashboard();
      if (typeof applyRolePermissions === "function") applyRolePermissions();
    } catch (err) {
      console.error("Error en validación de credenciales:", err);
      if (errorEl) {
        errorEl.textContent = "Error al autenticar. Inténtalo de nuevo.";
        errorEl.classList.remove("hidden");
        errorEl.style.display = "block";
      }
    }
  });
}

// Controladores para Modal de Cambio de Contraseña
const pwdModal = document.getElementById("wz-password-modal");
const openPwdBtn = document.getElementById("wz-open-password-btn");
const closePwdBtn = document.getElementById("wz-close-password-btn");
const cancelPwdBtn = document.getElementById("wz-cancel-password-btn");
const pwdForm = document.getElementById("wz-password-form");

const closePasswordModal = () => {
  if (pwdModal) pwdModal.classList.add("hidden");
  if (pwdForm) pwdForm.reset();
};

if (openPwdBtn) {
  openPwdBtn.addEventListener("click", () => {
    if (pwdModal) pwdModal.classList.remove("hidden");
  });
}
if (closePwdBtn) closePwdBtn.addEventListener("click", closePasswordModal);
if (cancelPwdBtn) cancelPwdBtn.addEventListener("click", closePasswordModal);

if (pwdForm) {
  const currPassInput = document.getElementById("wz-pwd-current");
  if (currPassInput) currPassInput.removeAttribute("required");

  pwdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPass = document.getElementById("wz-pwd-new")?.value || "";
    const confirmPass = document.getElementById("wz-pwd-confirm")?.value || "";

    if (newPass.length < 6) {
      showToast("La nueva clave debe tener al menos 6 caracteres.", "error");
      return;
    }

    if (newPass !== confirmPass) {
      showToast("Las contraseñas nuevas no coinciden entre sí.", "error");
      return;
    }

    if (!wzClient) {
      showToast("Cliente de Supabase no disponible.", "error");
      return;
    }

    try {
      const { data, error } = await wzClient.auth.updateUser({ password: newPass });
      if (error) {
        showToast(error.message || "Error al actualizar la contraseña.", "error");
        return;
      }
      showToast("Contraseña actualizada exitosamente.");
      closePasswordModal();
    } catch (err) {
      showToast(err.message || "Error al actualizar la contraseña.", "error");
    }
  });
}

// Evento de Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    if (e) e.preventDefault();
    if (wzClient) {
      try {
        await wzClient.auth.signOut();
      } catch (err) {
        console.error("Error al cerrar sesión en Supabase:", err);
      }
    }
    clearSession();
    window.location.href = "index.html"; // Lo sacamos a la tienda principal
  });
}

// ==========================================
// 2. MÓDULO ANALÍTICO (MOCK ENGINE)
// ==========================================
function initializeMockSales() {
  if (!localStorage.getItem("wz_sales_history")) {
    const mockSales = [];
    const now = new Date();
    const productNames = [
      "Alpha Pro Tee",
      "Leggings Core",
      "Zapatillas AeroBoost",
      "Top High-Impact",
      "Shorts Combat",
    ];

    // Generar 100 ventas aleatorias en el último año
    for (let i = 0; i < 100; i++) {
      const randomDaysAgo = Math.floor(Math.random() * 365);
      const date = new Date(
        now.getTime() - randomDaysAgo * 24 * 60 * 60 * 1000,
      );
      const qty = Math.floor(Math.random() * 3) + 1;
      const price = Math.floor(Math.random() * 150000) + 50000;

      mockSales.push({
        id: "ORD-" + Math.floor(Math.random() * 10000),
        timestamp: date.getTime(),
        product: productNames[Math.floor(Math.random() * productNames.length)],
        quantity: qty,
        total: price * qty,
      });
    }
    localStorage.setItem("wz_sales_history", JSON.stringify(mockSales));
  }
}

function renderAnalytics(timeframe = "day") {
  const sales = JSON.parse(localStorage.getItem("wz_sales_history")) || [];
  const now = new Date().getTime();

  // Configurar límites de tiempo
  const timeLimits = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  const limit = timeLimits[timeframe];
  const filteredSales = sales.filter((s) => now - s.timestamp <= limit);

  // Calcular KPIs
  const totalRevenue = filteredSales.reduce((acc, curr) => acc + curr.total, 0);
  const totalItems = filteredSales.reduce(
    (acc, curr) => acc + curr.quantity,
    0,
  );
  const avgTicket =
    filteredSales.length > 0 ? totalRevenue / filteredSales.length : 0;

  // Actualizar UI
  document.getElementById("kpi-revenue").innerText =
    `$${totalRevenue.toLocaleString("es-CO")}`;
  document.getElementById("kpi-sales").innerText = totalItems;
  document.getElementById("kpi-ticket").innerText =
    `$${Math.round(avgTicket).toLocaleString("es-CO")}`;

  // Dibujar Gráfica Nativa de Barras (Top Productos)
  const productStats = {};
  filteredSales.forEach((s) => {
    if (!productStats[s.product]) productStats[s.product] = 0;
    productStats[s.product] += s.quantity;
  });

  const sortedProducts = Object.entries(productStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxQty = sortedProducts.length > 0 ? sortedProducts[0][1] : 1;
  const chartContainer = document.getElementById("chart-container");

  if (sortedProducts.length === 0) {
    chartContainer.innerHTML =
      '<p class="text-gray-500 text-sm">No hay ventas registradas en este periodo.</p>';
    return;
  }

  chartContainer.innerHTML = sortedProducts
    .map(([name, qty]) => {
      const percentage = Math.round((qty / maxQty) * 100);
      return `
            <div class="mb-2">
                <div class="flex justify-between text-xs mb-1 text-gray-300">
                    <span>${name}</span>
                    <span class="font-bold text-neon">${qty} unds</span>
                </div>
                <div class="w-full bg-dark rounded-full h-3 overflow-hidden border border-gray-700">
                    <div class="bg-neon h-3 rounded-full transition-all duration-1000 ease-out" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    })
    .join("");
}

// Filtros de tiempo UI
document.querySelectorAll(".time-filter").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".time-filter").forEach((b) => {
      b.classList.remove("bg-neon", "text-black", "active-filter");
      b.classList.add("text-gray-400");
    });
    e.target.classList.remove("text-gray-400");
    e.target.classList.add("bg-neon", "text-black", "active-filter");

    renderAnalytics(e.target.dataset.time);
  });
});

// ==========================================
// 3. CRUD & GESTIÓN DE INVENTARIO
// ==========================================
let currentVariants = [];
let tempVariants = [];
let editingId = null;
let mediaBuffer = { images: [], video: "" };

// Unificación de carga de inventario soportando ambas claves de almacenamiento
function loadProducts() {
  const stored = localStorage.getItem("wz_core_products") || localStorage.getItem("wz_products");
  try {
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("Fallo al parsear inventario:", err);
    return [];
  }
}

function saveProducts(products) {
  try {
    if (!Array.isArray(products)) {
      throw new Error("Estructura de catálogo inválida para persistencia.");
    }
    const json = JSON.stringify(products);
    // Persistir exclusivamente en una clave maestra para ahorrar 50% de cuota
    localStorage.setItem("wz_core_products", json);
    // Eliminar réplica obsoleta para mitigar colapso de cuota
    localStorage.removeItem("wz_products");
    
    // Registrar log de auditoría
    if (typeof recordAuditEvent === "function") {
      recordAuditEvent("Catálogo actualizado y sincronizado en almacenamiento.");
    }
  } catch (err) {
    console.error("Fallo crítico de almacenamiento local:", err);
    if (err.name === "QuotaExceededError" || err.code === 22 || err.number === -2147024882) {
      // Limpieza de huérfanos inmediata
      if (typeof window.garbageCollector === "function") {
        window.garbageCollector();
      }
      // Reintentar guardado tras recolección
      try {
        const minimized = products.map((item) => ({
          ...item,
          media: { images: item.media?.images ? [item.media.images[0]] : [], video: "" }
        }));
        localStorage.setItem("wz_core_products", JSON.stringify(minimized));
        if (typeof showToast === "function") {
          showToast("Alerta: Memoria optimizada. Se depuraron videos pesados para salvar el catálogo.", "error");
        }
      } catch (retryErr) {
        if (typeof showToast === "function") {
          showToast("Error crítico: Memoria completamente llena. Exporta un respaldo y libera espacio.", "error");
        }
      }
    }
  }
}

// Recolector de basura expuesto globalmente como garbageCollector()
window.garbageCollector = function () {
  const rawProducts = localStorage.getItem("wz_core_products") || localStorage.getItem("wz_products");
  let activeList = [];
  try {
    activeList = rawProducts ? JSON.parse(rawProducts) : [];
  } catch (e) {
    activeList = [];
  }

  const registeredMedia = new Set();
  activeList.forEach((p) => {
    if (p.imageUrl) registeredMedia.add(p.imageUrl);
    if (p.media?.images) p.media.images.forEach((img) => registeredMedia.add(img));
    if (p.media?.video) registeredMedia.add(p.media.video);
  });

  // Limpieza de claves huérfanas en localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("wz_media_orphan_") || key.startsWith("wz_temp_")) {
      const stored = localStorage.getItem(key);
      if (!registeredMedia.has(stored)) {
        localStorage.removeItem(key);
      }
    }
  });
};

// Renderizado de catálogo e inventario en tarjetas verticales responsive (estilo App nativa)
function renderInventoryTable() {
  const products = loadProducts();
  const container = document.getElementById("inventory-table-body");
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 bg-card border border-gray-800 rounded-2xl text-center w-full">
        <p class="text-gray-400 font-medium text-sm">El catálogo está vacío.</p>
        <p class="text-gray-600 text-xs mt-1">Presiona "Añadir Prenda" para registrar tu primer producto.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products
    .map((p) => {
      let totalStock = 0;
      p.variants?.forEach((v) => {
        v.sizes?.forEach((s) => (totalStock += Number(s.stock) || 0));
      });
      const isAvailable = p.status !== "agotado" && p.isAvailable !== false && totalStock > 0;
      let statusText = "";

      if (!isAvailable) {
        statusText = `<span class="text-red-400 font-bold bg-red-950/40 border border-red-800/60 px-2.5 py-1 rounded-lg text-xs">AGOTADO</span>`;
      } else if (totalStock < 3) {
        statusText = `<span class="text-amber-400 font-extrabold bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg text-xs animate-pulse">⚠️ CRÍTICO: ${totalStock} unds</span>`;
      } else {
        statusText = `<span class="text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/60 px-2.5 py-1 rounded-lg text-xs">${totalStock} unds</span>`;
      }
      
      const safeId = String(p.id);
      const displayId = safeId.includes("-") ? safeId.split("-")[1] : safeId;

      // Variantes organizadas como chips táctiles de visualización inmediata
      let variantsHtml = "";
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        variantsHtml = `<div class="flex flex-wrap gap-1.5 pt-2 border-t border-gray-800/80 w-full">`;
        p.variants.forEach((v) => {
          if (Array.isArray(v.sizes)) {
            v.sizes.forEach((s) => {
              const stockNum = Number(s.stock) || 0;
              const stockColor = stockNum === 0 ? "text-red-400" : stockNum < 3 ? "text-amber-400" : "text-emerald-400";
              variantsHtml += `
                <div class="inline-flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-xl text-xs text-slate-300">
                  ${v.color && v.color !== 'Único' ? `<span class="w-2 h-2 rounded-full" style="background-color: ${v.colorHex || '#10b981'}"></span><span class="text-slate-400 font-medium">${v.color}</span> · ` : ''}
                  <span class="font-bold text-white">Talla ${s.size}</span>
                  <span class="text-slate-600">:</span>
                  <span class="${stockColor} font-bold font-mono">${stockNum}</span>
                </div>
              `;
            });
          }
        });
        variantsHtml += `</div>`;
      }

      return `
        <div class="flex flex-col w-full p-4 rounded-2xl bg-card border border-gray-800 hover:border-gray-700 transition-all shadow-lg space-y-3">
          <div class="flex items-start gap-3 w-full">
            <img src="${p.imageUrl || (p.media?.images && p.media.images[0]) || 'https://images.unsplash.com/photo-1581636625402-29f2a01222ce'}" class="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border border-gray-700 shrink-0" alt="${p.name}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <h3 class="font-bold text-white text-base truncate leading-tight">${p.name}</h3>
                <span class="text-xs text-gray-500 font-mono shrink-0">#${displayId}</span>
              </div>
              <p class="text-xs text-gray-400 capitalize mt-0.5">${p.category || 'General'} ${p.subCategory ? '· ' + p.subCategory : ''}</p>
              <div class="mt-1.5 flex items-baseline gap-2 flex-wrap">
                <span class="text-base font-bold text-white">$${Number(p.priceRegular || 0).toLocaleString("es-CO")}</span>
                ${p.isOffer ? `<span class="text-xs text-neon font-extrabold bg-neon/10 border border-neon/30 px-2 py-0.5 rounded-full">OFERTA: $${Number(p.priceOffer || 0).toLocaleString("es-CO")}</span>` : ""}
              </div>
              ${(p.badge || p.tag) ? `<div class="mt-1.5"><span class="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${String(p.badge || p.tag).toLowerCase().includes('agotan') ? 'bg-amber-950/80 text-amber-300 border border-amber-600/40' : 'bg-slate-900 text-yellow-300 border border-yellow-500/40'}">${p.badge || p.tag}</span></div>` : ''}
            </div>
          </div>

          <div class="flex items-center justify-between bg-dark/60 p-3 rounded-xl border border-gray-800/80 w-full">
            <div class="flex items-center gap-3">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" onchange="toggleProductStatus('${safeId}')" class="sr-only peer" ${isAvailable ? "checked" : ""}>
                <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon"></div>
              </label>
              <span class="text-xs font-semibold text-gray-300">Disponibilidad</span>
            </div>
            <div>${statusText}</div>
          </div>

          ${variantsHtml}

          <div class="flex items-center gap-2 pt-1 border-t border-gray-800/80 w-full">
            <button type="button" data-action="edit" data-id="${safeId}" class="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold rounded-xl text-xs sm:text-sm text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5">
              <span>✏️</span> Editar
            </button>
            ${
              (typeof getCurrentSession === "function" && getCurrentSession()?.role === "admin")
                ? `<button type="button" id="del-btn-${safeId}" onclick="confirmDelete('${safeId}')" class="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-red-950/40 text-red-400 font-bold rounded-xl text-xs sm:text-sm text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                    <span>🗑️</span> Eliminar
                  </button>`
                : `<span class="flex-1 py-2.5 px-4 bg-slate-900 text-gray-600 font-medium rounded-xl text-xs text-center cursor-not-allowed">Bloqueado</span>`
            }
          </div>
        </div>
      `;
    })
    .join("");
}

// 14. Registro de Auditoría Local (Event Logs)
const AUDIT_LOGS_KEY = "wz_audit_logs";
const MAX_LOGS = 50;

window.recordAuditEvent = (actionDescription) => {
  const session = getCurrentSession();
  const actor = session ? session.username : "Sistema";
  const newLog = {
    timestamp: new Date().toLocaleString("es-CO"),
    actor: actor,
    action: sanitizeInput(actionDescription)
  };

  let logs = [];
  try {
    logs = JSON.parse(localStorage.getItem(AUDIT_LOGS_KEY)) || [];
  } catch (e) {
    logs = [];
  }

  logs.unshift(newLog);
  if (logs.length > MAX_LOGS) logs.pop();
  localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs));
};

// Delegación global de clics para capturar el botón Editar sin fallas de binding
document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("inventory-table-body");
  if (tableBody) {
    tableBody.addEventListener("click", (e) => {
      const editBtn = e.target.closest('button[data-action="edit"]');
      if (editBtn) {
        const prodId = editBtn.getAttribute("data-id");
        if (prodId) window.editProduct(prodId);
      }
    });
  }
});

// Acción de Doble Confirmación para Eliminar
window.confirmDelete = async function (id) {
  const btn = document.getElementById(`del-btn-${id}`);
  if (!btn) return;
  if (btn.innerText.includes("Eliminar")) {
    btn.innerHTML = '<span>⚠️</span> ¿Seguro?';
    btn.classList.add("text-orange-500", "font-black");
    setTimeout(() => {
      if (btn) {
        btn.innerHTML = '<span>🗑️</span> Eliminar';
        btn.classList.remove("text-orange-500", "font-black");
      }
    }, 3000);
  } else {
    // Eliminar definitivamente
    let products = loadProducts();
    products = products.filter((p) => String(p.id) !== String(id));
    // Mantener localStorage únicamente como respaldo offline
    saveProducts(products);
    renderInventoryTable();

    // Sincronización directa con Supabase (eliminación)
    if (wzClient) {
      try {
        const { error } = await wzClient.from('productos').delete().eq('id', id);
        if (error) {
          console.error("Error al eliminar producto en Supabase:", error);
          if (typeof showToast === "function") showToast(error.message, "error");
        }
      } catch (err) {
        console.error("Fallo de conexión al eliminar en Supabase:", err);
        if (typeof showToast === "function") showToast(err.message, "error");
      }
    }
  }
};

// Alternar disponibilidad (Simular Agotado visualmente sin borrar stock real)
let restockTargetId = null;
let restockModalInitialized = false;

function initRestockModal() {
  if (restockModalInitialized) return;
  const modal = document.getElementById("wz-restock-modal");
  const closeBtn = document.getElementById("wz-modal-close-btn");
  const cancelBtn = document.getElementById("wz-modal-cancel-btn");
  const confirmBtn = document.getElementById("wz-modal-confirm-btn");
  const qtyInput = document.getElementById("wz-restock-qty");
  const errorMsg = document.getElementById("wz-modal-error-msg");

  if (!modal) return;

  const closeModal = () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    restockTargetId = null;
    renderInventoryTable();
  };

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  confirmBtn?.addEventListener("click", () => {
    const qty = parseInt(qtyInput.value, 10);
    if (isNaN(qty) || qty < 1) {
      if (errorMsg) errorMsg.classList.remove("hidden");
      qtyInput.focus();
      return;
    }
    if (errorMsg) errorMsg.classList.add("hidden");

    const mode = document.querySelector('input[name="wz-stock-mode"]:checked')?.value || "uniform";
    let products = loadProducts();
    const target = products.find(p => p.id === restockTargetId);

    if (target && target.variants) {
      let allSizes = [];
      target.variants.forEach(v => {
        if (Array.isArray(v.sizes)) {
          v.sizes.forEach(s => allSizes.push(s));
        }
      });

      if (allSizes.length > 0) {
        if (mode === "uniform") {
          allSizes.forEach(s => (s.stock = qty));
        } else {
          const base = Math.floor(qty / allSizes.length);
          const remainder = qty % allSizes.length;
          allSizes.forEach((s, i) => {
            s.stock = base + (i < remainder ? 1 : 0);
          });
        }
      }

      // Reasignación de inventario pasando el estado a 'activo'
      target.status = "activo";
      target.isAvailable = true;
      target.is_available = true;
      saveProducts(products);
      if (wzClient) {
        wzClient.from('productos').upsert(formatProductForSupabase(target)).catch((err) => console.error("Error en Supabase:", err));
      }
    }

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    restockTargetId = null;
    renderInventoryTable();
  });

  restockModalInitialized = true;
}

function openRestockModal(target) {
  initRestockModal();
  const modal = document.getElementById("wz-restock-modal");
  if (!modal) {
    const qtyStr = prompt(`Reactivar inventario para "${target.name}".\nIngresa la cantidad de prendas disponibles:`, "10");
    const qty = parseInt(qtyStr, 10);
    if (!isNaN(qty) && qty > 0) {
      target.variants?.forEach((v) => v.sizes?.forEach((s) => (s.stock = qty)));
      target.status = "activo";
      target.isAvailable = true;
      target.is_available = true;
      let products = loadProducts();
      const idx = products.findIndex((p) => p.id === target.id);
      if (idx > -1) products[idx] = target;
      saveProducts(products);
      if (wzClient) {
        wzClient.from('productos').upsert(formatProductForSupabase(target)).catch((err) => console.error("Error en Supabase:", err));
      }
    }
    renderInventoryTable();
    return;
  }

  restockTargetId = target.id;
  const nameEl = document.getElementById("wz-modal-prod-name");
  const infoEl = document.getElementById("wz-modal-variants-info");
  const qtyInput = document.getElementById("wz-restock-qty");
  const errorMsg = document.getElementById("wz-modal-error-msg");

  if (nameEl) nameEl.textContent = target.name;
  if (infoEl) {
    let sizeCount = 0;
    target.variants?.forEach(v => (sizeCount += v.sizes?.length || 0));
    infoEl.textContent = `${target.variants?.length || 0} color(es) | ${sizeCount} variante(s) de talla`;
  }
  if (qtyInput) qtyInput.value = "";
  if (errorMsg) errorMsg.classList.add("hidden");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  qtyInput?.focus();
}

window.toggleProductStatus = async function(id) {
  let products = loadProducts();
  const index = products.findIndex(p => String(p.id) === String(id));
  if (index === -1) return;

  const target = products[index];
  let totalStock = 0;
  target.variants?.forEach(v => {
    v.sizes?.forEach(s => (totalStock += Number(s.stock) || 0));
  });

  const isCurrentlyActive = target.status !== "agotado" && target.isAvailable !== false && totalStock > 0;

  if (isCurrentlyActive) {
    // Desactivar inmediatamente pasando existencias lógicas a cero
    target.status = "agotado";
    target.isAvailable = false;
    target.is_available = false;
    target.variants?.forEach((variant) => {
      variant.sizes?.forEach((sizeObj) => {
        sizeObj.stock = 0;
      });
    });
    // Guardar en localStorage como respaldo offline
    saveProducts(products);
    renderInventoryTable();

    // Sincronización directa con Supabase
    if (wzClient) {
      try {
        const { error } = await wzClient.from('productos').upsert(formatProductForSupabase(target));
        if (error) {
          console.error("Error al actualizar disponibilidad en Supabase:", error);
          if (typeof showToast === "function") showToast(error.message, "error");
        }
      } catch (err) {
        console.error("Fallo de conexión al actualizar en Supabase:", err);
        if (typeof showToast === "function") showToast(err.message, "error");
      }
    }

    if (typeof recordAuditEvent === "function") {
      recordAuditEvent(`Prenda marcada como AGOTADA: "${target.name}"`);
    }
  } else {
    // Exigir ingreso de cantidades físicas antes de reactivar en vitrina
    openRestockModal(target);
  }
};

// ==========================================
// 4. LÓGICA DEL FORMULARIO CRUD
// ==========================================
const modal = document.getElementById("crud-modal");
const form = document.getElementById("product-form");

// 15. Compresión Automática Inteligente en Canvas con cálculo estricto
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    // Tope estricto de 800px y calidad 0.7 para teléfonos móviles
    const maxDimension = 800;
    const targetQuality = 0.7;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Exportación estricta de 'image/jpeg' con calidad 0.7 para evitar cadenas corruptas o signos '?' en teléfonos
        const dataUrl = canvas.toDataURL("image/jpeg", targetQuality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Renderizado reactivo de miniaturas en el formulario
const renderMediaPreviews = () => {
  const container = document.getElementById("wz-media-preview");
  if (!container) return;
  container.innerHTML = "";

  mediaBuffer.images.forEach((imgBase64, idx) => {
    container.innerHTML += `
      <div class="relative group rounded-lg overflow-hidden border border-slate-700 h-16 bg-slate-950">
        <img src="${imgBase64}" class="w-full h-full object-cover">
        <button type="button" onclick="removeBufferedMedia('image', ${idx})" class="absolute inset-0 bg-red-950/80 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
      </div>
    `;
  });

  if (mediaBuffer.video) {
    container.innerHTML += `
      <div class="relative group rounded-lg overflow-hidden border border-slate-700 h-16 bg-slate-950 flex items-center justify-center p-1 text-center">
        <span class="text-[10px] font-bold text-emerald-400 truncate max-w-full">VIDEO OK</span>
        <button type="button" onclick="removeBufferedMedia('video')" class="absolute inset-0 bg-red-950/80 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
      </div>
    `;
  }
};

window.removeBufferedMedia = (type, index = null) => {
  if (type === "image") mediaBuffer.images.splice(index, 1);
  if (type === "video") {
    mediaBuffer.video = "";
    const videoInput = document.getElementById("prod-video-url");
    if (videoInput) videoInput.value = "";
  }
  renderMediaPreviews();
};

// Control de arrastrar, soltar y selección
const initMediaDropZone = () => {
  const dropZone = document.getElementById("wz-drop-zone");
  const fileInput = document.getElementById("wz-media-input");

  if (!dropZone || !fileInput) return;

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add("border-emerald-500");
  };
  dropZone.ondragleave = () => dropZone.classList.remove("border-emerald-500");
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-emerald-500");
    handleFiles(e.dataTransfer.files);
  };
  fileInput.onchange = (e) => handleFiles(e.target.files);
};

// Enlace reactivo del campo de URL de video directo (CDN / Storage)
const prodVideoUrlInput = document.getElementById("prod-video-url");
if (prodVideoUrlInput) {
  prodVideoUrlInput.addEventListener("input", (e) => {
    mediaBuffer.video = e.target.value.trim();
    renderMediaPreviews();
  });
}

const handleFiles = async (files) => {
  const fileList = Array.from(files);
  for (const file of fileList) {
    if (file.type.startsWith("image/")) {
      if (mediaBuffer.images.length >= 3) {
        alert("Límite alcanzado: Máximo 3 imágenes por prenda.");
        break;
      }
      const compressed = await compressImage(file);
      mediaBuffer.images.push(compressed);
    }
  }
  renderMediaPreviews();
};

// Apertura limpia del formulario CRUD en modo creación asegurando reseteo total
document.getElementById("open-crud-btn").addEventListener("click", () => {
  editingId = null;
  const hiddenIdInput = document.getElementById("product-id");
  if (hiddenIdInput) hiddenIdInput.value = "";
  if (form) {
    delete form.dataset.editingId;
    form.reset();
  }

  currentVariants = [];
  tempVariants = [];
  mediaBuffer = { images: [], video: "" };
  const videoInput = document.getElementById("prod-video-url");
  if (videoInput) videoInput.value = "";
  renderMediaPreviews();
  initMediaDropZone();

  document.getElementById("crud-modal-title").innerText = "Añadir Nueva Prenda";
  
  const offerControls = document.getElementById("offer-controls");
  if (offerControls) offerControls.classList.add("hidden");

  const catSelect = document.getElementById("prod-category");
  if (catSelect) {
    catSelect.value = "hombre";
    updateSubcategoryOptions("hombre");
  }

  const featuredCheck = document.getElementById("prod-is-featured");
  if (featuredCheck) featuredCheck.checked = false;

  const badgeSelect = document.getElementById("prod-badge");
  if (badgeSelect) badgeSelect.value = "";

  renderVariantsList();

  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.remove("opacity-0"), 10);
});

document.getElementById("close-crud-btn").addEventListener("click", closeModal);
document
  .getElementById("cancel-crud-btn")
  .addEventListener("click", closeModal);

function closeModal() {
  modal.classList.add("opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

// Calculadora de Descuento en tiempo real
// Diccionario taxonómico de prendas para filtrado en cascada
const TAXONOMY_MAP = {
  hombre: ["Camisetas", "Bermudas", "Busos", "Conjuntos", "Licras", "Chaquetas", "Calzado"],
  mujer: ["Camisetas", "Licras", "Tops", "Bermudas", "Busos", "Conjuntos", "Chaquetas", "Calzado"],
  accesorios: ["Mochilas", "Guantes", "Gorras", "Termos", "Cinturones", "Otros"]
};

// Actualización reactiva y tolerante del selector de prendas según categoría principal
const updateSubcategoryOptions = (selectedMainCat, preselectedSub = null) => {
  const subSelect = document.getElementById("prod-subcategory");
  if (!subSelect) return;

  // Normalización de llave para evitar fallos por mayúsculas/minúsculas
  const normalizedKey = (selectedMainCat || "hombre").toLowerCase();
  const validItems = TAXONOMY_MAP[normalizedKey] || TAXONOMY_MAP["hombre"] || [];

  subSelect.innerHTML = validItems
    .map((item) => {
      const isSelected = preselectedSub && item.toLowerCase() === String(preselectedSub).toLowerCase();
      return `<option value="${item}" ${isSelected ? "selected" : ""}>${item}</option>`;
    })
    .join("");
};

const catSelectEl = document.getElementById("prod-category");
if (catSelectEl) {
  catSelectEl.addEventListener("change", (e) => {
    updateSubcategoryOptions(e.target.value);
  });
}
const offerToggle = document.getElementById("prod-is-offer");
const discountSlider = document.getElementById("prod-discount");

offerToggle.addEventListener("change", (e) => {
  const controls = document.getElementById("offer-controls");
  if (e.target.checked) {
    controls.classList.remove("hidden");
    calculateOfferPrice();
  } else {
    controls.classList.add("hidden");
  }
});

// Obtener referencia al campo de precio regular sin romper el hilo de ejecución
const priceInput = document.getElementById("prod-price");

if (priceInput) {
  priceInput.addEventListener("input", calculateOfferPrice);
}
if (discountSlider) {
  discountSlider.addEventListener("input", calculateOfferPrice);
}

// Calcula el precio de oferta aplicando el porcentaje en tiempo real
function calculateOfferPrice() {
  const priceEl = document.getElementById("prod-price");
  const sliderEl = document.getElementById("prod-discount");
  const discountDisp = document.getElementById("discount-display");
  const finalPriceDisp = document.getElementById("final-price-display");

  const base = Number(priceEl ? priceEl.value : 0) || 0;
  const discount = Number(sliderEl ? sliderEl.value : 0);

  if (discountDisp) {
    discountDisp.innerText = `${discount}%`;
  }

  const finalPrice = Math.max(0, Math.round(base * (1 - discount / 100)));
  if (finalPriceDisp) {
    finalPriceDisp.innerText = `$${finalPrice.toLocaleString("es-CO")}`;
  }
}

// ==========================================
// Mapeo Dinámico de Variantes Reactivas (tempVariants)
// ==========================================
function syncCurrentVariantsFromTemp() {
  const grouped = {};
  tempVariants.forEach((item) => {
    const col = item.color || "Único";
    if (!grouped[col]) {
      grouped[col] = {
        color: col,
        colorHex: item.colorHex || "#" + Math.floor(Math.random() * 16777215).toString(16),
        sizes: []
      };
    }
    grouped[col].sizes.push({
      size: item.size,
      stock: Number(item.stock) || 0
    });
  });
  currentVariants = Object.values(grouped);
}

function syncTempFromCurrentVariants() {
  tempVariants = [];
  if (Array.isArray(currentVariants)) {
    currentVariants.forEach((v) => {
      if (Array.isArray(v.sizes)) {
        v.sizes.forEach((s) => {
          tempVariants.push({
            color: v.color || "Único",
            colorHex: v.colorHex || "#10b981",
            size: s.size,
            stock: Number(s.stock) || 0
          });
        });
      }
    });
  }
}

function addVariant() {
  const colorInput = document.getElementById("var-color");
  const sizeInput = document.getElementById("var-size");
  const stockInput = document.getElementById("var-stock");

  const color = (colorInput?.value.trim()) || "Único";
  const size = (sizeInput?.value.trim().toUpperCase()) || "";
  const stockVal = stockInput ? stockInput.value.trim() : "";
  const stock = Number(stockVal);

  if (!size) {
    if (typeof showToast === "function") showToast("Por favor ingresa una talla.", "error");
    else alert("Por favor ingresa una talla.");
    sizeInput?.focus();
    return;
  }

  if (stockVal === "" || isNaN(stock) || stock < 0) {
    if (typeof showToast === "function") showToast("Por favor ingresa un stock válido.", "error");
    else alert("Por favor ingresa un stock válido.");
    stockInput?.focus();
    return;
  }

  // Verificar si la combinación ya existe para actualizarla
  const existingIdx = tempVariants.findIndex(
    (v) => v.color.toLowerCase() === color.toLowerCase() && v.size.toUpperCase() === size.toUpperCase()
  );

  if (existingIdx > -1) {
    tempVariants[existingIdx].stock = stock;
  } else {
    tempVariants.push({
      color: color,
      colorHex: "#" + Math.floor(Math.random() * 16777215).toString(16),
      size: size,
      stock: stock
    });
  }

  syncCurrentVariantsFromTemp();
  renderVariantsList();

  if (sizeInput) sizeInput.value = "";
  if (stockInput) stockInput.value = "";
  sizeInput?.focus();
}

function renderVariantsList() {
  const list = document.getElementById("variants-list");
  if (!list) return;

  if (tempVariants.length === 0) {
    list.innerHTML = `
      <p class="text-gray-500 text-sm text-center py-3 bg-dark/40 rounded-xl border border-gray-800/60" id="empty-variants-msg">
        No hay variantes asignadas. Agrega al menos una.
      </p>
    `;
    return;
  }

  let html = `<div class="flex flex-col gap-2 w-full">`;
  tempVariants.forEach((v, idx) => {
    html += `
      <div class="flex items-center justify-between bg-slate-900 border border-slate-700 p-3 rounded-xl text-xs font-semibold text-white shadow-sm hover:border-emerald-500/50 transition-all w-full">
        <div class="flex items-center gap-2.5">
          <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${v.colorHex || '#10b981'}"></span>
          <div>
            <span class="text-white font-bold text-sm">Talla ${v.size}</span>
            <span class="text-gray-400 font-normal ml-1.5">(${v.color && v.color !== "Único" ? v.color : "Color único"})</span>
          </div>
        </div>
        <div class="flex items-center gap-2.5">
          <span class="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-emerald-400 font-mono font-bold">${v.stock} unds</span>
          <button
            type="button"
            onclick="removeTempVariant(${idx})"
            class="text-red-400 hover:text-white hover:bg-red-600/80 rounded-lg p-2 transition-colors cursor-pointer flex items-center justify-center text-sm font-bold"
            title="Remover variante"
          >
            ✕
          </button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  list.innerHTML = html;
}

window.removeTempVariant = function (idx) {
  tempVariants.splice(idx, 1);
  syncCurrentVariantsFromTemp();
  renderVariantsList();
};

window.removeVariantColor = function (idx) {
  currentVariants.splice(idx, 1);
  syncTempFromCurrentVariants();
  renderVariantsList();
};

const addVariantBtn = document.getElementById("add-variant-btn");
if (addVariantBtn) {
  addVariantBtn.addEventListener("click", addVariant);
}

const varSizeInput = document.getElementById("var-size");
if (varSizeInput) {
  varSizeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addVariant();
    }
  });
}

const varStockInput = document.getElementById("var-stock");
if (varStockInput) {
  varStockInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addVariant();
    }
  });
}




// Cargar producto en el formulario para edición sin pérdida de estado
window.editProduct = function (id) {
  const products = loadProducts();
  const targetIdStr = String(id);
  const p = products.find((x) => String(x.id) === targetIdStr);

  if (!p) {
    if (typeof showToast === "function") {
      showToast("Error: No se encontró la prenda seleccionada.", "error");
    } else {
      alert("Error: Prenda no encontrada en el inventario.");
    }
    return;
  }

  // Soporte bidireccional camelCase y snake_case
  const priceRegular = p.price_regular ?? p.priceRegular;
  const isFeatured = p.is_featured ?? p.isFeatured;
  const isOffer = p.is_offer ?? p.isOffer;
  const subCategory = p.sub_category ?? p.subCategory;
  const imageUrl = p.image_url ?? p.imageUrl;

  p.priceRegular = priceRegular;
  p.price_regular = priceRegular;
  p.isFeatured = isFeatured;
  p.is_featured = isFeatured;
  p.isOffer = isOffer;
  p.is_offer = isOffer;
  p.subCategory = subCategory;
  p.sub_category = subCategory;
  p.imageUrl = imageUrl;
  p.image_url = imageUrl;

  // Establecer el ID de edición en memoria y en el input oculto
  editingId = targetIdStr;
  const hiddenIdInput = document.getElementById("product-id");
  if (hiddenIdInput) {
    hiddenIdInput.value = targetIdStr;
  }

  // Cargar información textual básica
  document.getElementById("crud-modal-title").innerText = "Editar Prenda";
  document.getElementById("prod-name").value = decodeEntities(p.name || "");
  document.getElementById("prod-desc").value = decodeEntities(p.description || "");
  document.getElementById("prod-price").value = priceRegular || 0;

  // Cargar taxonomía (Categoría principal y subcategoría)
  const mainCat = p.category || "hombre";
  const catEl = document.getElementById("prod-category");
  if (catEl) catEl.value = mainCat;

  if (typeof updateSubcategoryOptions === "function") {
    updateSubcategoryOptions(mainCat, subCategory || "");
  }

  // Cargar estado de oferta y calcular porcentaje real
  const offerToggle = document.getElementById("prod-is-offer");
  if (offerToggle) {
    offerToggle.checked = Boolean(isOffer);
    const offerControls = document.getElementById("offer-controls");
    const numPriceRegular = Number(priceRegular) || 0;
    const priceOffer = p.price_offer ?? p.priceOffer ?? priceRegular;
    if (isOffer && numPriceRegular > 0) {
      if (offerControls) offerControls.classList.remove("hidden");
      const discountPercent = Math.max(1, Math.round((1 - (Number(priceOffer) || numPriceRegular) / numPriceRegular) * 100));
      const discountInput = document.getElementById("prod-discount");
      if (discountInput) discountInput.value = discountPercent;
      calculateOfferPrice();
    } else {
      if (offerControls) offerControls.classList.add("hidden");
    }
  }

  // Cargar estado de producto destacado en portada
  const featuredCheck = document.getElementById("prod-is-featured");
  if (featuredCheck) {
    featuredCheck.checked = Boolean(isFeatured);
  }

  // Pre-cargar selección de insignia exclusiva (Badge CRO)
  const badgeSelect = document.getElementById("prod-badge");
  if (badgeSelect) {
    const rawTag = (p.badge || p.tag || "").toString().trim();
    const norm = rawTag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (norm.includes("agotan")) {
      badgeSelect.value = "Agotándose rápido";
    } else if (norm.includes("top")) {
      badgeSelect.value = "Top en venta";
    } else {
      badgeSelect.value = "";
    }
  }

  // Clonar profundamente las variantes existentes
  currentVariants = Array.isArray(p.variants) ? JSON.parse(JSON.stringify(p.variants)) : [];
  syncTempFromCurrentVariants();
  renderVariantsList();

  // Restaurar imágenes y video en el buffer multimedia
  let existingImages = [];
  if (Array.isArray(p.media?.images) && p.media.images.length > 0) {
    existingImages = [...p.media.images];
  } else if (imageUrl) {
    existingImages = [imageUrl];
  }

  mediaBuffer = {
    images: existingImages,
    video: p.media?.video || ""
  };

  const videoInput = document.getElementById("prod-video-url");
  if (videoInput) videoInput.value = mediaBuffer.video;

  // Forzar actualización visual de miniaturas de fotos/video cargados
  renderMediaPreviews();
  initMediaDropZone();

  // Desplegar el modal visualmente
  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.remove("opacity-0"), 10);
};

// Procesamiento atómico del formulario: Actualizar vs Crear producto
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  syncCurrentVariantsFromTemp();
  if (!tempVariants || tempVariants.length === 0) {
    if (typeof showToast === "function") {
      showToast("Debes agregar al menos una variante (Color/Talla/Stock) para listar el producto.", "error");
    } else {
      alert("Debes agregar al menos una variante (Color/Talla/Stock) para listar el producto.");
    }
    return;
  }

  const priceReg = Math.abs(Number(document.getElementById("prod-price").value)) || 0;
  const isOffer = document.getElementById("prod-is-offer").checked;
  const discount = Number(document.getElementById("prod-discount").value) || 0;
  const priceOff = isOffer ? Math.round(priceReg * (1 - discount / 100)) : priceReg;

  // Resolver ID verificando tanto la variable en memoria como el campo oculto
  const hiddenIdVal = document.getElementById("product-id")?.value;
  const resolvedTargetId = editingId ? String(editingId) : (hiddenIdVal ? String(hiddenIdVal) : ("wz-" + Date.now()));

  let products = loadProducts();
  const existingIndex = resolvedTargetId ? products.findIndex((p) => String(p.id) === resolvedTargetId) : -1;
  const existingProduct = existingIndex > -1 ? products[existingIndex] : null;

  // Preservar multimedia existente si no se agregaron imágenes nuevas en esta edición
  let finalImages = [];
  if (mediaBuffer.images && mediaBuffer.images.length > 0) {
    finalImages = [...mediaBuffer.images];
  } else if (existingProduct?.media?.images && existingProduct.media.images.length > 0) {
    finalImages = [...existingProduct.media.images];
  } else if (existingProduct?.imageUrl) {
    finalImages = [existingProduct.imageUrl];
  } else {
    finalImages = ["https://images.unsplash.com/photo-1581636625402-29f2a01222ce"];
  }

  const inputVideoUrl = document.getElementById("prod-video-url")?.value.trim() || "";
  if (inputVideoUrl) {
    mediaBuffer.video = inputVideoUrl;
  }
  const finalVideo = mediaBuffer.video !== "" ? mediaBuffer.video : (existingProduct?.media?.video || "");

  // Calcular stock físico sumando todas las tallas
  let totalStock = 0;
  currentVariants.forEach((v) => {
    v.sizes?.forEach((s) => (totalStock += Number(s.stock) || 0));
  });

  // Preservar estado lógico de disponibilidad
  const preservedAvailable = existingProduct
    ? (existingProduct.isAvailable !== false && totalStock > 0)
    : (totalStock > 0);

  // Preservar o asignar estado normativo 'activo' si hay existencias reales
  const preservedStatus = existingProduct
    ? (totalStock > 0 && existingProduct.status !== "agotado" ? "activo" : "agotado")
    : (totalStock > 0 ? "activo" : "agotado");

  const selectedCat = document.getElementById("prod-category").value;
  const selectedSubCat = document.getElementById("prod-subcategory")?.value || "Camisetas";
  const isFeaturedTrend = document.getElementById("prod-is-featured")?.checked || false;
  const selectedBadge = document.getElementById("prod-badge")?.value || "";

  // Construir objeto limpio del producto
  const productData = {
    id: resolvedTargetId,
    name: sanitizeInput(document.getElementById("prod-name").value),
    description: sanitizeInput(document.getElementById("prod-desc").value),
    category: selectedCat,
    subCategory: selectedSubCat,
    sub_category: selectedSubCat,
    badge: selectedBadge,
    tag: selectedBadge,
    isFeatured: isFeaturedTrend,
    is_featured: isFeaturedTrend,
    media: {
      images: finalImages,
      video: finalVideo
    },
    imageUrl: finalImages[0],
    image_url: finalImages[0],
    priceRegular: priceReg,
    price_regular: priceReg,
    isOffer: isOffer,
    is_offer: isOffer,
    priceOffer: priceOff,
    price_offer: priceOff,
    isAvailable: preservedAvailable,
    is_available: preservedAvailable,
    status: preservedStatus,
    variants: currentVariants
  };

  // Reemplazar elemento existente o insertar nuevo sin duplicar
  if (existingIndex > -1) {
    products[existingIndex] = {
      ...products[existingIndex],
      ...productData,
      badge: selectedBadge,
      tag: selectedBadge
    };
  } else {
    products.push(productData);
  }

  let syncError = false;
  // Sincronización directa con la tabla 'productos' de Supabase (inserción y actualización)
  if (wzClient) {
    try {
      const { error } = await wzClient.from('productos').upsert(formatProductForSupabase(productData));
      if (error) {
        syncError = true;
        console.error("Error al sincronizar prenda con Supabase:", error);
        if (typeof showToast === "function") showToast(error.message, "error");
      } else if (isFeaturedTrend) {
        const { error: featError } = await wzClient.from("productos").update({ is_featured: false }).neq("id", resolvedTargetId);
        if (featError) {
          console.error("Error al sincronizar destacados en Supabase:", featError);
          if (typeof showToast === "function") showToast(featError.message, "error");
        }
      }
    } catch (err) {
      syncError = true;
      console.error("Fallo de conexión al sincronizar con Supabase:", err);
      if (typeof showToast === "function") showToast(err.message, "error");
    }
  }

  // Control de exclusividad de prenda Hero / Producto Tendencia tras confirmación exitosa
  if (isFeaturedTrend && !syncError) {
    products = products.map((prod) => ({
      ...prod,
      isFeatured: String(prod.id) === String(resolvedTargetId),
      is_featured: String(prod.id) === String(resolvedTargetId)
    }));
    if (typeof recordAuditEvent === "function") {
      recordAuditEvent(`Producto destacado en Hero: "${productData.name}"`);
    }
  }

  // Guardar en localStorage únicamente como respaldo offline
  saveProducts(products);

  // Limpiar estrictamente el estado y el formulario
  editingId = null;
  const hiddenInput = document.getElementById("product-id");
  if (hiddenInput) hiddenInput.value = "";
  form.reset();
  const badgeSelectEl = document.getElementById("prod-badge");
  if (badgeSelectEl) badgeSelectEl.value = "";
  const videoInput = document.getElementById("prod-video-url");
  if (videoInput) videoInput.value = "";
  currentVariants = [];
  tempVariants = [];
  mediaBuffer = { images: [], video: "" };

  closeModal();
  renderMediaPreviews();
  renderInventoryTable();

  if (!syncError && typeof showToast === "function") {
    showToast(existingIndex > -1 ? "Prenda actualizada exitosamente." : "Prenda guardada en el catálogo.");
  }
});

// Canal Realtime para mantener sincronizada la consola multiusuario en tiempo real
let adminProductsRealtimeChannel = null;
let realtimeDebounceTimer = null;

function setupAdminRealtime() {
  if (wzClient && !adminProductsRealtimeChannel) {
    adminProductsRealtimeChannel = wzClient
      .channel('admin:productos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        () => {
          if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(() => {
            fetchProductsFromSupabase();
          }, 400);
        }
      )
      .subscribe();
  }
}

// Sincronización centralizada inicial desde la tabla 'productos' de Supabase
async function fetchProductsFromSupabase() {
  if (!wzClient) return;
  try {
    const { data, error } = await wzClient.from('productos').select('*');
    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped = data.map((row) => {
        let variants = row.variants;
        if (typeof variants === "string") {
          try {
            variants = JSON.parse(variants);
          } catch (e) {
            variants = [];
          }
        }
        return {
          ...row,
          variants: Array.isArray(variants) ? variants : [],
          priceRegular: Number(row.price_regular ?? row.priceRegular ?? 0),
          priceOffer: Number(row.price_offer ?? row.priceOffer ?? 0),
          subCategory: row.sub_category ?? row.subCategory ?? "",
          isOffer: Boolean(row.is_offer ?? row.isOffer),
          isFeatured: Boolean(row.is_featured ?? row.isFeatured),
          isAvailable: Boolean(row.is_available ?? row.isAvailable ?? true),
          imageUrl: row.image_url ?? row.imageUrl
        };
      });
      saveProducts(mapped);
      renderInventoryTable();
    }
  } catch (err) {
    console.warn("No se pudo obtener productos desde Supabase:", err);
  }
}

// ==========================================
// INICIALIZACIÓN GENERAL
// ==========================================
function initDashboard() {
  initializeMockSales();
  renderAnalytics("day"); // Cargar por defecto vista del día
  renderInventoryTable();
  fetchProductsFromSupabase();
  setupAdminRealtime();
}

// 9. Sistema Integral de Copia de Respaldo (Backup & Restore)
window.exportCatalogBackup = () => {
  const products = loadProducts();
  const blob = new Blob([JSON.stringify(products, null, 2)], { type: "application/json" });
  const downloadAnchor = document.createElement("a");
  const fileName = "db.json";
  const fileUrl = URL.createObjectURL(blob);
  downloadAnchor.setAttribute("href", fileUrl);
  downloadAnchor.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(fileUrl);
  if (typeof showToast === "function") showToast("Catálogo descargado exitosamente en db.json");
};

const btnExportDb = document.getElementById("btn-export-db");
if (btnExportDb) {
  btnExportDb.addEventListener("click", window.exportCatalogBackup);
}

window.importCatalogBackup = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (!Array.isArray(importedData)) throw new Error("El archivo no contiene un catálogo válido.");
      
      saveProducts(importedData);
      if (wzClient) await wzClient.from("productos").upsert(importedData.map(formatProductForSupabase));
      renderInventoryTable();
      if (typeof recordAuditEvent === "function") recordAuditEvent("Restauración de catálogo desde archivo JSON");
      if (typeof showToast === "function") showToast("Catálogo restaurado exitosamente.");
    } catch (err) {
      if (typeof showToast === "function") showToast("Error: Archivo de respaldo corrupto o incompatible.", "error");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

// Arrancar al cargar la vista
document.addEventListener("DOMContentLoaded", checkAuth);

// Purga física de datos huérfanos en localStorage
const executeGarbageCollector = () => {
  const products = JSON.parse(localStorage.getItem('wz_core_products')) || [];
  const validMediaSet = new Set();

  products.forEach(p => {
    if (p.media?.images) p.media.images.forEach(img => validMediaSet.add(img));
    if (p.media?.video) validMediaSet.add(p.media.video);
  });

  // Inspección de llaves huérfanas de medios
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('wz_media_orphan_')) {
      const storedData = localStorage.getItem(key);
      if (!validMediaSet.has(storedData)) {
        localStorage.removeItem(key);
      }
    }
  });
};