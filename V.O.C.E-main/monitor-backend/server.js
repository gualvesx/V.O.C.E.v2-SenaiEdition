// ================================================================
//                  IMPORTS E CONFIGURAÇÃO INICIAL
// ================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const mysql = require('mysql2/promise');

const classifier = require('./python_classifier.js'); 

const app = express();
const port = 3000;

// <-- MUDANÇA AQUI: Adicionamos a variável para a URL do Power BI no topo
const POWER_BI_PUSH_URL = 'https://api.powerbi.com/beta/b1051c4b-3b94-41ab-9441-e73a72342fdd/datasets/020fa4f0-cb12-42c3-8727-d4fb58018dc5/rows?experience=power-bi&key=Z3Y1AB0B0wAAfd7W0ywCAMH38nnjQiRtfh4bqE%2Fz7m%2BfAoguSu1g3BPI0iLGcTf7%2FInapK9eeHxJ3O4dP3qg3A%3D%3D';

// ================================================================
//                  CONFIGURAÇÃO DO EXPRESS (EJS)
// ================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// ================================================================
//                  BANCO DE DADOS (MARIADB)
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

async function checkDatabaseConnection() { /* ... (código existente) ... */ }
checkDatabaseConnection();

// ================================================================
//                  ROTAS DA API
// ================================================================

app.post('/api/data', async (req, res) => {
    const dataFromExtension = req.body;
    try {
        const classificationPromises = dataFromExtension.map(log => classifier.categorizar(log.url));
        const categories = await Promise.all(classificationPromises);
        
        const enrichedData = dataFromExtension.map((log, index) => ({ ...log, categoria: categories[index] }));
        
        // --- Salva no Banco de Dados MariaDB (Lógica existente) ---
        const sql = "INSERT INTO logs (aluno_id, url, duration, timestamp, categoria) VALUES ?";
        const values = enrichedData.map(log => [log.aluno_id, log.url, log.durationSeconds, log.timestamp, log.categoria]);
        await dbPool.query(sql, [values]);
        console.log(`${enrichedData.length} logs salvos no banco de dados.`);

        // --- MUDANÇA AQUI: Envia os mesmos dados para o Power BI ---
        try {
            if (!POWER_BI_PUSH_URL.startsWith('http')) {
                console.warn("URL do Power BI não configurada. Pulando envio.");
            } else {
                const responseBI = await fetch(POWER_BI_PUSH_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(enrichedData)
                });
                if (responseBI.ok) {
                    console.log('Dados também enviados para o Power BI com sucesso!');
                } else {
                    console.error('Falha ao enviar dados para o Power BI:', responseBI.status, await responseBI.text());
                }
            }
        } catch (powerBiError) {
            console.error("Erro na comunicação com a API do Power BI:", powerBiError);
        }
        // -----------------------------------------------------------

        res.status(200).send({ message: 'Dados recebidos e salvos.' });

    } catch (error) {
        console.error('Erro em /api/data:', error);
        res.status(500).send({ message: 'Erro interno no servidor.' });
    }
});

// ================================================================
//                  ROTAS DAS PÁGINAS WEB (EJS)
// ================================================================
// ... (código das rotas do dashboard existente) ...
app.get('/dashboard', async (req, res) => { /* ... */ });
app.get('/', (req, res) => { /* ... */ });


// ================================================================
//                  INICIALIZAÇÃO DO SERVIDOR
// ================================================================
app.listen(port, () => {
  console.log(`Servidor rodando! Acesse o dashboard em http://localhost:${port}/dashboard`);
});