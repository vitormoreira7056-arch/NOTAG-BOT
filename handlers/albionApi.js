const https = require('https');

class AlbionAPI {
  constructor() {
    this.baseUrl = 'gameinfo.albiononline.com';
  }

  // Buscar jogador por nome (retorna o primeiro resultado correspondente)
  async searchPlayer(playerName, server = 'europe') {
    return new Promise((resolve, reject) => {
      const encodedName = encodeURIComponent(playerName);
      const options = {
        hostname: this.baseUrl,
        path: `/api/gameinfo/search?q=${encodedName}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);

            // Filtrar apenas players que correspondem exatamente ao nome (case insensitive)
            const players = jsonData.players || [];
            const exactMatch = players.find(p => 
              p.Name.toLowerCase() === playerName.toLowerCase()
            );

            // Se não encontrar exato, pega o primeiro similar
            const player = exactMatch || players[0];

            if (player) {
              resolve({
                id: player.Id,
                name: player.Name,
                guildId: player.GuildId || null,
                guildName: player.GuildName || null,
                allianceId: player.AllianceId || null,
                allianceName: player.AllianceName || null,
                server: server
              });
            } else {
              resolve(null);
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout na requisição à API do Albion'));
      });

      req.end();
    });
  }

  // Buscar detalhes da guilda incluindo membros
  async getGuildMembers(guildId) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: `/api/gameinfo/guilds/${guildId}/members`,
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData || []);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Timeout na requisição à API do Albion'));
      });

      req.end();
    });
  }

  // Verificar se jogador está na guilda específica
  async verifyPlayerGuild(playerName, guildName, server = 'europe') {
    try {
      // 1. Buscar jogador
      const player = await this.searchPlayer(playerName, server);
      if (!player) {
        return {
          valid: false,
          error: 'Jogador não encontrado no servidor selecionado',
          details: null
        };
      }

      // 2. Se informou guilda, verificar se está nela
      if (guildName && guildName.trim() !== '' && guildName.toLowerCase() !== 'nenhuma') {
        if (!player.guildId) {
          return {
            valid: false,
            error: `Jogador "${playerName}" não está em nenhuma guilda atualmente`,
            details: player
          };
        }

        // Buscar membros da guilda para confirmar
        const members = await this.getGuildMembers(player.guildId);
        const isMember = members.some(m => 
          m.Name.toLowerCase() === playerName.toLowerCase()
        );

        if (!isMember) {
          return {
            valid: false,
            error: `Jogador "${playerName}" não encontrado na guilda "${player.guildName || guildName}"`,
            details: player
          };
        }

        // Verificar se o nome da guilda bate (parcialmente)
        const guildMatch = player.guildName && 
          (player.guildName.toLowerCase().includes(guildName.toLowerCase()) ||
           guildName.toLowerCase().includes(player.guildName.toLowerCase()));

        if (!guildMatch) {
          return {
            valid: false,
            error: `Guilda mismatch. Jogador está em "${player.guildName}", mas informou "${guildName}"`,
            details: player
          };
        }

        return {
          valid: true,
          error: null,
          details: player
        };
      }

      // Se não informou guilda ou informou "nenhuma", apenas valida existência do jogador
      return {
        valid: true,
        error: null,
        details: player
      };

    } catch (error) {
      return {
        valid: false,
        error: `Erro na verificação: ${error.message}`,
        details: null
      };
    }
  }
}

module.exports = new AlbionAPI();