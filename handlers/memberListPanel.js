const {
 EmbedBuilder,
 ActionRowBuilder,
 StringSelectMenuBuilder,
 StringSelectMenuOptionBuilder,
 ButtonBuilder,
 ButtonStyle
} = require('discord.js');

class MemberListPanel {
 static async sendPanel(channel, guild) {
 try {
 console.log(`[MemberList] Sending panel to channel ${channel.id}`);

 const embed = new EmbedBuilder()
 .setTitle('📋 LISTA DE MEMBROS')
 .setDescription(
 '**Gerencie e visualize todos os membros da guilda!**\n\n' +
 '🎭 Use o menu abaixo para filtrar por cargo\n' +
 '🔄 Clique em atualizar para ver dados em tempo real\n\n' +
 '*Sistema integrado com registro automático*'
 )
 .setColor(0x1ABC9C)
 .setImage('https://i.imgur.com/5K9Q5ZK.png') // Banner opcional
 .setFooter({ text: 'Sistema de Gestão de Membros • NOTAG Bot' })
 .setTimestamp();

 // Menu de seleção de cargos
 const cargosRow = new ActionRowBuilder()
 .addComponents(
 new StringSelectMenuBuilder()
 .setCustomId('select_filtro_cargo')
 .setPlaceholder('🎭 Filtrar por cargo')
 .addOptions(
 new StringSelectMenuOptionBuilder()
 .setLabel('Todos os cargos')
 .setValue('todos')
 .setDescription('Mostrar todos os membros')
 .setEmoji('👥'),
 new StringSelectMenuOptionBuilder()
 .setLabel('ADM')
 .setValue('ADM')
 .setDescription('Administradores')
 .setEmoji('👑'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Staff')
 .setValue('Staff')
 .setDescription('Equipe Staff')
 .setEmoji('🛡️'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Caller')
 .setValue('Caller')
 .setDescription('Callers de evento')
 .setEmoji('📢'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Tesoureiro')
 .setValue('tesoureiro')
 .setDescription('Gestores financeiros')
 .setEmoji('💰'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Recrutador')
 .setValue('Recrutador')
 .setDescription('Recrutadores')
 .setEmoji('📝'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Membro')
 .setValue('Membro')
 .setDescription('Membros oficiais')
 .setEmoji('⚔️'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Aliança')
 .setValue('Aliança')
 .setDescription('Membros de aliança')
 .setEmoji('🤝'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Convidado')
 .setValue('Convidado')
 .setDescription('Convidados')
 .setEmoji('🎫')
 )
 );

 const botaoRow = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('btn_atualizar_lista_membros')
 .setLabel('🔄 Atualizar Lista')
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId('btn_exportar_membros')
 .setLabel('📊 Exportar Dados')
 .setStyle(ButtonStyle.Secondary)
 );

 await channel.send({
 embeds: [embed],
 components: [cargosRow, botaoRow]
 });

 console.log(`[MemberList] Panel sent successfully`);

 } catch (error) {
 console.error(`[MemberList] Error sending panel:`, error);
 throw error;
 }
 }

 static async updatePanel(message, guild, filtroCargo = 'todos') {
 try {
 console.log(`[MemberList] Updating panel with filter: ${filtroCargo}`);

 // Buscar membros com o cargo específico ou todos
 const membros = await guild.members.fetch();
 const membrosFiltrados = [];

 for (const [id, member] of membros) {
 if (member.user.bot) continue;

 const roles = member.roles.cache.map(r => r.name);

 if (filtroCargo === 'todos' || roles.includes(filtroCargo)) {
 // Buscar dados do banco
 const userData = global.historicoRegistros?.get(id) || {};
 const dbData = require('../utils/database').getUser(id);

 membrosFiltrados.push({
 id: id,
 tag: member.user.tag,
 nickname: member.nickname || member.user.username,
 roles: roles,
 joinedAt: member.joinedAt,
 apelido: userData.apelido || 'N/A',
 guilda: userData.guilda || 'N/A',
 plataforma: userData.plataforma || 'N/A',
 saldo: dbData.saldo || 0
 });
 }
 }

 // Ordenar por nome
 membrosFiltrados.sort((a, b) => a.nickname.localeCompare(b.nickname));

 // Criar embed moderno
 const embed = new EmbedBuilder()
 .setTitle(`📋 LISTA DE MEMBROS - ${filtroCargo.toUpperCase()}`)
 .setDescription(
 `**Total:** \`${membrosFiltrados.length}\` membros\n` +
 `**Filtrado por:** ${filtroCargo === 'todos' ? 'Todos os cargos' : `Cargo ${filtroCargo}`}\n` +
 `**Atualizado:** ${new Date().toLocaleTimeString('pt-BR')}`
 )
 .setColor(0x1ABC9C)
 .setFooter({ text: 'NOTAG Bot • Sistema de Gestão' })
 .setTimestamp();

 // Dividir em campos de 15 membros cada (limite do Discord)
 const chunkSize = 15;
 for (let i = 0; i < membrosFiltrados.length; i += chunkSize) {
 const chunk = membrosFiltrados.slice(i, i + chunkSize);

 let valor = '';
 chunk.forEach(m => {
 const cargoPrincipal = m.roles.find(r => 
 ['ADM', 'Staff', 'Caller', 'tesoureiro', 'Recrutador', 'Membro', 'Aliança', 'Convidado'].includes(r)
 ) || 'Sem cargo';

 const emoji = {
 'ADM': '👑',
 'Staff': '🛡️',
 'Caller': '📢',
 'tesoureiro': '💰',
 'Recrutador': '📝',
 'Membro': '⚔️',
 'Aliança': '🤝',
 'Convidado': '🎫'
 }[cargoPrincipal] || '⚪';

 valor += `${emoji} **${m.nickname}** | ${cargoPrincipal}\n`;
 valor += `💰 \`${m.saldo.toLocaleString()}\` | 🏰 ${m.guilda}\n\n`;
 });

 embed.addFields({
 name: `👥 Membros ${i + 1}-${Math.min(i + chunkSize, membrosFiltrados.length)}`,
 value: valor || 'Nenhum membro encontrado.',
 inline: false
 });
 }

 if (membrosFiltrados.length === 0) {
 embed.addFields({
 name: '📋 Resultado',
 value: 'Nenhum membro encontrado com este filtro.',
 inline: false
 });
 }

 // Manter os componentes
 const componentes = message.components;

 await message.edit({
 embeds: [embed],
 components: componentes
 });

 console.log(`[MemberList] Panel updated: ${membrosFiltrados.length} members`);

 } catch (error) {
 console.error(`[MemberList] Error updating panel:`, error);
 throw error;
 }
 }

 static async handleFilterSelect(interaction) {
 try {
 const cargo = interaction.values[0];
 console.log(`[MemberList] Filter selected: ${cargo}`);

 await interaction.deferUpdate();
 await this.updatePanel(interaction.message, interaction.guild, cargo);

 } catch (error) {
 console.error(`[MemberList] Error handling filter:`, error);
 await interaction.reply({
 content: '❌ Erro ao aplicar filtro.',
 ephemeral: true
 });
 }
 }
}

module.exports = MemberListPanel;