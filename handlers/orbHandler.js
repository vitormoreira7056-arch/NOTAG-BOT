const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 StringSelectMenuBuilder,
 StringSelectMenuOptionBuilder,
 ModalBuilder,
 TextInputBuilder,
 TextInputStyle,
 UserSelectMenuBuilder
} = require('discord.js');
const XpHandler = require('./xpHandler');

class OrbHandler {
 static async sendOrbPanel(channel) {
   const embed = new EmbedBuilder()
     .setTitle('🔮 DEPÓSITO DE ORBS')
     .setDescription(
       '**Deposite orbs para ganhar XP!**\n\n' +
       '🟢 **Orb Verde:** 40 XP\n' +
       '🔵 **Orb Azul:** 90 XP\n' +
       '🟣 **Orb Roxa:** 200 XP\n' +
       '🟡 **Orb Dourada:** 500 XP\n\n' +
       '📸 **Anexe um print** comprovando a orb!'
     )
     .setColor(0x9B59B6)
     .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
     .setFooter({ text: 'Sistema de Orbs • NOTAG Bot' })
     .setTimestamp();

   const botao = new ActionRowBuilder()
     .addComponents(
       new ButtonBuilder()
         .setCustomId('btn_depositar_orb')
         .setLabel('🔮 Depositar Orb')
         .setStyle(ButtonStyle.Success)
     );

   await channel.send({ embeds: [embed], components: [botao] });
 }

 static async showUserSelect(interaction) {
   // Menu para selecionar múltiplos usuários
   const row = new ActionRowBuilder()
     .addComponents(
       new UserSelectMenuBuilder()
         .setCustomId('select_orb_users')
         .setPlaceholder('👥 Selecione os jogadores')
         .setMinValues(1)
         .setMaxValues(25) // Máximo do Discord
     );

   await interaction.reply({
     content: '👥 **Selecione os jogadores que participaram da orb:**',
     components: [row],
     ephemeral: true
   });
 }

 static async showOrbTypeSelect(interaction) {
   const row = new ActionRowBuilder()
     .addComponents(
       new StringSelectMenuBuilder()
         .setCustomId('select_orb_type')
         .setPlaceholder('🔮 Selecione o tipo de Orb')
         .addOptions(
           new StringSelectMenuOptionBuilder()
             .setLabel('Orb Verde')
             .setValue('green')
             .setDescription('40 XP')
             .setEmoji('🟢'),
           new StringSelectMenuOptionBuilder()
             .setLabel('Orb Azul')
             .setValue('blue')
             .setDescription('90 XP')
             .setEmoji('🔵'),
           new StringSelectMenuOptionBuilder()
             .setLabel('Orb Roxa')
             .setValue('purple')
             .setDescription('200 XP')
             .setEmoji('🟣'),
           new StringSelectMenuOptionBuilder()
             .setLabel('Orb Dourada')
             .setValue('gold')
             .setDescription('500 XP')
             .setEmoji('🟡')
         )
     );

   await interaction.reply({
     content: '🔮 **Selecione o tipo de Orb:**',
     components: [row],
     ephemeral: true
   });
 }

 static async createOrbModal(interaction, users, orbType) {
   const modal = new ModalBuilder()
     .setCustomId(`modal_depositar_orb_${orbType}_${users.join(',')}`)
     .setTitle('🔮 Depositar Orb');

   const printInput = new TextInputBuilder()
     .setCustomId('link_print')
     .setLabel('📸 Link da print (Imgur, etc)')
     .setPlaceholder('https://i.imgur.com/exemplo.jpg')
     .setStyle(TextInputStyle.Short)
     .setRequired(true)
     .setMaxLength(500);

   const obsInput = new TextInputBuilder()
     .setCustomId('observacao')
     .setLabel('Observação (opcional)')
     .setPlaceholder('Detalhes adicionais...')
     .setStyle(TextInputStyle.Paragraph)
     .setRequired(false)
     .setMaxLength(500);

   modal.addComponents(
     new ActionRowBuilder().addComponents(printInput),
     new ActionRowBuilder().addComponents(obsInput)
   );

   await interaction.showModal(modal);
 }

