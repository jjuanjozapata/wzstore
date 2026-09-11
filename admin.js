/**
 * WZSTORE - Core Administrativo
 * Lógica de negocio, autenticación y análisis de datos en memoria local.
 */

// ==========================================
// 1. SISTEMA DE AUTENTICACIÓN
// ==========================================
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

// Constantes del motor de autenticación multiusuario
const USERS_STORAGE_KEY = "wz_auth_users";
const SESSION_KEY = "wz_admin_session";
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos de inactividad

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
  return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY)) || initializeUsersStore();
};

const saveStoredUsers = (usersList) => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersList));
};

const getCurrentSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};

// Aplicación de directivas de seguridad basadas en roles (RBAC)
const applyRolePermissions = () => {
  const session = getCurrentSession();
  if (!session) return;

  const isMasterAdmin = session.role === "admin";
  const roleBadge = document.getElementById("wz-current-role-badge");
  const usersBtn = document.getElementById("wz-open-users-btn");
  const analyticsSection = document.querySelector("section:has(#kpi-revenue)") || document.querySelector("main section:first-of-type");

  if (roleBadge) {
    roleBadge.textContent = isMasterAdmin ? "Rol: Administrador Total" : "Rol: Trabajador / Monitor";
    roleBadge.className = isMasterAdmin
      ? "text-xs px-2.5 py-1 rounded-full font-bold bg-slate-800 text-emerald-400 border border-emerald-500/30 uppercase"
      : "text-xs px-2.5 py-1 rounded-full font-bold bg-slate-800 text-amber-400 border border-amber-500/30 uppercase";
  }

  // Visualización del botón de gestión de usuarios
  if (usersBtn) {
    if (isMasterAdmin) {
      usersBtn.classList.remove("hidden");
    } else {
      usersBtn.classList.add("hidden");
    }
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

// Verificación y mantenimiento del estado de sesión
// Control de sesión activa de 30 min sobre el contenedor #wz-login-overlay
function checkAuth() {
  const sessionData = getCurrentSession();
  const now = Date.now();
  const overlay = document.getElementById("wz-login-overlay") || document.getElementById("login-modal");
  const dashboard = document.getElementById("admin-dashboard");

  if (!sessionData || now - sessionData.timestamp > SESSION_TIMEOUT) {
    if (overlay) overlay.classList.remove("hidden");
    if (dashboard) dashboard.classList.add("hidden");
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    // Renovar marca de tiempo de actividad en sessionStorage
    sessionData.timestamp = now;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    if (overlay) overlay.classList.add("hidden");
    if (dashboard) dashboard.classList.remove("hidden");
    initDashboard();
    applyRolePermissions();
  }
}

// Función auxiliar de hashing criptográfico unidireccional SHA-256
const sha256Hex = async (plainText) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// 10. Actualización Masiva de Precios por Categoría
window.applyBulkPriceAdjustment = (targetCategory, percentageChange) => {
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
  renderInventoryTable();
  if (typeof recordAuditEvent === "function") {
    recordAuditEvent(`Ajuste masivo de precios: ${percentageChange}% en ${targetCategory} (${affectedCount} productos).`);
  }
  if (typeof showToast === "function") {
    showToast(`Precios actualizados en ${affectedCount} prendas.`);
  }
};

// Siembra de usuarios incorporando la cuenta administrativa canónica admin / wzstore2026
const initializeUsersStore = () => {
  const storedUsers = localStorage.getItem(USERS_STORAGE_KEY);
  // Hash SHA-256 precalculado de "wzstore2026": 4dfc0fcf9c5ae52f9b8823ce9754f9a5d1b702ecffcfc07ef9ad7ad5bf0f946d
  const canonicalAccounts = [
    { username: "admin", passwordHash: "4dfc0fcf9c5ae52f9b8823ce9754f9a5d1b702ecffcfc07ef9ad7ad5bf0f946d", role: "admin", createdAt: 1726000000000 },
    { username: "juan", passwordHash: "99e289bf65d4911d8d5dfbcabdd0cfc5108d6c70fb9073c6dc20d23fb5f782f2", role: "admin", createdAt: 1726000000000 },
    { username: "monitor", passwordHash: "64d0dc372f88421c60633b4976ea65f3d45e054a7c87c04ff2b7ea08d7457bca", role: "worker", createdAt: 1726000000000 }
  ];

  if (!storedUsers) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(canonicalAccounts));
    return canonicalAccounts;
  }

  try {
    let parsed = JSON.parse(storedUsers);
    // Sanitizar cuentas preexistentes: migrar cualquier texto plano a SHA-256 y eliminar el atributo inseguro
    let modified = false;
    parsed = parsed.map((u) => {
      if (u.password && !u.passwordHash) {
        modified = true;
        // Asignar hash de la contraseña por defecto si existía en texto plano
        return { username: u.username, passwordHash: "4dfc0fcf9c5ae52f9b8823ce9754f9a5d1b702ecffcfc07ef9ad7ad5bf0f946d", role: u.role, createdAt: u.createdAt || Date.now() };
      }
      return u;
    });

    if (!parsed.some((u) => u.username.toLowerCase() === "admin")) {
      parsed.push(canonicalAccounts[0]);
      modified = true;
    }

    if (modified) {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (err) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(canonicalAccounts));
    return canonicalAccounts;
  }
};

