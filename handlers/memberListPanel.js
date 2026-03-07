const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');

/**
 * Handler do Painel de Lista de Membros
 */

class MemberListPanel {
 /**
  * Cria e envia o painel de lista de membros (Wrapper para compatibilidade)
  * @param {TextChannel} channel - Canal onde enviar
  * @param {Guild} guild - Objeto da guilda
  */
 static async sendPanel(channel, guild) {
  try {
   console.log(`[MemberListPanel] Wrapper sendPanel chamado, redirecionando para createAndSendPanel`);
   return await this.createAndSendPanel(channel, guild);
  } catch (error) {
   console.error(`[MemberListPanel] Erro no wrapper sendPanel:`, error);
   throw error;
  }
 }

 /**
  * Cria e envia o painel de lista de membros
  * @param {TextChannel} channel - Canal onde enviar
  * @param {Guild} guild - Objeto da guilda
  */
 static async createAndSendPanel(channel, guild) {
  try {
   // Verificações de segurança
   if (!channel || !guild) {
    console.error('[MemberList] Channel or guild is undefined');
    return;
   }

   if (!channel.isTextBased()) {
    console.error('[MemberList] Channel is not text-based');
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
    console.error('[MemberList] Bot member not found');
    return;
   }

   // Verifica permissões
   let permissions;
   try {
    permissions = channel.permissionsFor(botMember);
   } catch (e) {
    console.error('[MemberList] Error getting permissions:', e.message);
    return;
   }

   if (!permissions || !permissions.has(PermissionFlagsBits.SendMessages)) {
    console.error(`[MemberList] Missing SendMessages permission`);
    return;
   }

   const embed = await this.createPanelEmbed(guild);

   const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
     .setCustomId('btn_atualizar_lista_membros')
     .setLabel('🔄 Atualizar')
     .setStyle(ButtonStyle.Primary)
   );

   await channel.send({ embeds: [embed], components: [row] });
   console.log(`[MemberList] Panel sent to ${channel.name}`);

  } catch (error) {
   console.error('[MemberList] Error creating panel:', error);
  }
 }

 /**
  * Cria o embed do painel
  * @param {Guild} guild - Objeto da guilda
  */
 static async createPanelEmbed(guild) {
  try {
   let totalMembers = 0;
   let onlineMembers = 0;
   let membrosRole = 0;

   try {
    // Tenta buscar membros com cache
    const members = await guild.members.fetch();
    totalMembers = members.size;
    onlineMembers = members.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size;
    membrosRole = members.filter(m => m.roles.cache.some(r => r.name === 'Membro')).size;
   } catch (e) {
    // Fallback se não conseguir fetch
    totalMembers = guild.memberCount || 0;
    console.warn('[MemberList] Could not fetch members, using approximate count');
   }

   const embed = new EmbedBuilder()
    .setTitle('📋 Lista de Membros')
    .setDescription(`**${guild.name}**\n\nTotal de membros: ${totalMembers}`)
    .addFields(
     { name: '🟢 Online', value: `${onlineMembers}`, inline: true },
     { name: '⚔️ Membros Guilda', value: `${membrosRole}`, inline: true },
     { name: '📊 Alianças/Convidados', value: `${totalMembers - membrosRole}`, inline: true }
    )
    .setColor(0x3498DB)
    .setTimestamp();

   return embed;
  } catch (error) {
   console.error('[MemberList] Error creating embed:', error);
   return new EmbedBuilder()
    .setTitle('📋 Lista de Membros')
    .setDescription('Erro ao carregar dados.')
    .setColor(0xE74C3C);
  }
 }

 /**
  * Atualiza o painel existente
  * @param {Message} message - Mensagem do painel
  * @param {Guild} guild - Objeto da guilda
  */
 static async updatePanel(message, guild) {
  try {
   if (!message || !guild) {
    console.error('[MemberList] Invalid message or guild in update');
    return;
   }

   const embed = await this.createPanelEmbed(guild);
   await message.edit({ embeds: [embed] });
  } catch (error) {
   console.error('[MemberList] Update error:', error);
  }
 }

 /**
  * Handler para seleção de filtro (placeholder)
  * @param {SelectMenuInteraction} interaction - Interação do select menu
  */
 static async handleFilterSelect(interaction) {
  try {
   await interaction.reply({
    content: '✅ Filtro aplicado! (Funcionalidade em desenvolvimento)',
    ephemeral: true
   });
  } catch (error) {
   console.error('[MemberList] Filter error:', error);
  }
 }
}

module.exports = MemberListPanel;