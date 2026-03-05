const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const SetupManager = require('../handlers/setupManager');

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
  }
};