// Algoritmo de bloqueo por fuerza bruta (3 intentos, 5 minutos de suspensión con cuenta regresiva)
const LOCKOUT_KEY = "wz_admin_lockout";
let lockoutInterval = null;

const applyLockoutUI = (secondsRemaining) => {
  const submitBtn = document.querySelector("#login-form button[type='submit']");
  const errorEl = document.getElementById("login-error");
  if (!submitBtn || !errorEl) return;

  submitBtn.disabled = true;
  submitBtn.classList.add("opacity-50", "cursor-not-allowed", "bg-gray-600");
  submitBtn.classList.remove("bg-neon", "hover:bg-green-400");
  submitBtn.innerText = `Bloqueado (${secondsRemaining}s)`;

  errorEl.textContent = `Demasiados intentos fallidos. Panel bloqueado por seguridad: ${secondsRemaining} segundos restantes.`;
  errorEl.classList.remove("hidden");
};

const releaseLockoutUI = () => {
  const submitBtn = document.querySelector("#login-form button[type='submit']");
  const errorEl = document.getElementById("login-error");
  if (!submitBtn || !errorEl) return;

  clearInterval(lockoutInterval);
  lockoutInterval = null;
  submitBtn.disabled = false;
  submitBtn.classList.remove("opacity-50", "cursor-not-allowed", "bg-gray-600");
  submitBtn.classList.add("bg-neon", "hover:bg-green-400");
  submitBtn.innerText = "Desbloquear Panel";
  errorEl.classList.add("hidden");
  localStorage.removeItem(LOCKOUT_KEY);
};

const checkExistingLockout = () => {
  const lockoutState = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{"attempts": 0, "lockedUntil": 0}');
  const now = Date.now();

  if (lockoutState.lockedUntil > now) {
    let remaining = Math.ceil((lockoutState.lockedUntil - now) / 1000);
    applyLockoutUI(remaining);

    if (lockoutInterval) clearInterval(lockoutInterval);
    lockoutInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        releaseLockoutUI();
      } else {
        applyLockoutUI(remaining);
      }
    }, 1000);
    return true;
  }
  return false;
};

