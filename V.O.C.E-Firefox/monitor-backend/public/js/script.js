// ================================================================
// 						LÓGICA DO DASHBOARD V.O.C.E (Versão Final Corrigida)
// ================================================================

// --- ESTADO GLOBAL ---
let state = {
    activeClassId: null,
    activeClassName: '',
    allStudents: [],
    studentsInClass: [],
    currentChartType: 'bar',
    mainChartInstance: null
};

// --- FUNÇÕES DE MODAL ---
function openEditClassModal(classId, currentName) {
	const modal = document.getElementById('editClassModal');
    if(!modal) return;
	document.getElementById('editClassNameInput').value = currentName;
	modal.dataset.classId = classId;
	modal.classList.remove('hidden');
}

function closeModals() {
	const modal = document.getElementById('editClassModal');
    if(modal) modal.classList.add('hidden');
}

// --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
function renderAllStudents() {
    const container = document.getElementById('all-students-list');
    if(!container) return;
    container.innerHTML = '';
    if (state.allStudents.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm p-2">Nenhum aluno cadastrado.</p>`;
        return;
    }
    const studentsInClassIds = state.studentsInClass.map(s => s.id);

    state.allStudents.forEach(student => {
        const studentDiv = document.createElement('div');
        const isAlreadyInClass = state.activeClassId && state.activeClassId !== 'null' && studentsInClassIds.includes(student.id);
        
        studentDiv.className = `flex justify-between items-center p-2 rounded ${isAlreadyInClass ? 'bg-green-100 text-gray-400' : 'bg-gray-50 cursor-grab'}`;
        studentDiv.setAttribute('draggable', !isAlreadyInClass);
        studentDiv.dataset.studentId = student.id;

        studentDiv.innerHTML = `
            <span>${student.full_name}</span>
            <button 
                data-student-id="${student.id}" 
                class="btn-add-student text-green-500 hover:text-green-700 text-xl font-bold ${state.activeClassId && state.activeClassId !== 'null' && !isAlreadyInClass ? '' : 'hidden'}"
            >+</button>
        `;
        container.appendChild(studentDiv);
    });
}

function renderStudentsInClass() {
    const container = document.getElementById('students-in-class-list');
    if(!container) return;
    container.innerHTML = '';
    if (state.studentsInClass.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-sm text-center py-4">Arraste ou clique no '+' de um aluno para adicioná-lo aqui.</p>`;
        return;
    }
    state.studentsInClass.forEach(student => {
        const studentDiv = document.createElement('div');
        studentDiv.className = 'flex justify-between items-center bg-white p-2 rounded shadow-sm border';
        studentDiv.innerHTML = `
            <span>${student.full_name}</span>
            <button data-student-id="${student.id}" class="btn-remove-student text-red-500 hover:text-red-700 text-sm font-semibold">Remover</button>
        `;
        container.appendChild(studentDiv);
    });
}

function updateLogsTable(logs) {
    const tableBody = document.getElementById('logsTableBody');
    const logsCount = document.getElementById('logs-count');
    if (!tableBody || !logsCount) return;
    logsCount.textContent = logs.length;
    tableBody.innerHTML = '';
    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum log encontrado para a seleção atual.</td></tr>';
        return;
    }
    const fragment = document.createDocumentFragment();
    logs.forEach(log => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.student_name || log.aluno_id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><a href="http://${log.url}" target="_blank" class="text-blue-600 hover:underline">${log.url}</a></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.duration}s</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${log.categoria || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
        `;
        fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
}

function updateUserSummaryTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhum dado de atividade para a seleção atual.</td></tr>';
        return;
    }
    const fragment = document.createDocumentFragment();
    users.forEach(user => {
        const row = document.createElement('tr');
        row.className = user.has_alert ? 'bg-red-50' : '';
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm">${user.has_alert ? '⚠️' : '✅'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${user.student_name || `<i>${user.aluno_id}</i>`}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${user.aluno_id}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${(user.total_duration / 60).toFixed(1)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${user.log_count}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${new Date(user.last_activity).toLocaleString('pt-BR')}</td>
        `;
        fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
}

function updateChart(logs) {
	const chartCanvas = document.getElementById('mainChart');
	if (!chartCanvas) return;
	if (state.mainChartInstance) state.mainChartInstance.destroy();
	
	const siteUsage = logs.reduce((acc, log) => {
		acc[log.url] = (acc[log.url] || 0) + log.duration;
		return acc;
	}, {});
	
	const topSites = Object.entries(siteUsage).sort(([, a], [, b]) => b - a).slice(0, 10);
	const chartLabels = topSites.map(site => site[0]);
	const chartData = topSites.map(site => site[1]);
	const backgroundColors = ['rgba(220, 38, 38, 0.7)', 'rgba(153, 27, 27, 0.7)', 'rgba(239, 68, 68, 0.7)', 'rgba(248, 113, 113, 0.7)', 'rgba(252, 165, 165, 0.7)'];
	
	state.mainChartInstance = new Chart(chartCanvas.getContext('2d'), {
		type: state.currentChartType,
		data: {
			labels: chartLabels.length > 0 ? chartLabels : ['Nenhum dado para exibir'],
			datasets: [{ label: 'Tempo de Uso (s)', data: chartData.length > 0 ? chartData : [], backgroundColor: backgroundColors }]
		},
		options: { indexAxis: state.currentChartType === 'bar' ? 'y' : 'x', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: state.currentChartType !== 'bar' } } }
	});
}

