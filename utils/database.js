const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

/**
 * Database Manager - Versão SQLite3 para Replit
 * API idêntica à versão better-sqlite3 para compatibilidade
 */

class DatabaseManager {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'database.db');
    this.db = null;
    this.initialized = false;
    this.statements = {}; // Cache de prepared statements
  }

  async initialize() {
    try {
      // Garante diretório
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Abre conexão (async)
      this.db = new sqlite3.Database(this.dbPath);

      // Promisify methods
      this.db.runAsync = promisify(this.db.run.bind(this.db));
      this.db.getAsync = promisify(this.db.get.bind(this.db));
      this.db.allAsync = promisify(this.db.all.bind(this.db));

      await this.createTables();
      await this.migrateFromJSON();

      this.initialized = true;
      console.log('[Database] SQLite3 initialized successfully (Replit Mode)');

      // Cleanup automático a cada 24h
      setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);

    } catch (error) {
      console.error('[Database] Failed to initialize:', error);
      throw error;
    }
  }

  async createTables() {
    // Usuários (sistema financeiro + XP)
    await this.db.runAsync(`
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

    // Transações (auditoria completa)
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT,
        guild_id TEXT,
        event_id TEXT,
        approved_by TEXT,
        approved_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Eventos (histórico)
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
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

    // Blacklist
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS blacklist (
        user_id TEXT PRIMARY KEY,
        nick TEXT,
        guilda TEXT,
        motivo TEXT,
        added_by TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Auditoria
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        target_id TEXT,
        guild_id TEXT,
        details TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Templates de eventos
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS event_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        requirements TEXT,
        default_duration INTEGER,
        recurrence_rule TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Votações
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS votes (
        vote_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
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

    // Presença diária
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS daily_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        date TEXT NOT NULL,
        reward_xp INTEGER,
        reward_saldo INTEGER,
        streak INTEGER,
        UNIQUE(user_id, date)
      )
    `);

    // Índices
    await this.db.runAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`);
    await this.db.runAsync(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at)`);
    await this.db.runAsync(`CREATE INDEX IF NOT EXISTS idx_events_guild ON events(guild_id)`);
    await this.db.runAsync(`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)`);
  }

  // ==================== USERS ====================

  async getUser(userId) {
    const row = await this.db.getAsync('SELECT * FROM users WHERE user_id = ?', [userId]);

    if (!row) {
      await this.db.runAsync(
        'INSERT INTO users (user_id, ultimo_login) VALUES (?, ?)',
        [userId, Date.now()]
      );
      return this.getUser(userId);
    }

    return this.parseUser(row);
  }

  async updateUser(userId, data) {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'user_id') return;
      fields.push(`${key} = ?`);
      values.push(value);
    });

    values.push(Date.now(), userId); // updated_at e user_id

    const sql = `UPDATE users SET ${fields.join(', ')}, updated_at = ? WHERE user_id = ?`;
    await this.db.runAsync(sql, values);
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

  // ==================== TRANSACTIONS ====================

  async addTransaction(transaction) {
    const id = transaction.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await this.db.runAsync(`
      INSERT INTO transactions 
      (id, type, user_id, amount, reason, guild_id, event_id, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      transaction.type,
      transaction.userId,
      transaction.amount,
      transaction.reason || '',
      transaction.guildId || '',
      transaction.eventId || '',
      transaction.approvedBy || null,
      transaction.approvedAt || null
    ]);
  }

  async getUserTransactions(userId, limit = 50) {
    return await this.db.allAsync(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [userId, limit]);
  }

  async getGuildBalance(guildId) {
    const result = await this.db.getAsync(`
      SELECT SUM(amount) as total 
      FROM transactions 
      WHERE guild_id = ? AND reason = 'taxa_guilda'
    `, [guildId]);
    return result?.total || 0;
  }

  // ==================== AUDIT ====================

  async logAudit(actionType, userId, details = {}, guildId = null, targetId = null) {
    await this.db.runAsync(`
      INSERT INTO audit_logs (action_type, user_id, target_id, guild_id, details)
      VALUES (?, ?, ?, ?, ?)
    `, [
      actionType,
      userId,
      targetId,
      guildId,
      JSON.stringify(details)
    ]);
  }

  async getAuditLogs(filters = {}, limit = 100) {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.guildId) {
      query += ' AND guild_id = ?';
      params.push(filters.guildId);
    }
    if (filters.actionType) {
      query += ' AND action_type = ?';
      params.push(filters.actionType);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = await this.db.allAsync(query, params);
    return rows.map(row => ({
      ...row,
      details: JSON.parse(row.details || '{}')
    }));
  }

  // ==================== EVENTS ====================

  async saveEvent(eventData) {
    await this.db.runAsync(`
      INSERT OR REPLACE INTO events 
      (event_id, guild_id, creator_id, nome, descricao, tipo, status, valor_total, taxa_guilda, participantes, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      eventData.id,
      eventData.guildId,
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

  async getEventHistory(guildId, limit = 50) {
    return await this.db.allAsync(`
      SELECT * FROM events 
      WHERE guild_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [guildId, limit]);
  }

  // ==================== DAILY CHECKINS ====================

  async recordCheckin(userId, guildId, rewards) {
    const today = new Date().toISOString().split('T')[0];

    await this.db.runAsync(`
      INSERT INTO daily_checkins (user_id, guild_id, date, reward_xp, reward_saldo, streak)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
      reward_xp = excluded.reward_xp,
      reward_saldo = excluded.reward_saldo
    `, [userId, guildId, today, rewards.xp, rewards.saldo, rewards.streak]);

    // Atualiza streak no usuário
    await this.updateUser(userId, {
      streak_diaria: rewards.streak,
      ultimo_checkin: Date.now()
    });

    return rewards;
  }

  async getTodayCheckin(userId) {
    const today = new Date().toISOString().split('T')[0];
    return await this.db.getAsync(`
      SELECT * FROM daily_checkins 
      WHERE user_id = ? AND date = ?
    `, [userId, today]);
  }

  // ==================== TEMPLATES ====================

  async saveTemplate(guildId, creatorId, template) {
    const result = await this.db.runAsync(`
      INSERT INTO event_templates (guild_id, creator_id, name, description, requirements, default_duration, recurrence_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      guildId,
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
    const rows = await this.db.allAsync(`
      SELECT * FROM event_templates 
      WHERE guild_id = ? 
      ORDER BY created_at DESC
    `, [guildId]);

    return rows.map(t => ({
      ...t,
      recurrenceRule: JSON.parse(t.recurrence_rule || '{}')
    }));
  }

  // ==================== VOTES ====================

  async createVote(voteData) {
    await this.db.runAsync(`
      INSERT INTO votes (vote_id, guild_id, creator_id, title, description, options, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      voteData.id,
      voteData.guildId,
      voteData.creatorId,
      voteData.title,
      voteData.description,
      JSON.stringify(voteData.options),
      voteData.endsAt
    ]);
  }

  async getVote(voteId) {
    const row = await this.db.getAsync('SELECT * FROM votes WHERE vote_id = ?', [voteId]);
    if (row) {
      row.options = JSON.parse(row.options);
      row.votes = JSON.parse(row.votes);
    }
    return row;
  }

  async castVote(voteId, userId, optionIndex) {
    const vote = await this.getVote(voteId);
    if (!vote || vote.status !== 'active') return false;
    if (Date.now() > vote.ends_at) return false;

    const votes = JSON.parse(vote.votes);
    if (votes[userId] !== undefined) return false;

    votes[userId] = optionIndex;

    await this.db.runAsync('UPDATE votes SET votes = ? WHERE vote_id = ?', 
      [JSON.stringify(votes), voteId]);
    return true;
  }

  // ==================== CLEANUP & MIGRATION ====================

  async cleanup() {
    console.log('[Database] Running cleanup...');
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    await this.db.runAsync('DELETE FROM events WHERE ended_at < ?', [ninetyDaysAgo]);
  }

  async migrateFromJSON() {
    const fs = require('fs');
    const path = require('path');
    const dataDir = path.join(__dirname, '..', 'data');

    // Migra blacklist
    const blacklistPath = path.join(dataDir, 'blacklist.json');
    if (fs.existsSync(blacklistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));

        for (const [userId, entry] of Object.entries(data)) {
          await this.db.runAsync(`
            INSERT OR IGNORE INTO blacklist (user_id, nick, guilda, motivo, added_by)
            VALUES (?, ?, ?, ?, ?)
          `, [userId, entry.nick, entry.guilda, entry.motivo || '', entry.adicionadoPor || '']);
        }
        console.log('[Database] Migrated blacklist from JSON');
      } catch (e) {
        console.error('[Database] Failed to migrate blacklist:', e);
      }
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('[Database] Connection closed');
    }
  }
}

// Singleton
module.exports = new DatabaseManager();