// Verificar estado de bloqueo inmediatamente al renderizar
document.addEventListener("DOMContentLoaded", checkExistingLockout);

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  if (checkExistingLockout()) return;

  const lockoutState = JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{"attempts": 0, "lockedUntil": 0}');
  const now = Date.now();

  const u = document.getElementById("username").value.trim().toLowerCase();
  const p = document.getElementById("password").value;
  const incomingHash = await sha256Hex(p);

  const users = getStoredUsers();
  // Comparación criptográfica estricta: ninguna verificación en texto plano permitida
  const matchedUser = users.find((user) => 
    user.username.toLowerCase() === u && 
    user.passwordHash === incomingHash
  );

  if (matchedUser) {
    localStorage.removeItem(LOCKOUT_KEY);
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        username: matchedUser.username,
        role: matchedUser.role,
        timestamp: Date.now()
      })
    );
    const errorEl = document.getElementById("login-error");
    if (errorEl) errorEl.classList.add("hidden");
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    checkAuth();
  } else {
    lockoutState.attempts = (lockoutState.attempts || 0) + 1;

    // Bloqueo tras 3 intentos fallidos por exactamente 5 minutos (300.000 ms)
    if (lockoutState.attempts >= 3) {
      const lockDurationMs = 5 * 60 * 1000;
      lockoutState.lockedUntil = now + lockDurationMs;
      lockoutState.attempts = 0;
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify(lockoutState));
      checkExistingLockout();
    } else {
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify(lockoutState));
      const remainingAttempts = 3 - lockoutState.attempts;
      const errorEl = document.getElementById("login-error");
      errorEl.textContent = `Credenciales inválidas. Intentos restantes: ${remainingAttempts}.`;
      errorEl.classList.remove("hidden");
    }
  }
});

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
  pwdForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const currPass = document.getElementById("wz-pwd-current").value;
    const newPass = document.getElementById("wz-pwd-new").value;
    const confirmPass = document.getElementById("wz-pwd-confirm").value;
    const session = getCurrentSession();

    if (!session) return;

    const users = getStoredUsers();
    const userIndex = users.findIndex((u) => u.username.toLowerCase() === session.username.toLowerCase());

    if (userIndex === -1 || users[userIndex].password !== currPass) {
      showToast("La contraseña actual no coincide.", "error");
      return;
    }

    if (newPass.length < 6) {
      showToast("La nueva clave debe tener al menos 6 caracteres.", "error");
      return;
    }

    if (newPass !== confirmPass) {
      showToast("Las contraseñas nuevas no coinciden entre sí.", "error");
      return;
    }

    users[userIndex].password = newPass;
    saveStoredUsers(users);
    closePasswordModal();
    showToast("Contraseña actualizada exitosamente.");
  });
}

// Controladores y Render para Modal de Gestión de Usuarios
const usersModal = document.getElementById("wz-users-modal");
const openUsersBtn = document.getElementById("wz-open-users-btn");
const closeUsersBtn = document.getElementById("wz-close-users-btn");
const createUserForm = document.getElementById("wz-create-user-form");

const renderUsersTable = () => {
  const tbody = document.getElementById("wz-users-table-body");
  if (!tbody) return;

  const users = getStoredUsers();
  const session = getCurrentSession();

  tbody.innerHTML = users
    .map((u) => {
      const isCurrent = session?.username?.toLowerCase() === u.username.toLowerCase();
      const badgeColor = u.role === "admin" ? "text-emerald-400 bg-emerald-950/40 border border-emerald-800" : "text-amber-400 bg-amber-950/40 border border-amber-800";
      return `
        <tr class="hover:bg-dark transition-colors">
          <td class="p-3 font-semibold text-white flex items-center gap-2">
            <span>${u.username}</span>
            ${isCurrent ? '<span class="text-[10px] text-gray-500 font-normal">(Sesión actual)</span>' : ""}
          </td>
          <td class="p-3">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded uppercase ${badgeColor}">${u.role === "admin" ? "Administrador" : "Trabajador"}</span>
          </td>
          <td class="p-3 text-right">
            ${
              !isCurrent
                ? `<button type="button" onclick="deleteUserAccount('${u.username}')" class="text-red-400 hover:text-red-300 font-bold">Eliminar</button>`
                : '<span class="text-gray-600">-</span>'
            }
          </td>
        </tr>
      `;
    })
    .join("");
};

