const SUPABASE_URL = 'https://htrdrbpdgmznvoqakjvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cmRyYnBkZ216bnZvcWFranZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTA0MDAsImV4cCI6MjA5MzQ2NjQwMH0.Vp5WW1uSOTySY4DtmViz_nmOxQbpKqgDnnaprO-tZkI';

let sb;
if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let activeView = 'dashboard';
let globalInputs = [];
let globalPlots = [];
let globalFarms = [];
let costsChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    
    // Check for password reset flow
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
        showView('auth-screen');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById('reset-password-form').classList.add('active');
    } else if (session) {
        handleUserAuthenticated(session.user);
    } else {
        showView('auth-screen');
    }
    
    setupEventListeners();
    refreshIcons();
});

function setupEventListeners() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('farm-form').addEventListener('submit', handleFarmSubmit);
    document.getElementById('plot-form').addEventListener('submit', handlePlotSubmit);
    document.getElementById('purchase-form').addEventListener('submit', handlePurchaseSubmit);
    document.getElementById('activity-form').addEventListener('submit', handleActivitySubmit);
    document.getElementById('activity-input-id').addEventListener('change', handleInputSelectionChange);
    document.getElementById('activity-qty').addEventListener('input', calculateActivityCost);
    document.getElementById('activity-total-cost').addEventListener('input', calculateActivityCost);
    document.getElementById('plots-selector').addEventListener('change', updateRateioPreview);
    document.getElementById('forgot-password-form').addEventListener('submit', handleForgotPassword);
    document.getElementById('reset-password-form').addEventListener('submit', handleResetPassword);
    document.getElementById('production-form').addEventListener('submit', handleProductionSubmit);
    document.getElementById('sales-form').addEventListener('submit', handleSalesSubmit);
}

// --- Auth ---
async function handleLogin(e) {
    e.preventDefault();
    const { data, error } = await sb.auth.signInWithPassword({
        email: document.getElementById('login-email').value,
        password: document.getElementById('login-password').value
    });
    if (error) return showToast(error.message, 'danger');
    handleUserAuthenticated(data.user);
}

async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const { data, error } = await sb.auth.signUp({
        email, password: document.getElementById('register-password').value,
        options: { data: { full_name: name } }
    });
    if (error) return showToast(error.message, 'danger');
    await sb.from('bd_gest_agr_profiles').insert([{ id: data.user.id, full_name: name, email, approved: false }]);
    showToast('Aguarde aprovação!', 'success');
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
    });
    if (error) return showToast(error.message, 'danger');
    showToast('Link de recuperação enviado!', 'success');
    switchAuthTab('login');
}

async function handleResetPassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) return showToast(error.message, 'danger');
    showToast('Senha atualizada!', 'success');
    switchAuthTab('login');
}

function showForgotPassword() {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById('forgot-password-form').classList.add('active');
}

