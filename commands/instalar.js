const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const SetupManager = require('../handlers/setupManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('instalar')
    .setDescription('Instala a estrutura completa do servidor (canais, cargos e permissões)')
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
      const result = await setup.install();

      const embedResumo = {
        color: 0x2ECC71,
        title: '🏗️ **INSTALAÇÃO CONCLUÍDA**',
        description: result.message,
        fields: [
          {
            name: '🆕 Canais Criados',
            value: result.createdChannels.length > 0 
              ? result.createdChannels.slice(0, 15).map(c => `• ${c}`).join('\n') +
                (result.createdChannels.length > 15 ? `\n... e mais ${result.createdChannels.length - 15}` : '')
              : 'Nenhum canal novo criado',
            inline: false
          },
          {
            name: '📁 Categorias Criadas',
            value: result.createdCategories.length > 0
              ? result.createdCategories.map(c => `• ${c}`).join('\n')
              : 'Nenhuma categoria nova',
            inline: true
          },
          {
            name: '🎭 Cargos Verificados',
            value: result.rolesChecked.length > 0
              ? result.rolesChecked.map(r => `• ${r}`).join('\n')
              : 'Nenhum cargo novo',
            inline: true
          }
        ],
        timestamp: new Date(),
        footer: {
          text: 'Sistema de Setup • Guild Bot'
        }
      };

      if (result.existingChannels.length > 0) {
        embedResumo.fields.push({
          name: '✅ Já Existentes (mantidos)',
          value: `${result.existingChannels.length} canais/categorias já existiam`,
          inline: false
        });
      }

      await interaction.editReply({
        content: null,
        embeds: [embedResumo]
      });

      console.log(`✅ Estrutura instalada por ${interaction.user.tag}`);

    } catch (error) {
      console.error('❌ Erro na instalação:', error);
      await interaction.editReply({
        content: `❌ **Erro na instalação:**\n\`\`\`${error.message}\`\`\``,
        embeds: []
      });
    }
  }
};