window.deleteUserAccount = (usernameToDelete) => {
  let users = getStoredUsers();
  users = users.filter((u) => u.username.toLowerCase() !== usernameToDelete.toLowerCase());
  saveStoredUsers(users);
  renderUsersTable();
  showToast(`Usuario "${usernameToDelete}" eliminado.`);
};

if (openUsersBtn) {
  openUsersBtn.addEventListener("click", () => {
    if (usersModal) {
      renderUsersTable();
      usersModal.classList.remove("hidden");
    }
  });
}

if (closeUsersBtn) {
  closeUsersBtn.addEventListener("click", () => {
    if (usersModal) usersModal.classList.add("hidden");
  });
}

if (createUserForm) {
  createUserForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newUsername = sanitizeInput(document.getElementById("wz-new-username").value.trim().toLowerCase());
    const newPassword = document.getElementById("wz-new-password").value;
    const newRole = document.getElementById("wz-new-role").value;

    const users = getStoredUsers();
    if (users.some((u) => u.username.toLowerCase() === newUsername)) {
      showToast("Ese nombre de usuario ya existe.", "error");
      return;
    }

    users.push({
      username: newUsername,
      password: newPassword,
      role: newRole,
      createdAt: Date.now()
    });

    saveStoredUsers(users);
    createUserForm.reset();
    renderUsersTable();
    showToast(`Usuario "${newUsername}" registrado.`);
  });
}

// Evento de Logout
document.getElementById("logout-btn").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "index.html"; // Lo sacamos a la tienda principal
});

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

