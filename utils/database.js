const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

/**
 * Database Manager - Versão Multi-Servidor
 * Cada servidor (guild) tem seu próprio arquivo .db
 * Isso garante isolamento total de dados entre servidores
 */
class DatabaseManager {
 constructor() {
 this.databases = new Map(); // Map<guildId, db>
 this.defaultDb = null; // Para dados globais (como blacklist global)
 this.initialized = false;
 }

 async initialize() {
 try {
 const dataDir = path.join(__dirname, '..', 'data');
 if (!fs.existsSync(dataDir)) {
 fs.mkdirSync(dataDir, { recursive: true });
 }

 // Banco padrão para configurações globais (blacklist, etc)
 const defaultDbPath = path.join(dataDir, 'global.db');
 this.defaultDb = new sqlite3.Database(defaultDbPath);
 this.setupPromisify(this.defaultDb);
 await this.createTables(this.defaultDb, true);

 this.initialized = true;
 console.log('[Database] Sistema multi-servidor inicializado');
 console.log('[Database] Cada servidor terá seu próprio arquivo .db');

 // Cleanup diário
 setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);

 } catch (error) {
 console.error('[Database] Failed to initialize:', error);
 throw error;
 }
 }

 setupPromisify(db) {
 db.runAsync = promisify(db.run.bind(db));
 db.getAsync = promisify(db.get.bind(db));
 db.allAsync = promisify(db.all.bind(db));
 }

 // 🆕 NOVO: Obter ou criar banco de dados específico do servidor
 async getGuildDb(guildId) {
 if (!guildId) return this.defaultDb;

 if (this.databases.has(guildId)) {
 return this.databases.get(guildId);
 }

 const dataDir = path.join(__dirname, '..', 'data', 'guilds');
 if (!fs.existsSync(dataDir)) {
 fs.mkdirSync(dataDir, { recursive: true });
 }

 const dbPath = path.join(dataDir, `${guildId}.db`);
 const db = new sqlite3.Database(dbPath);
 this.setupPromisify(db);

 await this.createTables(db, false);
 this.databases.set(guildId, db);

 console.log(`[Database] Banco de dados criado/carregado para guild: ${guildId}`);
 return db;
 }

 async createTables(db, isGlobal = false) {
 // Tabela de usuários (agora por servidor)
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS users (
 user_id TEXT PRIMARY KEY,
 saldo INTEGER DEFAULT 0,
 total_recebido INTEGER DEFAULT 0,
 total_sacado INTEGER DEFAULT 0,
 emprestimos_pendentes INTEGER DEFAULT 0,
 total_emprestimos INTEGER DEFAULT 0,
 level INTEGER DEFAULT 1,
 xp INTEGER DEFAULT 0,
 total_xp INTEGER DEFAULT 0,
 insignias TEXT DEFAULT '[]',
 eventos_participados INTEGER DEFAULT 0,
 ultimo_login INTEGER,
 streak_diaria INTEGER DEFAULT 0,
 ultimo_checkin INTEGER DEFAULT 0,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
 updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de transações
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS transactions (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL,
 user_id TEXT NOT NULL,
 amount INTEGER NOT NULL,
 reason TEXT,
 event_id TEXT,
 approved_by TEXT,
 approved_at INTEGER,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de eventos
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS events (
 event_id TEXT PRIMARY KEY,
 creator_id TEXT NOT NULL,
 nome TEXT NOT NULL,
 descricao TEXT,
 tipo TEXT,
 status TEXT DEFAULT 'aguardando',
 valor_total INTEGER,
 taxa_guilda INTEGER,
 participantes TEXT DEFAULT '[]',
 started_at INTEGER,
 ended_at INTEGER,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de configuração do servidor
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS guild_config (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 idioma TEXT DEFAULT 'PT-BR',
 taxa_guilda INTEGER DEFAULT 10,
 guilda_nome TEXT,
 guilda_server TEXT,
 guilda_registrada_em INTEGER,
 xp_ativo INTEGER DEFAULT 0,
 taxas_bau TEXT DEFAULT '{"royal": 10, "black": 15, "brecilien": 12, "avalon": 20}',
 taxa_emprestimo INTEGER DEFAULT 5,
 updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Inserir config padrão se não existir
 await db.runAsync(`
 INSERT OR IGNORE INTO guild_config (id) VALUES (1)
 `);

 // Tabela de logs de auditoria
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 action_type TEXT NOT NULL,
 user_id TEXT NOT NULL,
 target_id TEXT,
 details TEXT,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de templates de eventos
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS event_templates (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 creator_id TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT,
 requirements TEXT,
 default_duration INTEGER,
 recurrence_rule TEXT,
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de votações
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS votes (
 vote_id TEXT PRIMARY KEY,
 creator_id TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT,
 options TEXT NOT NULL,
 votes TEXT DEFAULT '{}',
 ends_at INTEGER NOT NULL,
 status TEXT DEFAULT 'active',
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 // Tabela de checkins diários
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS daily_checkins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 date TEXT NOT NULL,
 reward_xp INTEGER,
 reward_saldo INTEGER,
 streak INTEGER,
 UNIQUE(user_id, date)
 )
 `);

 // Tabela de histórico de eventos
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS event_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL,
 simulation_id TEXT,
 arquivado_por TEXT NOT NULL,
 timestamp INTEGER NOT NULL,
 dados TEXT DEFAULT '{}'
 )
 `);

 // Criar índices
 await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`);
 await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at)`);
 await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)`);

 // 🆕 Tabelas GLOBAIS (apenas no banco global)
 if (isGlobal) {
 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS blacklist (
 user_id TEXT PRIMARY KEY,
 nick TEXT,
 guilda TEXT,
 motivo TEXT,
 added_by TEXT,
 guild_id TEXT, -- Qual servidor adicionou (opcional, para referência)
 created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);

 await db.runAsync(`
 CREATE TABLE IF NOT EXISTS guild_registry (
 guild_id TEXT PRIMARY KEY,
 guild_name TEXT,
 owner_id TEXT,
 added_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
 last_activity INTEGER DEFAULT (strftime('%s', 'now') * 1000)
 )
 `);
 }
 }

 // ==================== GUILD MANAGEMENT ====================

 async registerGuild(guildId, guildName, ownerId) {
 await this.defaultDb.runAsync(`
 INSERT OR REPLACE INTO guild_registry (guild_id, guild_name, owner_id, last_activity)
 VALUES (?, ?, ?, ?)
 `, [guildId, guildName, ownerId, Date.now()]);

 // Criar banco do servidor se não existir
 await this.getGuildDb(guildId);
 }

 async getGuildList() {
 const rows = await this.defaultDb.allAsync(`SELECT * FROM guild_registry`);
 return rows;
 }

 // ==================== GUILD CONFIG ====================

 async getGuildConfig(guildId) {
 const db = await this.getGuildDb(guildId);

 try {
 const row = await db.getAsync('SELECT * FROM guild_config WHERE id = 1');

 if (!row) {
 await db.runAsync(`INSERT INTO guild_config (id) VALUES (1)`);
 return this.getGuildConfig(guildId);
 }

 return {
 idioma: row.idioma || 'PT-BR',
 taxaGuilda: row.taxa_guilda || 10,
 guildaRegistrada: row.guilda_nome ? {
 nome: row.guilda_nome,
 server: row.guilda_server,
 dataRegistro: row.guilda_registrada_em
 } : null,
 xpAtivo: Boolean(row.xp_ativo),
 taxasBau: JSON.parse(row.taxas_bau || '{"royal": 10, "black": 15, "brecilien": 12, "avalon": 20}'),
 taxaEmprestimo: row.taxa_emprestimo || 5
 };
 } catch (error) {
 console.error(`[Database] Error getting guild config for ${guildId}:`, error);
 return {
 idioma: 'PT-BR',
 taxaGuilda: 10,
 guildaRegistrada: null,
 xpAtivo: false,
 taxasBau: { royal: 10, black: 15, brecilien: 12, avalon: 20 },
 taxaEmprestimo: 5
 };
 }
 }

 async updateGuildConfig(guildId, data) {
 const db = await this.getGuildDb(guildId);

 try {
 const fields = [];
 const values = [];

 if (data.guildaRegistrada !== undefined) {
 if (data.guildaRegistrada === null) {
 fields.push('guilda_nome = NULL');
 fields.push('guilda_server = NULL');
 fields.push('guilda_registrada_em = NULL');
 } else {
 fields.push('guilda_nome = ?');
 fields.push('guilda_server = ?');
 fields.push('guilda_registrada_em = ?');
 values.push(data.guildaRegistrada.nome);
 values.push(data.guildaRegistrada.server);
 values.push(data.guildaRegistrada.dataRegistro || Date.now());
 }
 }

 const fieldMap = {
 idioma: 'idioma',
 taxaGuilda: 'taxa_guilda',
 xpAtivo: 'xp_ativo',
 taxasBau: 'taxas_bau',
 taxaEmprestimo: 'taxa_emprestimo'
 };

 for (const [key, value] of Object.entries(data)) {
 if (key === 'guildaRegistrada') continue;
 const dbField = fieldMap[key];
 if (!dbField) continue;

 fields.push(`${dbField} = ?`);
 if (key === 'taxasBau') {
 values.push(JSON.stringify(value));
 } else if (key === 'xpAtivo') {
 values.push(value ? 1 : 0);
 } else {
 values.push(value);
 }
 }

 fields.push('updated_at = ?');
 values.push(Date.now());

 const sql = `UPDATE guild_config SET ${fields.join(', ')} WHERE id = 1`;
 await db.runAsync(sql, values);

 console.log(`[Database] Guild config updated for ${guildId}`);
 } catch (error) {
 console.error(`[Database] Error updating guild config for ${guildId}:`, error);
 throw error;
 }
 }

 // ==================== USERS (POR SERVIDOR) ====================

 async getUser(guildId, userId) {
 const db = await this.getGuildDb(guildId);

 const row = await db.getAsync('SELECT * FROM users WHERE user_id = ?', [userId]);

 if (!row) {
 await db.runAsync(
 'INSERT INTO users (user_id, ultimo_login) VALUES (?, ?)',
 [userId, Date.now()]
 );
 return this.getUser(guildId, userId);
 }

 return this.parseUser(row);
 }

 async updateUser(guildId, userId, data) {
 const db = await this.getGuildDb(guildId);

 const fields = [];
 const values = [];

 Object.entries(data).forEach(([key, value]) => {
 if (key === 'user_id') return;
 fields.push(`${key} = ?`);
 values.push(value);
 });

 values.push(Date.now(), userId);

 const sql = `UPDATE users SET ${fields.join(', ')}, updated_at = ? WHERE user_id = ?`;
 await db.runAsync(sql, values);
 }

 parseUser(row) {
 if (!row) return null;
 return {
 userId: row.user_id,
 saldo: row.saldo,
 totalRecebido: row.total_recebido,
 totalSacado: row.total_sacado,
 emprestimosPendentes: row.emprestimos_pendentes,
 totalEmprestimos: row.total_emprestimos,
 level: row.level,
 xp: row.xp,
 totalXp: row.total_xp,
 insignias: JSON.parse(row.insignias || '[]'),
 eventosParticipados: row.eventos_participados,
 streakDiaria: row.streak_diaria,
 ultimoCheckin: row.ultimo_checkin
 };
 }

 // ==================== TRANSACTIONS (POR SERVIDOR) ====================

 async addTransaction(guildId, transaction) {
 const db = await this.getGuildDb(guildId);

 const id = transaction.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

 await db.runAsync(`
 INSERT INTO transactions
 (id, type, user_id, amount, reason, event_id, approved_by, approved_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
 `, [
 id,
 transaction.type,
 transaction.userId,
 transaction.amount,
 transaction.reason || '',
 transaction.eventId || '',
 transaction.approvedBy || null,
 transaction.approvedAt || null
 ]);
 }

 async getUserTransactions(guildId, userId, limit = 50) {
 const db = await this.getGuildDb(guildId);

 return await db.allAsync(`
 SELECT * FROM transactions
 WHERE user_id = ?
 ORDER BY created_at DESC
 LIMIT ?
 `, [userId, limit]);
 }

 async getGuildBalance(guildId) {
 const db = await this.getGuildDb(guildId);

 const result = await db.getAsync(`
 SELECT SUM(amount) as total
 FROM transactions
 WHERE reason = 'taxa_guilda'
 `);
 return result?.total || 0;
 }

 // ==================== SALDO (POR SERVIDOR) ====================

 async getSaldo(guildId, userId) {
 const user = await this.getUser(guildId, userId);
 return user?.saldo || 0;
 }

 async addSaldo(guildId, userId, amount, reason = 'deposit') {
 const db = await this.getGuildDb(guildId);

 const user = await this.getUser(guildId, userId);
 const newSaldo = (user?.saldo || 0) + amount;

 await this.updateUser(guildId, userId, {
 saldo: newSaldo,
 total_recebido: (user?.totalRecebido || 0) + amount
 });

 await this.addTransaction(guildId, {
 type: 'credito',
 userId: userId,
 amount: amount,
 reason: reason
 });

 return true;
 }

 async removeSaldo(guildId, userId, amount, reason = 'withdraw') {
 const user = await this.getUser(guildId, userId);
 const current = user?.saldo || 0;

 if (current < amount) return false;

 await this.updateUser(guildId, userId, {
 saldo: current - amount,
 total_sacado: (user?.totalSacado || 0) + amount
 });

 await this.addTransaction(guildId, {
 type: 'debito',
 userId: userId,
 amount: amount,
 reason: reason
 });

 return true;
 }

 async getUserHistory(guildId, userId, limit = 50) {
 return await this.getUserTransactions(guildId, userId, limit);
 }

 // ==================== GUILD FINANCE (POR SERVIDOR) ====================

 async getGuildDetailedStats(guildId) {
 const db = await this.getGuildDb(guildId);

 try {
 const saldoGeral = await db.getAsync(`
 SELECT SUM(saldo) as total FROM users
 `) || { total: 0 };

 const taxas = await db.getAsync(`
 SELECT SUM(amount) as total FROM transactions
 WHERE reason = 'taxa_guilda' OR reason LIKE '%taxa%'
 `) || { total: 0 };

 const emprestimos = await db.getAsync(`
 SELECT SUM(emprestimos_pendentes) as total FROM users
 `) || { total: 0 };

 const membrosAtivos = await db.getAsync(`
 SELECT COUNT(*) as count FROM users WHERE saldo > 0
 `) || { count: 0 };

 return {
 saldoGeral: saldoGeral.total || 0,
 arrecadacaoTaxas: taxas.total || 0,
 emprestimosPendentes: emprestimos.total || 0,
 saldoLiquido: (saldoGeral.total || 0) - (emprestimos.total || 0),
 membrosAtivos: membrosAtivos.count || 0
 };
 } catch (error) {
 console.error(`[Database] Error getting guild stats for ${guildId}:`, error);
 return {
 saldoGeral: 0,
 arrecadacaoTaxas: 0,
 emprestimosPendentes: 0,
 saldoLiquido: 0,
 membrosAtivos: 0
 };
 }
 }

 // ==================== EVENT STATS (POR SERVIDOR) ====================

 async getEventParticipationStats(guildId, periodDays = 30, roleFilter = null) {
 const db = await this.getGuildDb(guildId);

 try {
 const since = Date.now() - (periodDays * 24 * 60 * 60 * 1000);

 const events = await db.allAsync(`
 SELECT * FROM events
 WHERE created_at > ?
 `, [since]);

 const stats = new Map();

 for (const event of events) {
 let participantes = [];
 try {
 participantes = JSON.parse(event.participantes || '[]');
 if (!Array.isArray(participantes)) participantes = [];
 } catch (e) {
 participantes = [];
 }

 for (const [userId, data] of participantes) {
 if (!stats.has(userId)) {
 stats.set(userId, {
 userId: userId,
 totalEvents: 0,
 totalLoot: 0,
 categories: new Set()
 });
 }

 const userStat = stats.get(userId);
 userStat.totalEvents++;
 userStat.totalLoot += data?.valor || 0;
 userStat.categories.add(event.tipo || 'normal');
 }
 }

 return Array.from(stats.values())
 .sort((a, b) => b.totalEvents - a.totalEvents);

 } catch (error) {
 console.error(`[Database] Error getting event stats for ${guildId}:`, error);
 return [];
 }
 }

 async getEventsByPeriod(guildId, days) {
 const db = await this.getGuildDb(guildId);

 try {
 const since = days === 0 ? 0 : Date.now() - (days * 24 * 60 * 60 * 1000);

 const events = await db.allAsync(`
 SELECT * FROM events
 WHERE created_at > ?
 ORDER BY created_at DESC
 `, [since]);

 return events;
 } catch (error) {
 console.error(`[Database] Error getting events for ${guildId}:`, error);
 return [];
 }
 }

 // ==================== EVENT HISTORY ====================

 async addEventHistory(guildId, historyData) {
 const db = await this.getGuildDb(guildId);

 try {
 await db.runAsync(`
 INSERT INTO event_history (event_id, simulation_id, arquivado_por, timestamp, dados)
 VALUES (?, ?, ?, ?, ?)
 `, [
 historyData.eventId,
 historyData.simulationId,
 historyData.arquivadoPor,
 historyData.timestamp,
 JSON.stringify(historyData.dados || {})
 ]);
 console.log(`[Database] Event history added for ${guildId}`);
 } catch (error) {
 console.error(`[Database] Error adding event history for ${guildId}:`, error);
 throw error;
 }
 }

 async getEventHistory(guildId, limit = 50) {
 const db = await this.getGuildDb(guildId);

 try {
 const rows = await db.allAsync(`
 SELECT * FROM event_history
 ORDER BY timestamp DESC
 LIMIT ?
 `, [limit]);

 return rows.map(row => ({
 ...row,
 dados: JSON.parse(row.dados || '{}')
 }));
 } catch (error) {
 console.error(`[Database] Error getting event history for ${guildId}:`, error);
 return [];
 }
 }

 // ==================== AUDIT (POR SERVIDOR) ====================

 async logAudit(guildId, actionType, userId, details = {}, targetId = null) {
 const db = await this.getGuildDb(guildId);

 await db.runAsync(`
 INSERT INTO audit_logs (action_type, user_id, target_id, details)
 VALUES (?, ?, ?, ?)
 `, [
 actionType,
 userId,
 targetId,
 JSON.stringify(details)
 ]);
 }

 async getAuditLogs(guildId, filters = {}, limit = 100) {
 const db = await this.getGuildDb(guildId);

 let query = 'SELECT * FROM audit_logs WHERE 1=1';
 const params = [];

 if (filters.userId) {
 query += ' AND user_id = ?';
 params.push(filters.userId);
 }
 if (filters.actionType) {
 query += ' AND action_type = ?';
 params.push(filters.actionType);
 }

 query += ' ORDER BY created_at DESC LIMIT ?';
 params.push(limit);

 const rows = await db.allAsync(query, params);
 return rows.map(row => ({
 ...row,
 details: JSON.parse(row.details || '{}')
 }));
 }

 // ==================== EVENTS (POR SERVIDOR) ====================

 async saveEvent(guildId, eventData) {
 const db = await this.getGuildDb(guildId);

 await db.runAsync(`
 INSERT OR REPLACE INTO events
 (event_id, creator_id, nome, descricao, tipo, status, valor_total, taxa_guilda, participantes, started_at, ended_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
 `, [
 eventData.id,
 eventData.criadorId,
 eventData.nome,
 eventData.descricao || '',
 eventData.tipo || 'normal',
 eventData.status,
 eventData.valorTotal || 0,
 eventData.taxaGuilda || 10,
 JSON.stringify(Array.from(eventData.participantes?.entries() || [])),
 eventData.inicioTimestamp,
 eventData.finalizadoEm
 ]);
 }

 async getEventHistoryTable(guildId, limit = 50) {
 const db = await this.getGuildDb(guildId);

 return await db.allAsync(`
 SELECT * FROM events
 ORDER BY created_at DESC
 LIMIT ?
 `, [limit]);
 }

 // ==================== DAILY CHECKINS (POR SERVIDOR) ====================

 async recordCheckin(guildId, userId, rewards) {
 const db = await this.getGuildDb(guildId);

 const today = new Date().toISOString().split('T')[0];

 await db.runAsync(`
 INSERT INTO daily_checkins (user_id, date, reward_xp, reward_saldo, streak)
 VALUES (?, ?, ?, ?, ?)
 ON CONFLICT(user_id, date) DO UPDATE SET
 reward_xp = excluded.reward_xp,
 reward_saldo = excluded.reward_saldo
 `, [userId, today, rewards.xp, rewards.saldo, rewards.streak]);

 await this.updateUser(guildId, userId, {
 streak_diaria: rewards.streak,
 ultimo_checkin: Date.now()
 });

 return rewards;
 }

 async getTodayCheckin(guildId, userId) {
 const db = await this.getGuildDb(guildId);

 const today = new Date().toISOString().split('T')[0];
 return await db.getAsync(`
 SELECT * FROM daily_checkins
 WHERE user_id = ? AND date = ?
 `, [userId, today]);
 }

 // ==================== TEMPLATES (POR SERVIDOR) ====================

 async saveTemplate(guildId, creatorId, template) {
 const db = await this.getGuildDb(guildId);

 const result = await db.runAsync(`
 INSERT INTO event_templates (creator_id, name, description, requirements, default_duration, recurrence_rule)
 VALUES (?, ?, ?, ?, ?, ?)
 `, [
 creatorId,
 template.name,
 template.description,
 template.requirements,
 template.duration,
 JSON.stringify(template.recurrence || {})
 ]);

 return result.lastID;
 }

 async getTemplates(guildId) {
 const db = await this.getGuildDb(guildId);

 const rows = await db.allAsync(`
 SELECT * FROM event_templates
 ORDER BY created_at DESC
 `);

 return rows.map(t => ({
 ...t,
 recurrenceRule: JSON.parse(t.recurrence_rule || '{}')
 }));
 }

 // ==================== VOTES (POR SERVIDOR) ====================

 async createVote(guildId, voteData) {
 const db = await this.getGuildDb(guildId);

 await db.runAsync(`
 INSERT INTO votes (vote_id, creator_id, title, description, options, ends_at)
 VALUES (?, ?, ?, ?, ?, ?)
 `, [
 voteData.id,
 voteData.creatorId,
 voteData.title,
 voteData.description,
 JSON.stringify(voteData.options),
 voteData.endsAt
 ]);
 }

 async getVote(guildId, voteId) {
 const db = await this.getGuildDb(guildId);

 const row = await db.getAsync('SELECT * FROM votes WHERE vote_id = ?', [voteId]);
 if (row) {
 row.options = JSON.parse(row.options);
 row.votes = JSON.parse(row.votes);
 }
 return row;
 }

 async castVote(guildId, voteId, userId, optionIndex) {
 const db = await this.getGuildDb(guildId);

 const vote = await this.getVote(guildId, voteId);
 if (!vote || vote.status !== 'active') return false;
 if (Date.now() > vote.ends_at) return false;

 const votes = JSON.parse(vote.votes);
 if (votes[userId] !== undefined) return false;

 votes[userId] = optionIndex;

 await db.runAsync('UPDATE votes SET votes = ? WHERE vote_id = ?',
 [JSON.stringify(votes), voteId]);
 return true;
 }

 // ==================== BLACKLIST (GLOBAL) ====================

 async addToBlacklist(userId, data) {
 await this.defaultDb.runAsync(`
 INSERT OR REPLACE INTO blacklist (user_id, nick, guilda, motivo, added_by, guild_id)
 VALUES (?, ?, ?, ?, ?, ?)
 `, [userId, data.nick, data.guilda, data.motivo, data.addedBy, data.guildId]);
 }

 async isBlacklisted(userId) {
 const row = await this.defaultDb.getAsync('SELECT * FROM blacklist WHERE user_id = ?', [userId]);
 return row || null;
 }

 async getBlacklist() {
 return await this.defaultDb.allAsync('SELECT * FROM blacklist ORDER BY created_at DESC');
 }

 async removeFromBlacklist(userId) {
 await this.defaultDb.runAsync('DELETE FROM blacklist WHERE user_id = ?', [userId]);
 }

 // ==================== CLEANUP ====================

 async cleanup() {
 console.log('[Database] Running cleanup...');

 // Limpar cada banco de servidor
 for (const [guildId, db] of this.databases) {
 try {
 const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
 await db.runAsync('DELETE FROM events WHERE ended_at < ?', [ninetyDaysAgo]);
 console.log(`[Database] Cleanup completed for guild: ${guildId}`);
 } catch (e) {
 console.error(`[Database] Error cleaning up guild ${guildId}:`, e);
 }
 }
 }

 close() {
 if (this.defaultDb) {
 this.defaultDb.close();
 }
 for (const [guildId, db] of this.databases) {
 db.close();
 }
 console.log('[Database] All connections closed');
 }
}

module.exports = new DatabaseManager();