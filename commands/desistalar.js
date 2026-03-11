const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const SetupManager = require('../handlers/setupManager');
const KillboardHandler = require('../handlers/killboardHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('desistalar')
    .setDescription('Remove toda a estrutura criada pelo bot (canais e categorias)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM') ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isADM) {
      return interaction.reply({
        content: '❌ Apenas ADMs podem usar este comando!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const setup = new SetupManager(interaction.guild, interaction);
      const result = await setup.uninstall();

      // 🎯 NOVO: Remover Killboard (parar polling e deletar canais)
      try {
        await this.uninstallKillboard(interaction.guild, result);
      } catch (killboardError) {
        console.log('[Desistalar] Erro ao remover killboard:', killboardError.message);
        result.errors.push(`Killboard: ${killboardError.message}`);
      }

      const embedResumo = {
        color: result.success ? 0xE74C3C : 0xF39C12,
        title: result.success ? '🗑️ **DESINSTALAÇÃO CONCLUÍDA**' : '⚠️ **DESINSTALAÇÃO PARCIAL**',
        description: result.message,
        fields: [
          {
            name: '🗑️ Canais Deletados',
            value: result.deletedChannels.length > 0
              ? result.deletedChannels.slice(0, 15).map(c => `• ${c}`).join('\n') +
                (result.deletedChannels.length > 15 ? `\n... e mais ${result.deletedChannels.length - 15}` : '')
              : 'Nenhum canal deletado',
            inline: false
          },
          {
            name: '📁 Categorias Deletadas',
            value: result.deletedCategories.length > 0
              ? result.deletedCategories.map(c => `• ${c}`).join('\n')
              : 'Nenhuma categoria deletada',
            inline: true
          }
        ],
        timestamp: new Date(),
        footer: {
          text: 'Sistema de Setup • Guild Bot'
        }
      };

      if (result.errors.length > 0) {
        embedResumo.fields.push({
          name: '❌ Erros',
          value: result.errors.slice(0, 5).map(e => `• ${e}`).join('\n') +
            (result.errors.length > 5 ? `\n... e mais ${result.errors.length - 5} erros` : ''),
          inline: false
        });
      }

      await interaction.editReply({
        content: null,
        embeds: [embedResumo]
      });

      console.log(`🗑️ Estrutura removida por ${interaction.user.tag}`);

    } catch (error) {
      console.error('❌ Erro na desinstalação:', error);
      await interaction.editReply({
        content: `❌ **Erro na desinstalação:**\n\`\`\`${error.message}\`\`\``,
        embeds: []
      });
    }
  },

  /**
   * 🎯 NOVO: Remove a estrutura do Killboard
   */
  async uninstallKillboard(guild, result) {
    // Parar polling do killboard
    try {
      KillboardHandler.stopPolling(guild.id);
      console.log('[Desistalar] Polling do killboard parado');
    } catch (e) {
      console.log('[Desistalar] Erro ao parar polling:', e.message);
    }

    const channelsToDelete = [];
    const categoriesToDelete = [];

    // Buscar canais do killboard
    const killChannel = guild.channels.cache.find(c => 
      c.name === '💀-kill-feed' && c.type === ChannelType.GuildText
    );
    const deathChannel = guild.channels.cache.find(c => 
      c.name === '☠️-death-feed' && c.type === ChannelType.GuildText
    );

    if (killChannel) channelsToDelete.push(killChannel);
    if (deathChannel) channelsToDelete.push(deathChannel);

    // Deletar canais
    for (const channel of channelsToDelete) {
      try {
        await channel.delete(`Desinstalação solicitada por ADMIN`);
        result.deletedChannels.push(channel.name);
        console.log(`[Desistalar] Canal deletado: ${channel.name}`);
      } catch (error) {
        result.errors.push(`Não foi possível deletar #${channel.name}`);
        console.error(`[Desistalar] Erro ao deletar ${channel.name}:`, error);
      }
    }

    // Buscar e deletar categoria
    const killboardCategory = guild.channels.cache.find(c => 
      c.name === '💀 KILLBOARD' && c.type === ChannelType.GuildCategory
    );

    if (killboardCategory) {
      try {
        // Verificar se ainda há canais na categoria (mover para fora antes de deletar)
        const childChannels = guild.channels.cache.filter(c => c.parentId === killboardCategory.id);

        for (const [id, channel] of childChannels) {
          try {
            await channel.setParent(null, { reason: 'Removendo categoria KILLBOARD' });
          } catch (e) {
            console.log(`[Desistalar] Não foi possível mover canal ${channel.name} da categoria`);
          }
        }

        await killboardCategory.delete(`Desinstalação solicitada por ADMIN`);
        result.deletedCategories.push('💀 KILLBOARD');
        console.log('[Desistalar] Categoria KILLBOARD deletada');
      } catch (error) {
        result.errors.push('Não foi possível deletar a categoria 💀 KILLBOARD');
        console.error('[Desistalar] Erro ao deletar categoria:', error);
      }
    }

    // Limpar configurações do killboard
    try {
      if (global.guildConfig?.has(guild.id)) {
        const config = global.guildConfig.get(guild.id);
        if (config.killboard) {
          delete config.killboard;
          global.guildConfig.set(guild.id, config);
        }
      }
    } catch (e) {
      console.log('[Desistalar] Erro ao limpar config:', e.message);
    }

    return result;
  }
};