// Renderizado de tabla con atributos data para delegación segura de eventos
function renderInventoryTable() {
  const products = loadProducts();
  const tbody = document.getElementById("inventory-table-body");
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">El catálogo está vacío.</td></tr>`;
    return;
  }

  tbody.innerHTML = products
    .map((p) => {
      let totalStock = 0;
      p.variants?.forEach((v) => {
        v.sizes?.forEach((s) => (totalStock += Number(s.stock) || 0));
      });
      const isAvailable = p.status !== "agotado" && p.isAvailable !== false && totalStock > 0;
      let statusText = "";

      if (!isAvailable) {
        statusText = `<span class="text-red-500 font-bold">AGOTADO (Apagado)</span>`;
      } else if (totalStock < 3) {
        statusText = `<span class="text-amber-400 font-extrabold bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded text-[11px] animate-pulse">⚠️ CRÍTICO: ${totalStock} unds</span>`;
      } else {
        statusText = `<span class="text-green-400 font-semibold">${totalStock} unds</span>`;
      }
      
      const safeId = String(p.id);
      const displayId = safeId.includes("-") ? safeId.split("-")[1] : safeId;

      return `
        <tr class="hover:bg-dark transition-colors group">
          <td class="p-4 flex items-center gap-3">
            <img src="${p.imageUrl || (p.media?.images && p.media.images[0]) || 'https://images.unsplash.com/photo-1581636625402-29f2a01222ce'}" class="w-10 h-10 object-cover rounded border border-gray-700" alt="${p.name}">
            <div>
              <p class="font-bold text-white truncate max-w-[200px]">${p.name}</p>
              <p class="text-xs text-gray-500">${displayId}</p>
            </div>
          </td>
          <td class="p-4">
            $${Number(p.priceRegular || 0).toLocaleString("es-CO")}
            ${p.isOffer ? `<br><span class="text-xs text-neon font-bold">OFERTA: $${Number(p.priceOffer || 0).toLocaleString("es-CO")}</span>` : ""}
          </td>
          <td class="p-4 text-gray-300 text-sm">${p.category || 'General'}</td>
          <td class="p-4">
            <div class="flex items-center gap-2">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" onchange="toggleProductStatus('${safeId}')" class="sr-only peer" ${isAvailable ? "checked" : ""}>
                <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neon"></div>
              </label>
              <span class="text-xs">${statusText}</span>
            </div>
          </td>
          <td class="p-4 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" data-action="edit" data-id="${safeId}" class="text-blue-400 hover:text-blue-300 text-sm font-medium">Editar</button>
            ${
              (typeof getCurrentSession === "function" && getCurrentSession()?.role === "admin")
                ? `<button type="button" id="del-btn-${safeId}" onclick="confirmDelete('${safeId}')" class="text-red-500 hover:text-red-400 text-sm font-medium">Eliminar</button>`
                : `<span class="text-xs text-gray-600 cursor-not-allowed">Bloqueado</span>`
            }
          </td>
        </tr>
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
window.confirmDelete = function (id) {
  const btn = document.getElementById(`del-btn-${id}`);
  if (btn.innerText === "Eliminar") {
    btn.innerText = "¿Seguro?";
    btn.classList.add("text-orange-500", "font-black");
    setTimeout(() => {
      if (btn) {
        btn.innerText = "Eliminar";
        btn.classList.remove("text-orange-500", "font-black");
      }
    }, 3000);
  } else {
    // Eliminar definitivamente
    let products = loadProducts();
    products = products.filter((p) => p.id !== id);
    saveProducts(products);
    renderInventoryTable();
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
      saveProducts(products);
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
      let products = loadProducts();
      const idx = products.findIndex((p) => p.id === target.id);
      if (idx > -1) products[idx] = target;
      saveProducts(products);
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

window.toggleProductStatus = function(id) {
  let products = loadProducts();
  const index = products.findIndex(p => p.id === id);
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
    target.variants?.forEach((variant) => {
      variant.sizes?.forEach((sizeObj) => {
        sizeObj.stock = 0;
      });
    });
    saveProducts(products);
    renderInventoryTable();
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

// 15. Compresión Automática Inteligente en Canvas con cálculo dinámico
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    // Determinación dinámica de factores según el peso del archivo de entrada
    let maxDimension = 800;
    let targetQuality = 0.75;

    if (file.size > 3 * 1024 * 1024) {
      maxDimension = 650;
      targetQuality = 0.55;
    } else if (file.size > 1024 * 1024) {
      maxDimension = 750;
      targetQuality = 0.65;
    } else if (file.size < 300 * 1024) {
      maxDimension = 900;
      targetQuality = 0.85;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
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

        const dataUrl = canvas.toDataURL("image/jpeg", targetQuality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Procesamiento de video MP4 validando cuota máxima de 4MB
const processVideo = (file) => {
  return new Promise((resolve, reject) => {
    const MAX_VIDEO_BYTES = 4 * 1024 * 1024; // Límite exacto de 4MB
    if (file.size > MAX_VIDEO_BYTES) {
      if (typeof showToast === "function") {
        showToast("El video excede el límite permitido de 4MB.", "error");
      } else {
        alert("El video excede el límite permitido de 4MB.");
      }
      return resolve(null);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
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
      <div class="relative group rounded-lg overflow-hidden border border-slate-700 h-16 bg-slate-950 flex items-center justify-center">
        <span class="text-[10px] font-bold text-emerald-400">MP4 OK</span>
        <button type="button" onclick="removeBufferedMedia('video')" class="absolute inset-0 bg-red-950/80 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
      </div>
    `;
  }
};

