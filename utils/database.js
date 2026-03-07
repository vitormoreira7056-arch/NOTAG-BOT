const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.transactionsFile = path.join(this.dataDir, 'transactions.json');
    this.eventHistoryFile = path.join(this.dataDir, 'eventHistory.json');

    this.users = new Map();
    this.transactions = [];
    this.eventHistory = [];

    this.initialize();
  }

  initialize() {
    try {
      console.log('[Database] Initializing database...');

      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
        console.log('[Database] Created data directory');
      }

      if (fs.existsSync(this.usersFile)) {
        const data = JSON.parse(fs.readFileSync(this.usersFile, 'utf8'));
        this.users = new Map(Object.entries(data));
        console.log(`[Database] Loaded ${this.users.size} users`);
      }

      if (fs.existsSync(this.transactionsFile)) {
        this.transactions = JSON.parse(fs.readFileSync(this.transactionsFile, 'utf8'));
        console.log(`[Database] Loaded ${this.transactions.length} transactions`);
      }

      if (fs.existsSync(this.eventHistoryFile)) {
        this.eventHistory = JSON.parse(fs.readFileSync(this.eventHistoryFile, 'utf8'));
        console.log(`[Database] Loaded ${this.eventHistory.length} event history entries`);
      }

      console.log('[Database] Database initialized successfully');
    } catch (error) {
      console.error('[Database] Error initializing database:', error);
    }
  }

  saveUsers() {
    try {
      const data = Object.fromEntries(this.users);
      fs.writeFileSync(this.usersFile, JSON.stringify(data, null, 2));
      console.log('[Database] Users saved successfully');
    } catch (error) {
      console.error('[Database] Error saving users:', error);
    }
  }

  saveTransactions() {
    try {
      fs.writeFileSync(this.transactionsFile, JSON.stringify(this.transactions, null, 2));
      console.log('[Database] Transactions saved successfully');
    } catch (error) {
      console.error('[Database] Error saving transactions:', error);
    }
  }

  saveEventHistory() {
    try {
      fs.writeFileSync(this.eventHistoryFile, JSON.stringify(this.eventHistory, null, 2));
      console.log('[Database] Event history saved successfully');
    } catch (error) {
      console.error('[Database] Error saving event history:', error);
    }
  }

  getUser(userId) {
    console.log(`[Database] Getting user: ${userId}`);
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        userId: userId,
        saldo: 0,
        totalRecebido: 0,
        totalSacado: 0,
        emprestimosPendentes: 0,
        totalEmprestimos: 0,
        historicoEventos: [],
        // Campos de XP
        level: 1,
        xp: 0,
        totalXp: 0,
        insignias: [],
        eventosParticipados: 0
      });
      console.log(`[Database] Created new user entry for: ${userId}`);
    }
    return this.users.get(userId);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  updateUser(userId, data) {
    console.log(`[Database] Updating user: ${userId}`);
    this.users.set(userId, data);
    this.saveUsers();
  }

  addSaldo(userId, amount, reason = 'deposito') {
    console.log(`[Database] Adding ${amount} to user ${userId}. Reason: ${reason}`);
    const user = this.getUser(userId);
    user.saldo += amount;
    user.totalRecebido += amount;

    this.updateUser(userId, user);

    this.addTransaction({
      type: 'credito',
      userId: userId,
      amount: amount,
      reason: reason,
      timestamp: Date.now()
    });

    console.log(`[Database] New balance for ${userId}: ${user.saldo}`);
    return user;
  }

  removeSaldo(userId, amount, reason = 'debito') {
    console.log(`[Database] Removing ${amount} from user ${userId}. Reason: ${reason}`);
    const user = this.getUser(userId);

    if (user.saldo < amount) {
      console.error(`[Database] Insufficient balance for user ${userId}. Current: ${user.saldo}, Requested: ${amount}`);
      throw new Error('Saldo insuficiente');
    }

    user.saldo -= amount;
    user.totalSacado += amount;

    this.updateUser(userId, user);

    this.addTransaction({
      type: 'debito',
      userId: userId,
      amount: amount,
      reason: reason,
      timestamp: Date.now()
    });

    console.log(`[Database] New balance for ${userId}: ${user.saldo}`);
    return user;
  }

  addLoan(userId, amount) {
    console.log(`[Database] Adding loan of ${amount} to user ${userId}`);
    const user = this.getUser(userId);

    if (!user.emprestimosPendentes) {
      user.emprestimosPendentes = 0;
    }
    if (!user.totalEmprestimos) {
      user.totalEmprestimos = 0;
    }

    user.emprestimosPendentes += amount;
    user.totalEmprestimos += amount;

    this.updateUser(userId, user);

    this.addTransaction({
      type: 'emprestimo',
      userId: userId,
      amount: amount,
      reason: 'emprestimo_concedido',
      timestamp: Date.now()
    });

    console.log(`[Database] Loan added. Total pending for ${userId}: ${user.emprestimosPendentes}`);
    return user;
  }

  payLoan(userId, amount) {
    console.log(`[Database] Paying loan of ${amount} for user ${userId}`);
    const user = this.getUser(userId);

    if (!user.emprestimosPendentes || user.emprestimosPendentes < amount) {
      throw new Error('Valor de pagamento maior que a dívida');
    }

    user.emprestimosPendentes -= amount;
    this.updateUser(userId, user);

    this.addTransaction({
      type: 'pagamento_emprestimo',
      userId: userId,
      amount: amount,
      reason: 'emprestimo_quitado',
      timestamp: Date.now()
    });

    console.log(`[Database] Loan payment processed. Remaining for ${userId}: ${user.emprestimosPendentes}`);
    return user;
  }

  addTransaction(transaction) {
    console.log(`[Database] Adding transaction: ${transaction.type} - ${transaction.amount}`);
    this.transactions.push(transaction);

    if (this.transactions.length > 1000) {
      this.transactions = this.transactions.slice(-1000);
    }

    this.saveTransactions();
  }

  addEventHistory(eventData) {
    console.log(`[Database] Adding event to history: ${eventData.eventId}`);
    this.eventHistory.push(eventData);
    this.saveEventHistory();
  }

  getGuildBalance(guildId) {
    console.log(`[Database] Calculating guild balance for: ${guildId}`);
    let totalTaxas = 0;

    this.transactions.forEach(t => {
      if (t.reason === 'taxa_guilda' && t.guildId === guildId) {
        totalTaxas += t.amount;
      }
    });

    console.log(`[Database] Guild ${guildId} total taxes: ${totalTaxas}`);
    return totalTaxas;
  }

  getUserHistory(userId) {
    console.log(`[Database] Getting transaction history for user: ${userId}`);
    return this.transactions.filter(t => t.userId === userId);
  }
}

module.exports = new Database();