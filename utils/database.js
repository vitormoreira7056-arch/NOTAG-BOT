const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Database Manager com SQLite (better-sqlite3)
 * Substitui JSON por SQL com transações ACID
 */

class DatabaseManager {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'database.db');
    this.db = null;
    this.initialized = false;
  }

  initialize() {
    try {
      // Garante diretório
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging para melhor performance

      this.createTables();
      this.migrateFromJSON(); // Migra dados antigos se existirem

      this.initialized = true;
      console.log('[Database] SQLite initialized successfully');

      // Inicia cleanup automático a cada 24h
      setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000);

    } catch (error) {
      console.error('[Database] Failed to initialize:', error);
      throw error;
    }
  }

  createTables() {
    // Usuários (sistema financeiro + XP)
    this.db.exec(`
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
    this.db.exec(`
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
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `);

    // Eventos (histórico)
    this.db.exec(`
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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blacklist (
        user_id TEXT PRIMARY KEY,
        nick TEXT,
        guilda TEXT,
        motivo TEXT,
        added_by TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Auditoria (log de todas as ações importantes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        target_id TEXT,
        guild_id TEXT,
        details TEXT,
        ip_hash TEXT, -- Para segurança, hash do IP se disponível
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Templates de eventos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        requirements TEXT,
        default_duration INTEGER,
        recurrence_rule TEXT, -- JSON com regras de recorrência
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Votações
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS votes (
        vote_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        options TEXT NOT NULL, -- JSON
        votes TEXT DEFAULT '{}', -- JSON {userId: optionIndex}
        ends_at INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Presença diária
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        reward_xp INTEGER,
        reward_saldo INTEGER,
        streak INTEGER,
        UNIQUE(user_id, date)
      )
    `);

    // Índices para performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_events_guild ON events(guild_id);
      CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);
    `);
  }

  // ==================== USERS ====================

  getUser(userId) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?');
    let user = stmt.get(userId);

    if (!user) {
      const insert = this.db.prepare(`
        INSERT INTO users (user_id, ultimo_login) 
        VALUES (?, ?)
      `);
      insert.run(userId, Date.now());
      user = stmt.get(userId);
    }

    return this.parseUser(user);
  }

  updateUser(userId, data) {
    const fields = [];
    const values = [];

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'user_id') return;
      fields.push(`${key} = ?`);
      values.push(value);
    });

    values.push(userId);

    const stmt = this.db.prepare(`
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = ? 
      WHERE user_id = ?
    `);

    stmt.run(...values, Date.now(), userId);
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

  addTransaction(transaction) {
    const stmt = this.db.prepare(`
      INSERT INTO transactions 
      (id, type, user_id, amount, reason, guild_id, event_id, approved_by, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transaction.id || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transaction.type,
      transaction.userId,
      transaction.amount,
      transaction.reason || '',
      transaction.guildId || '',
      transaction.eventId || '',
      transaction.approvedBy || null,
      transaction.approvedAt || null
    );
  }

  getUserTransactions(userId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }

  getGuildBalance(guildId) {
    const stmt = this.db.prepare(`
      SELECT SUM(amount) as total 
      FROM transactions 
      WHERE guild_id = ? AND reason = 'taxa_guilda'
    `);
    const result = stmt.get(guildId);
    return result?.total || 0;
  }

  // ==================== AUDIT ====================

  logAudit(actionType, userId, details = {}, guildId = null, targetId = null) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (action_type, user_id, target_id, guild_id, details)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      actionType,
      userId,
      targetId,
      guildId,
      JSON.stringify(details)
    );
  }

  getAuditLogs(filters = {}, limit = 100) {
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
    if (filters.since) {
      query += ' AND created_at > ?';
      params.push(filters.since);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    return stmt.all(...params).map(row => ({
      ...row,
      details: JSON.parse(row.details || '{}')
    }));
  }

  // ==================== EVENTS ====================

  saveEvent(eventData) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO events 
      (event_id, guild_id, creator_id, nome, descricao, tipo, status, valor_total, taxa_guilda, participantes, started_at, ended_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
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
    );
  }

  getEventHistory(guildId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM events 
      WHERE guild_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(guildId, limit);
  }

  // ==================== DAILY CHECKINS ====================

  recordCheckin(userId, guildId, rewards) {
    const today = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO daily_checkins (user_id, guild_id, date, reward_xp, reward_saldo, streak)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
      reward_xp = excluded.reward_xp,
      reward_saldo = excluded.reward_saldo
    `);

    stmt.run(userId, guildId, today, rewards.xp, rewards.saldo, rewards.streak);

    // Atualiza streak no usuário
    const user = this.getUser(userId);
    this.updateUser(userId, {
      streak_diaria: rewards.streak,
      ultimo_checkin: Date.now()
    });

    return rewards;
  }

  getTodayCheckin(userId) {
    const today = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT * FROM daily_checkins 
      WHERE user_id = ? AND date = ?
    `);
    return stmt.get(userId, today);
  }

  // ==================== TEMPLATES ====================

  saveTemplate(guildId, creatorId, template) {
    const stmt = this.db.prepare(`
      INSERT INTO event_templates (guild_id, creator_id, name, description, requirements, default_duration, recurrence_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      guildId,
      creatorId,
      template.name,
      template.description,
      template.requirements,
      template.duration,
      JSON.stringify(template.recurrence || {})
    );
  }

  getTemplates(guildId) {
    const stmt = this.db.prepare(`
      SELECT * FROM event_templates 
      WHERE guild_id = ? 
      ORDER BY created_at DESC
    `);
    return stmt.all(guildId).map(t => ({
      ...t,
      recurrenceRule: JSON.parse(t.recurrence_rule || '{}')
    }));
  }

  // ==================== VOTES ====================

  createVote(voteData) {
    const stmt = this.db.prepare(`
      INSERT INTO votes (vote_id, guild_id, creator_id, title, description, options, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      voteData.id,
      voteData.guildId,
      voteData.creatorId,
      voteData.title,
      voteData.description,
      JSON.stringify(voteData.options),
      voteData.endsAt
    );
  }

  getVote(voteId) {
    const stmt = this.db.prepare('SELECT * FROM votes WHERE vote_id = ?');
    const row = stmt.get(voteId);
    if (row) {
      row.options = JSON.parse(row.options);
      row.votes = JSON.parse(row.votes);
    }
    return row;
  }

  castVote(voteId, userId, optionIndex) {
    const vote = this.getVote(voteId);
    if (!vote || vote.status !== 'active') return false;
    if (Date.now() > vote.ends_at) return false;

    const votes = JSON.parse(vote.votes);
    if (votes[userId] !== undefined) return false; // Já votou

    votes[userId] = optionIndex;

    const stmt = this.db.prepare('UPDATE votes SET votes = ? WHERE vote_id = ?');
    stmt.run(JSON.stringify(votes), voteId);
    return true;
  }

  // ==================== CLEANUP & MIGRATION ====================

  cleanup() {
    console.log('[Database] Running cleanup...');

    // Remove eventos finalizados antigos (> 90 dias)
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    this.db.prepare('DELETE FROM events WHERE ended_at < ?').run(ninetyDaysAgo);

    // Compacta database
    this.db.exec('VACUUM');
  }

  migrateFromJSON() {
    // Migra dados antigos de JSON para SQLite se existirem
    const fs = require('fs');
    const path = require('path');

    const dataDir = path.join(__dirname, '..', 'data');

    // Migra blacklist
    const blacklistPath = path.join(dataDir, 'blacklist.json');
    if (fs.existsSync(blacklistPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
        const stmt = this.db.prepare(`
          INSERT OR IGNORE INTO blacklist (user_id, nick, guilda, motivo, added_by)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const [userId, entry] of data) {
          stmt.run(userId, entry.nick, entry.guilda, entry.motivo || '', entry.adicionadoPor || '');
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

// Singleton instance
module.exports = new DatabaseManager();