window.removeBufferedMedia = (type, index = null) => {
  if (type === "image") mediaBuffer.images.splice(index, 1);
  if (type === "video") mediaBuffer.video = "";
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
    } else if (file.type === "video/mp4") {
      if (mediaBuffer.video) {
        alert("Límite alcanzado: Solo 1 video por prenda.");
        continue;
      }
      const processedVid = await processVideo(file);
      if (processedVid) mediaBuffer.video = processedVid;
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
  mediaBuffer = { images: [], video: "" };
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

// Mapeo Dinámico de Variantes
document.getElementById("add-variant-btn").addEventListener("click", () => {
  const color = document.getElementById("var-color").value.trim();
  const size = document.getElementById("var-size").value.trim().toUpperCase();
  const stock = Number(document.getElementById("var-stock").value);

  if (!color || !size || stock < 0) {
    alert("Completa color, talla y stock válido para agregar la variante.");
    return;
  }

  // Lógica para agrupar por color si ya existe
  let existingColor = currentVariants.find(
    (v) => v.color.toLowerCase() === color.toLowerCase(),
  );

  if (existingColor) {
    // Verificar si la talla ya existe para ese color
    let existingSize = existingColor.sizes.find((s) => s.size === size);
    if (existingSize) {
      existingSize.stock = stock; // Actualizamos stock si repite
    } else {
      existingColor.sizes.push({ size, stock });
    }
  } else {
    currentVariants.push({
      color: color,
      colorHex: "#" + Math.floor(Math.random() * 16777215).toString(16), // Color hex aleatorio para UI del cliente
      sizes: [{ size, stock }],
    });
  }

  // Limpiar inputs
  document.getElementById("var-size").value = "";
  document.getElementById("var-stock").value = "";
  document.getElementById("var-color").focus();

  renderVariantsList();
});

function renderVariantsList() {
  const list = document.getElementById("variants-list");
  const msg = document.getElementById("empty-variants-msg");

  if (currentVariants.length === 0) {
    list.innerHTML = "";
    list.appendChild(msg);
    msg.classList.remove("hidden");
    return;
  }
  msg.classList.add("hidden");

  let html = "";
  currentVariants.forEach((v, colorIdx) => {
    html += `<div class="bg-dark p-2 rounded border border-gray-700 flex flex-wrap items-center gap-2 mb-2">
            <span class="font-bold text-sm min-w-[80px]">${v.color}</span>`;

    v.sizes.forEach((s, sizeIdx) => {
      html += `<span class="bg-gray-800 px-2 py-1 rounded text-xs">${s.size} : <b class="text-neon">${s.stock}</b></span>`;
    });

    html += `<button type="button" onclick="removeVariantColor(${colorIdx})" class="ml-auto text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1">&times; Quitar</button>
        </div>`;
  });
  list.innerHTML = html;
}

window.removeVariantColor = function (idx) {
  currentVariants.splice(idx, 1);
  renderVariantsList();
};




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

  // Establecer el ID de edición en memoria y en el input oculto
  editingId = targetIdStr;
  const hiddenIdInput = document.getElementById("product-id");
  if (hiddenIdInput) {
    hiddenIdInput.value = targetIdStr;
  }

  // Cargar información textual básica
  document.getElementById("crud-modal-title").innerText = "Editar Prenda";
  document.getElementById("prod-name").value = p.name || "";
  document.getElementById("prod-desc").value = p.description || "";
  document.getElementById("prod-price").value = p.priceRegular || 0;

  // Cargar taxonomía (Categoría principal y subcategoría)
  const mainCat = p.category || "hombre";
  const catEl = document.getElementById("prod-category");
  if (catEl) catEl.value = mainCat;

  if (typeof updateSubcategoryOptions === "function") {
    updateSubcategoryOptions(mainCat, p.subCategory || "");
  }

  // Cargar estado de oferta y calcular porcentaje real
  const offerToggle = document.getElementById("prod-is-offer");
  if (offerToggle) {
    offerToggle.checked = Boolean(p.isOffer);
    const offerControls = document.getElementById("offer-controls");
    if (p.isOffer && p.priceRegular > 0) {
      if (offerControls) offerControls.classList.remove("hidden");
      const discountPercent = Math.max(1, Math.round((1 - (p.priceOffer || p.priceRegular) / p.priceRegular) * 100));
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
    featuredCheck.checked = Boolean(p.isFeatured);
  }

  // Clonar profundamente las variantes existentes
  currentVariants = Array.isArray(p.variants) ? JSON.parse(JSON.stringify(p.variants)) : [];
  renderVariantsList();

  // Restaurar imágenes y video en el buffer multimedia
  let existingImages = [];
  if (Array.isArray(p.media?.images) && p.media.images.length > 0) {
    existingImages = [...p.media.images];
  } else if (p.imageUrl) {
    existingImages = [p.imageUrl];
  }

  mediaBuffer = {
    images: existingImages,
    video: p.media?.video || ""
  };

  // Forzar actualización visual de miniaturas de fotos/video cargados
  renderMediaPreviews();
  initMediaDropZone();

  // Desplegar el modal visualmente
  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.remove("opacity-0"), 10);
};