async function handleUserAuthenticated(user) {
    currentUser = user;
    isAdmin = user.email === 'iagoppin.dev@gmail.com';
    
    let { data: profile, error: fetchError } = await sb.from('bd_gest_agr_profiles').select('*').eq('id', user.id).maybeSingle();
    
    if (isAdmin && !profile) {
        const { data: newProfile, error: insertError } = await sb.from('bd_gest_agr_profiles').insert([
            { id: user.id, full_name: 'Administrador', email: user.email, approved: true }
        ]).select().maybeSingle();
        
        if (insertError) {
            console.error('Erro ao criar perfil admin:', insertError);
            // Fallback profile object if insertion fails (e.g. table prefix issue)
            profile = { full_name: 'Administrador', approved: true };
        } else {
            profile = newProfile;
        }
    }
    
    if (!profile) {
        showView('pending-screen');
        return;
    }
    
    currentProfile = profile;
    document.getElementById('user-greeting').textContent = `Olá, ${currentProfile.full_name ? currentProfile.full_name.split(' ')[0] : 'Admin'}`;
    
    if (isAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
    
    if (currentProfile.approved || isAdmin) {
        showView('main-app');
        loadData();
    } else {
        showView('pending-screen');
    }
}

async function signOut() { await sb.auth.signOut(); location.reload(); }

// --- Navigation ---
function switchAuthTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function switchView(viewName) {
    activeView = viewName;
    const backBtn = document.getElementById('back-btn');
    if (viewName === 'dashboard') backBtn.classList.add('hidden');
    else backBtn.classList.remove('hidden');

    document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const view = document.getElementById(`${viewName}-view`);
    if (view) view.classList.add('active');
    const nav = document.getElementById(`nav-${viewName}`);
    if (nav) nav.classList.add('active');
    
    const titles = { 'dashboard': 'Dashboard', 'setup': 'Cadastros', 'insumos': 'Compras', 'estoque': 'Estoque', 'atividades': 'Lançamentos', 'export': 'Exportar', 'admin': 'Aprovações', 'receitas': 'Receitas' };
    document.getElementById('view-title').textContent = titles[viewName] || 'App';
    
    loadData();
    refreshIcons();
}

// --- Data Loading ---
async function loadData() {
    if (activeView === 'dashboard') loadDashboard();
    if (activeView === 'setup') { loadFarms(); loadPlots(); }

    if (activeView === 'insumos') { loadPurchaseHistory(); loadPurchaseFilters(); }
    if (activeView === 'estoque') loadInventory();
    if (activeView === 'atividades') { loadInputsForActivity(); loadPlotsForActivity(); loadActivityHistory(); }
    if (activeView === 'receitas') { await loadPlots(); loadRevenuePlots(); loadProductionHistory(); loadSalesHistory(); calculateRevenueStats(); }
    if (activeView === 'export') { await loadPlots(); loadExportPreview(); loadExportFilters(); }
    if (activeView === 'admin') loadPendingUsers();
}

async function loadDashboard() {
    let query = sb.from('bd_gest_agr_activities').select('type, total_cost');
    let farmQuery = sb.from('bd_gest_agr_farms').select('*', { count: 'exact', head: true });
    
    if (!isAdmin) {
        query = query.eq('recorded_by', currentUser.id);
        farmQuery = farmQuery.eq('owner_id', currentUser.id);
    }
    
    const { data: activities } = await query;
    const { count: farmCount } = await farmQuery;
    
    let total = 0;
    const stats = {};
    (activities || []).forEach(a => { total += a.total_cost; stats[a.type] = (stats[a.type] || 0) + a.total_cost; });
    document.getElementById('stat-total-costs').textContent = `R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('stat-farms').textContent = farmCount || 0;
    renderChart(stats);
}

function renderChart(stats) {
    const ctx = document.getElementById('costsChart');
    if (!ctx) return;
    const labels = Object.keys(stats);
    const data = Object.values(stats);
    if (costsChart) costsChart.destroy();
    costsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: ['#003366', '#4c7faf', '#89c2d9', '#a3c4f3', '#cfdbd5', '#e8eddf'], borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Outfit' } } } } }
    });
}

// --- Cadastros ---
async function loadFarms() {
    let query = sb.from('bd_gest_agr_farms').select('*').order('name');
    if (!isAdmin) query = query.eq('owner_id', currentUser.id);
    const { data } = await query;
    globalFarms = data || [];
    const select = document.getElementById('plot-farm-id');
    select.innerHTML = '<option value="">Fazenda...</option>' + globalFarms.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    renderFarmsList();
}

function renderFarmsList() {
    const list = document.getElementById('farms-list');
    list.innerHTML = globalFarms.map(f => `
        <div class="list-item">
            <div class="list-item-info">
                <h4>${f.name}</h4>
            </div>
            <div class="list-item-actions">
                <button class="btn-action edit" onclick="editFarm('${f.id}')"><i data-lucide="edit-3"></i></button>
                <button class="btn-action delete" onclick="deleteFarm('${f.id}')"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');
    refreshIcons();
}

async function handleFarmSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('farm-id').value;
    const name = document.getElementById('farm-name').value;
    
    let error;
    if (id) {
        ({ error } = await sb.from('bd_gest_agr_farms').update({ name }).eq('id', id));
    } else {
        ({ error } = await sb.from('bd_gest_agr_farms').insert([{ name, owner_id: currentUser.id }]));
    }
    
    if (error) return showToast(error.message, 'danger');
    showToast('Salvo!', 'success');
    e.target.reset();
    document.getElementById('farm-id').value = '';
    document.getElementById('farm-submit-btn').textContent = 'Adicionar';
    loadFarms();
}

