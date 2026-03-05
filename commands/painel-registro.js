const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const RegistrationPanel = require('../handlers/registrationPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('painel-registro')
    .setDescription('Envia o painel de registro no canal atual (só ADM)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    // Verificar se é canal correto
    if (!interaction.channel.name.includes('registrar')) {
      return interaction.reply({
        content: '❌ Este comando só pode ser usado no canal 📋╠registrar!',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await RegistrationPanel.sendPanel(interaction.channel);
      await interaction.editReply({
        content: '✅ Painel de registro enviado com sucesso!'
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply({
        content: '❌ Erro ao enviar painel.'
      });
    }
  }
};