// Procesamiento atómico del formulario: Actualizar vs Crear producto
form.addEventListener("submit", (e) => {
  e.preventDefault();

  if (!currentVariants || currentVariants.length === 0) {
    alert("Debes agregar al menos una variante (Color/Talla/Stock) para listar el producto.");
    return;
  }

  const priceReg = Math.abs(Number(document.getElementById("prod-price").value)) || 0;
  const isOffer = document.getElementById("prod-is-offer").checked;
  const discount = Number(document.getElementById("prod-discount").value) || 0;
  const priceOff = isOffer ? Math.round(priceReg * (1 - discount / 100)) : priceReg;

  // Resolver ID verificando tanto la variable en memoria como el campo oculto
  const hiddenIdVal = document.getElementById("product-id")?.value;
  const resolvedTargetId = editingId ? String(editingId) : (hiddenIdVal ? String(hiddenIdVal) : null);

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

  // Control de exclusividad de prenda Hero / Producto Tendencia
  if (isFeaturedTrend) {
    products = products.map((prod) => ({
      ...prod,
      isFeatured: String(prod.id) === String(resolvedTargetId)
    }));
    if (typeof recordAuditEvent === "function") {
      recordAuditEvent(`Producto destacado en Hero: "${sanitizeInput(document.getElementById("prod-name").value)}"`);
    }
  }

  // Construir objeto limpio del producto
  const productData = {
    id: resolvedTargetId ? resolvedTargetId : "wz-" + Date.now(),
    name: sanitizeInput(document.getElementById("prod-name").value),
    description: sanitizeInput(document.getElementById("prod-desc").value),
    category: selectedCat,
    subCategory: selectedSubCat,
    isFeatured: isFeaturedTrend,
    media: {
      images: finalImages,
      video: finalVideo
    },
    imageUrl: finalImages[0],
    priceRegular: priceReg,
    isOffer: isOffer,
    priceOffer: priceOff,
    isAvailable: preservedAvailable,
    status: preservedStatus,
    variants: currentVariants
  };

  // Reemplazar elemento existente o insertar nuevo sin duplicar
  if (existingIndex > -1) {
    products[existingIndex] = { ...products[existingIndex], ...productData };
  } else {
    products.push(productData);
  }

  // Guardar en localStorage
  saveProducts(products);

  // Limpiar estrictamente el estado y el formulario
  editingId = null;
  const hiddenInput = document.getElementById("product-id");
  if (hiddenInput) hiddenInput.value = "";
  form.reset();
  currentVariants = [];
  mediaBuffer = { images: [], video: "" };

  closeModal();
  renderMediaPreviews();
  renderInventoryTable();

  if (typeof showToast === "function") {
    showToast(existingIndex > -1 ? "Prenda actualizada exitosamente." : "Prenda guardada en el catálogo.");
  }
});



// ==========================================
// INICIALIZACIÓN GENERAL
// ==========================================
function initDashboard() {
  initializeMockSales();
  renderAnalytics("day"); // Cargar por defecto vista del día
  renderInventoryTable();
}

// 9. Sistema Integral de Copia de Respaldo (Backup & Restore)
window.exportCatalogBackup = () => {
  const products = loadProducts();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products, null, 2));
  const downloadAnchor = document.createElement("a");
  const fileName = `WZSTORE_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", fileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  if (typeof showToast === "function") showToast("Copia de seguridad descargada exitosamente.");
};

window.importCatalogBackup = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (!Array.isArray(importedData)) throw new Error("El archivo no contiene un catálogo válido.");
      
      saveProducts(importedData);
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