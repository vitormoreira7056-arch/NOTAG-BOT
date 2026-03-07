const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const ConfigPanel = require('./configPanel');
const SetupManager = require('./setupManager');
const AlbionAPI = require('./albionApi');

class ConfigActions {
  // Verificar se é ADM
  static isAdmin(member) {
    return member.roles.cache.some(r => r.name === 'ADM') || 
           member.permissions.has(PermissionFlagsBits.Administrator);
  }

  // Mostrar select de taxa
  static async handleTaxaGuilda(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs podem alterar configurações!',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: '💰 Selecione a taxa da guilda para eventos e divisões:',
      components: [ConfigPanel.createTaxaSelectMenu()],
      ephemeral: true
    });
  }

  // Processar seleção de taxa
  static async handleTaxaSelect(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs podem alterar configurações!',
        ephemeral: true
      });
    }

    const taxa = parseInt(interaction.values[0]);

    // Inicializar config se não existir
    if (!global.guildConfig) global.guildConfig = new Map();

    const config = global.guildConfig.get(interaction.guild.id) || {};
    config.taxaGuilda = taxa;
    global.guildConfig.set(interaction.guild.id, config);

    await interaction.update({
      content: `✅ Taxa da guilda alterada para **${taxa}%**!`,
      components: [],
      embeds: []
    });

    // Atualizar painel principal
    await this.refreshMainPanel(interaction);
  }

  // Abrir modal de registro de guilda
  static async handleRegistrarGuilda(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs podem alterar configurações!',
        ephemeral: true
      });
    }

    const modal = ConfigPanel.createGuildRegistrationModal();
    await interaction.showModal(modal);
  }

  // Processar registro de guilda
  static async processGuildRegistration(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const nome = interaction.fields.getTextInputValue('guilda_nome').trim();
      const server = interaction.fields.getTextInputValue('guilda_server').trim().toLowerCase();

      // Validar servidor
      const servidoresValidos = ['americas', 'europe', 'asia'];
      if (!servidoresValidos.includes(server)) {
        return await interaction.editReply({
          content: '❌ Servidor inválido! Use: americas, europe ou asia.'
        });
      }

      await interaction.editReply({
        content: '⏳ Verificando guilda na API do Albion...'
      });

      // Buscar guilda na API
      const guildaInfo = await this.buscarGuildaAPI(nome, server);

      if (!guildaInfo) {
        return await interaction.editReply({
          content: `❌ Guilda "${nome}" não encontrada no servidor ${server}!\n\nVerifique se:\n• O nome está escrito corretamente (case sensitive)\n• A guilda existe no servidor selecionado\n• A guilda está ativa no Albion`
        });
      }

      // Salvar configuração
      if (!global.guildConfig) global.guildConfig = new Map();

      const config = global.guildConfig.get(interaction.guild.id) || {};
      config.guildaRegistrada = {
        nome: guildaInfo.name,
        id: guildaInfo.id,
        server: server,
        alliance: guildaInfo.allianceName || null,
        registradoPor: interaction.user.id,
        dataRegistro: Date.now()
      };
      global.guildConfig.set(interaction.guild.id, config);

      await interaction.editReply({
        content: `✅ **Guilda registrada com sucesso!**\n\n🏰 **Nome:** ${guildaInfo.name}\n🌍 **Servidor:** ${server}\n👥 **Membros:** ${guildaInfo.memberCount || 'N/A'}\n${guildaInfo.allianceName ? `🤝 **Aliança:** ${guildaInfo.allianceName}` : ''}\n\nAgora o sistema de registro irá verificar automaticamente se os jogadores pertencem a esta guilda.`
      });

      // Atualizar painel
      await this.refreshMainPanel(interaction);

    } catch (error) {
      console.error('Erro ao registrar guilda:', error);
      await interaction.editReply({
        content: '❌ Erro ao registrar guilda. Tente novamente mais tarde.'
      });
    }
  }

  // Buscar guilda na API
  static async buscarGuildaAPI(nome, server) {
    try {
      const https = require('https');

      return new Promise((resolve, reject) => {
        const encodedName = encodeURIComponent(nome);
        const options = {
          hostname: 'gameinfo.albiononline.com',
          path: `/api/gameinfo/search?q=${encodedName}`,
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 15000
        };

        const req = https.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const guilds = json.guilds || [];

              // Procurar guilda exata (case insensitive)
              const match = guilds.find(g => 
                g.Name && g.Name.toLowerCase() === nome.toLowerCase()
              );

              if (match) {
                resolve({
                  id: match.Id,
                  name: match.Name,
                  allianceName: match.AllianceName,
                  memberCount: match.MemberCount
                });
              } else {
                resolve(null);
              }
            } catch (e) {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      });

    } catch (error) {
      return null;
    }
  }

  // Atualizar bot (reinstala estrutura e recria painéis)
  static async handleAtualizarBot(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs podem usar esta função!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const setup = new SetupManager(interaction.guild, interaction);

      // Atualizar estrutura (canais/cargos)
      const result = await setup.update();

      // Recriar painéis se necessário
      await this.recreatePanels(interaction.guild);

      const embed = new EmbedBuilder()
        .setTitle('🔄 **BOT ATUALIZADO**')
        .setDescription('Todas as configurações foram atualizadas!')
        .setColor(0x2ECC71)
        .addFields(
          { name: '🆕 Canais Criados', value: `${result.createdChannels.length}`, inline: true },
          { name: '📁 Categorias', value: `${result.createdCategories.length}`, inline: true },
          { name: '🎭 Cargos', value: `${result.rolesChecked.length}`, inline: true },
          { name: '📋 Painéis', value: '✅ Verificados e recriados se necessário', inline: false }
        );

      await interaction.editReply({
        embeds: [embed]
      });

    } catch (error) {
      console.error('Erro ao atualizar bot:', error);
      await interaction.editReply({
        content: `❌ Erro ao atualizar: ${error.message}`
      });
    }
  }

  // Recriar painéis perdidos
  static async recreatePanels(guild) {
    // Painel de Configurações
    const canalConfig = guild.channels.cache.find(c => c.name === '🔧╠configurações');
    if (canalConfig) {
      // Verificar se já existe painel do bot
      const messages = await canalConfig.messages.fetch({ limit: 50 });
      const painelConfig = messages.find(m => 
        m.author.bot && 
        m.embeds.length > 0 && 
        m.embeds[0].title?.includes('CONFIGURAÇÕES')
      );

      if (!painelConfig) {
        await ConfigPanel.sendPanel(canalConfig);
      } else {
        await ConfigPanel.updatePanel(painelConfig);
      }
    }

    // Painel de Registro
    const canalRegistrar = guild.channels.cache.find(c => c.name === '📋╠registrar');
    if (canalRegistrar) {
      const messages = await canalRegistrar.messages.fetch({ limit: 50 });
      const painelRegistro = messages.find(m => 
        m.author.bot && 
        m.embeds.length > 0 && 
        m.embeds[0].title?.includes('Bem-vindo')
      );

      if (!painelRegistro) {
        const RegistrationPanel = require('./registrationPanel');
        await RegistrationPanel.sendPanel(canalRegistrar);
      }
    }
  }

  // Atualizar painel principal
  static async refreshMainPanel(interaction) {
    try {
      const canal = interaction.guild.channels.cache.find(c => c.name === '🔧╠configurações');
      if (!canal) return;

      const messages = await canal.messages.fetch({ limit: 50 });
      const painel = messages.find(m => 
        m.author.bot && 
        m.embeds.length > 0 && 
        m.embeds[0].title?.includes('CONFIGURAÇÕES')
      );

      if (painel) {
        await ConfigPanel.updatePanel(painel);
      }
    } catch (error) {
      console.error('Erro ao atualizar painel:', error);
    }
  }

  // Handlers para opções inativas (mostram aviso)
  static async handleXP(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs!',
        ephemeral: true
      });
    }
    await interaction.reply({
      content: '🔴 **Sistema XP**\n\nEsta função está desativada no momento.\nFicará disponível em uma futura atualização.',
      ephemeral: true
    });
  }

  static async handleTaxaBau(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs!',
        ephemeral: true
      });
    }
    await interaction.reply({
      content: '🔴 **Taxa de Venda de Baú**\n\nEsta função está desativada no momento.\nFicará disponível em uma futura atualização.',
      ephemeral: true
    });
  }

  static async handleTaxaEmprestimo(interaction) {
    if (!this.isAdmin(interaction.member)) {
      return interaction.reply({
        content: '❌ Apenas ADMs!',
        ephemeral: true
      });
    }
    await interaction.reply({
      content: '🔴 **Taxa de Empréstimo**\n\nEsta função está desativada no momento.\nFicará disponível em uma futura atualização.',
      ephemeral: true
    });
  }
}

module.exports = ConfigActions;