// ================================================================
//                            IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const mysql = require('mysql2/promise');
const classifier = require('./python_classifier.js');

const app = express();
const port = process.env.PORT || 8080;

// ================================================================
//                            CONFIGURAÇÃO DO EXPRESS
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'segredo-muito-forte-aqui',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Em produção, use 'true' com HTTPS
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ================================================================
//                            BANCO DE DADOS (MARIADB)
// ================================================================
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ================================================================
//                            MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================
const requireLogin = (req, res, next) => {
    if (req.session && req.session.professorId) {
        return next();
    } else {
        res.redirect('/login');
    }
};

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ================================================================
//                            ROTAS PÚBLICAS
// ================================================================

app.get('/', (req, res) => {
    res.render('landpage', { 
        pageTitle: 'V.O.C.E - Monitorização Inteligente',
        isLoggedIn: !!req.session.professorId 
    });
});
app.get('/login', (req, res) => res.render('login', { error: null, message: req.query.message || null, pageTitle: 'Login - V.O.C.E' }));
app.get('/cadastro', (req, res) => res.render('cadastro', { error: null, pageTitle: 'Cadastro - V.O.C.E' }));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) return res.render('login', { error: 'Todos os campos são obrigatórios.', message: null, pageTitle: 'Login - V.O.C.E' });
        const [rows] = await dbPool.query("SELECT * FROM professors WHERE username = ?", [username]);
        if (rows.length === 0) return res.render('login', { error: 'Nome de utilizador ou senha inválidos.', message: null, pageTitle: 'Login - V.O.C.E' });
        const professor = rows[0];
        const isMatch = await bcrypt.compare(password, professor.password_hash);
        if (isMatch) {
            req.session.professorId = professor.id;
            req.session.professorName = professor.full_name;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'Nome de utilizador ou senha inválidos.', message: null, pageTitle: 'Login - V.O.C.E' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).render('login', { error: 'Erro no servidor.', message: null, pageTitle: 'Login - V.O.C.E' });
    }
});

