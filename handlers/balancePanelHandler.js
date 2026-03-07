const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler do Painel de Saldo da Guilda
 * Mostra saldo total e estatísticas financeiras
 */

class BalancePanelHandler {
 /**
  * Cria e envia o painel de saldo (Wrapper para compatibilidade)
  * @param {TextChannel} channel - Canal onde enviar
  * @param {Guild} guild - Objeto da guilda
  */
 static async sendPanel(channel, guild) {
  try {
   console.log(`[BalancePanelHandler] Wrapper sendPanel chamado, redirecionando para createAndSendPanel`);
   return await this.createAndSendPanel(channel, guild);
  } catch (error) {
   console.error(`[BalancePanelHandler] Erro no wrapper sendPanel:`, error);
   throw error;
  }
 }

 /**
  * Cria e envia o painel de saldo
  * @param {TextChannel} channel - Canal onde enviar
  * @param {Guild} guild - Objeto da guilda
  */
 static async createAndSendPanel(channel, guild) {
  try {
   // Verificações de segurança
   if (!channel || !guild) {
    console.error('[BalancePanel] Channel or guild is undefined');
    return;
   }

   // Verifica se é um canal de texto
   if (!channel.isTextBased()) {
    console.error('[BalancePanel] Channel is not text-based');
    return;
   }

   // Obtém o membro do bot na guilda
   let botMember;
   try {
    botMember = await guild.members.fetch(channel.client.user.id);
   } catch (e) {
    botMember = guild.members.me;
   }

   if (!botMember) {
    console.error('[BalancePanel] Bot member not found in guild');
    return;
   }

   // Verifica permissões no canal
   let permissions;
   try {
    permissions = channel.permissionsFor(botMember);
   } catch (e) {
    console.error('[BalancePanel] Error getting permissions:', e.message);
    return;
   }

   if (!permissions) {
    console.error('[BalancePanel] Could not get permissions for channel');
    return;
   }

   // Verifica permissões necessárias
   const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
   ];

   for (const perm of requiredPermissions) {
    if (!permissions.has(perm)) {
     console.error(`[BalancePanel] Missing permission: ${perm}`);
     return;
    }
   }

   const embed = await this.createPanelEmbed(guild);

   const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
     .setCustomId('btn_atualizar_saldo_guilda')
     .setLabel('🔄 Atualizar')
     .setStyle(ButtonStyle.Primary)
   );

   const message = await channel.send({
    embeds: [embed],
    components: [row]
   });

   // Inicia auto-update apenas se conseguiu enviar
   if (message) {
    this.startAutoUpdate(message, guild);
   }

  } catch (error) {
   console.error('[BalancePanel] Error creating panel:', error);
  }
 }

 /**
  * Cria o embed do painel
  * @param {Guild} guild - Objeto da guilda
  */
 static async createPanelEmbed(guild) {
  try {
   const totalBalance = await Database.getGuildBalance(guild.id);

   // Busca estatísticas adicionais com try-catch individual
   let totalTransactions = 0;
   let totalMembers = 0;

   try {
    totalTransactions = await this.getTotalTransactions(guild.id);
   } catch (e) {
    console.error('[BalancePanel] Error getting transactions:', e.message);
   }

   try {
    totalMembers = await this.getTotalMembersWithBalance(guild.id);
   } catch (e) {
    console.error('[BalancePanel] Error getting members:', e.message);
   }

   const embed = new EmbedBuilder()
    .setTitle('🏦 Saldo da Guilda')
    .setDescription(`**NOTAG - Gestão Financeira**\n\n💰 **Saldo Total:** \`${totalBalance.toLocaleString()}\` pratas`)
    .addFields(
     { name: '💸 Total Transações', value: `${totalTransactions}`, inline: true },
     { name: '👥 Membros Ativos', value: `${totalMembers}`, inline: true },
     { name: '📊 Taxa Padrão', value: '10%', inline: true }
    )
    .setColor(0x2ECC71)
    .setTimestamp()
    .setFooter({ text: 'Clique em Atualizar para ver valores atualizados' });

   return embed;
  } catch (error) {
   console.error('[BalancePanel] Error creating embed:', error);
   // Retorna embed de erro
   return new EmbedBuilder()
    .setTitle('🏦 Saldo da Guilda')
    .setDescription('⚠️ Erro ao carregar dados financeiros.')
    .setColor(0xE74C3C)
    .setTimestamp();
  }
 }

 /**
  * Conta total de transações da guilda
  * @param {string} guildId - ID da guilda
  */
 static async getTotalTransactions(guildId) {
  try {
   if (!Database.db) {
    console.warn('[BalancePanel] Database not initialized');
    return 0;
   }

   const result = await Database.db.getAsync(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE guild_id = ? AND type = 'taxa_guilda'
   `, [guildId]);

   return result?.count || 0;
  } catch (error) {
   console.error('[BalancePanel] Error counting transactions:', error);
   return 0;
  }
 }

 /**
  * Conta membros com saldo/transações
  * @param {string} guildId - ID da guilda
  */
 static async getTotalMembersWithBalance(guildId) {
  try {
   if (!Database.db) {
    console.warn('[BalancePanel] Database not initialized');
    return 0;
   }

   const result = await Database.db.getAsync(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM transactions
    WHERE guild_id = ?
   `, [guildId]);

   return result?.count || 0;
  } catch (error) {
   console.error('[BalancePanel] Error counting members:', error);
   return 0;
  }
 }

 /**
  * Inicia atualização automática do painel
  * @param {Message} message - Mensagem do painel
  * @param {Guild} guild - Objeto da guilda
  */
 static startAutoUpdate(message, guild) {
  // Atualiza a cada 5 minutos
  const interval = setInterval(async () => {
   try {
    // Verifica se mensagem ainda existe
    const fetched = await message.fetch().catch(() => null);
    if (!fetched) {
     clearInterval(interval);
     return;
    }

    const embed = await this.createPanelEmbed(guild);
    await message.edit({ embeds: [embed] });
   } catch (error) {
    console.error('[BalancePanel] Auto-update error:', error);
    clearInterval(interval);
   }
  }, 5 * 60 * 1000);

  // Para após 1 hora para evitar memory leaks
  setTimeout(() => clearInterval(interval), 60 * 60 * 1000);
 }

 /**
  * Handler para atualização manual
  * @param {ButtonInteraction} interaction - Interação do botão
  */
 static async handleManualUpdate(interaction) {
  try {
   await interaction.deferUpdate();

   const embed = await this.createPanelEmbed(interaction.guild);
   await interaction.editReply({ embeds: [embed] });

  } catch (error) {
   console.error('[BalancePanel] Manual update error:', error);
   // Tenta responder se ainda não respondeu
   if (!interaction.replied && !interaction.deferred) {
    await interaction.reply({
     content: '❌ Erro ao atualizar painel.',
     ephemeral: true
    });
   }
  }
 }
}

module.exports = BalancePanelHandler;