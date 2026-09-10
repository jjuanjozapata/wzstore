/**
 * WZSTORE - Core Administrativo
 * Lógica de negocio, autenticación y análisis de datos en memoria local.
 */

// ==========================================
// 1. SISTEMA DE AUTENTICACIÓN
// ==========================================
const AUTH_USER = 'juan';
const AUTH_PASS = 'juan1234';
const SESSION_KEY = 'wz_admin_session';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

function checkAuth() {
    const sessionData = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    const now = Date.now();

    if (!sessionData || (now - sessionData.timestamp > SESSION_TIMEOUT)) {
        // Bloquear vista, mostrar login
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
        sessionStorage.removeItem(SESSION_KEY);
        
        // Redirigir si se intenta forzar por URL (opcional, aquí bloqueamos visualmente)
        // window.location.href = 'index.html'; 
    } else {
        // Renovar token y mostrar dashboard
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ timestamp: now }));
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        initDashboard();
    }
}

// Evento de Login
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;

    if (u === AUTH_USER && p === AUTH_PASS) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ timestamp: Date.now() }));
        document.getElementById('login-error').classList.add('hidden');
        checkAuth();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
});

// Evento de Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html'; // Lo sacamos a la tienda principal
});

// ==========================================
// 2. MÓDULO ANALÍTICO (MOCK ENGINE)
// ==========================================
function initializeMockSales() {
    if (!localStorage.getItem('wz_sales_history')) {
        const mockSales = [];
        const now = new Date();
        const productNames = ["Alpha Pro Tee", "Leggings Core", "Zapatillas AeroBoost", "Top High-Impact", "Shorts Combat"];
        
        // Generar 100 ventas aleatorias en el último año
        for (let i = 0; i < 100; i++) {
            const randomDaysAgo = Math.floor(Math.random() * 365);
            const date = new Date(now.getTime() - (randomDaysAgo * 24 * 60 * 60 * 1000));
            const qty = Math.floor(Math.random() * 3) + 1;
            const price = Math.floor(Math.random() * 150000) + 50000;
            
            mockSales.push({
                id: 'ORD-' + Math.floor(Math.random() * 10000),
                timestamp: date.getTime(),
                product: productNames[Math.floor(Math.random() * productNames.length)],
                quantity: qty,
                total: price * qty
            });
        }
        localStorage.setItem('wz_sales_history', JSON.stringify(mockSales));
    }
}

function renderAnalytics(timeframe = 'day') {
    const sales = JSON.parse(localStorage.getItem('wz_sales_history')) || [];
    const now = new Date().getTime();
    
    // Configurar límites de tiempo
    const timeLimits = {
        'day': 24 * 60 * 60 * 1000,
        'week': 7 * 24 * 60 * 60 * 1000,
        'month': 30 * 24 * 60 * 60 * 1000,
        'year': 365 * 24 * 60 * 60 * 1000
    };

    const limit = timeLimits[timeframe];
    const filteredSales = sales.filter(s => (now - s.timestamp) <= limit);

    // Calcular KPIs
    const totalRevenue = filteredSales.reduce((acc, curr) => acc + curr.total, 0);
    const totalItems = filteredSales.reduce((acc, curr) => acc + curr.quantity, 0);
    const avgTicket = filteredSales.length > 0 ? (totalRevenue / filteredSales.length) : 0;

    // Actualizar UI
    document.getElementById('kpi-revenue').innerText = `$${totalRevenue.toLocaleString('es-CO')}`;
    document.getElementById('kpi-sales').innerText = totalItems;
    document.getElementById('kpi-ticket').innerText = `$${Math.round(avgTicket).toLocaleString('es-CO')}`;

    // Dibujar Gráfica Nativa de Barras (Top Productos)
    const productStats = {};
    filteredSales.forEach(s => {
        if (!productStats[s.product]) productStats[s.product] = 0;
        productStats[s.product] += s.quantity;
    });

    const sortedProducts = Object.entries(productStats).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxQty = sortedProducts.length > 0 ? sortedProducts[0][1] : 1;
    const chartContainer = document.getElementById('chart-container');
    
    if (sortedProducts.length === 0) {
        chartContainer.innerHTML = '<p class="text-gray-500 text-sm">No hay ventas registradas en este periodo.</p>';
        return;
    }

    chartContainer.innerHTML = sortedProducts.map(([name, qty]) => {
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
    }).join('');
}

// Filtros de tiempo UI
document.querySelectorAll('.time-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.time-filter').forEach(b => {
            b.classList.remove('bg-neon', 'text-black', 'active-filter');
            b.classList.add('text-gray-400');
        });
        e.target.classList.remove('text-gray-400');
        e.target.classList.add('bg-neon', 'text-black', 'active-filter');
        
        renderAnalytics(e.target.dataset.time);
    });
});

