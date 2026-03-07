const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle
} = require('discord.js');
const Database = require('../utils/database');

class BalancePanelHandler {
 constructor() {
 this.updateIntervals = new Map();
 }

 static async createAndSendPanel(channel) {
 try {
 console.log(`[BalancePanel] Creating panel in channel ${channel.id}`);

 const embed = await this.generateEmbed(channel.guild);

 const row = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('btn_atualizar_saldo_guilda')
 .setLabel('🔄 Atualizar Agora')
 .setStyle(ButtonStyle.Primary)
 );

 const message = await channel.send({
 embeds: [embed],
 components: [row]
 });

 // Iniciar atualização automática a cada 2 minutos
 this.startAutoUpdate(channel.guild, message);

 console.log(`[BalancePanel] Panel created with auto-update`);
 return message;

 } catch (error) {
 console.error(`[BalancePanel] Error creating panel:`, error);
 throw error;
 }
 }

 static async generateEmbed(guild) {
 try {
 // Calcular estatísticas
 let saldoTotal = 0;
 let valorArrecadado = 0;
 let emprestimosTotais = 0;
 let saldoGuilda = 0;

 // Percorrer todos os usuários do banco de dados
 const users = Database.getAllUsers ? Database.getAllUsers() : [];

 users.forEach(user => {
 if (user.userId === 'GUILD_BANK') {
 saldoGuilda = user.saldo || 0;
 } else {
 saldoTotal += user.saldo || 0;
 emprestimosTotais += user.emprestimosPendentes || 0;
 }
 });

 // Calcular valor arrecadado em % (taxas de eventos)
 const transactions = Database.transactions || [];
 transactions.forEach(t => {
 if (t.reason === 'taxa_guilda' && t.guildId === guild.id) {
 valorArrecadado += t.amount;
 }
 });

 saldoTotal += saldoGuilda;
 const saldoLiquido = saldoTotal - emprestimosTotais;

 const embed = new EmbedBuilder()
 .setTitle('🏦 SALDO DA GUILDA')
 .setDescription('Informações financeiras atualizadas em tempo real')
 .setColor(0x2ECC71)
 .addFields(
 {
 name: '💰 Saldo Total',
 value: `\`${saldoTotal.toLocaleString()}\``,
 inline: true
 },
 {
 name: '📊 Valor Arrecadado (Taxas)',
 value: `\`${valorArrecadado.toLocaleString()}\``,
 inline: true
 },
 {
 name: '💳 Empréstimos Pendentes',
 value: `\`${emprestimosTotais.toLocaleString()}\``,
 inline: true
 },
 {
 name: '💵 Saldo Líquido',
 value: `\`${saldoLiquido.toLocaleString()}\``,
 inline: false
 }
 )
 .setFooter({ text: `Atualizado: ${new Date().toLocaleString()} • Atualiza a cada 2 minutos` })
 .setTimestamp();

 return embed;

 } catch (error) {
 console.error(`[BalancePanel] Error generating embed:`, error);

 // Retornar embed de erro
 return new EmbedBuilder()
 .setTitle('🏦 SALDO DA GUILDA')
 .setDescription('❌ Erro ao carregar dados financeiros')
 .setColor(0xE74C3C)
 .setTimestamp();
 }
 }

 static startAutoUpdate(guild, message) {
 // Limpar intervalo existente
 if (this.updateIntervals.has(guild.id)) {
 clearInterval(this.updateIntervals.get(guild.id));
 }

 // Atualizar a cada 2 minutos (120000 ms)
 const interval = setInterval(async () => {
 try {
 console.log(`[BalancePanel] Auto-updating panel for guild ${guild.id}`);

 // Verificar se mensagem ainda existe
 const fetchedMessage = await message.channel.messages.fetch(message.id).catch(() => null);
 if (!fetchedMessage) {
 console.log(`[BalancePanel] Message deleted, stopping auto-update for guild ${guild.id}`);
 clearInterval(interval);
 this.updateIntervals.delete(guild.id);
 return;
 }

 const newEmbed = await this.generateEmbed(guild);

 const row = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('btn_atualizar_saldo_guilda')
 .setLabel('🔄 Atualizar Agora')
 .setStyle(ButtonStyle.Primary)
 );

 await message.edit({
 embeds: [newEmbed],
 components: [row]
 });

 } catch (error) {
 console.error(`[BalancePanel] Error in auto-update:`, error);
 }
 }, 120000); // 2 minutos

 this.updateIntervals.set(guild.id, interval);
 console.log(`[BalancePanel] Auto-update started for guild ${guild.id}`);
 }

 static async handleManualUpdate(interaction) {
 try {
 console.log(`[BalancePanel] Manual update requested by ${interaction.user.id}`);

 await interaction.deferUpdate();

 const newEmbed = await this.generateEmbed(interaction.guild);

 const row = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('btn_atualizar_saldo_guilda')
 .setLabel('🔄 Atualizar Agora')
 .setStyle(ButtonStyle.Primary)
 );

 await interaction.editReply({
 embeds: [newEmbed],
 components: [row]
 });

 console.log(`[BalancePanel] Manual update completed`);

 } catch (error) {
 console.error(`[BalancePanel] Error in manual update:`, error);
 await interaction.reply({
 content: '❌ Erro ao atualizar painel.',
 ephemeral: true
 });
 }
 }

 static stopAutoUpdate(guildId) {
 if (this.updateIntervals.has(guildId)) {
 clearInterval(this.updateIntervals.get(guildId));
 this.updateIntervals.delete(guildId);
 console.log(`[BalancePanel] Stopped auto-update for guild ${guildId}`);
 }
 }
}

module.exports = BalancePanelHandler;