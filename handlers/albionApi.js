const https = require('https');

/**
 * AlbionAPI - Serviço unificado de integração com Albion Online
 * Consolida: handlers/albionApi.js + services/albionApi.js
 * Melhorias: Circuit Breaker, Cache Inteligente, Multi-endpoint, Retry com Backoff
 */
class AlbionAPI {
  constructor() {
    // Múltiplos endpoints para fallback (oficiais da Sandbox Interactive)
    this.endpoints = {
      europe: 'gameinfo.albiononline.com',
      americas: 'gameinfo-ams.albiononline.com', 
      asia: 'gameinfo-sgp.albiononline.com'
    };

    this.timeout = 10000; // 10 segundos (mais rápido)
    this.maxRetries = 2;

    // Cache em memória: Map<playerName, {data, timestamp}>
    this.cache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hora

    // Cache negativo (jogadores não encontrados)
    this.negativeCache = new Map();
    this.negativeCacheTTL = 5 * 60 * 1000; // 5 minutos

    // Circuit breaker
    this.circuitBreaker = {
      failures: 0,
      lastFailure: null,
      state: 'CLOSED',
      threshold: 5,
      timeout: 5 * 60 * 1000
    };
  }

  checkCircuitBreaker() {
    if (this.circuitBreaker.state === 'OPEN') {
      const now = Date.now();
      if (now - this.circuitBreaker.lastFailure > this.circuitBreaker.timeout) {
        console.log('🔧 Circuit Breaker: HALF_OPEN');
        this.circuitBreaker.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      console.log('✅ Circuit Breaker: CLOSED');
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;
    }
  }

  recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      console.error('🔴 Circuit Breaker: OPEN (5min)');
      this.circuitBreaker.state = 'OPEN';
    }
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    console.log(`📦 Cache hit: "${key}"`);
    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  getFromNegativeCache(key) {
    const cached = this.negativeCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > this.negativeCacheTTL) {
      this.negativeCache.delete(key);
      return null;
    }
    return true; // Já sabemos que não existe
  }

  setNegativeCache(key) {
    this.negativeCache.set(key, { timestamp: Date.now() });
  }

  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) this.cache.delete(key);
    }
    for (const [key, value] of this.negativeCache.entries()) {
      if (now - value.timestamp > this.negativeCacheTTL) this.negativeCache.delete(key);
    }
  }

  makeRequest(hostname, path) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: hostname,
        path: path,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              resolve({ success: true, data: JSON.parse(data) });
            } else if (res.statusCode === 429) {
              reject({ type: 'RATE_LIMIT', message: 'Rate limit' });
            } else {
              reject({ type: 'HTTP_ERROR', status: res.statusCode });
            }
          } catch (error) {
            reject({ type: 'PARSE_ERROR', message: error.message });
          }
        });
      });

      req.on('error', (error) => reject({ type: 'NETWORK_ERROR', message: error.message }));
      req.setTimeout(this.timeout, () => {
        req.destroy();
        reject({ type: 'TIMEOUT', message: `Timeout ${this.timeout}ms` });
      });
      req.end();
    });
  }

  async searchPlayer(playerName, server = 'europe') {
    console.log(`\n🔍 Buscando: "${playerName}" [${server}]`);

    const cacheKey = playerName.toLowerCase();
    if (!this.checkCircuitBreaker()) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;
      return null;
    }

    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    if (this.getFromNegativeCache(cacheKey)) {
      console.log(`⛔ Cache negativo: "${playerName}"`);
      return null;
    }

    const encodedName = encodeURIComponent(playerName);
    const endpointsToTry = [
      this.endpoints[server] || this.endpoints.europe,
      ...Object.values(this.endpoints).filter(e => e !== (this.endpoints[server] || this.endpoints.europe))
    ];

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      for (const endpoint of endpointsToTry) {
        try {
          console.log(`🌐 ${endpoint} (tentativa ${attempt + 1})`);
          const path = `/api/gameinfo/search?q=${encodedName}`;
          const result = await this.makeRequest(endpoint, path);

          if (result.success) {
            const playerData = this.processPlayerData(result.data, playerName);
            if (playerData) {
              console.log(`✅ Encontrado: ${playerData.name}`);
              this.setCache(cacheKey, playerData);
              this.recordSuccess();
              return playerData;
            } else {
              console.log(`❌ Não encontrado`);
              this.setNegativeCache(cacheKey);
              return null;
            }
          }
        } catch (error) {
          console.error(`❌ ${endpoint}:`, error.type || error.message);
          if (error.type === 'RATE_LIMIT') await this.delay(2000);
        }
      }
      if (attempt < this.maxRetries - 1) await this.delay(1000 * (attempt + 1));
    }

    console.error('🔴 Todas falharam');
    this.recordFailure();
    return null;
  }

  processPlayerData(apiData, searchName) {
    if (!apiData?.players?.length) return null;

    const exactMatch = apiData.players.find(p => 
      p.Name?.toLowerCase() === searchName.toLowerCase()
    );
    const player = exactMatch || apiData.players[0];

    if (!player.Name) return null;

    return {
      id: player.Id,
      name: player.Name,
      guildId: player.GuildId || null,
      guildName: player.GuildName || null,
      allianceId: player.AllianceId || null,
      allianceName: player.AllianceName || null,
      avatar: player.Avatar || null,
      avatarRing: player.AvatarRing || null,
      killFame: player.KillFame || 0,
      deathFame: player.DeathFame || 0,
      searchedAt: new Date().toISOString()
    };
  }

  async verifyPlayerGuild(playerName, guildName, server = 'europe') {
    console.log(`\n🚀 Verificação: "${playerName}" -> "${guildName}"`);
    const startTime = Date.now();

    try {
      const player = await this.searchPlayer(playerName, server);

      if (!player) {
        return {
          valid: false,
          error: `Jogador "${playerName}" não encontrado no servidor ${server}.`,
          details: null,
          apiStatus: 'NOT_FOUND',
          responseTime: Date.now() - startTime
        };
      }

      // Sem guilda informada ou "nenhuma"
      if (!guildName || ['nenhuma', 'none', ''].includes(guildName.toLowerCase().trim())) {
        if (!player.guildId) {
          return { valid: true, error: null, details: player, apiStatus: 'VALIDATED', responseTime: Date.now() - startTime };
        }
        return {
          valid: false,
          error: `Você informou "Nenhuma" guilda, mas o jogador está em "${player.guildName}".`,
          details: player,
          apiStatus: 'MISMATCH',
          responseTime: Date.now() - startTime
        };
      }

      // Jogador não tem guilda mas informou uma
      if (!player.guildId) {
        return {
          valid: false,
          error: `Jogador não está em nenhuma guilda, mas você informou "${guildName}".`,
          details: player,
          apiStatus: 'NO_GUILD',
          responseTime: Date.now() - startTime
        };
      }

      // Verificação de guilda (case insensitive e parcial)
      const playerGuild = (player.guildName || '').toLowerCase().trim();
      const inputGuild = guildName.toLowerCase().trim();
      const match = playerGuild === inputGuild || 
                    playerGuild.includes(inputGuild) || 
                    inputGuild.includes(playerGuild);

      if (!match) {
        return {
          valid: false,
          error: `Guilda incorreta. Informado: "${guildName}" | Real: "${player.guildName}".`,
          details: player,
          apiStatus: 'GUILD_MISMATCH',
          responseTime: Date.now() - startTime
        };
      }

      return { valid: true, error: null, details: player, apiStatus: 'VALIDATED', responseTime: Date.now() - startTime };

    } catch (error) {
      console.error('❌ Erro:', error);
      const isApiDown = this.circuitBreaker.state === 'OPEN';
      return {
        valid: false,
        error: isApiDown ? 'API temporariamente indisponível. Análise manual necessária.' : `Erro: ${error.message}`,
        details: null,
        apiStatus: isApiDown ? 'API_UNAVAILABLE' : 'ERROR',
        responseTime: Date.now() - startTime
      };
    }
  }

  // ==================== MÉTODOS ADICIONAIS (da versão services/) ====================

  async getPlayerStats(playerId) {
    try {
      const endpoint = this.endpoints.europe;
      const result = await this.makeRequest(endpoint, `/api/gameinfo/players/${playerId}`);
      return result.success ? result.data : null;
    } catch (error) {
      console.error('[AlbionAPI] Error getPlayerStats:', error.message);
      return null;
    }
  }

  async getPlayerKills(playerId, limit = 10) {
    try {
      const endpoint = this.endpoints.europe;
      const result = await this.makeRequest(endpoint, `/api/gameinfo/players/${playerId}/kills?limit=${limit}`);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('[AlbionAPI] Error getPlayerKills:', error.message);
      return [];
    }
  }

  async getGuildInfo(guildId) {
    try {
      const endpoint = this.endpoints.europe;
      const result = await this.makeRequest(endpoint, `/api/gameinfo/guilds/${guildId}`);
      return result.success ? result.data : null;
    } catch (error) {
      console.error('[AlbionAPI] Error getGuildInfo:', error.message);
      return null;
    }
  }

  async getGuildMembers(guildId) {
    try {
      const endpoint = this.endpoints.europe;
      const result = await this.makeRequest(endpoint, `/api/gameinfo/guilds/${guildId}/members`);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('[AlbionAPI] Error getGuildMembers:', error.message);
      return [];
    }
  }

  async getGuildBattles(guildId, limit = 5) {
    try {
      const endpoint = this.endpoints.europe;
      const result = await this.makeRequest(endpoint, `/api/gameinfo/guilds/${guildId}/battles?limit=${limit}`);
      return result.success ? result.data : [];
    } catch (error) {
      console.error('[AlbionAPI] Error getGuildBattles:', error.message);
      return [];
    }
  }

  async comparePlayers(playerId1, playerId2) {
    const [p1, p2] = await Promise.all([
      this.getPlayerStats(playerId1),
      this.getPlayerStats(playerId2)
    ]);

    if (!p1 || !p2) return null;

    return {
      player1: {
        name: p1.Name,
        fame: p1.LifetimeStatistics?.PvE?.Total || 0,
        pvpFame: p1.LifetimeStatistics?.PvP?.Total || 0,
        gatheringFame: p1.LifetimeStatistics?.Gathering?.All?.Total || 0
      },
      player2: {
        name: p2.Name,
        fame: p2.LifetimeStatistics?.PvE?.Total || 0,
        pvpFame: p2.LifetimeStatistics?.PvP?.Total || 0,
        gatheringFame: p2.LifetimeStatistics?.Gathering?.All?.Total || 0
      }
    };
  }

  async checkApiHealth() {
    const results = {};
    for (const [server, endpoint] of Object.entries(this.endpoints)) {
      try {
        const start = Date.now();
        await this.makeRequest(endpoint, '/api/gameinfo/search?q=test');
        results[server] = { status: 'UP', latency: Date.now() - start };
      } catch (error) {
        results[server] = { status: 'DOWN', error: error.type || error.message };
      }
    }
    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AlbionAPI();