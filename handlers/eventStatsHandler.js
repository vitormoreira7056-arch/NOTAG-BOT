const {
 EmbedBuilder,
 ActionRowBuilder,
 StringSelectMenuBuilder,
 StringSelectMenuOptionBuilder,
 ButtonBuilder,
 ButtonStyle
} = require('discord.js');
const Database = require('../utils/database');

class EventStatsHandler {
 constructor() {
 this.updateIntervals = new Map();
 }

 static async sendPanel(channel) {
 try {
 console.log(`[EventStats] Sending panel to channel ${channel.id}`);

 const embed = new EmbedBuilder()
 .setTitle('📊 PAINEL DE EVENTOS')
 .setDescription(
 '**Acompanhe a participação dos membros nos eventos!**\n\n' +
 'Selecione um período para visualizar as estatísticas detalhadas.\n' +
 'Os dados são atualizados em tempo real.'
 )
 .setColor(0x3498DB)
 .setImage('https://i.imgur.com/JPepvGx.png') // Banner opcional
 .setFooter({ text: 'Sistema de Estatísticas • NOTAG Bot' })
 .setTimestamp();

 // Menu de seleção de período
 const row = new ActionRowBuilder()
 .addComponents(
 new StringSelectMenuBuilder()
 .setCustomId('select_periodo_eventos')
 .setPlaceholder('📅 Selecione o período')
 .addOptions(
 new StringSelectMenuOptionBuilder()
 .setLabel('7 Dias')
 .setValue('7d')
 .setDescription('Eventos dos últimos 7 dias')
 .setEmoji('📆'),
 new StringSelectMenuOptionBuilder()
 .setLabel('2 Semanas')
 .setValue('14d')
 .setDescription('Eventos dos últimos 14 dias')
 .setEmoji('📅'),
 new StringSelectMenuOptionBuilder()
 .setLabel('1 Mês')
 .setValue('30d')
 .setDescription('Eventos do último mês')
 .setEmoji('🗓️'),
 new StringSelectMenuOptionBuilder()
 .setLabel('3 Meses')
 .setValue('90d')
 .setDescription('Eventos dos últimos 3 meses')
 .setEmoji('📊'),
 new StringSelectMenuOptionBuilder()
 .setLabel('7 Meses')
 .setValue('210d')
 .setDescription('Eventos dos últimos 7 meses')
 .setEmoji('📈'),
 new StringSelectMenuOptionBuilder()
 .setLabel('1 Ano')
 .setValue('365d')
 .setDescription('Eventos do último ano')
 .setEmoji('🎂'),
 new StringSelectMenuOptionBuilder()
 .setLabel('Total (Todo o período)')
 .setValue('total')
 .setDescription('Todos os eventos registrados')
 .setEmoji('🌟')
 )
 );

 const botaoAtualizar = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('btn_atualizar_stats_eventos')
 .setLabel('🔄 Atualizar Dados')
 .setStyle(ButtonStyle.Primary)
 );

 await channel.send({
 embeds: [embed],
 components: [row, botaoAtualizar]
 });

 console.log(`[EventStats] Panel sent successfully`);

 } catch (error) {
 console.error(`[EventStats] Error sending panel:`, error);
 throw error;
 }
 }

 static async handlePeriodSelect(interaction) {
 try {
 const periodo = interaction.values[0];
 console.log(`[EventStats] Period selected: ${periodo}`);

 await interaction.deferUpdate();

 const dados = await this.calcularEstatisticas(interaction.guild, periodo);
 const embed = this.generateStatsEmbed(dados, periodo);

 await interaction.editReply({
 embeds: [embed],
 components: interaction.message.components
 });

 } catch (error) {
 console.error(`[EventStats] Error handling period select:`, error);
 await interaction.reply({
 content: '❌ Erro ao carregar estatísticas.',
 ephemeral: true
 });
 }
 }

 static async calcularEstatisticas(guild, periodo) {
 try {
 // Calcular data de corte
 const agora = Date.now();
 let msAtras = 0;

 switch(periodo) {
 case '7d': msAtras = 7 * 24 * 60 * 60 * 1000; break;
 case '14d': msAtras = 14 * 24 * 60 * 60 * 1000; break;
 case '30d': msAtras = 30 * 24 * 60 * 60 * 1000; break;
 case '90d': msAtras = 90 * 24 * 60 * 60 * 1000; break;
 case '210d': msAtras = 210 * 24 * 60 * 60 * 1000; break;
 case '365d': msAtras = 365 * 24 * 60 * 60 * 1000; break;
 case 'total': msAtras = Infinity; break;
 default: msAtras = 30 * 24 * 60 * 60 * 1000;
 }

 const dataCorte = periodo === 'total' ? 0 : agora - msAtras;

 // Buscar histórico de eventos
 const eventHistory = Database.eventHistory || [];
 const membrosStats = new Map();

 // Processar eventos do período
 eventHistory.forEach(event => {
 if (event.timestamp >= dataCorte && event.guildId === guild.id) {
 // Processar participantes
 if (event.dados && event.dados.distribuicao) {
 event.dados.distribuicao.forEach(participante => {
 const stats = membrosStats.get(participante.userId) || {
 userId: participante.userId,
 nome: participante.nick || 'Desconhecido',
 eventos: 0,
 valorTotal: 0,
 tempoTotal: 0
 };

 stats.eventos++;
 stats.valorTotal += participante.valor || 0;
 stats.tempoTotal += participante.tempo || 0;
 membrosStats.set(participante.userId, stats);
 });
 }
 }
 });

 // Converter para array e ordenar por número de eventos
 const lista = Array.from(membrosStats.values())
 .sort((a, b) => b.eventos - a.eventos);

 return {
 periodo: periodo,
 totalEventos: eventHistory.filter(e => e.timestamp >= dataCorte).length,
 totalParticipacoes: lista.reduce((acc, m) => acc + m.eventos, 0),
 membros: lista,
 dataCorte: new Date(dataCorte).toLocaleDateString('pt-BR')
 };

 } catch (error) {
 console.error(`[EventStats] Error calculating stats:`, error);
 return { periodo, totalEventos: 0, totalParticipacoes: 0, membros: [], dataCorte: 'N/A' };
 }
 }

 static generateStatsEmbed(dados, periodo) {
 const periodosNomes = {
 '7d': '7 Dias',
 '14d': '2 Semanas',
 '30d': '1 Mês',
 '90d': '3 Meses',
 '210d': '7 Meses',
 '365d': '1 Ano',
 'total': 'Todo o Período'
 };

 const embed = new EmbedBuilder()
 .setTitle(`📊 ESTATÍSTICAS DE EVENTOS - ${periodosNomes[periodo]}`)
 .setDescription(
 `**Período:** ${dados.dataCorte} até agora\n` +
 `**Total de Eventos:** \`${dados.totalEventos}\`\n` +
 `**Total de Participações:** \`${dados.totalParticipacoes}\``
 )
 .setColor(0x3498DB)
 .setTimestamp();

 // Top 20 membros
 const topMembros = dados.membros.slice(0, 20);

 if (topMembros.length === 0) {
 embed.addFields({
 name: '📋 Nenhum dado',
 value: 'Não há eventos registrados neste período.',
 inline: false
 });
 } else {
 let descricao = '';
 topMembros.forEach((membro, index) => {
 const medalha = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
 const tempoHoras = Math.floor(membro.tempoTotal / 1000 / 60 / 60);
 descricao += `${medalha} **${membro.nome}** - ${membro.eventos} eventos | ${tempoHoras}h | ${membro.valorTotal.toLocaleString()}\n`;
 });

 embed.addFields({
 name: `👥 Top Participantes (${topMembros.length})`,
 value: descricao || 'Nenhum participante encontrado.',
 inline: false
 });
 }

 // Adicionar legenda
 embed.addFields({
 name: '📝 Legenda',
 value: '`Eventos` | `Horas` | `Valor Total Recebido`',
 inline: false
 });

 return embed;
 }

 static async handleAtualizar(interaction) {
 try {
 await interaction.deferUpdate();

 // Recuperar período atual do embed
 const embedAtual = interaction.message.embeds[0];
 let periodo = '30d'; // Default

 if (embedAtual.title.includes('7 Dias')) periodo = '7d';
 else if (embedAtual.title.includes('2 Semanas')) periodo = '14d';
 else if (embedAtual.title.includes('3 Meses')) periodo = '90d';
 else if (embedAtual.title.includes('7 Meses')) periodo = '210d';
 else if (embedAtual.title.includes('1 Ano')) periodo = '365d';
 else if (embedAtual.title.includes('Todo o Período')) periodo = 'total';

 const dados = await this.calcularEstatisticas(interaction.guild, periodo);
 const novoEmbed = this.generateStatsEmbed(dados, periodo);

 await interaction.editReply({
 embeds: [novoEmbed],
 components: interaction.message.components
 });

 } catch (error) {
 console.error(`[EventStats] Error updating:`, error);
 await interaction.reply({
 content: '❌ Erro ao atualizar estatísticas.',
 ephemeral: true
 });
 }
 }
}

module.exports = EventStatsHandler;