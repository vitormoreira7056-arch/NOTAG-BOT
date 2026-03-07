const https = require('https');

class AlbionAPI {
  constructor() {
    this.baseUrl = 'gameinfo.albiononline.com';
    this.timeout = 30000; // 30 segundos
  }

  async searchPlayer(playerName, server = 'europe', retries = 3) {
    return new Promise((resolve, reject) => {
      const encodedName = encodeURIComponent(playerName);
      const url = `https://${this.baseUrl}/api/gameinfo/search?q=${encodedName}`;

      console.log(`\n🔍 === BUSCANDO JOGADOR ===`);
      console.log(`URL: ${url}`);
      console.log(`Nick: ${playerName}`);
      console.log(`Servidor: ${server}`);

      const options = {
        hostname: this.baseUrl,
        path: `/api/gameinfo/search?q=${encodedName}`,
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = https.request(options, (res) => {
        console.log(`📡 Status Code: ${res.statusCode}`);
        console.log(`📡 Headers: ${JSON.stringify(res.headers)}`);

        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            console.log(`📥 Resposta raw: ${data.substring(0, 500)}`);

            if (!data || data.trim() === '') {
              console.log('⚠️ Resposta VAZIA da API');
              if (retries > 0) {
                console.log(`🔄 Retry ${retries}...`);
                setTimeout(() => {
                  this.searchPlayer(playerName, server, retries - 1)
                    .then(resolve)
                    .catch(reject);
                }, 3000);
                return;
              }
              resolve(null);
              return;
            }

            const jsonData = JSON.parse(data);
            console.log(`📊 Estrutura da resposta:`, Object.keys(jsonData));

            const players = jsonData.players || [];
            console.log(`👥 Total players encontrados: ${players.length}`);

            if (players.length > 0) {
              console.log(`👤 Primeiros 3 resultados:`);
              players.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i+1}. ${p.Name} (Guild: ${p.GuildName || 'N/A'})`);
              });
            }

            if (players.length === 0) {
              console.log(`❌ Nenhum player encontrado para "${playerName}"`);
              resolve(null);
              return;
            }

            // Busca exata case-insensitive
            const exactMatch = players.find(p => 
              p.Name && p.Name.toLowerCase() === playerName.toLowerCase()
            );

            if (exactMatch) {
              console.log(`✅ Match exato encontrado: ${exactMatch.Name}`);
              resolve({
                id: exactMatch.Id,
                name: exactMatch.Name,
                guildId: exactMatch.GuildId || null,
                guildName: exactMatch.GuildName || null,
                allianceId: exactMatch.AllianceId || null,
                allianceName: exactMatch.AllianceName || null,
                server: server
              });
              return;
            }

            // Se não achou exato, pega o primeiro
            const player = players[0];
            console.log(`⚠️ Usando primeiro resultado: ${player.Name}`);
            resolve({
              id: player.Id,
              name: player.Name,
              guildId: player.GuildId || null,
              guildName: player.GuildName || null,
              allianceId: player.AllianceId || null,
              allianceName: player.AllianceName || null,
              server: server
            });

          } catch (error) {
            console.error(`❌ Erro parse JSON:`, error.message);
            console.error(`📄 Data recebida:`, data);
            if (retries > 0) {
              setTimeout(() => {
                this.searchPlayer(playerName, server, retries - 1)
                  .then(resolve)
                  .catch(reject);
              }, 3000);
              return;
            }
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        console.error(`❌ Erro de rede:`, error.message);
        if (retries > 0) {
          console.log(`🔄 Retry após erro...`);
          setTimeout(() => {
            this.searchPlayer(playerName, server, retries - 1)
              .then(resolve)
              .catch(reject);
          }, 3000);
          return;
        }
        reject(error);
      });

      req.setTimeout(this.timeout, () => {
        console.error(`⏱️ Timeout (${this.timeout}ms)`);
        req.destroy();
        if (retries > 0) {
          console.log(`🔄 Retry após timeout...`);
          this.searchPlayer(playerName, server, retries - 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        reject(new Error('Timeout'));
      });

      req.end();
    });
  }

  async verifyPlayerGuild(playerName, guildName, server = 'europe') {
    try {
      console.log(`\n🚀 === INICIANDO VERIFICAÇÃO ===`);
      console.log(`Player: "${playerName}"`);
      console.log(`Guilda informada: "${guildName}"`);

      const player = await this.searchPlayer(playerName, server);

      if (!player) {
        console.log(`❌ Player não encontrado na API`);
        return {
          valid: false,
          error: `Jogador "${playerName}" não encontrado no servidor ${server}. O nick está correto?`,
          details: null
        };
      }

      console.log(`✅ Player encontrado: ${player.name}`);
      console.log(`   Guilda na API: ${player.guildName || 'Sem guilda'}`);
      console.log(`   Guilda informada: ${guildName}`);

      // Se não informou guilda ou informou "nenhuma"
      if (!guildName || 
          guildName.trim() === '' || 
          guildName.toLowerCase() === 'nenhuma' ||
          guildName.toLowerCase() === 'none') {
        console.log(`✅ Validação básica OK (sem guilda)`);
        return {
          valid: true,
          error: null,
          details: player
        };
      }

      // Se o player não tem guilda na API mas informou uma
      if (!player.guildId) {
        return {
          valid: false,
          error: `O jogador "${playerName}" não está em nenhuma guilda no Albion, mas você informou "${guildName}".`,
          details: player
        };
      }

      // Comparar guildas
      const playerGuildLower = (player.guildName || '').toLowerCase();
      const inputGuildLower = guildName.toLowerCase();

      console.log(`🔍 Comparando: "${playerGuildLower}" vs "${inputGuildLower}"`);

      const match = playerGuildLower === inputGuildLower ||
                    playerGuildLower.includes(inputGuildLower) ||
                    inputGuildLower.includes(playerGuildLower);

      if (!match) {
        return {
          valid: false,
          error: `Guilda incorreta. Você informou "${guildName}" mas o jogador está na guilda "${player.guildName}" no Albion.`,
          details: player
        };
      }

      console.log(`✅ Verificação completa OK!`);
      return {
        valid: true,
        error: null,
        details: player
      };

    } catch (error) {
      console.error(`❌ Erro na verificação:`, error);
      return {
        valid: false,
        error: `Erro na API: ${error.message}. Tente novamente.`,
        details: null
      };
    }
  }
}

module.exports = new AlbionAPI();