const axios = require('axios');

/**
 * Serviço de integração com Albion Online API
 * Documentação: https://www.albion-online-data.com/ ou API oficial
 */

class AlbionApiService {
  constructor() {
    this.baseUrl = 'https://gameinfo.albiononline.com/api/gameinfo';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Busca jogador pelo nome
   * @param {string} playerName 
   */
  async searchPlayer(playerName) {
    try {
      const cacheKey = `player_${playerName.toLowerCase()}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const response = await axios.get(`${this.baseUrl}/search?q=${encodeURIComponent(playerName)}`, {
        timeout: 5000
      });

      const data = response.data;

      // Cache resultado
      this.cache.set(cacheKey, data);
      setTimeout(() => this.cache.delete(cacheKey), this.cacheTimeout);

      return data;
    } catch (error) {
      console.error('[AlbionAPI] Error searching player:', error.message);
      return null;
    }
  }

  /**
   * Busca estatísticas do jogador
   * @param {string} playerId 
   */
  async getPlayerStats(playerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/players/${playerId}`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[AlbionAPI] Error fetching player stats:', error.message);
      return null;
    }
  }

  /**
   * Busca histórico de kills/deaths
   * @param {string} playerId 
   * @param {number} limit 
   */
  async getPlayerKills(playerId, limit = 10) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/players/${playerId}/kills?limit=${limit}`, 
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      console.error('[AlbionAPI] Error fetching kills:', error.message);
      return [];
    }
  }

  /**
   * Verifica se jogador existe e está na guilda correta
   * @param {string} playerName 
   * @param {string} expectedGuildName 
   */
  async verifyGuildMembership(playerName, expectedGuildName) {
    const search = await this.searchPlayer(playerName);
    if (!search || !search.players || search.players.length === 0) {
      return { valid: false, error: 'Jogador não encontrado no Albion' };
    }

    const player = search.players[0];

    // Se não especificou guilda, apenas retorna dados
    if (!expectedGuildName) {
      return { valid: true, player };
    }

    // Verifica guilda
    if (!player.GuildName || player.GuildName.toLowerCase() !== expectedGuildName.toLowerCase()) {
      return { 
        valid: false, 
        error: `Jogador não está na guilda ${expectedGuildName}. Guilda atual: ${player.GuildName || 'Nenhuma'}`,
        player 
      };
    }

    return { valid: true, player };
  }

  /**
   * Busca dados da guilda
   * @param {string} guildId 
   */
  async getGuildInfo(guildId) {
    try {
      const response = await axios.get(`${this.baseUrl}/guilds/${guildId}`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error('[AlbionAPI] Error fetching guild info:', error.message);
      return null;
    }
  }

  /**
   * Busca membros da guilda
   * @param {string} guildId 
   */
  async getGuildMembers(guildId) {
    try {
      const response = await axios.get(`${this.baseUrl}/guilds/${guildId}/members`, {
        timeout: 5000
      });
      return response.data || [];
    } catch (error) {
      console.error('[AlbionAPI] Error fetching guild members:', error.message);
      return [];
    }
  }

  /**
   * Busca eventos recentes (batalhas) da guilda
   * @param {string} guildId 
   * @param {number} limit 
   */
  async getGuildBattles(guildId, limit = 5) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/guilds/${guildId}/battles?limit=${limit}`,
        { timeout: 5000 }
      );
      return response.data || [];
    } catch (error) {
      console.error('[AlbionAPI] Error fetching guild battles:', error.message);
      return [];
    }
  }

  /**
   * Compara stats de dois jogadores
   * @param {string} playerId1 
   * @param {string} playerId2 
   */
  async comparePlayers(playerId1, playerId2) {
    const [p1, p2] = await Promise.all([
      this.getPlayerStats(playerId1),
      this.getPlayerStats(playerId2)
    ]);

    if (!p1 || !p2) return null;

    return {
      player1: {
        name: p1.Name,
        fame: p1.LifetimeStatistics.PvE.Total,
        pvpFame: p1.LifetimeStatistics.PvP.Total,
        gatheringFame: p1.LifetimeStatistics.Gathering.All.Total
      },
      player2: {
        name: p2.Name,
        fame: p2.LifetimeStatistics.PvE.Total,
        pvpFame: p2.LifetimeStatistics.PvP.Total,
        gatheringFame: p2.LifetimeStatistics.Gathering.All.Total
      }
    };
  }
}

module.exports = new AlbionApiService();