 static async processOrbDeposit(interaction, orbType, userIds) {
   try {
     const linkPrint = interaction.fields.getTextInputValue('link_print');
     const observacao = interaction.fields.getTextInputValue('observacao') || 'Sem observação';

     const xpValues = {
       'green': 40,
       'blue': 90,
       'purple': 200,
       'gold': 500
     };

     const orbEmojis = {
       'green': '🟢',
       'blue': '🔵',
       'purple': '🟣',
       'gold': '🟡'
     };

     const xpAmount = xpValues[orbType];

     const depositId = `orb_${Date.now()}`;
     const depositData = {
       id: depositId,
       users: userIds,
       orbType: orbType,
       xpAmount: xpAmount,
       print: linkPrint,
       observacao: observacao,
       depositorId: interaction.user.id,
       status: 'pendente',
       timestamp: Date.now()
     };

     if (!global.pendingOrbDeposits) global.pendingOrbDeposits = new Map();
     global.pendingOrbDeposits.set(depositId, depositData);

     // Enviar para financeiro
     const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');
     if (canalFinanceiro) {
       const userMentions = userIds.map(id => `<@${id}>`).join(', ');

       const embed = new EmbedBuilder()
         .setTitle('🔮 DEPÓSITO DE ORB PENDENTE')
         .setDescription(
           `**Depositor:** <@${interaction.user.id}>\n` +
           `**Jogadores:** ${userMentions}\n` +
           `**Tipo:** ${orbEmojis[orbType]} Orb ${orbType.charAt(0).toUpperCase() + orbType.slice(1)}\n` +
           `**XP Total:** \`${xpAmount * userIds.length}\`\n` +
           `**Observação:** ${observacao}`
         )
         .setColor(0x9B59B6)
         .setImage(linkPrint)
         .setTimestamp();

       const botoes = new ActionRowBuilder()
         .addComponents(
           new ButtonBuilder()
             .setCustomId(`orb_approve_${depositId}`)
             .setLabel('✅ Aprovar')
             .setStyle(ButtonStyle.Success),
           new ButtonBuilder()
             .setCustomId(`orb_reject_${depositId}`)
             .setLabel('❌ Recusar')
             .setStyle(ButtonStyle.Danger)
         );

       await canalFinanceiro.send({
         content: `🔔 <@&${interaction.guild.roles.cache.find(r => r.name === 'ADM')?.id}> Novo depósito de orb!`,
         embeds: [embed],
         components: [botoes]
       });
     }

     await interaction.reply({
       content: `✅ Depósito de orb enviado para aprovação! ${userIds.length} jogadores receberão ${xpAmount} XP cada.`,
       ephemeral: true
     });

   } catch (error) {
     console.error(`[OrbHandler] Error processing orb deposit:`, error);
     await interaction.reply({
       content: '❌ Erro ao processar depósito de orb.',
       ephemeral: true
     });
   }
 }

 static async approveOrb(interaction, depositId) {
   try {
     const deposit = global.pendingOrbDeposits?.get(depositId);
     if (!deposit) {
       return interaction.reply({
         content: '❌ Depósito não encontrado!',
         ephemeral: true
       });
     }

     const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
     const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

     if (!isADM && !isStaff) {
       return interaction.reply({
         content: '❌ Apenas ADM ou Staff podem aprovar!',
         ephemeral: true
       });
     }

     const canalLogXp = interaction.guild.channels.cache.find(c => c.name === '📜╠log-xp');

     // Distribuir XP para todos os usuários
     for (const userId of deposit.users) {
       await XpHandler.addXp(
         userId,
         deposit.xpAmount,
         `Depósito de Orb ${deposit.orbType}`,
         interaction.guild,
         canalLogXp
       );
     }

     deposit.status = 'aprovado';
     deposit.aprovadoPor = interaction.user.id;

     await interaction.update({
       content: `✅ Orb aprovado! ${deposit.users.length} jogadores receberam ${deposit.xpAmount} XP.`,
       components: []
     });

   } catch (error) {
     console.error(`[OrbHandler] Error approving orb:`, error);
     await interaction.reply({
       content: '❌ Erro ao aprovar orb.',
       ephemeral: true
     });
   }
 }

 static async rejectOrb(interaction, depositId) {
   try {
     const deposit = global.pendingOrbDeposits?.get(depositId);
     if (!deposit) {
       return interaction.reply({
         content: '❌ Depósito não encontrado!',
         ephemeral: true
       });
     }

     const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
     const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

     if (!isADM && !isStaff) {
       return interaction.reply({
         content: '❌ Apenas ADM ou Staff podem recusar!',
         ephemeral: true
       });
     }

     deposit.status = 'recusado';
     deposit.recusadoPor = interaction.user.id;

     await interaction.update({
       content: `❌ Orb recusado por ${interaction.user.tag}`,
       components: []
     });

   } catch (error) {
     console.error(`[OrbHandler] Error rejecting orb:`, error);
     await interaction.reply({
       content: '❌ Erro ao recusar orb.',
       ephemeral: true
     });
   }
 }
}

module.exports = OrbHandler;