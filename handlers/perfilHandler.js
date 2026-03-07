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
const XpHandler = require('./xpHandler');

class PerfilHandler {
 static async sendPerfilPanel(channel) {
  const embed = new EmbedBuilder()
   .setTitle('👤 PERFIL DO JOGADOR')
   .setDescription(
    '**Gerencie seu perfil e progresso!**\n\n' +
    '📊 Veja suas estatísticas\n' +
    '🏅 Conquistas e condecorações\n' +
    '💎 Nível e XP\n\n' +
    'Use os botões abaixo para interagir:'
   )
   .setColor(0x3498DB)
   .setFooter({ text: 'Sistema de Perfil • NOTAG Bot' })
   .setTimestamp();

  const botoes = new ActionRowBuilder()
   .addComponents(
    new ButtonBuilder()
     .setCustomId('btn_criar_xp_event')
     .setLabel('🏆 Criar Evento XP')
     .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
     .setCustomId('btn_depositar_xp_manual')
     .setLabel('💎 Depositar XP')
     .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
     .setCustomId('btn_ver_perfil')
     .setLabel('👤 Meu Perfil')
     .setStyle(ButtonStyle.Secondary)
   );

  await channel.send({ embeds: [embed], components: [botoes] });
 }

 static async showDepositXpModal(interaction) {
  const row = new ActionRowBuilder()
   .addComponents(
    new UserSelectMenuBuilder()
     .setCustomId('select_xp_target_user')
     .setPlaceholder('👤 Selecione o jogador')
     .setMaxValues(1)
   );

  await interaction.reply({
   content: '👤 **Selecione o jogador para depositar XP:**',
   components: [row],
   ephemeral: true
  });
 }

 static async createManualXpModal(interaction, targetUserId) {
  const modal = new ModalBuilder()
   .setCustomId(`modal_depositar_xp_${targetUserId}`)
   .setTitle('💎 Depositar XP Manual');

  const quantidadeInput = new TextInputBuilder()
   .setCustomId('quantidade_xp')
   .setLabel('Quantidade de XP')
   .setPlaceholder('Ex: 1000')
   .setStyle(TextInputStyle.Short)
   .setRequired(true)
   .setMaxLength(10);

  const motivoInput = new TextInputBuilder()
   .setCustomId('motivo_xp')
   .setLabel('Motivo')
   .setPlaceholder('Ex: Recompensa por excelente desempenho')
   .setStyle(TextInputStyle.Paragraph)
   .setRequired(true)
   .setMaxLength(500);

  modal.addComponents(
   new ActionRowBuilder().addComponents(quantidadeInput),
   new ActionRowBuilder().addComponents(motivoInput)
  );

  await interaction.showModal(modal);
 }

 static async processManualXpDeposit(interaction, targetUserId) {
  try {
   const quantidade = parseInt(interaction.fields.getTextInputValue('quantidade_xp'));
   const motivo = interaction.fields.getTextInputValue('motivo_xp');

   if (isNaN(quantidade) || quantidade <= 0) {
    return interaction.reply({
     content: '❌ Quantidade inválida!',
     ephemeral: true
    });
   }

   const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
   const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

   if (!isADM && !isStaff) {
    return interaction.reply({
     content: '❌ Apenas ADM ou Staff podem depositar XP manualmente!',
     ephemeral: true
    });
   }

   const canalLogXp = interaction.guild.channels.cache.find(c => c.name === '📜╠log-xp');

   await XpHandler.addXp(
    targetUserId,
    quantidade,
    `Depósito Manual: ${motivo}`,
    interaction.guild,
    canalLogXp
   );

   await interaction.reply({
    content: `✅ \`${quantidade}\` XP depositados para <@${targetUserId}>!\n**Motivo:** ${motivo}`,
    ephemeral: true
   });

  } catch (error) {
   console.error(`[PerfilHandler] Error processing manual XP:`, error);
   await interaction.reply({
    content: '❌ Erro ao depositar XP.',
    ephemeral: true
   });
  }
 }

 static async showProfile(interaction) {
  try {
   const embed = await XpHandler.showProfile(interaction.user.id, interaction.guild);

   if (embed) {
    // Envia na DM em vez do canal
    try {
     await interaction.user.send({ embeds: [embed] });
     // Confirma no canal que foi enviado
     await interaction.reply({
      content: '✅ Seu perfil foi enviado no privado!',
      ephemeral: true
     });
    } catch (dmError) {
     // Se não conseguir enviar DM, envia no canal ephemeral
     console.error(`[PerfilHandler] Could not send DM:`, dmError);
     await interaction.reply({
      embeds: [embed],
      ephemeral: true
     });
    }
   } else {
    await interaction.reply({
     content: '❌ Erro ao carregar perfil.',
     ephemeral: true
    });
   }
  } catch (error) {
   console.error(`[PerfilHandler] Error showing profile:`, error);
   await interaction.reply({
    content: '❌ Erro ao mostrar perfil.',
    ephemeral: true
   });
  }
 }
}

module.exports = PerfilHandler;