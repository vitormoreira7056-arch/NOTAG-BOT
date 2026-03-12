const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler de Perfil - Versão Multi-Servidor
 * Gerencia XP, perfis e depósitos manuais de XP
 */
class PerfilHandler {

  // ==================== PAINEL DE PERFIL ====================

  static async sendPanel(channel) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🏆 ALBION ACADEMY')
        .setDescription(
          'Bem-vindo ao sistema de progressão da guilda!\n\n' +
          'Aqui você pode acompanhar seu nível, experiência e conquistas.\n\n' +
          '💡 **O XP é específico de cada servidor.**'
        )
        .setColor(0x9B59B6)
        .addFields(
          {
            name: '📊 Ver Perfil',
            value: 'Consulte seu nível, XP e insignias',
            inline: true
          },
          {
            name: '➕ Depositar XP (Staff)',
            value: 'Adicione XP manualmente aos jogadores',
            inline: true
          }
        )
        .setFooter({ text: 'Albion Academy • NOTAG Bot' })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('btn_ver_perfil')
            .setLabel('📊 Meu Perfil')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('btn_depositar_xp_manual')
            .setLabel('➕ Depositar XP')
            .setStyle(ButtonStyle.Success)
        );

      await channel.send({ embeds: [embed], components: [buttons] });
      console.log(`[PerfilHandler] Painel enviado em #${channel.name}`);

    } catch (error) {
      console.error('[PerfilHandler] Erro ao enviar painel:', error);
      throw error;
    }
  }

  // ==================== VER PERFIL ====================

  static async showProfile(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const user = await Database.getUser(guildId, userId);

      if (!user) {
        return interaction.reply({
          content: '❌ Perfil não encontrado! Participe de eventos para criar seu perfil.',
          ephemeral: true
        });
      }

      const level = user.level || 1;
      const xp = user.xp || 0;
      const totalXp = user.totalXp || 0;
      const insignias = user.insignias || [];
      const eventosParticipados = user.eventosParticipados || 0;
      const saldo = user.saldo || 0;

      // Calcular XP necessário para próximo nível
      const xpProximoNivel = level * 1000;
      const xpAtual = xp;
      const progresso = Math.min(100, Math.floor((xpAtual / xpProximoNivel) * 100));

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Perfil de ${interaction.user.username}`)
        .setDescription(
          `**Nível ${level}** ${this.getLevelEmoji(level)}\n` +
          `⭐ **XP:** ${xpAtual.toLocaleString()} / ${xpProximoNivel.toLocaleString()} (${progresso}%)\n` +
          `📊 **XP Total Acumulado:** ${totalXp.toLocaleString()}\n` +
          `💰 **Saldo:** ${saldo.toLocaleString()}\n` +
          `🎮 **Eventos Participados:** ${eventosParticipados}\n\n` +
          `${this.getProgressBar(progresso)}`
        )
        .setColor(this.getLevelColor(level))
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `${interaction.guild.name} • Albion Academy` })
        .setTimestamp();

      if (insignias.length > 0) {
        const insigniasTexto = insignias.map(i => `• ${i}`).join('\n');
        embed.addFields({
          name: '🎖️ Insignias',
          value: insigniasTexto,
          inline: false
        });
      }

      // Calcular ranking aproximado
      try {
        const todosUsuarios = await Database.getAllUsers(guildId);
        const ordenados = todosUsuarios.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
        const posicao = ordenados.findIndex(u => u.userId === userId) + 1;

        if (posicao > 0) {
          embed.addFields({
            name: '🏅 Ranking',
            value: `#${posicao} de ${todosUsuarios.length} jogadores`,
            inline: true
          });
        }
      } catch (e) {
        console.log('[Perfil] Erro ao calcular ranking:', e);
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao mostrar perfil:', error);
      await interaction.reply({
        content: '❌ Erro ao carregar perfil.',
        ephemeral: true
      });
    }
  }

  // ==================== DEPÓSITO MANUAL DE XP (STAFF) ====================

  static async showDepositXpModal(interaction) {
    try {
      const guildId = interaction.guild.id;

      // Verificar permissões
      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Apenas ADM ou Staff podem depositar XP manualmente!',
          ephemeral: true
        });
      }

      // Inicializar temp
      if (!global.xpDepositTemp) global.xpDepositTemp = new Map();

      global.xpDepositTemp.set(interaction.user.id, {
        guildId: guildId,
        users: [],
        step: 'selecting'
      });

      const embed = new EmbedBuilder()
        .setTitle('➕ DEPOSITAR XP MANUALMENTE')
        .setDescription(
          '**Como funciona:**\n\n' +
          '1️⃣ Selecione o(s) jogador(es) que receberão XP\n' +
          '2️⃣ Defina a quantidade de XP\n' +
          '3️⃣ Adicione um motivo opcional\n\n' +
          '💡 Você pode selecionar até 25 jogadores de uma vez!'
        )
        .setColor(0x9B59B6);

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('xp_select_users')
            .setLabel('👥 Selecionar Jogadores')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('xp_clear_users')
            .setLabel('🗑️ Limpar')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({
        embeds: [embed],
        components: [botoes],
        ephemeral: true
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao abrir depósito de XP:', error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário.',
        ephemeral: true
      });
    }
  }

  static async openUserSelection(interaction) {
    try {
      const row = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('select_xp_target_users')
            .setPlaceholder('🔍 Pesquise e selecione os jogadores...')
            .setMinValues(1)
            .setMaxValues(25)
        );

      await interaction.reply({
        content: '🔍 **Selecione os jogadores que receberão XP:**',
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao abrir seleção:', error);
    }
  }

  static async processUserSelection(interaction) {
    try {
      const guildId = interaction.guild.id;
      const selectedUsers = interaction.values;

      if (!global.xpDepositTemp) global.xpDepositTemp = new Map();

      const tempData = global.xpDepositTemp.get(interaction.user.id) || {
        guildId: guildId,
        users: [],
        step: 'selecting'
      };

      // Adicionar novos usuários (evitar duplicados)
      const existingUsers = new Set(tempData.users);
      selectedUsers.forEach(id => existingUsers.add(id));
      tempData.users = Array.from(existingUsers);

      // Verificar se é do mesmo servidor
      if (tempData.guildId && tempData.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Erro: Dados de outro servidor detectados.',
          ephemeral: true
        });
      }

      global.xpDepositTemp.set(interaction.user.id, tempData);

      const mentions = tempData.users.map(id => `<@${id}>`).join(', ');

      const embed = new EmbedBuilder()
        .setTitle('👥 JOGADORES SELECIONADOS')
        .setDescription(
          `✅ **${tempData.users.length} jogador(es) selecionado(s):**\n${mentions}\n\n` +
          'Clique em **"Prosseguir"** para definir o valor do XP.'
        )
        .setColor(0x9B59B6);

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('xp_proceed_to_modal')
            .setLabel('➡️ Prosseguir')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('xp_select_users')
            .setLabel('➕ Adicionar Mais')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('xp_clear_users')
            .setLabel('🗑️ Limpar')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.update({
        content: null,
        embeds: [embed],
        components: [botoes]
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao processar seleção:', error);
    }
  }

  static async clearUserSelection(interaction) {
    try {
      if (!global.xpDepositTemp) global.xpDepositTemp = new Map();

      const tempData = global.xpDepositTemp.get(interaction.user.id);
      if (tempData) {
        tempData.users = [];
        global.xpDepositTemp.set(interaction.user.id, tempData);
      }

      await interaction.update({
        content: '🗑️ **Seleção limpa!**',
        embeds: [],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('xp_select_users')
                .setLabel('👥 Selecionar Jogadores')
                .setStyle(ButtonStyle.Primary)
            )
        ]
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao limpar seleção:', error);
    }
  }

  static async createManualXpModal(interaction) {
    try {
      const tempData = global.xpDepositTemp?.get(interaction.user.id);

      if (!tempData || tempData.users.length === 0) {
        return interaction.reply({
          content: '❌ Nenhum jogador selecionado!',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_depositar_xp_multi')
        .setTitle(`XP para ${tempData.users.length} jogador(es)`);

      const xpInput = new TextInputBuilder()
        .setCustomId('valor_xp')
        .setLabel('Quantidade de XP')
        .setPlaceholder('Ex: 1000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_xp')
        .setLabel('Motivo (opcional)')
        .setPlaceholder('Ex: Participação em evento, ajuda na guilda, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder().addComponents(xpInput),
        new ActionRowBuilder().addComponents(motivoInput)
      );

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[PerfilHandler] Erro ao abrir modal:', error);
    }
  }

  static async processManualXpDeposit(interaction) {
    try {
      const guildId = interaction.guild.id;

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Sem permissão!',
          ephemeral: true
        });
      }

      const tempData = global.xpDepositTemp?.get(interaction.user.id);

      if (!tempData || tempData.users.length === 0) {
        return interaction.reply({
          content: '❌ Nenhum jogador selecionado!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (tempData.guildId && tempData.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Dados de outro servidor detectados!',
          ephemeral: true
        });
      }

      const xpInput = interaction.fields.getTextInputValue('valor_xp').trim();
      const motivo = interaction.fields.getTextInputValue('motivo_xp') || 'Depósito manual';
      const xp = parseInt(xpInput.replace(/\./g, '').replace(/,/g, ''));

      if (isNaN(xp) || xp <= 0) {
        return interaction.reply({
          content: '❌ Valor de XP inválido!',
          ephemeral: true
        });
      }

      const userIds = tempData.users;
      let sucessos = [];
      let falhas = [];

      for (const userId of userIds) {
        try {
          // Adicionar XP
          await this.addXp(guildId, userId, xp, motivo);
          sucessos.push(userId);

          // Notificar usuário
          try {
            const user = await interaction.client.users.fetch(userId);
            const embedDM = new EmbedBuilder()
              .setTitle('⭐ XP RECEBIDO!')
              .setDescription(
                `🎉 **Você recebeu XP!**\n\n` +
                `⭐ **Quantidade:** ${xp.toLocaleString()} XP\n` +
                `📝 **Motivo:** ${motivo}\n` +
                `👤 **Enviado por:** ${interaction.user.tag}\n` +
                `🏰 **Servidor:** ${interaction.guild.name}`
              )
              .setColor(0x9B59B6)
              .setTimestamp();

            await user.send({ embeds: [embedDM] });
          } catch (e) {
            console.log(`[Perfil] Não foi possível notificar ${userId}`);
          }

        } catch (e) {
          console.error(`[Perfil] Erro ao adicionar XP para ${userId}:`, e);
          falhas.push(userId);
        }
      }

      // Limpar temp
      global.xpDepositTemp.delete(interaction.user.id);

      // Resumo
      const embedResultado = new EmbedBuilder()
        .setTitle('✅ XP DEPOSITADO')
        .setDescription(
          `⭐ **XP por jogador:** ${xp.toLocaleString()}\n` +
          `👥 **Jogadores:** ${sucessos.length}/${userIds.length}\n` +
          `📝 **Motivo:** ${motivo}\n` +
          `🏰 **Servidor:** ${interaction.guild.name}`
        )
        .setColor(0x2ECC71)
        .setTimestamp();

      if (falhas.length > 0) {
        embedResultado.addFields({
          name: '⚠️ Falhas',
          value: `${falhas.length} jogador(es) não receberam o XP.`
        });
      }

      const mentions = sucessos.map(id => `<@${id}>`).join(', ');
      embedResultado.addFields({
        name: '✅ Jogadores',
        value: mentions || 'Nenhum'
      });

      await interaction.reply({
        embeds: [embedResultado],
        ephemeral: true
      });

    } catch (error) {
      console.error('[PerfilHandler] Erro ao processar XP:', error);
      await interaction.reply({
        content: '❌ Erro ao processar depósito de XP.',
        ephemeral: true
      });
    }
  }

  // ==================== FUNÇÕES AUXILIARES ====================

  static async addXp(guildId, userId, amount, reason = '') {
    try {
      const user = await Database.getUser(guildId, userId);

      const novoXp = (user.xp || 0) + amount;
      const novoTotalXp = (user.totalXp || 0) + amount;
      let novoNivel = user.level || 1;

      // Verificar level up
      const xpNecessario = novoNivel * 1000;
      if (novoXp >= xpNecessario) {
        novoNivel++;
        // Notificar level up seria aqui (via DM ou canal)
      }

      await Database.updateUser(guildId, userId, {
        xp: novoXp,
        total_xp: novoTotalXp,
        level: novoNivel
      });

      // Log de auditoria
      await Database.logAudit(guildId, 'XP_DEPOSITADO', userId, {
        quantidade: amount,
        motivo: reason,
        novoLevel: novoNivel
      });

      return { success: true, levelUp: novoNivel > (user.level || 1), newLevel: novoNivel };

    } catch (error) {
      console.error('[Perfil] Erro ao adicionar XP:', error);
      throw error;
    }
  }

  static getLevelEmoji(level) {
    if (level >= 50) return '👑';
    if (level >= 40) return '💎';
    if (level >= 30) return '🥇';
    if (level >= 20) return '🥈';
    if (level >= 10) return '🥉';
    return '🌱';
  }

  static getLevelColor(level) {
    if (level >= 50) return 0xFFD700; // Dourado
    if (level >= 40) return 0xE5E4E2; // Platina
    if (level >= 30) return 0xFFD700; // Ouro
    if (level >= 20) return 0xC0C0C0; // Prata
    if (level >= 10) return 0xCD7F32; // Bronze
    return 0x9B59B6; // Roxo (padrão)
  }

  static getProgressBar(percentual) {
    const totalBlocos = 20;
    const blocosPreenchidos = Math.floor((percentual / 100) * totalBlocos);
    const blocosVazios = totalBlocos - blocosPreenchidos;

    const preenchido = '█'.repeat(blocosPreenchidos);
    const vazio = '░'.repeat(blocosVazios);

    return `${preenchido}${vazio} ${percentual}%`;
  }
}

module.exports = PerfilHandler;