function editFarm(id) {
    const farm = globalFarms.find(f => f.id === id);
    if (!farm) return;
    document.getElementById('farm-id').value = farm.id;
    document.getElementById('farm-name').value = farm.name;
    document.getElementById('farm-submit-btn').textContent = 'Salvar Alteração';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteFarm(id) {
    if (!confirm('Excluir esta fazenda? Todos os talhões vinculados podem ser afetados.')) return;
    const { error } = await sb.from('bd_gest_agr_farms').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluída!', 'success'); loadFarms(); }
}

async function loadPlots() {
    let query = sb.from('bd_gest_agr_plots').select('*, bd_gest_agr_farms!inner(name, owner_id)').order('name');
    if (!isAdmin) query = query.eq('bd_gest_agr_farms.owner_id', currentUser.id);
    const { data } = await query;
    globalPlots = data || [];
    renderPlotsList();
}

function renderPlotsList() {
    const list = document.getElementById('plots-list');
    list.innerHTML = globalPlots.map(p => `
        <div class="list-item">
            <div class="list-item-info">
                <h4>${p.name}</h4>
                <p>${p.bd_gest_agr_farms.name} | ${p.area_ha} ha</p>
            </div>
            <div class="list-item-actions">
                <button class="btn-action edit" onclick="editPlot('${p.id}')"><i data-lucide="edit-3"></i></button>
                <button class="btn-action delete" onclick="deletePlot('${p.id}')"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');
    refreshIcons();
}

async function handlePlotSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('plot-id').value;
    const farm_id = document.getElementById('plot-farm-id').value;
    const name = document.getElementById('plot-name').value;
    const area_ha = parseFloat(document.getElementById('plot-area').value);
    
    let error;
    if (id) {
        ({ error } = await sb.from('bd_gest_agr_plots').update({ farm_id, name, area_ha }).eq('id', id));
    } else {
        ({ error } = await sb.from('bd_gest_agr_plots').insert([{ farm_id, name, area_ha }]));
    }
    
    if (error) return showToast(error.message, 'danger');
    showToast('Salvo!', 'success');
    e.target.reset();
    document.getElementById('plot-id').value = '';
    document.getElementById('plot-submit-btn').textContent = 'Adicionar Talhão';
    loadPlots();
}

function editPlot(id) {
    const plot = globalPlots.find(p => p.id === id);
    if (!plot) return;
    document.getElementById('plot-id').value = plot.id;
    document.getElementById('plot-farm-id').value = plot.farm_id;
    document.getElementById('plot-name').value = plot.name;
    document.getElementById('plot-area').value = plot.area_ha;
    document.getElementById('plot-submit-btn').textContent = 'Salvar Alteração';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePlot(id) {
    if (!confirm('Excluir este talhão?')) return;
    const { error } = await sb.from('bd_gest_agr_plots').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluído!', 'success'); loadPlots(); }
}

// --- Compras ---
async function loadPurchaseFilters() {
    let query = sb.from('bd_gest_agr_inputs').select('name').order('name');
    if (!isAdmin) query = query.eq('owner_id', currentUser.id);
    const { data } = await query;
    const select = document.getElementById('input-categories');
    select.innerHTML = (data || []).map(i => `<option value="${i.name}">`).join('');
}

async function loadPurchaseHistory() {
    const filter = document.getElementById('purchase-history-filter').value;
    let query = sb.from('bd_gest_agr_purchases').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
    if (filter) query = query.eq('input_name', filter);
    const { data } = await query;

    // Update the search select also
    const histFilterSelect = document.getElementById('purchase-history-filter');
    const uniqueItems = [...new Set((data || []).map(p => p.input_name))].sort();
    const currentVal = histFilterSelect.value;
    histFilterSelect.innerHTML = '<option value="">Filtrar por Insumo...</option>' + uniqueItems.map(i => `<option value="${i}">${i}</option>`).join('');
    histFilterSelect.value = currentVal;

    const tbody = document.getElementById('purchase-history-body');
    tbody.innerHTML = (data || []).map(p => `
        <tr>
            <td>${new Date(p.created_at).toLocaleDateString()}</td>
            <td>${p.input_name}</td>
            <td>${p.quantity}</td>
            <td>R$ ${p.total_cost.toFixed(2)}</td>
            <td>
                <button class="btn-ghost" onclick="editPurchase('${p.id}', '${p.input_name}', ${p.quantity}, ${p.total_cost})" style="color: var(--primary-light)">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-ghost" onclick="deletePurchase('${p.id}', '${p.input_id}', ${p.quantity})" style="color: var(--danger)">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>`).join('');
    refreshIcons();
}

async function handlePurchaseSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('purchase-name').value;
    const unit = document.getElementById('purchase-unit').value;
    const qty = parseFloat(document.getElementById('purchase-qty').value);
    const total = parseFloat(document.getElementById('purchase-total').value);
    
    const purchaseId = document.getElementById('purchase-id').value;
    
    // If editing, we first undo the previous stock impact
    if (purchaseId) {
        const { data: oldP } = await sb.from('bd_gest_agr_purchases').select('*').eq('id', purchaseId).single();
        if (oldP) {
            const { data: oldI } = await sb.from('bd_gest_agr_inputs').select('current_stock').eq('id', oldP.input_id).single();
            if (oldI) {
                await sb.from('bd_gest_agr_inputs').update({ current_stock: oldI.current_stock - oldP.quantity }).eq('id', oldP.input_id);
            }
        }
    }

    let query = sb.from('bd_gest_agr_inputs').select('*').eq('name', name);
    if (!isAdmin) query = query.eq('owner_id', currentUser.id);
    let { data: existing, error: fetchError } = await query.maybeSingle();
    let inputId;

    if (existing) {
        inputId = existing.id;
        const newStock = existing.current_stock + qty;
        const newAvgPrice = ((existing.current_stock * existing.average_price) + total) / newStock;
        const { error: updateError } = await sb.from('bd_gest_agr_inputs').update({ current_stock: newStock, average_price: newAvgPrice }).eq('id', existing.id);
        if (updateError) return showToast(updateError.message, 'danger');
    } else {
        const { data: newItem, error: insertError } = await sb.from('bd_gest_agr_inputs').insert([{ name, unit, current_stock: qty, average_price: total / qty, owner_id: currentUser.id }]).select().maybeSingle();
        if (insertError) return showToast(insertError.message, 'danger');
        inputId = newItem.id;
    }
    
    const purchaseData = { input_id: inputId, input_name: name, quantity: qty, total_cost: total, recorded_by: currentUser.id };
    let finalError;
    if (purchaseId) {
        const { error } = await sb.from('bd_gest_agr_purchases').update(purchaseData).eq('id', purchaseId);
        finalError = error;
    } else {
        const { error } = await sb.from('bd_gest_agr_purchases').insert([purchaseData]);
        finalError = error;
    }

    if (finalError) return showToast(finalError.message, 'danger');
    showToast(purchaseId ? 'Atualizado!' : 'Compra registrada!', 'success');
    e.target.reset();
    document.getElementById('purchase-id').value = ''; // Manual clear
    loadPurchaseHistory(); loadInventory();
}

function editPurchase(id, name, qty, total) {
    document.getElementById('purchase-id').value = id;
    document.getElementById('purchase-name').value = name;
    document.getElementById('purchase-qty').value = qty;
    document.getElementById('purchase-total').value = total;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePurchase(id, inputId, qty) {
    if (!confirm('Deseja excluir esta compra? O estoque será ajustado.')) return;
    
    // Adjust stock back
    const { data: input } = await sb.from('bd_gest_agr_inputs').select('current_stock').eq('id', inputId).single();
    if (input) {
        await sb.from('bd_gest_agr_inputs').update({ current_stock: input.current_stock - qty }).eq('id', inputId);
    }
    
    const { error } = await sb.from('bd_gest_agr_purchases').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluído!', 'success'); loadPurchaseHistory(); loadInventory(); }
}

async function loadInventory() {
    let query = sb.from('bd_gest_agr_inputs').select('*').order('name');
    if (!isAdmin) query = query.eq('owner_id', currentUser.id);
    const { data } = await query;
    const list = document.getElementById('inventory-list');
    list.innerHTML = (data || []).map(i => `<div class="list-item"><div class="list-item-info"><h4>${i.name}</h4><p>${i.current_stock.toFixed(2)} ${i.unit}</p></div></div>`).join('');
}

// --- Atividades ---
async function loadActivityFilters() {
    const types = ["Administração", "Adubação via Solo/Folha", "Condução de lavoura", "Controle de pragas e doenças", "Controle de plantas daninhas", "Irrigação", "Colheita", "Pós Colheita e Comercialização", "Arrendamento"];
    const select = document.getElementById('activity-history-filter');
    select.innerHTML = '<option value="">Todas as atividades...</option>' + types.map(t => `<option value="${t}">${t}</option>`).join('');
}

async function loadActivityHistory() {
    const filter = document.getElementById('activity-history-filter').value;
    let query = sb.from('bd_gest_agr_activities').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
    if (filter) query = query.eq('type', filter);
    const { data } = await query;
    const tbody = document.getElementById('activity-history-body');
    tbody.innerHTML = (data || []).map(a => `
        <tr>
            <td>${new Date(a.created_at).toLocaleDateString()}</td>
            <td>${a.type}</td>
            <td>R$ ${a.total_cost.toFixed(2)}</td>
            <td>${a.observations || ''}</td>
            <td>
                <button class="btn-ghost" onclick='editActivity("${a.id}", "${a.type}", ${a.quantity}, ${a.total_cost}, "${a.observations || ''}", ${JSON.stringify(a.plot_ids)})' style="color: var(--primary-light)">
                    <i data-lucide="edit-3"></i>
                </button>
                <button class="btn-ghost" onclick="deleteActivity('${a.id}', '${a.input_id}', ${a.quantity})" style="color: var(--danger)">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>`).join('');
    refreshIcons();
}

async function deleteActivity(id, inputId, qty) {
    if (!confirm('Deseja excluir este lançamento? O estoque (se houver) será devolvido.')) return;
    
    // Return stock
    if (inputId && inputId !== 'null') {
        const { data: input } = await sb.from('bd_gest_agr_inputs').select('current_stock').eq('id', inputId).single();
        if (input) {
            await sb.from('bd_gest_agr_inputs').update({ current_stock: input.current_stock + qty }).eq('id', inputId);
        }
    }
    
    const { error } = await sb.from('bd_gest_agr_activities').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluído!', 'success'); loadActivityHistory(); loadDashboard(); loadInventory(); }
}

async function loadInputsForActivity() {
    let query = sb.from('bd_gest_agr_inputs').select('*');
    if (!isAdmin) query = query.eq('owner_id', currentUser.id);
    const { data } = await query;
    globalInputs = data || [];
    const staticCategories = ["Mão de obra fixa", "Mão de obra contratada", "Manutenção de máquinas e equipamentos", "Serviços gerais", "energia elétrica", "Gasolina", "Diesel"];
    const select = document.getElementById('activity-input-id');
    let options = '<option value="">Selecione...</option><optgroup label="Itens Gerais">';
    staticCategories.forEach(cat => options += `<option value="cat:${cat}">${cat}</option>`);
    options += '</optgroup><optgroup label="Itens em Estoque (Compras)">';
    globalInputs.forEach(i => options += `<option value="${i.id}">${i.name} (${i.current_stock.toFixed(1)} ${i.unit})</option>`);
    options += '</optgroup>';
    select.innerHTML = options;
    
    // Update filters for activity history
    const histFilter = document.getElementById('activity-history-filter');
    const uniqueBoughtNames = [...new Set(globalInputs.map(i => i.name))];
    const allSearchable = [...new Set([...staticCategories, ...uniqueBoughtNames])].sort();
    const currentVal = histFilter.value;
    histFilter.innerHTML = '<option value="">Filtrar por Itens...</option>' + allSearchable.map(i => `<option value="${i}">${i}</option>`).join('');
    histFilter.value = currentVal;
}

async function loadPlotsForActivity() {
    let query = sb.from('bd_gest_agr_plots').select('*, bd_gest_agr_farms!inner(name, owner_id)').order('bd_gest_agr_farms(name)');
    if (!isAdmin) query = query.eq('bd_gest_agr_farms.owner_id', currentUser.id);
    const { data } = await query;
    const container = document.getElementById('plots-selector');
    container.innerHTML = (data || []).map(p => `<label class="checkbox-item"><input type="checkbox" name="plot-selection" value="${p.id}" data-area="${p.area_ha}" data-name="${p.name}">${p.bd_gest_agr_farms.name} - ${p.name}</label>`).join('');
}

function handleInputSelectionChange() {
    const inputId = document.getElementById('activity-input-id').value;
    document.getElementById('activity-qty').value = '';
    document.getElementById('activity-total-cost').value = '';
    updateRateioPreview();
}

function calculateActivityCost(event) {
    const inputVal = document.getElementById('activity-input-id').value;
    const qty = parseFloat(document.getElementById('activity-qty').value) || 0;
    
    if (inputVal && !inputVal.startsWith('cat:')) {
        const input = globalInputs.find(i => i.id === inputVal);
        // STOCK LIMIT CHECK
        if (qty > input.current_stock) {
            showToast(`Estoque insuficiente! Disponível: ${input.current_stock}`, 'danger');
            document.getElementById('activity-qty').value = input.current_stock;
            return;
        }
        if (event.target.id === 'activity-qty') {
            document.getElementById('activity-total-cost').value = (qty * input.average_price).toFixed(2);
        }
    }
    updateRateioPreview();
}

async function handleActivitySubmit(e) {
    e.preventDefault();
    const type = document.getElementById('activity-type').value;
    const inputVal = document.getElementById('activity-input-id').value;
    const qty = parseFloat(document.getElementById('activity-qty').value) || 0;
    const totalCost = parseFloat(document.getElementById('activity-total-cost').value) || 0;
    const obs = document.getElementById('activity-obs').value;
    const selectedPlots = Array.from(document.querySelectorAll('input[name="plot-selection"]:checked'));
    if (selectedPlots.length === 0) return showToast('Selecione os talhões!', 'warning');
    
    const activityId = document.getElementById('activity-id').value;
    
    // If editing, undo stock impact first
    if (activityId) {
        const { data: oldA } = await sb.from('bd_gest_agr_activities').select('*').eq('id', activityId).single();
        if (oldA && oldA.input_id && oldA.input_id !== 'null') {
            const { data: oldI } = await sb.from('bd_gest_agr_inputs').select('current_stock').eq('id', oldA.input_id).single();
            if (oldI) {
                await sb.from('bd_gest_agr_inputs').update({ current_stock: oldI.current_stock + oldA.quantity }).eq('id', oldA.input_id);
            }
        }
    }

    const plotIds = selectedPlots.map(p => p.value);
    const plotNames = selectedPlots.map(p => p.dataset.name);
    const firstPlotId = plotIds[0];
    const plotInfo = globalPlots.find(p => p.id === firstPlotId);
    const farmName = plotInfo ? plotInfo.bd_gest_agr_farms.name : "";
    const farmId = plotInfo ? plotInfo.farm_id : null;

    let inputId = null;
    if (inputVal && !inputVal.startsWith('cat:')) {
        inputId = inputVal;
        const input = globalInputs.find(i => i.id === inputId);
        if (qty > input.current_stock) return showToast('Estoque insuficiente!', 'danger');
        await sb.from('bd_gest_agr_inputs').update({ current_stock: input.current_stock - qty }).eq('id', inputId);
    }

    const activityData = { type, input_id: inputId, farm_id: farmId, farm_name: farmName, plot_ids: plotIds, plot_names: plotNames, quantity: qty, total_cost: totalCost, observations: obs, recorded_by: currentUser.id };
    
    let finalError;
    if (activityId) {
        const { error } = await sb.from('bd_gest_agr_activities').update(activityData).eq('id', activityId);
        finalError = error;
    } else {
        const { error } = await sb.from('bd_gest_agr_activities').insert([activityData]);
        finalError = error;
    }

    if (finalError) return showToast(finalError.message, 'danger');
    
    showToast(activityId ? 'Lançamento atualizado!' : 'Lançamento realizado!', 'success');
    e.target.reset();
    document.getElementById('activity-id').value = ''; // Manual clear
    handleInputSelectionChange(); loadActivityHistory(); loadDashboard(); loadInventory();
}

function editActivity(id, type, qty, total, obs, plotIds) {
    document.getElementById('activity-id').value = id;
    document.getElementById('activity-type').value = type;
    document.getElementById('activity-qty').value = qty;
    document.getElementById('activity-total-cost').value = total;
    document.getElementById('activity-obs').value = obs;
    
    // Re-select plots
    const checkboxes = document.querySelectorAll('input[name="plot-selection"]');
    checkboxes.forEach(cb => {
        cb.checked = plotIds && plotIds.includes(cb.value);
    });
    
    updateRateioPreview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateRateioPreview() {
    const selected = Array.from(document.querySelectorAll('input[name="plot-selection"]:checked'));
    const totalCost = parseFloat(document.getElementById('activity-total-cost').value) || 0;
    const totalQty = parseFloat(document.getElementById('activity-qty').value) || 0;
    const preview = document.getElementById('rateio-preview');
    if (selected.length === 0 || (totalCost === 0 && totalQty === 0)) { preview.classList.add('hidden'); return; }
    preview.classList.remove('hidden');
    const totalArea = selected.reduce((sum, p) => sum + parseFloat(p.dataset.area), 0);
    document.getElementById('rateio-list').innerHTML = selected.map(p => {
        const area = parseFloat(p.dataset.area);
        const percent = area / totalArea;
        return `<div class="rateio-item"><span>${p.dataset.name}</span><span>${(totalQty * percent).toFixed(2)} un | R$ ${(totalCost * percent).toFixed(2)}</span></div>`;
    }).join('');
}



// --- Export ---
async function loadExportFilters() {
    const { data } = await sb.from('bd_gest_agr_plots').select('*').order('name');
    const select = document.getElementById('export-filter-plot');
    select.innerHTML = '<option value="">Todos os Talhões</option>' + (data || []).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}
async function loadExportPreview() {
    const plotId = document.getElementById('export-filter-plot').value;
    let query = sb.from('bd_gest_agr_activities').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
    if (plotId) query = query.contains('plot_ids', [plotId]);
    const { data } = await query.limit(20);
    document.getElementById('export-table-body').innerHTML = (data || []).map(a => `<tr><td>${new Date(a.created_at).toLocaleDateString()}</td><td>${a.type}</td><td>R$ ${a.total_cost.toFixed(2)}</td><td>${a.observations || ''}</td></tr>`).join('');
}
async function exportData(type) {
    if (type === 'excel') {
        const plotId = document.getElementById('export-filter-plot').value;
        let query = sb.from('bd_gest_agr_activities').select('*').order('created_at', { ascending: false });
        if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
        if (plotId) query = query.contains('plot_ids', [plotId]);
        const { data } = await query;
        let csv = 'Data,Atividade,Custo,Obs\n';
        data.forEach(a => csv += `${new Date(a.created_at).toLocaleDateString()},${a.type},${a.total_cost},"${a.observations || ''}"\n`);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'relatorio.csv'; a.click();
    } else { 
        document.body.classList.add('printing');
        window.print(); 
        document.body.classList.remove('printing');
    }
}

// --- Admin ---
async function loadPendingUsers() {
    const { data } = await sb.from('bd_gest_agr_profiles').select('*').eq('approved', false);
    document.getElementById('pending-users-list').innerHTML = (data || []).map(u => `<div class="list-item"><div class="list-item-info"><h4>${u.full_name}</h4><p>${u.email}</p></div><button class="btn-primary" onclick="approveUser('${u.id}')">Aprovar</button></div>`).join('');
}
async function approveUser(id) { await sb.from('bd_gest_agr_profiles').update({ approved: true }).eq('id', id); showToast('Aprovado!', 'success'); loadPendingUsers(); }

// --- Receitas ---
function loadRevenuePlots() {
    const container = document.getElementById('prod-plots-selector');
    container.innerHTML = (globalPlots || []).map(p => `<label class="checkbox-item"><input type="checkbox" name="prod-plot-selection" value="${p.id}" data-area="${p.area_ha}" data-name="${p.name}">${p.bd_gest_agr_farms.name} - ${p.name}</label>`).join('');
}

async function handleProductionSubmit(e) {
    e.preventDefault();
    const month = document.getElementById('prod-month').value;
    const qty = parseFloat(document.getElementById('prod-qty').value);
    const selectedPlots = Array.from(document.querySelectorAll('input[name="prod-plot-selection"]:checked'));
    
    if (selectedPlots.length === 0) return showToast('Selecione os talhões!', 'warning');
    
    const plotIds = selectedPlots.map(p => p.value);
    const plotNames = selectedPlots.map(p => p.dataset.name);
    const totalArea = selectedPlots.reduce((sum, p) => sum + parseFloat(p.dataset.area), 0);
    const yield_kg_ha = qty / totalArea;

    const { error } = await sb.from('bd_gest_agr_production').insert([{
        month_year: month,
        plot_ids: plotIds,
        plot_names: plotNames,
        quantity: qty,
        total_area: totalArea,
        yield_kg_ha: yield_kg_ha,
        recorded_by: currentUser.id
    }]);

    if (error) return showToast(error.message, 'danger');
    showToast('Produção salva!', 'success');
    e.target.reset();
    loadProductionHistory();
}

async function handleSalesSubmit(e) {
    e.preventDefault();
    const qty = parseFloat(document.getElementById('sale-qty').value);
    const price = parseFloat(document.getElementById('sale-price').value);
    const total = qty * price;

    const { error } = await sb.from('bd_gest_agr_sales').insert([{
        quantity: qty,
        price_per_kg: price,
        total_value: total,
        recorded_by: currentUser.id
    }]);

    if (error) return showToast(error.message, 'danger');
    showToast('Venda registrada!', 'success');
    e.target.reset();
    loadSalesHistory();
    calculateRevenueStats();
}

async function loadProductionHistory() {
    let query = sb.from('bd_gest_agr_production').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
    const { data } = await query;
    document.getElementById('production-history-body').innerHTML = (data || []).map(p => `
        <tr>
            <td>${p.month_year}</td>
            <td>${p.plot_names.join(', ')}</td>
            <td>${p.quantity.toFixed(2)} Kg</td>
            <td>${p.yield_kg_ha.toFixed(2)} Kg/Ha</td>
            <td>
                <button class="btn-ghost" onclick="deleteProduction('${p.id}')" style="color: var(--danger)">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>`).join('');
    refreshIcons();
}

async function loadSalesHistory() {
    let query = sb.from('bd_gest_agr_sales').select('*').order('created_at', { ascending: false });
    if (!isAdmin) query = query.eq('recorded_by', currentUser.id);
    const { data } = await query;
    document.getElementById('sales-history-body').innerHTML = (data || []).map(s => `
        <tr>
            <td>${new Date(s.created_at).toLocaleDateString()}</td>
            <td>${s.quantity.toFixed(2)} Kg</td>
            <td>R$ ${s.price_per_kg.toFixed(2)}</td>
            <td>R$ ${s.total_value.toFixed(2)}</td>
            <td>
                <button class="btn-ghost" onclick="deleteSales('${s.id}')" style="color: var(--danger)">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>`).join('');
    refreshIcons();
}

async function calculateRevenueStats() {
    let salesQuery = sb.from('bd_gest_agr_sales').select('total_value, quantity');
    if (!isAdmin) salesQuery = salesQuery.eq('recorded_by', currentUser.id);
    const { data: sales } = await salesQuery;

    let gross = 0;
    let totalQty = 0;
    (sales || []).forEach(s => { gross += s.total_value; totalQty += s.quantity; });

    const totalArea = globalPlots.reduce((sum, p) => sum + p.area_ha, 0);

    document.getElementById('rev-gross').textContent = `R$ ${gross.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('rev-per-ha').textContent = `R$ ${(totalArea > 0 ? gross / totalArea : 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('rev-avg-price').textContent = `R$ ${(totalQty > 0 ? gross / totalQty : 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

async function deleteProduction(id) {
    if (!confirm('Excluir este registro de produção?')) return;
    const { error } = await sb.from('bd_gest_agr_production').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluído!', 'success'); loadProductionHistory(); }
}

async function deleteSales(id) {
    if (!confirm('Excluir este registro de venda?')) return;
    const { error } = await sb.from('bd_gest_agr_sales').delete().eq('id', id);
    if (error) showToast(error.message, 'danger');
    else { showToast('Excluído!', 'success'); loadSalesHistory(); calculateRevenueStats(); }
}

function showToast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'danger' ? 'var(--danger)' : 'var(--primary)';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
function refreshIcons() { if (window.lucide) lucide.createIcons(); }