// ==========================================
// 3. CRUD & GESTIÓN DE INVENTARIO
// ==========================================
let currentVariants = [];
let editingId = null;

function loadProducts() {
    return JSON.parse(localStorage.getItem('wz_core_products')) || [];
}

function saveProducts(products) {
    localStorage.setItem('wz_core_products', JSON.stringify(products));
}

function renderInventoryTable() {
    const products = loadProducts();
    const tbody = document.getElementById('inventory-table-body');
    
    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">El catálogo está vacío.</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => {
        // Calculamos stock total virtual sumando variantes
        let totalStock = 0;
        p.variants.forEach(v => {
            v.sizes.forEach(s => totalStock += Number(s.stock));
        });
        
        // Si el estado "isAvailable" es falso, anulamos visualmente el stock
        const isAvailable = p.isAvailable !== false; 
        const statusText = isAvailable ? `<span class="text-green-400">${totalStock} unds</span>` : `<span class="text-red-500 font-bold">AGOTADO (Apagado)</span>`;

        return `
            <tr class="hover:bg-dark transition-colors group">
                <td class="p-4 flex items-center gap-3">
                    <img src="${p.imageUrl}" class="w-10 h-10 object-cover rounded border border-gray-700">
                    <div>
                        <p class="font-bold text-white truncate max-w-[200px]">${p.name}</p>
                        <p class="text-xs text-gray-500">${p.id.split('-')[1]}</p>
                    </div>
                </td>
                <td class="p-4">
                    $${p.priceRegular.toLocaleString('es-CO')}
                    ${p.isOffer ? `<br><span class="text-xs text-neon font-bold">OFERTA: $${p.priceOffer.toLocaleString('es-CO')}</span>` : ''}
                </td>
                <td class="p-4 text-gray-300 text-sm">${p.category}</td>
                <td class="p-4">
                    <div class="flex items-center gap-2">
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" onchange="toggleProductStatus('${p.id}')" class="sr-only peer" ${isAvailable ? 'checked' : ''}>
                            <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neon"></div>
                        </label>
                        <span class="text-xs">${statusText}</span>
                    </div>
                </td>
                <td class="p-4 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="editProduct('${p.id}')" class="text-blue-400 hover:text-blue-300 text-sm font-medium">Editar</button>
                    <button id="del-btn-${p.id}" onclick="confirmDelete('${p.id}')" class="text-red-500 hover:text-red-400 text-sm font-medium">Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Acción de Doble Confirmación para Eliminar
window.confirmDelete = function(id) {
    const btn = document.getElementById(`del-btn-${id}`);
    if (btn.innerText === 'Eliminar') {
        btn.innerText = '¿Seguro?';
        btn.classList.add('text-orange-500', 'font-black');
        setTimeout(() => {
            if(btn) { btn.innerText = 'Eliminar'; btn.classList.remove('text-orange-500', 'font-black'); }
        }, 3000);
    } else {
        // Eliminar definitivamente
        let products = loadProducts();
        products = products.filter(p => p.id !== id);
        saveProducts(products);
        renderInventoryTable();
    }
};

// Alternar disponibilidad (Simular Agotado visualmente sin borrar stock real)
window.toggleProductStatus = function(id) {
    let products = loadProducts();
    const index = products.findIndex(p => p.id === id);
    if(index > -1) {
        products[index].isAvailable = products[index].isAvailable === false ? true : false;
        saveProducts(products);
        renderInventoryTable();
    }
};

// ==========================================
// 4. LÓGICA DEL FORMULARIO CRUD
// ==========================================
const modal = document.getElementById('crud-modal');
const form = document.getElementById('product-form');

document.getElementById('open-crud-btn').addEventListener('click', () => {
    editingId = null;
    form.reset();
    currentVariants = [];
    document.getElementById('crud-modal-title').innerText = "Añadir Nueva Prenda";
    document.getElementById('offer-controls').classList.add('hidden');
    renderVariantsList();
    
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
});

document.getElementById('close-crud-btn').addEventListener('click', closeModal);
document.getElementById('cancel-crud-btn').addEventListener('click', closeModal);

function closeModal() {
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// Calculadora de Descuento en tiempo real
const priceInput = document.getElementById('prod-price');
const offerToggle = document.getElementById('prod-is-offer');
const discountSlider = document.getElementById('prod-discount');

offerToggle.addEventListener('change', (e) => {
    const controls = document.getElementById('offer-controls');
    if(e.target.checked) {
        controls.classList.remove('hidden');
        calculateOfferPrice();
    } else {
        controls.classList.add('hidden');
    }
});

priceInput.addEventListener('input', calculateOfferPrice);
discountSlider.addEventListener('input', calculateOfferPrice);

function calculateOfferPrice() {
    const base = Number(priceInput.value) || 0;
    const discount = Number(discountSlider.value);
    document.getElementById('discount-display').innerText = `${discount}%`;
    
    const final = base * (1 - (discount / 100));
    document.getElementById('final-price-display').innerText = `$${Math.round(final).toLocaleString('es-CO')}`;
}

// Mapeo Dinámico de Variantes
document.getElementById('add-variant-btn').addEventListener('click', () => {
    const color = document.getElementById('var-color').value.trim();
    const size = document.getElementById('var-size').value.trim().toUpperCase();
    const stock = Number(document.getElementById('var-stock').value);

    if (!color || !size || stock < 0) {
        alert("Completa color, talla y stock válido para agregar la variante.");
        return;
    }

    // Lógica para agrupar por color si ya existe
    let existingColor = currentVariants.find(v => v.color.toLowerCase() === color.toLowerCase());
    
    if (existingColor) {
        // Verificar si la talla ya existe para ese color
        let existingSize = existingColor.sizes.find(s => s.size === size);
        if(existingSize) {
            existingSize.stock = stock; // Actualizamos stock si repite
        } else {
            existingColor.sizes.push({ size, stock });
        }
    } else {
        currentVariants.push({
            color: color,
            colorHex: "#" + Math.floor(Math.random()*16777215).toString(16), // Color hex aleatorio para UI del cliente
            sizes: [{ size, stock }]
        });
    }

    // Limpiar inputs
    document.getElementById('var-size').value = '';
    document.getElementById('var-stock').value = '';
    document.getElementById('var-color').focus();
    
    renderVariantsList();
});

function renderVariantsList() {
    const list = document.getElementById('variants-list');
    const msg = document.getElementById('empty-variants-msg');
    
    if (currentVariants.length === 0) {
        list.innerHTML = '';
        list.appendChild(msg);
        msg.classList.remove('hidden');
        return;
    }
    msg.classList.add('hidden');

    let html = '';
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

window.removeVariantColor = function(idx) {
    currentVariants.splice(idx, 1);
    renderVariantsList();
};

// Guardar o Actualizar Producto
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (currentVariants.length === 0) {
        alert("Debes agregar al menos una variante (Color/Talla/Stock) para listar el producto.");
        return;
    }

    const priceReg = Number(document.getElementById('prod-price').value);
    const isOffer = document.getElementById('prod-is-offer').checked;
    const discount = Number(document.getElementById('prod-discount').value);
    const priceOff = isOffer ? Math.round(priceReg * (1 - (discount / 100))) : priceReg;

    const newProduct = {
        id: editingId ? editingId : "wz-" + Date.now(),
        name: document.getElementById('prod-name').value,
        description: document.getElementById('prod-desc').value,
        category: document.getElementById('prod-category').value,
        imageUrl: document.getElementById('prod-image').value,
        priceRegular: priceReg,
        isOffer: isOffer,
        priceOffer: priceOff,
        isAvailable: true,
        variants: currentVariants
    };

    let products = loadProducts();
    if (editingId) {
        const index = products.findIndex(p => p.id === editingId);
        products[index] = { ...products[index], ...newProduct };
    } else {
        products.push(newProduct);
    }

    saveProducts(products);
    closeModal();
    renderInventoryTable();
});

// Cargar producto para Editar
window.editProduct = function(id) {
    const products = loadProducts();
    const p = products.find(x => x.id === id);
    if(!p) return;

    editingId = p.id;
    document.getElementById('crud-modal-title').innerText = "Editar Prenda";
    
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-desc').value = p.description;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-image').value = p.imageUrl;
    document.getElementById('prod-price').value = p.priceRegular;
    
    document.getElementById('prod-is-offer').checked = p.isOffer;
    if (p.isOffer) {
        document.getElementById('offer-controls').classList.remove('hidden');
        // Calcular porcentaje inverso
        const percent = Math.round((1 - (p.priceOffer / p.priceRegular)) * 100);
        document.getElementById('prod-discount').value = percent;
        calculateOfferPrice();
    } else {
        document.getElementById('offer-controls').classList.add('hidden');
    }

    // Clonar arreglo profundo para no mutar el original antes de guardar
    currentVariants = JSON.parse(JSON.stringify(p.variants || []));
    renderVariantsList();

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

// ==========================================
// INICIALIZACIÓN GENERAL
// ==========================================
function initDashboard() {
    initializeMockSales();
    renderAnalytics('day'); // Cargar por defecto vista del día
    renderInventoryTable();
}

// Arrancar al cargar la vista
document.addEventListener('DOMContentLoaded', checkAuth);