// --- FUNÇÕES DE FETCH ---
async function apiCall(url, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Erro ${response.status}` }));
        throw new Error(errorData.error || `Erro ${response.status}`);
    }
    return response.json();
}

async function createClass() {
    const nameInput = document.getElementById('newClassName');
    const name = nameInput.value.trim();
    if (!name) return alert('O nome da turma não pode estar vazio.');
    try {
        const result = await apiCall('/api/classes', 'POST', { name });
        alert(result.message);
        window.location.reload();
    } catch (error) {
        alert('Erro: ' + error.message);
    }
}

async function fetchAllStudents() {
    try {
        state.allStudents = await apiCall('/api/students/all');
    } catch (error) {
        console.error("Falha ao buscar a lista de todos os alunos:", error);
    }
}

async function fetchStudentsInClass(classId) {
    if (!classId || classId === 'null') {
        state.studentsInClass = [];
        return;
    }
    try {
        state.studentsInClass = await apiCall(`/api/classes/${classId}/students`);
    } catch (error) {
        console.error(`Falha ao buscar alunos da turma ${classId}:`, error);
        state.studentsInClass = [];
    }
}

async function fetchDataPanels(classId) {
    const classIdParam = classId || 'null';
    try {
        const [summary, logs] = await Promise.all([
            apiCall(`/api/users/summary?classId=${classIdParam}`),
            apiCall(`/api/logs/filtered?classId=${classIdParam}`)
        ]);
        updateUserSummaryTable(summary);
        updateLogsTable(logs);
        updateChart(logs);
    } catch (error) {
        console.error("Erro ao buscar dados do painel:", error);
        updateUserSummaryTable([]);
        updateLogsTable([]);
        updateChart([]);
    }
}

// --- LÓGICA PRINCIPAL E EVENTOS ---
async function handleClassSelection(selectedId, selectedName) {
    state.activeClassId = selectedId;
    state.activeClassName = selectedName;
    
    const managementPanel = document.getElementById('class-students-panel');
    const editBtn = document.getElementById('editClassBtn');
    const deleteBtn = document.getElementById('deleteClassBtn');

    await fetchDataPanels(state.activeClassId);

    if (state.activeClassId && state.activeClassId !== 'null') {
        document.getElementById('class-name-in-list').textContent = state.activeClassName;
        managementPanel.classList.remove('hidden');
        editBtn.disabled = false;
        deleteBtn.disabled = false;
        await fetchStudentsInClass(state.activeClassId);
        renderStudentsInClass();
    } else {
        managementPanel.classList.add('hidden');
        editBtn.disabled = true;
        deleteBtn.disabled = true;
    }
    renderAllStudents();
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchAllStudents();
    renderAllStudents();
    await handleClassSelection(null, ''); 

    // [CORRIGIDO] Adicionado o listener para criar turma
    document.getElementById('createClassBtn')?.addEventListener('click', createClass);
    
    const classSelect = document.getElementById('classSelect');
    classSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        handleClassSelection(e.target.value, selectedOption.text);
    });

    const allStudentsList = document.getElementById('all-students-list');
    const classStudentsList = document.getElementById('students-in-class-list');

    allStudentsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-add-student')) {
            const studentId = e.target.dataset.studentId;
            try {
                await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', { studentId });
                await fetchStudentsInClass(state.activeClassId);
                renderStudentsInClass();
                renderAllStudents();
            } catch (error) {
                alert(error.message);
            }
        }
    });

    allStudentsList.addEventListener('dragstart', e => {
        const target = e.target.closest('[data-student-id]');
        if (target) {
            e.dataTransfer.setData('text/plain', target.dataset.studentId);
        }
    });

    classStudentsList.addEventListener('dragover', e => e.preventDefault());
    classStudentsList.addEventListener('drop', async e => {
        e.preventDefault();
        const studentId = e.dataTransfer.getData('text/plain');
        if (studentId && state.activeClassId && state.activeClassId !== 'null') {
            try {
                await apiCall(`/api/classes/${state.activeClassId}/add-student`, 'POST', { studentId });
                await fetchStudentsInClass(state.activeClassId);
                renderStudentsInClass();
                renderAllStudents();
            } catch (error) {
                alert(error.message);
            }
        }
    });

    classStudentsList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-remove-student')) {
            const studentId = e.target.dataset.studentId;
            if (confirm('Tem certeza que deseja remover este aluno da turma?')) {
                try {
                    await apiCall(`/api/classes/${state.activeClassId}/remove-student/${studentId}`, 'DELETE');
                    await fetchStudentsInClass(state.activeClassId);
                    renderStudentsInClass();
                    renderAllStudents();
                } catch(error) {
                    alert(error.message);
                }
            }
        }
    });

    document.getElementById('addStudentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const studentData = Object.fromEntries(formData.entries());
        try {
            const result = await apiCall('/api/students', 'POST', studentData);
            state.allStudents.push(result.student);
            renderAllStudents();
            e.target.reset();
            alert('Aluno adicionado com sucesso!');
        } catch(error) {
            alert(error.message);
        }
    });
    
    document.getElementById('toggle-create-class-form').addEventListener('click', () => {
        document.getElementById('create-class-form-container').classList.toggle('hidden');
    });
    document.getElementById('toggle-add-student-form').addEventListener('click', () => {
        document.getElementById('add-student-form-container').classList.toggle('hidden');
    });

    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            state.currentChartType = btn.dataset.type;
            document.querySelectorAll('.chart-btn').forEach(b => {
                b.classList.remove('active', 'bg-red-700', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-700');
            });
            btn.classList.add('active', 'bg-red-700', 'text-white');
            btn.classList.remove('bg-gray-200', 'text-gray-700');
            
            await fetchDataPanels(state.activeClassId); 
        });
    });
});