app.post('/cadastro', async (req, res) => {
    const { fullName, username, password } = req.body;
    try {
        if (!fullName || !username || !password) {
            return res.render('cadastro', { error: 'Todos os campos são obrigatórios.', pageTitle: 'Cadastro - V.O.C.E' });
        }

        // Validação do Nome de Utilizador
        const usernameRegex = /^[a-z0-9._]+$/;
        if (!usernameRegex.test(username)) {
            return res.render('cadastro', { error: 'Nome de utilizador deve conter apenas letras minúsculas, números, pontos (.) ou underscores (_) e não pode ter espaços.', pageTitle: 'Cadastro - V.O.C.E' });
        }

        // Validação da Senha
        const passwordErrors = [];
        if (password.length < 6) {
            passwordErrors.push("A senha deve ter no mínimo 6 caracteres.");
        }
        if (!/[A-Z]/.test(password)) {
            passwordErrors.push("A senha deve conter pelo menos uma letra maiúscula.");
        }
        if (!/[a-z]/.test(password)) {
            passwordErrors.push("A senha deve conter pelo menos uma letra minúscula.");
        }
        if (!/[0-9]/.test(password)) {
            passwordErrors.push("A senha deve conter pelo menos um número.");
        }
        
        if (passwordErrors.length > 0) {
            return res.render('cadastro', { error: passwordErrors.join(' '), pageTitle: 'Cadastro - V.O.C.E' });
        }

        const [existingUser] = await dbPool.query("SELECT id FROM professors WHERE username = ?", [username]);
        if (existingUser.length > 0) {
            return res.render('cadastro', { error: 'Este nome de utilizador já está em uso.', pageTitle: 'Cadastro - V.O.C.E' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await dbPool.query("INSERT INTO professors (username, password_hash, full_name) VALUES (?, ?, ?)", [username, hashedPassword, fullName]);
        res.redirect('/login?message=Cadastro realizado com sucesso! Pode fazer o login.');

    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.render('cadastro', { error: 'Erro ao criar conta.', pageTitle: 'Cadastro - V.O.C.E' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

// ================================================================
//                            ROTAS PROTEGIDAS
// ================================================================

app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const { professorId, professorName } = req.session;
        const [classes] = await dbPool.query("SELECT id, name FROM classes WHERE professor_id = ? ORDER BY name ASC", [professorId]);
        
        const categoryQuery = `
            SELECT DISTINCT l.categoria 
            FROM logs l
            INNER JOIN students s ON l.aluno_id = s.cpf OR l.aluno_id = s.pc_id
            INNER JOIN class_students cs ON s.id = cs.student_id
            INNER JOIN classes c ON cs.class_id = c.id
            WHERE c.professor_id = ? AND l.categoria IS NOT NULL AND l.categoria <> ''
            ORDER BY l.categoria ASC
        `;
        const [categories] = await dbPool.query(categoryQuery, [professorId]);

        res.render('dashboard', { 
            pageTitle: 'Dashboard', 
            professorName, 
            classes, 
            categories: categories.map(c => c.categoria) 
        });
    } catch (error) {
        console.error("Erro ao carregar o dashboard:", error);
        res.status(500).send("Erro ao carregar o dashboard.");
    }
});

app.get('/perfil', requireLogin, async (req, res) => {
    try {
        const { professorId } = req.session;
        const [rows] = await dbPool.query("SELECT full_name, username FROM professors WHERE id = ?", [professorId]);
        if(rows.length === 0) return res.redirect('/logout');
        res.render('perfil', {
            pageTitle: 'Meu Perfil',
            user: rows[0],
            success: req.query.success
        });
    } catch (error) {
        console.error("Erro ao carregar perfil:", error);
        res.status(500).send("Erro ao carregar perfil.");
    }
});

app.post('/perfil', requireLogin, async (req, res) => {
    const { fullName } = req.body;
    const { professorId } = req.session;
    if (!fullName) return res.redirect('/perfil');
    try {
        await dbPool.query("UPDATE professors SET full_name = ? WHERE id = ?", [fullName, professorId]);
        req.session.professorName = fullName;
        res.redirect('/perfil?success=true');
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).send("Erro ao atualizar perfil.");
    }
});


// --- APIs DE GESTÃO ---
app.post('/api/classes', requireLogin, async (req, res) => {
    const { name } = req.body;
    const { professorId } = req.session;
    if (!name) return res.status(400).json({ error: 'Nome da turma é obrigatório' });
    try {
        const [result] = await dbPool.query("INSERT INTO classes (name, professor_id) VALUES (?, ?)", [name, professorId]);
        res.json({ success: true, message: 'Turma criada com sucesso!', classId: result.insertId });
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        res.status(500).json({ error: 'Erro ao criar turma' });
    }
});

app.put('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { name } = req.body;
    const { professorId } = req.session;
    if (!name) return res.status(400).json({ error: 'O novo nome da turma é obrigatório.' });
    try {
        const [result] = await dbPool.query("UPDATE classes SET name = ? WHERE id = ? AND professor_id = ?", [name, classId, professorId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Turma não encontrada ou sem permissão.' });
        res.json({ success: true, message: 'Nome da turma atualizado!' });
    } catch (error) {
        console.error('Erro ao atualizar turma:', error);
        res.status(500).json({ error: 'Erro ao atualizar a turma.' });
    }
});

app.delete('/api/classes/:classId', requireLogin, async (req, res) => {
    const { classId } = req.params;
    const { professorId } = req.session;
    try {
        const [result] = await dbPool.query("DELETE FROM classes WHERE id = ? AND professor_id = ?", [classId, professorId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Turma não encontrada ou sem permissão.' });
        res.json({ success: true, message: 'Turma removida com sucesso!' });
    } catch (error) {
        console.error('Erro ao remover turma:', error);
        res.status(500).json({ error: 'Erro ao remover a turma.' });
    }
});

app.post('/api/students', requireLogin, async (req, res) => {
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'Nome do aluno é obrigatório' });
    try {
        const [result] = await dbPool.query("INSERT INTO students (full_name, cpf, pc_id) VALUES (?, ?, ?)", [fullName, cpf || null, pc_id || null]);
        res.json({ success: true, message: 'Aluno criado com sucesso!', student: { id: result.insertId, full_name: fullName, cpf, pc_id } });
    } catch (error) {
        console.error('Erro ao criar aluno:', error);
        res.status(500).json({ error: 'Erro ao criar aluno' });
    }
});

app.put('/api/students/:studentId', requireLogin, async (req, res) => {
    const { studentId } = req.params;
    const { fullName, cpf, pc_id } = req.body;
    if (!fullName) return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    try {
        const [result] = await dbPool.query(
            "UPDATE students SET full_name = ?, cpf = ?, pc_id = ? WHERE id = ?",
            [fullName, cpf || null, pc_id || null, studentId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Aluno não encontrado.' });
        res.json({ success: true, message: 'Dados do aluno atualizados!' });
    } catch (error) {
        console.error('Erro ao atualizar aluno:', error);
        res.status(500).json({ error: 'Erro ao atualizar o aluno.' });
    }
});

app.get('/api/students/all', requireLogin, async (req, res) => {
    try {
        const [students] = await dbPool.query("SELECT id, full_name, cpf, pc_id FROM students ORDER BY full_name ASC");
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar todos os alunos:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos' });
    }
});

app.get('/api/classes/:classId/students', requireLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const [students] = await dbPool.query(
            `SELECT s.id, s.full_name, s.cpf, s.pc_id FROM students s JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?`,
            [classId]
        );
        res.json(students);
    } catch (error) {
        console.error('Erro ao buscar alunos da turma:', error);
        res.status(500).json({ error: 'Erro ao buscar alunos da turma' });
    }
});

app.post('/api/classes/:classId/add-student', requireLogin, async (req, res) => {
    try {
        await dbPool.query("INSERT INTO class_students (class_id, student_id) VALUES (?, ?)", [req.params.classId, req.body.studentId]);
        res.json({ success: true, message: 'Aluno adicionado à turma!' });
    } catch (error) {
        console.error('Erro ao adicionar aluno à turma:', error);
        res.status(500).json({ error: 'Erro ao associar aluno.' });
    }
});

app.delete('/api/classes/:classId/remove-student/:studentId', requireLogin, async (req, res) => {
    try {
        await dbPool.query("DELETE FROM class_students WHERE class_id = ? AND student_id = ?", [req.params.classId, req.params.studentId]);
        res.json({ success: true, message: 'Aluno removido da turma!' });
    } catch (error) {
        console.error('Erro ao remover aluno da turma:', error);
        res.status(500).json({ error: 'Erro ao remover aluno.' });
    }
});

// --- APIs DE DADOS (LOGS, ALERTAS, ETC.) ---
const buildDataQuery = (baseSelect, req) => {
    const { classId, search, category, showAlertsOnly } = req.query;
    const params = [];
    
    let sql = `${baseSelect} LEFT JOIN students s ON l.aluno_id = s.cpf OR l.aluno_id = s.pc_id`;
    let conditions = [];

    if (classId && classId !== 'null') {
        conditions.push(`s.id IN (SELECT student_id FROM class_students WHERE class_id = ?)`);
        params.push(classId);
    }

    if (search) {
        conditions.push(`(s.full_name LIKE ? OR s.cpf LIKE ? OR s.pc_id LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
        conditions.push(`l.categoria = ?`);
        params.push(category);
    }

    if (showAlertsOnly === 'true') {
        conditions.push(`l.categoria IN ('Rede Social', 'Jogos', 'Streaming', 'Animes e Manga', 'IA')`);
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    return { sql, params };
}

app.get('/api/logs/filtered', requireLogin, async (req, res) => {
    try {
        const baseSelect = `SELECT l.id, l.aluno_id, l.url, l.duration, l.timestamp, l.categoria, s.full_name as student_name FROM logs l`;
        let { sql, params } = buildDataQuery(baseSelect, req);
        sql += ` ORDER BY l.timestamp DESC`;
        const [results] = await dbPool.query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('ERRO na rota /api/logs/filtered:', err);
        res.status(500).json({ error: 'Erro ao consultar os logs.' });
    }
});

app.get('/api/users/summary', requireLogin, async (req, res) => {
    try {
        const baseSelect = `SELECT s.full_name as student_name, l.aluno_id, SUM(l.duration) as total_duration, COUNT(l.id) as log_count, MAX(l.timestamp) as last_activity, 
            MAX(CASE WHEN l.categoria IN ('Rede Social', 'Jogos', 'Streaming', 'Animes e Manga') THEN 1 ELSE 0 END) as has_red_alert,
            MAX(CASE WHEN l.categoria = 'IA' THEN 1 ELSE 0 END) as has_blue_alert 
            FROM logs l`;
        let { sql, params } = buildDataQuery(baseSelect, req);
        sql += ` GROUP BY l.aluno_id, s.full_name ORDER BY last_activity DESC`;
        const [results] = await dbPool.query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('ERRO na rota /api/users/summary:', err);
        res.status(500).json({ error: 'Erro ao buscar resumo.' });
    }
});

app.get('/api/alerts/:alunoId/:type', requireLogin, async (req, res) => {
    try {
        const { alunoId, type } = req.params;
        let categories;
        if (type === 'red') {
            categories = ['Rede Social', 'Jogos', 'Streaming', 'Animes e Manga'];
        } else if (type === 'blue') {
            categories = ['IA'];
        } else {
            return res.status(400).json({ error: 'Tipo de alerta inválido.' });
        }
        const [logs] = await dbPool.query(
            `SELECT l.url, l.duration, l.timestamp, l.categoria 
             FROM logs l 
             WHERE l.aluno_id = ? AND l.categoria IN (?) 
             ORDER BY l.timestamp DESC`,
            [alunoId, categories]
        );
        res.json(logs);
    } catch (err) {
        console.error('ERRO na rota /api/alerts/:alunoId:', err);
        res.status(500).json({ error: 'Erro ao buscar logs de alerta.' });
    }
});

app.get('/api/alerts', requireLogin, async (req, res) => {
    try {
        const baseSelect = `SELECT l.id, l.aluno_id, l.url, l.timestamp, l.categoria, s.full_name as student_name FROM logs l`;
        let { sql, params } = buildDataQuery(baseSelect, req);
        const whereClause = sql.includes('WHERE') ? 'AND' : 'WHERE';
        sql += ` ${whereClause} l.categoria IN ('Rede Social', 'Jogos', 'Streaming', 'Animes e Manga', 'IA') ORDER BY l.timestamp DESC LIMIT 100`;
        const [results] = await dbPool.query(sql, params);
        res.json(results);
    } catch (err) {
        console.error('ERRO na rota /api/alerts:', err);
        res.status(500).json({ error: 'Erro ao buscar alertas.' });
    }
});


// Rota de fallback para erro 404
app.use((req, res) => res.status(404).send('Página não encontrada'));

// INICIALIZAÇÃO DO SERVIDOR
app.listen(port, () => console.log(`Servidor rodando em http://localhost:${port}`));

