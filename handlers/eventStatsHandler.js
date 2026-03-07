const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler de Estatísticas de Eventos
 */

class EventStatsHandler {
  /**
   * Cria e envia o painel de estatísticas
   * @param {TextChannel} channel - Canal onde enviar
   * @param {Guild} guild - Objeto da guilda
   */
  static async createAndSendPanel(channel, guild) {
    try {
      // Verificações de segurança
      if (!channel || !guild) {
        console.error('[EventStats] Channel or guild is undefined');
        return;
      }

      if (!channel.isTextBased()) {
        console.error('[EventStats] Channel is not text-based');
        return;
      }

      // Obtém membro do bot
      let botMember;
      try {
        botMember = await guild.members.fetch(channel.client.user.id);
      } catch (e) {
        botMember = guild.members.me;
      }

      if (!botMember) {
        console.error('[EventStats] Bot member not found');
        return;
      }

      // Verifica permissões
      let permissions;
      try {
        permissions = channel.permissionsFor(botMember);
      } catch (e) {
        console.error('[EventStats] Error getting permissions:', e.message);
        return;
      }

      if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
        console.error(`[EventStats] Missing SendMessages permission`);
        return;
      }

      const embed = await this.createStatsEmbed(guild);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_atualizar_stats_eventos')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_periodo_eventos')
          .setLabel('📊 Período')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true) // Placeholder
      );

      await channel.send({ embeds: [embed], components: [row] });
      console.log(`[EventStats] Panel sent to ${channel.name}`);

    } catch (error) {
      console.error('[EventStats] Error creating panel:', error);
    }
  }

  /**
   * Cria o embed de estatísticas
   * @param {Guild} guild - Objeto da guilda
   */
  static async createStatsEmbed(guild) {
    try {
      let totalEvents = 0;
      let completedEvents = 0;
      let totalLoot = 0;
      let recentEventsList = [];

      try {
        if (Database && Database.getEventHistory) {
          const events = await Database.getEventHistory(guild.id, 10);
          totalEvents = events.length;
          completedEvents = events.filter(e => e.status === 'encerrado' || e.ended_at != null).length;
          totalLoot = events.reduce((acc, e) => acc + (e.valor_total || 0), 0);

          // Lista últimos 5 eventos
          recentEventsList = events.slice(0, 5).map(e => {
            const status = e.ended_at ? '✅' : '⏳';
            const date = e.created_at ? new Date(e.created_at).toLocaleDateString('pt-BR') : 'N/A';
            return `${status} ${e.nome || 'Evento'} - ${date}`;
          });
        } else {
          console.warn('[EventStats] Database not available');
        }
      } catch (dbError) {
        console.error('[EventStats] Database error:', dbError.message);
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas de Eventos')
        .setDescription(`**Resumo dos últimos eventos**`)
        .addFields(
          { name: '🎮 Total Eventos', value: `${totalEvents}`, inline: true },
          { name: '✅ Completados', value: `${completedEvents}`, inline: true },
          { name: '💰 Loot Total', value: `${totalLoot.toLocaleString()}`, inline: true }
        )
        .setColor(0x9B59B6)
        .setTimestamp();

      // Adiciona lista de eventos recentes se houver
      if (recentEventsList.length > 0) {
        embed.addFields({ 
          name: '📋 Eventos Recentes', 
          value: recentEventsList.join('\n') || 'Nenhum evento recente', 
          inline: false 
        });
      } else {
        embed.addFields({ 
          name: '📋 Eventos Recentes', 
          value: 'Nenhum evento registrado ainda', 
          inline: false 
        });
      }

      return embed;
    } catch (error) {
      console.error('[EventStats] Error creating embed:', error);
      return new EmbedBuilder()
        .setTitle('📊 Estatísticas de Eventos')
        .setDescription('Erro ao carregar estatísticas. Tente novamente mais tarde.')
        .setColor(0xE74C3C);
    }
  }

  /**
   * Handler para atualização manual
   * @param {ButtonInteraction} interaction - Interação do botão
   */
  static async handleAtualizar(interaction) {
    try {
      await interaction.deferUpdate();
      const embed = await this.createStatsEmbed(interaction.guild);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[EventStats] Update error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ 
          content: '❌ Erro ao atualizar estatísticas.', 
          ephemeral: true 
        });
      }
    }
  }

  /**
   * Handler para seleção de período (placeholder)
   * @param {SelectMenuInteraction} interaction - Interação do select menu
   */
  static async handlePeriodSelect(interaction) {
    try {
      await interaction.reply({ 
        content: '📊 Seleção de período em desenvolvimento.', 
        ephemeral: true 
      });
    } catch (error) {
      console.error('[EventStats] Period select error:', error);
    }
  }
}

module.exports = EventStatsHandler;