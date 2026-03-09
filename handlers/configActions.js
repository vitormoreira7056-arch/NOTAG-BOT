const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const Database = require('../utils/database');
const AlbionAPI = require('./albionApi');

class ConfigActions {
  /**
   * Verifica se o usuário tem permissão de ADM
   */
  static async checkADM(interaction) {
    const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM') ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isADM) {
      await interaction.reply({
        content: '❌ Apenas ADMs podem alterar as configurações!',
        ephemeral: true
      });
      return false;
    }
    return true;
  }

  static async initialize() {
    console.log('[ConfigActions] Initialized');
  }

  // Handler para taxa da guilda
  static async handleTaxaGuilda(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const modal = new ModalBuilder()
        .setCustomId('modal_taxa_guilda')
        .setTitle('💰 Configurar Taxa da Guilda');

      const taxaInput = new TextInputBuilder()
        .setCustomId('valor_taxa')
        .setLabel('Nova taxa da guilda (%)')
        .setPlaceholder('Ex: 10')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(taxaInput));
      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[ConfigActions] Error handling taxa guilda:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir configuração de taxa.',
        ephemeral: true
      });
    }
  }

  static async handleTaxaSelect(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const novaTaxa = parseInt(interaction.fields.getTextInputValue('valor_taxa'));

      if (isNaN(novaTaxa) || novaTaxa < 0 || novaTaxa > 100) {
        return interaction.reply({
          content: '❌ Taxa inválida! Digite um valor entre 0 e 100.',
          ephemeral: true
        });
      }

      // Salvar no banco de dados
      await Database.updateGuildConfig(interaction.guild.id, {
        taxaGuilda: novaTaxa
      });

      // Atualizar também no cache global (para compatibilidade)
      if (!global.guildConfig.has(interaction.guild.id)) {
        global.guildConfig.set(interaction.guild.id, {});
      }
      const config = global.guildConfig.get(interaction.guild.id);
      config.taxaGuilda = novaTaxa;
      global.guildConfig.set(interaction.guild.id, config);

      await interaction.reply({
        content: `✅ Taxa da guilda atualizada para \`${novaTaxa}%\`!`,
        ephemeral: true
      });

      console.log(`[ConfigActions] Taxa guilda updated to ${novaTaxa}% for guild ${interaction.guild.id}`);

    } catch (error) {
      console.error(`[ConfigActions] Error updating taxa:`, error);
      await interaction.reply({
        content: '❌ Erro ao atualizar taxa.',
        ephemeral: true
      });
    }
  }

  // Handler para taxa de baú
  static async handleTaxaBau(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      // Buscar do banco de dados
      const dbConfig = await Database.getGuildConfig(interaction.guild.id);
      const taxas = dbConfig.taxasBau || {
        royal: 10,
        black: 15,
        brecilien: 12,
        avalon: 20
      };

      const modal = new ModalBuilder()
        .setCustomId('modal_taxas_bau')
        .setTitle('📦 Configurar Taxas de Baú');

      const royalInput = new TextInputBuilder()
        .setCustomId('taxa_royal')
        .setLabel('Taxa Royal (%)')
        .setPlaceholder(`Atual: ${taxas.royal}%`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      const blackInput = new TextInputBuilder()
        .setCustomId('taxa_black')
        .setLabel('Taxa Black (%)')
        .setPlaceholder(`Atual: ${taxas.black}%`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      const brecilienInput = new TextInputBuilder()
        .setCustomId('taxa_brecilien')
        .setLabel('Taxa Brecilien (%)')
        .setPlaceholder(`Atual: ${taxas.brecilien}%`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      const avalonInput = new TextInputBuilder()
        .setCustomId('taxa_avalon')
        .setLabel('Taxa Avalon (%)')
        .setPlaceholder(`Atual: ${taxas.avalon}%`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(
        new ActionRowBuilder().addComponents(royalInput),
        new ActionRowBuilder().addComponents(blackInput),
        new ActionRowBuilder().addComponents(brecilienInput),
        new ActionRowBuilder().addComponents(avalonInput)
      );

      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[ConfigActions] Error handling taxa bau:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir configuração de taxas de baú.',
        ephemeral: true
      });
    }
  }

  static async processTaxaBau(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const royal = parseInt(interaction.fields.getTextInputValue('taxa_royal'));
      const black = parseInt(interaction.fields.getTextInputValue('taxa_black'));
      const brecilien = parseInt(interaction.fields.getTextInputValue('taxa_brecilien'));
      const avalon = parseInt(interaction.fields.getTextInputValue('taxa_avalon'));

      if ([royal, black, brecilien, avalon].some(t => isNaN(t) || t < 0 || t > 100)) {
        return interaction.reply({
          content: '❌ Todas as taxas devem ser números entre 0 e 100!',
          ephemeral: true
        });
      }

      const taxasBau = { royal, black, brecilien, avalon };

      // Salvar no banco de dados
      await Database.updateGuildConfig(interaction.guild.id, { taxasBau });

      // Atualizar cache global
      if (!global.guildConfig.has(interaction.guild.id)) {
        global.guildConfig.set(interaction.guild.id, {});
      }
      const config = global.guildConfig.get(interaction.guild.id);
      config.taxasBau = taxasBau;
      global.guildConfig.set(interaction.guild.id, config);

      const embed = new EmbedBuilder()
        .setTitle('✅ TAXAS DE BAÚ ATUALIZADAS')
        .setDescription(
          `**Royal:** \`${royal}%\`\n` +
          `**Black:** \`${black}%\`\n` +
          `**Brecilien:** \`${brecilien}%\`\n` +
          `**Avalon:** \`${avalon}%\``
        )
        .setColor(0x2ECC71)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

      console.log(`[ConfigActions] Bau taxes updated for guild ${interaction.guild.id}`);

    } catch (error) {
      console.error(`[ConfigActions] Error processing taxa bau:`, error);
      await interaction.reply({
        content: '❌ Erro ao atualizar taxas de baú.',
        ephemeral: true
      });
    }
  }

  // Handler para taxa de empréstimo
  static async handleTaxaEmprestimo(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      // Buscar do banco de dados
      const dbConfig = await Database.getGuildConfig(interaction.guild.id);
      const taxaAtual = dbConfig.taxaEmprestimo || 5;

      const modal = new ModalBuilder()
        .setCustomId('modal_taxa_emprestimo')
        .setTitle('💳 Configurar Taxa de Empréstimo');

      const taxaInput = new TextInputBuilder()
        .setCustomId('valor_taxa_emprestimo')
        .setLabel('Taxa de juros do empréstimo (%)')
        .setPlaceholder(`Atual: ${taxaAtual}%`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

      modal.addComponents(new ActionRowBuilder().addComponents(taxaInput));
      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[ConfigActions] Error handling taxa emprestimo:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir configuração de taxa de empréstimo.',
        ephemeral: true
      });
    }
  }

  static async processTaxaEmprestimo(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const taxa = parseInt(interaction.fields.getTextInputValue('valor_taxa_emprestimo'));

      if (isNaN(taxa) || taxa < 0 || taxa > 100) {
        return interaction.reply({
          content: '❌ Taxa inválida! Digite um valor entre 0 e 100.',
          ephemeral: true
        });
      }

      // Salvar no banco de dados
      await Database.updateGuildConfig(interaction.guild.id, { taxaEmprestimo: taxa });

      // Atualizar cache global
      if (!global.guildConfig.has(interaction.guild.id)) {
        global.guildConfig.set(interaction.guild.id, {});
      }
      const config = global.guildConfig.get(interaction.guild.id);
      config.taxaEmprestimo = taxa;
      global.guildConfig.set(interaction.guild.id, config);

      await interaction.reply({
        content: `✅ Taxa de empréstimo atualizada para \`${taxa}%\`!`,
        ephemeral: true
      });

      console.log(`[ConfigActions] Loan tax updated to ${taxa}% for guild ${interaction.guild.id}`);

    } catch (error) {
      console.error(`[ConfigActions] Error processing taxa emprestimo:`, error);
      await interaction.reply({
        content: '❌ Erro ao atualizar taxa de empréstimo.',
        ephemeral: true
      });
    }
  }

  static async handleRegistrarGuilda(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      // Buscar config atual do banco para preencher placeholders
      const dbConfig = await Database.getGuildConfig(interaction.guild.id);
      const guildaAtual = dbConfig.guildaRegistrada;

      const modal = new ModalBuilder()
        .setCustomId('modal_registrar_guilda')
        .setTitle('🏰 Registrar Guilda');

      const nomeInput = new TextInputBuilder()
        .setCustomId('nome_guilda')
        .setLabel('Nome da Guilda (exatamente como no Albion)')
        .setPlaceholder(guildaAtual?.nome || 'Ex: NOTAG')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const serverInput = new TextInputBuilder()
        .setCustomId('server_guilda')
        .setLabel('Servidor (americas, europe ou asia)')
        .setPlaceholder(guildaAtual?.server || 'Ex: europe')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(20);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nomeInput),
        new ActionRowBuilder().addComponents(serverInput)
      );

      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[ConfigActions] Error handling registrar guilda:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir registro de guilda.',
        ephemeral: true
      });
    }
  }

  static async processGuildRegistration(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const nome = interaction.fields.getTextInputValue('nome_guilda').trim();
      const server = interaction.fields.getTextInputValue('server_guilda').trim();

      if (!nome || !server) {
        return interaction.reply({
          content: '❌ Nome e servidor são obrigatórios!',
          ephemeral: true
        });
      }

      // Validar servidor
      const servidoresValidos = ['americas', 'europe', 'asia'];
      const serverLower = server.toLowerCase();
      if (!servidoresValidos.includes(serverLower)) {
        return interaction.reply({
          content: '❌ Servidor inválido! Use: americas, europe ou asia',
          ephemeral: true
        });
      }

      // 🔍 VERIFICAR SE A GUILDA EXISTE NA API DO ALBION
      console.log(`[ConfigActions] Verificando guilda "${nome}" no servidor ${serverLower}...`);

      await interaction.deferReply({ ephemeral: true });

      const guildInfo = await this.searchGuildInAPI(nome, serverLower);

      if (!guildInfo.found) {
        return interaction.editReply({
          content: `❌ **Guilda não encontrada!**\n\n` +
                   `Não foi possível encontrar a guilda "**${nome}**" no servidor **${serverLower}**.\n\n` +
                   `**Verifique:**\n` +
                   `• O nome da guilda está escrito corretamente (exatamente como no jogo)\n` +
                   `• O servidor está correto\n` +
                   `• A guilda existe e é pública no Albion\n\n` +
                   `Tente novamente com o nome exato da guilda.`,
        });
      }

      // Se encontrou mas com nome diferente (case insensitive match)
      const guildNameToSave = guildInfo.exactName || nome;

      const guildaData = {
        nome: guildNameToSave,
        server: serverLower,
        dataRegistro: Date.now(),
        albionGuildId: guildInfo.guildId || null,
        verified: true
      };

      // Salvar no banco de dados
      await Database.updateGuildConfig(interaction.guild.id, {
        guildaRegistrada: guildaData
      });

      // Atualizar cache global
      if (!global.guildConfig.has(interaction.guild.id)) {
        global.guildConfig.set(interaction.guild.id, {});
      }
      const config = global.guildConfig.get(interaction.guild.id);
      config.guildaRegistrada = guildaData;
      global.guildConfig.set(interaction.guild.id, config);

      const embed = new EmbedBuilder()
        .setTitle('✅ GUILDA REGISTRADA COM SUCESSO')
        .setDescription(
          `**Nome:** ${guildNameToSave}\n` +
          `**Servidor:** ${serverLower}\n` +
          `**ID Albion:** ${guildInfo.guildId || 'N/A'}\n` +
          `**Registrado em:** ${new Date().toLocaleDateString('pt-BR')}\n\n` +
          `✅ A guilda foi verificada na API do Albion e salva no banco de dados!`
        )
        .setColor(0x2ECC71)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

      console.log(`[ConfigActions] Guild registered and verified: ${guildNameToSave} on ${serverLower}`);

    } catch (error) {
      console.error(`[ConfigActions] Error registering guild:`, error);

      // Se já deferiu, usa editReply, senão usa reply
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ Erro ao registrar guilda. Tente novamente mais tarde.'
        });
      } else {
        await interaction.reply({
          content: '❌ Erro ao registrar guilda.',
          ephemeral: true
        });
      }
    }
  }

  /**
   * Busca uma guilda na API do Albion Online
   * @param {string} guildName - Nome da guilda
   * @param {string} server - Servidor (americas, europe, asia)
   * @returns {Object} - {found: boolean, exactName: string, guildId: string}
   */
  static async searchGuildInAPI(guildName, server) {
    try {
      const https = require('https');

      // Mapear servidor para o formato da API
      const serverMap = {
        'americas': 'gameinfo.albiononline.com',
        'europe': 'gameinfo.albiononline.com',
        'asia': 'gameinfo.albiononline.com'
      };

      const baseUrl = serverMap[server] || 'gameinfo.albiononline.com';
      const encodedName = encodeURIComponent(guildName);

      console.log(`[AlbionAPI] Searching guild: "${guildName}" on ${server}`);

      return new Promise((resolve) => {
        const options = {
          hostname: baseUrl,
          path: `/api/gameinfo/search?q=${encodedName}`,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (!data || data.trim() === '') {
                console.log('[AlbionAPI] Empty response');
                resolve({ found: false });
                return;
              }

              const jsonData = JSON.parse(data);
              const guilds = jsonData.guilds || [];

              console.log(`[AlbionAPI] Found ${guilds.length} guilds`);

              if (guilds.length === 0) {
                resolve({ found: false });
                return;
              }

              // Buscar match exato (case insensitive)
              const exactMatch = guilds.find(g => 
                g.Name && g.Name.toLowerCase() === guildName.toLowerCase()
              );

              if (exactMatch) {
                console.log(`[AlbionAPI] Exact match found: ${exactMatch.Name}`);
                resolve({
                  found: true,
                  exactName: exactMatch.Name,
                  guildId: exactMatch.Id
                });
                return;
              }

              // Se não achou exato, verifica se algum resultado é muito similar
              const similarMatch = guilds.find(g => 
                g.Name && (
                  g.Name.toLowerCase().includes(guildName.toLowerCase()) ||
                  guildName.toLowerCase().includes(g.Name.toLowerCase())
                )
              );

              if (similarMatch) {
                console.log(`[AlbionAPI] Similar match found: ${similarMatch.Name}`);
                resolve({
                  found: true,
                  exactName: similarMatch.Name,
                  guildId: similarMatch.Id
                });
                return;
              }

              // Se não achou nada similar, retorna o primeiro (pode ser uma busca parcial)
              console.log(`[AlbionAPI] Using first result: ${guilds[0].Name}`);
              resolve({
                found: true,
                exactName: guilds[0].Name,
                guildId: guilds[0].Id
              });

            } catch (error) {
              console.error('[AlbionAPI] Error parsing response:', error);
              resolve({ found: false });
            }
          });
        });

        req.on('error', (error) => {
          console.error('[AlbionAPI] Request error:', error);
          resolve({ found: false });
        });

        req.on('timeout', () => {
          console.error('[AlbionAPI] Request timeout');
          req.destroy();
          resolve({ found: false });
        });

        req.end();
      });

    } catch (error) {
      console.error('[ConfigActions] Error in searchGuildInAPI:', error);
      return { found: false };
    }
  }

  static async handleXP(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      // Buscar do banco de dados
      const dbConfig = await Database.getGuildConfig(interaction.guild.id);
      const novoStatus = !dbConfig.xpAtivo;

      // Salvar no banco
      await Database.updateGuildConfig(interaction.guild.id, {
        xpAtivo: novoStatus
      });

      // Atualizar cache global
      if (!global.guildConfig.has(interaction.guild.id)) {
        global.guildConfig.set(interaction.guild.id, {});
      }
      const config = global.guildConfig.get(interaction.guild.id);
      config.xpAtivo = novoStatus;
      global.guildConfig.set(interaction.guild.id, config);

      const status = novoStatus ? '✅ ATIVADO' : '🔴 DESATIVADO';

      await interaction.reply({
        content: `Sistema XP ${status}!`,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[ConfigActions] Error handling XP:`, error);
      await interaction.reply({
        content: '❌ Erro ao alterar configuração de XP.',
        ephemeral: true
      });
    }
  }

  static async handleAtualizarBot(interaction) {
    try {
      if (!(await this.checkADM(interaction))) return;

      const SetupManager = require('./setupManager');
      const setup = new SetupManager(interaction.guild, interaction);

      await interaction.deferReply({ ephemeral: true });

      const result = await setup.update();

      const embed = new EmbedBuilder()
        .setTitle('🔄 ATUALIZAÇÃO CONCLUÍDA')
        .setDescription(result.message)
        .setColor(0x2ECC71)
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error(`[ConfigActions] Error updating bot:`, error);
      await interaction.reply({
        content: '❌ Erro ao atualizar bot.',
        ephemeral: true
      });
    }
  }
}

module.exports = ConfigActions;